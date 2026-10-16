import { airportLabel, airportPlace } from "./data/airports.js";
import { $, escapeHtml } from "./dom.js";
import { STEP_ORDER, answers, nav } from "./state.js";
import { submitEnquiry } from "./submit.js";
import { Cal } from "./ui/calendar.js";
import { Globe } from "./ui/globe.js";
import { Metal } from "./ui/metal.js";
import { partySummary, renderParty } from "./ui/party.js";
import { Pay } from "./ui/payment.js";
import { bedSummary, roomsSummary, roomsTotal } from "./ui/rooms.js";
import { Wishes } from "./ui/wishes.js";

/* ---------- navigation ---------- */
export function buildProgress(){
  var track = $("progressTrack");
  var total = $("stepTotal");
  if(total) total.textContent = STEP_ORDER.length;
  for(var i=0;i<STEP_ORDER.length;i++){
    var seg = document.createElement("div");
    seg.className = "progress-seg";
    track.appendChild(seg);
  }
}

export function isValid(stepKey){
  switch(stepKey){
    case "firstName": return answers.firstName.trim().length > 1;
    case "lastName": return answers.lastName.trim().length > 1;
    case "phone": return answers.phone.trim().length > 3;
    case "email": return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email.trim());
    case "race": return !!answers.race;
    case "depart": return answers.ownFlights || !!answers.depart;
    case "tier": return !!answers.tier;
    case "guests": return answers.adults >= 1;
    case "rooms": return roomsTotal() >= 1;
    case "nights": return true;
    /* Required, like the tier: which plan someone wants is one of the more
       useful things the form can learn, and it is a single tap. */
    case "payment": return !!answers.payPlan;
    /* Optional by design - see the step's comment. */
    case "wishes": return true;
    case "review": return true;
  }
  return false;
}

var ERROR_MESSAGES = {
  firstName: "Enter your first name so we know who's asking.",
  lastName: "Enter your last name for the booking.",
  phone: "Enter a phone number we can reach you on.",
  email: "Enter a valid email address, like you@example.com."
};

export function showError(stepKey){
  var el = document.getElementById(stepKey + "Err");
  if(el){ el.textContent = isValid(stepKey) ? "" : (ERROR_MESSAGES[stepKey] || ""); }
}
export function clearError(stepKey){
  var el = document.getElementById(stepKey + "Err");
  if(el && isValid(stepKey)){ el.textContent = ""; }
}

function stepIndexNumber(key){
  return STEP_ORDER.indexOf(key) + 1;   /* 1-based; review is the last */
}

export function showStep(idx){
  nav.current = idx;
  var key = STEP_ORDER[idx];
  document.querySelectorAll(".step").forEach(function(s){ s.hidden = true; });
  var panel = document.querySelector('.step[data-step="'+key+'"]');
  panel.hidden = false;
  panel.setAttribute("data-fade","");

  var seg = $("progressTrack").children;
  var filled = stepIndexNumber(key);
  for(var i=0;i<seg.length;i++){ seg[i].classList.toggle("done", i < filled); }
  $("stepNow").textContent = (key === "review") ? "Review" : filled;

  $("backBtn").style.visibility = (idx === 0 && !nav.returnToReview) ? "hidden" : "visible";

  if(key === "review"){ renderSummary(); }
  if(key === "race" || key === "depart"){
    var slot = $(key === "race" ? "raceGlobeSlot" : "departGlobeSlot");
    var col = $("globeCol");
    if(slot && col && col.parentNode !== slot){ slot.appendChild(col); }
    if(col) col.hidden = false;
    if(key === "depart") Globe.showRoute();
    else Globe.showRace();
    Globe.start();
  } else {
    Globe.stop();
  }
  if(key === "guests"){ renderParty(); }
  if(key === "nights"){ Cal.sync(true); }
  if(key === "payment"){ Pay.sync(); }
  if(key === "wishes"){ Wishes.sync(); }
  refreshNav();

  /* The two search steps are left unfocused on purpose: focusing them opens
     their dropdown, which covers the globe before anyone has asked for it. */
  var firstField = panel.querySelector("input, select");
  if(firstField && key !== "race" && key !== "depart" && key !== "tier"){
    firstField.focus({preventScroll:true});
  }
}

export function refreshNav(){
  var key = STEP_ORDER[nav.current];
  $("nextBtn").disabled = !isValid(key);
  Metal.setText($("nextBtn"), (key === "review")
    ? "Send Enquiry"
    : (nav.returnToReview ? "Save and review" : "Continue"));
}

/* Move forward one step — or straight back to the review page when the
   viewer came here from a "Edit" link on that page. */
export function advance(){
  var key = STEP_ORDER[nav.current];
  if(!isValid(key)){ showError(key); return; }
  if(key === "review"){ submitEnquiry(); return; }
  if(nav.returnToReview){
    nav.returnToReview = false;
    showStep(STEP_ORDER.indexOf("review"));
    return;
  }
  showStep(nav.current + 1);
}

function renderSummary(){
  var rows = [
    ["First name", answers.firstName, "firstName"],
    ["Last name", answers.lastName, "lastName"],
    ["Phone", answers.phone, "phone"],
    ["Email", answers.email, "email"],
    ["Race", answers.race, "race"],
    ["Flying from", answers.ownFlights ? "Arranging their own flights"
      : (answers.depart ? airportLabel(answers.depart) + " - " + airportPlace(answers.depart) : ""), "depart"],
    ["Package tier", answers.tier, "tier"],
    ["Travelling", partySummary(), "guests"],
    ["Hotel rooms", roomsSummary("×"), "rooms"],
    ["Beds included", bedSummary(), "rooms"],
    ["Travel dates", Cal.summary(), "nights"],
    ["Payment plan", Pay.summary(), "payment"]
  ];
  /* The occasion row only appears when there is an occasion; the notes row
     always does, so there is still a way back to that page from here when
     they left it blank. */
  var occ = Wishes.occasionSummary();
  if(occ) rows.push(["Occasion", occ, "wishes"]);
  var notes = answers.wishes.trim();
  rows.push(["What matters to you", notes || "Nothing added yet",
             "wishes", notes ? "is-long" : ""]);

  var list = $("summaryList");
  list.innerHTML = "";
  rows.forEach(function(r){
    var row = document.createElement("div");
    row.className = "summary-row" + (r[3] ? " " + r[3] : "");
    row.innerHTML = '<span class="k">'+r[0]+'</span><span class="v">'+escapeHtml(String(r[1]||"—"))+
      ' <button type="button" class="edit" data-jump="'+r[2]+'">Edit</button></span>';
    list.appendChild(row);
  });
  Array.prototype.forEach.call(list.querySelectorAll(".edit"), function(btn){
    btn.addEventListener("click", function(){
      nav.returnToReview = true;
      showStep(STEP_ORDER.indexOf(btn.dataset.jump));
    });
  });
}
