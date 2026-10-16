import { ROOM_BED_MAKEUP, ROOM_MAX, ROOM_PHOTOS, ROOM_TYPES } from "../config.js";
import { $, escapeHtml } from "../dom.js";
import { answers } from "../state.js";
import { refreshNav } from "../wizard.js";

export function roomsTotal(){
  return ROOM_TYPES.reduce(function(n, t){ return n + answers.roomCounts[t]; }, 0);
}

/* "2 x Double, 1 x Twin" - only the types actually asked for. */
export function roomsSummary(sep){
  var parts = [];
  ROOM_TYPES.forEach(function(t){
    var n = answers.roomCounts[t];
    if(n > 0) parts.push(n + " " + (sep || "×") + " " + t);
  });
  return parts.length ? parts.join(", ") : "None";
}

/* ---------- Bed itinerary ----------
   Rooms in, beds out. A double bed sleeps two and a single sleeps one, so the
   head count the rooms will take falls out of the same sum. */
function bedTally(){
  var dbl = 0, sgl = 0;
  ROOM_TYPES.forEach(function(t){
    var n = answers.roomCounts[t], m = ROOM_BED_MAKEUP[t];
    if(!n || !m) return;
    dbl += n * m.dbl;
    sgl += n * m.sgl;
  });
  return { dbl:dbl, sgl:sgl, beds:dbl + sgl, sleeps:dbl * 2 + sgl };
}

function plural(n, one, many){ return n + " " + (n === 1 ? one : many); }

/* The beds one room of this type contains: "1 double bed", "2 single beds",
   "1 double + 1 single". */
function bedsInType(type){
  var m = ROOM_BED_MAKEUP[type];
  if(!m) return "";
  if(m.dbl && m.sgl) return "1 double + 1 single";
  if(m.dbl) return plural(m.dbl, "double bed", "double beds");
  return plural(m.sgl, "single bed", "single beds");
}

/* The same for n rooms of that type: "2 doubles + 2 singles". */
function bedsForRooms(type, n){
  var m = ROOM_BED_MAKEUP[type];
  if(!m || !n) return "";
  var d = n * m.dbl, s = n * m.sgl, bits = [];
  if(d) bits.push(plural(d, "double", "doubles"));
  if(s) bits.push(plural(s, "single", "singles"));
  return bits.join(" + ");
}

/* "3 double beds and 1 single bed" - for the review page and the email. */
export function bedSummary(){
  var t = bedTally();
  if(!t.beds) return "None";
  var bits = [];
  if(t.dbl) bits.push(plural(t.dbl, "double bed", "double beds"));
  if(t.sgl) bits.push(plural(t.sgl, "single bed", "single beds"));
  return bits.join(" and ") + " (sleeps " + t.sleeps + ")";
}

function renderBedPanel(){
  var list = $("bedList"), total = $("bedTotal");
  if(!list || !total) return;
  list.innerHTML = "";
  ROOM_TYPES.forEach(function(type){
    var n = answers.roomCounts[type];
    if(!n) return;
    var li = document.createElement("li");
    var room = document.createElement("span");
    room.className = "bl-room";
    room.textContent = n + " × " + type;
    var beds = document.createElement("span");
    beds.className = "bl-beds";
    beds.textContent = bedsForRooms(type, n);
    li.appendChild(room); li.appendChild(beds);
    list.appendChild(li);
  });
  var t = bedTally();
  var bits = [];
  if(t.dbl) bits.push(plural(t.dbl, "double bed", "double beds"));
  if(t.sgl) bits.push(plural(t.sgl, "single bed", "single beds"));
  total.innerHTML =
    '<span class="bt-key">' + plural(t.beds, "bed", "beds") + ' in total</span>' +
    '<span class="bt-val">' + escapeHtml(bits.join(" · ")) +
    ' <span class="bt-sleeps">· sleeps ' + t.sleeps + '</span></span>';
}

/* One stepper per room type. The floor is one room overall rather than one of
   each type, so the last remaining room cannot be taken away - the minus that
   would empty the booking is disabled, like the adults floor on the previous
   step. */
export function buildRoomRows(){
  var host = $("roomRows");
  if(!host) return;
  var rows = {};
  ROOM_TYPES.forEach(function(type){
    var row = document.createElement("div");
    row.className = "count-row room-row";
    var slug = type.replace(/\s+/g, "-").toLowerCase();

    var shot = document.createElement("img");
    shot.className = "room-thumb";
    shot.alt = "";
    shot.width = 300; shot.height = 200;
    shot.loading = "lazy";
    shot.src = ROOM_PHOTOS[type] || "";

    var text = document.createElement("span");
    text.className = "room-text";

    var label = document.createElement("span");
    label.className = "count-label";
    label.id = "roomLabel-" + slug;
    label.textContent = type;

    var beds = document.createElement("span");
    beds.className = "room-beds";
    beds.textContent = bedsInType(type);
    text.appendChild(label); text.appendChild(beds);

    var stepper = document.createElement("div");
    stepper.className = "stepper";
    stepper.setAttribute("role", "group");
    stepper.setAttribute("aria-labelledby", label.id);

    var minus = document.createElement("button");
    minus.type = "button";
    minus.innerHTML = "&minus;";
    minus.setAttribute("aria-label", "One fewer " + type.toLowerCase() + " room");

    var out = document.createElement("output");
    out.setAttribute("aria-live", "polite");

    var plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "One more " + type.toLowerCase() + " room");

    minus.addEventListener("click", function(){ nudge(type, -1); });
    plus.addEventListener("click", function(){ nudge(type, 1); });

    stepper.appendChild(minus); stepper.appendChild(out); stepper.appendChild(plus);
    row.appendChild(shot); row.appendChild(text); row.appendChild(stepper);
    host.appendChild(row);
    rows[type] = { row:row, out:out, minus:minus, plus:plus };
  });

  function nudge(type, dir){
    var next = answers.roomCounts[type] + dir;
    if(next < 0 || next > ROOM_MAX) return;
    if(dir < 0 && roomsTotal() <= 1) return;
    answers.roomCounts[type] = next;
    sync();
    refreshNav();
  }

  function sync(){
    var total = roomsTotal();
    ROOM_TYPES.forEach(function(type){
      var n = answers.roomCounts[type], r = rows[type];
      r.out.textContent = n;
      r.minus.disabled = (n === 0) || (total <= 1);
      r.plus.disabled = (n >= ROOM_MAX);
      r.row.classList.toggle("is-zero", n === 0);
    });
    var t = $("roomsTotalOut");
    if(t) t.textContent = total + (total === 1 ? " room in total" : " rooms in total");
    renderBedPanel();
  }

  sync();
}
