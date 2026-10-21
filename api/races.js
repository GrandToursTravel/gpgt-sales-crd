import { loadRaces } from "../lib/races.js";

/* GET /api/races - the race calendar, as JSON, from the Google Sheet.

   Cached at Vercel's edge for five minutes, so the sheet is read a few times
   an hour however busy the form is, and an edit shows up within five minutes.
   If the sheet cannot be read, the edge keeps serving the last good copy for
   up to a day (stale-while-revalidate); past that, or before the first good
   read, this answers with an error and the page uses its bundled calendar. */
export async function GET() {
  try {
    const races = await loadRaces();
    return Response.json(
      { races },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400" } },
    );
  } catch (err) {
    console.error("GET /api/races:", err.message);
    return Response.json(
      { error: "Race calendar unavailable" },
      { status: err.status || 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
