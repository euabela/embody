/*
 * Shared helpers for emBODY web: v1-compatible file formats, local storage,
 * a tiny dependency-free ZIP writer/reader, and the painting preprocessing
 * from the original MATLAB demo (embody_demo.m).
 */
(function (global) {
  "use strict";

  // ---- Canonical v1 layout (px). Recorded coordinates live in this space so
  // the original MATLAB scripts (hard-coded to it) keep working.
  var LAYOUT = {
    width: 900,
    height: 600,
    body: { w: 175, h: 524, top: 10, left: 30, right: 695 }, // right = 900 - 30 - 175
    half: 450,       // x < 450 paints red (increase), otherwise blue (decrease)
    brush: 10,       // diameter
    alpha: 0.2
  };

  // ---- v1 CSV: mouse moves, -1 row, paint points, -1 row, mousedown, -1 row, mouseup
  function toCsv(rec) {
    var out = [];
    rec.mouse.forEach(function (p) { out.push(p[0] + "," + p[1] + "," + p[2]); });
    out.push("-1,-1,-1");
    rec.paint.forEach(function (p) { out.push(p[0] + "," + p[1] + "," + p[2]); });
    out.push("-1,-1,-1");
    rec.down.forEach(function (t) { out.push(t + ",,"); });
    out.push("-1,-1,-1");
    rec.up.forEach(function (t) { out.push(t + ",,"); });
    return out.join("\n") + "\n";
  }

  // Mirrors load_subj.m option 2: split on rows whose first value is -1.
  function parseCsv(text) {
    var sections = [[], [], [], []], s = 0;
    text.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var v = line.split(",").map(function (x) { return x === "" ? 0 : Number(x); });
      if (v[0] === -1 && s < 3) { s++; return; }
      sections[s].push(v);
    });
    return { mouse: sections[0], paint: sections[1], down: sections[2], up: sections[3] };
  }

  // ---- Preprocessing (embody_demo.m): accumulate paint points on a 600x900
  // grid, Gaussian filter (15x15, sigma 5, zero padded), then left body minus
  // right body cropped at rows 10:531, cols 33:203 / 696:866 (1-based).
  var MAP_W = 171, MAP_H = 522;
  var KERNEL = (function () {
    var k = [], sum = 0, i;
    for (i = -7; i <= 7; i++) { var g = Math.exp(-(i * i) / (2 * 25)); k.push(g); sum += g; }
    return k.map(function (g) { return g / sum; }); // separable, normalised like fspecial
  })();

  function paintToMap(points) {
    var W = LAYOUT.width, H = LAYOUT.height;
    var over = new Float64Array(W * H);
    points.forEach(function (p) {
      var x = Math.ceil(p[1] + 1), y = Math.ceil(p[2] + 1);
      x = Math.min(Math.max(x, 1), W); y = Math.min(Math.max(y, 1), H);
      over[(y - 1) * W + (x - 1)] += 1;
    });
    var tmp = new Float64Array(W * H), res = new Float64Array(W * H), x, y, j, acc;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      acc = 0;
      for (j = -7; j <= 7; j++) { var xx = x + j; if (xx >= 0 && xx < W) acc += over[y * W + xx] * KERNEL[j + 7]; }
      tmp[y * W + x] = acc;
    }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      acc = 0;
      for (j = -7; j <= 7; j++) { var yy = y + j; if (yy >= 0 && yy < H) acc += tmp[yy * W + x] * KERNEL[j + 7]; }
      res[y * W + x] = acc;
    }
    var map = new Float64Array(MAP_W * MAP_H);
    for (y = 0; y < MAP_H; y++) for (x = 0; x < MAP_W; x++) {
      map[y * MAP_W + x] = res[(y + 9) * W + (x + 32)] - res[(y + 9) * W + (x + 695)];
    }
    return map;
  }

  // MATLAB hot colormap and its blue mirror ("hotcoldmap" from the demo)
  function hot(t) {
    return [Math.min(1, t / 0.375), Math.min(1, Math.max(0, (t - 0.375) / 0.375)), Math.max(0, (t - 0.75) / 0.25)];
  }
  function hotcold(v, M) {
    if (!M) return [0, 0, 0];
    var t = Math.max(-1, Math.min(1, v / M));
    var c = hot(Math.abs(t));
    return t >= 0 ? c : [c[2], c[1], c[0]];
  }

  // ---- Storage (per browser). One key per participant session.
  var PREFIX = "embody:";
  var store = {
    key: function (exp, id) { return PREFIX + exp + ":" + id; },
    get: function (exp, id) {
      try { return JSON.parse(localStorage.getItem(this.key(exp, id)) || "null"); } catch (e) { return null; }
    },
    set: function (exp, id, s) {
      try { localStorage.setItem(this.key(exp, id), JSON.stringify(s)); return true; } catch (e) { return false; }
    },
    remove: function (exp, id) { try { localStorage.removeItem(this.key(exp, id)); } catch (e) {} },
    all: function () {
      var out = [];
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(PREFIX) === 0) {
            var s = JSON.parse(localStorage.getItem(k));
            if (s && s.id) out.push(s);
          }
        }
      } catch (e) {}
      return out;
    }
  };

  // Files for one session in the v1 subjects/<id>/ layout
  function sessionFiles(s) {
    var dir = "subjects/" + s.id + "/", files = {};
    files[dir + "presentation.txt"] = s.presentation.join("\n") + "\n";
    if (s.demographics) files[dir + "data.txt"] = s.demographics;
    files[dir + "techdata.txt"] = JSON.stringify(s.tech || {}, null, 2) + "\n";
    Object.keys(s.csv || {}).forEach(function (p) { files[dir + p + ".csv"] = s.csv[p]; });
    files[dir + "session.json"] = JSON.stringify({
      id: s.id, experiment: s.experiment, stimuli: s.stimuli, presentation: s.presentation,
      started: s.started, finished: s.finished || null
    }, null, 2) + "\n";
    return files;
  }

  // ---- Minimal ZIP (store only) writer and (store/deflate) reader
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    var c = 0xffffffff;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function hash(str) { return crc32(new TextEncoder().encode(str)).toString(16) + ":" + str.length; }

  function makeZip(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var d = new Date();
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    Object.keys(files).forEach(function (name) {
      var nameB = enc.encode(name);
      var data = typeof files[name] === "string" ? enc.encode(files[name]) : files[name];
      var crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(8, 0, true); h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, nameB.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), nameB, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dosTime, true);
      c.setUint16(14, dosDate, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true);
      c.setUint32(24, data.length, true); c.setUint16(28, nameB.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), nameB);
      offset += 30 + nameB.length + data.length;
    });
    var csize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, Object.keys(files).length, true); e.setUint16(10, Object.keys(files).length, true);
    e.setUint32(12, csize, true); e.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: "application/zip" });
  }

  // Returns Promise<{name: text}>. Handles stored and deflated entries.
  function readZip(buffer) {
    var u8 = new Uint8Array(buffer), dv = new DataView(buffer), dec = new TextDecoder();
    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject(new Error("Not a ZIP file"));
    var n = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), jobs = [];
    for (var k = 0; k < n; k++) {
      var method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true);
      var nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      var local = dv.getUint32(p + 42, true);
      var name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      var start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      var data = u8.subarray(start, start + csz);
      p += 46 + nl + el + cl;
      if (name.slice(-1) === "/") continue;
      jobs.push(inflate(method, data).then(function (name, bytes) { return [name, dec.decode(bytes)]; }.bind(null, name)));
    }
    return Promise.all(jobs).then(function (pairs) {
      var out = {};
      pairs.forEach(function (x) { out[x[0]] = x[1]; });
      return out;
    });
  }
  function inflate(method, data) {
    if (method === 0) return Promise.resolve(data);
    if (method === 8 && typeof DecompressionStream !== "undefined") {
      var ds = new DecompressionStream("deflate-raw");
      return new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer()
        .then(function (b) { return new Uint8Array(b); });
    }
    return Promise.reject(new Error("Unsupported ZIP compression (method " + method + ")"));
  }

  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function fill(text, vars) {
    return String(text == null ? "" : text).replace(/##(\w+)##/g, function (m, k) {
      return vars && k in vars ? vars[k] : m;
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Load a config script (default ./config.js, or ?config=path.js on the same site)
  function loadConfig() {
    var q = new URLSearchParams(location.search).get("config");
    if (!q) return Promise.resolve(global.EMBODY_CONFIG);
    if (/^[a-z]+:|^\/\//i.test(q) || q.indexOf("..") >= 0) {
      return Promise.reject(new Error("config must be a relative path on this site"));
    }
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = q;
      s.onload = function () { resolve(global.EMBODY_CONFIG); };
      s.onerror = function () { reject(new Error("Could not load " + q)); };
      document.head.appendChild(s);
    });
  }

  function experimentKey(cfg) {
    return new URLSearchParams(location.search).get("config") || "default";
  }

  function stimulusLabel(s) { return typeof s === "string" ? s : (s.label || s.image || ""); }

  global.Embody = {
    LAYOUT: LAYOUT, MAP_W: MAP_W, MAP_H: MAP_H,
    toCsv: toCsv, parseCsv: parseCsv, paintToMap: paintToMap, hotcold: hotcold,
    store: store, hash: hash, sessionFiles: sessionFiles, makeZip: makeZip, readZip: readZip,
    download: download, fill: fill, escapeHtml: escapeHtml, loadConfig: loadConfig,
    experimentKey: experimentKey, stimulusLabel: stimulusLabel
  };
})(window);
