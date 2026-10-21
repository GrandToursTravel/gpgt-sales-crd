# GPGT enquiry form

The Grand Prix Grand Tours race-weekend enquiry form. It's a 13-step wizard that ends with an enquiry sent to the team. It started as a single self-contained HTML artefact (`grand-prix-enquiry-form.html`, kept for reference) and is now a Vite site with Vercel serverless functions.

## Running it

```sh
npm install
cp .env.example .env.local   # optional: add RACES_CSV_URL to use the live sheet
npm run dev                  # http://localhost:5173, page and /api together
npm run build                # production build into dist/
npm run lint
```

`npm run dev` also serves the `api/` functions (see `vite.config.js`), so you don't need the Vercel CLI. If `RACES_CSV_URL` isn't set, `/api/races` returns 503 and the page uses its bundled calendar. Unless `RESEND_API_KEY` is set, enquiries are printed to the terminal rather than emailed.

Open `/#preview-done` in dev to go straight to the confirmation screen with sample answers. This is left out of production builds.

## Layout

```
index.html               page markup
src/
  main.js                start-up: fonts, styles, race calendar, event wiring
  state.js               answers, step order, current step, race calendar (shared)
  config.js              tiers, rooms, occasions, payment plans, links
  wizard.js              step navigation, validation, review page
  submit.js              POST /api/enquiry and the confirmation screen
  dom.js                 $() and escapeHtml()
  data/catalog.js        loads /api/races, falls back to fallback-races.json
  data/fallback-races.json  bundled copy of the race calendar
  data/airports.js       departure airports (fixed reference data)
  ui/                    one module per part of the form (globe, calendar, tiers, ...)
  styles/                the stylesheet, split by section; index.css sets the order
  assets/images/         photos, globe texture, fan figures, logo
api/
  races.js               GET  /api/races    race calendar from the Google Sheet
  enquiry.js             POST /api/enquiry  validate, issue reference, email (Resend), HubSpot
lib/                     server-only helpers used by api/
docs/races-sheet-template.csv   the current calendar, ready to import into the sheet
```

## Race calendar (Google Sheet)

1. Import `docs/races-sheet-template.csv` into a new Google Sheet tab. Keep the column headers exactly as they are; `lib/races.js` lists what each column means.
2. Go to File → Share → Publish to web. Choose **that tab only** and **CSV**, then copy the link.
3. In Vercel, set `RACES_CSV_URL` to that link (Project → Settings → Environment Variables).

The link stays on the server, but anyone who has it can read the published tab, so keep anything internal on other tabs. If the link leaks, make a copy of the sheet, publish the copy and update the variable.

Edits show up on the form within about 5 minutes (the edge cache). A bad row, such as a typo'd date or a duplicate id, is skipped and logged; the rest of the calendar still loads. If the sheet can't be read, the form keeps serving the last good copy, and failing that, the bundled one.

Only Hungary has confirmed dates. The other 23 races have placeholder 2027 weekends marked `provisional`, which the form shows as "to be confirmed".

To update the bundled fallback, regenerate `src/data/fallback-races.json` from the sheet when the calendar changes.

## Deploying to Vercel

Import the repo into Vercel. It detects Vite from `vercel.json`, serves `dist/` and deploys `api/` as functions. Set the environment variables from `.env.example`.

## Email (Resend)

When the customer presses Send Enquiry, `/api/enquiry` emails the enquiry to the team through Resend (`lib/email.js`). It's plain text, with the customer as Reply-To and the reference in the subject. The customer isn't sent a copy. They only see the confirmation once Resend has accepted the email; if it fails, they see the "couldn't send" message and the failure is logged with the reference.

1. In Resend, add `grandprixgrandtours.com` under Domains and add the DNS records it lists (DKIM, and the MX and SPF records for the sending subdomain). Wait for it to show as verified.
2. Create an API key with sending access.
3. In Vercel, set `RESEND_API_KEY`, `ENQUIRY_FROM` (an address on the verified domain) and `ENQUIRY_TO` (comma-separate several recipients).

Without `RESEND_API_KEY`, development and preview deploys print the email to the log instead, and production returns an error rather than a false confirmation. If you give previews a key, give them a test `ENQUIRY_TO` as well.

## HubSpot

When the customer presses Send Enquiry, `/api/enquiry` submits their first name, last name, email and phone to a HubSpot form through the Forms API (`lib/hubspot.js`). HubSpot creates or updates the contact by email and runs whatever the form is set up to do.

- Set `HUBSPOT_PORTAL_ID` and `HUBSPOT_FORM_ID`. Without them HubSpot is skipped. `HUBSPOT_TOKEN` (a private-app token with the `forms` scope) is optional; with it, submissions use the authenticated endpoint.
- HubSpot runs alongside the email, not after it, so the contact is captured even if the email fails. A HubSpot failure is logged with the enquiry reference and isn't shown to the customer.
- Give preview deploys a test form's ID, so test enquiries don't create real contacts.
- If the HubSpot tracking code is ever added to the page, its `hubspotutk` cookie is passed along automatically, so contacts get their original source.

## Not finished yet

These are deliberately stubbed while decisions are pending:

- **Bot protection**: there's a hidden spam-trap field. Turnstile or reCAPTCHA is still a TODO in `api/enquiry.js`.
- Tiers, inclusions, payment terms and occasions are still in `src/config.js`, not the sheet.
- Privacy notice, cookie consent, favicon and analytics haven't been added.
