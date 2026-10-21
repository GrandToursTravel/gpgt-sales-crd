/* Ad tracking values from the landing URL, sent with the enquiry for HubSpot.

   Last touch: whenever the page opens with any of these in its address, that
   set replaces whatever was kept before, as a whole, so one campaign's
   utm_term never ends up beside another's utm_source. The set is kept in the
   browser for 90 days, Google's window for importing a gclid as a
   conversion, so someone who clicks an ad and comes back later by typing the
   address is still credited to the ad. Storage can be blocked or cleared;
   then only the current address counts. */
var PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "gclid", "hsa_grp"];
var KEY = "gpgt-attribution";
var MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
var MAX_LEN = 500;

var current = {};

function fromAddress(){
  var found = {}, any = false;
  try{
    var query = new URLSearchParams(location.search);
    PARAMS.forEach(function(name){
      var value = (query.get(name) || "").trim().slice(0, MAX_LEN);
      if(value){ found[name] = value; any = true; }
    });
  }catch(e){}
  return any ? found : null;
}

function save(params){
  try{ localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), params: params })); }catch(e){}
}

function saved(){
  try{
    var data = JSON.parse(localStorage.getItem(KEY) || "null");
    if(data && data.params && typeof data.at === "number" && Date.now() - data.at < MAX_AGE_MS) return data.params;
  }catch(e){}
  return {};
}

/* Call once at start-up, before anything can change the address. */
export function captureAttribution(){
  var found = fromAddress();
  if(found){ save(found); current = found; }
  else current = saved();
}

export function attribution(){
  var copy = {};
  PARAMS.forEach(function(name){ if(current[name]) copy[name] = current[name]; });
  return copy;
}
