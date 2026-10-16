import { $, escapeHtml } from "../dom.js";
import { advance, isValid, refreshNav } from "../wizard.js";

/* The race picker is a combobox: the field opens a menu of every race, typing
   narrows it, and choosing one sends the globe there. */
/* One combobox, used twice. The race picker and the departure picker differ
   only in their data, their empty-state wording and what choosing does, so
   the keyboard handling, the roving aria-activedescendant and the scroll
   tracking live here once rather than in two near-identical copies. */
export function makeCombo(cfg){
  var input, menu, open = false, active = -1, matches = [];

  function optionId(i){ return cfg.key + "-opt-" + i; }

  function render(query){
    matches = cfg.search(query.trim());
    menu.innerHTML = "";
    if(!matches.length){
      var none = document.createElement("div");
      none.className = "race-empty";
      none.textContent = cfg.empty;
      menu.appendChild(none);
      active = -1;
      return;
    }
    matches.forEach(function(item, pos){
      var opt = document.createElement("button");
      opt.type = "button";
      opt.className = "race-option";
      opt.id = optionId(pos);
      opt.setAttribute("role","option");
      opt.setAttribute("aria-selected", cfg.chosen(item) ? "true" : "false");
      opt.innerHTML = '<span class="name">' + escapeHtml(cfg.label(item)) + '</span>' +
                      '<span class="place">' + escapeHtml(cfg.place(item)) + '</span>';
      opt.addEventListener("mousedown", function(ev){ ev.preventDefault(); });
      opt.addEventListener("click", function(){ pick(item); });
      menu.appendChild(opt);
    });
    active = -1;
  }

  function setOpen(state){
    open = state;
    menu.hidden = !state;
    input.setAttribute("aria-expanded", state ? "true" : "false");
    if(!state){
      active = -1;
      input.removeAttribute("aria-activedescendant");
    }
  }

  function highlight(next){
    if(!matches.length) return;
    var els = menu.querySelectorAll(".race-option");
    if(active >= 0 && els[active]) els[active].classList.remove("active");
    active = (next + matches.length) % matches.length;
    var el = els[active];
    if(el){
      el.classList.add("active");
      input.setAttribute("aria-activedescendant", el.id);
      var top = el.offsetTop, bottom = top + el.offsetHeight;
      if(top < menu.scrollTop) menu.scrollTop = top;
      else if(bottom > menu.scrollTop + menu.clientHeight) menu.scrollTop = bottom - menu.clientHeight;
    }
  }

  function pick(item){
    input.value = cfg.label(item);
    cfg.choose(item);
    setOpen(false);
    refreshNav();
  }

  return {
    init: function(){
      input = $(cfg.inputId);
      menu = $(cfg.menuId);
      if(!input || !menu) return;
      render("");
      input.addEventListener("focus", function(){ render(cfg.isCurrent(input.value) ? "" : input.value); setOpen(true); });
      input.addEventListener("click", function(){ if(!open){ render(""); setOpen(true); } });
      input.addEventListener("input", function(){ render(input.value); setOpen(true); });
      input.addEventListener("blur", function(){ setTimeout(function(){ setOpen(false); }, 120); });
      input.addEventListener("keydown", function(ev){
        if(ev.key === "ArrowDown"){ ev.preventDefault(); if(!open){ render(input.value); setOpen(true); } highlight(active + 1); }
        else if(ev.key === "ArrowUp"){ ev.preventDefault(); if(open) highlight(active - 1); }
        else if(ev.key === "Enter"){
          if(open && active >= 0){ ev.preventDefault(); pick(matches[active]); }
          else if(!open && isValid(cfg.key)){ ev.preventDefault(); advance(); }
        }
        else if(ev.key === "Escape"){ if(open){ ev.preventDefault(); setOpen(false); } }
      });
    },
    /* Empty the field and shut the menu, for when the answer is given by
       something other than this combobox. */
    clear: function(){
      if(!input) return;
      input.value = "";
      setOpen(false);
      render("");
    }
  };
}
