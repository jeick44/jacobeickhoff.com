/* =================================================================================================
   motion.js - scroll reveals, the Stat Callout counters, and the expand-all control. The site is
   complete without it.

   IT RUNS IN THE HEAD, ON PURPOSE, AND IT IS NOT DEFERRED.
     Its first act is to put `js-motion` on <html>, and that class is what turns the hiding rules
     in site.css ON. Deferred, the class would arrive after first paint and every revealed element
     would flash in and then hide itself. Blocking, the class is there before anything is painted.
     The file is small and same-origin; the paint it delays is a millisecond.

     The ordering also decides what a visitor with no JavaScript sees. No script, no class, no
     hiding rule matches, and the page is simply a page. That is why "no content depends on
     animation to become legible" is a property of the stylesheet rather than a promise about
     this file - and why suites/run.py checks the stylesheet for it.

   THE COUNTER ONLY EVER COUNTS UP TO WHAT IS ALREADY IN THE MARKUP.
     Each .stat__value ships with its final text AND a data-stat-final attribute holding the same
     string. The animation rewrites the text on its way there and writes the attribute's value
     back, verbatim, at the end. So the number never depends on the arithmetic here being right,
     the formatting cannot drift from what was authored, and a script that dies halfway leaves a
     wrong number on screen for one frame rather than forever.

   REDUCED MOTION IS AN EARLY RETURN, NOT A BRANCH PER ANIMATION.
     A visitor who has asked for less motion gets no class, no observers and no counting - the
     finished page, immediately. site.css carries a blanket !important guard as well, because the
     preference can change after load and a stylesheet responds to that where a script does not.
   ============================================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- expand all ----------------------------------------------------------------------------
     THIS RUNS BEFORE THE REDUCED-MOTION RETURN, AND THAT IS THE POINT. Expanding a section is not
     motion, it is a control; a visitor who asked for less motion still wants the button to work.
     Putting it below the early return would have taken the control away from exactly the people
     most likely to be using a keyboard.

     The button ships with `hidden` and is unhidden here, so a visitor with no script never sees a
     control that cannot do anything. The <details> elements underneath work perfectly well one at
     a time without it. suites/run.py fails the run on an expand-all that ships visible. */
  function wireExpandAll() {
    var buttons = document.querySelectorAll("[data-expand-all]");
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        var items = document.querySelectorAll("details");
        if (!items.length) return;
        btn.removeAttribute("hidden");

        /* The label IS the state, derived from the sections rather than toggled. A label that
           flips on click goes stale the moment somebody closes one section by hand, and then it is
           a button that says Collapse and expands.

           The button deliberately carries no aria-expanded: it does not expand ITSELF, it operates
           other elements, and each of those announces its own state because it is a <details>.
           run.py fails the run on an aria-expanded outside a <summary> for that reason. */
        function everyOneOpen() {
          for (var j = 0; j < items.length; j++) {
            if (!items[j].open) return false;
          }
          return true;
        }

        function relabel() {
          btn.textContent = everyOneOpen() ? "Collapse all sections" : "Expand all sections";
        }

        btn.addEventListener("click", function () {
          var open = !everyOneOpen();
          for (var k = 0; k < items.length; k++) {
            items[k].open = open;
          }
          relabel();
        });

        for (var m = 0; m < items.length; m++) {
          items[m].addEventListener("toggle", relabel);
        }
        relabel();
      })(buttons[i]);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireExpandAll);
  } else {
    wireExpandAll();
  }

  if (reduced || !("IntersectionObserver" in window)) {
    return;
  }

  root.classList.add("js-motion");

  /* ---- counting ------------------------------------------------------------------------------
     Only the digits move. Everything else in the string - the comma, a plus sign, a unit glued to
     the number - is left exactly where the author put it, by rebuilding the string from the same
     template on every frame. */
  function digitsOf(s) {
    var n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
    return isFinite(n) ? n : null;
  }

  function group(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function countUp(el, finalText, ms) {
    var target = digitsOf(finalText);
    if (target === null || target === 0) {
      el.textContent = finalText;
      return;
    }
    /* The template is the authored string with its digits replaced by a placeholder, so a value
       like "4,600+" keeps its plus and a value like "9" keeps being a bare 9. */
    var template = finalText.replace(/[0-9][0-9,]*/, "\u0000");
    var started = null;

    function frame(now) {
      if (started === null) started = now;
      var t = Math.min((now - started) / ms, 1);
      /* Ease out: the number decelerates into its final value instead of stopping dead. */
      var eased = 1 - Math.pow(1 - t, 3);
      if (t >= 1) {
        el.textContent = finalText;               // the authored string, byte for byte
        return;
      }
      el.textContent = template.replace("\u0000", group(Math.round(target * eased)));
      window.requestAnimationFrame(frame);
    }

    window.requestAnimationFrame(frame);
  }

  /* ---- reveals -------------------------------------------------------------------------------
     One observer for both jobs. An element is revealed once and then unobserved: re-animating on
     every scroll past is the thing that makes a page feel busy rather than alive. */
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      observer.unobserve(el);
      el.classList.add("is-revealed");
      var value = el.querySelector(".stat__value[data-stat-final]");
      if (value) {
        countUp(value, value.getAttribute("data-stat-final"), 1100);
      }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.2 });

  function start() {
    var targets = document.querySelectorAll(".reveal");
    for (var i = 0; i < targets.length; i++) {
      observer.observe(targets[i]);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
