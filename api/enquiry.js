import { isIP } from "node:net";
import { sendEnquiryEmail } from "../lib/email.js";
import { InvalidEnquiry, isBot, newReference, validateEnquiry } from "../lib/enquiry.js";
import { pushToHubSpot } from "../lib/hubspot.js";

/* POST /api/enquiry - receives a completed enquiry from the form, when the
   customer presses Send Enquiry on the review step.

   Check it, issue the reference, then send the email and submit to HubSpot
   side by side. The customer is only told it worked once the email is away,
   and is given the reference that the email carries. HubSpot is attempted
   whatever happens to the email, so the contact is captured either way; a
   HubSpot failure is logged, not shown, since the email holds the enquiry. */
/* Where the customer was, who they are to HubSpot's tracking code, the ad
   that brought them (src/attribution.js) and their IP address. Most of it
   comes from the browser, so only well-formed values are passed on, and
   anything else is dropped rather than refused: bad tracking data never
   costs an enquiry. */
const ATTRIBUTION = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "gclid", "hsa_grp"];
const GCLID = /^[\w-]+$/;

/* The customer's IP address, which HubSpot uses for the contact's location.
   Vercel sets these headers itself, overwriting anything the browser sends,
   so they can be trusted there. The local dev server sets neither, so
   nothing is sent from development. */
function clientIp(request) {
  const header = request.headers.get("x-real-ip") || (request.headers.get("x-forwarded-for") || "").split(",")[0];
  const ip = (header || "").trim();
  return isIP(ip) ? ip : null;
}

function trackingContext(body, request) {
  const context = {};
  const ip = clientIp(request);
  if (ip) context.ipAddress = ip;
  if (typeof body.pageUri === "string" && /^https?:\/\//.test(body.pageUri) && body.pageUri.length <= 1000) {
    context.pageUri = body.pageUri;
  }
  if (typeof body.hutk === "string") context.hutk = body.hutk;

  const sent = body.attribution && typeof body.attribution === "object" ? body.attribution : {};
  context.attribution = {};
  for (const name of ATTRIBUTION) {
    const value = typeof sent[name] === "string" ? sent[name].replace(/\p{Cc}/gu, "").trim().slice(0, 500) : "";
    if (value && (name !== "gclid" || GCLID.test(value))) context.attribution[name] = value;
  }
  return context;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON" }, { status: 400 });
  }

  const ref = newReference();

  /* Bots get a normal-looking success so they have no reason to try again. */
  if (isBot(body)) {
    console.warn("POST /api/enquiry: spam trap filled, discarded", ref);
    return Response.json({ reference: ref });
  }

  // TODO: verify a Cloudflare Turnstile / reCAPTCHA token here once chosen.

  let enquiry;
  try {
    enquiry = validateEnquiry(body);
  } catch (err) {
    if (err instanceof InvalidEnquiry) return Response.json({ error: err.message }, { status: 422 });
    throw err;
  }

  const [email, hubspot] = await Promise.allSettled([
    sendEnquiryEmail(enquiry, ref),
    pushToHubSpot(enquiry, ref, trackingContext(body, request)),
  ]);

  if (hubspot.status === "rejected") {
    console.error("POST /api/enquiry: HubSpot failed", ref, hubspot.reason);
  }
  if (email.status === "rejected") {
    console.error("POST /api/enquiry: email failed", ref, email.reason);
    return Response.json({ error: "Could not send" }, { status: 502 });
  }

  return Response.json({ reference: ref });
}
