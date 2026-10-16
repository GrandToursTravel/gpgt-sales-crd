import { PAY_COUNT_MAX, PAY_COUNT_MIN, PAY_PLANS, PAY_TERMS } from "../config.js";
import { $, escapeHtml } from "../dom.js";
import { answers } from "../state.js";
import { bindStepper } from "./stepper.js";
import { TICK } from "./tiers.js";
import { refreshNav } from "../wizard.js";

/* ---------- Payment plan ----------
   Three radios, one sliding outline, and an odometer for the payment count.
   The count control only exists for the third plan. */
export var Pay = (function(){
  var rows, rail, countBox, out, word, roll;
  var cols = [];

  /* Two columns: tens (blank or 1) and units (0-9), which covers 2 to 12
     without the strip having to be rebuilt when the number changes width. */
  function buildRoll(){
    roll = $("payCountRoll");
    if(!roll) return;
    roll.innerHTML = "";
    cols = [["", "1"], ["0","1","2","3","4","5","6","7","8","9"]].map(function(faces){
      var col = document.createElement("span");
      col.className = "roll-col";
      var strip = document.createElement("span");
      strip.className = "roll-strip";
      faces.forEach(function(f){
        var s = document.createElement("span");
        s.textContent = f;
        strip.appendChild(s);
      });
      col.appendChild(strip);
      roll.appendChild(col);
      return strip;
    });
  }

  function showCount(n){
    if(!cols.length) return;
    var tens = Math.floor(n / 10), units = n % 10;
    /* em, not %: a percentage translate resolves against the strip's own
       height - all ten digits - so -700% moved it twenty-three rows rather
       than seven. Each face is exactly 1em tall, so -7em is seven digits. */
    cols[0].style.transform = "translateY(" + (-tens) + "em)";
    cols[1].style.transform = "translateY(" + (-units) + "em)";
    cols[0].parentNode.classList.toggle("is-blank", tens === 0);
    if(out) out.textContent = n;
    if(word) word.textContent = (n === 1) ? "payment" : "payments";
    if(roll) roll.setAttribute("aria-hidden", "true");
  }

  /* Measured off the chosen row rather than assumed from its index - the
     rows grow a line taller when their text wraps on a narrow screen. */
  function moveRail(){
    if(!rail || !rows) return;
    var on = rows.querySelector(".plan.is-on");
    if(!on){ rail.classList.remove("is-on"); return; }
    rail.classList.add("is-on");
    /* Rects rather than offsetTop/offsetHeight: those round to whole pixels,
       and a row that is really 95.6px tall left the outline half a pixel out
       of true at some widths. */
    var r = on.getBoundingClientRect(), box = rows.getBoundingClientRect();
    rail.style.height = r.height + "px";
    rail.style.transform = "translateY(" + (r.top - box.top) + "px)";
  }

  function paint(){
    if(!rows) return;
    Array.prototype.forEach.call(rows.querySelectorAll(".plan"), function(p){
      var on = p.dataset.plan === answers.payPlan;
      p.classList.toggle("is-on", on);
      var input = p.querySelector("input");
      if(input) input.checked = on;
    });
    if(countBox) countBox.hidden = (answers.payPlan !== "split");
    moveRail();
  }

  function choose(plan){
    answers.payPlan = plan;
    paint();
    showCount(answers.payCount);
    refreshNav();
  }

  return {
    init: function(){
      rows = $("planRows"); rail = $("planRail");
      countBox = $("planCount"); out = $("payCountOut"); word = $("payCountWord");
      if(!rows) return;
      var terms = $("payTerms");
      if(terms){
        terms.innerHTML = PAY_TERMS.map(function(t){
          return "<li>" + TICK + "<span>" + escapeHtml(t) + "</span></li>";
        }).join("");
      }
      buildRoll();
      Array.prototype.forEach.call(rows.querySelectorAll(".plan"), function(p){
        var input = p.querySelector("input");
        if(input) input.addEventListener("change", function(){ choose(p.dataset.plan); });
      });
      bindStepper("payCount", PAY_COUNT_MIN, PAY_COUNT_MAX, "payCountOut", function(){
        showCount(answers.payCount);
      });
      showCount(answers.payCount);
      /* The rail is measured, so it has to be re-measured when the rows
         reflow. */
      window.addEventListener("resize", moveRail);
    },
    /* Called on entering the step: the rows have no size while hidden, so the
       rail cannot be placed until now. */
    sync: function(){ paint(); showCount(answers.payCount); },
    summary: function(){
      if(!answers.payPlan) return "";
      if(answers.payPlan === "split"){
        return answers.payCount + " payments";
      }
      return PAY_PLANS[answers.payPlan];
    }
  };
})();
