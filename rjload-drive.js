/* ============================================================
   AVRO RJ — Load Sheet
   rjload-drive.js — upload PDFs to a central Google Drive via
   Google Apps Script (Web App). No OAuth, no client-side files —
   the script (owned by the fleet's Google account) creates the
   folder tree and stores the PDF.

   Endpoint configuration (☰ → Cloud storage):
     • Web App URL   →  /exec link of the deployed script
     • Token         →  shared secret checked by the script

   Public API (queue-compatible):
     isConfigured() / uploadPdf(res) / readCfg() / saveCfg()
     testConnection() / notify(msg, isError)
   ============================================================ */
(function () {
  "use strict";

  var Log = (function () {
    function fmt(level, msg) { return "[RJLoad " + level + "] " + msg; }
    return {
      info:  function (m) { console.log(fmt("INFO", m)); },
      warn:  function (m) { console.warn(fmt("WARN", m)); },
      error: function (m) { console.error(fmt("ERROR", m)); }
    };
  })();

  var LS_KEY = "rjload.drive";

  /* ---------- config ---------- */
  function readCfg() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      var c = raw ? JSON.parse(raw) : {};
      return {
        url:   (c.url   || "").trim(),
        token: (c.token || "").trim()
      };
    } catch (e) {
      Log.warn("Drive config read failed: " + e.message);
      return { url: "", token: "" };
    }
  }
  function saveCfg(url, token) {
    var c = { url: (url || "").trim(), token: (token || "").trim() };
    try { localStorage.setItem(LS_KEY, JSON.stringify(c)); }
    catch (e) { Log.error("Drive config save failed: " + e.message); }
    return c;
  }
  function isConfigured() { var c = readCfg(); return !!c.url; }

  /* ---------- base64 ---------- */
  function bytesToBase64(buf) {
    var bytes = new Uint8Array(buf);
    var CHUNK = 0x8000;
    var out = "";
    for (var i = 0; i < bytes.length; i += CHUNK) {
      var slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
      out += String.fromCharCode.apply(null, slice);
    }
    return btoa(out);
  }

  /* ---------- upload ----------
     Sends {token, filename, flight, base64} as JSON.
     Uses mode:'no-cors' so the request succeeds even if the browser
     can't read the response (Apps Script returns opaque bodies).
       → online + reachable: stored by the script.
       → offline / network failure: fetch throws → queue for retry.
     The script itself is idempotent (re-saves same name by replacing). */
  async function uploadPdf(res) {
    var c = readCfg();
    if (!c.url) {
      Log.warn("Drive hook not configured — skipping upload");
      return { ok: false, reason: "not-configured" };
    }
    try {
      var buf = await res.blob.arrayBuffer();
      var body = {
        token: c.token,
        filename: res.filename,
        flight: res.flight || "UNKNOWN",
        base64: bytesToBase64(buf)
      };
      await fetch(c.url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body)
      });
      Log.info("Drive hook sent: " + res.filename);
      if (!res.silent) notify("تم رفع الملف إلى Google Drive: " + res.filename, false);
      return { ok: true };
    } catch (e) {
      var msg = (e && e.message) ? e.message : String(e);
      Log.error("Drive hook failed: " + msg);
      if (!res.silent) notify("تعذر الرفع إلى Google Drive: " + msg, true);
      return { ok: false, error: msg };
    }
  }

  /* ---------- connection test ----------
     Validates the hook with a plain GET (the script must answer
     "RJLH-OK"). Uses cors; if the browser blocks reading the body
     we report the hook reachable but unreadable. */
  function testConnection() {
    var c = readCfg();
    if (!c.url) return Promise.resolve({ ok: false, message: "الرابط مطلوب" });
    return fetch(c.url, {
      method: "GET",
      cache: "no-store"
    }).then(function (r) {
      return r.text().then(function (t) {
        var ok = (t || "").indexOf("RJLH-OK") >= 0;
        return ok
          ? { ok: true, message: "تم الاتصال بالمجلد بنجاح." }
          : { ok: false, message: "الرابط يستجيب لكنه ليس الـ hook الصحيح (متوقع RJLH-OK)." };
      });
    }).catch(function (e) {
      var m = (e && e.message) ? e.message : String(e);
      return { ok: false, message: "تعذر الوصول إلى الرابط (" + m + "). تأكد: النشر Anyone والرابط /exec." };
    });
  }

  /* ---------- tiny toast ---------- */
  function notify(msg, isError) {
    try {
      var el = document.getElementById("cloud-toast");
      if (!el) {
        el = document.createElement("div");
        el.id = "cloud-toast";
        el.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);" +
          "z-index:200;padding:10px 16px;border-radius:10px;font-size:14px;font-weight:700;" +
          "max-width:90vw;box-shadow:0 8px 22px rgba(0,0,0,.35);transition:opacity .3s";
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.background = isError ? "#7a1f1f" : "#14532d";
      el.style.color = "#fff";
      el.style.opacity = "1";
      clearTimeout(el._t);
      el._t = setTimeout(function () { el.style.opacity = "0"; }, 4000);
    } catch (e) { /* ignore */ }
  }

  window.RJDrive = {
    readCfg: readCfg,
    saveCfg: saveCfg,
    isConfigured: isConfigured,
    uploadPdf: uploadPdf,
    testConnection: testConnection,
    notify: notify,
    ROOT_FOLDER: "RJ Load Sheets"
  };
})();
