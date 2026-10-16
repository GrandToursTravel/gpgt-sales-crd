/* Everything the wizard has collected, and where it is. Shared by every
   module, so it is mutated in place and never reassigned - an imported
   binding cannot be. */
export var answers = {
  firstName:"", lastName:"", phone:"", email:"",
  race:null, raceId:null, raceLat:null, raceLng:null, depart:null, ownFlights:false,
  tier:null, adults:1, minors:0,
  roomCounts:{ "Double":1, "Twin":0, "Triple":0 },
  extraBefore:0, extraAfter:0,
  payPlan:null, payCount:3,
  occasions:[], wishes:""
};

export var STEP_ORDER = ["firstName","lastName","phone","email","race","depart","tier","guests","rooms","nights","payment","wishes","review"];

/* Held in an object rather than as two bare variables so that the wizard and
   the start-up code can both move them. */
export var nav = { current: 0, returnToReview: false };

/* The race calendar. Filled by loadCatalog() once /api/races (or the bundled
   fallback) has answered; empty until then. RACE_DATES is keyed by race id. */
export var RACES = [];
export var RACE_DATES = {};
