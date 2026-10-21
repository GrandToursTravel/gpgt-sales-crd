import { plainTextBody, subjectLine } from "./enquiry.js";

/* Sends the enquiry to the team through Resend (https://resend.com), as a
   plain-text email. Reply-To is the customer, so replying from the inbox
   goes straight to them. The customer is not sent a copy.

   Configuration, all server-side:
     RESEND_API_KEY  a Resend API key with "sending access"
     ENQUIRY_TO      who receives enquiries; several addresses may be given,
                     separated by commas
     ENQUIRY_FROM    the sender, on the domain verified in Resend, either
                     bookings@example.com or "Name <bookings@example.com>"

   Without RESEND_API_KEY:
     - in local development and Vercel preview deployments the email is
       printed to the function log instead of sent, so the form can be tested
       end to end;
     - in production this throws, so the customer sees the "couldn't send"
       message and the contact address rather than a confirmation for an
       enquiry that went nowhere.
   Previews given a key do send, so point their ENQUIRY_TO at a test inbox. */

const ENDPOINT = "https://api.resend.com/emails";

function recipients(value) {
  return (value || "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

export async function sendEnquiryEmail(enquiry, ref) {
  const { RESEND_API_KEY: key, ENQUIRY_TO, ENQUIRY_FROM: from } = process.env;
  const to = recipients(ENQUIRY_TO);
  const message = {
    from,
    to,
    reply_to: enquiry.email,
    subject: subjectLine(enquiry, ref),
    text: plainTextBody(enquiry, ref),
  };

  if (!key) {
    if (process.env.VERCEL_ENV === "production") {
      throw new Error("Email delivery is not configured: RESEND_API_KEY is not set");
    }
    console.log(
      "[email not sent - RESEND_API_KEY not set]\n" +
        `To: ${to.join(", ") || "(ENQUIRY_TO not set)"}\nSubject: ${message.subject}\n\n${message.text}`,
    );
    return { skipped: true };
  }

  if (!from || to.length === 0) {
    throw new Error("Email delivery is not configured: ENQUIRY_FROM and ENQUIRY_TO must both be set");
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(8000),
  });
  /* Resend explains a rejection in the body (unverified domain, invalid
     address, rate limit), so keep it for the log. */
  if (!res.ok) throw new Error(`Resend send failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
  const { id } = await res.json();
  return { sent: true, id };
}
