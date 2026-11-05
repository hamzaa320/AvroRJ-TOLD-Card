/* ============================================================
   AVRO RJ — Load Sheet
   rjload-app.js — UI wiring: fields, keypad, EPL modal, autocalc.
   ============================================================ */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- tiny structured logger (console) ---------- */
  var Log = (function () {
    function fmt(level, msg) { return "[RJLoad " + level + "] " + msg; }
    return {
      info:  function (m) { console.log(fmt("INFO", m)); },
      warn:  function (m) { console.warn(fmt("WARN", m)); },
      error: function (m) { console.error(fmt("ERROR", m)); }
    };
  })();

  function safe(fn, label) {
    try { fn(); } catch (e) { Log.error(label + ": " + ((e && e.message) ? e.message : String(e))); }
  }
  var state = {
    aircraft: "5A-FLE",
    epl: 0,
    els: {}
  };

  /* ---------------- formatting ---------------- */
  function n0(v) { return (v == null || isNaN(v)) ? "—" : Math.round(v).toLocaleString("en-US"); }
  function n1f(v) { return (v == null || isNaN(v)) ? "—" : (Math.round(v * 10) / 10).toString(); }
  function setOut(el, v, suffix, keepUnit) {
    if (!el) return;
    if (keepUnit) { el.innerHTML = v + (suffix ? ' <span class="unit">' + suffix + "</span>" : ""); }
    else { el.textContent = v; }
  }

  /* ============================================================
     Aircraft switch
     ============================================================ */
  function fillAircraft() {
    var sel = $("ac-select");
    sel.innerHTML = "";
    Object.keys(window.AC_DOM).forEach(function (k) {
      var o = document.createElement("option");
      o.value = k; o.textContent = k;
      sel.appendChild(o);
    });
    sel.value = state.aircraft;
  }
  function applyAircraft() {
    try {
      var ac = window.AC_DOM[state.aircraft];
      $("ac-title").textContent = "AVRO RJ — " + state.aircraft;
      $("ac-sub").textContent = ac ? ac.label : "Load Sheet";
      $("to-ac").textContent = state.aircraft;
      $("ld-ac").textContent = state.aircraft;
      updateDom();
    
    } catch (e) {
      Log.error("applyAircraft: " + (e && e.message ? e.message : e));
    }
  }

  /* ============================================================
     Static option lists
     ============================================================ */
  function buildOptions() {
    // Catering
    var cat = $("f-catering");
    cat.innerHTML = "";
    window.CATERING_CODES.forEach(function (c) {
      var o = document.createElement("option"); o.value = c; o.textContent = c; cat.appendChild(o);
    });

    // Crew
    var crew = $("f-crew");
    crew.innerHTML = "";
    window.CREW_CODES.forEach(function (c) {
      var o = document.createElement("option"); o.value = c; o.textContent = c; crew.appendChild(o);
    });

    // ATIS ident A..Z plus "/"
    var atis = $("f-atis");
    atis.innerHTML = "";
    ["/"].concat("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")).forEach(function (c) {
      var o = document.createElement("option"); o.value = c; o.textContent = c; atis.appendChild(o);
    });

    // RVR / VIS 10..1
    ["f-rvr", "ld-rvr"].forEach(function (id) {
      var s = $(id); s.innerHTML = "";
      var o0 = document.createElement("option"); o0.value = ""; o0.textContent = "—"; s.appendChild(o0);
      for (var i = 10; i >= 1; i--) {
        var o = document.createElement("option"); o.value = i; o.textContent = i; s.appendChild(o);
      }
    });

    // ELM 27..46 (shown in tonnes like ATOM)
    var elm = $("ld-elm"); elm.innerHTML = "";
    for (var w = 27; w <= 46; w++) {
      var o = document.createElement("option"); o.value = w; o.textContent = w + " T"; elm.appendChild(o);
    }
    elm.value = "33";
  }

  /* ============================================================
     DOM value
     ============================================================ */
  function updateDom() {
    try {
      var catering = $("f-catering").value;
      var crew = $("f-crew").value;
      var v = Core.dom(state.aircraft, catering, crew);
      setOut($("f-dom"), v == null ? "—" : v.toLocaleString("en-US"), "kg", true);
      $("f-dom-src").textContent = catering + " / " + crew;
      recomputeMass();
    
    } catch (e) {
      Log.error("updateDom: " + (e && e.message ? e.message : e));
    }
  }

  /* ============================================================
     Mass chain: EZFM = DOM + EPL ; ETOM = EZFM + T/O FUEL
     ============================================================ */
  function getDom() {
    var catering = $("f-catering").value;
    var crew = $("f-crew").value;
    return Core.dom(state.aircraft, catering, crew);
  }
  function getToFuel() { var v = parseFloat($("f-tofuel").value); return isNaN(v) ? null : v; }

  function recomputeMass() {
    try {
      var dom = getDom();
      var epl = state.epl;
      var ezfm = (dom == null) ? null : dom + epl;
      setOut($("f-ezfm"), ezfm == null ? "—" : n0(ezfm), "kg", true);
  
      var fuel = getToFuel();
      var etom = (ezfm == null || fuel == null) ? null : ezfm + fuel;
      setOut($("f-etom"), etom == null ? "—" : n0(etom), "kg", true);
      $("tc-etom").innerHTML = etom == null ? "—" :
        n0(etom) + ' <span class="unit">kg</span>';
  
      // ATOM (tonnes)
      var atom = Core.atomTonnes(etom);
      setOut($("to-atom"), atom == null ? "—" : atom, "T", true);
  
      // Times/flight sync
      var flt = $("to-flight").value;
      $("ld-flight").textContent = "TLR " + (flt === "" ? "—" : flt);
  
      // dependent lookups
      computeWindComponent();
      computeN1();
      computeTakeoffSpeeds(atom);
      computeClimbMct();
      computeLanding();
      return etom;
    
    } catch (e) {
      Log.error("recomputeMass: " + (e && e.message ? e.message : e));
    }
  }

  /* ============================================================
     Wind component
     ============================================================ */
  function computeWindComponent() {
    try {
      var dir = parseFloat($("f-wdir").value);
      var spd = parseFloat($("f-wspd").value);
      var rwy = $("f-rwy").value;
      if (!rwy || isNaN(dir) || isNaN(spd)) { $("f-wcomp").innerHTML = '— <span class="unit">kt</span>'; return; }
      var rwyNum = parseInt(rwy.replace(/[^0-9]/g, ""), 10);
      var comp = Core.windComponent(dir, rwyNum, spd);
      if (comp == null) { $("f-wcomp").innerHTML = '— <span class="unit">kt</span>'; return; }
      var lbl = comp >= 0 ? comp + " kt H" : Math.abs(comp) + " kt T";
      $("f-wcomp").innerHTML = lbl;
      $("f-wcomp").style.color = comp < 0 ? "var(--warn)" : "";
    
    } catch (e) {
      Log.error("computeWindComponent: " + (e && e.message ? e.message : e));
    }
  }

  /* ============================================================
     Airport -> elevation + runway list
     ============================================================ */
  function applyAirport(code, elevOutEl, rwySelEl, elevElIdForLanding) {
    try {
      var ap = Core.airport(code);
      if (!ap) {
        if (elevOutEl) elevOutEl.innerHTML = '— <span class="unit">ft</span>';
        if (rwySelEl) { rwySelEl.innerHTML = ""; }
        return null;
      }
      if (elevOutEl) elevOutEl.innerHTML = ap.el + ' <span class="unit">ft</span>';
      if (rwySelEl) {
        rwySelEl.innerHTML = "";
        ap.rwy.forEach(function (r) {
          var o = document.createElement("option"); o.value = r; o.textContent = r; rwySelEl.appendChild(o);
        });
      }
      return ap;
    
    } catch (e) {
      Log.error("applyAirport: " + (e && e.message ? e.message : e));
    }
  }

  /* ============================================================
     Pressure altitude
     ============================================================ */
  function computePressAlt() {
    try {
      var qnh = parseFloat($("f-qnh").value);
      var ap = Core.airport($("f-airport").value);
      var el = ap ? ap.el : null;
      var pa = Core.pressAlt(qnh, el);
      $("f-palt").innerHTML = pa == null ? '— <span class="unit">ft</span>' : pa + ' <span class="unit">ft</span>';
      return pa;
    
    } catch (e) {
      Log.error("computePressAlt: " + (e && e.message ? e.message : e));
    }
  }

  /* ============================================================
     N1 REF / T REDU / N1 REDU
     ============================================================ */
  function computeN1() {
    try {
      var pa = computePressAlt();
      var oat = parseFloat($("f-oat").value);
      var ai = $("n1-aion").checked;
      if (pa == null || isNaN(oat)) {
        $("n1-ref").innerHTML = '— <span class="unit">%</span>';
        $("n1-tredu").innerHTML = '— <span class="unit">°C</span>';
        $("n1-n1redu").innerHTML = '— <span class="unit">%</span>';
        $("to-n1ref").innerHTML = '— <span class="unit">%</span>';
        $("to-n1redu").innerHTML = '— <span class="unit">%</span>';
        return;
      }
      var r = Core.n1Ref(pa, oat, ai);
      $("n1-ref").innerHTML = n1f(r.n1ref) + ' <span class="unit">%</span>';
      $("n1-tredu").innerHTML = n1f(r.tredu) + ' <span class="unit">°C</span>';
      $("n1-n1redu").innerHTML = n1f(r.n1redu) + ' <span class="unit">%</span>';
      $("to-n1ref").innerHTML = n1f(r.n1ref) + ' <span class="unit">%</span>';
      $("to-n1redu").innerHTML = n1f(r.n1redu) + ' <span class="unit">%</span>';
    
    } catch (e) {
      Log.error("computeN1: " + (e && e.message ? e.message : e));
    }
  }

  /* ============================================================
     Take-off speeds from ATOM
     ============================================================ */
  function computeTakeoffSpeeds(atomT) {
    try {
      var flap = parseInt($("f-flap").value, 10);
      $("to-flap").textContent = flap;
      $("to-bleeds").textContent = $("f-bleeds").checked ? "ON" : "OFF";
      $("to-antiice").textContent = $("f-antiice").checked ? "ON" : "OFF";
      $("to-atis").textContent = $("f-atis").value;
      $("to-qnh").textContent = $("f-qnh").value || "—";
      $("to-rwy").textContent = $("f-rwy").value ? ($("f-rwy").value + " " + $("f-rwy-cond").value) : "—";
  
      if (atomT == null) {
        ["to-v1", "to-vr", "to-v2", "to-vfto"].forEach(function (id) {
          $(id).innerHTML = '— <span class="unit">kt</span>';
        });
        return;
      }
      var w = atomT * 1000;
      var s = Core.takeoffSpeeds(w, flap);
      $("to-v1").innerHTML = s.V1 + ' <span class="unit">kt</span>';
      $("to-vr").innerHTML = s.VR + ' <span class="unit">kt</span>';
      $("to-v2").innerHTML = s.V2 + ' <span class="unit">kt</span>';
      $("to-vfto").innerHTML = s.VFTO + ' <span class="unit">kt</span>';
    
    } catch (e) {
      Log.error("computeTakeoffSpeeds: " + (e && e.message ? e.message : e));
    }
  }

  /* ============================================================
     N1 CLIMB / N1 MCT (take-off data)
     config chosen from bleed / anti-ice state:
       climb cfg: 0 = AC ON / AI OFF, 1 = AC ON / AI ON, 2 = recirc
       mct  cfg : 0 = AC OFF/AI OFF, 1 = AC OFF/AI ON,
                  2 = AC ON/AI OFF, 3 = AC ON/AI ON
     We map bleed checkbox -> AC on/off, anti-ice -> AI.
     ============================================================ */
  function computeClimbMct() {
    try {
      var pa = computePressAlt();
      var oat = parseFloat($("f-oat").value);
      if (pa == null || isNaN(oat)) {
        $("to-n1climb").innerHTML = '— <span class="unit">%</span>';
        $("to-n1mct").innerHTML = '— <span class="unit">%</span>';
        return;
      }
      var bleedOn = $("f-bleeds").checked;
      var aiOn = $("f-antiice").checked;
  
      // climb cfg: AC ON when bleed >=1. index 0/1/2
      var climbCfg = aiOn ? 1 : 0; // (index 2 = recirc, not selectable here)
      var climbVal = Core.n1Climb(climbCfg, pa, oat, false);
      $("to-n1climb").innerHTML = n1f(climbVal) + ' <span class="unit">%</span>';
  
      // MCT cfg
      var mctCfg;
      if (bleedOn && aiOn) mctCfg = 3;
      else if (bleedOn && !aiOn) mctCfg = 2;
      else if (!bleedOn && aiOn) mctCfg = 1;
      else mctCfg = 0;
      var mctVal = Core.n1Mct(mctCfg, pa, oat);
      $("to-n1mct").innerHTML = n1f(mctVal) + ' <span class="unit">%</span>';
    
    } catch (e) {
      Log.error("computeClimbMct: " + (e && e.message ? e.message : e));
    }
  }

  /* ============================================================
     Landing data
     ============================================================ */
  function computeLanding() {
    try {
      var flap = parseInt($("ld-flap").value, 10);
      var elm = parseInt($("ld-elm").value, 10);
      $("ld-atis").textContent = $("f-atis").value;
      $("ld-flight").textContent = "TLR " + $("to-flight").value;
  
      // Landing airport elevation (shown per the PA = airport elevation rule)
      var ap = Core.airport($("ld-airport").value);
      setOut($("ld-elev"), ap ? ap.el : "—", "ft", true);
  
      // VREF / VFTO from ELM (tonnes -> kg)
      var w = elm * 1000;
      var ls = Core.landingSpeeds(w, flap);
      $("ld-vref").innerHTML = ls.VREF + ' <span class="unit">kt</span>';
      var os = Core.takeoffSpeeds(w, flap);
      $("ld-vfto").innerHTML = os.VFTO + ' <span class="unit">kt</span>';
  
      // N1 GA = N1 REF from the RJ100 tables, using landing OAT and
      // pressure altitude equal to the landing airport elevation.
      var oat = parseFloat($("ld-oat").value);
      if (ap && !isNaN(oat)) {
        var val = Core.n1Ref(ap.el, oat, $("ld-antiice").checked).n1ref;
        $("ld-n1ga").innerHTML = n1f(val) + ' <span class="unit">%</span>';
        $("ld-n1ga").title = "Landing airport elevation " + ap.el + " ft used as pressure altitude";
      } else {
        $("ld-n1ga").innerHTML = '— <span class="unit">%</span>';
        $("ld-n1ga").title = "";
      }
    
    } catch (e) {
      Log.error("computeLanding: " + (e && e.message ? e.message : e));
    }
  }

  /* ============================================================
     Numeric keypad
     ============================================================ */
  var kpTarget = null;
  function openKeypad(input) {
    kpTarget = input;
    $("kp-title").textContent = input.dataset.title || "Input";
    $("kp-unit").textContent = input.dataset.unit || "";
    $("kp-val").textContent = input.value || "0";
    // decimal allowed only for EL TRIM-ish fields
    var allowDot = input.dataset.dot === "1";
    var keys = $("kp-keys");
    keys.innerHTML = "";
    var layout = ["7", "8", "9", "del", "4", "5", "6", allowDot ? "." : "c", "1", "2", "3", "-", "0", "00"];
    layout.forEach(function (k) {
      var b = document.createElement("button");
      if (k === "del") { b.className = "del fn"; b.textContent = "⌫"; }
      else if (k === "c") { b.className = "fn"; b.textContent = "C"; }
      else { b.textContent = k; }
      b.addEventListener("click", function () { kpPress(k, allowDot); });
      keys.appendChild(b);
    });
    var ent = document.createElement("button");
    ent.className = "enter"; ent.textContent = "Enter";
    ent.addEventListener("click", closeKeypad);
    keys.appendChild(ent);
    $("kp-overlay").classList.add("open");
  }
  function kpPress(k, allowDot) {
    var cur = $("kp-val").textContent;
    if (cur === "0" && k !== "." && k !== "-") cur = "";
    if (k === "del") cur = cur.slice(0, -1) || "0";
    else if (k === "c") cur = "0";
    else if (k === "." && !allowDot) return;
    else if (k === "." && cur.indexOf(".") >= 0) return;
    else cur += k;
    $("kp-val").textContent = cur;
  }
  function closeKeypad() {
    if (kpTarget) {
      var v = $("kp-val").textContent;
      if (v === "0" && !kpTarget.value) v = "";
      kpTarget.value = v;
      kpTarget.dispatchEvent(new Event("input", { bubbles: true }));
      kpTarget.dispatchEvent(new Event("change", { bubbles: true }));
    }
    $("kp-overlay").classList.remove("open");
  }

  /* ============================================================
     EPL modal
     ============================================================ */
  function eplCompute() {
    var a = parseFloat($("epl-adults").value) || 0;
    var c = parseFloat($("epl-child").value) || 0;
    var i = parseFloat($("epl-infant").value) || 0;
    var cargo = parseFloat($("epl-cargo").value) || 0;
    var fak = parseFloat($("epl-fak").value) || 0;
    var oa = a * 84, oc = c * 46, oi = i * 15;
    $("epl-adults-o").textContent = oa;
    $("epl-child-o").textContent = oc;
    $("epl-infant-o").textContent = oi;
    $("epl-cargo-o").textContent = cargo;
    $("epl-fak-o").textContent = fak;
    var total = oa + oc + oi + cargo + fak;
    $("epl-total").textContent = total.toLocaleString("en-US");
    return total;
  }
  function openEpl() {
    $("epl-overlay").classList.add("open");
    ["epl-adults", "epl-child", "epl-infant", "epl-cargo", "epl-fak"].forEach(function (id) {
      var el = $(id);
      el.onfocus = function () { openKeypad(this); this.blur(); };
      el.onclick = function () { openKeypad(this); };
    });
    eplCompute();
  }
  function closeEpl() { $("epl-overlay").classList.remove("open"); }

  /* ============================================================
     Cloud (Google Drive) settings modal
     ============================================================ */
  function openCloud() {
    var c = window.RJDrive ? window.RJDrive.readCfg() : { url: "", token: "" };
    $("cloud-hook").value = c.url || "";
    $("cloud-token").value = c.token || "";
    $("cloud-status").textContent = window.RJDrive && window.RJDrive.isConfigured()
      ? "الحالة: مهيّأ — كل ملف PDF يُرفع إلى مجلد Drive المشترك." : "الحالة: غير مهيّأ (يُحفظ محلياً + طابور رفع).";
    $("cloud-overlay").classList.add("open");
  }
  function closeCloud() { $("cloud-overlay").classList.remove("open"); }

  function wireCloud() {
    $("cloud-close").addEventListener("click", closeCloud);
    $("cloud-save").addEventListener("click", function () {
      if (!window.RJDrive) { Log.error("rjload-drive.js not loaded"); return; }
      window.RJDrive.saveCfg($("cloud-hook").value, $("cloud-token").value);
      $("cloud-status").textContent = "تم الحفظ محلياً. الحالة: " +
        (window.RJDrive.isConfigured() ? "مهيّأ" : "غير مهيّأ (الرابط مطلوب)");
      Log.info("Google Drive hook saved");
      closeCloud();
    });
    $("cloud-test").addEventListener("click", function () {
      if (!window.RJDrive) { Log.error("rjload-drive.js not loaded"); return; }
      window.RJDrive.saveCfg($("cloud-hook").value, $("cloud-token").value);
      $("cloud-status").textContent = "جارٍ الاتصال بـ Web App…";
      window.RJDrive.testConnection()
        .then(function (r) { $("cloud-status").textContent = (r.ok ? "✓ " : "✗ ") + r.message; });
    });
  }

  /* ============================================================
     Wire everything
     ============================================================ */
  function wire() {
    // Aircraft
    $("ac-select").addEventListener("change", function () {
      state.aircraft = this.value; applyAircraft();
    });
    // Menu
    var menu = $("menu");
    $("menu-btn").addEventListener("click", function (e) {
      e.stopPropagation(); menu.classList.toggle("open");
    });
    document.addEventListener("click", function () { menu.classList.remove("open"); });
    menu.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var act = b.dataset.act;
      if (act === "epl") { openEpl(); }
      else if (act === "savepdf") {
        if (window.RJSavePDF) { window.RJSavePDF(); }
        else { Log.error("menu savepdf: rjload-pdf.js not loaded"); }
      }
      else if (act === "clear") { clearSheet(); }
      else if (act === "copy") { copySummary(); }
      menu.classList.remove("open");
    });

    // Hidden gesture: press and hold the logo for ~2.5s to open Cloud settings.
    // Not visible anywhere in the normal UI (for the owner to configure once).
    var logo = document.querySelector(".logo");
    var holdTimer = null;
    function startHold() {
      if (holdTimer) return;
      holdTimer = setTimeout(function () {
        holdTimer = null;
        Log.info("Hidden gesture (logo long-press): opening Cloud settings");
        openCloud();
      }, 2500);
    }
    function cancelHold() {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    }
    if (logo) {
      logo.addEventListener("pointerdown", startHold);
      logo.addEventListener("pointerup", cancelHold);
      logo.addEventListener("pointercancel", cancelHold);
      logo.addEventListener("pointerleave", cancelHold);
      logo.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    }

    // Header theme toggle switch
    var themeBtn = $("theme-toggle");
    function syncThemeUi() {
      var cur = document.documentElement.getAttribute("data-theme") || "dark";
      themeBtn.setAttribute("aria-checked", cur === "light" ? "true" : "false");
    }
    themeBtn.addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme") || "dark";
      document.documentElement.setAttribute("data-theme", cur === "dark" ? "light" : "dark");
      syncThemeUi();
    });
    syncThemeUi();

    // Tabs
    function syncActionBar(viewName) {
      var onTold2 = (viewName === "told2");
      // View 1 (Performance Data): Clear.  View 2 (T/O & LDG Data): Save PDF.
      $("btn-clear").classList.toggle("hidden", onTold2);
      $("btn-savepdf").classList.toggle("hidden", !onTold2);
      // Menu mirrors the active view: Save PDF only on view 2, Clear only on view 1.
      var mSave = document.querySelector('.menu button[data-act="savepdf"]');
      var mClear = document.querySelector('.menu button[data-act="clear"]');
      if (mSave) mSave.classList.toggle("hidden", !onTold2);
      if (mClear) mClear.classList.toggle("hidden", onTold2);
    }
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
      t.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
        document.querySelectorAll(".view").forEach(function (x) { x.classList.remove("active"); });
        t.classList.add("active");
        $("view-" + t.dataset.view).classList.add("active");
        syncActionBar(t.dataset.view);
      });
    });
    syncActionBar("told1");

    // Numeric keypad bindings
    Array.prototype.forEach.call(document.querySelectorAll(".numkp"), function (inp) {
      inp.addEventListener("focus", function () { openKeypad(this); this.blur(); });
      inp.addEventListener("click", function () { openKeypad(this); });
    });
    $("kp-overlay").addEventListener("click", function (e) {
      if (e.target === this) closeKeypad();
    });

    // EPL
    $("epl-open").addEventListener("click", openEpl);
    $("epl-cancel").addEventListener("click", closeEpl);
    $("epl-insert").addEventListener("click", function () {
      state.epl = eplCompute();
      $("f-epl").value = state.epl;
      closeEpl(); recomputeMass();
    });
    ["epl-adults", "epl-child", "epl-infant", "epl-cargo", "epl-fak"].forEach(function (id) {
      $(id).addEventListener("input", eplCompute);
    });

    // TOLD1 airport
    $("f-airport").addEventListener("input", function () {
      this.value = this.value.toUpperCase().replace(/[^A-Z]/g, "");
      var ap = applyAirport(this.value, $("f-elev"), $("f-rwy"));
      computeWindComponent(); computeN1(); computeClimbMct();
    });
    $("ld-airport").addEventListener("input", function () {
      this.value = this.value.toUpperCase().replace(/[^A-Z]/g, "");
      computeLanding();
    });

    // TOLD1 selects
    $("f-catering").addEventListener("change", updateDom);
    $("f-crew").addEventListener("change", updateDom);
    ["f-flap"].forEach(function (id) {
      $(id).addEventListener("change", function () { recomputeMass(); });
    });
    ["f-rwy", "f-rwy-cond"].forEach(function (id) {
      $(id).addEventListener("change", function () { computeWindComponent(); });
    });
    ["f-bleeds", "f-antiice", "n1-aion"].forEach(function (id) {
      $(id).addEventListener("change", function () { computeN1(); computeClimbMct(); recomputeMass(); });
    });
    ["f-oat", "f-dew", "f-qnh", "f-wdir", "f-wspd", "f-tofuel"].forEach(function (id) {
      $(id).addEventListener("input", function () { recomputeMass(); });
    });
    ["f-atis", "f-atistime"].forEach(function (id) {
      $(id).addEventListener("input", function () { recomputeMass(); });
      $(id).addEventListener("change", function () { recomputeMass(); });
    });
    $("n1-calc").addEventListener("click", function () { computeN1(); });

    // TOLD2
    ["to-flight", "to-msa", "to-eltrim"].forEach(function (id) {
      $(id).addEventListener("input", function () { recomputeMass(); });
    });
    ["ld-flap", "ld-elm"].forEach(function (id) {
      $(id).addEventListener("change", computeLanding);
    });
    ["ld-oat", "ld-dew", "ld-qnh", "ld-wdir", "ld-wspd", "ld-dhda", "ld-divert"].forEach(function (id) {
      if ($(id)) $(id).addEventListener("input", computeLanding);
    });
    ["ld-bleeds", "ld-antiice"].forEach(function (id) {
      $(id).addEventListener("change", computeLanding);
    });

    // DH/DA: default 'V' or a number; letter is forced uppercase.
    if ($("ld-dhda")) {
      $("ld-dhda").addEventListener("input", function () {
        this.value = this.value.toUpperCase().replace(/[^0-9V]/g, "");
      });
    }

    // Cloud: English uppercase only (letters/digits/space/slash)
    ["f-cloud", "ld-cloud"].forEach(function (id) {
      var el = $(id); if (!el) return;
      var up = function () {
        var v = this.value.toUpperCase().replace(/[^A-Z0-9 /]/g, "");
        if (v !== this.value) this.value = v;
      };
      el.addEventListener("input", up);
      el.addEventListener("change", up);
      el.addEventListener("blur", up);
    });

    // Action bar
    $("btn-clear").addEventListener("click", clearSheet);
    $("btn-savepdf").addEventListener("click", function () {
      if (window.RJSavePDF) { window.RJSavePDF(); }
      else { Log.error("btn-savepdf: rjload-pdf.js not loaded"); }
    });
    $("btn-recalc").addEventListener("click", function () {
      safe(recomputeMass, "recalc");
    });

    // Modal close (backdrop click)
    Array.prototype.forEach.call(document.querySelectorAll(".modal-overlay"), function (ov) {
      ov.addEventListener("click", function (e) { if (e.target === this) this.classList.remove("open"); });
    });

    wireCloud();
  }

  /* ---------------- clear sheet ---------------- */
  function clearSheet() {
    try {
      ["f-airport", "f-epl", "f-tofuel", "f-wdir", "f-wspd", "f-oat", "f-dew", "f-qnh",
       "f-remarks", "to-flight", "to-msa", "to-eltrim", "ld-airport", "ld-cloud",
       "ld-dhda", "ld-divert", "ld-stand", "f-atistime", "ld-wdir", "ld-wspd",
       "ld-oat", "ld-dew", "ld-qnh"].forEach(function (id) { if ($(id)) $(id).value = ""; });
      ["f-bleeds", "f-antiice", "n1-aion", "ld-bleeds", "ld-antiice"].forEach(function (id) {
        if ($(id)) $(id).checked = false;
      });
      if ($("f-atis")) $("f-atis").value = "/";
      if ($("f-flap")) $("f-flap").value = "18";
      if ($("ld-flap")) $("ld-flap").value = "33";
      if ($("ld-dhda")) $("ld-dhda").value = "V";
      if ($("f-rvr")) $("f-rvr").value = "";
      if ($("ld-rvr")) $("ld-rvr").value = "";
      state.epl = 0;
      applyAirport("", $("f-elev"), $("f-rwy"));
      recomputeMass(); computeN1(); computeClimbMct(); computeLanding();
    
    } catch (e) {
      Log.error("clearSheet: " + (e && e.message ? e.message : e));
    }
  }

  /* ---------------- copy summary ---------------- */
  function copySummary() {
    var lines = [];
    lines.push("AVRO RJ — " + state.aircraft);
    lines.push("Date: " + $("f-date").textContent);
    lines.push("Airport: " + ($("f-airport").value || "—") + "  Elev: " + $("f-elev").textContent);
    lines.push("DOM: " + $("f-dom").textContent + "  EPL: " + state.epl);
    lines.push("EZFM: " + $("f-ezfm").textContent + "  T/O FUEL: " + ($("f-tofuel").value || "—"));
    lines.push("ETOM: " + $("f-etom").textContent + "  ATOM: " + $("to-atom").textContent);
    lines.push("FLAP: " + $("to-flap").textContent + "  V1/VR/V2/VFTO: " +
      $("to-v1").textContent + " / " + $("to-vr").textContent + " / " +
      $("to-v2").textContent + " / " + $("to-vfto").textContent);
    lines.push("N1 REF: " + $("to-n1ref").textContent + "  N1 CLIMB: " + $("to-n1climb").textContent +
      "  N1 MCT: " + $("to-n1mct").textContent);
    lines.push("LANDING — ELM: " + $("ld-elm").value + "  FLAP: " + $("ld-flap").value +
      "  VREF: " + $("ld-vref").textContent + "  VFTO: " + $("ld-vfto").textContent +
      "  N1 GA: " + $("ld-n1ga").textContent);
    var txt = lines.join("\n");
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function () {});
    alert("Summary copied:\n\n" + txt);
  }

  /* ============================================================
     Init
     ============================================================ */
  function init() {
    fillAircraft();
    buildOptions();
    wire();
    // date
    var d = new Date();
    var months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    $("f-date").textContent = String(d.getDate()).padStart(2, "0") + " " + months[d.getMonth()] + " " + d.getFullYear();
    // time
    $("f-atistime").value = String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
    $("f-atis").value = "/";
    // DH/DA default value
    $("ld-dhda").value = "V";
    applyAircraft();
    recomputeMass(); computeN1(); computeClimbMct(); computeLanding();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
