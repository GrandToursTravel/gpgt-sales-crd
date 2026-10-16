import fanAdult1 from "../assets/images/fan-adult-1.webp";
import fanAdult2 from "../assets/images/fan-adult-2.webp";
import fanAdult3 from "../assets/images/fan-adult-3.webp";
import fanAdult4 from "../assets/images/fan-adult-4.webp";
import fanAdult5 from "../assets/images/fan-adult-5.webp";
import fanAdult6 from "../assets/images/fan-adult-6.webp";
import fanKid1 from "../assets/images/fan-kid-1.webp";
import fanKid2 from "../assets/images/fan-kid-2.webp";
import fanKid3 from "../assets/images/fan-kid-3.webp";
import fanKid4 from "../assets/images/fan-kid-4.webp";
import fanKid5 from "../assets/images/fan-kid-5.webp";
import { $ } from "../dom.js";
import { answers } from "../state.js";

/* ---------- steppers ---------- */
export function partySummary(){
  var a = answers.adults, m = answers.minors;
  var s = a + (a === 1 ? " adult" : " adults");
  if(m > 0) s += ", " + m + (m === 1 ? " under 18" : " under 18s");
  return s;
}

/* The fan figures Luke supplied, cut out of his sheet one at a time with the
   white background made transparent so they sit on the dark card. Six adult
   kits and five children's; a figure picks one when it appears and keeps it.
   Small files, so they load with the guests step rather than with the page. */
var FANS_ADULT = [
  "<img class=\"party-fig\" alt=\"\" width=\"160\" height=\"452\" loading=\"lazy\" src=\"" + fanAdult1 + "\">",
  "<img class=\"party-fig\" alt=\"\" width=\"158\" height=\"448\" loading=\"lazy\" src=\"" + fanAdult2 + "\">",
  "<img class=\"party-fig\" alt=\"\" width=\"162\" height=\"449\" loading=\"lazy\" src=\"" + fanAdult3 + "\">",
  "<img class=\"party-fig\" alt=\"\" width=\"161\" height=\"450\" loading=\"lazy\" src=\"" + fanAdult4 + "\">",
  "<img class=\"party-fig\" alt=\"\" width=\"165\" height=\"451\" loading=\"lazy\" src=\"" + fanAdult5 + "\">",
  "<img class=\"party-fig\" alt=\"\" width=\"160\" height=\"449\" loading=\"lazy\" src=\"" + fanAdult6 + "\">"
];
var FANS_KID = [
  "<img class=\"party-fig is-kid\" alt=\"\" width=\"123\" height=\"308\" loading=\"lazy\" src=\"" + fanKid1 + "\">",
  "<img class=\"party-fig is-kid\" alt=\"\" width=\"123\" height=\"304\" loading=\"lazy\" src=\"" + fanKid2 + "\">",
  "<img class=\"party-fig is-kid\" alt=\"\" width=\"124\" height=\"303\" loading=\"lazy\" src=\"" + fanKid3 + "\">",
  "<img class=\"party-fig is-kid\" alt=\"\" width=\"124\" height=\"297\" loading=\"lazy\" src=\"" + fanKid4 + "\">",
  "<img class=\"party-fig is-kid\" alt=\"\" width=\"125\" height=\"298\" loading=\"lazy\" src=\"" + fanKid5 + "\">"  ];

/* A shuffled bag rather than a fresh random pick each time: picking at random
   repeats the same kit two or three in a row often enough to look broken, and
   a party of four in matching kit is not what randomising should give you.
   The bag is dealt out, then reshuffled once empty. */
function makeBag(items){
  var bag = [];
  return function(){
    if(!bag.length){
      bag = items.slice();
      for(var i = bag.length - 1; i > 0; i--){
        var j = Math.floor(Math.random() * (i + 1));
        var t = bag[i]; bag[i] = bag[j]; bag[j] = t;
      }
    }
    return bag.pop();
  };
}
var nextAdultKit = makeBag(FANS_ADULT);
var nextKidKit = makeBag(FANS_KID);

/* Most figures ever drawn, the smallest an adult is drawn at, and the width
   the "+N" chip needs when the party outgrows the row. The largest size comes
   from --fig-max in the stylesheet so it can change with the breakpoint. */
var FIG_CAP = 14, FIG_MIN = 38, CHIP_W = 52;
/* Kept in step with the .is-kid height in the stylesheet: the ratio between
   the two figures in the sheet Luke supplied. */
