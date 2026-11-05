/**
 * RJ Load Sheet — Google Drive upload hook
 * =========================================
 * ينشر «مجلد Drive واحد» ويستقبل ملفات PDF من كل الـ iPads.
 * لا يحتاج خادماً، ولا OAuth، ولا حساب Google على الأجهزة.
 *
 * خطوات النشر (مرة واحدة):
 *   1) افتح https://drive.google.com بحسابك
 *   2) Extensions → Apps Script → احذف الكود → الصق هذا الملف كله
 *   3) غيّر TOKEN أدناه (نفس القيمة التي ستكتبها في التطبيق)
 *   4) Deploy → New deployment → Web App
 *        Execute as:   Me
 *        Who has access: Anyone
 *   5) Deploy → انسخ الرابط الذي ينتهي بـ /exec
 *   6) في التطبيق: ☰ → Cloud storage → الصق الرابط + TOKEN → Save
 *
 * (اختياري) لا تريد إنشاء مجلد جديد؟ ضع معرف مجلد موجود بدل ROOT_FOLDER:
 *   const ROOT_ID = 'PUT_FOLDER_ID_HERE';
 */

const TOKEN = 'CHANGE_ME';            // ← غيّره (مثال: 'RJ-LOAD-2026')
const ROOT_FOLDER = 'RJ Load Sheets'; // اسم المجلد الذي سيُنشأ إن لم يوجد
const OK = 'RJLH-OK';

function doGet(e) {
  return ContentService.createTextOutput(OK);
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.token !== TOKEN) return ContentService.createTextOutput('UNAUTHORIZED');

    var filename = sanitize_(body.filename || 'file.pdf');
    var flight   = sanitize_(body.flight   || 'UNKNOWN');
    if (!body.base64) return ContentService.createTextOutput('NO_DATA');

    var root = ROOT_ID
      ? DriveApp.getFolderById(ROOT_ID)
      : folderOrCreate_(DriveApp.getRootFolder(), ROOT_FOLDER);
    var sub  = folderOrCreate_(root, flight);

    // Idempotent: استبدال أي ملف بنفس الاسم (لا تكرار)
    var existing = sub.getFilesByName(filename);
    while (existing.hasNext()) existing.next().setTrashed(true);

    var bytes = Utilities.base64Decode(body.base64);
    var blob  = Utilities.newBlob(bytes, 'application/pdf', filename);
    var file  = sub.createFile(blob);
    return ContentService.createTextOutput('OK:' + file.getId());
  } catch (err) {
    return ContentService.createTextOutput('ERROR:' + err);
  }
}

// اتركه فارغاً ليُنشأ المجلد تلقائياً في Drive؛ أو ضع معرف مجلد موجود كاملاً.
const ROOT_ID = '';

function folderOrCreate_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function sanitize_(s) {
  return String(s).replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || 'UNKNOWN';
}
