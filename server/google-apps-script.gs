/**
 * emBODY web — serverless data collection into Google Drive.
 *
 * 1. Create a folder in Google Drive and copy its ID from the URL
 *    (https://drive.google.com/drive/folders/<THIS PART>).
 * 2. Go to https://script.google.com -> New project, paste this file, set FOLDER_ID.
 * 3. Deploy -> New deployment -> type "Web app":
 *      Execute as: Me      Who has access: Anyone
 * 4. Copy the web app URL (ends in /exec) into config.js -> submit.endpoint.
 *
 * Files are written as <experiment>/subjects/<id>/<file>, the same layout as the
 * original PHP tool. Download the folder from Drive and open it in admin.html,
 * or analyse it with the original MATLAB scripts.
 */
var FOLDER_ID = "PASTE_YOUR_FOLDER_ID_HERE";
var FILE_OK = /^(\d{1,4}\.csv|data\.txt|presentation\.txt|techdata\.txt|session\.json)$/;

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var msg = JSON.parse(e.postData.contents);
    var subject = String(msg.subject || ""), token = String(msg.token || "");
    if (!/^[\w.-]{1,100}$/.test(subject) || !/^[0-9a-f]{16,64}$/.test(token) || typeof msg.files !== "object") {
      return reply({ ok: false, error: "bad request" });
    }
    var experiment = String(msg.experiment || "default").replace(/[^\w.-]+/g, "_").slice(0, 100) || "default";
    var root = DriveApp.getFolderById(FOLDER_ID);
    var dir = sub(sub(sub(root, experiment), "subjects"), subject);

    var tok = dir.getFilesByName(".token");
    if (tok.hasNext()) {
      if (tok.next().getBlob().getDataAsString().trim() !== token) {
        return reply({ ok: false, error: "participant id already in use" });
      }
    } else {
      dir.createFile(".token", token);
    }
    var names = Object.keys(msg.files);
    for (var i = 0; i < names.length; i++) {
      if (!FILE_OK.test(names[i])) return reply({ ok: false, error: "bad file" });
    }
    names.forEach(function (name) {
      var old = dir.getFilesByName(name);
      while (old.hasNext()) old.next().setTrashed(true);
      dir.createFile(name, String(msg.files[name]), MimeType.PLAIN_TEXT);
    });
    return reply({ ok: true, saved: names });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function sub(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
