import Papa from "papaparse";

/* Reads the race calendar from the Google Sheet's published CSV link.

   The link lives only in the RACES_CSV_URL environment variable; the browser
   never sees it. Anyone holding the link can still read the published tab,
   so publish only the tab the form needs (File > Share > Publish to web >
   choose that one sheet, CSV) and keep anything internal on other tabs.

   Expected columns, by header name (order does not matter, extra columns are
   ignored):

     id             short, stable, lowercase: "hungarian", "abu-dhabi"
     name           "Hungarian Grand Prix"
     city           "Budapest"
     lat, lng       circuit coordinates, decimal degrees
     package_start  YYYY-MM-DD, or blank if not known yet
     package_end    YYYY-MM-DD, or blank if not known yet
     provisional    TRUE/FALSE - dates shown with a "to be confirmed" warning
     active         TRUE/FALSE - FALSE hides the race from the form
     order          number; the race list is sorted by it

   A bad row is skipped and reported rather than failing the whole calendar,
   so one typo in the sheet costs one race, not the form. */

const REQUIRED = ["id", "name", "city", "lat", "lng", "package_start", "package_end", "provisional", "active", "order"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function yes(v) {
  return /^(true|yes|y|1)$/i.test(String(v || "").trim());
}

function validDate(s) {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function parseRacesCsv(text) {
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });
  const fields = parsed.meta.fields || [];
  const missing = REQUIRED.filter((c) => !fields.includes(c));
  if (missing.length) throw new Error("Race sheet is missing columns: " + missing.join(", "));

  const races = [];
  const problems = [];
  const seen = new Set();
  parsed.data.forEach((row, i) => {
    const where = `row ${i + 2}` + (row.name ? ` (${row.name})` : "");
    if (!yes(row.active)) return;
    const lat = Number(row.lat), lng = Number(row.lng);
    const order = row.order === "" ? 9999 : Number(row.order);
    const start = row.package_start || null, end = row.package_end || null;

    if (!ID.test(row.id || "")) return problems.push(`${where}: id must be lowercase letters, numbers and dashes`);
    if (seen.has(row.id)) return problems.push(`${where}: id "${row.id}" is used twice`);
    if (!row.name || !row.city) return problems.push(`${where}: name and city are required`);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180)
      return problems.push(`${where}: lat/lng are not valid coordinates`);
    if (!Number.isFinite(order)) return problems.push(`${where}: order must be a number`);
    if (!!start !== !!end) return problems.push(`${where}: give both package dates or neither`);
    if (start && (!validDate(start) || !validDate(end)))
      return problems.push(`${where}: package dates must be YYYY-MM-DD`);
    if (start && end < start) return problems.push(`${where}: package_end is before package_start`);

    seen.add(row.id);
    races.push({
      id: row.id,
      name: row.name,
      city: row.city,
      lat,
      lng,
      packageStart: start,
      packageEnd: end,
      provisional: yes(row.provisional),
      order,
    });
  });
  races.sort((a, b) => a.order - b.order);
  return { races, problems };
}

export async function loadRaces() {
  const url = process.env.RACES_CSV_URL;
  if (!url) {
    const err = new Error("RACES_CSV_URL is not set");
    err.status = 503;
    throw err;
  }
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Race sheet returned ${res.status}`);
  const { races, problems } = parseRacesCsv(await res.text());
  if (problems.length) console.warn("Race sheet: skipped rows\n  " + problems.join("\n  "));
  if (!races.length) throw new Error("Race sheet has no usable rows");
  return races;
}
