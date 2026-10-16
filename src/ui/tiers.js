import { BOOKING_URL, TIERS, TIER_INCLUDED, TIER_STAND_RATING, UNSURE } from "../config.js";
import { $, escapeHtml } from "../dom.js";
import { answers } from "../state.js";
import { refreshNav } from "../wizard.js";

/* A gem that gains facets as the tier climbs, drawn rather than photographed:
   a stock image would have to be hosted, and this scales and stays crisp. */
function emblem(tint, facets){
  var s = '<svg class="emblem" viewBox="0 0 24 24" fill="none" aria-hidden="true" ' +
          'stroke="' + tint + '" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round">' +
          '<path d="M12 2.6 3.4 9 12 21.4 20.6 9 12 2.6Z"/><path d="M3.4 9h17.2"/>';
  if(facets >= 2) s += '<path d="M9.1 9 12 21.4M14.9 9 12 21.4"/><path d="M12 2.6 9.1 9M12 2.6 14.9 9"/>';
  if(facets >= 3) s += '<path d="M6.6 9 8 5.3M17.4 9 16 5.3"/><path d="M6.2 12.1h11.6"/>';
  return s + '</svg>';
}

/* The lucide Diamond used by the reference card is a rotated square. */
export var TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
           'stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 21.5 12 12 21.5 2.5 12 12 2.5Z"/></svg>';

function featItems(list){
  return list.map(function(f){
    return '<li>' + TICK + '<span>' + escapeHtml(f) + '</span></li>';
  }).join("");
}

/* The two leading lines come from the chosen race when we hold its detail. */
/* One star path, reused ten times - five grey underneath and five in the
   tier's own metal on top. The overlay is clipped to rating/5 of the width,
   which is how a half star is drawn without a half-star glyph. */
var STAR_PATH = "M12 2.6l2.9 5.88 6.49.95-4.7 4.58 1.11 6.46L12 17.42 " +
                "6.2 20.47l1.11-6.46-4.7-4.58 6.49-.95L12 2.6Z";

function starRow(rating){
  var one = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + STAR_PATH + '"/></svg>';
  var five = one + one + one + one + one;
  var pct = (rating / 5 * 100).toFixed(2);
  /* The text alternative carries the number; the stars themselves are
     decoration as far as a screen reader is concerned. */
  return '<div class="stand">' +
           '<span class="stand-label">Grandstand rating</span>' +
           '<span class="stars" role="img" aria-label="' + rating + ' out of 5">' +
             '<span class="stars-bed">' + five + '</span>' +
             '<span class="stars-fill" style="width:' + pct + '%">' + five + '</span>' +
           '</span>' +
           '<span class="stand-score">' + rating + '/5</span>' +
         '</div>';
}

function featureList(t){
  return starRow(TIER_STAND_RATING[t.name] || 0) +
         '<ul class="feats rest">' + featItems(TIER_INCLUDED) + '</ul>';
}

/* Each card carries its own metal, mixed here rather than in the stylesheet
   so the three tiers share one set of rules. */
export function metalVars(hex){
  var h = hex.replace("#", "");
  var r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  function lift(f){
    return "#" +
      [r,g,b].map(function(v){
        return ("0" + Math.round(v + (255-v)*f).toString(16)).slice(-2);
      }).join("");
  }
  function a(alpha){ return "rgba(" + r + "," + g + "," + b + "," + alpha + ")"; }
  return "--metal:" + hex + ";" +
         "--metal-hi:" + lift(0.42) + ";" +
         /* The wash lifts the ground under the tier name, so the name gets
            its own slightly brighter mix: bronze is the dark one and fell
            below 4.5:1 against its own wash at the true metal value. */
         "--metal-name:" + lift(0.18) + ";" +
         "--metal-wash:" + a(0.13) + ";" +
         "--metal-sheen:" + a(0.07) + ";" +
         "--metal-glow:" + a(0.30) + ";";
}

/* Called on entering the step, because the race can change after the cards
   were built - and can change again via an Edit link from the review page. */

export function buildTiers(){
  var grid = $("tierGrid");
  TIERS.forEach(function(t){
    var card = document.createElement("button");
    card.type = "button";
    card.className = "tier";
    card.dataset.tier = t.name;
    card.setAttribute("aria-pressed", "false");
    card.setAttribute("style", metalVars(t.tint));
    card.innerHTML =
      '<span class="tier-head">' +
        '<span class="tier-title"><span class="name">' + t.name + '</span>' +
        '<span class="kicker">' + escapeHtml(t.kicker) + '</span></span>' +
        emblem(t.tint, t.facets) +
      '</span>' +
      featureList(t) +
      '<span class="cta">Choose ' + t.name + '</span>';
    card.addEventListener("click", function(){ selectTier(t.name, card); });
    grid.appendChild(card);
  });
  /* This row holds two controls, so unlike the tier cards it is a plain
     container rather than a button: "Talk it through" opens Luke's booking
     page, and an anchor inside a button would be a keyboard trap. Either
     control records the same answer, so someone who books a call still has a
     complete enquiry to send. */
  var unsure = document.createElement("div");
  unsure.className = "tier unsure";
  unsure.dataset.tier = UNSURE;

  var pick = document.createElement("button");
  pick.type = "button";
  pick.className = "unsure-pick";
  pick.setAttribute("aria-pressed", "false");
  pick.innerHTML = '<span class="name">Not sure yet? Help me choose</span>';
  pick.addEventListener("click", function(){ selectTier(UNSURE, unsure); });

  var book = document.createElement("a");
  book.className = "cta cta-link";
  book.href = BOOKING_URL;
  book.target = "_blank";
  book.rel = "noopener noreferrer";
  book.textContent = "Talk it through";
  book.setAttribute("aria-label", "Talk it through - book a call, opens in a new tab");
  /* Record the answer before the new tab takes over. */
  book.addEventListener("click", function(){ selectTier(UNSURE, unsure); });

  unsure.appendChild(pick);
  unsure.appendChild(book);
  grid.appendChild(unsure);
}
function selectTier(name, el){
  answers.tier = name;
  Array.prototype.forEach.call($("tierGrid").children, function(c){
    c.classList.remove("selected");
    var press = c.matches(".unsure") ? c.querySelector(".unsure-pick") : c;
    if(press) press.setAttribute("aria-pressed", "false");
    /* Only the tier cards swap their label - the unsure row's button is a
       link out, and "Selected" would hide where it goes. */
    var cta = c.querySelector(".cta:not(.cta-link)");
    if(cta && cta.dataset.label) cta.textContent = cta.dataset.label;
  });
  el.classList.add("selected");
  var press2 = el.matches(".unsure") ? el.querySelector(".unsure-pick") : el;
  if(press2) press2.setAttribute("aria-pressed", "true");
  var cta2 = el.querySelector(".cta:not(.cta-link)");
  if(cta2){
    if(!cta2.dataset.label) cta2.dataset.label = cta2.textContent;
    cta2.textContent = "Selected";
  }
  refreshNav();
}
