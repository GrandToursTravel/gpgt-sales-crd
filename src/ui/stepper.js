import { $ } from "../dom.js";
import { answers } from "../state.js";
import { refreshNav } from "../wizard.js";

/* The minus button is disabled at the floor rather than silently ignoring the
   click - a control that does nothing and does not say so reads as broken. */
export function bindStepper(key, min, max, outId, after){
  var el = document.querySelector('.stepper[data-target="'+key+'"]');
  var out = $(outId);
  if(!el || !out) return;
  var btns = el.querySelectorAll("button");
  function sync(){
    out.textContent = answers[key];
    Array.prototype.forEach.call(btns, function(b){
      var d = parseInt(b.dataset.dir, 10);
      var n = answers[key] + d;
      b.disabled = (n < min || n > max);
    });
  }
  Array.prototype.forEach.call(btns, function(btn){
    btn.addEventListener("click", function(){
      var dir = parseInt(btn.dataset.dir, 10);
      var next = answers[key] + dir;
      if(next < min || next > max) return;
      answers[key] = next;
      sync();
      if(after) after();
      refreshNav();
    });
  });
  sync();
}
