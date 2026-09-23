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

       slider(host, { min, max, step, value, label, valueText: function (v) {…}, onChange })  */
  function slider(host, o) {
    var min = o.min, max = o.max, step = o.step || 1, value = null;
    var el = make("div", "slider", host);
    el.setAttribute("role", "slider");
    el.tabIndex = 0;
    el.setAttribute("aria-label", o.label);
    el.setAttribute("aria-valuemin", String(min));
    el.setAttribute("aria-valuemax", String(max));
    var track = make("span", "slider__track", el);
    track.setAttribute("aria-hidden", "true");
    var fill = make("span", "slider__fill", track);
    var thumb = make("span", "slider__thumb", track);

    function set(v, quiet) {
      v = Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step));
      v = +v.toFixed(6);
      if (v === value) return;
      value = v;
      el.setAttribute("aria-valuenow", String(v));
      el.setAttribute("aria-valuetext", o.valueText ? o.valueText(v) : String(v));
      var pct = max > min ? (v - min) / (max - min) * 100 : 0;
      fill.style.width = pct + "%";
      thumb.style.left = pct + "%";
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
    var procGroup = make("div", "seg", bar);
    procGroup.setAttribute("role", "group");
    procGroup.setAttribute("aria-label", "Process");
    /* Choosing a process plays it from the start - the one already chosen too, as a replay. */
    var procButtons = orders.map(function (o, i) {
      var b = button(procGroup, "seg__option", o.name, i === 0);
      b.addEventListener("click", function () {
        proc = i;
        build();
        play();
      });
      return b;
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
      procButtons.forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === proc)); });
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
    var viewGroup = make("div", "seg", bar);
    viewGroup.setAttribute("role", "group");
    viewGroup.setAttribute("aria-label", "Export");
    var viewButtons = ["Raw export", "Prepared"].map(function (name, i) {
      var b = button(viewGroup, "seg__option", name, i === 0);
      b.addEventListener("click", function () { prepared = i === 1; update(); });
      return b;
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
      viewButtons.forEach(function (b, i) { b.setAttribute("aria-pressed", String((i === 1) === prepared)); });
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
      make("span", "suite__sev" + (d.high ? " suite__sev--high" : ""), b, d.high ? "Would reach figures" : "Defect");
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
    /* Where a quadrant's members go: evenly down its height, clear of its name (at the outer edge),
       and stepping in from its outer side, the side their labels do not run to. */
    Object.keys(quads).forEach(function (k) {
      var q = quads[k], n = q.members.length;
      var lo = q.row ? 0.15 : 0.55, hi = q.row ? 0.45 : 0.82;
      q.members.forEach(function (m, j) {
        var t = n === 1 ? 0.5 : j / (n - 1);
        var inset = 0.1 + 0.06 * j;
        m.x = q.col ? 1 - inset : inset;
        m.y = hi - (hi - lo) * t;
        m.right = !q.col;
      });
    });

    var frame = make("div", "exhibit__frame", stage);
    var plot = make("div", "overview", frame);
    var svg = [];
    svg.push('<svg viewBox="0 0 ' + W + " " + H + '" aria-hidden="true" focusable="false">');
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
      place(a, X(m.x), Y(1 - m.y));
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
    var group = make("div", "seg", bar);
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Periods shown");
    var viewButtons = views.map(function (name, i) {
      var b = button(group, "seg__option", name, i === 0);
      b.addEventListener("click", function () { flattering = i === 1; update(); });
      return b;
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
      viewButtons.forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === (flattering ? 1 : 0))); });
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

  /* The one global: the shared slider and the registry, for a kind that lives in its own file later
     and for the harness, which proves the slider on a fixture because no shipped Exhibit uses it yet. */
  window.Exhibit = { register: register, slider: slider };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
