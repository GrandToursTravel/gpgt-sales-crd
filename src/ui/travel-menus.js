import { AIRPORTS, airportLabel, airportPlace } from "../data/airports.js";
import { $ } from "../dom.js";
import { RACES, answers } from "../state.js";
import { makeCombo } from "./combo.js";
import { Globe } from "./globe.js";
import { refreshNav } from "../wizard.js";

export var RaceMenu = makeCombo({
  key: "race",
  inputId: "raceSearch",
  menuId: "raceGrid",
  empty: "No race matches that. Try a country or city.",
  search: function(q){
    q = q.toLowerCase();
    return RACES.filter(function(r){
      return !q || (r.name + " " + r.city).toLowerCase().indexOf(q) !== -1;
    });
  },
  label: function(r){ return r.name; },
  place: function(r){ return r.city; },
  chosen: function(r){ return answers.raceId === r.id; },
  isCurrent: function(v){ return v === answers.race; },
  choose: function(r){
    answers.race = r.name;
    answers.raceId = r.id;
    answers.raceLat = r.lat; answers.raceLng = r.lng;
    Globe.flyTo(r.lat, r.lng, r.name, r.city);
  }
});

/* Ranked rather than just filtered: an exact code match first, then anything
   starting with what was typed, then anything containing it. Typing "man"
   should offer Manchester before Ust-Kamenogorsk, which merely contains it. */
export var DepartMenu = makeCombo({
  key: "depart",
  inputId: "departSearch",
  menuId: "departMenu",
  empty: "No airport matches that. Try a city or a three-letter code.",
  search: function(q){
    q = q.toLowerCase();
    if(!q) return AIRPORTS.slice(0, 60);
    var out = [];
    for(var i=0;i<AIRPORTS.length;i++){
      var a = AIRPORTS[i];
      var code = a.code.toLowerCase();
      var name = a.name.toLowerCase();
      var city = a.city.toLowerCase();
      var country = a.country.toLowerCase();
      var rank = -1;
      if(code === q) rank = 0;
      else if(city.indexOf(q) === 0 || name.indexOf(q) === 0) rank = 1;
      else if(code.indexOf(q) === 0) rank = 2;
      else if(city.indexOf(q) !== -1 || name.indexOf(q) !== -1) rank = 3;
      else if(country.indexOf(q) === 0) rank = 4;
      if(rank >= 0) out.push([rank, i, a]);
      if(out.length > 400) break;
    }
    out.sort(function(x, y){ return x[0] - y[0] || x[1] - y[1]; });
    return out.slice(0, 60).map(function(e){ return e[2]; });
  },
  label: airportLabel,
  place: airportPlace,
  chosen: function(a){ return !!answers.depart && answers.depart.code === a.code; },
  isCurrent: function(v){ return !!answers.depart && v === airportLabel(answers.depart); },
  choose: function(a){
    answers.depart = a;
    answers.ownFlights = false;
    syncOwnFlights();
    Globe.flyRoute(a);
  }
});

/* The opt-out and a chosen airport are the same answer slot, so choosing one
   releases the other. */
function syncOwnFlights(){
  var btn = $("ownFlightsBtn");
  if(btn) btn.setAttribute("aria-pressed", answers.ownFlights ? "true" : "false");
}

export function toggleOwnFlights(){
  answers.ownFlights = !answers.ownFlights;
  if(answers.ownFlights){
    answers.depart = null;
    DepartMenu.clear();
    Globe.showRace();
  }
  syncOwnFlights();
  refreshNav();
}
