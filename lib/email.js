import { plainTextBody, subjectLine } from "./enquiry.js";

/* Sends the enquiry to the team.

   NOT WIRED UP YET: the provider (Postmark, Resend, SendGrid, or HubSpot's
   own notifications) and the recipient list are still to be decided. Until
   then:
     - in local development and Vercel preview deployments the email is
       printed to the function log instead of sent, so the form can be tested
       end to end;
     - in production this throws, so the customer sees the "couldn't send"
       message and the contact address rather than a confirmation for an
       enquiry that went nowhere.

   To finish: pick a provider, add its API key and ENQUIRY_TO / ENQUIRY_FROM
   to the environment, set up SPF/DKIM for the sending domain, and replace
   the body of this function with the provider's send call. */
export async function sendEnquiryEmail(enquiry, ref) {
  const message = {
    to: process.env.ENQUIRY_TO,
    from: process.env.ENQUIRY_FROM,
    replyTo: enquiry.email,
    subject: subjectLine(enquiry, ref),
    text: plainTextBody(enquiry, ref),
  };

  if (process.env.VERCEL_ENV === "production") {
    throw new Error("Email delivery is not configured (see lib/email.js)");
  }
  console.log(
    "[email not sent - no provider configured]\n" +
      `To: ${message.to || "(ENQUIRY_TO not set)"}\nSubject: ${message.subject}\n\n${message.text}`,
  );
}
