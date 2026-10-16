import { CONTACT_EMAIL, TIERS } from "./config.js";
import { airportLabel, airportPlace } from "./data/airports.js";
import { $, escapeHtml } from "./dom.js";
import { answers } from "./state.js";
import { Cal } from "./ui/calendar.js";
import { Metal } from "./ui/metal.js";
import { partySummary } from "./ui/party.js";
import { Pay } from "./ui/payment.js";
import { bedSummary, roomsSummary } from "./ui/rooms.js";
import { metalVars } from "./ui/tiers.js";
import { Wishes } from "./ui/wishes.js";

/* ---------- submit ---------- */
/* Everything /api/enquiry receives. The readable summaries are the same lines
   the review page shows, so the email reads the way the customer saw it; the
   raw answers ride alongside for the CRM, which wants numbers and ids rather
   than sentences. The reference is not sent: the server issues it. */
function payload(){
  return {
    firstName: answers.firstName,
    lastName: answers.lastName,
    phone: answers.phone,
    email: answers.email,
    race: answers.race,
    raceId: answers.raceId,
    flyingFrom: answers.ownFlights ? "Arranging their own flights"
      : (answers.depart ? airportLabel(answers.depart) + " (" + airportPlace(answers.depart) + ")" : ""),
    departCode: answers.ownFlights || !answers.depart ? null : answers.depart.code,
    ownFlights: answers.ownFlights,
    packageTier: answers.tier,
    travelling: partySummary(),
    adults: answers.adults,
    minors: answers.minors,
    hotelRooms: roomsSummary("x"),
    roomCounts: answers.roomCounts,
    bedsIncluded: bedSummary(),
    travelDates: Cal.summary(),
    extraNightsBefore: answers.extraBefore,
    extraNightsAfter: answers.extraAfter,
    paymentPlan: Pay.summary(),
    payPlan: answers.payPlan,
    payCount: answers.payPlan === "split" ? answers.payCount : null,
    occasion: Wishes.occasionSummary(),
    occasions: answers.occasions.slice(),
    notes: answers.wishes.trim(),
    /* For HubSpot: the page the enquiry came from, and the visitor cookie its
       tracking code sets, if the page carries that code. */
    pageUri: location.href,
    hutk: hubspotCookie(),
    /* A field people cannot see and bots fill in. */
    website: ($("hpField") || {}).value || ""
  };
}

function hubspotCookie(){
  var m = /(?:^|;\s*)hubspotutk=([a-f0-9]{32})/.exec(document.cookie);
  return m ? m[1] : null;
}

/* Fills and reveals the completion page. The reference is the one the server
   issued, so it matches the email and the CRM record. */
export function showConfirm(ref){
  $("refCode").textContent = ref;

  var lead = $("confirmLead");
  if(lead){
    lead.textContent = "Thank you" + (answers.firstName ? ", " + answers.firstName : "") +
      " \u2014 your " + (answers.race || "race weekend") + " enquiry is with the team.";
  }

  /* The award takes the chosen tier's metal, so a bronze package gets a
     bronze wreath and pill rather than everyone getting gold. */
  var tier = null;
  TIERS.forEach(function(t){ if(t.name === answers.tier) tier = t; });
  var award = $("awardBlock");
  if(award) award.setAttribute("style", metalVars(tier ? tier.tint : "#c9a961"));
  var lvl = $("awardLevel");
  if(lvl) lvl.textContent = tier ? tier.name : "Enquiry";
  var atitle = $("awardTitle");
  if(atitle) atitle.textContent = answers.race || "Race weekend";
  var asub = $("awardSub");
  /* Just the dates: the "standard package dates" tail is a qualification the
     review page makes, and it is too long to sit inside a wreath. */
  if(asub) asub.textContent = Cal.summary().split(" - ")[0];
  var who = $("awardRecipient");
  if(who){
    var name = (answers.firstName + " " + answers.lastName).trim();
    who.textContent = name ? "for " + name : "";
  }

  $("nextStepsBox").innerHTML =
    "<li><b>We get to work</b>The team starts building your " +
      escapeHtml(answers.race || "race weekend") +
      " package around everything you've told us.</li>" +
    "<li><b>Your quote arrives</b>We'll put the numbers together and email them" +
      (answers.email ? " to " + escapeHtml(answers.email) : "") + ".</li>" +
    "<li><b>We give you a call</b>To talk through the finer details and get the weekend exactly right.</li>";

  $("wizard").hidden = true;
  $("confirm").hidden = false;
  $("confirm").setAttribute("data-fade","");
  /* Scroll the window as well as the section. The card replaces a much taller
     wizard, so the document suddenly gets shorter; embedded in a frame that
     left the viewer parked below the end of the content, looking at nothing. */
  try{ window.scrollTo(0, 0); }catch(e){}
  $("confirm").scrollIntoView({block:"start"});
}

var sending = false;

export function submitEnquiry(){
  if(sending) return;
  sending = true;
  var err = $("sendError");
  if(err) err.hidden = true;
  var btn = $("nextBtn");
  btn.disabled = true;
  Metal.setText(btn, "Sending…");

  /* The confirmation only appears once the server has the enquiry and has
     answered with its reference. */
  fetch("/api/enquiry", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload())
  }).then(function(res){
    return res.json().catch(function(){ return {}; }).then(function(data){
      if(!res.ok || !data.reference) throw new Error("status " + res.status);
      return data.reference;
    });
  }).then(function(ref){
    sending = false;
    showConfirm(ref);
  }).catch(function(){
    sending = false;
    btn.disabled = false;
    Metal.setText(btn, "Send Enquiry");
    if(err){
      err.hidden = false;
      err.innerHTML = "We couldn't send that just now — it is us, not you. " +
        "Please try again, or email us at <b>" + escapeHtml(CONTACT_EMAIL) + "</b> and we'll pick it up from there.";
      err.scrollIntoView({block:"nearest"});
    }
  });
}
