/* emBODY web — researcher page: local session export + heatmap viewer */
(function () {
  "use strict";
  var E = window.Embody, cfg, expKey;
  var subjects = {}; // id -> { files: {name: text} }
  var maps = null;   // { labels: [], perSubject: {id: [Float64Array|null]} }

  var base = new Image(), mask = new Image();
  base.src = "assets/base.png";
  mask.src = "assets/mask.png";
  var maskAlpha = null;

  E.loadConfig().then(function (c) {
    cfg = c || { stimuli: [] };
    expKey = E.experimentKey(cfg);
    document.getElementById("exp").textContent = expKey;
    renderSessions();
  });

  function localSessions() {
    return E.store.all().filter(function (s) { return s.experiment === expKey; })
      .sort(function (a, b) { return a.started < b.started ? -1 : 1; });
  }

  function renderSessions() {
    var list = localSessions(), tb = document.getElementById("sessions");
    if (!list.length) { tb.innerHTML = '<tr><td class="muted">No sessions yet.</td></tr>'; return; }
    tb.innerHTML = "<tr><th>ID</th><th>Started</th><th>Progress</th><th>Uploaded</th><th></th></tr>" +
      list.map(function (s) {
        return "<tr><td>" + E.escapeHtml(s.id) + "</td><td>" + new Date(s.started).toLocaleString() + "</td><td>" +
          s.done + " / " + s.presentation.length + (s.finished ? " ✓" : "") + "</td><td>" +
          Object.keys(s.sent || {}).length + " files</td>" +
          '<td><button data-dl="' + E.escapeHtml(s.id) + '">ZIP</button> <button class="danger" data-rm="' +
          E.escapeHtml(s.id) + '">Delete</button></td></tr>';
      }).join("");
    tb.querySelectorAll("[data-dl]").forEach(function (b) {
      b.onclick = function () {
        var s = E.store.get(expKey, b.dataset.dl);
        E.download(E.makeZip(E.sessionFiles(s)), "embody_" + s.id + ".zip");
      };
    });
    tb.querySelectorAll("[data-rm]").forEach(function (b) {
      b.onclick = function () {
        if (confirm("Delete participant " + b.dataset.rm + " from this browser? This cannot be undone.")) {
          E.store.remove(expKey, b.dataset.rm);
          renderSessions();
        }
      };
    });
  }

  document.getElementById("export").onclick = function () {
    var files = {};
    localSessions().forEach(function (s) { Object.assign(files, E.sessionFiles(s)); });
    if (!Object.keys(files).length) return alert("No sessions stored in this browser.");
    E.download(E.makeZip(files), "embody_" + expKey.replace(/\W+/g, "_") + "_" + new Date().toISOString().slice(0, 10) + ".zip");
  };
  document.getElementById("clear").onclick = function () {
    var list = localSessions();
    if (!list.length) return;
    if (prompt("Type DELETE to remove " + list.length + " session(s) from this browser. Export them first!") === "DELETE") {
      list.forEach(function (s) { E.store.remove(expKey, s.id); });
      renderSessions();
    }
  };
  document.getElementById("viewLocal").onclick = function () {
    subjects = {};
    localSessions().forEach(function (s) { addFiles(E.sessionFiles(s)); });
    build();
  };

  // ---- loading files ----
  function addFiles(files) {
    Object.keys(files).forEach(function (path) {
      var parts = path.split(/[\\/]/).filter(Boolean);
      if (parts.length < 2) return;
      var id = parts[parts.length - 2], name = parts[parts.length - 1];
      if (!/\.(csv|txt|json)$/.test(name)) return;
      (subjects[id] = subjects[id] || { files: {} }).files[name] = files[path];
    });
  }
  function readAll(fileList) {
    subjects = {};
    var jobs = Array.prototype.map.call(fileList, function (f) {
      var path = f.webkitRelativePath || f.name;
      if (/\.zip$/i.test(f.name)) return f.arrayBuffer().then(E.readZip).then(addFiles);
      return f.text().then(function (txt) {
        var o = {};
        // single CSVs without a folder: group under a pseudo-subject
        o[path.indexOf("/") >= 0 ? path : "loose/" + path] = txt;
        addFiles(o);
      });
    });
    Promise.all(jobs).then(build, function (e) { alert(e.message); });
  }
  document.getElementById("files").onchange = function () { readAll(this.files); };
  document.getElementById("folder").onchange = function () { readAll(this.files); };
  document.getElementById("mode").onchange = draw;

  function build() {
    var labels = (cfg.stimuli || []).map(E.stimulusLabel), per = {}, ids = Object.keys(subjects).sort();
    ids.forEach(function (id) {
      var f = subjects[id].files, arr = [];
      if (f["session.json"]) {
        try { var meta = JSON.parse(f["session.json"]); if (meta.stimuli && meta.stimuli.length >= labels.length) labels = meta.stimuli; } catch (e) {}
      }
      Object.keys(f).forEach(function (name) {
        var m = /^(\d+)\.csv$/.exec(name);
        if (m) arr[+m[1]] = E.paintToMap(E.parseCsv(f[name]).paint);
      });
      if (arr.length) per[id] = arr;
    });
    var n = Object.keys(per).reduce(function (a, id) { return Math.max(a, per[id].length); }, 0);
    for (var i = labels.length; i < n; i++) labels[i] = "Stimulus " + i;
    maps = { labels: labels.slice(0, Math.max(n, 0)), perSubject: per };
    var sel = document.getElementById("mode");
    sel.innerHTML = '<option value="mean">group mean (' + Object.keys(per).length + " subjects)</option>" +
      Object.keys(per).map(function (id) { return '<option value="' + E.escapeHtml(id) + '">subject ' + E.escapeHtml(id) + "</option>"; }).join("");
    document.getElementById("info").textContent = Object.keys(per).length
      ? "Loaded " + Object.keys(per).length + " subject(s), " + n + " stimuli."
      : "No emBODY CSV files found.";
    draw();
  }

  function currentMaps() {
    var mode = document.getElementById("mode").value, per = maps.perSubject;
    if (mode !== "mean") return per[mode] || [];
    return maps.labels.map(function (_, k) {
      var sum = null, cnt = 0;
      Object.keys(per).forEach(function (id) {
        var m = per[id][k];
        if (!m) return;
        if (!sum) sum = new Float64Array(m.length);
        for (var i = 0; i < m.length; i++) sum[i] += m[i];
        cnt++;
      });
      if (sum) for (var i = 0; i < sum.length; i++) sum[i] /= cnt;
      return sum;
    });
  }

  function getMaskAlpha() {
    if (maskAlpha) return maskAlpha;
    var c = document.createElement("canvas");
    c.width = E.MAP_W; c.height = E.MAP_H;
    var ctx = c.getContext("2d");
    ctx.drawImage(mask, 0, 0, E.MAP_W, E.MAP_H);
    var d = ctx.getImageData(0, 0, E.MAP_W, E.MAP_H).data;
    maskAlpha = new Float32Array(E.MAP_W * E.MAP_H);
    for (var i = 0; i < maskAlpha.length; i++) maskAlpha[i] = d[i * 4] / 255;
    return maskAlpha;
  }

  function draw() {
    if (!maps) return;
    if (!base.complete || !mask.complete) { base.onload = mask.onload = draw; return; }
    var list = currentMaps(), M = 0, grid = document.getElementById("maps");
    list.forEach(function (m) { if (m) for (var i = 0; i < m.length; i++) M = Math.max(M, Math.abs(m[i])); });
    var alpha = getMaskAlpha();
    grid.innerHTML = "";
    list.forEach(function (m, k) {
      var fig = document.createElement("figure"), c = document.createElement("canvas");
      c.width = E.MAP_W; c.height = E.MAP_H;
      var ctx = c.getContext("2d");
      ctx.drawImage(base, 32, 9, E.MAP_W, E.MAP_H, 0, 0, E.MAP_W, E.MAP_H); // base(10:531,33:203)
      if (m) {
        var img = ctx.getImageData(0, 0, E.MAP_W, E.MAP_H), d = img.data;
        for (var i = 0; i < m.length; i++) {
          var a = alpha[i];
          if (!a) continue;
          var col = E.hotcold(m[i], M);
          d[i * 4] = d[i * 4] * (1 - a) + col[0] * 255 * a;
          d[i * 4 + 1] = d[i * 4 + 1] * (1 - a) + col[1] * 255 * a;
          d[i * 4 + 2] = d[i * 4 + 2] * (1 - a) + col[2] * 255 * a;
        }
        ctx.putImageData(img, 0, 0);
      }
      fig.appendChild(c);
      var cap = document.createElement("figcaption");
      cap.textContent = maps.labels[k] + (m ? "" : " (no data)");
      fig.appendChild(cap);
      grid.appendChild(fig);
    });
    // colour bar
    var cb = document.querySelector(".colorbar"), cctx = cb.getContext("2d");
    for (var x = 0; x < 256; x++) {
      var col = E.hotcold((x / 255) * 2 - 1, 1);
      cctx.fillStyle = "rgb(" + col.map(function (v) { return Math.round(v * 255); }).join(",") + ")";
      cctx.fillRect(x, 0, 1, 1);
    }
    document.getElementById("cmin").textContent = (-M).toPrecision(2);
    document.getElementById("cmax").textContent = M.toPrecision(2);
    document.getElementById("cbar").hidden = false;
    document.getElementById("png").disabled = !list.length;
  }

  document.getElementById("png").onclick = function () {
    var figs = document.querySelectorAll("#maps figure"), cols = 7, w = E.MAP_W, h = E.MAP_H + 24;
    var out = document.createElement("canvas");
    out.width = cols * w; out.height = Math.ceil(figs.length / cols) * h;
    var ctx = out.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, out.width, out.height);
    ctx.fillStyle = "#000"; ctx.font = "13px sans-serif"; ctx.textAlign = "center";
    figs.forEach(function (f, i) {
      var x = (i % cols) * w, y = Math.floor(i / cols) * h;
      ctx.drawImage(f.querySelector("canvas"), x, y);
      ctx.fillText(f.querySelector("figcaption").textContent, x + w / 2, y + E.MAP_H + 16, w - 4);
    });
    out.toBlob(function (b) { E.download(b, "embody_maps.png"); });
  };
})();
