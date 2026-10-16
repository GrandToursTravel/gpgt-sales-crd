import { $, escapeHtml } from "../dom.js";
import { RACE_DATES, answers } from "../state.js";

/* ---------- Package dates calendar ----------
   A read-only month: it shows the standard package dates for the chosen race
   and any nights added either side, and nothing on it is clickable. The two
   steppers underneath are the controls - the calendar is the picture of what
   they have chosen, which is why the days are plain text rather than
   buttons. Races we hold no dates for get the steppers on their own, since
   there would be no package window to draw.

   Dates are held as plain Y-M-D triples rather than Date objects, so nothing
   can shift by a day across a timezone. The package dates themselves come
   from the race calendar: see data/catalog.js. */
var MONTH_NAMES = ["January","February","March","April","May","June",
                   "July","August","September","October","November","December"];
var WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export var Cal = (function(){
  var view = null;
  var cal, grids, monthLabel, readout, prevBtn, nextBtn, hint, legend, pair, pending, foot, prov;

  function ymd(d){ return { y:d.getFullYear(), m:d.getMonth(), d:d.getDate() }; }
  function key(v){ return v ? v.y * 10000 + v.m * 100 + v.d : 0; }
  function toDate(v){ return new Date(v.y, v.m, v.d); }
  function addDays(v, n){ var d = toDate(v); d.setDate(d.getDate() + n); return ymd(d); }
  function addMonths(v, n){ return { y:v.y, m:v.m + n, d:1 }; }
  function norm(v){ var d = new Date(v.y, v.m, 1); return { y:d.getFullYear(), m:d.getMonth(), d:1 }; }
  function nights(a, b){ return Math.round((toDate(b) - toDate(a)) / 86400000); }
  function dow(v){ return WEEKDAYS[(toDate(v).getDay() + 6) % 7]; }
  function pretty(v){ return v.d + " " + MONTH_NAMES[v.m] + " " + v.y; }
  function shortish(v){ return v.d + " " + MONTH_NAMES[v.m].slice(0,3); }

  /* "16-21 July 2027", collapsing a repeated month and year. */
  function prettyRange(a, b){
    if(a.y === b.y && a.m === b.m) return a.d + "–" + b.d + " " + MONTH_NAMES[a.m] + " " + a.y;
    if(a.y === b.y) return shortish(a) + " – " + shortish(b) + " " + a.y;
    return pretty(a) + " – " + pretty(b);
  }

  function pkg(){ return RACE_DATES[answers.raceId] || null; }

  /* The whole trip: the package window, opened out by the two steppers. */
  function span(){
    var p = pkg();
    if(!p) return null;
    return {
      from: addDays(p.from, -answers.extraBefore),
      to:   addDays(p.to, answers.extraAfter)
    };
  }

  function monthCells(m){
    var first = new Date(m.y, m.m, 1);
    var lead = (first.getDay() + 6) % 7;                 /* weeks start Monday */
    var start = addDays({ y:m.y, m:m.m, d:1 }, -lead);
    var out = [];
    for(var i = 0; i < 42; i++) out.push(addDays(start, i));
    if(out[35].m !== m.m) out = out.slice(0, 35);
    return out;
  }

  function render(){
    if(!grids) return;
    var p = pkg(), sp = span(), m = norm(view);
    var pFrom = p ? key(p.from) : 0, pTo = p ? key(p.to) : 0;
    var sFrom = sp ? key(sp.from) : 0, sTo = sp ? key(sp.to) : 0;

    monthLabel.textContent = MONTH_NAMES[m.m] + " " + m.y;
    grids.innerHTML = "";

    var grid = document.createElement("div");
    grid.className = "cal-grid";
    grid.setAttribute("role", "table");
    grid.setAttribute("aria-label", "Your dates in " + MONTH_NAMES[m.m] + " " + m.y);

    WEEKDAYS.forEach(function(w){
      var h = document.createElement("span");
      h.className = "cal-wd";
      h.setAttribute("aria-hidden", "true");
      /* Two letters, not one: M T W T F S S has the eye counting to work out
         which T is Thursday. */
      h.textContent = w.slice(0, 2);
      grid.appendChild(h);
    });

    monthCells(m).forEach(function(v){
      var k = key(v), inMonth = (v.m === m.m && v.y === m.y);
      var cell = document.createElement("div");
      cell.className = "cal-cell";

      var inSpan = sFrom && k >= sFrom && k <= sTo;
      var inPkg = p && k >= pFrom && k <= pTo;
      if(inSpan && inMonth){
        cell.classList.add("in-range");
        if(inPkg) cell.classList.add("in-pkg");
        if(k === sFrom) cell.classList.add("edge-start");
        if(k === sTo) cell.classList.add("edge-end");
      }

      var day = document.createElement("span");
      day.className = "cal-day";
      day.textContent = v.d;
      if(!inMonth){ day.style.visibility = "hidden"; }
      else if(k === sFrom || k === sTo){ day.classList.add("picked"); }
      else if(inPkg){ day.classList.add("core"); }
      else if(!inSpan){ day.classList.add("off"); }
      if(inMonth && inSpan){
        day.setAttribute("aria-label",
          pretty(v) + (inPkg ? ", package night" : ", night you have added"));
      }
      cell.appendChild(day);
      grid.appendChild(cell);
    });

    grids.appendChild(grid);

    /* Only offer months the trip actually reaches - and when it fits inside
       one month, take the arrows away rather than leave two dead buttons on
       the page. */
    if(sp){
      var lo = norm(sp.from).y * 12 + norm(sp.from).m;
      var hi = norm(sp.to).y * 12 + norm(sp.to).m;
      var vi = m.y * 12 + m.m;
      var oneMonth = (lo === hi);
      prevBtn.hidden = nextBtn.hidden = oneMonth;
      prevBtn.disabled = vi <= lo;
      nextBtn.disabled = vi >= hi;
    }

    readout.innerHTML = readoutText();
    if(legend) legend.hidden = !(answers.extraBefore || answers.extraAfter);
  }

  function readoutText(){
    var p = pkg(), sp = span();
    if(!p || !sp) return "";
    var n = nights(sp.from, sp.to);
    var line = "<b>" + escapeHtml(prettyRange(sp.from, sp.to)) + "</b> · " +
               n + (n === 1 ? " night" : " nights");
    var b = answers.extraBefore, a = answers.extraAfter;
    if(!b && !a) return line + " · " +
      (p.provisional ? "provisional dates" : "your package dates");
    var bits = [];
    if(b) bits.push(b + (b === 1 ? " night before" : " nights before"));
    if(a) bits.push(a + (a === 1 ? " night after" : " nights after"));
    return line + " · " + bits.join(", ") + " added";
  }

  function step(n){
    var sp = span();
    if(!sp) return;
    var next = norm(addMonths(view, n));
    var ni = next.y * 12 + next.m;
    var lo = norm(sp.from).y * 12 + norm(sp.from).m;
    var hi = norm(sp.to).y * 12 + norm(sp.to).m;
    if(ni < lo || ni > hi) return;
    view = next; render();
  }

  return {
    init: function(){
      cal = $("cal"); grids = $("calGrids"); monthLabel = $("calMonth");
      readout = $("calRead"); prevBtn = $("calPrev"); nextBtn = $("calNext");
      hint = $("calHint"); legend = $("calLegend"); pair = $("nightsPair");
      pending = $("calPending"); foot = $("calFoot"); prov = $("calProv");
      if(!grids) return;
      prevBtn.addEventListener("click", function(){ step(-1); });
      nextBtn.addEventListener("click", function(){ step(1); });
    },
    /* Called on entering the step and after every press of a stepper. */
    sync: function(reopen){
      if(!grids) return;
      var p = pkg(), sp = span();
      if(cal) cal.hidden = false;
      if(!p){
        /* Keep the panel, drop the grid: no dates on file for this race. */
        grids.hidden = true; monthLabel.textContent = "";
        prevBtn.hidden = nextBtn.hidden = true;
        if(legend) legend.hidden = true;
        /* The foot is a rule plus the date readout - with no dates to read
           out it is a rule under nothing, so it goes too. */
        if(foot) foot.hidden = true;
        if(prov) prov.hidden = true;
        if(readout) readout.innerHTML = "";
        if(pending){
          pending.hidden = false;
          pending.innerHTML = "<b>" + escapeHtml(answers.race || "Your race") +
            "</b>We confirm the exact weekend dates when we come back to you. " +
            "Any nights you add below sit either side of the race weekend.";
        }
        if(hint) hint.textContent =
          "Add extra nights either side of the race weekend, if you'd like.";
        return;
      }
      grids.hidden = false;
      if(pending) pending.hidden = true;
      if(foot) foot.hidden = false;
      var window_ = dow(p.from) + " " + shortish(p.from) + " to " +
                    dow(p.to) + " " + shortish(p.to) + " " + p.to.y;
      if(hint) hint.textContent = p.provisional
        ? "We expect the " + (answers.race || "race") + " weekend to run " +
          window_ + ", and will confirm it with you. Add nights either side below."
        : "Your package runs " + window_ + ". Add nights either side below.";
      /* A visible flag on the calendar itself, not just in the sentence above
         it: the grid is the thing that looks authoritative. */
      if(prov) prov.hidden = !p.provisional;
      /* Follow the arrival, so adding nights that spill into the month
         before does not leave the client looking at the wrong page. */
      if(reopen || !view) view = norm(sp.from);
      else {
        var vi = view.y * 12 + view.m;
        var lo = norm(sp.from).y * 12 + norm(sp.from).m;
        var hi = norm(sp.to).y * 12 + norm(sp.to).m;
        if(vi < lo || vi > hi) view = norm(sp.from);
      }
      render();
    },
    summary: function(){
      var p = pkg(), sp = span();
      var b = answers.extraBefore, a = answers.extraAfter;
      function nn(n, side){ return n + (n === 1 ? " night " : " nights ") + side; }
      if(!p){
        if(!b && !a) return "Standard package dates";
        return "Standard package dates plus " +
               (b ? nn(b, "before") : "") + (b && a ? " and " : "") +
               (a ? nn(a, "after") : "");
      }
      var n = nights(sp.from, sp.to);
      var out = prettyRange(sp.from, sp.to) + " (" + n + (n === 1 ? " night)" : " nights)");
      /* Carried into the review page and the enquiry email as well as the
         calendar, so nobody downstream mistakes a placeholder for a booking. */
      var flag = p.provisional ? " - PROVISIONAL, dates to be confirmed" : "";
      if(!b && !a) return out + (p.provisional ? flag : " - standard package dates");
      return out + " - extended by " + (b ? b + " before" : "") +
             (b && a ? " and " : "") + (a ? a + " after" : "") + flag;
    }
  };
})();
