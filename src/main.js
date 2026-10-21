import "@fontsource/oswald/400.css";
import "@fontsource/oswald/500.css";
import "@fontsource/oswald/600.css";
import "@fontsource/oswald/700.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "./styles/index.css";

import { captureAttribution } from "./attribution.js";
import { loadCatalog } from "./data/catalog.js";
import { $ } from "./dom.js";
import { RACES, STEP_ORDER, answers, nav } from "./state.js";
import { showConfirm } from "./submit.js";
import { Cal } from "./ui/calendar.js";
import { EARTH_TEX, Globe } from "./ui/globe.js";
import { Metal } from "./ui/metal.js";
import { renderParty } from "./ui/party.js";
import { Pay } from "./ui/payment.js";
import { buildRoomRows } from "./ui/rooms.js";
import { bindStepper } from "./ui/stepper.js";
import { buildTiers } from "./ui/tiers.js";
import { DepartMenu, RaceMenu, toggleOwnFlights } from "./ui/travel-menus.js";
import { Wishes } from "./ui/wishes.js";
import { advance, buildProgress, clearError, refreshNav, showError, showStep } from "./wizard.js";

/* Read any ad tracking values off the address before anything else runs. */
captureAttribution();

/* ---------- wire up ---------- */
document.addEventListener("DOMContentLoaded", function(){
  Metal.attach($("beginBtn"));
  Metal.attach($("nextBtn"));

  /* One copy of the logo data, shared by the header and the confirmation. */
  var heroLogo = $("heroLogo");
  if(heroLogo){
    Array.prototype.forEach.call(document.querySelectorAll(".mark-logo"), function(img){
      img.src = heroLogo.currentSrc || heroLogo.src;
    });
  }

  RaceMenu.init();
  DepartMenu.init();
  $("ownFlightsBtn").addEventListener("click", toggleOwnFlights);
  buildTiers();
  buildProgress();

  /* The race list is fetched while the customer reads the hero and answers
     the first four questions. The search box says so until it arrives; the
     loader always resolves, falling back to the bundled calendar. */
  loadCatalog().then(function(){
    var input = $("raceSearch");
    if(!input) return;
    var n = RACES.filter(function(r){ return r.lat !== null; }).length;
    input.placeholder = "Search all " + n + " races by name or city…";
    input.disabled = false;
  });

  /* Started on the first press of the start button rather than at load: the
     globe's texture is the heaviest file on the page, and nobody needs it
     until the race question, five steps in. */
  var globeStarted = false;
  function initGlobe(){
    if(globeStarted) return;
    globeStarted = true;
    if(!Globe.init(EARTH_TEX)){
      var col = $("globeCol");
      if(col) col.hidden = true;
      var layout = document.querySelector(".race-layout");
      if(layout) layout.style.gridTemplateColumns = "1fr";
    }
  }
  // Stop burning frames while the tab is in the background.
  document.addEventListener("visibilitychange", function(){
    if(document.hidden){ Globe.stop(); Metal.stop(); }
    else { Metal.start(); if(STEP_ORDER[nav.current] === "race" && !$("wizard").hidden) Globe.start(); }
  });

  /* At least one adult has to be on the booking; the rest are optional. */
  window.addEventListener("resize", renderParty);
  bindStepper("adults", 1, 40, "adultsOut", renderParty);
  bindStepper("minors", 0, 20, "minorsOut", renderParty);
  renderParty();
  buildRoomRows();
  Cal.init();
  Pay.init();
  Wishes.init();
  bindStepper("extraBefore", 0, 14, "extraBeforeOut", function(){ Cal.sync(false); });
  bindStepper("extraAfter", 0, 14, "extraAfterOut", function(){ Cal.sync(false); });

  $("firstNameInput").addEventListener("input", function(e){ answers.firstName = e.target.value; refreshNav(); clearError("firstName"); });
  $("lastNameInput").addEventListener("input", function(e){ answers.lastName = e.target.value; refreshNav(); clearError("lastName"); });
  $("phoneInput").addEventListener("input", function(e){ answers.phone = e.target.value; refreshNav(); clearError("phone"); });
  $("emailInput").addEventListener("input", function(e){ answers.email = e.target.value; refreshNav(); clearError("email"); });

  ["firstName","lastName","phone","email"].forEach(function(key){
    var input = $(key + "Input");
    input.addEventListener("blur", function(){ if(input.value.trim().length){ showError(key); } });
    input.addEventListener("keydown", function(ev){
      if(ev.key === "Enter"){
        ev.preventDefault();
        advance();
      }
    });
  });

  $("nextBtn").addEventListener("click", advance);
  $("backBtn").addEventListener("click", function(){
    if(nav.returnToReview){
      nav.returnToReview = false;
      showStep(STEP_ORDER.indexOf("review"));
      return;
    }
    if(nav.current > 0) showStep(nav.current - 1);
  });

  function beginLightsAndEnter(){
    var bulbs = $("lights").querySelectorAll(".bulb");
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("beginBtn").disabled = true;
    initGlobe();

    function enterWizard(){
      $("hero").hidden = true;
      $("wizard").hidden = false;
      $("wizard").setAttribute("data-fade","");
      showStep(0);
    }

    if(reduced){ enterWizard(); return; }

    var i = 0;
    var onInterval = setInterval(function(){
      if(i < bulbs.length){ bulbs[i].classList.add("on"); i++; }
      else{
        clearInterval(onInterval);
        setTimeout(function(){
          $("lights").classList.add("out");
          setTimeout(enterWizard, 260);
        }, 420);
      }
    }, 160);
  }

  $("beginBtn").addEventListener("click", beginLightsAndEnter);

  /* Open the page at #preview-done to land straight on the completion screen
     with sample answers, so it can be looked at or shown to someone without
     filling in thirteen steps first. Nothing is sent. Development builds only:
     the production bundle drops this block entirely. */
  if(import.meta.env.DEV && location.hash === "#preview-done"){
    answers.firstName = "Alex";
    answers.lastName = "Turner";
    answers.email = "alex.turner@example.com";
    answers.phone = "+44 7700 900123";
    answers.race = "Hungarian Grand Prix";
    answers.raceId = "hungarian";
    answers.tier = "Gold";
    answers.ownFlights = true;
    answers.adults = 2;
    answers.roomCounts = { "Double":1, "Twin":0, "Triple":0 };
    answers.payPlan = "monthly";
    answers.occasions = ["Birthday"];
    answers.wishes = "Dad's 60th and his first Grand Prix.";
    $("hero").hidden = true;
    $("wizard").hidden = true;
    loadCatalog().then(function(){ showConfirm("GP-PREVIEW"); });
  }
});
