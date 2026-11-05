/* ============================================================
   AVRO RJ — Load Sheet
   rjload-queue.js — offline upload queue for PDF files.

   Stores pending PDF blobs in IndexedDB (survives reload/offline),
   then flushes them to Google Drive automatically when the device is
   online again (window 'online' event + periodic retry + on load).

   Used by rjload-pdf.js via window.RJQueue.
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

  var DB_NAME = "rjload";
  var DB_VERSION = 1;
  var STORE = "pending-uploads";
  var RETRY_MS = 60 * 1000;   // periodic retry while items remain
  var _timer = null;
  var _flushing = false;

  function hasIDB() { return ("indexedDB" in window); }

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (!hasIDB()) { reject(new Error("IndexedDB unavailable")); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var store = t.objectStore(STORE);
        var out = fn(store);
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  // item = { blob, filename, flight, date, tries }
  function enqueue(item) {
    item.tries = item.tries || 0;
    item.createdAt = item.createdAt || Date.now();
    return tx("readwrite", function (store) { return store.add(item); })
      .then(function () {
        Log.info("Queued for upload: " + item.filename);
        notify("تم الإضافة إلى قائمة الرفع (سيُرفع تلقائياً عند الاتصال).", false);
        schedule();
        return true;
      })
      .catch(function (e) {
        Log.error("Queue add failed: " + (e && e.message ? e.message : e));
        return false;
      });
  }

  function list() {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, "readonly");
        var req = t.objectStore(STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return []; });
  }

  function remove(id) {
    return tx("readwrite", function (store) { return store.delete(id); });
  }

  function count() { return list().then(function (a) { return a.length; }); }

  function schedule() {
    if (_timer) return;
    _timer = setInterval(function () {
      flush().then(function (left) {
        if (left === 0 && _timer) { clearInterval(_timer); _timer = null; }
      });
    }, RETRY_MS);
  }

  // Try to send all pending items; returns number of items still pending.
  function flush() {
    if (_flushing) return count();
    if (!navigator.onLine) { Log.info("Offline — upload flush deferred"); return list().then(function (a) { return a.length; }); }
    if (!window.RJDrive || !window.RJDrive.isConfigured()) { return list().then(function (a) { return a.length; }); }

    _flushing = true;
    return list().then(function (items) {
      var chain = Promise.resolve();
      items.forEach(function (it) {
        chain = chain.then(function () {
          if (!navigator.onLine) return;
          return window.RJDrive.uploadPdf({ blob: it.blob, filename: it.filename, flight: it.flight, date: it.date, silent: true })
            .then(function (r) {
              if (r && r.ok) { return remove(it.id); }
              // permanent failures (auth/bucket) still retry; keep item
              return null;
            })
            .catch(function () { return null; });
        });
      });
      return chain;
    }).then(function () {
      _flushing = false;
      return count();
    }).catch(function () {
      _flushing = false;
      return count();
    });
  }

  /* ---------- tiny toast (shared with rjload-drive.js) ---------- */
  function notify(msg, isError) {
    if (window.RJDrive && window.RJDrive.notify) { window.RJDrive.notify(msg, isError); return; }
    try {
      var el = document.getElementById("cloud-toast");
      if (!el) {
        el = document.createElement("div");
        el.id = "cloud-toast";
        el.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);" +
          "z-index:200;padding:10px 16px;border-radius:10px;font-size:14px;font-weight:700;" +
          "max-width:90vw;box-shadow:0 8px 22px rgba(0,0,0,.35)";
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.background = isError ? "#7a1f1f" : "#14532d";
      el.style.color = "#fff";
    } catch (e) { /* ignore */ }
  }

  function init() {
    // Flush on load and whenever connectivity returns.
    window.addEventListener("online", function () { Log.info("Back online — flushing queue"); flush(); });
    window.addEventListener("offline", function () { Log.warn("Offline — uploads will queue"); });
    setTimeout(function () { flush(); }, 1500);
    list().then(function (a) { if (a.length) { Log.info("Pending uploads at start: " + a.length); schedule(); } });
  }

  window.RJQueue = {
    enqueue: enqueue,
    flush: flush,
    list: list,
    count: count,
    notify: notify
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
