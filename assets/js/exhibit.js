/* =================================================================================================
   exhibit.js - every Exhibit on the site, drawn from its own data table. The page is complete
   without it: the table, the title and the source line are all in the markup.

   THE MARKUP CONTRACT (one component, so adding an Exhibit is a markup edit and not new script)

     <figure class="exhibit" id="exhibit-…"            a page-unique, stable anchor
             data-exhibit="kind"                        which drawing below it is handed to
             data-provenance="published|synthetic|illustrative">
       <div class="exhibit__head">
         <h3 class="exhibit__title"><span class="exhibit__label">Exhibit N</span> The finding</h3>
         <p class="exhibit__instruction">One line saying what to do.</p>
       </div>
       <div class="exhibit__stage" data-stage></div>     empty; this file draws into it
       <details class="exhibit__data">
         <summary>View the data</summary>
         <table>…</table>                              THE data, and the only copy of it
       </details>
       <figcaption class="exhibit__source">Source: <provenance in words>; what is withheld and why.</figcaption>
     </figure>

   THE DATA LIVES IN THE TABLE (ADR-0004).
     A kind is handed its figure, its empty stage and its parsed table, and draws from those. No
     figure a reader sees is typed into this file, so the number on screen, the number a screen
     reader reads, the number that prints and the number suites/banned.py scans are one number.

   CONTROLS ARE BUTTONS, OR THE ONE SHARED SLIDER. No form inputs of any kind: the suite counts
     every input as evidence of a backend and keeps that check without exceptions. Controls are
     created here rather than shipped, so a reader with no script is never shown one that does
     nothing. A mark that leads to another page (the Engagement overview's) is a link, because it
     navigates; what it shows on focus is its readout.

   COMPACT MODE. data-compact on the figure hands the kind { compact: true }: a featured copy of an
     Exhibit (the homepage's) with fewer controls, which still carries the whole contract above and
     its own source line.

   EVERY KIND DECLARES ITS RESULT. The element (or elements) stating what the reader's action
     produced - a count, a total, a date - carries data-result. The harness operates each control the
     way a keyboard does (a button - an action, a toggle with aria-pressed, a segment - is pressed; a
     slider or a draggable mark, role="slider", takes an arrow key; a link, which leads to another
     page, is focused and not followed; a new kind of control is one entry in OPERATORS in
     suites/collect.js) and requires some control to change a result's text.
     A hint that changes while the result stands still is a control wired to nothing, and fails.
     A kind that plays its result through over time marks an element in the figure aria-busy="true"
     while it plays; the harness waits for that to clear before it reads the result a control ends on.
     A kind may also play once on first view; the harness brings each Exhibit into view and waits
     for aria-busy to clear before its first reading, so no reading depends on where a page was
     scrolled.
     A control a state hides (the server, in the local-only view) is shown by operating the others,
     and is then held to the same keyboard checks as the rest.

   TOUCH. Only a draggable mark (the slider) claims the gesture, with touch-action: none. A stage
     leaves panning alone, so a thumb landing on a diagram still scrolls the page.

   NOTHING HERE SCROLLS THE WINDOW. Keeping something in view inside a frame uses that frame's own
     scroll offset. suites/run.py refuses a window scroll in any shipped script, and reads each page's
     scroll position back after scrolling it to be sure.

   REDUCED MOTION shows the final state at once: no staggered delays here, a playback goes straight
     to its last step, and the stylesheet's prefers-reduced-motion blanket collapses every
     transition. suites/run.py reads each Exhibit in a Chrome with reduced motion forced on, and
     fails one whose result, sliders or words are still moving after they are first shown, or
     whose result is not the one the same control ends on, played through, with motion allowed.

   HOVER IS NEVER THE ONLY WAY. A readout a mark shows when hovered is shown when its control is
     focused too. The harness hovers every element of every stage and fails a readout that focus
     does not also show.
   ============================================================================================== */
