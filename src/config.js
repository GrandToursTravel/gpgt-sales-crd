import roomDouble from "./assets/images/room-double.webp";
import roomTwin from "./assets/images/room-twin.webp";
import roomTriple from "./assets/images/room-triple.webp";

/* Three tiers. Bronze, Silver and Gold are not a service ladder: on every
   race page all three carry the same inclusions and what changes is WHICH
   grandstand and WHICH hotel - Hungary runs Apex / Pit Exit 1 / Main Straight
   with a 5* on Gold, Italy runs Parabolica / Laterale Destra / First Chicane
   all at 4*. The two lines at the top of each list are therefore the ones
   that actually differ; the rest are the same in all three, spelled out on
   every card because a customer choosing a tier should see the whole package
   without having to look elsewhere on the page. */

export var TIER_INCLUDED = [
  "Hotel with breakfast included",
  "Return flights",
  "Private airport transfers",
  "Coach transfers from the hotel to the circuit",
  "Tour guides throughout the weekend",
  "Welcome drink on arrival"
];

/* The cards used to name the grandstand and the hotel per race, which meant
   72 entries to keep current across 24 races. Both are gone: the seat is a
   rating, and the hotel is one line in the included list. The same three
   cards are now correct for every race on the calendar with nothing to
   maintain. */

/* Out of five. Silver is a half, which is why these are drawn as a filled
   overlay over a full row rather than as whole star glyphs. */
export var TIER_STAND_RATING = { "Bronze": 4, "Silver": 4.5, "Gold": 5 };

export var UNSURE = "Not sure yet, help me choose";
export var BOOKING_URL = "https://meetings.hubspot.com/luke-gould";

/* Shown to the customer only if sending fails, as somewhere to go instead.
   Enquiries themselves are routed on the server, not from here. */
export var CONTACT_EMAIL = "luke@grandprixgrandtours.com";

/* Always the last entry in the race list, after whatever the calendar holds.
   It is an answer, not a race, so it lives here rather than in the sheet. */
export var NOT_SURE_RACE = { id: "not-sure", name: "Not sure yet", city: "Recommend me a race", lat: null, lng: null };

export var TIERS = [
  {
    name: "Bronze",
    tint: "#b0824e",
    kicker: "Four-star hotel",
    facets: 1
  },
  {
    name: "Silver",
    tint: "#aab2bb",
    kicker: "Better-placed seat",
    facets: 2
  },
  {
    name: "Gold",
    tint: "#d4af37",
    kicker: "Premium seat",
    facets: 3
  }
];

/* The three room types GPGT books. The floor is one room overall, not one
   of each, so the minus that would empty the booking is the one disabled. */
export var ROOM_TYPES = ["Double","Twin","Triple"];
/* A photograph of each room, so the choice is made by looking rather than by
   reading the word. The bed line beside it is derived from ROOM_BED_MAKEUP
   below rather than written out again, so the row and the bed itinerary can
   never disagree about what a triple contains. */
export var ROOM_PHOTOS = {
  "Double": roomDouble,
  "Twin": roomTwin,
  "Triple": roomTriple
};
/* What is actually in each room type, in beds. Room types are what the client
   picks; beds are what operations books and what the party sleeps in, and the
   two do not add up the same way - three rooms can be three beds or six. */
export var ROOM_BED_MAKEUP = {
  "Double": { dbl:1, sgl:0 },
  "Twin":   { dbl:0, sgl:2 },
  "Triple": { dbl:1, sgl:1 }
};
export var ROOM_MAX = 20;

/* The occasion behind the trip. Chips only: an earlier version wrote a
   tailored line under each one when it was picked, which both cluttered the
   page and risked promising things GPGT does not sell. */
export var OCCASIONS = [
  "Birthday", "Anniversary", "First Grand Prix", "Honeymoon",
  "Stag or hen", "Family trip", "Client entertaining", "A surprise"
];

export var PAY_PLANS = {
  "full":    "Pay in full",
  "monthly": "Pay monthly",
  "split":   "Chosen number of payments"
};
export var PAY_COUNT_MIN = 2, PAY_COUNT_MAX = 12;
export var PAY_TERMS = [
  "All payment plans are interest free",
  "Secure payments handled by Airwallex",
  "Flight costs may have to be paid upfront",
  "No credit checks required",
  "Your package must be paid in full before you travel"
];
