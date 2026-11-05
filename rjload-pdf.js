/* ============================================================
   AVRO RJ — Load Sheet
   rjload-pdf.js — exports the two form pages (template PDF)
   filled with the current values. Page size: 75 x 185 mm.
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

  var PDFLib = window.PDFLib;
  var B64 = window.TOLD_FINAL_B64;

  /* ---------- small helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function txt(el, fallback) {
    if (!el) return fallback || "";
    var v = (el.value != null && el.tagName !== "DIV" && el.tagName !== "SPAN") ? el.value : el.textContent;
    v = (v || "").trim();
    return v === "" ? (fallback || "") : v;
  }
  function numFrom(el, fallback) {
    var raw = txt(el, "").replace(/[^0-9.\-]/g, "");
    var n = parseFloat(raw);
    return isNaN(n) ? (fallback || "") : n;
  }
  function base64ToBytes(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function todayStamp() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, "0"); }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  /* ---------- template geometry (source points) ---------- */
  var P0 = { w: 599.1, h: 792.0 };
  var P1 = { w: 603.7, h: 792.0 };
  var PAGE_W = 75 / 25.4 * 72;
  var PAGE_H = 185 / 25.4 * 72;

  function xy(ctx, xPt, yPt) {
    return { x: xPt * ctx.scale, y: ctx.y + yPt * ctx.scale };
  }

  function drawText(ctx, s, xPt, yPt, opts) {
    opts = opts || {};
    var size = (opts.size || 11) * ctx.scale;
    var font = opts.font || ctx.font.helvB;
    var pos = xy(ctx, xPt, yPt);
    var width = font.widthOfTextAtSize(s, size);
    var x = pos.x;
    if (opts.align === "center") x = pos.x - width / 2;
    else if (opts.align === "right") x = pos.x - width;
    if (opts.align === "left" && opts.maxWidth) {
      while (s.length > 1 && font.widthOfTextAtSize(s, size) > opts.maxWidth * ctx.scale) {
        s = s.slice(0, -1);
      }
    }
    ctx.page.drawText(String(s), {
      x: x, y: pos.y, size: size, font: font, color: ctx.font.ink
    });
  }

  function drawTick(ctx, xPt, yPt) {
    var p1 = xy(ctx, xPt - 5, yPt + 1.5);
    var p2 = xy(ctx, xPt - 1.5, yPt - 3);
    var p3 = xy(ctx, xPt + 6, yPt + 5.5);
    ctx.page.drawLine({ start: p1, end: p2, thickness: 1.4, color: ctx.font.ink });
    ctx.page.drawLine({ start: p2, end: p3, thickness: 1.4, color: ctx.font.ink });
  }

  /* ==========================================================
     Collect current form values
     ========================================================== */
  function collect() {
    var V = {};
    V.date = txt($("f-date"), "");
    V.airport = txt($("f-airport"), "").toUpperCase();
    V.elev = txt($("f-elev")).replace(/[^0-9-]/g, "");
    V.dom = txt($("f-dom")).replace(/[^0-9]/g, "");
    V.epl = txt($("f-epl"), "0");
    V.ezfm = txt($("f-ezfm")).replace(/[^0-9]/g, "");
    V.tofuel = txt($("f-tofuel"), "");
    V.etom = txt($("f-etom")).replace(/[^0-9]/g, "");
    V.flap = txt($("f-flap"), "18");
    V.ident = txt($("f-atis"), "/");
    V.time = txt($("f-atistime"), "--:--");
    var r = txt($("f-rwy"), "");
    var c = txt($("f-rwy-cond"), "");
    V.rwy = r ? (r + (c ? " · " + c : "")) : "";
    V.wdir = txt($("f-wdir"), "");
    V.wspd = txt($("f-wspd"), "");
    V.wcompTxt = txt($("f-wcomp"), "");
    V.rvr = txt($("f-rvr"), "");
    V.cloud = txt($("f-cloud"), "");
    V.oat = txt($("f-oat"), "");
    V.dew = txt($("f-dew"), "");
    V.qnh = txt($("f-qnh"), "");
    V.palt = txt($("f-palt")).replace(/[^0-9]/g, "");
    V.remarks = txt($("f-remarks"), "");
    V.bleeds = !!$("f-bleeds").checked;
    V.antiice = !!$("f-antiice").checked;
    V.n1ref = numFrom($("n1-ref"), "");
    V.tredu = numFrom($("n1-tredu"), "");
    V.n1redu = numFrom($("n1-n1redu"), "");
    V.v1 = numFrom($("to-v1"), "");
    V.vr = numFrom($("to-vr"), "");
    V.v2 = numFrom($("to-v2"), "");
    V.vfto = numFrom($("to-vfto"), "");
    V.atom = txt($("to-atom"), "").replace(/\s*T\s*$/i, "").trim();
    V.flight = txt($("to-flight"), "");
    V.flapTo = txt($("to-flap"), "");
    V.atisTo = txt($("to-atis"), "/");
    V.qnhTo = txt($("to-qnh"), "");
    V.rwyTo = txt($("to-rwy"), "");
    V.msa = txt($("to-msa"), "");
    V.eltrim = txt($("to-eltrim"), "");
    V.n1refTo = numFrom($("to-n1ref"), "");
    V.n1reduTo = numFrom($("to-n1redu"), "");
    V.n1climb = numFrom($("to-n1climb"), "");
    V.n1mct = numFrom($("to-n1mct"), "");
    V.bleedsTo = V.bleeds;
    V.antiiceTo = V.antiice;

    V.flightL = txt($("ld-flight"), "").replace(/^TLR\s*/i, "");
    V.elm = txt($("ld-elm"), "33");
    V.flapL = txt($("ld-flap"), "33");
    V.vref = numFrom($("ld-vref"), "");
    V.vftoL = numFrom($("ld-vfto"), "");
    V.atisL = txt($("ld-atis"), "/");
    V.airportL = txt($("ld-airport"), "").toUpperCase();
    V.bleedsL = !!$("ld-bleeds").checked;
    V.antiiceL = !!$("ld-antiice").checked;
    V.n1ga = numFrom($("ld-n1ga"), "");
    V.dhda = txt($("ld-dhda"), "");
    V.divert = txt($("ld-divert"), "");
    V.oatDp = (txt($("ld-oat"), "") + (txt($("ld-dew"), "") ? " / " + txt($("ld-dew"), "") : "")).trim();
    V.qnhL = txt($("ld-qnh"), "");
    V.wdirL = txt($("ld-wdir"), "");
    V.wspdL = txt($("ld-wspd"), "");
    V.visrvr = txt($("ld-rvr"), "");
    V.cloudL = txt($("ld-cloud"), "");
    return V;
  }

  /* ==========================================================
     Draw the two pages
     ========================================================== */
  function drawPage1(ctx, V) {
    drawText(ctx, V.date, 150, 717, { size: 11 });
    drawText(ctx, V.airport, 295, 716, { size: 13, align: "center" });
    drawText(ctx, V.elev, 468, 715, { size: 12, align: "center" });

    drawText(ctx, V.dom, 145, 685, { size: 12, align: "center" });
    drawText(ctx, V.ident, 362, 679, { size: 11, align: "center" });
    drawText(ctx, V.time, 480, 679, { size: 11, align: "center" });
    drawText(ctx, V.epl, 145, 650, { size: 12, align: "center" });
    drawText(ctx, V.rwy, 330, 650, { size: 12, align: "center" });
    drawText(ctx, V.ezfm, 145, 615, { size: 12, align: "center" });
    drawText(ctx, V.wdir, 300, 610, { size: 11, align: "center" });
    drawText(ctx, V.wspd, 362, 610, { size: 11, align: "center" });
    drawText(ctx, V.wcompTxt.replace(/\s*kt\s*/i, " ").trim(), 455, 610, { size: 11, align: "center" });
    drawText(ctx, V.tofuel, 145, 577, { size: 12, align: "center" });
    drawText(ctx, V.rvr, 377, 573, { size: 12, align: "center" });
    drawText(ctx, V.etom, 145, 534, { size: 12, align: "center" });
    drawText(ctx, V.cloud, 280, 532, { size: 11, align: "left", maxWidth: 250, font: ctx.font.helv });
    drawText(ctx, V.flap, 140, 493, { size: 13, align: "center" });
    drawText(ctx, V.oat, 328, 493, { size: 11, align: "right" });
    drawText(ctx, V.dew, 498, 490, { size: 11, align: "right" });
    drawText(ctx, V.qnh, 330, 455, { size: 12, align: "center" });
    drawText(ctx, V.palt, 512, 451, { size: 12, align: "right" });
    drawText(ctx, V.remarks, 130, 420, { size: 10, align: "left", maxWidth: 400, font: ctx.font.helv });

    if (V.bleeds) drawTick(ctx, 222, 459);
    if (V.antiice) drawTick(ctx, 222, 442);

    if (V.n1ref !== "") drawText(ctx, String(V.n1ref), 150, 122, { size: 12, align: "center" });
    if (V.tredu !== "") drawText(ctx, String(V.tredu), 150, 88, { size: 12, align: "center" });
    if (V.n1redu !== "") drawText(ctx, String(V.n1redu), 150, 55, { size: 12, align: "center" });
    if (V.v1 !== "") drawText(ctx, String(V.v1), 215, 78, { size: 11, align: "center" });
    if (V.v2 !== "") drawText(ctx, String(V.v2), 455, 122, { size: 11, align: "right" });
    if (V.vr !== "") drawText(ctx, String(V.vr), 455, 88, { size: 11, align: "right" });
    if (V.v1 !== "") drawText(ctx, String(V.v1), 455, 53, { size: 11, align: "right" });

    // ETOM in the TMAX strip + TMAX default +50 (reserved cells stay blank)
    if (V.etom) drawText(ctx, V.etom, 75, 212, { size: 12, align: "center" });
    drawText(ctx, "+50", 362, 215, { size: 11, align: "center" });
    drawText(ctx, "+50", 540, 209, { size: 11, align: "right" });
  }

  function drawPage2(ctx, V) {
    drawText(ctx, V.flight ? "TLR " + V.flight : "", 170, 672, { size: 13, align: "center" });
    drawText(ctx, V.atom ? V.atom + " T" : "", 158, 612, { size: 24, align: "center" });
    drawText(ctx, String(V.v1), 160, 582, { size: 20, align: "center" });
    drawText(ctx, String(V.vr), 160, 533, { size: 20, align: "center" });
    drawText(ctx, String(V.v2), 160, 483, { size: 20, align: "center" });
    drawText(ctx, String(V.vfto), 160, 436, { size: 20, align: "center" });
    drawText(ctx, V.flapTo, 305, 617, { size: 20, align: "center" });
    if (V.bleedsTo) drawTick(ctx, 465, 662);
    if (V.antiiceTo) drawTick(ctx, 465, 607);

    drawText(ctx, String(V.atisTo), 267, 532, { size: 11, align: "center" });
    drawText(ctx, String(V.qnhTo), 343, 529, { size: 11, align: "center" });
    drawText(ctx, String(V.rwyTo), 268, 480, { size: 10, align: "center" });
    drawText(ctx, String(V.msa), 341, 483, { size: 11, align: "center" });
    drawText(ctx, String(V.eltrim), 330, 443, { size: 11, align: "center" });

    drawText(ctx, String(V.n1refTo), 478, 582, { size: 13, align: "center" });
    drawText(ctx, String(V.n1reduTo), 478, 529, { size: 13, align: "center" });
    drawText(ctx, String(V.n1climb), 478, 482, { size: 13, align: "center" });
    drawText(ctx, String(V.n1mct), 478, 433, { size: 13, align: "center" });

    // landing data
    drawText(ctx, V.flightL ? "TLR " + V.flightL : "", 170, 313, { size: 13, align: "center" });
    drawText(ctx, String(V.elm) + " T", 160, 262, { size: 22, align: "center" });
    drawText(ctx, String(V.vref), 160, 222, { size: 22, align: "center" });
    drawText(ctx, String(V.vftoL), 160, 172, { size: 20, align: "center" });
    drawText(ctx, String(V.atisL), 160, 135, { size: 13, align: "center" });
    drawText(ctx, V.cloudL, 125, 72, { size: 11, align: "left", maxWidth: 90, font: ctx.font.helv });

    drawText(ctx, V.flapL, 303, 256, { size: 18, align: "center" });
    drawText(ctx, V.airportL, 478, 330, { size: 13, align: "center" });
    if (V.bleedsL) drawTick(ctx, 478, 250);
    if (V.antiiceL) drawTick(ctx, 478, 217);

    drawText(ctx, String(V.n1ga), 478, 173, { size: 17, align: "center" });
    drawText(ctx, String(V.dhda), 478, 115, { size: 13, align: "center" });
    drawText(ctx, String(V.divert), 478, 55, { size: 13, align: "center" });

    drawText(ctx, String(V.oatDp), 262, 176, { size: 11, align: "center" });
    drawText(ctx, String(V.qnhL), 344, 175, { size: 11, align: "center" });
    var wind = (V.wdirL || "") + (V.wspdL ? " / " + V.wspdL : "");
    drawText(ctx, wind, 299, 128, { size: 11, align: "center" });
    drawText(ctx, String(V.visrvr), 330, 66, { size: 13, align: "center" });
  }

  /* ==========================================================
     Export
     ========================================================== */
  async function buildPdf() {
    if (!PDFLib) throw new Error("pdf-lib not loaded");
    if (!B64) throw new Error("Template data missing (told_final_b64.js)");

    var templateBytes = base64ToBytes(B64);
    var template = await PDFLib.PDFDocument.load(templateBytes);
    var out = await PDFLib.PDFDocument.create();

    var helv = await out.embedFont(PDFLib.StandardFonts.Helvetica);
    var helvB = await out.embedFont(PDFLib.StandardFonts.HelveticaBold);
    var ink = PDFLib.rgb(0, 0, 0);
    var fontPack = { helv: helv, helvB: helvB, ink: ink };

    var embedded = await out.embedPdf(template, [0, 1]);
    var V = collect();

    function makeCtx(page, scale, y) {
      return { page: page, scale: scale, y: y, font: fontPack };
    }

    // page 1 — TOLD1
    var s0 = PAGE_W / P0.w, h0 = P0.h * s0, y0 = (PAGE_H - h0) / 2;
    var page1 = out.addPage([PAGE_W, PAGE_H]);
    page1.drawPage(embedded[0], { x: 0, y: y0, width: PAGE_W, height: h0 });
    drawPage1(makeCtx(page1, s0, y0), V);

    // page 2 — TOLD2
    var s1 = PAGE_W / P1.w, h1 = P1.h * s1, y1 = (PAGE_H - h1) / 2;
    var page2 = out.addPage([PAGE_W, PAGE_H]);
    page2.drawPage(embedded[1], { x: 0, y: y1, width: PAGE_W, height: h1 });
    drawPage2(makeCtx(page2, s1, y1), V);

    var pdfBytes = await out.save();
    var flightSafe = (V.flight || V.flightL || "000").replace(/[^0-9A-Za-z]/g, "");
    return {
      bytes: pdfBytes,
      blob: new Blob([pdfBytes], { type: "application/pdf" }),
      filename: "TLR" + flightSafe + "_" + todayStamp() + ".pdf",
      flight: flightSafe,
      date: todayStamp()
    };
  }

  function queueUpload(res) {
    if (window.RJQueue) {
      window.RJQueue.enqueue({ blob: res.blob, filename: res.filename, flight: res.flight, date: res.date });
    } else {
      Log.warn("rjload-queue.js not loaded — upload skipped");
    }
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    try {
      Log.info("PDF export requested");
      var res = await buildPdf();
      downloadBlob(res.blob, res.filename);
      Log.info("PDF exported: " + res.filename);
      // Cloud upload: immediate when online + configured, otherwise queue it.
      if (window.RJDrive && window.RJDrive.isConfigured()) {
        if (navigator.onLine) {
          window.RJDrive.uploadPdf(res).then(function (r) {
            if (!r || !r.ok) { queueUpload(res); }
          }).catch(function (e) {
            Log.warn("Drive upload failed, queuing: " + ((e && e.message) ? e.message : e));
            queueUpload(res);
          });
        } else {
          queueUpload(res);
        }
      }
    } catch (e) {
      var msg = (e && e.message) ? e.message : String(e);
      Log.error("PDF export failed: " + msg);
      alert("تعذر حفظ PDF: " + msg);
    }
  }

  window.RJSavePDF = exportPdf;
})();
