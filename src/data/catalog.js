import fallbackRaces from "./fallback-races.json";
import { NOT_SURE_RACE } from "../config.js";
import { RACES, RACE_DATES } from "../state.js";

/* The race calendar comes from /api/races, which reads the Google Sheet on
   the server. If that is slow or down the form still works: it falls back to
   the snapshot bundled at build time, which is the last calendar committed to
   the repo. A customer never sees an empty race list.

   Each row: { id, name, hubspotName, city, lat, lng, packageStart, packageEnd,
   provisional, order }, with dates as YYYY-MM-DD or null where we hold none
   yet, and hubspotName null where the sheet leaves it blank. */
var TIMEOUT_MS = 6000;

function fetchRaces(){
  var ctrl = typeof AbortController === "function" ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function(){ ctrl.abort(); }, TIMEOUT_MS) : null;
  return fetch("/api/races", {
    headers: { "Accept": "application/json" },
    signal: ctrl ? ctrl.signal : undefined
  }).then(function(res){
    if(!res.ok) throw new Error("status " + res.status);
    return res.json();
  }).then(function(data){
    if(!data || !Array.isArray(data.races) || !data.races.length) throw new Error("no races");
    return data.races;
  }).finally(function(){
    if(timer) clearTimeout(timer);
  });
}

/* "2027-07-16" to the { y, m, d } triple the calendar works in, month
   zero-based. Parsed by hand rather than through Date so it cannot shift a
   day across a timezone. */
function ymd(iso){
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
}

function apply(rows){
  RACES.length = 0;
  Object.keys(RACE_DATES).forEach(function(k){ delete RACE_DATES[k]; });
  rows.slice().sort(function(a, b){ return (a.order || 0) - (b.order || 0); })
    .forEach(function(r){
      RACES.push({ id: r.id, name: r.name, hubspotName: r.hubspotName || null, city: r.city, lat: r.lat, lng: r.lng });
      var from = ymd(r.packageStart), to = ymd(r.packageEnd);
      if(from && to) RACE_DATES[r.id] = { from: from, to: to, provisional: !!r.provisional };
    });
  RACES.push(NOT_SURE_RACE);
}

var loading = null;

/* Resolves once RACES and RACE_DATES are filled, whichever source answered.
   Never rejects. Safe to call more than once. */
export function loadCatalog(){
  if(!loading){
    loading = fetchRaces().catch(function(err){
      console.warn("Race calendar: using the bundled copy (" + err.message + ")");
      return fallbackRaces;
    }).then(apply);
  }
  return loading;
}
