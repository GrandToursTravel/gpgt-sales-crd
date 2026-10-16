import { OCCASIONS } from "../config.js";
import { $ } from "../dom.js";
import { answers } from "../state.js";

/* ---------- Wishes ----------
   Chips write into answers.occasions and put a matching prompt beside the
   box; the box writes into answers.wishes. Neither is required. */
export var Wishes = (function(){
  var chipEls = {};

  /* Kept in OCCASIONS order however they were clicked, so the review page and
     the email always read the same way round. */
  function ordered(){
    return OCCASIONS.filter(function(label){
      return answers.occasions.indexOf(label) !== -1;
    });
  }

  /* Four bands rather than a character count: a number invites people to game
     it, and "247 characters" is not encouragement. */
  function renderMeter(){
    var meter = $("wishMeter"), text = $("wishMeterText"), fill = $("wishBarFill");
    if(!meter || !text || !fill) return;
    var n = answers.wishes.trim().length;
    var pct = Math.min(100, Math.round(n / 240 * 100));
    var full = n >= 240;
    fill.style.width = pct + "%";
    meter.classList.toggle("is-full", full);
    text.textContent =
      n === 0   ? "Even a couple of sentences helps us start in the right place." :
      n < 90    ? "Keep going — the detail is what we build from." :
      n < 240   ? "That's really useful, thank you." :
                  "Perfect. That's exactly what we need to build it properly.";
  }

  function toggle(label){
    var i = answers.occasions.indexOf(label);
    if(i === -1) answers.occasions.push(label);
    else answers.occasions.splice(i, 1);
    var on = answers.occasions.indexOf(label) !== -1;
    var el = chipEls[label];
    if(el){
      el.setAttribute("aria-pressed", on ? "true" : "false");
      var mark = el.querySelector(".chip-mark");
      if(mark) mark.textContent = on ? "✓" : "+";
    }
  }

  return {
    init: function(){
      var host = $("occasionChips");
      if(host){
        OCCASIONS.forEach(function(label){
          var b = document.createElement("button");
          b.type = "button";
          b.className = "chip";
          b.setAttribute("aria-pressed", "false");
          var mark = document.createElement("span");
          mark.className = "chip-mark";
          mark.setAttribute("aria-hidden", "true");
          mark.textContent = "+";
          var txt = document.createElement("span");
          txt.textContent = label;
          b.appendChild(mark); b.appendChild(txt);
          b.addEventListener("click", function(){ toggle(label); });
          host.appendChild(b);
          chipEls[label] = b;
        });
      }
      var box = $("wishesInput");
      if(box){
        box.addEventListener("input", function(){
          answers.wishes = box.value;
          renderMeter();
        });
      }
      renderMeter();
    },
    /* "Birthday and a first Grand Prix" - for the review page and the email. */
    occasionSummary: function(){
      var picked = ordered();
      if(!picked.length) return "";
      if(picked.length === 1) return picked[0];
      return picked.slice(0, -1).join(", ") + " and " + picked[picked.length - 1];
    },
    sync: function(){ renderMeter(); }
  };
})();
