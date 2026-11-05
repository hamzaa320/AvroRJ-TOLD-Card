/* ============================================================
   AVRO RJ — Load Sheet
   rjload-core.js — pure calculation core (no DOM).
   Interpolation logic mirrors the RJ100-main toolkit.
   ============================================================ */
(function () {
  "use strict";

  var Core = {};

  /* ---------------- generic helpers ---------------- */
  Core.clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  function numKeys(obj) {
    return Object.keys(obj).map(Number).sort(function (a, b) { return a - b; });
  }

  // 1-D linear interpolation over ascending keys; clamps outside range.
  Core.lerp1D = function (keys, vals, x) {
    var n = keys.length;
    if (n === 0) return null;
    if (n === 1) return vals[0];
    if (x <= keys[0]) return vals[0];
    if (x >= keys[n - 1]) return vals[n - 1];
    var i = 0;
    while (i < n - 1 && keys[i + 1] <= x) i++;
    var f = (x - keys[i]) / (keys[i + 1] - keys[i]);
    return vals[i] + f * (vals[i + 1] - vals[i]);
  };

  // Interpolate a value inside one row-object {colKey: value}.
  function lerpRow(row, x) {
    var keys = numKeys(row);
    if (keys.length === 0) return null;
    var vals = keys.map(function (k) { return row[k]; });
    return Core.lerp1D(keys, vals, x);
  }

  // Bilinear over rows (array of {colKey:val}) with shared altitudes/columns.
  Core.bilinear = function (rows, rowKeys, colKeys, rx, cx) {
    var nRows = rowKeys.length;
    if (nRows === 0 || colKeys.length === 0) return null;
    var r = Core.clamp(rx, rowKeys[0], rowKeys[nRows - 1]);
    var c = Core.clamp(cx, colKeys[0], colKeys[colKeys.length - 1]);
    function rowVal(row, x) {
      return Core.lerp1D(colKeys, colKeys.map(function (k) { return row[k]; }), x);
    }
    if (r <= rowKeys[0]) return rowVal(rows[0], c);
    if (r >= rowKeys[nRows - 1]) return rowVal(rows[nRows - 1], c);
    var j = 0;
    while (j < nRows - 1 && rowKeys[j + 1] <= r) j++;
    var fRow = (r - rowKeys[j]) / (rowKeys[j + 1] - rowKeys[j]);
    var va = rowVal(rows[j], c);
    var vb = rowVal(rows[j + 1], c);
    if (va == null || vb == null) return null;
    return va + fRow * (vb - va);
  };

  Core.round1 = function (v) { return Math.round(v * 10) / 10; };

  /* ---------------- DOM lookup ---------------- */
  // aircraft: "5A-FLE" | "5A-FLM" | "5A-FLF"
  // catering: "P" | "A" | "B" ; crew: "2/0" ... "3/3"
  Core.dom = function (aircraft, catering, crew) {
    var ac = window.AC_DOM[aircraft];
    if (!ac || !ac.dom[catering]) return null;
    var v = ac.dom[catering][crew];
    return (v == null) ? null : v;
  };

  /* ---------------- Airport lookup ---------------- */
  Core.airport = function (code) {
    if (!code) return null;
    return window.AIRPORTS[String(code).toUpperCase()] || null;
  };

  /* ---------------- Pressure altitude ---------------- */
  // Press Alt = (1013 - QNH) * 30 + Elevation
  Core.pressAlt = function (qnh, elevation) {
    if (qnh == null || elevation == null || isNaN(qnh) || isNaN(elevation)) return null;
    return Math.round((1013 - qnh) * 30 + elevation);
  };

  /* ---------------- Headwind / Tailwind component ----------------
     windFrom (deg true, the direction the wind blows FROM),
     rwy (numeric runway designator, e.g. 27), windSpeed (kt).
     Returns { value, sign } where +value = headwind, -value = tailwind.
  ---------------------------------------------------------------- */
  Core.windComponent = function (windFrom, rwy, windSpeed) {
    if (windFrom == null || windSpeed == null || isNaN(windFrom) || isNaN(windSpeed)) return null;
    // Runway magnetic heading ~ designator*10 (true wind assumed => treat as heading).
    var rwyHdg = (Number(rwy) % 36) * 10;
    var diff = ((windFrom - rwyHdg) + 540) % 360 - 180; // -180..180
    var rad = diff * Math.PI / 180;
    return Math.round(Math.cos(rad) * windSpeed); // + head, - tail
  };

  /* ---------------- ATOM: ETOM kg -> tonnes (round half-up at 500 kg) --- */
  Core.atomTonnes = function (etomKg) {
    if (etomKg == null || isNaN(etomKg)) return null;
    return Math.round(etomKg / 1000);
  };

  /* ---------------- N1 REF / T REDU / N1 REDU ---------------- */
  Core.n1Ref = function (pressAlt, oat, antiIce) {
    var T = window.RJ.N1_REF;
    var sec = antiIce ? T.ENG_ANT_ICE_ON : T.ENG_ANT_ICE_OFF;
    var alts = T.ALTS, oats = T.OATS;
    return {
      n1ref: Core.bilinear(sec.N1REF, alts, oats, pressAlt, oat),
      tredu: Core.bilinear(sec.TREDU, alts, oats, pressAlt, oat),
      n1redu: Core.bilinear(sec.N1REDU, alts, oats, pressAlt, oat)
    };
  };

  /* ---------------- N1 CLIMB (norm / max) ----------------
     config index 0..2 ; alt ft ; oat °C
  ---------------------------------------------------------- */
  Core.n1Climb = function (cfgIdx, alt, oat, wantMax) {
    var C = window.RJ.CLIMB;
    var table = wantMax ? C.max : C.norm;
    var sub = table[cfgIdx] || table[0];
    var rows = C.alts.map(function (a) { return sub[String(a)]; }).map(function (arr, i) {
      var o = {};
      C.cols.forEach(function (c, j) { o[c] = arr[j]; });
      return o;
    });
    return Core.bilinear(rows, C.alts, C.cols, alt, oat);
  };

  /* ---------------- N1 MCT ----------------
     config index 0..3 ; alt ; oat
  ---------------------------------------------------------- */
  Core.n1Mct = function (cfgIdx, alt, oat) {
    var sub = window.RJ.MCT[cfgIdx] || window.RJ.MCT[0];
    var alts = numKeys(sub);
    if (alts.length === 0) return null;
    if (alt <= alts[0]) return lerpRow(sub[String(alts[0])], oat);
    if (alt >= alts[alts.length - 1]) return lerpRow(sub[String(alts[alts.length - 1])], oat);
    var i = 0;
    while (i < alts.length - 1 && alts[i + 1] <= alt) i++;
    var f = (alt - alts[i]) / (alts[i + 1] - alts[i]);
    var va = lerpRow(sub[String(alts[i])], oat);
    var vb = lerpRow(sub[String(alts[i + 1])], oat);
    if (va == null || vb == null) return null;
    return va + f * (vb - va);
  };

  /* ---------------- SPEEDS ----------------
     weightKg, flap (18/24/30/33)
     Returns { VR, V2, V1, VFTO, VER }  (V1 = round(VR) - 4)
  ---------------------------------------------------------- */
  Core.takeoffSpeeds = function (weightKg, flap) {
    var S = window.RJ.SPEEDS;
    var w = Core.clamp(weightKg, 27000, 46000);
    var vr = [], v2 = [];
    var weights = S.takeoff.map(function (r) { return r.weight; });
    // VR and V2 are tabulated per flap; build per-flap columns.
    function pick(field) {
      var vals = S.takeoff.map(function (r) {
        var cellv = r[String(flap)];
        return cellv ? cellv[field] : null;
      });
      return vals;
    }
    var vrArr = pick("VR"), v2Arr = pick("V2");
    var VR = Core.lerp1D(weights, vrArr, w);
    var V2 = Core.lerp1D(weights, v2Arr, w);
    var VFTO = Core.lerp1D(S.other.map(function (r) { return r.weight; }),
                          S.other.map(function (r) { return r.VFTO; }), w);
    var VER = Core.lerp1D(S.other.map(function (r) { return r.weight; }),
                          S.other.map(function (r) { return r.VER; }), w);
    var VRr = Math.round(VR);
    return {
      VR: VRr,
      V2: Math.round(V2),
      V1: VRr - 4,
      VFTO: Math.round(VFTO),
      VER: Math.round(VER)
    };
  };

  /* ---------------- Landing speeds ----------------
     weightKg, flap (0/18/24/30/33). Returns VREF (kt).
  ---------------------------------------------------------- */
  Core.landingSpeeds = function (weightKg, flap) {
    var S = window.RJ.SPEEDS;
    var w = Core.clamp(weightKg, 27000, 46000);
    var weights = S.landing.map(function (r) { return r.weight; });
    var vrefArr = S.landing.map(function (r) {
      var v = r[String(flap)];
      return (v == null) ? null : v;
    });
    // Fill any null (flap not tabulated for that weight) by nearest — here all flaps exist.
    var VREF = Core.lerp1D(weights, vrefArr, w);
    return { VREF: Math.round(VREF) };
  };

  window.Core = Core;
})();
