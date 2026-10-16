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
/* Where the customer was and who they are to HubSpot's tracking code. Both
   come from the browser, so only well-formed values are passed on. */
function trackingContext(body) {
  const context = {};
  if (typeof body.pageUri === "string" && /^https?:\/\//.test(body.pageUri) && body.pageUri.length <= 1000) {
    context.pageUri = body.pageUri;
  }
  if (typeof body.hutk === "string") context.hutk = body.hutk;
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
    pushToHubSpot(enquiry, ref, trackingContext(body)),
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
