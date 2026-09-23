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
     nothing.

   EVERY KIND DECLARES ITS RESULT. The element (or elements) stating what the reader's action
     produced - a count, a total, a date - carries data-result. The harness operates each control the
     way a keyboard does (a button - an action, a toggle with aria-pressed, a segment - is pressed; a
     slider or a draggable mark, role="slider", takes an arrow key; a new kind of control is one
     entry in OPERATORS in suites/collect.js) and requires some control to change a result's text.
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
      draw(fig, stage, readTable(fig));
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

  /* The one global: the shared slider and the registry, for a kind that lives in its own file later
     and for the harness, which proves the slider on a fixture because no shipped Exhibit uses it yet. */
  window.Exhibit = { register: register, slider: slider };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
