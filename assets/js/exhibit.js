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

  /* The one global: the shared slider and the registry, for a kind that lives in its own file later
     and for the harness, which proves the slider on a fixture because no shipped Exhibit uses it yet. */
  window.Exhibit = { register: register, slider: slider };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
