import { getCountries, getCountryCallingCode, getExampleNumber, parsePhoneNumberFromString } from "libphonenumber-js";
import examples from "libphonenumber-js/mobile/examples";
import { $ } from "../dom.js";
import { answers } from "../state.js";
import { clearError, refreshNav, showError } from "../wizard.js";

/* ---------- Phone ----------
   A country-code menu in front of the number. The number is read against
   the chosen country, so "07400 123456" with +44 and "+44 7400 123456" are
   the same number, and it leaves the form in one format, E.164
   (+447400123456), however it was typed. Only a number that is valid for
   its country passes: that catches a digit short and a wrong country code
   alike. */
export var Phone = (function(){
  /* UK and Ireland first, as the airports are, then every country A-Z. */
  var PINNED = ["GB", "IE"];
  var select, face, input;

  function countryName(code, names){
    try{ return names.of(code) || code; }catch(e){ return code; }
  }

  function addOption(code, label){
    var opt = document.createElement("option");
    opt.value = code;
    opt.textContent = label + " (+" + getCountryCallingCode(code) + ")";
    select.appendChild(opt);
  }

  /* Names come from the browser rather than a list shipped with the page.
     A browser without Intl.DisplayNames shows the two-letter codes. */
  function buildOptions(){
    var names = null;
    try{ names = new Intl.DisplayNames([document.documentElement.lang || "en-GB"], {type:"region"}); }catch(e){}
    var all = getCountries().map(function(code){
      return { code: code, name: names ? countryName(code, names) : code };
    }).sort(function(a, b){ return a.name.localeCompare(b.name); });
    PINNED.forEach(function(code){ addOption(code, names ? countryName(code, names) : code); });
    var rule = document.createElement("option");
    rule.disabled = true;
    rule.textContent = "──────────";
    select.appendChild(rule);
    all.forEach(function(c){ addOption(c.code, c.name); });
  }

  /* The face shows only the code, which keeps the width for the number; the
     invisible select over it carries the full country name for screen
     readers and the open list. The placeholder is a mobile number in that
     country's own national format. */
  function showCountry(){
    var code = answers.phoneCountry;
    if(select.value !== code) select.value = code;
    face.textContent = "+" + getCountryCallingCode(code);
    var example = getExampleNumber(code, examples);
    input.placeholder = example ? example.formatNational() : "";
  }

  /* A number typed with its own international prefix (+353 or 00353) moves
     the menu to match. Only when the calling code differs from the chosen
     one: a UK mobile can belong to Guernsey or Jersey by its range, and the
     menu should not wander off the UK for that. */
  function followTypedCode(){
    var n = parse();
    if(n && n.country && n.countryCallingCode !== getCountryCallingCode(answers.phoneCountry)){
      answers.phoneCountry = n.country;
      showCountry();
    }
  }

  function parse(){
    return parsePhoneNumberFromString(answers.phone, answers.phoneCountry);
  }

  /* The number, if it is a real one for its country, else null. */
  function valid(){
    var n = parse();
    return n && n.isValid() ? n : null;
  }

  return {
    init: function(){
      select = $("phoneCountry");
      face = $("phoneCountryFace");
      input = $("phoneInput");
      if(!select || !face || !input) return;
      buildOptions();
      showCountry();
      select.addEventListener("change", function(){
        answers.phoneCountry = select.value;
        showCountry();
        refreshNav();
        /* The same number can go from wrong to right, or right to wrong,
           with the country alone, so say so either way once there is one. */
        if(answers.phone.trim()) showError("phone");
      });
      input.addEventListener("input", function(){
        answers.phone = input.value;
        followTypedCode();
        refreshNav();
        clearError("phone");
      });
    },
    isValid: function(){ return !!valid(); },
    /* +447400123456 - for the CRM and the email. Blank until the number is
       valid, which the wizard requires before it gets this far. */
    e164: function(){
      var n = valid();
      return n ? n.number : "";
    },
    /* "+44 7400 123456" - for the review page: the same number, readable,
       with the country code the customer may not have typed. */
    summary: function(){
      var n = valid();
      return n ? n.formatInternational() : answers.phone.trim();
    }
  };
})();