(function () {
  "use strict";

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var kinds = {};

  function register(kind, draw) {
    kinds[kind] = draw;
  }

  function text(el) {
    return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";
  }

  /* A cell's number, or null when the cell holds words ("No server") rather than a figure. */
  function number(s) {
    var t = s.replace(/,/g, "");
    return /^-?\d+(?:\.\d+)?$/.test(t) ? parseFloat(t) : null;
  }

  /* The figure's table as columns and rows. Each row is its header cell's text, its cells' text,
     and those cells as numbers where they are numbers. */
  function readTable(fig) {
    var out = { columns: [], rows: [] };
    var table = fig.querySelector("table");
    if (!table) return out;
    var heads = table.querySelectorAll("thead th");
    for (var i = 0; i < heads.length; i++) out.columns.push(text(heads[i]));
    var trs = table.querySelectorAll("tbody tr");
    for (var j = 0; j < trs.length; j++) {
      var cells = trs[j].children, row = { label: text(cells[0]), cells: [], values: [] };
      for (var k = 1; k < cells.length; k++) {
        row.cells.push(text(cells[k]));
        row.values.push(number(text(cells[k])));
      }
      out.rows.push(row);
    }
    return out;
  }

  function make(tag, cls, parent, words) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (words != null) n.textContent = words;
    if (parent) parent.appendChild(n);
    return n;
  }

  /* A real <button>. A toggle or a segment carries aria-pressed; a plain action does not. */
  function button(parent, cls, words, pressed) {
    var b = make("button", cls, parent, words);
    b.type = "button";
    if (pressed != null) b.setAttribute("aria-pressed", String(!!pressed));
    return b;
  }

  /* ---- THE SHARED SLIDER ------------------------------------------------------------------------
     For every continuous value on the site. role="slider" with its range, value and value text
     announced; arrows step, Page Up and Page Down step by a tenth, Home and End go to the ends; a
     pointer can press anywhere on the track and drag. It is the one mark allowed to claim a touch
     gesture, and it says so with touch-action: none in the stylesheet.

       slider(host, { min, max, step, value, label, valueText: function (v) {…}, onChange,
                      visibleLabel, showValue, mark, pointerValue })

     visibleLabel writes the slider's name before it for a sighted reader, hidden from a screen
     reader (the slider announces its own), and showValue follows it with the current value. A
     labelled slider takes the shared row layout (.exhibit__slider-label + .slider).
     mark makes an element the kind has drawn (a draggable point in a chart) the slider instead of a
     track: the same role, keys and announcements, with pointerValue(event) saying what value a
     pointer at that place means, and onChange moving the mark. host is then unused. A mark has no
     track to measure a pointer against, so it must bring its own pointerValue.  */
  function slider(host, o) {
    if (o.mark && !o.pointerValue) throw new Error("slider: a mark needs pointerValue to read a pointer");
    var min = o.min, max = o.max, step = o.step || 1, value = null, shownValue = null;
    if (o.visibleLabel && !o.mark) {
      var named = make("span", "exhibit__slider-label", host, o.visibleLabel);
      named.setAttribute("aria-hidden", "true");
      if (o.showValue) {
        named.appendChild(document.createTextNode(": "));
        shownValue = make("b", "", named);
      }
    }
    var el = o.mark || make("div", "slider", host), track = null, fill = null, thumb = null;
    el.setAttribute("role", "slider");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", o.label);
    el.setAttribute("aria-valuemin", String(min));
    el.setAttribute("aria-valuemax", String(max));
    if (!o.mark) {
      track = make("span", "slider__track", el);
      track.setAttribute("aria-hidden", "true");
      fill = make("span", "slider__fill", track);
      thumb = make("span", "slider__thumb", track);
    }

    function set(v, quiet) {
      v = Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step));
      v = +v.toFixed(6);
      if (v === value) return;
      value = v;
      el.setAttribute("aria-valuenow", String(v));
      el.setAttribute("aria-valuetext", o.valueText ? o.valueText(v) : String(v));
      if (shownValue) shownValue.textContent = String(v);
      if (fill) {
        var pct = max > min ? (v - min) / (max - min) * 100 : 0;
        fill.style.width = pct + "%";
        thumb.style.left = pct + "%";
      }
      if (!quiet && o.onChange) o.onChange(v);
    }

    el.addEventListener("keydown", function (e) {
      var big = Math.max(step, (max - min) / 10), next = null;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") next = value + step;
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = value - step;
      else if (e.key === "PageUp") next = value + big;
      else if (e.key === "PageDown") next = value - big;
      else if (e.key === "Home") next = min;
      else if (e.key === "End") next = max;
      if (next === null) return;
      e.preventDefault();
      set(next);
    });

    var dragging = false;
    function fromPointer(e) {
      if (o.pointerValue) {
        var at = o.pointerValue(e);
        if (at !== null) set(at);
        return;
      }
      var r = track.getBoundingClientRect();
      if (r.width > 0) set(min + (e.clientX - r.left) / r.width * (max - min));
    }
    el.addEventListener("pointerdown", function (e) {
      dragging = true;
      /* Capture keeps the drag alive when the pointer leaves the track. It can refuse a pointer it
         does not consider active, and a drag without capture still works while over the track. */
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* see above */ }
      fromPointer(e);
    });
    el.addEventListener("pointermove", function (e) {
      if (dragging) fromPointer(e);
    });
    function stop() { dragging = false; }
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);

    set(o.value, true);
    return { el: el, get: function () { return value; }, set: set };
  }

  /* ---- mounting --------------------------------------------------------------------------------
     A kind that throws leaves its stage empty, so the reader still has the table, the title and the
     source line - and the other Exhibits on the page still draw. */
  function mount(fig) {
    var draw = kinds[fig.getAttribute("data-exhibit")];
    var stage = fig.querySelector("[data-stage]");
    if (!draw || !stage || stage.children.length) return;
    try {
      draw(fig, stage, readTable(fig), { compact: fig.hasAttribute("data-compact") });
    } catch (e) {
      stage.textContent = "";
      if (window.console) window.console.error(e);
    }
  }

  function init() {
    var figs = document.querySelectorAll("figure[data-exhibit]");
    for (var i = 0; i < figs.length; i++) mount(figs[i]);
  }

  /* ---- KIND: blast-radius ----------------------------------------------------------------------
     The table lists each machine and, per architecture (one column each), how many customer files
     compromising it exposes. A machine with a figure in every column is a workstation, and its
     first figure is the group of files it can open. A machine with words where a figure would be
     does not exist in that architecture: that is the central server, drawn between the
     workstations and the files only where it exists.

     The drawing can only show a table that agrees with it, so a table that does not is refused
     (the stage stays empty and the table stands alone): a workstation exposes its own group in
     every architecture, and a server, where it exists, exposes every file on the shelf. */
  register("blast-radius", function (fig, stage, data) {
    var modes = data.columns.slice(1);
    var stations = [], hubs = [];
    data.rows.forEach(function (r) {
      (r.values.every(function (v) { return v !== null; }) ? stations : hubs).push(r);
    });
    if (!modes.length || !stations.length) throw new Error("blast-radius: the table has no machines");
    var total = stations.reduce(function (s, r) { return s + r.values[0]; }, 0);
    stations.forEach(function (r) {
      r.values.forEach(function (v, m) {
        if (v !== r.values[0]) {
          throw new Error("blast-radius: " + r.label + " exposes " + v + " under " + modes[m] +
                          " but its group on the shelf is " + r.values[0]);
        }
      });
    });
    hubs.forEach(function (r) {
      r.values.forEach(function (v, m) {
        if (v !== null && v !== total) {
          throw new Error("blast-radius: " + r.label + " exposes " + v + " under " + modes[m] +
                          " but the workstations' groups add up to " + total);
        }
      });
    });
    var mode = 0, compromised = null;

    var bar = make("div", "exhibit__controls", stage);
    var modeGroup = make("div", "seg", bar);
    modeGroup.setAttribute("role", "group");
    modeGroup.setAttribute("aria-label", "Architecture");
    var modeButtons = modes.map(function (name, i) {
      return operates(button(modeGroup, "seg__option", name, i === 0), function () {
        mode = i;
        if (compromised && compromised.values[mode] === null) compromised = null;
      });
    });

    var frame = make("div", "exhibit__frame", stage);
    var diagram = make("div", "blast", frame);
    diagram.style.setProperty("--blast-columns", String(stations.length));
    var stationRow = make("div", "blast__machines", diagram);
    var stationButtons = stations.map(function (r) { return machine(stationRow, r, ""); });
    var links = make("div", "blast__links", diagram);
    /* Parsed as markup so the browser supplies the SVG namespace. The lines are drawn in a box one
       hundred units per workstation wide and stretched to the row, so each column's centre is at a
       round number and the lines meet the buttons above and the files below. */
    var width = 100 * stations.length;
    links.innerHTML = '<svg viewBox="0 0 ' + width + ' 100" preserveAspectRatio="none" ' +
      'aria-hidden="true" focusable="false"></svg>';
    var svg = links.firstChild;
    var hubButtons = hubs.map(function (r) { return machine(links, r, " blast__machine--hub"); });
    var shelf = make("div", "blast__files", diagram);
    shelf.setAttribute("aria-hidden", "true");
    var files = [];
    stations.forEach(function (r, i) {
      var group = make("div", "blast__group", shelf);
      for (var k = 0; k < r.values[0]; k++) {
        files.push({ owner: i, pos: k, el: make("span", "blast__file", group) });
      }
    });
    make("p", "blast__shelf", diagram,
         "Customer files on the shared drive; each analyst can open their own group");

    var readout = make("div", "exhibit__readout", stage);
    readout.setAttribute("aria-live", "polite");
    var line = make("p", "exhibit__count", readout);
    var count = make("b", "", line);
    count.setAttribute("data-result", "");
    line.appendChild(document.createTextNode(" of " + total + " customer files exposed"));
    var note = make("p", "exhibit__note", readout);

    /* Wires a button: pressing it acts on the state, then redraws everything from the state. */
    function operates(b, act) {
      b.addEventListener("click", function () { act(); update(); });
      return b;
    }

    function machine(parent, row, extra) {
      var b = button(parent, "blast__machine" + extra, null, false);
      make("span", "visually-hidden", b, "Compromise ");
      make("span", "blast__name", b, row.label);
      make("span", "blast__tag", b, "Compromised").setAttribute("aria-hidden", "true");
      return operates(b, function () { compromised = compromised === row ? null : row; });
    }

    function path(d, hot, dashed) {
      return '<path d="' + d + '" vector-effect="non-scaling-stroke"' +
        ' class="blast__link' + (hot ? " is-hot" : "") + (dashed ? " is-dashed" : "") + '"/>';
    }

    function update() {
      var hub = hubs.filter(function (r) { return r.values[mode] !== null; })[0] || null;
      /* Which workstation is compromised, or -1 for none or the server. */
      var station = stations.indexOf(compromised);
      var cx = width / 2, d = "";
      modeButtons.forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === mode)); });
      stationButtons.forEach(function (b, i) { b.setAttribute("aria-pressed", String(compromised === stations[i])); });
      hubButtons.forEach(function (b, i) {
        b.hidden = hubs[i].values[mode] === null;
        b.setAttribute("aria-pressed", String(compromised === hubs[i]));
      });

      stations.forEach(function (r, i) {
        var x = 100 * i + 50;
        if (!hub) {
          d += path("M" + x + " 0 V100", compromised === r);
        } else {
          d += path("M" + x + " 0 C " + x + " 22, " + cx + " 14, " + cx + " 30", compromised === r);
          d += path("M" + cx + " 70 C " + cx + " 86, " + x + " 78, " + x + " 100", compromised === hub, true);
        }
      });
      svg.innerHTML = d;

      /* A workstation lights its own group, one file after another; the server lights the whole
         shelf, faster, because there is more of it. */
      var exposed = compromised ? compromised.values[mode] : 0;
      files.forEach(function (f, k) {
        var lit = station >= 0 ? f.owner === station : k < exposed;
        var delay = station >= 0 ? f.pos * 30 : k * 12;
        f.el.classList.toggle("is-exposed", lit);
        f.el.style.transitionDelay = lit && !reduced ? delay + "ms" : "0ms";
      });
      count.textContent = String(exposed);
      readout.classList.toggle("is-hot", exposed > 0);
      if (compromised === null) {
        note.textContent = hub ? "Select a workstation, or the " + hub.label.toLowerCase() + "."
                               : "Select a workstation to compromise it.";
      } else if (station < 0) {
        note.textContent = "Its service account has to read every file, and bypasses the share’s permissions by design.";
      } else {
        note.textContent = "It yields only what that analyst could already open from the share.";
      }
    }

    update();
  });

  /* ---- KIND: three-stage ----------------------------------------------------------------------
     A swimlane of one file worked two ways. The table lists each piece of work on the file: its
     part, its kind of work, the number of the question it raises that only the lender can answer (or
     words, where it raises none), and then one column per process giving the step at which that
     process does it. Everything drawn and counted comes from those rows.

     Which process holds its questions is read from the table too: a process that does each kind of
     work in one unbroken run is working in stages, so a question is marked where it arises and every
     one is asked in a single call once the file is done. A process that returns to a kind of work
     after leaving it is interleaved, and each question is a call when it arises.

     A table the drawing cannot show is refused (the stage stays empty and the table stands alone): a
     process column that is not each step from one to the last exactly once, questions not numbered
     one to the last exactly once, or more kinds of work than the palette has colours.

     The first process plays through once, the first time the lanes come into view (spec: entrance
     motion runs once, on first view), marking the readout aria-busy while it plays; the harness
     brings each Exhibit into view and waits for that to clear before it reads. Choosing a process -
     the one already chosen too - or Replay plays the file from the start; reduced motion shows the
     finished file at once and never plays. */
  register("three-stage", function (fig, stage, data) {
    var procs = data.columns.slice(3), rows = data.rows, n = rows.length;
    var PALETTE = 4;
    if (!procs.length || !n) throw new Error("three-stage: the table has no processes or no work");
    var kinds = [];
    rows.forEach(function (r) { if (kinds.indexOf(r.cells[0]) < 0) kinds.push(r.cells[0]); });
    if (kinds.length > PALETTE) throw new Error("three-stage: more kinds of work than colours");
    var asked = rows.map(function (r) { return r.values[1]; }).filter(function (q) { return q !== null; });
    asked.slice().sort(function (a, b) { return a - b; }).forEach(function (q, i) {
      if (q !== i + 1) throw new Error("three-stage: the questions are not numbered 1 to " + asked.length);
    });

    /* Each process as its sequence of rows, in the order it does them. */
    var orders = procs.map(function (name, p) {
      var seq = [];
      rows.forEach(function (r) {
        var at = r.values[2 + p];
        if (at === null || at < 1 || at > n || seq[at - 1]) {
          throw new Error("three-stage: under " + name + ", " + r.label + " is not given a step of its own");
        }
        seq[at - 1] = r;
      });
      var runs = 0;
      seq.forEach(function (r, i) { if (!i || r.cells[0] !== seq[i - 1].cells[0]) runs++; });
      return { name: name, seq: seq, staged: runs === kinds.length };
    });
    var proc = 0, raf = null;

    var bar = make("div", "exhibit__controls lanes__controls", stage);
    /* Choosing a process plays it from the start - the one already chosen too, as a replay. */
    var procs = segmented(bar, "Process", orders.map(function (o) { return o.name; }), function (i) {
      proc = i;
      build();
      play();
    });
    var keys = make("div", "lanes__keys", bar);
    var legend = make("ul", "lanes__legend", keys);
    legend.setAttribute("aria-hidden", "true");
    kinds.forEach(function (k, i) {
      var li = make("li", "", legend, k);
      li.style.setProperty("--kind", "var(--data-" + (i + 1) + ")");
    });
    /* Play from the start: a triangle, named for assistive technology. */
    var again = button(keys, "lanes__play", "");
    again.setAttribute("aria-label", "Replay");
    again.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
    again.addEventListener("click", play);

    /* The swimlane, drawn in a fixed box and scaled to the frame; below a readable width it keeps
       that width and scrolls inside the frame. One picture with one name: the readout below and the
       table carry every figure in it. A block per step, coloured by its kind of work, along the
       analyst's lane; the lender's lane beneath. A playhead sweeps the file from start to committee,
       and each question flag and each call is faint until the playhead reaches it. */
    var W = 640, H = 214, L = 92, R = 626, LANE_A = 52, LANE_L = 150, unit = (R - L) / (n + 1);
    var frame = make("div", "exhibit__frame", stage);
    frame.innerHTML = '<svg class="lanes" viewBox="0 0 ' + W + " " + H + '" role="img" ' +
      'aria-label="Swimlane of one analyst and one lender over a single file."></svg>';
    var svg = frame.firstChild;
    function draw(tag, attrs, parent, words) {
      var e = document.createElementNS(svg.namespaceURI, tag);
      for (var a in attrs) e.setAttribute(a, attrs[a]);
      if (words != null) e.textContent = words;
      (parent || svg).appendChild(e);
      return e;
    }
    var arrow = "lanes-arrow-" + (fig.id || "x");
    var marker = draw("marker", { id: arrow, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6,
                                  markerHeight: 6, orient: "auto" }, draw("defs", {}));
    draw("path", { d: "M0 0 L10 5 L0 10z", "class": "lanes__head" }, marker);
    draw("text", { x: 0, y: LANE_A + 5, "class": "lanes__who" }, null, "Analyst");
    draw("text", { x: 0, y: LANE_L + 5, "class": "lanes__who" }, null, "Lender");
    draw("line", { x1: L, x2: R, y1: LANE_L, y2: LANE_L, "class": "lanes__track" });
    var gBlocks = draw("g", {}), gMarks = draw("g", {});
    var head = draw("line", { x1: L, x2: L, y1: 20, y2: H - 20, "class": "lanes__playhead" });
    var headDot = draw("circle", { cx: L, cy: 20, r: 4, "class": "lanes__playdot" });
    draw("text", { x: L, y: H - 4, "class": "lanes__mark" }, null, "Start of file");
    draw("text", { x: R, y: H - 4, "class": "lanes__mark", "text-anchor": "end" }, null, "To committee");

    /* A call: an arrow from the analyst's lane down to a pill on the lender's. */
    function call(g, x, words, wide) {
      draw("path", { d: "M" + x + " " + (LANE_A + 16) + " V" + (LANE_L - 12), "class": "lanes__arrow",
                     "marker-end": "url(#" + arrow + ")" }, g);
      draw("rect", { x: x - wide / 2, y: LANE_L - 9, width: wide, height: 18, rx: 9, "class": "lanes__pill" }, g);
      draw("text", { x: x, y: LANE_L + 4, "class": "lanes__pill-words" }, g, words);
    }

    var marks = [];
    function build() {
      var o = orders[proc];
      gBlocks.textContent = "";
      gMarks.textContent = "";
      marks = [];
      o.seq.forEach(function (r, i) {
        var b = draw("rect", { x: L + i * unit + 1, y: LANE_A - 14, width: unit - 2, height: 28, rx: 3,
                               "class": "lanes__block" }, gBlocks);
        b.style.setProperty("--kind", "var(--data-" + (kinds.indexOf(r.cells[0]) + 1) + ")");
        if (r.values[1] === null) return;
        /* A question, at the end of the piece of work that raises it: interleaved, it is a call there
           and then; staged, it is flagged there and held. */
        var x = L + (i + 1) * unit - 1, g = draw("g", { "class": "lanes__faint" }, gMarks);
        if (o.staged) {
          draw("path", { d: "M" + (x - 4) + " " + (LANE_A - 26) + " V" + (LANE_A - 16) + " M" + (x - 4) + " " +
                             (LANE_A - 26) + " h9 l-2.5 3 l2.5 3 h-9", "class": "lanes__flag" }, g);
        } else {
          call(g, x, "call", 22);
        }
        marks.push({ x: x, g: g, call: !o.staged });
      });
      if (o.staged && asked.length) {
        /* Every question held to the end of the file, and asked in one call. */
        var xEnd = L + n * unit + unit / 2, end = draw("g", { "class": "lanes__faint" }, gMarks);
        call(end, xEnd, "1 call", 44);
        draw("text", { x: xEnd, y: LANE_A + 4, "class": "lanes__held" }, end,
             asked.length + (asked.length === 1 ? " Q" : " Qs"));
        marks.push({ x: xEnd, g: end, call: true });
      }
    }

    var readout = make("div", "exhibit__readout lanes__tally", stage);
    readout.setAttribute("aria-live", "polite");
    /* Each count with its words, singular and plural, so one call never reads as "1 calls". */
    var tally = [["question only the lender can answer", "questions only the lender can answer"],
                 ["call to the lender", "calls to the lender"],
                 ["switch between kinds of work", "switches between kinds of work"]].map(function (words) {
      var line = make("p", "exhibit__count", readout);
      var b = make("b", "", line);
      b.setAttribute("data-result", "");
      return { count: b, words: line.appendChild(document.createTextNode("")), forms: words };
    });

    /* The file with the playhead at pos, from 0 (the start) to 1 (to committee). A mark counts once
       the playhead has reached it; a switch counts once the playhead has passed both its blocks. */
    function at(pos) {
      var o = orders[proc], x = L + (R - L) * pos, q = 0, called = 0, switched = 0;
      procs.press(proc);
      head.setAttribute("x1", x);
      head.setAttribute("x2", x);
      headDot.setAttribute("cx", x);
      marks.forEach(function (m) {
        var on = x >= m.x;
        m.g.classList.toggle("lanes__faint", !on);
        if (on && m.call) called++;
        if (on && !m.call) q++;
      });
      if (!o.staged) q = called;
      var passed = Math.floor((x - L) / unit);
      for (var i = 1; i <= Math.min(passed, n - 1); i++) if (o.seq[i].cells[0] !== o.seq[i - 1].cells[0]) switched++;
      [q, called, switched].forEach(function (v, k) {
        tally[k].count.textContent = String(v);
        tally[k].words.nodeValue = " " + tally[k].forms[v === 1 ? 0 : 1];
      });
    }

    function stop() {
      if (raf !== null) window.cancelAnimationFrame(raf);
      raf = null;
      readout.removeAttribute("aria-busy");
    }

    /* From the start of the file to committee in one sweep; at once under reduced motion. */
    var SWEEP_MS = 4200;
    function play() {
      stop();
      if (reduced) return at(1);
      var t0 = null;
      readout.setAttribute("aria-busy", "true");
      at(0);
      raf = window.requestAnimationFrame(function tick(t) {
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / SWEEP_MS);
        at(k);
        if (k < 1) raf = window.requestAnimationFrame(tick); else stop();
      });
    }

    /* The file plays once, the first time the lanes come into view. Until then it stands at the
       start; under reduced motion it stands finished. */
    build();
    at(reduced ? 1 : 0);
    if (!reduced) {
      if (!("IntersectionObserver" in window)) {
        play();
      } else {
        var seen = new window.IntersectionObserver(function (es) {
          es.forEach(function (e) {
            if (e.isIntersecting) { seen.disconnect(); play(); }
          });
        }, { threshold: 0.3 });
        seen.observe(svg);
      }
    }
  });

  /* ---- KIND: detect-correct-flag ---------------------------------------------------------------
     One raw export run through the preparation tool. The table lists each line of the export as it
     arrived, cell by cell ("Blank" where the cell was empty), then, for each column the tool checks,
     what it made of that cell in a column named "<column>, prepared", and why. A prepared cell says
     "Unchanged", "Left empty", "Line removed" (a line that is not a record, such as a title row
     above the headers) or the corrected value. The export's header row is the table's own header,
     and the one line number the table has no row for.

     The tool's standing rule is read back from the table rather than trusted to it, so a table that
     breaks the rule is refused (the stage stays empty and the table stands alone):
       - a cell holding nothing is missing: filled from elsewhere, or left empty - never guessed;
       - a full date of birth (year first) in a column of ages is converted to the age on the date
         the export was run, which the removed title line states;
       - a date whose year has two digits could be either century, so it is left empty;
       - a cell that is none of these is left unchanged, and every changed line says why.
     Only those corrections are applied, and every one is counted and flagged on screen, with its
     reason on hover and on focus. */
  register("detect-correct-flag", function (fig, stage, data) {
    var BLANK = "Blank", SAME = "Unchanged", EMPTY = "Left empty", GONE = "Line removed";
    var why = data.columns.indexOf("Why") - 1;
    var fields = [];
    data.columns.slice(1).forEach(function (name, k) {
      if (k === why || / prepared$/.test(name)) return;
      fields.push({ name: name, at: k, prepared: data.columns.indexOf(name + ", prepared") - 1 });
    });
    if (why < 0 || !data.rows.length || !fields.some(function (f) { return f.prepared >= 0; })) {
      throw new Error("detect-correct-flag: the table has no prepared columns or no reasons");
    }

    function isoDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }
    function shortYear(s) { return /^\d{1,2}\/\d{1,2}\/\d{2}$/.test(s); }
    function ageOn(born, on) {
      var b = born.split("-").map(Number), o = on.split("-").map(Number);
      return o[0] - b[0] - (o[1] < b[1] || (o[1] === b[1] && o[2] < b[2]) ? 1 : 0);
    }

    /* The export's own date, from the line the tool removes. */
    var ranOn = null;
    data.rows.forEach(function (r) {
      if (ranOn === null && r.cells.indexOf(GONE) >= 0) {
        r.cells.forEach(function (c) { var m = /\d{4}-\d{2}-\d{2}/.exec(c); if (m && ranOn === null) ranOn = m[0]; });
      }
    });

    /* Each line: its cells, and for each checked cell what was detected and what the tool did. */
    var lines = data.rows.map(function (r) {
      var reason = r.cells[why], removed = r.cells.indexOf(GONE) >= 0, changed = removed;
      var cells = fields.map(function (f) {
        var raw = r.cells[f.at], done = f.prepared >= 0 ? r.cells[f.prepared] : SAME;
        var cell = { field: f.name, raw: raw === BLANK ? "" : raw, done: done, detected: null };
        if (removed) {
          if (f.prepared >= 0 && done !== GONE) throw new Error("detect-correct-flag: line " + r.label + " is removed in one column only");
          return cell;
        }
        if (f.prepared < 0) return cell;
        if (done === GONE) throw new Error("detect-correct-flag: line " + r.label + " is removed in one column only");
        if (raw === BLANK) {
          cell.detected = "missing";
          if (done === SAME) throw new Error("detect-correct-flag: line " + r.label + " leaves a missing " + f.name + " unmarked");
        } else if (isoDate(raw)) {
          cell.detected = "a date of birth";
          if (!ranOn || done !== String(ageOn(raw, ranOn))) {
            throw new Error("detect-correct-flag: line " + r.label + " converts " + raw + " to " + done);
          }
        } else if (shortYear(raw)) {
          cell.detected = "a date with a two-digit year";
          if (done !== EMPTY) throw new Error("detect-correct-flag: line " + r.label + " guesses a century for " + raw);
        } else if (done !== SAME) {
          throw new Error("detect-correct-flag: line " + r.label + " changes a " + f.name + " nothing was wrong with");
        }
        if (done !== SAME) changed = true;
        return cell;
      });
      if (changed !== (reason !== "" && reason !== "None")) {
        throw new Error("detect-correct-flag: line " + r.label + (changed ? " changes a cell and says nothing" : " gives a reason for no change"));
      }
      return { label: r.label, removed: removed, reason: reason, cells: cells };
    });

    var prepared = false;
    var bar = make("div", "exhibit__controls", stage);
    var views = segmented(bar, "Export", ["Raw export", "Prepared"], function (i) {
      prepared = i === 1;
      update();
    });

    /* Above the preview: what was detected, what was corrected, what was left empty. */
    var readout = make("div", "exhibit__readout prep__tally", stage);
    readout.setAttribute("aria-live", "polite");
    var tally = [["anomaly detected", "anomalies detected"],
                 ["correction, flagged", "corrections, each flagged"],
                 ["cell left empty", "cells left empty"]].map(function (words) {
      var line = make("p", "exhibit__count", readout);
      var b = make("b", "", line);
      b.setAttribute("data-result", "");
      return { count: b, words: line.appendChild(document.createTextNode("")), forms: words };
    });

    /* The preview: one row per line of the export, the header row in its place. A flagged cell is a
       button, so the keyboard reaches its reason; hovering it shows the same reason. */
    var frame = make("div", "exhibit__frame", stage);
    var grid = make("div", "prep", frame);
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "Preview of the export");
    grid.style.setProperty("--prep-columns", String(fields.length));
    /* The header row is the one line of the export the table has no row for. */
    var headAt = 1, headLine = null;
    while (lines.some(function (ln) { return Number(ln.label) === headAt; })) headAt++;
    function header() {
      headLine = make("div", "prep__row prep__row--head", grid);
      make("span", "prep__line", headLine, String(headAt));
      fields.forEach(function (f) { make("span", "prep__cell", headLine, f.name); });
    }

    var note = make("p", "exhibit__note prep__why", stage);
    var flags = [], reasons = [], busy = null;
    function hint() {
      note.textContent = prepared ? "Hover or focus a flagged cell to read why it changed."
                                  : "Hover or focus a flagged cell to see what the tool detected.";
    }
    function flag(el, say) {
      var show = function () { note.textContent = say(); };
      ["mouseover", "focus"].forEach(function (t) { el.addEventListener(t, show); });
      el.addEventListener("blur", hint);
      /* The pointer leaving a cell hands the line back to whichever cell has focus. */
      el.addEventListener("mouseout", function () {
        var at = flags.indexOf(document.activeElement);
        if (at < 0) hint(); else reasons[at]();
      });
      el.addEventListener("click", show);
      flags.push(el);
      reasons.push(show);
      return el;
    }

    lines.forEach(function (ln) {
      if (!headLine && Number(ln.label) > headAt) header();
      var row = make("div", "prep__row", grid);
      make("span", "prep__line", row, ln.label);
      if (ln.removed) {
        var title = ln.cells.map(function (c) { return c.raw; }).filter(Boolean).join(" ");
        var t = flag(button(row, "prep__cell prep__cell--title"), function () {
          return prepared ? "Line " + ln.label + ", removed: " + ln.reason
                          : "Line " + ln.label + ": a line above the headers that is not a record.";
        });
        make("span", "visually-hidden", t, "Line " + ln.label + ": ");
        make("span", "prep__value", t, title);
        make("span", "prep__tag", t, "Removed");
        ln.els = [{ el: t, cell: { detected: "title", done: GONE } }];
        return;
      }
      ln.els = ln.cells.map(function (c) {
        if (!c.detected) return { el: make("span", "prep__cell", row, c.raw), cell: c };
        var b = flag(button(row, "prep__cell prep__cell--flag"), function () {
          return prepared ? "Line " + ln.label + ", " + c.field + ": " + ln.reason
                          : "Line " + ln.label + ", " + c.field + ": " + c.detected + ". Not yet corrected.";
        });
        make("span", "visually-hidden", b, "Line " + ln.label + ", " + c.field + ": ");
        return { el: b, cell: c, value: make("span", "prep__value", b, "") };
      });
    });
    if (!headLine) header();

    function update() {
      var detected = 0, corrected = 0, empty = 0, order = 0;
      views.press(prepared ? 1 : 0);
      lines.forEach(function (ln) {
        ln.els.forEach(function (e) {
          var c = e.cell;
          if (!c.detected) return;
          detected++;
          var state = !prepared ? "is-detected" : c.done === EMPTY ? "is-empty" : "is-corrected";
          if (prepared && state === "is-corrected") corrected++;
          if (prepared && state === "is-empty") empty++;
          ["is-detected", "is-empty", "is-corrected"].forEach(function (s) { e.el.classList.toggle(s, s === state); });
          e.el.style.transitionDelay = prepared && !reduced ? order++ * 90 + "ms" : "0ms";
          if (e.value) {
            e.value.textContent = !prepared ? (c.raw || "blank") : c.done === EMPTY ? "empty" : c.done;
            e.value.classList.toggle("is-none", !prepared ? !c.raw : c.done === EMPTY);
          }
        });
      });
      [detected, corrected, empty].forEach(function (v, k) {
        tally[k].count.textContent = String(v);
        tally[k].words.nodeValue = " " + tally[k].forms[v === 1 ? 0 : 1];
      });
      hint();
      /* The flags light one after another; the readout is busy until the last has. */
      window.clearTimeout(busy);
      readout.removeAttribute("aria-busy");
      if (order) {
        readout.setAttribute("aria-busy", "true");
        busy = window.setTimeout(function () { readout.removeAttribute("aria-busy"); }, order * 90 + 200);
      }
    }

    update();
  });

  /* ---- KIND: triage ------------------------------------------------------------------------------
     Three returns handed to the tax-document tool, one column each. The table's first row says what
     the tool finds in each document and its second the answer it gives; its last two rows are the
     cash available for debt service and the debt-service coverage it produces; every row between is
     one line of the income statement. A line's cell is its amount ("−$171,900"), "Not read", or an
     amount held for review under the words the tool could read instead of a label
     ("Line 19 — description unreadable: $18,450, held for review").

     The tool's rule is that a wrong number costs more than a missing one, and the kind reads it back
     from each column, refusing a table that breaks it (the stage stays empty and the table stands
     alone):
       - a document the tool cannot read is refused whole: every line not read, no total, no
         coverage, and an answer that says it refused. A figure read from part of it is a guess;
       - a line held for review holds the total and the coverage with it: neither is a figure, and
         the answer says a line is held;
       - a document read in full adds up: the total is its lines' sum, and the coverage is a ratio.
     Choosing a document shows its answer at once; nothing plays, so reduced motion changes nothing. */
  register("triage", function (fig, stage, data) {
    var NOT_READ = "Not read";
    var docs = data.columns.slice(1);
    var rows = data.rows;
    if (!docs.length || rows.length < 5) throw new Error("triage: the table has no documents or no statement");
    var finds = rows[0], answer = rows[1], total = rows[rows.length - 2], cover = rows[rows.length - 1];
    var lines = rows.slice(2, -2);

    function money(s) {
      var m = /^([+−-]?)\$(\d[\d,]*)$/.exec(s);
      return m ? (m[1] === "+" || m[1] === "" ? 1 : -1) * Number(m[2].replace(/,/g, "")) : null;
    }
    function held(s) {
      var m = /^(.+): (\$\d[\d,]*), held for review$/.exec(s);
      return m ? { label: m[1], amount: m[2] } : null;
    }

    var results = docs.map(function (name, d) {
      var read = 0, sum = 0, hold = 0;
      var shown = lines.map(function (r) {
        var c = r.cells[d], h = held(c), v = money(c);
        if (c === NOT_READ) return null;
        read++;
        if (h) { hold++; return { label: h.label, value: h.amount + " · held for review", held: true }; }
        if (v === null) throw new Error("triage: " + name + " gives " + r.label + " as " + JSON.stringify(c));
        sum += v;
        return { label: r.label, value: c };
      });
      var said = answer.cells[d], state;
      var sumOut = total.cells[d], coverOut = cover.cells[d];
      if (!read) {
        state = "refused";
        if (!/^Refused/.test(said)) throw new Error("triage: " + name + " is read nowhere and answers " + said);
      } else if (read < lines.length) {
        throw new Error("triage: " + name + " is read in part, and a figure read from a document the tool cannot read is a guess");
      } else if (hold) {
        state = "held";
        if (!/held/.test(said)) throw new Error("triage: " + name + " holds a line and answers " + said);
      } else {
        state = "extracted";
        if (/^Refused|held/.test(said)) throw new Error("triage: " + name + " is read in full and answers " + said);
      }
      if (state === "extracted") {
        if (money(sumOut) !== sum) throw new Error("triage: " + name + "'s lines add up to " + sum + ", not " + sumOut);
        if (!/^\d+\.\d+×$/.test(coverOut)) throw new Error("triage: " + name + " gives coverage as " + coverOut);
      } else if (money(sumOut) !== null || /\d/.test(coverOut)) {
        throw new Error("triage: " + name + " computes a figure while " + (state === "held" ? "a line is held" : "nothing was read"));
      }
      return { name: name, finds: finds.cells[d], said: said, state: state, lines: shown,
               total: { label: total.label, value: sumOut }, cover: { label: cover.label, value: coverOut } };
    });

    var ICONS = {
      extracted: '<path d="M5 10.5l3 3L15 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
      held: '<path d="M10 3l8 14H2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 8v4M10 14.5v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      refused: '<circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 15L15 5" stroke="currentColor" stroke-width="1.8"/>'
    };
    /* What the tool says beside its answer, as the Case Study describes it: a lead in bold, the
       sentence, and a note in small type. */
    var SAYS = {
      extracted: { body: "A per-customer income statement with debt-service coverage, every figure traced to its line on the return." },
      held: { body: "The export scrambled one line’s description. Its amount is flagged for review instead of attached to the nearest plausible label — and coverage waits for it." },
      refused: { lead: "This return is an image-only scan.",
                 body: " No figures were read from it. Request the electronically filed copy, or key the schedule into the spreads template.",
                 aside: "Character recognition would produce numbers that look like figures. In a credit file a wrong number costs more than a missing one." }
    };

    var box = make("div", "triage", stage);
    var group = make("div", "triage__docs", box);
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Documents");
    var out = make("div", "triage__out", box);
    out.setAttribute("aria-live", "polite");

    var buttons = results.map(function (r, i) {
      var b = button(group, "triage__doc", r.name, i === 0);
      make("small", "", b, r.finds);
      b.addEventListener("click", function () { show(i); });
      return b;
    });

    function row(list, item, cls) {
      var tr = make("div", "stmt__row" + (cls ? " " + cls : ""), list);
      make("dt", "", tr, item.label);
      /* The stage says "pending" and "not computed" in the running text's case. */
      make("dd", "", tr, /^[A-Z][a-z]/.test(item.value) ? item.value.charAt(0).toLowerCase() + item.value.slice(1) : item.value);
    }

    /* The answer stays one element, so what it says is the Exhibit's result from one choice to the
       next; what follows it is redrawn for each document. */
    var verdict = make("p", "triage__verdict", out);
    var icon = make("span", "triage__icon", verdict);
    icon.setAttribute("aria-hidden", "true");
    var answerEl = make("span", "", verdict);
    answerEl.setAttribute("data-result", "");
    var body = make("div", "triage__body", out);

    function show(i) {
      var r = results[i];
      buttons.forEach(function (b, k) { b.setAttribute("aria-pressed", String(k === i)); });
      verdict.className = "triage__verdict triage__verdict--" + r.state;
      icon.innerHTML = '<svg viewBox="0 0 20 20" focusable="false">' + ICONS[r.state] + "</svg>";
      answerEl.textContent = r.said;
      body.textContent = "";
      var says = SAYS[r.state], p = make("p", "", body);
      if (says.lead) make("b", "", p, says.lead);
      p.appendChild(document.createTextNode(says.body));
      if (says.aside) make("p", "triage__aside", body, says.aside);
      if (r.state === "refused") return;
      var list = make("dl", "stmt", body);
      r.lines.forEach(function (ln) { row(list, ln, ln.held ? "is-held" : ""); });
      row(list, r.total, "is-total");
      row(list, r.cover, "");
    }

    show(0);
  });

  /* ---- KIND: green-suite ---------------------------------------------------------------------------
     One change, checked twice. The table lists each defect a review of the change found: whether it
     would have reached figures ("Yes" or "No"), how many of the automated assertions failed on it
     ("0 of 3,923"), and what review found. The suite is drawn as one square per assertion, filling in
     green the first time it comes into view; reading the change as prose then shows the defects,
     each a button that opens its description.

     The Exhibit's claim is that the suite saw none of them, and the kind reads that back from the
     table rather than trusting it, refusing a table that breaks it (the stage stays empty and the
     table stands alone):
       - every defect is counted against the same suite: one number of assertions in every row;
       - a defect some assertion failed on is one the suite saw, so every row fails none;
       - whether it would reach figures is "Yes" or "No".
     Under reduced motion the suite stands filled at once and the defects appear without easing in. */
  register("green-suite", function (fig, stage, data) {
    var reach = data.columns.indexOf("Would reach figures") - 1;
    var failing = data.columns.indexOf("Assertions failing on it") - 1;
    var found = data.columns.indexOf("What review found") - 1;
    if (reach < 0 || failing < 0 || found < 0 || !data.rows.length) {
      throw new Error("green-suite: the table has no defects, or lacks a column the kind reads");
    }
    var total = null, failed = 0;
    var defects = data.rows.map(function (r) {
      var m = /^(\d[\d,]*) of (\d[\d,]*)$/.exec(r.cells[failing]);
      if (!m) throw new Error("green-suite: " + r.label + " gives its failing assertions as " + JSON.stringify(r.cells[failing]));
      if (total === null) total = m[2];
      if (m[2] !== total) throw new Error("green-suite: " + r.label + " is counted against " + m[2] + " assertions, not " + total);
      if (number(m[1]) !== 0) throw new Error("green-suite: " + m[1] + " assertions failed on " + r.label + ", so the suite saw it");
      if (!/^(Yes|No)$/.test(r.cells[reach])) throw new Error("green-suite: " + r.label + " would reach figures: " + r.cells[reach]);
      failed += number(m[1]);
      return { name: r.label, high: r.cells[reach] === "Yes", says: r.cells[found] };
    });
    var n = number(total);
    var WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
    var many = (WORDS[defects.length] || String(defects.length)) + (defects.length === 1 ? " defect" : " defects");

    /* The legend: the passing count, which fills in with the grid, and the failing count. */
    var legend = make("p", "suite__legend", stage);
    var pass = make("span", "", legend);
    pass.innerHTML = '<svg class="suite__key suite__key--pass" viewBox="0 0 12 12" aria-hidden="true" focusable="false">' +
      '<rect width="12" height="12" rx="2"/><path d="M3 6.2l2 2 4-4.4"/></svg>';
    var onKey = pass.firstChild;
    var passing = make("b", "", pass, "0");
    passing.setAttribute("data-result", "");
    pass.appendChild(document.createTextNode(" passing"));
    var idle = make("span", "", legend);
    var offKey = make("i", "suite__key suite__key--idle", idle);
    offKey.setAttribute("aria-hidden", "true");
    idle.appendChild(document.createTextNode("not yet run"));
    var fail = make("span", "", legend);
    make("b", "", fail, String(failed));
    fail.appendChild(document.createTextNode(" failing"));

    /* The grid, one square per assertion. Its colours are the stylesheet's, read off the legend's
       keys, so the grid and its key cannot disagree. */
    var COLS = 106, CELL = 6, GAP = 1.5, rows = Math.ceil(n / COLS);
    var w = COLS * (CELL + GAP), h = rows * (CELL + GAP);
    var canvas = make("canvas", "suite__grid", stage);
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "A grid of " + total + " squares, every one passing.");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.aspectRatio = w + " / " + h;
    var ctx = canvas.getContext("2d");
    var on = window.getComputedStyle(onKey).color;
    var off = window.getComputedStyle(offKey).backgroundColor;
    function paint(k) {
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < n; i++) {
        ctx.fillStyle = i < k ? on : off;
        ctx.fillRect((i % COLS) * (CELL + GAP), Math.floor(i / COLS) * (CELL + GAP), CELL, CELL);
      }
    }
    function at(k) {
      paint(k);
      passing.textContent = k === n ? total : k.toLocaleString("en-US");
    }

    /* Reading the change as prose: the button gives way to what it found, and focus moves to the
       first defect so the keyboard is where the reading continues. */
    var read = make("div", "suite__read", stage);
    var go = button(read, "btn btn--solid", "Now read the change as prose");
    var status = make("p", "suite__status", read, many + ", every check still green");
    status.hidden = true;
    var list = make("div", "suite__defects", stage);
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", "Defects found by review");
    list.hidden = true;
    var detail = make("p", "suite__detail", stage);
    detail.setAttribute("aria-live", "polite");
    detail.setAttribute("data-result", "");

    var buttons = defects.map(function (d, i) {
      var b = button(list, "suite__defect", null, false);
      make("span", "suite__sev chip" + (d.high ? " chip--trouble" : ""), b, d.high ? "Would reach figures" : "Defect");
      make("span", "", b, d.name);
      b.style.setProperty("--defect-at", String(i));
      b.addEventListener("click", function () {
        buttons.forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
        detail.textContent = d.says;
      });
      return b;
    });

    /* The defects ease in one after another (the stylesheet's transition, 90ms apart), and the list
       is busy until the last has arrived. */
    var ARRIVE_MS = 500;
    go.addEventListener("click", function () {
      read.removeChild(go);
      status.hidden = false;
      list.hidden = false;
      if (!reduced) {
        list.classList.add("is-arriving");
        void list.offsetWidth;
        list.classList.add("is-here");
        list.setAttribute("aria-busy", "true");
        window.setTimeout(function () { list.removeAttribute("aria-busy"); }, ARRIVE_MS + buttons.length * 90);
      }
      detail.textContent = "Select a defect. None of the " + total + " checks covered any of them.";
      buttons[0].focus({ preventScroll: true });
    });

    /* The suite fills in once, the first time the grid comes into view; the legend is busy until it
       has. Under reduced motion it stands filled. */
    var FILL_MS = 2200;
    function fill() {
      var t0 = null;
      window.requestAnimationFrame(function tick(t) {
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / FILL_MS);
        at(Math.round(n * (1 - Math.pow(1 - k, 2))));
        if (k < 1) window.requestAnimationFrame(tick);
        else legend.removeAttribute("aria-busy");
      });
    }
    at(reduced ? n : 0);
    if (!reduced) {
      /* Busy from the start: until the grid has been seen and filled, 0 passing is not a result. */
      legend.setAttribute("aria-busy", "true");
      if (!("IntersectionObserver" in window)) {
        fill();
      } else {
        var seen = new window.IntersectionObserver(function (es) {
          es.forEach(function (e) {
            if (e.isIntersecting) { seen.disconnect(); fill(); }
          });
        }, { threshold: 0.3 });
        seen.observe(canvas);
      }
    }
  });

  /* ---- KIND: engagement-overview ----------------------------------------------------------------
     Every Engagement on one 2x2: who set its scope, and what the work produced. The table lists each
     Engagement: its number, its name (a link to its Case Study), its scope, its output, the name of
     the quadrant those two put it in, how it is described, and its line. Placement is categorical: a
     mark's position inside its quadrant is layout, spread evenly in reading order, and carries no
     meaning, which the source line says. There are no coordinates in the table because there are none
     to have.

     The axes are read from the table as well: each has exactly two categories, and the first row's
     pair is the top-left quadrant, since that is where a reader starts. A table the drawing cannot
     show is refused (the stage stays empty and the table stands alone): an axis with other than two
     categories, a quadrant given two names, a row without a link to its Case Study, or two rows with
     one number.

     Each mark is a link: selecting it opens the Case Study. Hovering it, focusing it, or tapping it
     once shows its line in the readout (a first tap shows it; a second opens it). The row marked
     data-lead is shown before a reader picks one. A hover is a preview: leaving the mark returns the
     readout to the Engagement last focused or tapped.

     The marks gather at the centre and spread to their quadrants the first time the diagram comes into
     view, with the marks aria-busy while they travel; under reduced motion they are simply there.

     Compact (data-compact on the figure, for a featured copy): the marks and the axes without the
     quadrant names, and the readout without the line. */
  register("engagement-overview", function (fig, stage, data, opts) {
    function col(name) {
      var i = data.columns.indexOf(name) - 1;
      if (i < 0) throw new Error("engagement-overview: the table has no " + name + " column");
      return i;
    }
    var NAME = col("Engagement"), SCOPE = col("Scope"), OUTPUT = col("Output"),
        QUAD = col("Quadrant"), SAYS = col("Described as"), LINE = col("In one line");
    var trs = fig.querySelectorAll("tbody tr");
    if (!data.rows.length) throw new Error("engagement-overview: the table has no Engagements");

    /* The two categories on each axis, in order of first appearance. */
    function categories(c) {
      var found = [];
      data.rows.forEach(function (r) { if (found.indexOf(r.cells[c]) < 0) found.push(r.cells[c]); });
      if (found.length !== 2) {
        throw new Error("engagement-overview: " + data.columns[c + 1] + " has " + found.length +
                        " categories, not two: " + found.join(", "));
      }
      return found;
    }
    var scopes = categories(SCOPE), outputs = categories(OUTPUT);
    var quads = {}, numbers = {};
    var marks = data.rows.map(function (r, i) {
      var link = trs[i].querySelector("a[href]");
      if (!link) throw new Error("engagement-overview: " + r.cells[NAME] + " links to no Case Study");
      if (numbers[r.label]) throw new Error("engagement-overview: two Engagements are numbered " + r.label);
      numbers[r.label] = true;
      var across = scopes.indexOf(r.cells[SCOPE]), down = outputs.indexOf(r.cells[OUTPUT]);
      var key = across + "," + down;
      if (quads[key] && quads[key].name !== r.cells[QUAD]) {
        throw new Error("engagement-overview: one quadrant is named both " + quads[key].name +
                        " and " + r.cells[QUAD]);
      }
      quads[key] = quads[key] || { name: r.cells[QUAD], col: across, row: down, members: [] };
      var m = { no: r.label, name: r.cells[NAME], says: r.cells[SAYS], line: r.cells[LINE],
                href: link.getAttribute("href"), lead: trs[i].hasAttribute("data-lead"), quad: quads[key] };
      quads[key].members.push(m);
      return m;
    });

    /* The plot, in the drawing's own units. x runs left to right across the scope categories, y top
       to bottom across the outputs; each quadrant is half of each. */
    var W = 520, H = 430, L = 44, R = 508, T = 16, B = 384, MX = (L + R) / 2, MY = (T + B) / 2;
    function X(u) { return L + (R - L) * u; }
    function Y(u) { return T + (B - T) * u; }
    /* Where the marks go, in two layouts, since a name runs toward the middle and may cross it.

       Wide: each row of the 2x2 is cut into bands, one mark to a band, so no two marks share a line
       and a name that crosses the divide never meets its neighbour's. The bands count in from the
       row's outer edge, below its quadrant names and clear of the midline, alternating the left
       quadrant and the right in reading order; within a quadrant the marks step in toward the middle.

       Narrow (under 30rem, set by the stylesheet): each name wraps and keeps to its own quadrant, so
       each quadrant's members go evenly down its own height in one column at its outer side, the side
       their labels do not run to, leaving the names facing each other across the divide the whole
       width between. */
    var HALF = (B - T) / 2, CLEAR = 36, MARGIN = 16;
    [0, 1].forEach(function (row) {
      var left = (quads["0," + row] || { members: [] }).members,
          right = (quads["1," + row] || { members: [] }).members, bands = [];
      for (var j = 0; j < Math.max(left.length, right.length); j++) {
        if (left[j]) bands.push(left[j]);
        if (right[j]) bands.push(right[j]);
      }
      bands.forEach(function (m, b) {
        var q = m.quad, n = q.members.length, j = q.members.indexOf(m);
        var d = CLEAR + (b + 0.5) * (HALF - CLEAR - MARGIN) / bands.length;
        var inset = (n === 1 ? 0.4 : 0.2 + 0.25 * j / (n - 1)) * (R - L) / 2;
        m.wide = { x: q.col ? R - inset : L + inset, y: row ? B - d : T + d };
      });
    });
    Object.keys(quads).forEach(function (k) {
      var q = quads[k], n = q.members.length;
      var lo = q.row ? 0.15 : 0.55, hi = q.row ? 0.45 : 0.82;
      q.members.forEach(function (m, j) {
        var t = n === 1 ? 0.5 : j / (n - 1);
        m.narrow = { x: X(q.col ? 0.9 : 0.1), y: Y(1 - (hi - (hi - lo) * t)) };
        m.right = !q.col;
      });
    });

    var frame = make("div", "exhibit__frame", stage);
    var plot = make("div", "overview", frame);
    var svg = [];
    svg.push('<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true" focusable="false">');
    svg.push('<rect class="overview__ground" x="' + L + '" y="' + T + '" width="' + (R - L) + '" height="' + (B - T) + '" rx="8"/>');
    svg.push('<rect class="overview__lead-quadrant" x="' + L + '" y="' + T + '" width="' + (MX - L) + '" height="' + (MY - T) + '" rx="8"/>');
    svg.push('<path class="overview__divide" d="M' + MX + " " + T + " V" + B + " M" + L + " " + MY + " H" + R + '"/>');
    svg.push("</svg>");
    plot.innerHTML = svg.join("");

    /* Words over the drawing are HTML at the page's own sizes, placed by percentage, so they stay
       legible however wide the diagram is drawn. */
    function place(el, x, y) {
      el.style.setProperty("--x", (x / W * 100) + "%");
      el.style.setProperty("--y", (y / H * 100) + "%");
      return el;
    }
    if (!opts.compact) {
      Object.keys(quads).forEach(function (k) {
        var q = quads[k];
        var qn = make("span", "overview__quadrant" + (q.row ? " is-low" : ""), plot, q.name);
        qn.setAttribute("aria-hidden", "true");
        place(qn, q.col ? MX + 14 : L + 14, q.row ? B - 12 : T + 12);
      });
    }
    var axes = make("div", "overview__axes", plot);
    axes.setAttribute("aria-hidden", "true");
    place(make("span", "overview__axis", axes, scopes[0]), L, B + 12);
    place(make("span", "overview__axis is-end", axes, scopes[1]), R, B + 12);
    place(make("span", "overview__axis is-y", axes, outputs[1]), L - 12, B);
    place(make("span", "overview__axis is-y is-end", axes, outputs[0]), L - 12, T);

    var field = make("div", "overview__marks", plot);
    field.style.setProperty("--cx", (MX / W * 100) + "%");
    field.style.setProperty("--cy", (MY / H * 100) + "%");
    var readout = make("div", "overview__card", stage);
    readout.setAttribute("aria-live", "polite");
    var cardNo = make("span", "overview__no", readout);
    cardNo.setAttribute("aria-hidden", "true");
    var cardName = make("b", "overview__name", readout);
    cardName.setAttribute("data-result", "");
    var cardSays = make("span", "overview__says", readout);
    var cardLine = opts.compact ? null : make("p", "overview__line", readout);

    /* Hovering previews a mark; leaving it returns the readout to the one chosen by focus or a tap
       (at first, the lead), so a readout seen only by hovering is never left standing. */
    /* picked: whether the reader has chosen yet. The lead is shown, not chosen, so a first tap on it
       previews too. */
    var chosen = null, picked = false, previewTap = false;
    function choose(m) {
      chosen = m;
      show(m);
    }
    function show(m) {
      cardNo.textContent = m.no;
      cardName.textContent = m.name;
      cardSays.textContent = m.says;
      if (cardLine) cardLine.textContent = m.line;
      marks.forEach(function (o) { o.el.classList.toggle("is-shown", o === m); });
    }
    marks.forEach(function (m, i) {
      var a = make("a", "overview__mark" + (m.right ? "" : " is-left-label"), field);
      a.href = m.href;
      a.style.setProperty("--i", String(i));
      a.style.setProperty("--wide-x", (m.wide.x / W * 100) + "%");
      a.style.setProperty("--wide-y", (m.wide.y / H * 100) + "%");
      a.style.setProperty("--narrow-x", (m.narrow.x / W * 100) + "%");
      a.style.setProperty("--narrow-y", (m.narrow.y / H * 100) + "%");
      make("span", "overview__dot", a, m.no).setAttribute("aria-hidden", "true");
      make("span", "visually-hidden", a, "Engagement " + m.no + ": ");
      make("span", "overview__label", a, m.name);
      a.addEventListener("mouseenter", function () { show(m); });
      a.addEventListener("mouseleave", function () { show(chosen); });
      a.addEventListener("focus", function () { picked = true; choose(m); });
      /* A first tap shows the line; a tap on the one already chosen opens it. Decided as the finger
         lands, before the focus and mouse events a tap also fires have chosen it. */
      a.addEventListener("pointerdown", function (e) {
        previewTap = e.pointerType === "touch" && (!picked || chosen !== m);
      });
      a.addEventListener("click", function (e) {
        if (previewTap) {
          e.preventDefault();
          picked = true;
          choose(m);
        }
        previewTap = false;
      });
      m.el = a;
    });
    choose(marks.filter(function (m) { return m.lead; })[0] || marks[0]);

    if (!reduced) {
      field.classList.add("is-arriving");
      field.setAttribute("aria-busy", "true");
      var arrive = function () {
        /* One frame at the centre first, so the marks have somewhere to travel from. */
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            field.classList.add("is-here");
            window.setTimeout(function () {
              field.classList.remove("is-arriving", "is-here");
              field.removeAttribute("aria-busy");
            }, 250 + 110 * marks.length + 900);
          });
        });
      };
      if (!("IntersectionObserver" in window)) {
        arrive();
      } else {
        var seen = new window.IntersectionObserver(function (es) {
          es.forEach(function (e) {
            if (e.isIntersecting) { seen.disconnect(); arrive(); }
          });
        }, { threshold: 0.3 });
        seen.observe(plot);
      }
    }
  });

  /* ---- KIND: spread-direction ------------------------------------------------------------------
     A result reported by direction only. The table lists each period the signal was tested over,
     oldest first, and the direction the spread took in it, in words: Positive or Negative. Every
     arrow is drawn one length, because on this site a direction may be published where its
     magnitude is withheld (Self-Computed in CONTEXT.md).

     Two charts from the one table: every period, and the one a less careful paper would have
     published - only the periods that pointed the right way, with nothing on it saying the others
     were left out. The count of periods shown that pointed the right way is the result, so leaving
     the others out changes it from one of three to one of one.

     A table the drawing cannot show is refused (the stage stays empty and the table stands alone):
     a direction that is not one of the two words - a figure above all, since a figure there is the
     magnitude this Exhibit exists to withhold - or no period that pointed the right way, which
     leaves the flattering chart nothing to flatter with. */
  register("spread-direction", function (fig, stage, data) {
    var UP = "positive", DOWN = "negative";
    if (data.columns.length < 2 || !data.rows.length) throw new Error("spread-direction: the table has no periods");
    var periods = data.rows.map(function (r) {
      var d = (r.cells[0] || "").toLowerCase();
      if (d !== UP && d !== DOWN) {
        throw new Error("spread-direction: " + r.label + " reads " + JSON.stringify(r.cells[0]) +
                        "; a direction is Positive or Negative, and never a figure");
      }
      return { label: r.label, words: r.cells[0], up: d === UP };
    });
    var worked = periods.filter(function (p) { return p.up; });
    if (!worked.length) throw new Error("spread-direction: no period pointed the right way");
    var one = worked.length === 1;
    var views = ["Every period tested", one ? "Only the period that worked" : "Only the periods that worked"];
    var flattering = false;

    var bar = make("div", "exhibit__controls", stage);
    var shownBy = segmented(bar, "Periods shown", views, function (i) {
      flattering = i === 1;
      update();
    });

    /* The chart itself: a heading, a zero line, and one column per period with an arrow of one
       length above or below it, its direction in words and the period it was measured over. The
       heading is the table's own name for the measure. */
    var frame = make("div", "exhibit__frame", stage);
    var chart = make("div", "spread", frame);
    var heading = make("p", "spread__heading", chart);
    var plot = make("ol", "spread__plot", chart);
    var columns = periods.map(function (p) {
      var li = make("li", "spread__period" + (p.up ? " is-up" : " is-down"), plot);
      var mark = make("span", "spread__mark", li);
      mark.setAttribute("aria-hidden", "true");
      mark.innerHTML = '<svg viewBox="0 0 24 96" focusable="false">' +
        (p.up ? '<path d="M12 48 V10 M4 20 L12 8 L20 20"/>' : '<path d="M12 48 V86 M4 76 L12 88 L20 76"/>') +
        "</svg>";
      make("span", "spread__direction", li, p.words);
      make("span", "spread__label", li, p.label);
      return li;
    });
    make("p", "spread__scale", chart, "No scale: every arrow is one length. Direction only.");

    var readout = make("div", "exhibit__readout", stage);
    readout.setAttribute("aria-live", "polite");
    var line = make("p", "exhibit__count", readout);
    var tally = make("b", "", line);
    tally.setAttribute("data-result", "");
    var phrase = line.appendChild(document.createTextNode(""));
    var note = make("p", "exhibit__note", readout);

    function periodsWord(n) { return n === 1 ? "period" : "periods"; }

    /* The two charts differ in which periods they show; everything else follows from that. */
    function update() {
      var shown = flattering ? worked : periods, wrong = periods.length - worked.length;
      shownBy.press(flattering ? 1 : 0);
      columns.forEach(function (li, i) { li.hidden = shown.indexOf(periods[i]) < 0; });
      heading.textContent = data.columns[1] + ": " +
        (flattering ? worked.map(function (p) { return p.label; }).join("; ") : "every period tested");
      tally.textContent = worked.length + " of " + shown.length;
      phrase.nodeValue = " " + periodsWord(shown.length) + " shown pointed the right way";
      note.textContent = flattering
        ? (wrong === 1 ? "The period it pointed the wrong way in is left out"
                       : "The " + wrong + " periods it pointed the wrong way in are left out") +
          ", and nothing on this chart says so."
        : wrong + " of " + periods.length + " pointed the wrong way, so the " + periodsWord(worked.length) +
          " that worked " + (one ? "reads" : "read") + " as a window rather than a signal.";
    }

    update();
  });

  /* ---- KIND: timeline --------------------------------------------------------------------------
     The About page's timeline. The table lists each entry newest first, with its dates, where it
     happened and what it was, and its order is the content: the first row is the newest entry and
     the current role. An entry whose dates run to "present" is still under way.

     Each entry is a stop on a rail, across the page on a wide screen and down it on a phone (the
     stylesheet decides), and a button: selecting it shows what it was underneath. The current role
     is marked with aria-current and opens selected. A table whose newest entry has ended has no
     current role to mark, and is refused rather than drawn with the mark on something finished.
     Its columns are found by their headers, so a table reordered is still read right.

     The rail is called the course (course__*), the path taken to now, since .timeline was v1's list
     and the drawing is a different thing. */
  register("timeline", function (fig, stage, data) {
    var col = {};
    ["When", "Where", "What it was"].forEach(function (name) {
      var i = data.columns.indexOf(name);
      if (i < 1) throw new Error("timeline: the table has no " + JSON.stringify(name) + " column");
      col[name] = i - 1;
    });
    if (!data.rows.length) throw new Error("timeline: the table has no entries");
    var entries = data.rows.map(function (r) {
      var when = r.cells[col.When] || "";
      return { what: r.label, when: when, where: r.cells[col.Where], note: r.cells[col["What it was"]],
               running: /\bpresent$/i.test(when) };
    });
    if (!entries[0].running) {
      throw new Error("timeline: the newest entry, " + entries[0].what + ", reads " +
                      JSON.stringify(entries[0].when) + "; the current role runs to the present");
    }
    var running = entries.filter(function (en) { return en.running; }).length;
    var picked = 0;

    var frame = make("div", "exhibit__frame", stage);
    var rail = make("ol", "course", frame);
    var stops = entries.map(function (en, i) {
      var li = make("li", "course__entry" + (i === 0 ? " is-now" : en.running ? " is-running" : ""), rail);
      var b = button(li, "course__stop", null, i === 0);
      if (i === 0) b.setAttribute("aria-current", "true");
      make("span", "course__node", b).setAttribute("aria-hidden", "true");
      make("span", "course__when", b, en.when);
      make("span", "course__what", b, en.what);
      if (i === 0) make("span", "course__flag", b, "Current role");
      b.addEventListener("click", function () { picked = i; update(); });
      return b;
    });

    /* The key, and the one count the title makes: how many entries are still under way, the current
       role among them, so the count stands apart from the open ring that marks only the others. */
    var key = make("p", "course__key", stage);
    make("span", "course__swatch is-now", key).setAttribute("aria-hidden", "true");
    key.appendChild(document.createTextNode("Current role "));
    make("span", "course__swatch is-running", key).setAttribute("aria-hidden", "true");
    key.appendChild(document.createTextNode("Also still under way "));
    make("span", "course__swatch", key).setAttribute("aria-hidden", "true");
    key.appendChild(document.createTextNode("Ended"));
    make("span", "course__tally", key, running + " of " + entries.length + " under way, the current role included");

    var readout = make("div", "exhibit__readout course__readout", stage);
    readout.setAttribute("aria-live", "polite");
    var when = make("p", "course__readout-when", readout);
    var shown = make("p", "course__readout-what", readout);
    shown.setAttribute("data-result", "");
    var where = make("p", "course__readout-where", readout);
    var note = make("p", "course__readout-note", readout);

    function update() {
      var en = entries[picked];
      stops.forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === picked)); });
      when.textContent = en.when + (picked === 0 ? " · current role" : "");
      shown.textContent = en.what;
      where.textContent = en.where;
      note.textContent = en.note;
    }

    update();
  });

  /* ---- KIND: age-serial ------------------------------------------------------------------------
     The table lists dates of birth, oldest first: each one's day serial, whether the map's serial
     test passes it, the age the map computed, the true age on the date its column names, and the
     band that age belongs in. The serial test's column names its floor. The slider steps through
     the rows, starting on the last date below the floor so the defect is what a reader sees first;
     the readout gives the serial against the floor, and a strip of the table's bands shows where
     the map filed the age and, when that is wrong, where it belongs.

     The drawing can only show a table that agrees with it, so a table that does not is refused: a
     serial that is not its date counted the way a spreadsheet counts, a true age that is not the one
     on the named date or not in its band, a date that passes without being above the floor or fails
     while above it, and a failed date that shows its true age rather than zero - which would
     demonstrate a map without the defect. */
  register("age-serial", function (fig, stage, data) {
    var col = {}, floor = null, on = null;
    data.columns.forEach(function (c, i) {
      var m;
      if (i < 1) return;
      if (c === "Day serial") col.serial = i - 1;
      else if (c === "Age the map computed") col.computed = i - 1;
      else if (c === "Band it belongs in") col.band = i - 1;
      else if ((m = /^Serial test, floor ([\d,]+)$/.exec(c))) { col.test = i - 1; floor = number(m[1]); }
      else if ((m = /^Age on (\d{4}-\d{2}-\d{2})$/.exec(c))) { col.age = i - 1; on = day(m[1]); }
    });
    ["serial", "test", "computed", "age", "band"].forEach(function (k) {
      if (col[k] == null) throw new Error("age-serial: the table has no " + k + " column");
    });

    /* A date, with its serial: whole days since the day before a spreadsheet's day 1. */
    function day(iso) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (!m) throw new Error("age-serial: " + JSON.stringify(iso) + " is not a date");
      return { y: +m[1], m: +m[2], d: +m[3],
               serial: Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 864e5) };
    }
    function fromSerial(n) {
      var t = new Date(Date.UTC(1899, 11, 30) + n * 864e5);
      return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
    }
    var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
                  "September", "October", "November", "December"];
    function words(t) { return t.d + " " + MONTHS[t.m - 1] + " " + t.y; }
    function grouped(n) { return n.toLocaleString("en-US"); }

    /* The bands, in the order the table first names them, youngest first. */
    var bands = [];
    function bandOf(age) {
      for (var b = 0; b < bands.length; b++) if (age >= bands[b].lo && age <= bands[b].hi) return b;
      throw new Error("age-serial: no band in the table holds age " + age);
    }
    data.rows.forEach(function (r) {
      var name = r.cells[col.band], m = /^(\d+)–(\d+)$/.exec(name);
      if (!m) throw new Error("age-serial: " + JSON.stringify(name) + " is not a band");
      if (!bands.some(function (b) { return b.name === name; })) bands.push({ name: name, lo: +m[1], hi: +m[2] });
    });
    bands.sort(function (a, b) { return a.lo - b.lo; });

    var entries = data.rows.map(function (r, i) {
      var born = day(r.label), test = r.cells[col.test];
      var en = { label: r.label, born: born, serial: r.values[col.serial], passes: test === "Passes",
                 computed: r.values[col.computed], age: r.values[col.age], band: r.cells[col.band] };
      var age = on.y - born.y - ((on.m < born.m || (on.m === born.m && on.d < born.d)) ? 1 : 0);
      if (en.serial !== born.serial) {
        throw new Error("age-serial: " + r.label + " is serial " + born.serial + ", not " + en.serial);
      }
      if (i && en.serial <= data.rows[i - 1].values[col.serial]) {
        throw new Error("age-serial: the dates are not oldest first");
      }
      if (en.age !== age) throw new Error("age-serial: born " + r.label + " is aged " + age + ", not " + en.age);
      if (bands[bandOf(age)].name !== en.band) {
        throw new Error("age-serial: age " + age + " belongs in " + bands[bandOf(age)].name + ", not " + en.band);
      }
      if (test !== "Passes" && test !== "Fails") {
        throw new Error("age-serial: " + r.label + "'s serial test reads " + JSON.stringify(test));
      }
      if (en.passes !== en.serial > floor) {
        throw new Error("age-serial: " + r.label + " is serial " + en.serial + ", which the floor of " + floor +
                        (en.passes ? " does not let through" : " lets through"));
      }
      if (en.computed !== (en.passes ? age : 0)) {
        throw new Error("age-serial: " + r.label + (en.passes ? " passes" : " fails") +
                        " the serial test, so the map computes " + (en.passes ? age : 0) + ", not " + en.computed);
      }
      return en;
    });
    var below = entries.filter(function (en) { return !en.passes; }).length;
    if (!below || below === entries.length) {
      throw new Error("age-serial: the table needs dates on both sides of the floor");
    }
    var floorDate = fromSerial(floor);

    var picked = below - 1;
    var scale = make("div", "agecheck__scale", stage);
    var control = slider(scale, {
      min: 0, max: entries.length - 1, step: 1, value: picked, label: "Date of birth",
      valueText: function (i) { return words(entries[i].born); },
      onChange: function (i) { picked = i; update(); },
    });
    /* The floor sits between the last date below it and the first above. */
    var mark = make("p", "agecheck__floor", scale,
                    "Floor: " + grouped(floor) + " days, " + MONTHS[floorDate.m - 1] + " " + floorDate.y);
    mark.id = fig.id + "-floor";
    mark.style.setProperty("--at", String((below - 0.5) / (entries.length - 1)));
    control.el.setAttribute("aria-describedby", mark.id);

    var readout = make("div", "exhibit__readout agecheck__readout", stage);
    readout.setAttribute("aria-live", "polite");
    var sums = make("dl", "exhibit__pairs agecheck__sums", readout);
    function row(term) {
      make("dt", null, sums, term);
      return make("dd", null, sums);
    }
    var bornOut = row("Date of birth");
    var serialOut = row("Day serial");
    var testOut = row("Serial test");
    var computedOut = row("Age the map computed");
    computedOut.setAttribute("data-result", "");
    var ageOut = row("True age");
    var note = make("p", "exhibit__note", readout);

    var frame = make("div", "exhibit__frame", stage);
    var strip = make("ol", "agecheck__bands", frame);
    strip.setAttribute("aria-label", "Age bands");
    strip.style.setProperty("--bands", String(bands.length));
    var cells = bands.map(function (b) {
      var li = make("li", "agecheck__band", strip);
      make("span", "agecheck__band-name", li, b.name);
      return { li: li, tag: make("span", "agecheck__tag", li) };
    });

    function update() {
      var en = entries[picked], filed = bandOf(en.computed), belongs = bandOf(en.age);
      var misfiled = filed !== belongs;
      bornOut.textContent = words(en.born);
      serialOut.textContent = grouped(en.serial) + (en.passes ? " (above the floor)" : " (not above the floor)");
      testOut.textContent = en.passes ? "Passes" : "Fails";
      computedOut.textContent = String(en.computed);
      ageOut.textContent = String(en.age);
      readout.classList.toggle("is-hot", misfiled);
      cells.forEach(function (c, i) {
        var tag = "";
        if (i === filed) tag = misfiled ? "✕ Filed here" : "Filed here";
        else if (i === belongs) tag = "Belongs here";
        c.li.classList.toggle("is-filed", i === filed && !misfiled);
        c.li.classList.toggle("is-wrong", i === filed && misfiled);
        c.li.classList.toggle("is-belongs", i === belongs && misfiled);
        c.tag.textContent = tag;
      });
      note.textContent = en.passes
        ? "Converted, and filed in the " + bands[belongs].name + " band, where it belongs."
        : "Not above the floor, so the serial test fails, every other test fails, and the age comes back as " +
          en.computed + ": filed in the " + bands[filed].name + " band with the infants, not in the " +
          bands[belongs].name + " band.";
    }

    update();
  });

  /* ---- KIND: mentions-deployment ----------------------------------------------------------------
     Two ways of scoring the same passages. The table's columns, in order: the passage, its text, how
     many times that text mentions the term (the column's header names it), and then one column per
     sign of deployment, each Yes or No. The frequency score
     is the mentions; the deployment score is the signs a passage carries. The one slider writes
     more mentions into every passage: the frequency scores climb with it, and the deployment
     scores cannot move, because nothing the slider writes is a sign of deployment.

     A table the drawing cannot show is refused (the stage stays empty and the table stands alone):
     a mention count that is not the number of times its own text says AI, since the count is read
     off the text and a figure that disagrees with it is a second copy of the data, or a sign cell
     that is not Yes or No. */
  register("mentions-deployment", function (fig, stage, data) {
    /* The term counted, written once: the passages' text is split on it, and a count is its matches. */
    var WORD = "AI", TERM = new RegExp("\\b(" + WORD + ")\\b"), MOST = 10;
    var signs = data.columns.slice(3);
    if (!data.rows.length || !signs.length) throw new Error("mentions-deployment: the table has no passages or no signs");
    var passages = data.rows.map(function (r) {
      var said = (r.cells[0].split(TERM).length - 1) / 2;
      if (r.values[1] !== said) {
        throw new Error("mentions-deployment: " + r.label + " is counted " + JSON.stringify(r.cells[1]) +
                        " but its text mentions AI " + said + " times");
      }
      var carries = r.cells.slice(2).map(function (c, i) {
        var w = c.toLowerCase();
        if (w !== "yes" && w !== "no") {
          throw new Error("mentions-deployment: " + r.label + " reads " + JSON.stringify(c) + " for " + signs[i]);
        }
        return w === "yes";
      });
      return {
        label: r.label, text: r.cells[0], mentions: said,
        signs: signs.filter(function (s, i) { return carries[i]; })
      };
    });
    var widest = Math.max.apply(null, passages.map(function (p) { return p.mentions; })) + MOST;
    var added = 0;

    var bar = make("div", "exhibit__controls", stage);
    slider(bar, {
      visibleLabel: data.columns[2] + " added",
      min: 0, max: MOST, step: 1, value: 0, label: data.columns[2] + " added to every passage",
      valueText: function (v) { return v + (v === 1 ? " mention" : " mentions") + " added to every passage"; },
      onChange: function (v) { added = v; update(); }
    });

    /* One card per passage: its text with every mention marked and the added ones after it, then
       the two scores as bars on their own scales, each with its figure in words beside it. */
    var list = make("ol", "mentions", stage);
    var cards = passages.map(function (p) {
      var li = make("li", "mentions__passage", list);
      make("p", "mentions__label", li, p.label);
      var quote = make("p", "mentions__text", li);
      p.text.split(TERM).forEach(function (part, i) {
        if (i % 2) make("mark", "mentions__term", quote, part);
        else if (part) quote.appendChild(document.createTextNode(part));
      });
      /* The added mentions are shown, not read out: a run of the same word tells a screen reader
         nothing the slider's value text and the frequency figure do not. */
      var extra = make("span", "", quote);
      extra.setAttribute("aria-hidden", "true");
      function score(name, cls) {
        var row = make("div", "mentions__score " + cls, li);
        make("span", "mentions__name", row, name);
        var track = make("span", "mentions__track", row);
        track.setAttribute("aria-hidden", "true");
        var fill = make("span", "mentions__fill", track);
        var value = make("span", "mentions__value", row);
        return { fill: fill, value: value };
      }
      var freq = score("Frequency", "is-frequency");
      var dep = score("Deployment", "is-deployment");
      dep.fill.style.width = p.signs.length / signs.length * 100 + "%";
      dep.value.textContent = p.signs.length + " of " + signs.length + " signs";
      make("p", "mentions__signs", li, p.signs.length ? p.signs.join(" · ") : "No sign of deployment");
      return { extra: extra, freq: freq };
    });

    var readout = make("div", "exhibit__readout", stage);
    readout.setAttribute("aria-live", "polite");
    function line(words) {
      var p = make("p", "exhibit__count", readout);
      var b = make("b", "", p);
      b.setAttribute("data-result", "");
      p.appendChild(document.createTextNode(words));
      return b;
    }
    var mentioned = line(" mentions of " + WORD + " across the passages, which is what frequency scores count");
    var shown = line(" signs of deployment across them, which is what deployment scores count");
    var note = make("p", "exhibit__note", readout);

    function sum(f) { return passages.reduce(function (t, p) { return t + f(p); }, 0); }
    function leader(f) {
      return passages.reduce(function (best, p) { return f(p) > f(best) ? p : best; });
    }
    var byDeployment = leader(function (p) { return p.signs.length; });
    var byFrequency = leader(function (p) { return p.mentions; });
    var lastByFrequency = leader(function (p) { return -p.mentions; });
    shown.textContent = sum(function (p) { return p.signs.length; });

    function update() {
      cards.forEach(function (c, i) {
        var n = passages[i].mentions + added;
        c.extra.textContent = "";
        for (var k = 0; k < added; k++) {
          c.extra.appendChild(document.createTextNode(" "));
          make("mark", "mentions__term is-added", c.extra, WORD);
        }
        c.freq.fill.style.width = n / widest * 100 + "%";
        c.freq.value.textContent = n + (n === 1 ? " mention" : " mentions");
      });
      mentioned.textContent = sum(function (p) { return p.mentions; }) + added * passages.length;
      note.textContent = (added
        ? "Every frequency score rose by " + added + "; no deployment score moved. "
        : "") + "A frequency score ranks " + byFrequency.label + " first and " + lastByFrequency.label +
        " last, however many mentions are added; " + byDeployment.label + " carries the most signs of deployment.";
    }

    update();
  });

  /* ---- KIND: status-board ----------------------------------------------------------------------
     The research overview's board. The table has one row per Research Track, its header linking to
     the Track's full standing on the page, then the three standing slots - Settled, In progress,
     What would falsify it - and the Case Study the Track leads to. A Track keeps all three slots
     (CONTEXT.md), so a row with an empty slot is refused rather than drawn with a gap in it.
     Columns are found by their headers.

     Each slot is a button on the board, labelled with its slot and showing its words; selecting it
     names the Track and slot underneath and links to that Track's standing in full. Each Track's
     row ends in its Case Study link, the hand-off, read from the table's own link. Nothing animates. */
  register("status-board", function (fig, stage, data) {
    var SLOTS = ["Settled", "In progress", "What would falsify it"];
    var col = {};
    SLOTS.concat("Case Study").forEach(function (name) {
      var i = data.columns.indexOf(name);
      if (i < 1) throw new Error("status-board: the table has no " + JSON.stringify(name) + " column");
      col[name] = i - 1;
    });
    if (!data.rows.length) throw new Error("status-board: the table has no Research Tracks");
    var trs = fig.querySelectorAll("tbody tr");
    var tracks = data.rows.map(function (r, i) {
      var head = trs[i].querySelector("th a[href]");
      var study = trs[i].children[col["Case Study"] + 1].querySelector("a[href]");
      if (!study) throw new Error("status-board: " + r.label + " links to no Case Study");
      SLOTS.forEach(function (name) {
        if (!r.cells[col[name]]) throw new Error("status-board: " + r.label + " leaves " + name + " empty");
      });
      return { name: r.label, full: head ? head.getAttribute("href") : null,
               study: study.getAttribute("href"), studyName: text(study),
               slots: SLOTS.map(function (name) { return r.cells[col[name]]; }) };
    });
    var picked = { track: 0, slot: 0 };

    var board = make("div", "board", stage);
    var slotButtons = tracks.map(function (track, t) {
      var row = make("div", "board__track", board);
      make("p", "board__name", row, track.name);
      var slots = make("div", "board__slots", row);
      var buttons = track.slots.map(function (words, s) {
        var b = button(slots, "board__slot", null, t === 0 && s === 0);
        make("span", "board__term", b, SLOTS[s]);
        make("span", "board__words", b, words);
        b.addEventListener("click", function () { picked = { track: t, slot: s }; update(); });
        return b;
      });
      var more = make("p", "board__more", row);
      var a = make("a", null, more, track.studyName + ", the Case Study");
      a.href = track.study;
      return buttons;
    });

    var readout = make("div", "exhibit__readout board__readout", stage);
    readout.setAttribute("aria-live", "polite");
    var shown = make("p", "board__readout-what", readout);
    shown.setAttribute("data-result", "");
    var inFull = make("p", "board__readout-full", readout);
    var toStanding = make("a", null, inFull, "Read this track\u2019s standing in full");

    function update() {
      var track = tracks[picked.track];
      slotButtons.forEach(function (buttons, t) {
        buttons.forEach(function (b, s) {
          b.setAttribute("aria-pressed", String(t === picked.track && s === picked.slot));
        });
      });
      shown.textContent = track.name + ": " + SLOTS[picked.slot].toLowerCase();
      inFull.hidden = !track.full;
      if (track.full) toStanding.href = track.full;
    }

    update();
  });

  /* ---- helpers shared by the kinds -----------------------------------------------------------------
     A segmented choice: a named group of pressed-state buttons, the first pressed. Clicking one calls
     onPick with its index; the kind decides what changes, and press(i) shows which option holds.
     fullNames, when given, names each option in full to a screen reader (its aria-label) where the
     visible word is short ("Record" is heard as "Step 2, Record"); without it the word is the name.
     svgChild adds a classed child to an SVG parsed from markup, taking the SVG namespace from it
     rather than from a URL written here (suites/run.py reads any URL in a shipped script as a load). */
  /* cls replaces the pill row's own class for a group laid out another way (the pipeline's grid);
     its options keep seg__option. */
  function segmented(bar, label, names, onPick, fullNames, cls) {
    var group = make("div", cls || "seg", bar);
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", label);
    var options = names.map(function (name, i) {
      var b = button(group, "seg__option", name, i === 0);
      if (fullNames) b.setAttribute("aria-label", fullNames[i]);
      b.addEventListener("click", function () { onPick(i); });
      return b;
    });
    return {
      press: function (at) {
        options.forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === at)); });
      },
    };
  }

  function svgChild(svg, tag, cls) {
    var e = document.createElementNS(svg.namespaceURI, tag);
    if (cls) e.setAttribute("class", cls);
    svg.appendChild(e);
    return e;
  }

  /* ---- KIND: ranking ---------------------------------------------------------------------------
     The Research's withdrawn score, recomputed in front of the reader. The table lists synthetic
     companies with the detector reading each one's filing received, and when each joins the sample:
     "At the start", or "Added", one at a time and in table order. Every company in the sample is
     scored the way the withdrawn report scored it: its reading's z-score within the sample, put
     through a sigmoid, and the top quartile by rank (rounded down) flagged.

     Two controls, each showing one consequence of that definition. "Add a company" brings in the
     next one, and every score already given moves, since the sample's mean and spread moved; a ring
     stays where each score was. The segmented choice "As filed / Doubled" makes every filing read
     twice as machine-like, and no score moves, since a z-score does not see a change everyone
     shares. The flagged companies are the top quartile either way. Once every company has joined,
     the first control takes the sample back to its start.

     The results are each company's score, in table order with the newcomer last, each followed by
     "Flagged" when it is, and the flagged tally: suites/run.py holds the drive's reading of them to
     the consequences above. Nothing plays over time, so there is no aria-busy, and there are no
     hover readouts.

     A table the drawing cannot show is refused: a reading that is not a figure, a joining time other
     than "At the start" or "Added", a company added before the starting sample is complete, a
     starting sample too small for a quartile of it to be anyone, no company left to add, or readings
     that are all the same (no spread to score against). */
  register("ranking", function (fig, stage, data) {
    var col = {};
    ["Reading", "Joins the sample"].forEach(function (name) {
      var i = data.columns.indexOf(name);
      if (i < 1) throw new Error("ranking: the table has no " + JSON.stringify(name) + " column");
      col[name] = i - 1;
    });
    var companies = data.rows.map(function (r) {
      var reading = r.values[col["Reading"]];
      if (reading == null) throw new Error("ranking: " + r.label + " has no reading");
      var joins = (r.cells[col["Joins the sample"]] || "").trim();
      if (!/^(at the start|added)$/i.test(joins)) {
        throw new Error("ranking: " + r.label + " joins the sample " + JSON.stringify(joins) +
                        ", not \"At the start\" or \"Added\"");
      }
      return { name: r.label, reading: reading, starts: /^at the start$/i.test(joins) };
    });
    var base = 0;
    while (base < companies.length && companies[base].starts) base++;
    if (companies.slice(base).some(function (c) { return c.starts; })) {
      throw new Error("ranking: a company is added before the starting sample is complete");
    }
    if (Math.floor(base / 4) < 1) throw new Error("ranking: the top quartile of the starting sample is nobody");
    if (base === companies.length) throw new Error("ranking: the table has no company to add");

    var size = base, doubled = false, before = null, fresh = -1;

    /* The withdrawn definition, whole: within-sample z-score, sigmoid, top quartile by rank. */
    function score(n) {
      var xs = companies.slice(0, n).map(function (c) { return doubled ? c.reading * 2 : c.reading; });
      var mean = xs.reduce(function (a, x) { return a + x; }, 0) / n;
      var sd = Math.sqrt(xs.reduce(function (a, x) { return a + (x - mean) * (x - mean); }, 0) / n);
      if (!sd) throw new Error("ranking: every reading is the same, so there is no spread to score against");
      var p = xs.map(function (x) { return 1 / (1 + Math.exp(-(x - mean) / sd)); });
      var order = p.map(function (_, i) { return i; }).sort(function (a, b) { return p[b] - p[a] || a - b; });
      var top = order.slice(0, Math.floor(n / 4));
      return p.map(function (v, i) {
        return { shown: v.toFixed(2), at: v, flagged: top.indexOf(i) >= 0 };
      });
    }

    var bar = make("div", "exhibit__controls", stage);
    var add = button(bar, "btn btn--solid", "");
    var readings = segmented(bar, "Readings", ["As filed", "Doubled"], function (i) {
      if (doubled === (i === 1)) return;
      before = score(size);
      doubled = i === 1;
      update("doubled");
    });
    add.addEventListener("click", function () {
      var was = score(size);
      if (size < companies.length) {
        before = was;
        size++;
        update("added");
      } else {
        before = null;
        size = base;
        update("reset");
      }
    });

    var frame = make("div", "exhibit__frame", stage);
    var chart = make("div", "rank", frame);
    var head = make("div", "rank__head", chart);
    head.setAttribute("aria-hidden", "true");
    make("span", "", head, data.columns[0]);
    make("span", "", head, data.columns[1 + col["Reading"]]);
    make("span", "rank__head-score", head, "Score, as reported: the probability the filing was machine-written");
    var list = make("ol", "rank__list", chart);
    var rows = companies.map(function (c) {
      var li = make("li", "rank__company", list);
      make("span", "", li, c.name);
      var reading = make("span", "rank__reading", li);
      var track = make("span", "rank__track", li);
      track.setAttribute("aria-hidden", "true");
      var ghost = make("span", "rank__ghost", track);
      var dot = make("span", "rank__dot", track);
      var value = make("b", "rank__score", li);
      value.setAttribute("data-result", "");
      var flag = make("span", "rank__flag chip chip--trouble", li);
      flag.setAttribute("data-result", "");
      return { li: li, reading: reading, ghost: ghost, dot: dot, value: value, flag: flag };
    });

    var readout = make("div", "exhibit__readout", stage);
    readout.setAttribute("aria-live", "polite");
    var line = make("p", "exhibit__count", readout);
    var tally = make("b", "", line);
    tally.setAttribute("data-result", "");
    var phrase = line.appendChild(document.createTextNode(""));
    var note = make("p", "exhibit__note", readout);
    var note0 = "Each score says where a filing sits in this sample, not how likely it is to be machine-written.";

    /* mode: "added", "doubled", "reset", or nothing for the first drawing. */
    function update(mode) {
      var now = score(size), n = size;
      if (mode === "added") fresh = n - 1;
      else if (mode !== "doubled") fresh = -1;
      /* The tally counts the rows the rule flagged, never the quartile it is meant to be. */
      var k = now.filter(function (s) { return s.flagged; }).length;
      add.textContent = size < companies.length ? "Add a company" : "Back to the starting sample";
      readings.press(doubled ? 1 : 0);
      rows.forEach(function (r, i) {
        var s = now[i], old = before && i < before.length ? before[i] : null;
        r.li.hidden = !s;
        r.value.textContent = s ? s.shown : "";
        r.flag.textContent = s && s.flagged ? "Flagged" : "";
        r.flag.hidden = !(s && s.flagged);
        if (!s) return;
        r.li.classList.toggle("is-flagged", s.flagged);
        r.li.classList.toggle("is-new", i === fresh);
        r.reading.textContent = String(doubled ? companies[i].reading * 2 : companies[i].reading);
        r.dot.style.left = (s.at * 100) + "%";
        r.ghost.hidden = !old || old.shown === s.shown;
        if (old) r.ghost.style.left = (old.at * 100) + "%";
      });
      tally.textContent = k + " of " + n;
      phrase.nodeValue = " flagged: the top quartile" + (n % 4 ? ", rounded down" : "");

      if (mode === "added") {
        var kept = before.length, moved = 0, lost = [], gained = [];
        for (var i = 0; i < kept; i++) {
          if (before[i].shown !== now[i].shown) moved++;
          if (before[i].flagged && !now[i].flagged) lost.push(companies[i].name);
          if (!before[i].flagged && now[i].flagged) gained.push(companies[i].name);
        }
        note.textContent = companies[n - 1].name + " joined. " +
          (moved === kept ? "All " + kept : moved + " of " + kept) +
          " scores already given moved, and not one of those filings changed." +
          (lost.length ? " " + lost.join(" and ") + " lost " + (lost.length === 1 ? "its flag" : "their flags") + "." : "") +
          (gained.length ? " " + gained.join(" and ") + " gained one." : "");
      } else if (mode === "doubled") {
        note.textContent = (doubled ? "Every reading doubled" : "Every reading back as filed") +
          ", and not one score moved: the same companies are flagged, because a score within the " +
          "sample does not see a change every filing shares.";
      } else if (mode === "reset") {
        note.textContent = "The sample is back to its start.";
      } else {
        note.textContent = note0;
      }
    }

    update();
  });

  /* ---- KIND: placebo-break ---------------------------------------------------------------------
     The Research's re-run, on a synthetic series. The table lists a score by quarter ("2016 Q1"),
     consecutive and oldest first, and marks the quarters where a placebo break was tested. The
     columns are found by their headers: "Score", and "Placebo break" ("Tested", or a dash).

     A break at a quarter is a step that is 0 before it and 1 from it on. Its jump is estimated by
     least squares, on its own (the level alone) or beside a linear time trend, and it is called
     significant where its t-statistic is 1.96 or more either way - the 5% level, two-sided, the
     same rule for every date. The shared slider moves the break across the tested quarters, with the
     date in hand written above it; a segmented pair adds the trend. The drawing is the series as points, the break as a line, and
     the fitted specification on top: two flat levels without the trend, one sloped line with a step
     in it with the trend. Beneath it every tested date is marked significant or not, so a reader
     sees the whole re-run as well as the date in hand.

     Results (data-result): each tested date's verdict in the strip, in table order (", significant"
     or ", not significant"), the placebo tally "k of n", then the date in hand, its jump (always
     signed), its t ("t = 5.2") and the verdict. Nothing plays, so there is no aria-busy, and there are no hover readouts.

     A table the drawing cannot show truthfully is refused: quarters that are not consecutive, a
     score that is not a figure, a mark other than "Tested" or a dash, no tested date, a tested date
     with fewer than two quarters on either side (its jump would rest on one point), or a series a
     specification fits exactly (no t-statistic exists). The strip of dates wraps and the chart
     scales, so no table widens the page. */
  register("placebo-break", function (fig, stage, data) {
    var CRITICAL = 1.96, SIDE = 2;
    var col = {};
    ["Score", "Placebo break"].forEach(function (name) {
      var i = data.columns.indexOf(name);
      if (i < 1) throw new Error("placebo-break: the table has no " + JSON.stringify(name) + " column");
      col[name] = i - 1;
    });
    var quarters = data.rows.map(function (r, i) {
      var m = /^(\d{4}) Q([1-4])$/.exec(r.label);
      if (!m) throw new Error("placebo-break: " + JSON.stringify(r.label) + " is not a quarter, such as \"2016 Q1\"");
      var ordinal = +m[1] * 4 + (+m[2] - 1);
      var score = r.values[col["Score"]];
      if (score == null) throw new Error("placebo-break: " + r.label + " has no score");
      var mark = (r.cells[col["Placebo break"]] || "").trim();
      if (!/^(tested|—|-|)$/i.test(mark)) {
        throw new Error("placebo-break: " + r.label + " is marked " + JSON.stringify(mark) + ", not \"Tested\" or a dash");
      }
      return { label: r.label, year: m[1], ordinal: ordinal, score: score, tested: /^tested$/i.test(mark), i: i };
    });
    quarters.forEach(function (q, i) {
      if (i && q.ordinal !== quarters[i - 1].ordinal + 1) {
        throw new Error("placebo-break: " + q.label + " does not follow " + quarters[i - 1].label);
      }
    });
    var n = quarters.length;
    var dates = quarters.filter(function (q) { return q.tested; });
    if (!dates.length) throw new Error("placebo-break: no quarter is marked as a tested placebo break");
    dates.forEach(function (q) {
      if (q.i < SIDE || n - q.i < SIDE) {
        throw new Error("placebo-break: a break at " + q.label + " has fewer than " + SIDE + " quarters on one side");
      }
    });
    var ys = quarters.map(function (q) { return q.score; });

    /* Least squares by the normal equations, and the t-statistic of the last coefficient (the jump). */
    function fit(breakAt, trend) {
      var X = quarters.map(function (q, i) {
        var row = [1];
        if (trend) row.push(i);
        row.push(i >= breakAt ? 1 : 0);
        return row;
      });
      var k = X[0].length, A = [], j, c, r;
      for (j = 0; j < k; j++) {
        A.push([]);
        for (c = 0; c < k; c++) A[j].push(X.reduce(function (s, x) { return s + x[j] * x[c]; }, 0));
        for (c = 0; c < k; c++) A[j].push(j === c ? 1 : 0);
      }
      for (c = 0; c < k; c++) {
        var p = c;
        for (r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
        var tmp = A[c]; A[c] = A[p]; A[p] = tmp;
        var pv = A[c][c];
        if (Math.abs(pv) < 1e-12) throw new Error("placebo-break: the specification cannot be estimated");
        for (j = 0; j < 2 * k; j++) A[c][j] /= pv;
        for (r = 0; r < k; r++) {
          if (r === c) continue;
          var f = A[r][c];
          for (j = 0; j < 2 * k; j++) A[r][j] -= f * A[c][j];
        }
      }
      var inv = A.map(function (row) { return row.slice(k); });
      var xty = [];
      for (j = 0; j < k; j++) xty.push(X.reduce(function (s, x, i) { return s + x[j] * ys[i]; }, 0));
      var b = inv.map(function (row) { return row.reduce(function (s, v, c2) { return s + v * xty[c2]; }, 0); });
      var ssr = X.reduce(function (s, x, i) {
        var e = ys[i] - x.reduce(function (a, v, c2) { return a + v * b[c2]; }, 0);
        return s + e * e;
      }, 0);
      var s2 = ssr / (n - k);
      if (!(s2 > 0)) throw new Error("placebo-break: the specification fits the series exactly, so there is no t-statistic");
      var jump = b[k - 1], t = jump / Math.sqrt(s2 * inv[k - 1][k - 1]);
      return { b: b, jump: jump, t: t, significant: Math.abs(t) >= CRITICAL, trend: trend };
    }

    var current = 0, trend = false;

    var bar = make("div", "exhibit__controls", stage);
    /* The slider's value, written above it for a sighted reader; the slider announces its own. */
    var pick = make("div", "placebo__pick", bar);
    var caption = make("p", "placebo__caption", pick, "Placebo break: ");
    caption.setAttribute("aria-hidden", "true");
    var dateShown = make("b", "", caption);
    slider(pick, {
      min: 0, max: dates.length - 1, step: 1, value: 0, label: "Placebo break",
      valueText: function (v) { return "Break at " + dates[v].label; },
      onChange: function (v) { current = v; update(); },
    });
    var specs = segmented(bar, "Specification", ["Level only", "With a time trend"], function (i) {
      trend = i === 1;
      update();
    });

    /* The chart: points, the break, and the fit. Drawn in its own units and scaled to the frame, so
       it fits any width; the words about it are HTML around it, never scaled text inside it. */
    var W = 600, H = 220, PAD = 12;
    var frame = make("div", "exhibit__frame", stage);
    var chart = make("div", "placebo", frame);
    make("p", "placebo__heading", chart, data.columns[1 + col["Score"]] + ", by quarter");
    chart.insertAdjacentHTML("beforeend", '<svg class="placebo__plot" viewBox="0 0 ' + W + " " + H +
                             '" aria-hidden="true" focusable="false"></svg>');
    var svg = chart.lastChild;
    var after = svgChild(svg, "rect", "placebo__after");
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    function x(i) { return PAD + i * (W - 2 * PAD) / (n - 1); }
    function y(v) { return H - PAD - (v - lo) / (hi - lo || 1) * (H - 2 * PAD); }
    quarters.forEach(function (q, i) {
      var c = svgChild(svg, "circle", "placebo__point");
      c.setAttribute("cx", x(i));
      c.setAttribute("cy", y(q.score));
      c.setAttribute("r", 4);
    });
    var fitBefore = svgChild(svg, "line", "placebo__fit"), fitAfter = svgChild(svg, "line", "placebo__fit");
    var rule = svgChild(svg, "line", "placebo__break");
    var axis = make("p", "placebo__axis", chart);
    axis.setAttribute("aria-hidden", "true");
    make("span", "", axis, quarters[0].year);
    make("span", "", axis, quarters[n - 1].year);

    var strip = make("ol", "placebo__dates", chart);
    strip.setAttribute("aria-label", "Every placebo date tested");
    var marks = dates.map(function (q) {
      var li = make("li", "placebo__date", strip);
      make("span", "placebo__mark", li).setAttribute("aria-hidden", "true");
      make("span", "", li, q.label);
      var word = make("span", "visually-hidden", li);
      word.setAttribute("data-result", "");
      return { li: li, word: word };
    });

    var readout = make("div", "exhibit__readout", stage);
    readout.setAttribute("aria-live", "polite");
    var count = make("p", "exhibit__count", readout);
    var tally = make("b", "", count);
    tally.setAttribute("data-result", "");
    count.appendChild(document.createTextNode(" placebo dates come back significant"));
    var atLine = make("p", "placebo__at", readout);
    atLine.appendChild(document.createTextNode("Break at "));
    var dateOut = make("b", "", atLine);
    atLine.appendChild(document.createTextNode(": a jump of "));
    var jump = make("span", "", atLine);
    atLine.appendChild(document.createTextNode(", "));
    var tText = make("span", "placebo__t", atLine);
    atLine.appendChild(document.createTextNode(" "));
    var verdict = make("span", "chip placebo__verdict", atLine);
    [dateOut, jump, tText, verdict].forEach(function (r) { r.setAttribute("data-result", ""); });
    var note = make("p", "exhibit__note", readout);

    function signed(v, places) {
      var s = Math.abs(v).toFixed(places);
      return (v < 0 && +s ? "−" : "+") + s;
    }

    function update() {
      var all = dates.map(function (q) { return fit(q.i, trend); });
      var now = all[current], q = dates[current], b = now.b;
      specs.press(trend ? 1 : 0);
      marks.forEach(function (m, i) {
        m.li.classList.toggle("is-significant", all[i].significant);
        m.li.classList.toggle("is-current", i === current);
        m.word.textContent = all[i].significant ? ", significant" : ", not significant";
      });
      /* The fitted line: its value at a quarter, either side of the break. */
      function fitted(i) { return b[0] + (trend ? b[1] * i : 0) + (i >= q.i ? now.jump : 0); }
      function placeFit(ln, from, to) {
        ln.setAttribute("x1", x(from)); ln.setAttribute("y1", y(fitted(from)));
        ln.setAttribute("x2", x(to)); ln.setAttribute("y2", y(fitted(to)));
      }
      placeFit(fitBefore, 0, q.i - 1);
      placeFit(fitAfter, q.i, n - 1);
      var bx = (x(q.i - 1) + x(q.i)) / 2;
      rule.setAttribute("x1", bx); rule.setAttribute("x2", bx);
      rule.setAttribute("y1", 0); rule.setAttribute("y2", H);
      after.setAttribute("x", bx); after.setAttribute("y", 0);
      after.setAttribute("width", W - bx); after.setAttribute("height", H);

      tally.textContent = all.filter(function (f) { return f.significant; }).length + " of " + dates.length;
      dateShown.textContent = q.label;
      dateOut.textContent = q.label;
      jump.textContent = signed(now.jump, 1);
      tText.textContent = "t = " + signed(now.t, 1).replace(/^\+/, "");
      verdict.textContent = now.significant ? "Significant" : "Not significant";
      verdict.classList.toggle("chip--trouble", now.significant);
      verdict.classList.toggle("chip--plain", !now.significant);
      note.textContent = trend
        ? "With the drift in the specification, the jump left at each date is noise: what the placebo found was the trend."
        : "Nothing happened at any of these dates. The score drifts upward, so the quarters after any date tend to sit higher than the ones before it.";
    }

    update();
  });

  /* ---- KIND: regime-vector ---------------------------------------------------------------------
     MacroSense's classifier resolves to one of its regimes, with a probability across all of them,
     and the briefing is handed the whole vector. The table lists each regime with the constraint set
     the optimiser applies under it, and the page's worked example: a probability for each regime in
     a close call and in a decisive one, one column each, descending down the rows, so the first row
     leads and the second is the runner-up. The table's order is the order of the vector, so the
     rows are its ranks.

     A bar per regime, and a button: pressing one makes it the leading regime. As in the prototype,
     the runner-up is the next row round, and the remaining ranks go to the other regimes in the
     table's order. The shared slider runs from the close call to the decisive one, and every bar
     moves between its two columns. The result is the sentence stating the call, which names the
     leading regime and its probability; below it, the constraint set the leading regime carries.

     A table the drawing cannot show is refused (the stage stays empty and the table stands alone):
     a probability that is not a figure, a call that does not sum to one or does not descend down
     the rows, a regime with no constraint set, or more regimes than colours. Its columns are found
     by their headers. */
  register("regime-vector", function (fig, stage, data) {
    var PALETTE = 4;
    var col = {};
    ["Constraint set", "Close call", "Decisive"].forEach(function (name) {
      var i = data.columns.indexOf(name);
      if (i < 1) throw new Error("regime-vector: the table has no " + JSON.stringify(name) + " column");
      col[name] = i - 1;
    });
    var n = data.rows.length;
    if (n < 2) throw new Error("regime-vector: a vector needs at least two regimes");
    if (n > PALETTE) throw new Error("regime-vector: more regimes than colours");
    var regimes = data.rows.map(function (r) {
      var close = r.values[col["Close call"]], decisive = r.values[col.Decisive];
      var cons = r.cells[col["Constraint set"]] || "";
      if (close === null || decisive === null) {
        throw new Error("regime-vector: " + r.label + " has no probability in each call");
      }
      if (!cons) throw new Error("regime-vector: " + r.label + " has no constraint set");
      return { name: r.label, cons: cons, close: close, decisive: decisive };
    });
    ["close", "decisive"].forEach(function (call) {
      var sum = 0;
      regimes.forEach(function (g, i) {
        sum += g[call];
        if (i && g[call] > regimes[i - 1][call]) {
          throw new Error("regime-vector: the " + call + " call does not descend down the rows");
        }
      });
      if (Math.abs(sum - 1) > 0.005) throw new Error("regime-vector: the " + call + " call sums to " + sum.toFixed(2));
    });
    var lead = 0, margin = 0;
    var COUNT = ["both", "all three", "all four"];
    var every = COUNT[n - 2];

    var bars = make("div", "regime", stage);
    bars.setAttribute("role", "group");
    bars.setAttribute("aria-label", "Leading regime");
    var marks = regimes.map(function (g, i) {
      var b = button(bars, "regime__bar", null, i === 0);
      make("span", "regime__name", b, g.name);
      var track = make("span", "regime__track", b);
      track.setAttribute("aria-hidden", "true");
      var fill = make("span", "regime__fill", track);
      var val = make("span", "regime__val", b);
      b.addEventListener("click", function () { lead = i; update(); });
      return { b: b, fill: fill, val: val };
    });

    /* The probability of the regime ranked k in the worked example, t of the way to decisive. */
    function at(k, t) {
      var g = regimes[k];
      return g.close + (g.decisive - g.close) * t;
    }
    /* The leading regime and its probability, t of the way to decisive: the slider's value text and
       the start of the call sentence. */
    function callText(t) {
      return regimes[lead].name + " at " + at(0, t).toFixed(2);
    }
    function lowerFirst(w) { return w.charAt(0).toLowerCase() + w.slice(1); }

    /* The ends of the slider are the table's own names for the two calls. */
    var ctl = make("div", "exhibit__controls regime__ctl", stage);
    make("span", "regime__end", ctl, data.columns[col["Close call"] + 1]);
    var s = slider(ctl, {
      min: 0, max: 100, step: 5, value: 0, label: "Margin of the leading regime",
      valueText: function (v) { return callText(v / 100); },
      onChange: function (v) { margin = v / 100; update(); }
    });
    make("span", "regime__end", ctl, data.columns[col.Decisive + 1]);

    var readout = make("div", "exhibit__readout regime__readout", stage);
    readout.setAttribute("aria-live", "polite");
    var read = make("p", "regime__read", readout);
    read.setAttribute("data-result", "");
    var cons = make("p", "regime__cons", readout);

    function update() {
      /* Each regime's rank: the leader first, the next row round second, the rest in table order. */
      var runnerUp = (lead + 1) % n, rank = [], next = 2;
      regimes.forEach(function (g, i) {
        rank[i] = i === lead ? 0 : i === runnerUp ? 1 : next++;
      });
      marks.forEach(function (m, i) {
        var p = at(rank[i], margin);
        m.b.setAttribute("aria-pressed", String(i === lead));
        m.fill.style.width = (p * 100) + "%";
        m.val.textContent = p.toFixed(2);
        /* Named in words, since the name and the figure are two spans read with no space between. */
        m.b.setAttribute("aria-label", regimes[i].name + ", " + p.toFixed(2));
      });
      var leader = regimes[lead].name, call = "Called " + callText(margin);
      read.textContent = margin < 0.4
        ? call + ", with " + regimes[runnerUp].name + " at " + at(1, margin).toFixed(2) + ". The label is the same; the call is close to a coin toss."
        : margin < 0.8 ? call + ". A lean, not a certainty — the briefing is handed " + every + "."
        : call + ". Same label as the close call; a different statement.";
      cons.textContent = "Constraint set for " + leader + ": " + lowerFirst(regimes[lead].cons) + ".";
      s.el.setAttribute("aria-valuetext", callText(margin));
    }

    update();
  });

  /* ---- KIND: decision-window -------------------------------------------------------------------
     MacroSense's reason for printing no return: its whole history is one short window, and a replay
     of it makes a handful of decisions. The table lists each rebalance frequency with the decisions
     it would make in the window, most frequent first; the first row rebalances every trading day,
     so its count is the window's length in trading days. A count may carry the page's own hedge
     ("roughly 11"), which the drawing keeps, because the figure is the prose's and so is the hedge.

     Two tiers. Above, a long axis for the several years a figure would need, with the window a
     sliver at its end; the axis is drawn to no stated scale and says so in the source line, because
     the page names no length for it. Below, the window enlarged, one tick per trading day, with a
     mark on each day the chosen frequency decides, spread evenly across it and set half
     a step in, so no rarer frequency decides on the window's first day. A segmented choice picks the
     frequency, opening on the second row: the first is every trading day, a solid bar that makes
     the point by saturation, and the second is the page's own default. The result is the count.

     A window that grows past what a 320px stage holds a tick a day for is drawn coarser, not
     refused: up to GAPPED ticks keep their 1px gaps; past GAPPED days a tick stands for a week of
     trading days (WEEK), marked when a decision falls in it; past GAPPED weeks the weeks close up,
     and past DENSE weeks a tick would be narrower than a pixel at 320px, which is the one length
     refused. The enlarged window's label says when a tick is a week. Each marked tick's data-mark
     is the number of decisions it holds (one a day at most, so up to WEEK on a week's tick), and
     the strip's data-per-tick is the trading days a tick stands for, so the marks always add up to
     the count read out, however coarse the drawing.

     A table the drawing cannot show is refused (the stage stays empty and the table stands alone):
     no "Decisions in the window" column, found by its header; a count that is not a whole number; a
     first row that hedges, since it is the window's length; a window of more than DENSE weeks; or
     counts that do not fall down the rows, since a rarer rebalance cannot decide more often. */
  var GAPPED = 100, DENSE = 250, WEEK = 5;
  register("decision-window", function (fig, stage, data) {
    var col = data.columns.indexOf("Decisions in the window");
    if (col < 1) throw new Error('decision-window: the table has no "Decisions in the window" column');
    if (data.rows.length < 2) throw new Error("decision-window: there is nothing to compare one frequency with");
    var options = data.rows.map(function (r, i) {
      var m = /^(roughly )?(\d+)$/i.exec(r.cells[col - 1] || "");
      if (!m || +m[2] < 1) {
        throw new Error("decision-window: " + r.label + " counts " + JSON.stringify(r.cells[col - 1]) +
                        ", not a number of decisions");
      }
      if (i === 0 && m[1]) throw new Error("decision-window: the first row is the window's length, and cannot hedge");
      return { name: r.label, count: +m[2], said: r.cells[col - 1] };
    });
    options.forEach(function (o, i) {
      if (i && o.count >= options[i - 1].count) {
        throw new Error("decision-window: " + o.name + " decides as often as " + options[i - 1].name + " or more");
      }
    });
    var days = options[0].count, pick = 1;
    var bin = days > GAPPED ? WEEK : 1, count = Math.ceil(days / bin);
    if (count > DENSE) {
      throw new Error("decision-window: " + days + " trading days is more than " + DENSE +
                      " weeks, and a narrow screen cannot draw a tick for each");
    }

    var bar = make("div", "exhibit__controls", stage);
    var group = make("div", "seg", bar);
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Rebalance frequency");
    var picks = options.map(function (o, i) {
      var b = button(group, "seg__option", o.name, i === pick);
      b.addEventListener("click", function () { pick = i; update(); });
      return b;
    });

    /* The long axis and the window at its end. */
    var years = make("div", "dwin__years", stage);
    make("div", "dwin__label", years, "Several years and several regimes: the history the backfill is building");
    var axis = make("div", "dwin__axis", years);
    axis.setAttribute("aria-hidden", "true");
    make("span", "dwin__sliver", axis);
    make("div", "dwin__label dwin__label--end", years, "The window: every trading day so far");

    /* The window, enlarged: a tick per trading day. */
    var zoom = make("div", "dwin__zoom", stage);
    var per = bin > 1 ? ", a tick for each week" : "";
    make("div", "dwin__label", zoom, "The window, enlarged: " + days + " trading days" + per);
    var strip = make("div", count > GAPPED ? "dwin__days dwin__days--dense" : "dwin__days", zoom);
    strip.setAttribute("role", "img");
    strip.setAttribute("data-per-tick", String(bin));
    var ticks = [];
    for (var d = 0; d < count; d++) ticks.push(make("span", "dwin__day", strip));

    var readout = make("div", "exhibit__readout", stage);
    readout.setAttribute("aria-live", "polite");
    var line = make("p", "exhibit__count", readout);
    var tally = make("b", "", line);
    tally.setAttribute("data-result", "");
    var phrase = line.appendChild(document.createTextNode(""));
    var note = make("p", "exhibit__note", readout);

    function update() {
      var o = options[pick], on = {};
      picks.forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === pick)); });
      for (var k = 0; k < o.count; k++) {
        var day = Math.floor((k + 0.5) * days / o.count);
        on[Math.floor(day / bin)] = (on[Math.floor(day / bin)] || 0) + 1;
      }
      ticks.forEach(function (t, i) {
        t.classList.toggle("is-decision", !!on[i]);
        if (on[i]) t.setAttribute("data-mark", String(on[i]));
        else t.removeAttribute("data-mark");
      });
      strip.setAttribute("aria-label", o.said + " decisions marked across " + days + " trading days" + per);
      tally.textContent = o.said;
      phrase.nodeValue = o.count === 1 ? " decision in the window" : " decisions in the window";
      note.textContent = "One market environment, read " + (o.count === 2 ? "twice" : o.said + " times") +
        ": a ratio annualized from it would describe the window, not the system.";
    }

    update();
  });

  /* ---- KIND: scheduler-week --------------------------------------------------------------------
     MacroSense's scheduler, as a week on a calendar strip. The table lists each scheduled job with
     when it runs, in the page's words; the kind reads three kinds of rule from them: "each trading
     day" (every weekday, since the week drawn has no exchange holiday and the weekend is not
     trading), "the first of the month", and a weekday by name ("on Sunday"). One lane per job, one
     column per day, Monday first; each run is a mark (data-mark, "job, day").

     The month turns on no fixed weekday, so the reader picks where the first of the month falls,
     or that it falls in no day of this week; it opens on Saturday, where the three jobs land on
     three separate days and each is plainly on its own calendar. The result is the sentence saying
     where the retrain runs and what runs beside it.

     A table the drawing cannot show is refused (the stage stays empty and the table stands alone):
     no "Runs" column, found by its header; a rule it cannot read, or one that reads as more than one
     (a job runs on one calendar); no job on the first of the month, which leaves nothing to
     choose; or a job name with a word longer than LANE_WORD letters, which would push its lane
     label and seven days past a 320px screen. */
  var WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var TRADING = 5, LANE_WORD = 9;
  register("scheduler-week", function (fig, stage, data) {
    var col = data.columns.indexOf("Runs");
    if (col < 1) throw new Error('scheduler-week: the table has no "Runs" column');
    if (!data.rows.length) throw new Error("scheduler-week: the table schedules no job");
    var jobs = data.rows.map(function (r) {
      var rule = (r.cells[col - 1] || "").toLowerCase(), day = -1;
      r.label.split(/\s+/).forEach(function (w) {
        if (w.length > LANE_WORD) {
          throw new Error("scheduler-week: " + JSON.stringify(w) + " is too long a word for a lane label at 320px");
        }
      });
      var said = JSON.stringify(r.cells[col - 1]), found = [];
      WEEKDAYS.forEach(function (d, i) {
        if (new RegExp("\\bon " + d.toLowerCase() + "\\b").test(rule)) { day = i; found.push("weekday"); }
      });
      if (/\beach trading day\b/.test(rule)) found.push("trading");
      if (/\bthe first of the month\b/.test(rule)) found.push("first");
      if (!found.length) throw new Error("scheduler-week: " + r.label + " runs " + said + ", a rule it cannot draw");
      if (found.length > 1) {
        throw new Error("scheduler-week: " + r.label + " runs " + said + ", which reads as more than one rule");
      }
      var when = found[0];
      return { name: r.label, when: when, day: day };
    });
    var monthly = jobs.filter(function (j) { return j.when === "first"; });
    if (!monthly.length) throw new Error("scheduler-week: no job runs on the first of the month, so there is nothing to choose");

    /* The choice: the weekday the month turns on, or none this week. Opens on Saturday. */
    var first = WEEKDAYS.indexOf("Saturday");
    var bar = make("div", "exhibit__controls", stage);
    var ask = make("span", "sched__ask", bar, "The first of the month falls on");
    ask.id = fig.id + "-ask";
    var group = make("div", "seg", bar);
    group.setAttribute("role", "group");
    group.setAttribute("aria-labelledby", ask.id);
    var picks = WEEKDAYS.concat(["No day this week"]).map(function (d, i) {
      var b = button(group, "seg__option", i < WEEKDAYS.length ? d.slice(0, 3) : d, i === first);
      /* The rest of the day's name is read, not drawn, so the name a screen reader speaks begins
         with the words a sighted reader sees on the button (label in name). */
      if (i < WEEKDAYS.length) make("span", "visually-hidden", b, d.slice(3));
      b.addEventListener("click", function () { first = i; update(); });
      return b;
    });

    /* The strip: a corner, the seven days, then a lane per job. */
    var grid = make("div", "sched", stage);
    grid.setAttribute("role", "img");
    make("span", null, grid);
    var heads = WEEKDAYS.map(function (d, i) {
      var h = make("span", "sched__day" + (i < TRADING ? "" : " is-shut"), grid, d.slice(0, 3));
      h.setAttribute("aria-hidden", "true");
      return h;
    });
    var cells = jobs.map(function (j) {
      make("span", "sched__job", grid, j.name).setAttribute("aria-hidden", "true");
      return WEEKDAYS.map(function (d, i) {
        return make("span", "sched__cell" + (i < TRADING ? "" : " is-shut"), grid);
      });
    });

    var readout = make("div", "exhibit__readout", stage);
    readout.setAttribute("aria-live", "polite");
    var read = make("p", "sched__read", readout);
    read.setAttribute("data-result", "");
    var daily = jobs.filter(function (j) { return j.when === "trading"; });
    if (daily.length) {
      make("p", "exhibit__note", readout, "Saturday and Sunday are not trading days, so no " +
           daily.map(function (j) { return lower(j.name); }).join(" or ") + " runs on them.");
    }

    function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
    function runs(j, i) {
      return j.when === "trading" ? i < TRADING : j.when === "weekday" ? i === j.day : i === first;
    }
    function names(list) {
      return list.length < 2 ? list.join("") : list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
    }

    function update() {
      picks.forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === first)); });
      heads.forEach(function (h, i) { h.classList.toggle("is-first", i === first); });
      var said = [];
      jobs.forEach(function (j, r) {
        var on = [];
        cells[r].forEach(function (c, i) {
          var yes = runs(j, i);
          c.classList.toggle("is-first", i === first);
          c.classList.toggle("is-run", yes);
          if (yes) { c.setAttribute("data-mark", j.name + ", " + WEEKDAYS[i]); on.push(WEEKDAYS[i]); }
          else c.removeAttribute("data-mark");
        });
        said.push(j.name + ": " + (on.length ? names(on) : "no day this week"));
      });
      grid.setAttribute("aria-label", "The scheduler's week. " + said.join(". ") + ".");
      var what = names(monthly.map(function (j) { return "the " + lower(j.name); }));
      if (first >= WEEKDAYS.length) {
        read.textContent = "With no first of the month this week, " + what + " does not run.";
        return;
      }
      var beside = jobs.filter(function (j) { return j.when !== "first" && runs(j, first); })
                       .map(function (j) { return "the " + lower(j.name); });
      read.textContent = "With the first of the month on " + WEEKDAYS[first] + ", " + what + " runs that day, " +
        (beside.length ? "beside " + names(beside) : "the only job on it") + ".";
    }

    update();
  });

  /* ---- KIND: radius-map ------------------------------------------------------------------------
     A synthetic map of locations. The table's columns, found by their headers: the location, its
     Area, where it sits in miles east and north of the map's south-west corner, its Loan income and
     Deposit expense in dollars a year, the Net of the two, and its holder's Age and Age band. The
     row marked data-lead is the location the readout shows before a reader points at one.

     A circle is placed by a mouse press or drag on the map, a tap on it, or by choosing an Area (its centre is
     the mean of its locations), and sized by the slider. The totals give what the circle holds and
     what it earns, and the age profile counts it by the table's bands. Every location is a button:
     hovering, focusing or pressing one shows its subtraction. Before it plays, the map shows the state
     the playback ends on; on first view the circle travels from the first Area to the lead's, so the
     opening view is the circle holding the location it shows.

     Compact mode (the homepage) drops the choice of Area; the map, the slider and the readouts stay.

     A table the drawing cannot show is refused (the stage stays empty and the table stands alone): a
     net that is not the loan income less the deposit expense, a negative balance line, an age outside
     its band, a location off the map's corner, an Area name too long to label a button at 320px, two
     rows under one name, or no lead location. */
  register("radius-map", function (fig, stage, data, opts) {
    var LONGEST_NAME = 16, RADIUS = { min: 0.5, max: 6, step: 0.5, open: 1.5, value: 3 }, PLAY_MS = 1600;
    function col(name) {
      var i = data.columns.indexOf(name) - 1;
      if (i < 0) throw new Error("radius-map: the table has no " + name + " column");
      return i;
    }
    var AREA = col("Area"), EAST = col("Miles east"), NORTH = col("Miles north"), LOAN = col("Loan income"),
        DEPOSIT = col("Deposit expense"), NET = col("Net"), AGE = col("Age"), BAND = col("Age band");
    function dollars(s) { return number(s.replace(/−/g, "-")); }
    function money(v) { return (v < 0 ? "−" : "+") + "$" + Math.abs(Math.round(v)).toLocaleString("en-US"); }
    function miles(v) { return v.toFixed(1) + (v === 1 ? " mile" : " miles"); }

    var trs = fig.querySelectorAll("tbody tr");
    var bands = [], areas = [], names = {};
    function band(name) {
      var m = /^(\d+)(?:–(\d+)|\+)$/.exec(name);
      if (!m) throw new Error("radius-map: " + JSON.stringify(name) + " is not an age band");
      return { name: name, lo: +m[1], hi: m[2] ? +m[2] : Infinity };
    }
    var spots = data.rows.map(function (r, i) {
      var s = { label: r.label, area: r.cells[AREA], east: r.values[EAST], north: r.values[NORTH],
                loan: dollars(r.cells[LOAN]), deposit: dollars(r.cells[DEPOSIT]), net: dollars(r.cells[NET]),
                age: r.values[AGE], band: r.cells[BAND], lead: trs[i].hasAttribute("data-lead") };
      if (names[s.label]) throw new Error("radius-map: two rows are named " + JSON.stringify(s.label));
      names[s.label] = true;
      [["Miles east", s.east], ["Miles north", s.north], ["Loan income", s.loan],
       ["Deposit expense", s.deposit], ["Net", s.net], ["Age", s.age]].forEach(function (p) {
        if (p[1] === null) throw new Error("radius-map: " + s.label + " has no figure for " + p[0]);
      });
      if (s.east < 0 || s.north < 0) throw new Error("radius-map: " + s.label + " sits off the map's corner");
      if (s.loan < 0 || s.deposit < 0) throw new Error("radius-map: " + s.label + " has a negative loan income or deposit expense");
      if (s.net !== s.loan - s.deposit) {
        throw new Error("radius-map: " + s.label + " nets " + s.net + ", and " + s.loan + " less " + s.deposit +
                        " is " + (s.loan - s.deposit));
      }
      var b = band(s.band);
      if (s.age < b.lo || s.age > b.hi) throw new Error("radius-map: " + s.label + " is aged " + s.age + ", outside " + s.band);
      if (!bands.some(function (o) { return o.name === b.name; })) bands.push(b);
      if (!s.area || s.area.length > LONGEST_NAME) {
        throw new Error("radius-map: " + JSON.stringify(s.area) + " cannot label a button at 320px");
      }
      var a = areas.filter(function (o) { return o.name === s.area; })[0];
      if (!a) areas.push(a = { name: s.area, members: [] });
      a.members.push(s);
      return s;
    });
    if (!spots.length) throw new Error("radius-map: the table has no locations");
    var lead = spots.filter(function (s) { return s.lead; })[0];
    if (!lead) throw new Error("radius-map: no location is marked data-lead");
    bands.sort(function (a, b) { return a.lo - b.lo; });
    areas.forEach(function (a) {
      a.east = a.members.reduce(function (t, s) { return t + s.east; }, 0) / a.members.length;
      a.north = a.members.reduce(function (t, s) { return t + s.north; }, 0) / a.members.length;
    });
    var home = areas.filter(function (a) { return a.name === lead.area; })[0];
    var start = areas.filter(function (a) { return a !== home; })[0] || home;

    /* The map runs from its south-west corner to the next whole mile past the furthest location. */
    var W = Math.ceil(Math.max.apply(null, spots.map(function (s) { return s.east; })) + 0.01);
    var H = Math.ceil(Math.max.apply(null, spots.map(function (s) { return s.north; })) + 0.01);
    var circle = { east: home.east, north: home.north, r: RADIUS.value, area: home };

    var bar = make("div", "exhibit__controls rmap__controls", stage);
    var picks = null;
    if (!opts.compact) {
      var pick = make("div", "rmap__control", bar);
      make("span", "rmap__control-name", pick, "Center on").setAttribute("aria-hidden", "true");
      picks = segmented(pick, "Center the circle on an area", areas.map(function (a) { return a.name; }),
        function (i) { var a = areas[i]; stop(); place(a.east, a.north, a); });
    }
    var sizer = make("div", "rmap__control rmap__sizer", bar);
    make("span", "rmap__control-name", sizer, "Radius").setAttribute("aria-hidden", "true");
    var radiusValue = make("span", "rmap__control-value", sizer);
    radiusValue.setAttribute("aria-hidden", "true");
    var size = slider(sizer, {
      min: RADIUS.min, max: RADIUS.max, step: RADIUS.step, value: circle.r, label: "Radius of the circle",
      valueText: miles,
      onChange: function (v) { stop(); circle.r = v; update(); },
    });

    var layout = make("div", "rmap", stage);
    var map = make("div", "rmap__map", layout);
    map.style.setProperty("--rmap-ratio", W + " / " + H);
    /* Parsed as markup so the browser supplies the SVG namespace. The drawing's units are miles, with
       north up. The river and roads are drawn from fixed proportions of the map and hold no data. */
    map.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
      '<g transform="scale(' + W / 400 + " " + H / 320 + ')">' +
      '<path class="rmap__river" vector-effect="non-scaling-stroke" d="M-10 150 C 60 130, 110 170, 170 150 S 260 110, 300 140 S 370 220, 410 210"/>' +
      '<path class="rmap__road" vector-effect="non-scaling-stroke" d="M0 104 H400 M118 0 V320 M0 250 L400 150 M268 0 V320 M40 320 L330 40"/></g></svg>';
    var svg = map.querySelector("svg");
    var ring = svgChild(svg, "circle", "rmap__ring"), pin = svgChild(svg, "circle", "rmap__pin");
    ring.setAttribute("vector-effect", "non-scaling-stroke");
    function at(el, east, north) {
      el.style.setProperty("--x", (east / W * 100) + "%");
      el.style.setProperty("--y", ((H - north) / H * 100) + "%");
      return el;
    }
    /* Each Area's name sits a little north of its centre, clear of the pin, and inside the map. */
    areas.forEach(function (a) {
      at(make("span", "rmap__area", map, a.name), a.east, Math.min(H - 1, a.north + 1.2)).setAttribute("aria-hidden", "true");
    });
    var hint = make("span", "rmap__hint", map, "Click the map");
    hint.setAttribute("aria-hidden", "true");

    var panel = make("div", "rmap__panel", layout);
    var sums = make("dl", "exhibit__pairs rmap__sums", panel);
    function result(term, cls) {
      make("dt", cls, sums, term);
      var dd = make("dd", cls, sums);
      dd.setAttribute("data-result", "");
      return dd;
    }
    var whereOut = result("Circle", "rmap__where");
    var countOut = result("Locations inside", "rmap__count");
    var loanOut = result("Loan income");
    var depositOut = result("Deposit expense");
    var netOut = result("Net annual", "rmap__net");
    make("div", "rmap__label", panel, "Age profile, inside");
    var ages = make("dl", "rmap__ages", panel);
    var bandRows = bands.map(function (b) {
      make("dt", null, ages, b.name);
      var dd = make("dd", null, ages);
      var track = make("span", "rmap__bar", dd);
      track.setAttribute("aria-hidden", "true");
      var fill = make("i", null, track);
      var n = make("b", null, dd);
      n.setAttribute("data-result", "");
      return { band: b, fill: fill, n: n };
    });

    /* The location readout: the lead at first; hovering previews one, and focus or a press chooses it. */
    var tip = make("div", "rmap__tip", panel);
    tip.setAttribute("role", "status");
    var tipName = make("div", "rmap__tip-name", tip);
    var tipRows = make("dl", "exhibit__pairs rmap__tip-rows", tip);
    function tipRow(term) { make("dt", null, tipRows, term); return make("dd", null, tipRows); }
    var tipLoan = tipRow("Loan income"), tipDeposit = tipRow("Deposit expense"), tipNet = tipRow("Net");
    var chosen = lead;
    function show(s) {
      tipName.textContent = s.label + " · " + s.area;
      tipLoan.textContent = money(s.loan);
      tipDeposit.textContent = money(-s.deposit);
      tipNet.textContent = money(s.net) + "/yr";
      spots.forEach(function (o) { o.el.classList.toggle("is-shown", o === s); });
    }
    function choose(s) { chosen = s; show(s); }

    /* A dot's strength is its net against the largest net, either way, in the table. */
    var widest = Math.max.apply(null, spots.map(function (s) { return Math.abs(s.net); })) || 1;
    spots.forEach(function (s) {
      var b = at(button(map, "rmap__spot " + (s.net < 0 ? "is-loss" : "is-gain")), s.east, s.north);
      b.setAttribute("aria-label", s.label + ", " + s.area);
      b.style.setProperty("--k", String(Math.abs(s.net) / widest));
      b.addEventListener("mouseenter", function () { show(s); });
      b.addEventListener("mouseleave", function () { show(chosen); });
      b.addEventListener("focus", function () { choose(s); });
      b.addEventListener("click", function () { choose(s); });
      s.el = b;
    });

    function place(east, north, area) {
      circle.east = Math.min(W, Math.max(0, east));
      circle.north = Math.min(H, Math.max(0, north));
      circle.area = area || null;
      update();
    }
    function update() {
      var r = circle.r;
      ring.setAttribute("cx", circle.east);
      ring.setAttribute("cy", H - circle.north);
      ring.setAttribute("r", r);
      pin.setAttribute("cx", circle.east);
      pin.setAttribute("cy", H - circle.north);
      pin.setAttribute("r", Math.min(W, H) / 90);
      radiusValue.textContent = r.toFixed(1) + " mi";
      size.set(r, true);
      if (picks) picks.press(areas.indexOf(circle.area));
      var inside = spots.filter(function (s) {
        var hit = Math.hypot(s.east - circle.east, s.north - circle.north) <= r;
        s.el.classList.toggle("is-inside", hit);
        return hit;
      });
      function total(f) { return inside.reduce(function (t, s) { return t + f(s); }, 0); }
      whereOut.textContent = miles(r) + " around " +
        (circle.area ? "the center of " + circle.area.name : "a point on the map");
      countOut.textContent = String(inside.length);
      loanOut.textContent = money(total(function (s) { return s.loan; }));
      depositOut.textContent = money(-total(function (s) { return s.deposit; }));
      netOut.textContent = money(total(function (s) { return s.net; })) + "/yr";
      var counts = bandRows.map(function (row) {
        return inside.filter(function (s) { return s.band === row.band.name; }).length;
      });
      var most = Math.max.apply(null, counts.concat([1]));
      bandRows.forEach(function (row, i) {
        row.fill.style.width = counts[i] / most * 100 + "%";
        row.n.textContent = String(counts[i]);
      });
    }

    /* A mouse places the circle as it goes down and drags it. A touch or a pen places it only on the
       tap's click, so a finger that lands on the map to scroll the page moves nothing. Pressing a
       location chooses the location and leaves the circle where it is. */
    var dragging = false, mouseDown = false;
    function fromPointer(e) {
      var box = map.getBoundingClientRect();
      if (!box.width) return;
      stop();
      if (hint.parentNode) hint.parentNode.removeChild(hint);
      place((e.clientX - box.left) / box.width * W, H - (e.clientY - box.top) / box.height * H, null);
    }
    function onSpot(e) { return e.target.closest && e.target.closest(".rmap__spot"); }
    map.addEventListener("pointerdown", function (e) {
      mouseDown = e.pointerType === "mouse";
      if (!mouseDown || onSpot(e)) return;
      dragging = true;
      fromPointer(e);
    });
    map.addEventListener("click", function (e) {
      if (mouseDown || onSpot(e)) return;
      fromPointer(e);
    });
    map.addEventListener("pointermove", function (e) { if (dragging) fromPointer(e); });
    function release() { dragging = false; }
    map.addEventListener("pointerup", release);
    map.addEventListener("pointercancel", release);
    map.addEventListener("pointerleave", release);

    /* First view: the circle travels from the first Area, small, to the lead's, at its size. */
    var playing = null, seen = null;
    function stop() {
      if (seen) { seen.disconnect(); seen = null; }
      if (playing !== null) window.cancelAnimationFrame(playing);
      playing = null;
      stage.removeAttribute("aria-busy");
    }
    function play() {
      var t0 = null;
      stage.setAttribute("aria-busy", "true");
      function tick(t) {
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / PLAY_MS), e = 1 - Math.pow(1 - k, 3);
        circle.r = RADIUS.open + (RADIUS.value - RADIUS.open) * e;
        place(start.east + (home.east - start.east) * e, start.north + (home.north - start.north) * e,
              k < 1 ? null : home);
        if (k < 1) playing = window.requestAnimationFrame(tick);
        else { playing = null; circle.r = RADIUS.value; update(); stage.removeAttribute("aria-busy"); }
      }
      playing = window.requestAnimationFrame(tick);
    }

    /* Until it plays, the map shows the state the playback ends on: the lead's Area, at its size. */
    choose(lead);
    update();
    if (!reduced && "IntersectionObserver" in window) {
      seen = new window.IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && seen) { seen.disconnect(); seen = null; play(); }
        });
      }, { threshold: 0.3 });
      seen.observe(map);
    }
  });

  /* ---- KIND: judges-rewarded -------------------------------------------------------------------
     Two ways to structure one paper, read by a judge with a limited number of minutes. The table
     lists every part either structure carries, in reading order, with the minutes a judge needs to
     check it and one Yes/No column per structure; its footer gives the minutes a judge has, and its
     caption quotes the paper's title. Columns are found by their headers.

     Each structure is a list of its parts, each with its minutes, a bar on a shared axis of minutes
     from where it starts to where it ends, and a verdict in words: a part the judge finishes inside
     the time is checked, and a part that runs past it is not. The judge's time is marked on every
     bar, set by the shared slider, and each structure counts the parts checked (data-result).

     Refused rather than drawn: a structure cell that is not Yes or No, a part's minutes that are not
     a whole number above zero, a structure with no parts, fewer than two structures (there would be
     nothing to compare), a caption with no one quoted title, two structures under one header (each is
     found by its header), and a judge's time outside what the slider can set. */
  register("judges-rewarded", function (fig, stage, data) {
    var NEED = "Minutes a judge needs", HAS = "Minutes a judge has";
    function header(prefix) {
      var found = data.columns.filter(function (c) { return c.indexOf(prefix) === 0; });
      if (found.length !== 1) throw new Error("judges-rewarded: no one column headed " + JSON.stringify(prefix));
      return data.columns.indexOf(found[0]) - 1;
    }
    var need = header(NEED);
    var names = data.columns.slice(1).filter(function (c, i) { return i !== need; });
    if (names.length < 2 || !data.rows.length) throw new Error("judges-rewarded: the table needs parts and two structures");
    names.forEach(function (n, i) {
      if (names.indexOf(n) !== i) throw new Error("judges-rewarded: two structures are headed " + JSON.stringify(n));
    });
    data.rows.forEach(function (r) {
      var m = r.values[need];
      if (!(m > 0) || Math.round(m) !== m) {
        throw new Error("judges-rewarded: " + r.label + " needs " + JSON.stringify(r.cells[need]) +
                        " minutes; a part takes a whole number of minutes above zero");
      }
    });
    var structures = names.map(function (name) {
      var col = data.columns.indexOf(name) - 1, spent = 0, parts = [];
      data.rows.forEach(function (r) {
        var w = r.cells[col].toLowerCase();
        if (w !== "yes" && w !== "no") {
          throw new Error("judges-rewarded: " + r.label + " reads " + JSON.stringify(r.cells[col]) + " for " + name);
        }
        if (w === "no") return;
        parts.push({ label: r.label, minutes: r.values[need], start: spent, end: spent + r.values[need] });
        spent += r.values[need];
      });
      if (!parts.length) throw new Error("judges-rewarded: " + name + " carries no part");
      return { name: name, parts: parts, total: spent };
    });
    var longest = Math.max.apply(null, structures.map(function (s) { return s.total; }));

    var caption = text(fig.querySelector("caption"));
    var quoted = caption.match(/“[^”]+”/g) || [];
    if (quoted.length !== 1) throw new Error("judges-rewarded: the caption quotes " + quoted.length + " titles, not one");

    var foot = fig.querySelectorAll("tfoot tr"), has = null;
    for (var i = 0; i < foot.length; i++) {
      var cells = foot[i].children;
      if (text(cells[0]).indexOf(HAS) === 0 && cells[need + 1]) has = number(text(cells[need + 1]));
    }
    if (!(has >= 1 && has <= longest) || Math.round(has) !== has) {
      throw new Error("judges-rewarded: the footer gives a judge " + has + " minutes; the slider runs 1 to " + longest);
    }
    var minutes = has;

    var bar = make("div", "exhibit__controls", stage);
    function minutesWord(n) { return n + (n === 1 ? " minute" : " minutes"); }
    slider(bar, {
      visibleLabel: HAS, showValue: true,
      min: 1, max: longest, step: 1, value: minutes, label: HAS,
      valueText: minutesWord,
      onChange: function (v) { minutes = v; update(); }
    });

    make("p", "judged__paper", stage, "Two ways to structure " + quoted[0] + ". Every bar sits on one axis " +
         "of minutes, and the ink tick on it is where the judge\u2019s time ends.");

    var grid = make("div", "judged", stage);
    var drawn = structures.map(function (s) {
      var col = make("section", "judged__structure", grid);
      make("p", "judged__name", col, s.name);
      var line = make("p", "exhibit__count", col);
      var count = make("b", "", line);
      count.setAttribute("data-result", "");
      line.appendChild(document.createTextNode(" parts checked"));
      make("p", "judged__total", col, minutesWord(s.total) + " to check every part");
      var list = make("ol", "judged__parts", col);
      list.setAttribute("aria-label", s.name);
      var items = s.parts.map(function (p) {
        var li = make("li", "judged__part", list);
        var head = make("span", "judged__head", li);
        make("span", "judged__label", head, p.label);
        make("span", "judged__minutes", head, minutesWord(p.minutes));
        var verdict = make("span", "judged__verdict", head);
        /* The bar is the axis of minutes (data-axis) and the tick marks the judge's time on it
           (data-tick), so a reading of the drawing can hold the tick to the minutes it stands for. */
        var track = make("span", "judged__track", li);
        track.setAttribute("aria-hidden", "true");
        track.setAttribute("data-axis", "");
        var span = make("span", "judged__span", track);
        span.style.left = p.start / longest * 100 + "%";
        span.style.width = p.minutes / longest * 100 + "%";
        /* The judge's time, marked on every part's bar at the same place on the axis. */
        var edge = make("span", "judged__edge", track);
        edge.setAttribute("data-tick", "");
        return { li: li, verdict: verdict, edge: edge };
      });
      return { count: count, items: items };
    });

    var readout = make("div", "exhibit__readout", stage);
    readout.setAttribute("aria-live", "polite");
    var note = make("p", "exhibit__note", readout);

    function update() {
      var through = [], cut = [];
      structures.forEach(function (s, k) {
        var d = drawn[k], checked = 0;
        s.parts.forEach(function (p, j) {
          var done = p.end <= minutes;
          if (done) checked++;
          d.items[j].edge.style.left = minutes / longest * 100 + "%";
          d.items[j].li.classList.toggle("is-unchecked", !done);
          d.items[j].verdict.textContent = done ? "Checked" : "Not checked";
        });
        d.count.textContent = checked + " of " + s.parts.length;
        (checked === s.parts.length ? through : cut).push(s);
      });
      note.textContent = "With " + minutesWord(minutes) + ", " + [].concat(
        through.map(function (s) { return "the judge checks every part of the paper " + s.name.toLowerCase(); }),
        cut.map(function (s) {
          var first = s.parts.filter(function (p) { return p.end > minutes; })[0];
          return "in the paper " + s.name.toLowerCase() + ", the time runs out at \u201c" + first.label + "\u201d";
        })).join("; ") + ".";
    }

    update();
  });

  /* ---- TradeLog's shared reading -------------------------------------------------------------
     The TradeLog kinds find their columns by header. column() gives the index of the one column
     named `name` in the table's columns (0 is the row's header cell), and refuses a table where it
     is missing or repeated; cell() reads that column of a row. A grade is Kept or Broken, drawn as
     its sign beside its word, so no grade rests on colour. */
  function column(data, kind, name) {
    var at = data.columns.indexOf(name);
    if (at < 0 || data.columns.lastIndexOf(name) !== at) {
      throw new Error(kind + ": the table needs one " + JSON.stringify(name) + " column");
    }
    return at;
  }
  function cell(r, at) { return at === 0 ? r.label : r.cells[at - 1] || ""; }
  var GRADES = { Kept: "kept", Broken: "broken" }, GRADE_SIGNS = { Kept: "\u2713", Broken: "\u2715" };

  /* ---- KIND: review-cycle ----------------------------------------------------------------------
     TradeLog's Decision Review Cycle. The table lists the cycle's steps in the order they run, each
     with what the Illustrative Investor sees at it and the component that carries it (the columns
     "What the Illustrative Investor sees" and "Carried by", found by header). The drawing is the
     cycle: its four steps at the corners of a square, read clockwise, an arrow from each to the
     next and from the last back to the first, because a revised plan is the next commitment. Every
     step is marked (data-mark "Step N, Name") and writes the component that carries it, so the
     whole cycle stays in view whichever step is chosen; the chosen one is outlined.

     One control, a segmented choice of step, opens on the first. The readout (data-result) names
     the chosen step and reads its row: what the Illustrative Investor sees there, and what carries
     it. suites/run.py reads that under every step. Nothing plays over time, so there is no
     aria-busy, and there are no hover readouts.

     A table the drawing cannot show is refused: a column it needs missing or repeated, other than
     four steps (the square has four corners), a step named twice, an empty cell, or a word in a
     step's name or component too long for a corner of the square at 320px. */
  var CYCLE_WORD = 14;
  register("review-cycle", function (fig, stage, data) {
    var sees = column(data, "review-cycle", "What the Illustrative Investor sees");
    var by = column(data, "review-cycle", "Carried by");
    if (data.rows.length !== 4) {
      throw new Error("review-cycle: the table has " + data.rows.length + " steps, and the square has four corners");
    }
    var named = {};
    var steps = data.rows.map(function (r) {
      var s = { name: r.label, sees: cell(r, sees), by: cell(r, by) };
      if (!s.name || !s.sees || !s.by) throw new Error("review-cycle: a step leaves a cell empty");
      if (named[s.name]) throw new Error("review-cycle: two steps are named " + JSON.stringify(s.name));
      named[s.name] = true;
      (s.name + " " + s.by).split(/\s+/).forEach(function (w) {
        if (w.length > CYCLE_WORD) {
          throw new Error("review-cycle: " + JSON.stringify(w) + " is too long a word for a corner at 320px");
        }
      });
      return s;
    });
    var onStep = 0;

    var bar = make("div", "exhibit__controls", stage);
    make("span", "cycle__ask", bar, "Step");
    var pick = segmented(bar, "Step of the Decision Review Cycle", steps.map(function (s) { return s.name; }),
                         function (i) { onStep = i; update(); },
                         steps.map(function (s, i) { return "Step " + (i + 1) + ", " + s.name; }));

    var square = make("div", "cycle", stage);
    square.setAttribute("role", "img");
    square.setAttribute("aria-label", "The Decision Review Cycle: " + steps.map(function (s, i) {
      return "step " + (i + 1) + ", " + s.name + ", carried by " + s.by.charAt(0).toLowerCase() + s.by.slice(1);
    }).join("; ") + "; then back to step 1.");
    var corners = steps.map(function (s, i) {
      var c = make("div", "cycle__step", square);
      c.setAttribute("data-mark", "Step " + (i + 1) + ", " + s.name);
      make("span", "cycle__num", c, "Step " + (i + 1));
      make("span", "cycle__name", c, s.name);
      make("span", "cycle__by", c, s.by);
      return c;
    });

    var readout = make("div", "exhibit__readout", stage);
    readout.setAttribute("aria-live", "polite");
    var read = make("div", "cycle__read", readout);
    read.setAttribute("data-result", "");
    /* Spaces between the parts, so the sentence a screen reader reads (and the harness) does not
       run one part into the next. */
    var where = make("b", "cycle__where", read);
    read.appendChild(document.createTextNode(" "));
    var seen = make("span", "cycle__sees", read);
    read.appendChild(document.createTextNode(" "));
    var carried = make("span", "cycle__carried", read);

    function update() {
      pick.press(onStep);
      corners.forEach(function (c, i) { c.classList.toggle("is-on", i === onStep); });
      where.textContent = "Step " + (onStep + 1) + " of " + steps.length + ", " + steps[onStep].name + ".";
      seen.textContent = steps[onStep].sees;
      carried.textContent = "Carried by: " + steps[onStep].by + ".";
    }

    update();
  });

  /* ---- KIND: adherence-gap ---------------------------------------------------------------------
     TradeLog's Recorded and Reported Adherence. The table grades each Rule for each day of the
     Illustrative Investor's week twice, Kept or Broken: from the broker's record ("Verified
     Adherence") and as the investor reported it in review ("Claimed Adherence"). Its columns are
     found by header; each row is a day and a Rule, "Rule X, its category".

     Side by side (the opening view, because it is the one that shows the point): a grid, a Rule to
     a row and a day to a column, each cell split into the recorded grade and the reported one. A
     cell whose two grades disagree is ringed and marked (data-mark "Rule C, Tuesday"); every cell
     names both its grades to a screen reader. Above the grid, the two counts of Rule-days kept.

     "Report one combined score" is the other choice: the two counts become their average, the
     cells lose their grades and their rings, and nothing marks where the record and the report
     disagreed. The grades and rings fade out by transition, which the reduced-motion blanket
     collapses; nothing plays over time, so there is no aria-busy, and no hover readouts.

     The readout (data-result) gives the counts, then, side by side, how many Rule-days disagree and
     which, under their direction; combined, the one score and what it no longer shows.

     A table the drawing cannot show or word is refused: a column it needs missing or repeated, a
     grade other than Kept or Broken, a Rule not written "Rule X, its category" or with two
     categories, a Rule-day graded twice or missing, fewer than two days or Rules, more days than
     fit across a phone (GAP_DAYS), or a word in a category too long for the row's label at 320px. */
  var GAP_DAYS = 5, GAP_WORD = 10;
  register("adherence-gap", function (fig, stage, data) {
    var cols = ["Day", "Rule", "Verified Adherence", "Claimed Adherence"].map(function (name) {
      return column(data, "adherence-gap", name);
    });
    var days = [], rules = [], grade = {};
    data.rows.forEach(function (r) {
      var day = cell(r, cols[0]), rule = /^Rule ([A-Z]), (\S.*)$/.exec(cell(r, cols[1]));
      var rec = cell(r, cols[2]), rep = cell(r, cols[3]);
      if (!day || !rule) throw new Error("adherence-gap: a row is not a day and 'Rule X, its category'");
      if (!GRADES[rec] || !GRADES[rep]) {
        throw new Error("adherence-gap: " + JSON.stringify(rec + " / " + rep) + " is not Kept or Broken");
      }
      var known = rules.filter(function (x) { return x.letter === rule[1]; })[0];
      if (!known) rules.push(known = { letter: rule[1], name: "Rule " + rule[1], category: rule[2] });
      if (known.category !== rule[2]) throw new Error("adherence-gap: " + known.name + " has two categories");
      rule[2].split(/\s+/).forEach(function (w) {
        if (w.length > GAP_WORD) {
          throw new Error("adherence-gap: " + JSON.stringify(w) + " is too long a word for a row's label at 320px");
        }
      });
      if (days.indexOf(day) < 0) days.push(day);
      var key = known.name + "|" + day;
      if (grade[key]) throw new Error("adherence-gap: " + known.name + " is graded twice on " + day);
      grade[key] = { rec: rec, rep: rep };
    });
    rules.sort(function (a, b) { return a.letter < b.letter ? -1 : 1; });
    if (days.length < 2 || rules.length < 2) throw new Error("adherence-gap: a week needs two days and two Rules");
    if (days.length > GAP_DAYS) {
      throw new Error("adherence-gap: " + days.length + " days are more than fit across a phone");
    }
    var total = days.length * rules.length, kept = [0, 0], gaps = [];
    rules.forEach(function (x) {
      days.forEach(function (d) {
        var g = grade[x.name + "|" + d];
        if (!g) throw new Error("adherence-gap: " + x.name + " is not graded on " + d);
        if (g.rec === "Kept") kept[0]++;
        if (g.rep === "Kept") kept[1]++;
        if (g.rec !== g.rep) gaps.push({ rule: x.name, day: d, g: g });
      });
    });
    var combined = false;

    var bar = make("div", "exhibit__controls", stage);
    make("span", "gap__ask", bar, "Adherence");
    var pick = segmented(bar, "How adherence is reported", ["Side by side", "Report one combined score"],
                         function (i) { combined = i === 1; update(); },
                         ["Show Verified Adherence and Claimed Adherence side by side", "Report one combined score"]);

    var tally = make("div", "gap__tally", stage);
    function count(n) { return (n % 1 ? n.toFixed(1) : String(n)) + " of " + total; }
    function figure(cls, name, words) {
      var t = make("div", "gap__count " + cls, tally);
      make("b", "gap__figure", t);
      make("span", "gap__name", t, name);
      make("span", "gap__words", t, words);
      return t;
    }
    var counts = [figure("gap__count--rec", "Recorded", "Verified Adherence, from the broker’s record"),
                  figure("gap__count--rep", "Reported", "Claimed Adherence, from the review"),
                  figure("gap__count--one", "One combined score", "both counts averaged")];

    var frame = make("div", "exhibit__frame", stage);
    var grid = make("div", "gap", frame);
    grid.setAttribute("role", "group");
    grid.style.setProperty("--gap-days", String(days.length));
    make("span", "gap__corner", grid);
    days.forEach(function (d) {
      var h = make("span", "gap__day", grid, d.slice(0, 3));
      h.setAttribute("aria-hidden", "true");
    });
    var cells = [];
    rules.forEach(function (x) {
      var head = make("span", "gap__rule", grid);
      make("b", "", head, x.name);
      make("span", "gap__cat", head, x.category);
      days.forEach(function (d) {
        var g = grade[x.name + "|" + d], c = make("span", "gap__cell", grid);
        [g.rec, g.rep].forEach(function (v, i) {
          var half = make("span", "gap__half gap__half--" + (i ? "rep" : "rec") + " is-" + GRADES[v], c,
                          GRADE_SIGNS[v]);
          half.setAttribute("aria-hidden", "true");
        });
        cells.push({ el: c, rule: x.name, day: d, g: g });
      });
    });

    var key = make("div", "gap__key", stage,
                   "In each cell, the recorded grade sits left of the reported grade: " + GRADE_SIGNS.Kept + " kept, " +
                   GRADE_SIGNS.Broken + " broken. " +
                   "A ring marks a Rule-day where the grades disagree.");
    key.setAttribute("aria-hidden", "true");

    var readout = make("div", "exhibit__readout", stage);
    readout.setAttribute("aria-live", "polite");
    var read = make("div", "gap__read", readout);
    read.setAttribute("data-result", "");

    function listed(rec, rep) {
      return gaps.filter(function (x) { return x.g.rec === rec && x.g.rep === rep; })
                 .map(function (x) { return x.rule + " on " + x.day; }).join(", ");
    }

    function update() {
      pick.press(combined ? 1 : 0);
      grid.classList.toggle("is-combined", combined);
      grid.setAttribute("aria-label", combined
        ? "The week's Rule-days, averaged into one combined score: no grade and no disagreement is shown"
        : "The week's Rule-days, each Rule by day, recorded beside reported");
      cells.forEach(function (c) {
        var gap = c.g.rec !== c.g.rep;
        c.el.classList.toggle("is-gap", gap && !combined);
        if (combined) {
          c.el.removeAttribute("role");
          c.el.removeAttribute("aria-label");
          c.el.removeAttribute("data-mark");
          return;
        }
        c.el.setAttribute("role", "img");
        c.el.setAttribute("aria-label", c.rule + ", " + c.day + ": recorded " + GRADES[c.g.rec] +
                          ", reported " + GRADES[c.g.rep]);
        if (gap) c.el.setAttribute("data-mark", c.rule + ", " + c.day);
      });
      counts[0].hidden = counts[1].hidden = combined;
      counts[2].hidden = !combined;
      key.hidden = combined;
      /* A hidden count is emptied too, so no figure the reader cannot see is left for a reader of
         the page's words to find. */
      counts[0].firstChild.textContent = combined ? "" : count(kept[0]);
      counts[1].firstChild.textContent = combined ? "" : count(kept[1]);
      counts[2].firstChild.textContent = combined ? count((kept[0] + kept[1]) / 2) : "";
      if (combined) {
        read.textContent = "One combined score: " + count((kept[0] + kept[1]) / 2) + " Rule-days kept. " +
          "No Rule and no day is marked, and nothing shows where the record and the report disagreed.";
        return;
      }
      var parts = ["Verified Adherence: " + count(kept[0]) + " Rule-days kept.",
                   "Claimed Adherence: " + count(kept[1]) + " kept.",
                   "They disagree on " + count(gaps.length) + "."];
      var down = listed("Broken", "Kept"), up = listed("Kept", "Broken");
      if (down) parts.push("Recorded broken, reported kept: " + down + ".");
      if (up) parts.push("Recorded kept, reported broken: " + up + ".");
      read.textContent = parts.join(" ");
    }

    update();
  });

  /* ---- KIND: edit-intensity --------------------------------------------------------------------
     The Research's rule that a revision's rung is measured, never read off the prompt. The table
     holds one "Original" passage and its revisions ("Revision 1", "Revision 2", … in order), each
     with its "Text" and the "Prompt" that asked for it (a dash on the original). Every revision
     must carry the same prompt: the Exhibit is one prompt's.

     Each revision is measured against the original, word by word, ignoring case and punctuation:
     its edit distance (the fewest words inserted, deleted or replaced to turn the original into it)
     as a share of the original's words, and the share of the original's distinct word pairs it
     keeps. A revision is light when both say light, heavy when either says heavy, moderate
     otherwise. The rungs and their cut-points are read from the table's foot, one row per rung,
     lightest first: the light row "at most a% of words edited and at least b% of word pairs kept",
     the heavy row "more than c% of words edited or fewer than d% of word pairs kept". The foot is
     the one copy of the rule; suites/run.py reads it too.

     The drawing: the prompt, once; the ladder of three rungs with every revision placed on the rung
     it measured; and, for the revision in hand (a segmented choice), its two measures, its rung,
     which measure put it there, and the revision itself: each change as the words it struck, then
     the words it added, each run opening with a hidden "removed:" or "added:" for a reader who
     cannot see the strike or the underline.

     Results (data-result): each revision's placement ("Revision 2" and, in hidden words,
     ", moderate"), the rungs reached ("k of n"), then the revision in hand, "k% of words edited",
     "k% of word pairs kept" and its rung. Nothing plays, so there is no aria-busy, and there are no
     hover readouts.

     A table the drawing cannot show is refused: no "Text" or "Prompt" column, no single original,
     an original under two words (it has no word pair to keep) or carrying a prompt, revisions not
     numbered from 1 in order, fewer than two revisions, revisions carrying different prompts (or
     none), a passage with a word that is only punctuation, or a foot that does not state three
     rungs' cut-points in those words. */
  register("edit-intensity", function (fig, stage, data) {
    var foot = Array.prototype.filter.call(fig.querySelectorAll("tfoot tr"), function (tr) {
      return tr.querySelector("td");
    });
    if (foot.length !== 3) throw new Error("edit-intensity: the table's foot does not give three rungs");
    var RUNGS = foot.map(function (tr) { return text(tr.children[0]); });
    var light = /^at most (\d+)% of words edited and at least (\d+)% of word pairs kept$/i
                  .exec(text(foot[0].querySelector("td")));
    var heavy = /^more than (\d+)% of words edited or fewer than (\d+)% of word pairs kept$/i
                  .exec(text(foot[2].querySelector("td")));
    if (!light || !heavy) throw new Error("edit-intensity: the table's foot does not state the cut-points");
    var cut = { lightEdited: light[1] / 100, lightKept: light[2] / 100,
                heavyEdited: heavy[1] / 100, heavyKept: heavy[2] / 100 };
    var col = {};
    ["Text", "Prompt"].forEach(function (name) {
      var i = data.columns.indexOf(name);
      if (i < 1) throw new Error("edit-intensity: the table has no " + JSON.stringify(name) + " column");
      col[name] = i - 1;
    });
    function words(s, who) {
      var shown = s.split(/\s+/).filter(Boolean);
      if (!shown.length) throw new Error("edit-intensity: " + who + " has no text");
      var keys = shown.map(function (w) {
        var k = w.toLowerCase().replace(/[^a-z0-9-]/g, "");
        if (!k) throw new Error("edit-intensity: " + who + " has a word that is only punctuation: " + w);
        return k;
      });
      return { shown: shown, keys: keys };
    }
    var rows = data.rows;
    if (!rows.length || !/^original$/i.test(rows[0].label)) {
      throw new Error("edit-intensity: the table's first row is not the original");
    }
    if (rows.length < 3) throw new Error("edit-intensity: one prompt needs at least two revisions to compare");
    var original = words(rows[0].cells[col["Text"]] || "", "the original");
    if (original.keys.length < 2) throw new Error("edit-intensity: the original has no word pair to keep");
    if (!/^[—–-]?$/.test((rows[0].cells[col["Prompt"]] || "").trim())) {
      throw new Error("edit-intensity: the original carries a prompt; only a revision is asked for");
    }
    var prompt = (rows[1].cells[col["Prompt"]] || "").trim();
    if (!prompt || /^[—–-]$/.test(prompt)) throw new Error("edit-intensity: Revision 1 carries no prompt");
    var revisions = rows.slice(1).map(function (r, i) {
      if (r.label !== "Revision " + (i + 1)) {
        throw new Error("edit-intensity: row " + (i + 2) + " is " + JSON.stringify(r.label) +
                        ", not \"Revision " + (i + 1) + "\"");
      }
      if ((r.cells[col["Prompt"]] || "").trim() !== prompt) {
        throw new Error("edit-intensity: " + r.label + " carries a different prompt; the Exhibit is one prompt's");
      }
      return measure(r.label, words(r.cells[col["Text"]] || "", r.label));
    });

    /* Word-level edit distance with the path that achieves it, and the word pairs kept. */
    function measure(name, rev) {
      var a = original.keys, b = rev.keys, d = [];
      for (var i = 0; i <= a.length; i++) {
        d.push([i]);
        for (var j = 1; j <= b.length; j++) {
          d[i].push(i ? Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) : j);
        }
      }
      var ops = [];
      for (var x = a.length, y = b.length; x || y;) {
        if (x && y && d[x][y] === d[x - 1][y - 1] + (a[x - 1] === b[y - 1] ? 0 : 1)) {
          if (a[x - 1] === b[y - 1]) ops.unshift({ kept: rev.shown[y - 1] });
          else ops.unshift({ struck: original.shown[x - 1] }, { added: rev.shown[y - 1] });
          x--; y--;
        } else if (x && d[x][y] === d[x - 1][y] + 1) {
          ops.unshift({ struck: original.shown[x - 1] });
          x--;
        } else {
          ops.unshift({ added: rev.shown[y - 1] });
          y--;
        }
      }
      function pairs(k) {
        var s = {};
        for (var p = 0; p + 1 < k.length; p++) s[k[p] + " " + k[p + 1]] = true;
        return s;
      }
      var mine = pairs(a), theirs = pairs(b), all = Object.keys(mine);
      var kept = all.filter(function (p) { return theirs[p]; }).length / all.length;
      var edited = d[a.length][b.length] / a.length;
      var byEdit = edited <= cut.lightEdited ? 0 : edited > cut.heavyEdited ? 2 : 1;
      var byPairs = kept >= cut.lightKept ? 0 : kept < cut.heavyKept ? 2 : 1;
      return { name: name, ops: ops, edited: edited, kept: kept,
               byEdit: byEdit, byPairs: byPairs, rung: Math.max(byEdit, byPairs) };
    }

    var current = 0;
    var bar = make("div", "exhibit__controls", stage);
    var pick = segmented(bar, "Revision", revisions.map(function (r) { return r.name; }), function (i) {
      current = i;
      update();
    });

    var ask = make("div", "intensity__prompt", stage);
    make("span", "", ask, "The prompt, the same for every revision:");
    make("q", "", ask, prompt);

    var ladder = make("ol", "intensity__ladder", stage);
    var placed = [];
    RUNGS.forEach(function (rung, k) {
      var li = make("li", "intensity__rung", ladder);
      make("span", "intensity__rung-name", li, rung);
      var here = make("span", "intensity__members", li);
      revisions.forEach(function (r, i) {
        if (r.rung !== k) return;
        var chip = make("span", "intensity__member chip chip--plain", here, r.name);
        chip.setAttribute("data-result", "");
        make("span", "visually-hidden", chip, ", " + rung.toLowerCase());
        placed[i] = chip;
      });
    });

    var reached = RUNGS.filter(function (_, k) {
      return revisions.some(function (r) { return r.rung === k; });
    }).length;
    var readout = make("div", "exhibit__readout", stage);
    readout.setAttribute("aria-live", "polite");
    var count = make("div", "exhibit__count", readout);
    var tally = make("b", "", count, reached + " of " + RUNGS.length);
    tally.setAttribute("data-result", "");
    count.appendChild(document.createTextNode(" rungs reached by one prompt"));

    var detail = make("div", "intensity__detail", readout);
    var which = make("b", "", detail);
    which.setAttribute("data-result", "");
    var editedOut = make("span", "intensity__measure", detail);
    editedOut.setAttribute("data-result", "");
    var keptOut = make("span", "intensity__measure", detail);
    keptOut.setAttribute("data-result", "");
    var rungChip = make("span", "chip chip--plain", detail);
    rungChip.setAttribute("data-result", "");
    var note = make("div", "exhibit__note", readout);
    var passage = make("div", "intensity__text", stage);
    make("div", "exhibit__note", stage,
         "Struck: words the revision removed from the original. Underlined: words it added.");

    function percent(x) { return Math.round(x * 100) + "%"; }

    function update() {
      var r = revisions[current];
      pick.press(current);
      placed.forEach(function (chip, i) { chip.classList.toggle("is-current", i === current); });
      which.textContent = r.name;
      editedOut.textContent = percent(r.edited) + " of words edited";
      keptOut.textContent = percent(r.kept) + " of word pairs kept";
      rungChip.textContent = RUNGS[r.rung];
      var rung = RUNGS[r.rung].toLowerCase();
      if (r.byEdit === r.byPairs) note.textContent = "Both measures put it on " + rung + ".";
      else {
        var by = r.byEdit > r.byPairs ? ["Its edit distance", "its word pairs"]
                                      : ["The word pairs it broke", "its edit distance"];
        note.textContent = by[0] + " put it on " + rung + ", where " + by[1] + " alone would have said " +
          RUNGS[Math.min(r.byEdit, r.byPairs)].toLowerCase() + ".";
      }
      /* Each run of changes between kept words as one struck run, then one added run. */
      passage.textContent = "";
      var struck = [], added = [];
      function put(node) {
        if (passage.firstChild) passage.appendChild(document.createTextNode(" "));
        passage.appendChild(node);
      }
      function flush() {
        [["del", "removed: ", struck], ["ins", "added: ", added]].forEach(function (m) {
          if (!m[2].length) return;
          var el = document.createElement(m[0]);
          make("span", "visually-hidden", el, m[1]);
          el.appendChild(document.createTextNode(m[2].join(" ")));
          put(el);
        });
        struck = [];
        added = [];
      }
      r.ops.forEach(function (op) {
        if (op.struck) struck.push(op.struck);
        else if (op.added) added.push(op.added);
        else {
          flush();
          put(document.createTextNode(op.kept));
        }
      });
      flush();
    }

    update();
  });

  /* ---- KIND: gate ------------------------------------------------------------------------------
     The Research's pre-registered pass bar, with a hypothetical detector moved against it. The
     table lists hypothetical detector profiles, one per row: an AUC per rung of edit intensity (a
     column each, "AUC at the <rung> rung", lightest first) and a false-positive rate on genuine
     footnotes ("…%"). Its foot states the Gate: the AUC it requires ("At least 0.70") at the rung its
     header names, and the false-positive rate it allows ("At most 5%"). No bar is typed here.

     The drawing is the Detectability Curve: one point per rung, each a draggable mark (the shared
     slider, on the point), with the Gate's zone drawn at its rung only. Profiles are a segmented
     choice under a visible heading that calls the detector hypothetical; the first is pressed as
     the Exhibit opens. Pressing one moves the points and the rate to its row, easing there (aria-busy on the stage while it moves; at once under reduced motion);
     moving a point or the rate by hand leaves no profile pressed. Compact (the homepage's copy)
     drops the false-positive slider: the rate is the profile's, shown in words.

     Results (data-result): the false-positive rate shown, the verdict ("Clears the Gate…" or
     "Disqualified…"), and its reason, which names the figure that missed. There are no hover
     readouts: each point writes its own value. */
  register("gate", function (fig, stage, data, opts) {
    var foot = Array.prototype.filter.call(fig.querySelectorAll("tfoot tr"), function (tr) {
      return tr.querySelector("td");
    });
    if (foot.length !== 2) throw new Error("gate: the table's foot does not state the AUC and the false-positive rate");
    var aucBar = /^at least (\d\.\d+)$/i.exec(text(foot[0].querySelector("td")));
    var fprBar = /^at most (\d+(?:\.\d+)?)%$/i.exec(text(foot[1].querySelector("td")));
    if (!aucBar || !fprBar) throw new Error("gate: the table's foot does not state the Gate's bar");
    var BAR = parseFloat(aucBar[1]), CEILING = parseFloat(fprBar[1]);

    var rungs = [], fprAt = -1;
    data.columns.forEach(function (c, i) {
      var m = /^AUC at the (\w+) rung$/i.exec(c);
      if (m) rungs.push({ name: m[1].toLowerCase(), at: i - 1 });
      else if (/^false-positive rate/i.test(c)) fprAt = i - 1;
    });
    if (rungs.length < 2 || fprAt < 0) throw new Error("gate: the table has no AUC per rung and false-positive rate");
    var footRung = /^AUC at the (\w+) rung$/i.exec(text(foot[0].children[0]));
    var gateRung = footRung ? rungs.map(function (r) { return r.name; }).indexOf(footRung[1].toLowerCase()) : -1;
    if (gateRung < 0) throw new Error("gate: the foot's AUC names no rung the table has");

    var LO = 0.4, HI = 1, FPR_MAX = 15;
    var profiles = data.rows.map(function (row) {
      var p = { name: row.label, auc: rungs.map(function (r) { return row.values[r.at]; }),
                fpr: parseFloat((/^(\d+(?:\.\d+)?)\s*%$/.exec(row.cells[fprAt]) || [])[1]) };
      p.auc.forEach(function (a) {
        if (a === null || a < LO || a > HI) throw new Error("gate: " + p.name + " has an AUC the chart cannot draw");
      });
      if (!(p.fpr >= 0 && p.fpr <= FPR_MAX)) throw new Error("gate: " + p.name + " has a false-positive rate the slider cannot hold");
      return p;
    });
    if (!profiles.length) throw new Error("gate: the table has no detector profile");
    var cap = function (w) { return w.charAt(0).toUpperCase() + w.slice(1); };
    var gateName = rungs[gateRung].name, lastName = rungs[rungs.length - 1].name;

    var vals = profiles[0].auc.slice(), fpr = profiles[0].fpr;

    var bar = make("div", "exhibit__controls", stage);
    make("span", "exhibit__slider-label", bar, "Hypothetical detector:").setAttribute("aria-hidden", "true");
    var choice = segmented(bar, "Hypothetical detector profiles", profiles.map(function (p) { return p.name; }),
                           function (i) { go(profiles[i]); });

    /* The curve, in its own units and scaled to the frame; under a readable width (the stylesheet's
       min-width, which keeps its words at their set size) the frame scrolls. */
    var W = 560, H = 330, L = 58, R = 540, T = 34, B = 296;
    var frame = make("div", "exhibit__frame", stage);
    frame.insertAdjacentHTML("beforeend", '<svg class="gate__plot" viewBox="0 0 ' + W + " " + H +
                             '" role="group" aria-label="Detectability Curve of a hypothetical detector, ' +
                             'with the pre-registered Gate at the ' + gateName + ' rung"></svg>');
    var svg = frame.lastChild;
    var xs = rungs.map(function (r, i) { return L + (R - L) * (i + 1) / (rungs.length + 1); });
    function Y(a) { return B - (a - LO) / (HI - LO) * (B - T); }
    function words(x, y, s, cls, anchor) {
      var t = svgChild(svg, "text", cls);
      t.setAttribute("x", x);
      t.setAttribute("y", y);
      if (anchor) t.setAttribute("text-anchor", anchor);
      t.textContent = s;
      return t;
    }
    function line(x1, y1, x2, y2, cls) {
      var l = svgChild(svg, "line", cls);
      l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2);
      return l;
    }
    var axis = svgChild(svg, "g", "");
    axis.setAttribute("aria-hidden", "true");
    for (var a = 4; a <= 10; a++) {
      line(L, Y(a / 10), R, Y(a / 10), a === 4 ? "gate__base" : "gate__grid");
      axis.appendChild(svg.lastChild);
      axis.appendChild(words(L - 10, Y(a / 10) + 4, (a / 10).toFixed(1), "gate__tick", "end"));
    }
    axis.appendChild(words(L - 10, 12, "AUC", "gate__axis-name", "end"));
    var gx = xs[gateRung];
    var zone = svgChild(axis, "rect", "gate__zone");
    zone.setAttribute("x", gx - 46); zone.setAttribute("y", Y(HI));
    zone.setAttribute("width", 92); zone.setAttribute("height", Y(BAR) - Y(HI)); zone.setAttribute("rx", 4);
    axis.appendChild(line(gx - 46, Y(BAR), gx + 46, Y(BAR), "gate__bar"));
    axis.appendChild(words(gx + 52, Y(BAR) + 4, "Gate · " + BAR.toFixed(2), "gate__bar-name"));
    axis.appendChild(line(L, Y(0.5), R, Y(0.5), "gate__chance"));
    axis.appendChild(words(R, Y(0.5) - 7, "Chance", "gate__chance-name", "end"));
    xs.forEach(function (x, i) {
      axis.appendChild(words(x, B + 24, cap(rungs[i].name), "gate__rung" + (i === gateRung ? " gate__rung--gate" : ""), "middle"));
    });
    var curve = svgChild(svg, "polyline", "gate__curve");
    curve.setAttribute("aria-hidden", "true");

    /* The x-axis's name sits under the frame, not in the drawing, so a phone that scrolls the
       drawing sideways never cuts it off. */
    make("div", "gate__x-name", stage, "Edit intensity, measured afterwards from edit distance and n-gram overlap")
      .setAttribute("aria-hidden", "true");

    var handles = xs.map(function (x, i) {
      var g = svgChild(svg, "g", "gate__handle");
      g.setAttribute("aria-orientation", "vertical");
      var hit = svgChild(g, "circle", "gate__hit");
      hit.setAttribute("cx", x); hit.setAttribute("cy", 0); hit.setAttribute("r", 35);
      var ring = svgChild(g, "circle", "gate__ring");
      ring.setAttribute("cx", x); ring.setAttribute("cy", 0); ring.setAttribute("r", 14);
      var mark = svgChild(g, "circle", "gate__mark");
      mark.setAttribute("cx", x); mark.setAttribute("cy", 0); mark.setAttribute("r", 8);
      var label = svgChild(g, "text", "gate__value");
      label.setAttribute("x", x); label.setAttribute("y", -16); label.setAttribute("text-anchor", "middle");
      label.setAttribute("aria-hidden", "true");
      var s = slider(null, {
        mark: g, min: LO, max: HI, step: 0.01, value: vals[i],
        label: "AUC at the " + rungs[i].name + " rung",
        valueText: function (v) { return "AUC " + v.toFixed(2) + " at the " + rungs[i].name + " rung"; },
        pointerValue: function (e) {
          var box = svg.getBoundingClientRect();
          return box.height > 0 ? LO + (B - (e.clientY - box.top) / box.height * H) / (B - T) * (HI - LO) : null;
        },
        onChange: function (v) { stopEasing(); vals[i] = v; choice.press(-1); draw(); },
      });
      return { g: g, mark: mark, label: label, s: s };
    });

    /* The rate's name and value are written here, not by the slider's visibleLabel and showValue:
       the compact copy has no slider and still shows the rate, and the value is a result
       (data-result) the verdict is read against. The hyphen in "pre-2020" does not break. */
    var row = make("div", "gate__row", stage);
    var rate = make("div", "gate__fpr", row);
    var named = make("div", "gate__fpr-name", rate);
    make("span", "", named, "False-positive rate on genuine pre‑2020 footnotes");
    var fprOut = make("span", "gate__fpr-value", named);
    fprOut.setAttribute("data-result", "");
    var fprSlider = opts.compact ? null : slider(rate, {
      min: 0, max: FPR_MAX, step: 0.5, value: fpr,
      label: "False-positive rate on genuine pre-2020 footnotes",
      valueText: function (v) { return v.toFixed(1) + "%"; },
      onChange: function (v) { stopEasing(); fpr = v; choice.press(-1); draw(); },
    });
    var said = make("div", "gate__said", row);
    said.setAttribute("aria-live", "polite");
    var verdict = make("div", "gate__verdict", said);
    verdict.setAttribute("data-result", "");
    var icon = make("span", "gate__icon", verdict);
    icon.setAttribute("aria-hidden", "true");
    var verdictWords = make("span", "", verdict);
    var why = make("div", "gate__why", said);
    why.setAttribute("data-result", "");

    var ICON_PASS = '<svg viewBox="0 0 20 20" focusable="false"><circle cx="10" cy="10" r="9"/><path d="M6 10.5l2.6 2.6L14 7.5"/></svg>';
    var ICON_FAIL = '<svg viewBox="0 0 20 20" focusable="false"><circle cx="10" cy="10" r="9"/><path d="M7 7l6 6M13 7l-6 6"/></svg>';

    function draw() {
      curve.setAttribute("points", xs.map(function (x, i) { return x + "," + Y(vals[i]); }).join(" "));
      var aucOk = vals[gateRung] >= BAR - 1e-9, fprOk = fpr <= CEILING + 1e-9;
      handles.forEach(function (h, i) {
        h.g.setAttribute("transform", "translate(0 " + Y(vals[i]) + ")");
        h.label.textContent = vals[i].toFixed(2);
        h.mark.setAttribute("class", "gate__mark" + (i === gateRung ? (aucOk ? " gate__mark--pass" : " gate__mark--fail") : ""));
      });
      var m = "AUC " + vals[gateRung].toFixed(2) + " at " + gateName, f = fpr.toFixed(1) + "%";
      fprOut.textContent = f;
      var pass = aucOk && fprOk;
      verdict.className = "gate__verdict " + (pass ? "gate__verdict--pass" : "gate__verdict--fail");
      icon.innerHTML = pass ? ICON_PASS : ICON_FAIL;
      verdictWords.textContent = pass ? "Clears the Gate and may score filings" : "Disqualified and reported as such";
      why.textContent = pass ? m + ", false positives " + f + " on pre-2020 footnotes."
        : !aucOk && !fprOk ? "Misses both bars. The bar is not lowered and the ladder is not re-cut."
        : !aucOk ? m + " is under " + BAR.toFixed(2) + ". " + cap(lastName) + "-edit accuracy does not count toward the Gate."
        : "False positives at " + f + " flag real human footnotes. The ceiling is " + CEILING + "%.";
    }

    /* A profile pressed: the points and the rate ease to its row, or stand there at once. */
    var easing = null;
    function stopEasing() {
      if (easing === null) return;
      window.cancelAnimationFrame(easing);
      easing = null;
      stage.removeAttribute("aria-busy");
    }
    function settle(p, k) {
      var e = 1 - Math.pow(1 - k, 3);
      vals = vals.map(function (v, i) { return k >= 1 ? p.auc[i] : +(from.auc[i] + (p.auc[i] - from.auc[i]) * e).toFixed(2); });
      fpr = k >= 1 ? p.fpr : from.fpr + (p.fpr - from.fpr) * e;
      handles.forEach(function (h, i) { h.s.set(vals[i], true); });
      if (fprSlider) fprSlider.set(k >= 1 ? p.fpr : Math.round(fpr * 2) / 2, true);
      draw();
    }
    var from = null;
    function go(p) {
      stopEasing();
      choice.press(profiles.indexOf(p));
      from = { auc: vals.slice(), fpr: fpr };
      if (reduced) return settle(p, 1);
      var t0 = null;
      stage.setAttribute("aria-busy", "true");
      easing = window.requestAnimationFrame(function tick(t) {
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / 600);
        settle(p, k);
        if (k < 1) easing = window.requestAnimationFrame(tick);
        else { easing = null; stage.removeAttribute("aria-busy"); }
      });
    }

    draw();
  });

  /* ---- KIND: pipeline --------------------------------------------------------------------------
     MacroSense's components, each with the input it takes and the output it returns, and the data
     flowing between them. The table has a row per component: its "In" and "Out" in the Case Study's
     words, and in "Hands its output to" the components its output goes to, by their names in the
     table, separated by commas, or "No other component". Columns are found by their headers.

     WHERE EACH COMPONENT STANDS is the figure's data-layout, not the table's: "Name: slot; …", each
     slot one of PIPE_SLOTS, the places in Jacob's sketch of the loop. Every component has a slot and
     no two share one. Each is a button in one group, and the wires between them are drawn from the
     table's hand-offs, each marked (data-mark "from to to"), along PIPE_ROUTES: the curve drawn
     between those two slots, laid so that no wire passes through a component. A component with no
     hand-offs in or out (the Scheduler) has no wire at all, and the table must hold one: the cycle
     starts from it. Pressing a
     component reads out its In and Out (each data-result). It opens on the busiest component, the
     one with the most wires, the first in table order on a tie.

     THE FLOW is the page's one ambient animation, one cycle of the loop: a ripple (data-packet, its
     radius moving) spreads from the component with no wires and reaches the first stage, the
     components nothing hands to, which light. The data then moves stage by stage, a stage being
     the longest run of hand-offs before a component: a packet (data-packet) travels each wire so as
     to arrive as its target lights, STAGE_MS a stage. Only the ripple, the packets and a lit or
     chosen component take the accent; the wires stay gray, each ending in an arrowhead, so the
     direction stands when nothing moves. The flow stops while the drawing is off screen (an
     IntersectionObserver), and its time only counts while it runs, so a cycle resumes where it was.
     The drawing states what it is doing in data-flow: "running", "paused" or "still". Nothing a
     reader reads moves, so nothing is marked aria-busy.

     Full (the Case Study) loops: the last stage stays lit HOLD_MS, a rest of about a second in
     which nothing else moves, and the next ripple starts as it goes out. A "Pause the flow" toggle
     (aria-controls names the drawing) holds it for as long as the reader likes. Compact (a featured copy) plays the one cycle, PASS_MS, which is under the five
     seconds after which moving content must offer a pause, then rests with no packet, so it needs
     no pause control; its only controls are the components. Under reduced motion nothing moves:
     the flow stands "still" from the start, and each component carries its step in the order
     instead (data-step: 1 the Scheduler, then each stage after it).

     A figure's data-first-column, where it has one, is a short label set over the drawing:
     MacroSense's "Every input free and public".

     It throws on a table or layout it cannot draw: a missing column, fewer than two components, a
     component named twice, a hand-off to a name the table does not hold or stated twice, hand-offs
     that loop back, no component without hand-offs to start the cycle, a component with no slot or
     a slot it does not know, two components in one slot, or a hand-off between two slots with no
     route. The drawing keeps a readable minimum width
     and scrolls inside its own frame. */
  var PIPE_NONE = "No other component", STAGE_MS = 800, PASS_MS = 4800;
  /* A component stays lit a stage and a little after its input arrives; looping, the last one's
     light is also the rest before the next cycle. */
  var HOLD_MS = STAGE_MS + 200;
  /* The drawing's own units: a PIPE_W by PIPE_H plane, a component a PIPE_BOX box centered on its
     slot. The routes run from one box's edge to the other's, in the same units. */
  var PIPE_W = 720, PIPE_H = 450, PIPE_BOX = [124, 50];
  var PIPE_SLOTS = {
    "top-left": [148, 132], "top-center": [340, 118], "top-right": [560, 62],
    "middle-left": [250, 262], "middle-right": [500, 260],
    "lower-right": [618, 346], "bottom-center": [340, 384],
  };
  /* Keyed "from-slot to-slot". The two that leave the top-left for the bottom sweep round the left
     of the middle-left box, the one to the lower-right outside the other and under the
     bottom-center box; the top-center's to the lower-right passes under the top-right slot and down
     beside the middle-right box. The top-center's to the bottom-center curves down the middle and
     crosses the middle-left's to the middle-right, the one crossing, which the sketch left out and
     the spec keeps (every true hand-off is drawn). */
  var PIPE_ROUTES = {
    "middle-left top-center": "M262 237 C270 205 295 170 318 143",
    "middle-left middle-right": "M312 262 C360 262 400 261 438 261",
    "top-left top-center": "M210 130 C235 127 255 123 278 121",
    "top-left bottom-center": "M130 157 C60 280 90 395 278 390",
    "top-left lower-right": "M105 157 C25 330 90 436 340 436 C520 436 600 420 640 371",
    "top-center middle-right": "M402 125 C440 140 480 190 490 235",
    "top-center bottom-center": "M345 143 C375 215 378 300 345 359",
    "top-center lower-right": "M402 105 C540 105 690 160 650 321",
    "middle-right bottom-center": "M495 285 C495 340 460 372 402 380",
    "middle-right lower-right": "M545 285 C560 300 575 310 590 321",
    "bottom-center lower-right": "M402 400 C470 398 520 385 556 356",
  };
  register("pipeline", function (fig, stage, data, opts) {
    var colIn = data.columns.indexOf("In"), colOut = data.columns.indexOf("Out");
    var colTo = data.columns.indexOf("Hands its output to");
    if (colIn < 1 || colOut < 1 || colTo < 1) {
      throw new Error('pipeline: the table needs "In", "Out" and "Hands its output to" columns');
    }
    if (data.rows.length < 2) throw new Error("pipeline: fewer than two components");
    var names = data.rows.map(function (r) { return r.label; });
    names.forEach(function (n, i) {
      if (names.indexOf(n) !== i) throw new Error("pipeline: " + JSON.stringify(n) + " is named twice");
    });
    var wires = [];
    data.rows.forEach(function (r, i) {
      var cell = r.cells[colTo - 1];
      if (cell === PIPE_NONE) return;
      cell.split(",").forEach(function (to) {
        var j = names.indexOf(to.trim());
        if (j < 0) throw new Error("pipeline: " + r.label + " hands its output to " + JSON.stringify(to.trim()) + ", no component in the table");
        if (wires.some(function (w) { return w.from === i && w.to === j; })) {
          throw new Error("pipeline: " + r.label + " hands its output to " + names[j] + " twice");
        }
        wires.push({ from: i, to: j });
      });
    });

    /* Stages: the longest run of hand-offs before each component. More passes than components
       means the hand-offs loop back, and a flow that loops back has no order to play. */
    var rank = names.map(function () { return 0; });
    for (var pass = 0, moved = true; moved; pass++) {
      if (pass > names.length) throw new Error("pipeline: the hand-offs loop back on themselves");
      moved = false;
      wires.forEach(function (w) {
        if (rank[w.to] < rank[w.from] + 1) { rank[w.to] = rank[w.from] + 1; moved = true; }
      });
    }
    var degree = names.map(function (_, i) {
      return wires.filter(function (w) { return w.from === i || w.to === i; }).length;
    });
    var busiest = 0;
    degree.forEach(function (d, i) { if (d > degree[busiest]) busiest = i; });
    var clocks = names.map(function (_, i) { return i; }).filter(function (i) { return !degree[i]; });
    if (!clocks.length) {
      throw new Error("pipeline: every component has hand-offs, so none starts the cycle");
    }
    /* When each component lights, in ms into a cycle: a clock (no wires) at once, stage k after k + 1
       stages. Its step in the order is the same count, from 1. */
    var litAt = rank.map(function (r, i) { return degree[i] ? (r + 1) * STAGE_MS : 0; });

    var slotOf = {};
    (fig.getAttribute("data-layout") || "").split(";").forEach(function (part) {
      if (!part.trim()) return;
      var at = part.lastIndexOf(":"), name = part.slice(0, at).trim(), slot = part.slice(at + 1).trim();
      if (at < 0 || names.indexOf(name) < 0) throw new Error("pipeline: the layout places " + JSON.stringify(part.trim()) + ", no component in the table");
      if (!PIPE_SLOTS[slot]) throw new Error("pipeline: the layout puts " + name + " in " + JSON.stringify(slot) + ", no slot the drawing has");
      Object.keys(slotOf).forEach(function (n) {
        if (slotOf[n] === slot) throw new Error("pipeline: " + n + " and " + name + " share the slot " + slot);
      });
      slotOf[name] = slot;
    });
    names.forEach(function (n) {
      if (!slotOf[n]) throw new Error("pipeline: " + n + " has no slot in the figure's data-layout");
    });
    wires.forEach(function (w) {
      w.route = PIPE_ROUTES[slotOf[names[w.from]] + " " + slotOf[names[w.to]]];
      if (!w.route) {
        throw new Error("pipeline: no route is drawn from " + slotOf[names[w.from]] + " to " + slotOf[names[w.to]] +
                        " (" + names[w.from] + " to " + names[w.to] + ")");
      }
    });

    var frame = make("div", "exhibit__frame", stage);
    var plane = make("div", "pipe", frame);
    /* On a screen narrower than the drawing, a line under it says the rest is a scroll away. */
    var hint = make("div", "pipe__hint", stage, "Scroll sideways for every component.");
    hint.setAttribute("aria-hidden", "true");
    plane.id = fig.id + "-flow";
    var headed = fig.getAttribute("data-first-column");
    if (headed) {
      var head = make("div", "pipe__head", plane, headed);
      head.setAttribute("aria-hidden", "true");
    }
    var sheet = make("div", "pipe__sheet", plane);
    sheet.style.aspectRatio = PIPE_W + " / " + PIPE_H;
    /* One arrowhead, named for this figure, so two copies of the Exhibit on one page would not share
       a marker. */
    var arrow = fig.id + "-arrow";
    sheet.insertAdjacentHTML("beforeend", '<svg class="pipe__wires" viewBox="0 0 ' + PIPE_W + " " + PIPE_H +
      '" aria-hidden="true" focusable="false"><defs><marker id="' + arrow + '" class="pipe__arrow" ' +
      'viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" ' +
      'orient="auto"><path d="M0 0.5 L8 4 L0 7.5z"/></marker></defs></svg>');
    var svg = sheet.lastChild;
    var choice = segmented(sheet, "Components", names, pick, null, "pipe__board");
    var group = sheet.lastChild, buttons = Array.prototype.slice.call(group.children);
    function place(el, i) {
      var c = PIPE_SLOTS[slotOf[names[i]]];
      el.style.left = (100 * (c[0] - PIPE_BOX[0] / 2) / PIPE_W) + "%";
      el.style.top = (100 * (c[1] - PIPE_BOX[1] / 2) / PIPE_H) + "%";
    }
    buttons.forEach(function (b, i) {
      place(b, i);
      b.style.width = (100 * PIPE_BOX[0] / PIPE_W) + "%";
      b.style.height = (100 * PIPE_BOX[1] / PIPE_H) + "%";
    });

    /* The pause sits under the drawing, after the components, so a keyboard meets the choice
       first and a walk that stops at the first control to change the readout never reaches it. */
    var paused = false;
    var toggle = null;
    if (!opts.compact && !reduced) {
      var bar = make("div", "exhibit__controls pipe__controls", stage);
      toggle = button(bar, "btn btn--outline btn--small", "Pause the flow", false);
    }
    var io = make("div", "pipe__io", stage);
    io.setAttribute("aria-live", "polite");
    var named = make("div", "pipe__name", io);
    var dl = make("dl", "pipe__dl", io);
    make("dt", "pipe__term", dl, "In");
    var given = make("dd", "pipe__said", dl);
    make("dt", "pipe__term", dl, "Out");
    var made = make("dd", "pipe__said", dl);
    given.setAttribute("data-result", "");
    made.setAttribute("data-result", "");

    wires.forEach(function (w) {
      w.path = svgChild(svg, "path", "pipe__wire");
      w.path.setAttribute("data-mark", names[w.from] + " to " + names[w.to]);
      w.path.setAttribute("d", w.route);
      w.path.setAttribute("marker-end", "url(#" + arrow + ")");
      w.length = w.path.getTotalLength();
    });

    function pick(i) {
      choice.press(i);
      named.textContent = names[i];
      given.textContent = data.rows[i].cells[colIn - 1];
      made.textContent = data.rows[i].cells[colOut - 1];
    }
    pick(busiest);

    function fits() { hint.hidden = frame.scrollWidth <= frame.clientWidth + 1; }
    fits();
    if (window.ResizeObserver) new window.ResizeObserver(fits).observe(frame);
    else window.addEventListener("resize", fits);

    /* Under reduced motion the order is told by number, on a badge at each component's corner. */
    if (reduced) {
      plane.setAttribute("data-flow", "still");
      names.forEach(function (_, i) {
        var step = make("span", "pipe__step", sheet, String(litAt[i] / STAGE_MS + 1));
        step.setAttribute("aria-hidden", "true");
        step.setAttribute("data-step", "");
        place(step, i);
      });
      return;
    }
    var ripples = clocks.map(function (i) {
      var c = PIPE_SLOTS[slotOf[names[i]]], reach = 0;
      rank.forEach(function (r, j) {
        if (degree[j] && r === 0) {
          var d = PIPE_SLOTS[slotOf[names[j]]];
          reach = Math.max(reach, Math.hypot(d[0] - c[0], d[1] - c[1]));
        }
      });
      var ring = svgChild(svg, "circle", "pipe__pulse");
      ring.setAttribute("cx", c[0]);
      ring.setAttribute("cy", c[1]);
      ring.setAttribute("data-packet", "");
      return { ring: ring, from: PIPE_BOX[1] / 2, reach: reach };
    });
    wires.forEach(function (w) {
      w.packet = svgChild(svg, "circle", "pipe__packet");
      w.packet.setAttribute("r", "3.5");
      w.packet.setAttribute("data-packet", "");
      w.leaves = litAt[w.to] - STAGE_MS;
    });
    /* A lap, looping: the last component lights, and the next ripple starts as its light goes
       out. */
    var lap = Math.max.apply(null, litAt) + HOLD_MS;
    var seen = !("IntersectionObserver" in window), ran = 0, last = null, frameId = null;
    function draw() {
      var t = opts.compact ? ran : ran % lap;
      ripples.forEach(function (p) {
        var k = Math.min(1, t / STAGE_MS);
        p.ring.setAttribute("r", (p.from + k * (p.reach - p.from)).toFixed(1));
        p.ring.setAttribute("opacity", (0.7 * (1 - k)).toFixed(2));
      });
      buttons.forEach(function (b, i) {
        b.classList.toggle("is-lit", t >= litAt[i] && t < litAt[i] + HOLD_MS);
      });
      wires.forEach(function (w) {
        var f = (t - w.leaves) / STAGE_MS;
        if (f < 0 || f > 1) { w.packet.setAttribute("opacity", "0"); return; }
        var at = w.path.getPointAtLength(f * w.length);
        w.packet.setAttribute("cx", at.x.toFixed(1));
        w.packet.setAttribute("cy", at.y.toFixed(1));
        w.packet.setAttribute("opacity", Math.min(1, 8 * f, 8 * (1 - f)).toFixed(2));
      });
    }
    var watch = null;
    function tick(t) {
      frameId = null;
      if (last !== null) ran += t - last;
      last = t;
      if (opts.compact && ran >= PASS_MS) {
        wires.forEach(function (w) { w.packet.remove(); });
        ripples.forEach(function (p) { p.ring.remove(); });
        buttons.forEach(function (b) { b.classList.remove("is-lit"); });
        plane.setAttribute("data-flow", "still");
        if (watch) watch.disconnect();
        return;
      }
      draw();
      frameId = window.requestAnimationFrame(tick);
    }
    function sync() {
      if (plane.getAttribute("data-flow") === "still") return;
      var go = seen && !paused;
      plane.setAttribute("data-flow", go ? "running" : "paused");
      if (go && frameId === null) { last = null; frameId = window.requestAnimationFrame(tick); }
      if (!go && frameId !== null) { window.cancelAnimationFrame(frameId); frameId = null; }
    }
    if (toggle) {
      toggle.setAttribute("aria-controls", plane.id);
      toggle.addEventListener("click", function () {
        paused = !paused;
        toggle.setAttribute("aria-pressed", String(paused));
        sync();
      });
    }
    if (!seen) {
      watch = new window.IntersectionObserver(function (es) {
        es.forEach(function (e) { seen = e.isIntersecting; });
        sync();
      });
      watch.observe(plane);
    }
    draw();
    sync();
  });

  /* ---- KIND: versioned-rules -------------------------------------------------------------------
     TradeLog's Versioned Investment Rules. The table follows one Rule, "Rule X, its category",
     across the Illustrative Investor's week, a row per day: the version the day was recorded under
     (Version 1, then Version 2 from the revision on), and its grade, Kept or Broken, under each
     version. Its columns are found by header.

     Saved as version 2 (the opening view, because it is the one that shows the point): the week as
     a ledger, a day to a row, each naming the version it was recorded under and that version's
     grade. A rule between the last version-1 day and the first version-2 day marks the revision
     (data-mark "Rule B revised after Thursday"); no grade already given changes.

     "Edit in place" is the other choice: the Rule keeps no version, so every day is named with the
     Rule as edited and graded under version 2. A version-1 day whose grade that changes is ringed
     and marked (data-mark "Tuesday"), with the grade it had struck through beside the new one; the
     ring is the Exhibit's, since a record edited in place keeps no trace of the change. Grades and
     rings change by transition, which the reduced-motion blanket collapses; nothing plays over
     time, so there is no aria-busy, and no hover readouts.

     The readout (data-result) says when the Rule was revised and which days each version grades;
     edited in place, that no day records its version and which days changed, from and to.

     A table the drawing cannot show or word is refused: a column it needs missing or repeated, a
     Rule not written "Rule X, its category" or more than one Rule, a day recorded under anything
     but Version 1 or Version 2, a grade other than Kept or Broken, a day graded twice, a version-1
     day after a version-2 day, or a week with no revision in it. */
  register("versioned-rules", function (fig, stage, data) {
    var cols = ["Day", "Rule", "Recorded under", "Graded under version 1", "Graded under version 2"]
      .map(function (name) { return column(data, "versioned-rules", name); });
    var days = [], rule = null;
    data.rows.forEach(function (r) {
      var name = cell(r, cols[1]), rec = /^Version ([12])$/.exec(cell(r, cols[2]));
      var d = { day: cell(r, cols[0]), version: rec ? Number(rec[1]) : 0,
                grades: [cell(r, cols[3]), cell(r, cols[4])] };
      if (!d.day || !/^Rule [A-Z], \S/.test(name)) {
        throw new Error("versioned-rules: a row is not a day and 'Rule X, its category'");
      }
      if (rule && name !== rule) throw new Error("versioned-rules: the table follows more than one Rule");
      rule = name;
      if (!d.version) {
        throw new Error("versioned-rules: " + d.day + " is not recorded under Version 1 or Version 2");
      }
      if (!GRADES[d.grades[0]] || !GRADES[d.grades[1]]) {
        throw new Error("versioned-rules: " + JSON.stringify(d.grades.join(" / ")) + " is not Kept or Broken");
      }
      if (days.some(function (x) { return x.day === d.day; })) {
        throw new Error("versioned-rules: " + d.day + " is graded twice");
      }
      if (days.length && d.version < days[days.length - 1].version) {
        throw new Error("versioned-rules: " + d.day + " is recorded under version 1 after the revision");
      }
      days.push(d);
    });
    var before = days.filter(function (d) { return d.version === 1; });
    var after = days.filter(function (d) { return d.version === 2; });
    if (!before.length || !after.length) {
      throw new Error("versioned-rules: the week needs days under version 1, then days under version 2");
    }
    var ruleName = rule.split(",")[0], last = before[before.length - 1].day, edited = false;

    var bar = make("div", "exhibit__controls", stage);
    make("span", "vers__ask", bar, "Rule change");
    var pick = segmented(bar, "How " + ruleName + " is changed", ["Save as version 2", "Edit in place"],
                         function (i) { edited = i === 1; update(); },
                         ["Revise " + ruleName + " and save as version 2", "Edit in place: " + ruleName]);

    var ledger = make("div", "vers", stage);
    ledger.setAttribute("role", "group");
    var cut = null;
    days.forEach(function (d) {
      var row = make("div", "vers__day", ledger);
      row.setAttribute("role", "img");
      make("span", "vers__name", row, d.day).setAttribute("aria-hidden", "true");
      d.tag = make("span", "vers__tag chip", row);
      d.grade = make("span", "vers__grade", row);
      d.was = make("s", "vers__was", row);
      [d.tag, d.grade, d.was].forEach(function (x) { x.setAttribute("aria-hidden", "true"); });
      d.row = row;
      if (d.day === last) cut = make("div", "vers__cut", ledger);
    });

    var readout = make("div", "exhibit__readout", stage);
    readout.setAttribute("aria-live", "polite");
    var read = make("div", "vers__read", readout);
    read.setAttribute("data-result", "");

    function mark(g) { return GRADE_SIGNS[g] + " " + GRADES[g]; }
    function names(list) {
      var ds = list.map(function (d) { return d.day; });
      return ds.length > 1 ? ds.slice(0, -1).join(", ") + " and " + ds[ds.length - 1] : ds[0];
    }

    function update() {
      pick.press(edited ? 1 : 0);
      ledger.setAttribute("aria-label", edited
        ? "The week under " + ruleName + " as edited in place, a day to a row"
        : "The week under " + ruleName + ", a day to a row, each with the version it was recorded under");
      var changed = [];
      days.forEach(function (d) {
        var g = edited ? d.grades[1] : d.grades[d.version - 1];
        var rewritten = edited && d.version === 1 && d.grades[0] !== d.grades[1];
        d.tag.textContent = edited ? "as edited" : "version " + d.version;
        d.tag.classList.toggle("chip--plain", edited);
        d.grade.textContent = mark(g);
        d.grade.className = "vers__grade is-" + GRADES[g];
        d.was.textContent = rewritten ? "was " + mark(d.grades[0]) : "";
        d.row.classList.toggle("is-rewritten", rewritten);
        d.row.setAttribute("aria-label", d.day + ": " + (edited ? ruleName + " as edited" : "version " + d.version) +
                           ", " + GRADES[g] + (rewritten ? ", graded " + GRADES[d.grades[0]] + " before the edit" : ""));
        if (rewritten) {
          d.row.setAttribute("data-mark", d.day);
          changed.push(d.day + (changed.length ? "" : " changes") + " from " + GRADES[d.grades[0]] +
                       " to " + GRADES[g]);
        } else {
          d.row.removeAttribute("data-mark");
        }
      });
      cut.classList.toggle("is-edited", edited);
      if (edited) {
        cut.textContent = ruleName + " edited in place after " + last + "’s review; no version saved";
        cut.removeAttribute("data-mark");
        read.textContent = ruleName + " was edited in place after " + last + "’s review, so no day records " +
          "which version graded it; every day is now graded under the edited Rule. " +
          (changed.length ? changed.join(", and ") + ". The record shows no sign that anything changed; " +
            "the rings are this Exhibit’s, not the system’s."
                          : "No grade already given happens to change.");
        return;
      }
      cut.textContent = ruleName + " revised on review after " + last + "; saved as version 2";
      cut.setAttribute("data-mark", ruleName + " revised after " + last);
      read.textContent = ruleName + " was revised after " + last + "’s review and saved as version 2. " +
        names(after) + (after.length > 1 ? " are" : " is") + " graded under version 2. " +
        names(before) + (before.length > 1 ? " keep" : " keeps") + " version 1 and the grades " +
        "given under it; no result already graded changed.";
    }

    update();
  });

  /* ---- KIND: broker-integration ----------------------------------------------------------------
     TradeLog's Read-Only Broker Integration. The table lists the paths between the broker and
     TradeLog, a row per failure mode: the path's name, where it runs from and to, whether it was
     Built (Yes or No), and how it fails. Its columns are found by header, and a path's rows sit
     together.

     Connection working (the opening view, because it is the one that shows the point): the built
     path, from the broker into TradeLog, is drawn whole and marked (data-mark "Read the execution
     record, built"); every path not built is drawn struck through and marked ("Place an order, not
     built"), with each of its failure modes struck under it and marked ("Failure mode: A bug that
     moves money"), since a path that does not exist cannot fail.

     "Connection failed" is the other choice: the built path breaks, its line labelled "connection
     failed" where it read "reads into", and a stale notice goes up above everything else
     (data-mark "Stale record"), because a stale count shown as a current one gets believed. The struck paths stay struck: nothing is sent to the broker to recover. The
     notice and the break change by transition, which the reduced-motion blanket collapses; nothing
     plays over time, so there is no aria-busy, and no hover readouts.

     Every path and failure mode is role="img", its aria-label naming the path, where it runs from
     and to, and whether it was built. The readout (data-result) says what is read and that nothing
     is sent back, naming each failure mode of a path not built; failed, that the record is stale.

     A table the drawing cannot show or word is refused: a column it needs missing or repeated, a
     Built other than Yes or No, a path whose rows disagree or sit apart, a row with no failure
     mode, no path not built, or anything but exactly one built path, from the broker to TradeLog -
     a built path to the broker is an order path, and the system places none. */
  var INTEG_BROKER = "The broker", INTEG_SYSTEM = "TradeLog";
  register("broker-integration", function (fig, stage, data) {
    var cols = ["Path", "From", "To", "Built", "Failure mode"].map(function (name) {
      return column(data, "broker-integration", name);
    });
    var paths = [];
    data.rows.forEach(function (r) {
      var p = { name: cell(r, cols[0]), from: cell(r, cols[1]), to: cell(r, cols[2]),
                built: cell(r, cols[3]), modes: [] };
      var mode = cell(r, cols[4]), last = paths[paths.length - 1];
      if (p.built !== "Yes" && p.built !== "No") {
        throw new Error("broker-integration: " + p.name + " is built " + JSON.stringify(p.built) + "; Yes or No");
      }
      if (!p.name || !mode) throw new Error("broker-integration: a row has no path or no failure mode");
      if (last && last.name === p.name) {
        if (last.from !== p.from || last.to !== p.to || last.built !== p.built) {
          throw new Error("broker-integration: " + p.name + "'s rows disagree");
        }
        p = last;
      } else if (paths.some(function (x) { return x.name === p.name; })) {
        throw new Error("broker-integration: " + p.name + "'s rows sit apart");
      } else {
        paths.push(p);
      }
      p.modes.push(mode);
    });
    var built = paths.filter(function (p) { return p.built === "Yes"; });
    var struck = paths.filter(function (p) { return p.built === "No"; });
    if (built.length !== 1 || built[0].from !== INTEG_BROKER || built[0].to !== INTEG_SYSTEM) {
      throw new Error("broker-integration: exactly one path is built, from the broker to TradeLog");
    }
    if (!struck.length) throw new Error("broker-integration: no path was left unbuilt");
    var inPath = built[0];
    var failed = false;

    var bar = make("div", "exhibit__controls", stage);
    make("span", "integ__ask", bar, "Connection");
    var pick = segmented(bar, "The connection to the broker", ["Connection working", "Connection failed"],
                         function (i) { failed = i === 1; update(); },
                         ["Show the connection working", "Show the connection failed"]);

    var board = make("div", "integ", stage);
    var notice = make("div", "integ__notice", board);
    function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
    function place(s) { return s === INTEG_BROKER ? lower(s) : s; }
    function lane(p) {
      var row = make("div", "integ__path", board);
      row.setAttribute("role", "img");
      make(p.built === "Yes" ? "span" : "s", "integ__name", row, p.name);
      var line = make("span", "integ__line", row);
      make("span", "integ__end", line, p.from);
      p.arrow = make("span", "integ__arrow", line, p.built === "Yes" ? "reads into" : "not built");
      make("span", "integ__end", line, p.to);
      Array.prototype.forEach.call(row.children, function (x) { x.setAttribute("aria-hidden", "true"); });
      return row;
    }
    inPath.row = lane(inPath);
    struck.forEach(function (p) {
      p.row = lane(p);
      p.row.classList.add("is-struck");
      p.row.setAttribute("data-mark", p.name + ", not built");
      p.row.setAttribute("aria-label", p.name + ": from " + place(p.from) + " to " + place(p.to) +
                         ", not built, so nothing can be sent that way");
      var list = make("div", "integ__modes", board);
      p.modes.forEach(function (m) {
        var mode = make("s", "integ__mode", list, m);
        mode.setAttribute("role", "img");
        mode.setAttribute("data-mark", "Failure mode: " + m);
        mode.setAttribute("aria-label", "Failure mode of " + lower(p.name) + ": " + lower(m) +
                          "; it cannot occur, since the path was not built");
      });
    });

    var readout = make("div", "exhibit__readout", stage);
    readout.setAttribute("aria-live", "polite");
    var said = make("div", "integ__read", readout);
    said.setAttribute("data-result", "");

    function update() {
      pick.press(failed ? 1 : 0);
      inPath.row.classList.toggle("is-failed", failed);
      inPath.arrow.textContent = failed ? "connection failed" : "reads into";
      inPath.row.setAttribute("data-mark", inPath.name + ", built");
      inPath.row.setAttribute("aria-label", inPath.name + ": from " + place(inPath.from) + " to " +
                              place(inPath.to) + ", built" +
                              (failed ? ", connection failed: " + lower(inPath.modes.join("; "))
                                      : "; it reads and never writes"));
      notice.hidden = !failed;
      if (failed) {
        notice.textContent = "Connection failed. The record is stale; no count shown is current.";
        notice.setAttribute("data-mark", "Stale record");
        said.textContent = "The connection failed, so the broker’s record is stale. TradeLog says so " +
          "above everything else, the last count is not shown as current, and nothing is sent to " +
          "the broker to recover it: the order path stays struck.";
        return;
      }
      notice.textContent = "";
      notice.removeAttribute("data-mark");
      said.textContent = INTEG_SYSTEM + " reads every execution from the broker and sends nothing back. " +
        struck.map(function (p) {
          return "The path to " + lower(p.name) + " was not built, so none of its failure modes can occur: " +
            p.modes.map(lower).join(", or ") + ".";
        }).join(" ");
    }

    update();
  });

  /* The one global: the shared slider and the registry, for a kind that lives in its own file later
     and for the harness, which proves the slider on a fixture apart from any one Exhibit that uses it. */
  window.Exhibit = { register: register, slider: slider };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
