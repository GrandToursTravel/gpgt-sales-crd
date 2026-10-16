/* Sends the enquiry's contact details to a HubSpot form, through the Forms
   API (submissions v3). HubSpot then creates or updates the contact - matched
   on email - logs the submission on their timeline, and runs whatever the
   form is set up to do: notifications, follow-up email, workflows.

   The form takes the four standard contact properties only. The rest of the
   enquiry goes in the email; add fields here (and to the form) to send more.

   Configuration, all server-side:
     HUBSPOT_PORTAL_ID  the account (hub) id
     HUBSPOT_FORM_ID    the form's GUID, from its URL in HubSpot
     HUBSPOT_TOKEN      optional: a private-app token with the "forms" scope.
                        With it, submissions go to the authenticated endpoint,
                        which HubSpot treats as coming from a trusted source.
   Without the portal and form ids this does nothing, so local development
   and previews only reach HubSpot when they are given ids to use. Point
   previews at a test form, not the live one. */

const BASE = "https://api.hsforms.com/submissions/v3/integration";
const CONTACT = "0-1";

/* The HubSpot visitor cookie, which ties the submission to the visitor's
   browsing history and original source. Only present if the HubSpot
   tracking code is on the page. */
const HUTK = /^[a-f0-9]{32}$/;

function fields(enquiry) {
  return {
    firstname: enquiry.firstName,
    lastname: enquiry.lastName,
    email: enquiry.email,
    phone: enquiry.phone,
  };
}

export async function pushToHubSpot(enquiry, ref, context = {}) {
  const { HUBSPOT_PORTAL_ID: portal, HUBSPOT_FORM_ID: form, HUBSPOT_TOKEN: token } = process.env;
  if (!portal || !form) return { skipped: true };

  const url = `${BASE}/${token ? "secure/submit" : "submit"}/${encodeURIComponent(portal)}/${encodeURIComponent(form)}`;
  const body = {
    submittedAt: Date.now(),
    fields: Object.entries(fields(enquiry))
      .filter(([, value]) => value)
      .map(([name, value]) => ({ objectTypeId: CONTACT, name, value: String(value) })),
    context: {
      pageName: `Grand Prix enquiry ${ref}`,
      ...(context.pageUri ? { pageUri: context.pageUri } : {}),
      ...(HUTK.test(context.hutk || "") ? { hutk: context.hutk } : {}),
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  /* HubSpot explains a rejection in the body (unknown field, invalid email,
     consent required by the account's GDPR settings), so keep it for the log. */
  if (!res.ok) throw new Error(`HubSpot form submission failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
  return { submitted: true };
}
