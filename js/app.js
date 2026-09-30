/* emBODY web — participant app */
(function () {
  "use strict";
  var E = window.Embody, L = E.LAYOUT;
  var cfg, T, expKey, app, session = null;

  // Each painting panel covers a strip of the canonical 900x600 v1 page
  // around one body, so recorded coordinates match the original tool.
  var PANEL_W = L.body.left * 2 + L.body.w;  // 235
  var PANEL_H = L.body.top + L.body.h + 10;  // 544
  var PANELS = [
    { x0: 0, color: "255,0,0" },                     // left body: increase
    { x0: L.width - PANEL_W, color: "0,0,255" }      // right body: decrease
  ];

  var bodyImg = new Image();
  bodyImg.src = "assets/body.png";

  E.loadConfig().then(function (c) {
    if (!c) throw new Error("config.js did not define EMBODY_CONFIG");
    cfg = c; T = c.texts || {}; expKey = E.experimentKey(c);
    document.title = c.title || "emBODY";
    app = document.getElementById("app");
    route();
  }).catch(function (err) {
    document.getElementById("app").innerHTML =
      '<div class="card"><h1>Configuration error</h1><p>' + E.escapeHtml(err.message) + "</p></div>";
  });

  function t(key, vars) {
    return E.fill(T[key] != null ? T[key] : key, Object.assign({
      user: session ? E.escapeHtml(session.id) : "",
      percentage: session ? percent(session) : 0
    }, vars || {}));
  }
  function percent(s) { return Math.floor(10000 * s.done / s.presentation.length) / 100; }

  function route() {
    var urlId = cfg.allowUrlId !== false ? new URLSearchParams(location.search).get("id") : null;
    if (urlId && /^[\w-]{1,64}$/.test(urlId)) {
      session = E.store.get(expKey, urlId) || newSession(urlId);
      return next();
    }
    showStart();
  }

  function next() {
    if (!session.registered && cfg.demographics) return showRegister();
    if (session.done >= session.presentation.length) return showDone();
    if (!session.seenInstructions) return showInstructions();
    showPaint();
  }

  function save() { E.store.set(expKey, session.id, session); }

  function newSession(id) {
    if (!id) {
      do { id = String(Math.floor(10000000 + Math.random() * 90000000)); } while (E.store.get(expKey, id));
    }
    var order = cfg.stimuli.map(function (_, i) { return i; });
    if (cfg.randomize) {
      for (var i = order.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)), tmp = order[i]; order[i] = order[j]; order[j] = tmp;
      }
    }
    var tok = new Uint8Array(12);
    crypto.getRandomValues(tok);
    session = {
      id: id, experiment: expKey, token: Array.prototype.map.call(tok, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""),
      stimuli: cfg.stimuli.map(E.stimulusLabel), presentation: order, done: 0, csv: {}, sent: {},
      registered: !cfg.demographics, seenInstructions: false, started: new Date().toISOString(),
      tech: {
        userAgent: navigator.userAgent, language: navigator.language,
        screen: screen.width + "x" + screen.height, devicePixelRatio: window.devicePixelRatio,
        viewport: innerWidth + "x" + innerHeight, touch: "ontouchstart" in window, url: location.href.split("?")[0]
      }
    };
    save();
    return session;
  }

  // ---------- Views ----------
  function showStart() {
    app.innerHTML =
      '<div class="card center">' +
      "<h1>" + E.escapeHtml(cfg.title || "emBODY") + "</h1>" +
      '<button class="primary big" id="new">' + t("newParticipant") + "</button>" +
      '<form id="login" class="login"><label for="uid">' + t("loginPrompt") + "</label>" +
      '<div class="row"><input id="uid" autocomplete="off" inputmode="text">' +
      '<button type="submit">' + t("loginButton") + "</button></div>" +
      '<p class="error" id="err" hidden></p></form></div>';
    document.getElementById("new").onclick = function () { newSession(); next(); };
    document.getElementById("login").onsubmit = function (e) {
      e.preventDefault();
      var id = document.getElementById("uid").value.trim(), s = E.store.get(expKey, id);
      if (s) { session = s; return next(); }
      var el = document.getElementById("err");
      el.hidden = false;
      el.innerHTML = E.fill(T.unknownId, { user: E.escapeHtml(id) });
    };
  }

  function showRegister() {
    function radios(name, opts) {
      return opts.map(function (o, i) {
        return '<label class="opt"><input type="radio" name="' + name + '" value="' + i + '"> ' + t(o) + "</label>";
      }).join("");
    }
    function select(name, from, to, def, unit) {
      var h = '<select name="' + name + '">';
      for (var i = from; i < to; i++) h += "<option" + (i === def ? " selected" : "") + ">" + i + "</option>";
      return h + "</select> " + (unit ? t(unit) : "");
    }
    var rows = [
      ["sex", "rp_sex", radios("sex", ["rp_male", "rp_female"])],
      ["age", "rp_age", select("age", 0, 100, 18)],
      ["weight", "rp_weight", select("weight", 0, 200, 60, "rp_kg")],
      ["height", "rp_height", select("height", 0, 250, 170, "rp_cm")],
      ["hand", "rp_handedness", radios("hand", ["rp_left", "rp_right"])],
      ["education", "rp_education", radios("education", ["rp_edu1", "rp_edu2", "rp_edu3"])],
      ["psychologist", "rp_ps1", radios("psychologist", ["rp_n", "rp_y"])],
      ["psychiatrist", "rp_ps2", radios("psychiatrist", ["rp_n", "rp_y"])],
      ["neurologist", "rp_ps3", radios("neurologist", ["rp_n", "rp_y"])]
    ];
    app.innerHTML =
      '<div class="card"><h1>' + t("rp_title") + '</h1><p class="muted"><i>' + t("rp_text") + "</i></p>" +
      '<form id="reg"><table class="reg">' +
      rows.map(function (r) { return "<tr><th>" + t(r[1]) + "</th><td>" + r[2] + "</td></tr>"; }).join("") +
      '</table><p class="error" id="err" hidden></p><button class="primary big" type="submit">' + t("rp_submit") +
      "</button></form></div>";
    document.getElementById("reg").onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(e.target), vals = [], missing = [];
      rows.forEach(function (r) {
        var v = fd.get(r[0]);
        if (v == null) missing.push(t(r[1]).replace(/<[^>]*>/g, ""));
        vals.push(v);
      });
      if (missing.length) {
        var el = document.getElementById("err");
        el.hidden = false;
        el.textContent = t("rp_missing").replace(/<[^>]*>/g, "") + missing.join(", ");
        return;
      }
      session.demographics = vals.join(",") + ","; // same as v1 data.txt
      session.registered = true;
      save();
      sync();
      next();
    };
  }

  function showInstructions() {
    var resuming = session.done > 0;
    app.innerHTML =
      header() + '<div class="card"><h1>' + t("welcome") + "</h1><h2>" + t("instructionsTitle") + "</h2>" +
      '<div class="instructions">' + t("instructions") + "</div>" +
      '<button class="primary big" id="go">' + t(resuming ? "resume" : "start") + "</button></div>";
    document.getElementById("go").onclick = function () { session.seenInstructions = true; save(); showPaint(); };
  }

  function header() {
    var p = percent(session);
    return '<header class="bar"><span class="uid">id: ' + E.escapeHtml(session.id) + "</span>" +
      '<div class="progress" role="progressbar" aria-valuenow="' + p + '" aria-valuemin="0" aria-valuemax="100">' +
      '<div style="width:' + p + '%"></div><span>' + p + "%</span></div>" +
      '<button class="link" id="help" type="button">' + t("help") + "</button></header>";
  }

  function showPaint() {
    var p = session.presentation[session.done];
    var stim = cfg.stimuli[p];
    var stimHtml = cfg.type === "images" && typeof stim === "object" && stim.image
      ? '<img class="stim-img" src="' + E.escapeHtml(stim.image) + '" alt="">'
      : '<div class="word">' + E.escapeHtml(E.stimulusLabel(stim)) + "</div>";
    app.innerHTML = header() +
      '<main class="paint">' +
      '<div class="center-col"><h3 class="task">' + t("tasklabel") + "</h3>" + stimHtml +
      '<p class="rotate-hint">' + t("rotateHint") + "</p></div>" +
      '<figure class="panel left"><canvas data-i="0"></canvas><figcaption>' + t("leftLabel") + "</figcaption></figure>" +
      '<figure class="panel right"><canvas data-i="1"></canvas><figcaption>' + t("rightLabel") + "</figcaption></figure>" +
      "</main>" +
      '<footer class="bar"><button id="reset" class="danger">' + t("reset") + "</button>" +
      '<span id="status" class="status" aria-live="polite"></span>' +
      '<button id="next" class="primary">' + t("forward") + "</button></footer>";
    window.scrollTo(0, 0);
    document.getElementById("help").onclick = showHelp;

    var rec = { mouse: [], paint: [], down: [], up: [] };
    var canvases = Array.prototype.slice.call(app.querySelectorAll("canvas"));
    var drawing = false;

    function stamp(e) { return Math.round(performance.timeOrigin + e.timeStamp); }
    function toCanon(cv, e) {
      var r = cv.getBoundingClientRect(), i = +cv.dataset.i;
      var x = PANELS[i].x0 + (e.clientX - r.left) * PANEL_W / r.width;
      var y = (e.clientY - r.top) * PANEL_H / r.height;
      return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
    }
    function dot(i, x, y) {
      var cv = canvases[i], ctx = cv.getContext("2d"), s = cv.width / PANEL_W;
      ctx.fillStyle = "rgba(" + (x < L.half ? PANELS[0].color : PANELS[1].color) + "," + L.alpha + ")";
      ctx.beginPath();
      ctx.arc((x - PANELS[i].x0) * s, y * s, (L.brush / 2 + 1) * s, 0, 2 * Math.PI);
      ctx.fill();
    }
    function redraw() {
      canvases.forEach(function (cv, i) {
        var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
        cv.width = Math.max(1, Math.round(r.width * dpr));
        cv.height = Math.max(1, Math.round(r.height * dpr));
        var ctx = cv.getContext("2d"), s = cv.width / PANEL_W;
        ctx.clearRect(0, 0, cv.width, cv.height);
        if (bodyImg.complete) ctx.drawImage(bodyImg, L.body.left * s, L.body.top * s, L.body.w * s, L.body.h * s);
      });
      rec.paint.forEach(function (pt) { dot(pt[1] < L.half ? 0 : 1, pt[1], pt[2]); });
    }
    function paintAt(cv, e) {
      var c = toCanon(cv, e), ts = stamp(e);
      rec.paint.push([ts, c[0], c[1]]);
      dot(+cv.dataset.i, c[0], c[1]);
    }

    canvases.forEach(function (cv) {
      cv.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        drawing = true;
        rec.down.push(stamp(e));
        var c = toCanon(cv, e);
        rec.mouse.push([stamp(e), c[0], c[1]]);
        paintAt(cv, e);
      });
      cv.addEventListener("pointermove", function (e) {
        var c = toCanon(cv, e);
        rec.mouse.push([stamp(e), c[0], c[1]]);
        if (drawing) paintAt(cv, e);
      });
      cv.addEventListener("pointerleave", function () { drawing = false; });
    });
    function up(e) { if (drawing) { drawing = false; rec.up.push(stamp(e)); } }
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.onresize = redraw;
    if (!bodyImg.complete) bodyImg.onload = redraw;
    redraw();

    document.getElementById("reset").onclick = function () {
      rec = { mouse: [], paint: [], down: [], up: [] };
      redraw();
    };
    document.getElementById("next").onclick = function () {
      if (!rec.paint.length && !confirm(t("emptyWarning").replace(/<[^>]*>/g, ""))) return;
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.onresize = null;
      session.csv[p] = E.toCsv(rec);
      session.done++;
      if (session.done >= session.presentation.length) session.finished = new Date().toISOString();
      save();
      var btn = this;
      btn.disabled = true;
      document.getElementById("status").textContent = cfg.submit && cfg.submit.endpoint ? t("saving") : "";
      sync().then(next, function () {
        // Keep the data locally and let the participant retry
        btn.disabled = false;
        var st = document.getElementById("status");
        st.innerHTML = '<span class="error">' + t("saveError") + '</span> <button id="retry">' + t("retry") + "</button>";
        document.getElementById("retry").onclick = function () { st.textContent = t("saving"); sync().then(next, function () { st.innerHTML = '<span class="error">' + t("saveError") + "</span>"; }); };
        btn.onclick = function () { sync().then(next, function () {}); };
      });
    };
  }

  function showHelp() {
    var d = document.createElement("dialog");
    d.className = "help";
    d.innerHTML = "<h2>" + t("instructionsTitle") + "</h2>" + t("instructions") +
      '<form method="dialog"><button class="primary">OK</button></form>';
    document.body.appendChild(d);
    d.addEventListener("close", function () { d.remove(); });
    d.showModal();
  }

  function showDone() {
    var allowDl = cfg.submit && cfg.submit.participantDownload;
    app.innerHTML = header() + '<div class="card center"><h1>' + t("welcome") + "</h1><p>" + t("thankYou") + "</p>" +
      (allowDl ? '<button class="primary" id="dl">' + t("downloadData") + "</button>" : "") +
      '<p class="error" id="err" hidden></p></div>';
    document.getElementById("help").onclick = showHelp;
    if (allowDl) document.getElementById("dl").onclick = function () {
      E.download(E.makeZip(E.sessionFiles(session)), "embody_" + session.id + ".zip");
    };
    sync().then(function () {
      if (cfg.completionUrl) setTimeout(function () { location.href = E.fill(cfg.completionUrl, { user: encodeURIComponent(session.id) }); }, 1500);
    }, function () {
      var el = document.getElementById("err");
      el.hidden = false;
      el.innerHTML = t("saveError") + ' <button id="retry">' + t("retry") + "</button>";
      document.getElementById("retry").onclick = showDone;
    });
  }

  // ---------- Upload any files the endpoint has not acknowledged yet ----------
  function sync() {
    var url = cfg.submit && cfg.submit.endpoint;
    if (!url || !session) return Promise.resolve();
    var files = E.sessionFiles(session), pending = {}, prefix = "subjects/" + session.id + "/";
    Object.keys(files).forEach(function (k) {
      var name = k.slice(prefix.length);
      if (session.sent[name] !== E.hash(files[k])) pending[name] = files[k];
    });
    if (!Object.keys(pending).length) return Promise.resolve();
    return fetch(url, {
      method: "POST",
      // text/plain keeps this a "simple" request (no CORS preflight; works with Google Apps Script)
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ experiment: session.experiment, subject: session.id, token: session.token, files: pending })
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (body) {
      var j = null;
      try { j = JSON.parse(body); } catch (e) { /* non-JSON 2xx counts as success */ }
      if (j && j.ok === false) throw new Error(j.error || "rejected");
      Object.keys(pending).forEach(function (n) { session.sent[n] = E.hash(pending[n]); });
      save();
    });
  }
})();
