import { randomInt } from "node:crypto";

/* Checks an enquiry from the form and turns it into what the email and the
   CRM need. The browser checks the same rules first (src/wizard.js isValid);
   these are the ones that count, since anything can be posted here. */

const TEXT_MAX = 200;
const NOTES_MAX = 5000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIERS = ["Bronze", "Silver", "Gold", "Not sure yet, help me choose"];
const PAY_PLANS = ["full", "monthly", "split"];
const ROOM_TYPES = ["Double", "Twin", "Triple"];

function text(v, max = TEXT_MAX) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function int(v, min, max) {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export class InvalidEnquiry extends Error {}

export function validateEnquiry(body) {
  if (!body || typeof body !== "object") throw new InvalidEnquiry("Not an enquiry");

  const e = {
    firstName: text(body.firstName),
    lastName: text(body.lastName),
    phone: text(body.phone, 40),
    email: text(body.email, 254),
    race: text(body.race),
    raceId: text(body.raceId, 60),
    flyingFrom: text(body.flyingFrom, 300),
    departCode: text(body.departCode, 4) || null,
    ownFlights: body.ownFlights === true,
    packageTier: text(body.packageTier),
    travelling: text(body.travelling),
    adults: int(body.adults, 1, 40),
    minors: int(body.minors, 0, 20),
    hotelRooms: text(body.hotelRooms),
    roomCounts: {},
    bedsIncluded: text(body.bedsIncluded, 300),
    travelDates: text(body.travelDates, 300),
    extraNightsBefore: int(body.extraNightsBefore, 0, 14) ?? 0,
    extraNightsAfter: int(body.extraNightsAfter, 0, 14) ?? 0,
    paymentPlan: text(body.paymentPlan),
    payPlan: text(body.payPlan, 20),
    payCount: body.payCount == null ? null : int(body.payCount, 2, 12),
    occasion: text(body.occasion, 300),
    occasions: Array.isArray(body.occasions)
      ? body.occasions.slice(0, 20).map((o) => text(o, 60)).filter(Boolean)
      : [],
    notes: text(body.notes, NOTES_MAX),
  };
  for (const t of ROOM_TYPES) e.roomCounts[t] = int(body.roomCounts && body.roomCounts[t], 0, 20) ?? 0;

  const problems = [];
  if (e.firstName.length < 2) problems.push("firstName");
  if (e.lastName.length < 2) problems.push("lastName");
  if (e.phone.length < 4) problems.push("phone");
  if (!EMAIL.test(e.email)) problems.push("email");
  if (!e.race) problems.push("race");
  if (!e.ownFlights && !e.flyingFrom) problems.push("flyingFrom");
  if (!TIERS.includes(e.packageTier)) problems.push("packageTier");
  if (e.adults === null) problems.push("adults");
  if (e.minors === null) problems.push("minors");
  if (ROOM_TYPES.every((t) => e.roomCounts[t] === 0)) problems.push("roomCounts");
  if (!PAY_PLANS.includes(e.payPlan)) problems.push("payPlan");
  if (problems.length) throw new InvalidEnquiry("Invalid fields: " + problems.join(", "));
  return e;
}

/* Spam trap: a hidden field people never see. Anything in it is a bot. */
export function isBot(body) {
  return !!(body && typeof body.website === "string" && body.website.trim());
}

/* GP-YYMM-XXXXX. Issued here rather than in the browser so it can be trusted:
   it is the reference on the email, in the CRM and on the customer's screen.
   The alphabet leaves out 0/O and 1/I/L, which get misread over the phone. */
const REF_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function newReference(now = new Date()) {
  const yymm = String(now.getUTCFullYear()).slice(-2) + String(now.getUTCMonth() + 1).padStart(2, "0");
  let code = "";
  for (let i = 0; i < 5; i++) code += REF_CHARS[randomInt(REF_CHARS.length)];
  return `GP-${yymm}-${code}`;
}

export function subjectLine(e, ref) {
  return `New race weekend enquiry: ${e.race} (${e.firstName} ${e.lastName}) [${ref}]`;
}

/* The plain-text body, in the order the review page shows. This was
   buildBody() in the original page, when the email was sent from the
   customer's own mail app. */
export function plainTextBody(e, ref) {
  return [
    "New race weekend enquiry via the GPGT enquiry form:",
    "",
    "Reference: " + ref,
    "",
    "First name: " + e.firstName,
    "Last name: " + e.lastName,
    "Phone: " + e.phone,
    "Email: " + e.email,
    "",
    "Race: " + e.race,
    "Flying from: " + (e.ownFlights ? "Arranging their own flights" : e.flyingFrom),
    "Package tier: " + e.packageTier,
    "Travelling: " + e.travelling,
    "Hotel rooms: " + e.hotelRooms,
    "Beds included: " + e.bedsIncluded,
    "Travel dates: " + e.travelDates,
    "Payment plan: " + (e.paymentPlan || "Not stated"),
    "Occasion: " + (e.occasion || "Not stated"),
    "",
    "What matters to them:",
    e.notes || "(nothing added)",
  ].join("\n");
}
