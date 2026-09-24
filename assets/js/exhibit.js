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
    var sums = make("dl", "agecheck__sums", readout);
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
      serialOut.textContent = grouped(en.serial) + (en.passes ? " — above the floor" : " — not above the floor");
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

    var bar = make("div", "exhibit__controls mentions__controls", stage);
    make("span", "mentions__control", bar, data.columns[2] + " added").setAttribute("aria-hidden", "true");
    slider(bar, {
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

  /* ---- helpers shared by The Research's kinds -----------------------------------------------------
     A segmented choice: a named group of pressed-state buttons, the first pressed. Clicking one calls
     onPick with its index; the kind decides what changes, and press(i) shows which option holds.
     svgChild adds a classed child to an SVG parsed from markup, taking the SVG namespace from it
     rather than from a URL written here (suites/run.py reads any URL in a shipped script as a load). */
  function segmented(bar, label, names, onPick) {
    var group = make("div", "seg", bar);
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", label);
    var options = names.map(function (name, i) {
      var b = button(group, "seg__option", name, i === 0);
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
     mark (data-mark) on each day the chosen frequency decides, spread evenly across it. A segmented
     choice picks the frequency; the result is the count of decisions.

     A table the drawing cannot show is refused (the stage stays empty and the table stands alone):
     no "Decisions in the window" column, found by its header; a count that is not a whole number; a
     first row that hedges, since it is the window's length; or counts that do not fall down the rows,
     since a rarer rebalance cannot decide more often. */
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
    var days = options[0].count, pick = 0;

    var bar = make("div", "exhibit__controls", stage);
    var group = make("div", "seg", bar);
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Rebalance frequency");
    var picks = options.map(function (o, i) {
      var b = button(group, "seg__option", o.name, i === 0);
      b.addEventListener("click", function () { pick = i; update(); });
      return b;
    });

    /* The long axis and the window at its end. */
    var years = make("div", "dwin__years", stage);
    make("p", "dwin__label", years, "Several years and several regimes: the history the backfill is building");
    var axis = make("div", "dwin__axis", years);
    axis.setAttribute("aria-hidden", "true");
    make("span", "dwin__sliver", axis);
    make("p", "dwin__label dwin__label--end", years, "The whole history so far");

    /* The window, enlarged: a tick per trading day. */
    var zoom = make("div", "dwin__zoom", stage);
    make("p", "dwin__label", zoom, "The whole history, enlarged: " + days + " trading days");
    var strip = make("div", "dwin__days", zoom);
    strip.setAttribute("role", "img");
    var ticks = [];
    for (var d = 0; d < days; d++) ticks.push(make("span", "dwin__day", strip));

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
      for (var k = 0; k < o.count; k++) on[Math.floor(k * days / o.count)] = true;
      ticks.forEach(function (t, i) {
        t.classList.toggle("is-decision", !!on[i]);
        if (on[i]) t.setAttribute("data-mark", "");
        else t.removeAttribute("data-mark");
      });
      strip.setAttribute("aria-label", o.said + " decisions marked across " + days + " trading days");
      tally.textContent = o.said;
      phrase.nodeValue = o.count === 1 ? " decision in the whole history" : " decisions in the whole history";
      note.textContent = "One market environment, read " + (o.count === 2 ? "twice" : o.said + " times") +
        ": a ratio annualised from it would describe the window, not the system.";
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
