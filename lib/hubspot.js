/* Sends the enquiry's contact details to a HubSpot form, through the Forms
   API (submissions v3). HubSpot then creates or updates the contact - matched
   on email - logs the submission on their timeline, and runs whatever the
   form is set up to do: notifications, follow-up email, workflows.

   Besides the four standard contact properties, each submission fills the
   form's hidden fields:
     event_whatsapp_submission
                           the race as the form shows it, "Hungarian Grand
                           Prix"; left out when the customer isn't sure yet
     utm_source, utm_medium, utm_campaign, utm_term, gclid, hsa_grp
                           the ad that brought the customer, last touch
                           (src/attribution.js)
   The submission's context carries the page address, the visitor cookie
   and the customer's IP address, which HubSpot uses for the contact's
   location. A blank value is left out. Everything else about the enquiry
   goes in the email.

   The form's own definition is read too (lib/hubspot-form.js). Hidden fields
   with a default value there, such as Acquiring Domain, Lead channel and
   Intent, are sent with that default, because the submissions API does not
   apply defaults itself. Our values are checked against the form first: a
   field that is not on it, or a dropdown value that is not one of its
   options, is left out and logged rather than costing the whole submission.
   To send another property, add it to the form as well as here.

   Configuration, all server-side:
     HUBSPOT_PORTAL_ID  the account (hub) id
     HUBSPOT_FORM_ID    the form's GUID, from its URL in HubSpot
     HUBSPOT_TOKEN      a private-app token with the "forms" scope. Needed to
                        read the form, so without it no defaults are sent and
                        nothing is checked. With it, submissions also go to
                        the authenticated endpoint, which HubSpot treats as
                        coming from a trusted source.
   Without the portal and form ids this does nothing, so local development
   and previews only reach HubSpot when they are given ids to use. Point
   previews at a test form, not the live one. */

import { applyForm, loadFormFields } from "./hubspot-form.js";

const BASE = "https://api.hsforms.com/submissions/v3/integration";
const CONTACT = "0-1";

/* The HubSpot visitor cookie, which ties the submission to the visitor's
   browsing history and original source. Only present if the HubSpot
   tracking code is on the page. */
const HUTK = /^[a-f0-9]{32}$/;

/* Internal name of the race property in HubSpot (Settings > Properties),
   which is not always the label. The attribution fields use their parameter
   names as property names. */
const EVENT = "event_whatsapp_submission";

/* The "Not sure yet" choice (NOT_SURE_RACE in src/config.js) is not an event. */
const NOT_SURE = "not-sure";

function fields(enquiry, attribution) {
  return {
    firstname: enquiry.firstName,
    lastname: enquiry.lastName,
    email: enquiry.email,
    phone: enquiry.phone,
    [EVENT]: enquiry.raceId === NOT_SURE ? null : enquiry.race,
    ...attribution,
  };
}

/* The form's fields, for its defaults and checks. Without them the contact
   is still sent, with our values only. */
async function formFieldsFor(formId, token, ref) {
  if (!token) {
    console.warn(`HubSpot ${ref}: HUBSPOT_TOKEN not set, so hidden-field defaults are not sent and values are not checked`);
    return null;
  }
  try {
    return await loadFormFields(formId, token);
  } catch (err) {
    console.warn(`HubSpot ${ref}: form unreadable, so hidden-field defaults are not sent and values are not checked (${err.message})`);
    return null;
  }
}

export async function pushToHubSpot(enquiry, ref, context = {}) {
  const { HUBSPOT_PORTAL_ID: portal, HUBSPOT_FORM_ID: form, HUBSPOT_TOKEN: token } = process.env;
  if (!portal || !form) return { skipped: true };

  const formFields = await formFieldsFor(form, token, ref);
  const ours = Object.entries(fields(enquiry, context.attribution))
    .filter(([, value]) => value)
    .map(([name, value]) => ({ objectTypeId: CONTACT, name, value: String(value) }));
  const url = `${BASE}/${token ? "secure/submit" : "submit"}/${encodeURIComponent(portal)}/${encodeURIComponent(form)}`;
  const body = {
    submittedAt: Date.now(),
    fields: formFields ? applyForm(ours, formFields, ref) : ours,
    context: {
      pageName: `Grand Prix enquiry ${ref}`,
      ...(context.pageUri ? { pageUri: context.pageUri } : {}),
      ...(HUTK.test(context.hutk || "") ? { hutk: context.hutk } : {}),
      ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
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