var KID_SCALE = 0.681;

/* Only the figures that changed are added or taken away, so the ones already
   standing there do not replay their entrance on every press. */
export function renderParty(){
  var host = $("partyFigures");
  if(!host) return;

  /* Three groups in DOM order - left adults, children, right adults - so the
     children stand between the grown-ups the way a family lines up for a
     photograph: adult, child, child, adult. */
  var KEYS = ["left", "minors", "right"];
  var groups = {};
  KEYS.forEach(function(k){
    groups[k] = host.querySelector('.party-group[data-group="' + k + '"]');
  });
  if(!groups.left){
    host.innerHTML = KEYS.map(function(k){
      return '<span class="party-group" data-group="' + k + '"></span>';
    }).join("");
    KEYS.forEach(function(k){
      groups[k] = host.querySelector('.party-group[data-group="' + k + '"]');
    });
  }

  /* One row, always: a wrapped row leaves a lone child stranded underneath
     the adults, which reads as a mistake rather than a family. So the figures
     are sized to the width actually available. If the whole party fits at the
     smallest size the row shows all of it; if it does not, the row fills with
     the biggest representative group it can hold and a chip counts the rest.
     The two constants are each figure's width as a fraction of the adult
     height, taken from the two viewBoxes. */
  var cs = getComputedStyle(host);
  var W = host.clientWidth || 300;
  var gap = parseFloat(cs.columnGap) || 12;
  var FIG_MAX = parseFloat(cs.getPropertyValue("--fig-max")) || 96;
  var KA = 165 / 452, KK = KID_SCALE * (125 / 308);
  var a = answers.adults, m = answers.minors, total = a + m;

  /* Sub-pixel rounding of each figure's width accumulates across the row, so
     hold back a couple of pixels rather than filling it exactly. */
  function heightFor(na, nk, withChip){
    var denom = KA * na + KK * nk;
    if(denom <= 0) return FIG_MAX;
    var avail = W - gap * (na + nk - 1) - (withChip ? CHIP_W + gap : 0) - 4;
    return Math.floor(avail / denom);
  }

  var showA = a, showM = m, chipped = false;
  if(a + m > FIG_CAP || heightFor(a, m, false) < FIG_MIN){
    /* Crowded: draw at the smallest size and take as many as will fit, with
       room kept for children so the group is not all adults. */
    chipped = true;
    showM = Math.min(m, Math.floor(FIG_CAP / 2));
    showA = Math.min(a, FIG_CAP - showM);
    showM = Math.min(m, FIG_CAP - showA);
    while(showA + showM > 1 && heightFor(showA, showM, true) < FIG_MIN){
      if(showM > 0 && showM >= showA) showM--;
      else if(showA > 1) showA--;
      else showM--;
    }
    if(showA === a && showM === m) chipped = false;
  }

  var shown = showA + showM;
  var h = Math.max(FIG_MIN, Math.min(FIG_MAX, heightFor(showA, showM, chipped)));
  host.style.setProperty("--fig-h", h + "px");
  function fit(group, want, nextKit){
    var live = group.querySelectorAll(".party-slot:not(.is-out)");
    var n = live.length;
    for(var i = n; i < want; i++){
      var slot = document.createElement("span");
      slot.className = "party-slot";
      slot.innerHTML = nextKit();
      group.appendChild(slot);
    }
    for(var j = n - 1; j >= want; j--){
      var el = live[j];
      el.classList.add("is-out");
      (function(node){
        setTimeout(function(){ if(node.parentNode) node.parentNode.removeChild(node); }, 170);
      })(el);
    }
  }
  /* An odd adult goes on the left, so a pair with one child reads
     adult-child-adult and a lone adult still leads the row. */
  var leftA = Math.ceil(showA / 2);
  fit(groups.left, leftA, nextAdultKit);
  fit(groups.minors, showM, nextKidKit);
  fit(groups.right, showA - leftA, nextAdultKit);

  var chip = host.querySelector(".party-more");
  var hidden = total - shown;
  if(hidden > 0){
    if(!chip){
      chip = document.createElement("span");
      chip.className = "party-more";
      host.appendChild(chip);
    }
    chip.textContent = "+" + hidden;
    host.appendChild(chip);
  } else if(chip){
    chip.parentNode.removeChild(chip);
  }

  var cap = $("partyCaption");
  if(cap) cap.textContent = partySummary();
}
