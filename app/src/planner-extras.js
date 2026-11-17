/* Bitcoin Inheritance Planner: app-only features (Capacitor mobile app)
 *  - Yearly check: fixed yearly date, reminder (app) / calendar file (.ics), checklist tailored to the plan
 *  - Checklist as its own page in the PDF
 *  - First-consultation hint (free first consultation using the app)
 *  - Native bridges: share a file, print, back button
 * Needs no build step. Loaded by the app build only, the website never includes this file.
 */
(function(){
  'use strict';

  var cap = window.Capacitor;
  var NATIVE = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  window.IS_NATIVE = NATIVE;
  if(NATIVE) document.documentElement.classList.add('native-app');

  // Chapter texts of the app step 'yearly check' (the web file does not know this step)
  if(typeof CHAPTER_COPY !== 'undefined'){
    CHAPTER_COPY.en.reminder = ['Yearly check', 'Pick a date to re-check your setup once a year and get a checklist.'];
    CHAPTER_COPY.de.reminder = ['Jahrescheck', 'Einmal im Jahr prüfen, ob dein Setup noch stimmt, mit Termin und Checkliste.'];
  }

  var BOOK_URL = 'https://clavastack.com/security-talk';
  var BOOK_URL_APP = BOOK_URL + '?utm_source=inheritance-planner-app';
  var NOTIF_ID = 4711;

  function isDe(){ return typeof LANG !== 'undefined' && LANG === 'de'; }
  function T(de, en){ return isDe() ? de : en; }
  function e(s){ return (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function $(id){ return document.getElementById(id); }
  function toast(msg, kind){ if(typeof showToast === 'function') showToast(msg, kind); }

  /* ---------- Plugin access (without a bundler) ---------- */
  var plugCache = {};
  function plug(name){
    if(!NATIVE) return null;
    if(!plugCache[name]){
      var p = typeof cap.registerPlugin === 'function' ? cap.registerPlugin(name) : (cap.Plugins && cap.Plugins[name]);
      if(!p) throw new Error('Plugin ' + name + ' nicht verfügbar');
      plugCache[name] = p;
    }
    return plugCache[name];
  }

  /* ---------- Storage: native Preferences, memory only on the web ---------- */
  // Errors are NOT swallowed: a failed read must never look like "no data" (the app would start without PIN and
  // overwrite the encrypted data), and a failed write must never look like success.
  var mem = {};
  var store = {
    get: function(key){
      if(!NATIVE) return Promise.resolve(mem[key] || null);
      return plug('Preferences').get({key: key}).then(function(r){ return r && r.value ? r.value : null; });
    },
    set: function(key, val){
      if(!NATIVE){ mem[key] = val; return Promise.resolve(); }
      return plug('Preferences').set({key: key, value: val});
    },
    // Writes and reads back, rejects if the stored value differs (used for the PIN key material)
    setVerified: function(key, val){
      return store.set(key, val).then(function(){ return store.get(key); }).then(function(back){
        if(back !== val) throw new Error('write-verify');
      });
    },
    remove: function(key){
      if(!NATIVE){ delete mem[key]; return Promise.resolve(); }
      return plug('Preferences').remove({key: key});
    }
  };

  /* ---------- Imported / stored plan state: never trust it ---------- */
  // Ids end up in HTML attributes. Only harmless characters are allowed.
  var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  var BAD_KEYS = {'__proto__': 1, 'constructor': 1, 'prototype': 1};
  function sanitizeState(st){
    var out = {};
    if(!st || typeof st !== 'object' || Array.isArray(st)) return out;
    Object.keys(st).forEach(function(k){ if(!BAD_KEYS[k]) out[k] = st[k]; });
    var c = out.checkCustom;
    if(c && typeof c === 'object' && !Array.isArray(c)){
      out.checkCustom = {
        add: (Array.isArray(c.add) ? c.add : []).filter(function(a){ return a && typeof a.id === 'string' && ID_RE.test(a.id) && typeof a.t === 'string'; })
              .map(function(a){ return {id: a.id, t: a.t.slice(0, 140)}; }).slice(0, 100),
        removed: (Array.isArray(c.removed) ? c.removed : []).filter(function(id){ return typeof id === 'string' && ID_RE.test(id); }).slice(0, 500)
      };
    } else delete out.checkCustom;
    return out;
  }
  // Every plan that is loaded from a file or from the backup text passes through here
  if(typeof window.applyLoadedState === 'function'){
    var origApply = window.applyLoadedState;
    window.applyLoadedState = function(loaded){ return origApply.call(this, sanitizeState(loaded)); };
  }

  /* ---------- Date helpers ---------- */
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function ymd(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDate(s){
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if(!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d;
  }
  function parseTime(s){
    var m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
    return m ? {h: Math.min(23, +m[1]), m: Math.min(59, +m[2])} : {h: 10, m: 0};
  }
  // Feb 29 is moved to Feb 28 so the date really occurs every year
  function normalizedMD(d){
    var month = d.getMonth() + 1, day = d.getDate();
    if(month === 2 && day === 29) day = 28;
    return {month: month, day: day};
  }
  function occurrenceIn(year, md, t){ return new Date(year, md.month - 1, md.day, t.h, t.m, 0); }
  function nextOccurrence(dateStr, timeStr, from){
    var d = parseDate(dateStr); if(!d) return null;
    var md = normalizedMD(d), t = parseTime(timeStr), now = from || new Date();
    var y = d.getFullYear(), cand = occurrenceIn(y, md, t);
    while(cand <= now && y < now.getFullYear() + 2){ y++; cand = occurrenceIn(y, md, t); }
    return cand;
  }
  function fmtLong(d){
    try { return d.toLocaleDateString(isDe() ? 'de-DE' : 'en-GB', {day: 'numeric', month: 'long', year: 'numeric'}); }
    catch(err){ return ymd(d); }
  }
  function fmtDayMonth(d){
    try { return d.toLocaleDateString(isDe() ? 'de-DE' : 'en-GB', {day: 'numeric', month: 'long'}); }
    catch(err){ return ymd(d); }
  }

  /* ---------- Reminder state (part of the plan, goes into the plan file) ---------- */
  function rem(){
    if(!state.reminder || typeof state.reminder !== 'object') state.reminder = {on: null, date: '', time: '10:00'};
    if(!state.reminder.date){
      var d = new Date(); d.setFullYear(d.getFullYear() + 1);
      state.reminder.date = ymd(d);
    }
    if(!state.reminder.time) state.reminder.time = '10:00';
    return state.reminder;
  }

  /* ---------- Checklist tailored to the plan ---------- */
  function safe(fn){ try { return fn(); } catch(err){ return null; } }

  // Own changes belong to the plan (state.checkCustom): {add: [{id, t}], removed: [ids of generated items]}
  function customData(){
    var c = (typeof host !== 'undefined' && typeof host.customRef === 'function') ? host.customRef() : null;
    if(!c){ if(!state.checkCustom || typeof state.checkCustom !== 'object') state.checkCustom = {add: [], removed: []}; c = state.checkCustom; }
    if(!c.add) c.add = [];
    if(!c.removed) c.removed = [];
    return c;
  }
  function applyCustom(groups, includeRemoved){
    var c = customData(), gone = {};
    c.removed.forEach(function(id){ gone[id] = true; });
    var res = groups.map(function(g){
      return {t: g.t, items: g.items.filter(function(it){ return includeRemoved || !gone[it.id]; }).map(function(it){
        return gone[it.id] ? {id: it.id, t: it.t, removed: true} : it;
      })};
    }).filter(function(g){ return g.items.length; });
    if(c.add.length && !includeRemoved){
      var own = {t: T('Eigene Punkte', 'My items'), items: c.add.map(function(a){ return {id: a.id, t: a.t, custom: true}; })};
      res.splice(Math.max(0, res.length - 1), 0, own);   // before the wrap-up
    }
    return res;
  }

  function buildChecklist(opts){
    var groups = [];
    function add(title, items){ if(items.length) groups.push({t: title, items: items}); }

    add(T('Allgemein', 'General'), [
      T('Vererbungsplan durchlesen: Stimmt noch alles? Sind neue Geräte, Wallets, Börsen, Kontakte oder Aufbewahrungsorte dazugekommen?',
        'Read through the inheritance plan: is everything still correct? Any new devices, wallets, exchanges, contacts or storage locations?'),
      T('Der ausgedruckte Plan liegt am vorgesehenen Ort, ist vollständig und gut lesbar.',
        'The printed plan is in its intended place, complete and easy to read.'),
      T('Vertrauenspersonen wissen, wo der Plan liegt, und ihre Kontaktdaten sind aktuell.',
        'Trusted contacts know where the plan is and their contact details are up to date.'),
      T('Passen die vorgesehenen Erben und Vertrauenspersonen noch zu deiner Lebenssituation?',
        'Do the intended heirs and trusted contacts still fit your current situation?')
    ]);

    var hw = [];
    safe(function(){
      for(var d = 0; d < state.devices.length; d++){
        var dv = state.devices[d], lbl = deviceLabel(d) || ('Hardware-Wallet ' + (d + 1));
        hw.push(T(lbl + ': einschalten und prüfen, ob es funktioniert (PIN-Test).', lbl + ': power on and check that it works (PIN test).'));
        hw.push(T(lbl + ': Firmware-Stand prüfen. Updates nur über die offizielle Hersteller-Website.', lbl + ': check the firmware version. Only update via the manufacturer\'s official website.'));
        if(dv.smartcards > 0) hw.push(T(lbl + ': alle Smartcards sind vorhanden und die PIN funktioniert.', lbl + ': all smartcards are present and the PIN works.'));
      }
    });
    add(T('Hardware-Wallets', 'Hardware wallets'), hw);

    var seeds = [];
    safe(function(){
      for(var i = 0; i < state.seeds.length; i++){
        var s = state.seeds[i], nm = seedName(i);
        for(var b = 0; b < s.backups.length; b++){
          var bk = s.backups[b], tl = backupTypeLabel(bk.type);
          seeds.push(T(nm + ', Backup ' + (b + 1) + ' (' + tl + '): am Lagerort kontrollieren. Unbeschädigt, lesbar, trocken, unberührt.',
                       nm + ', backup ' + (b + 1) + ' (' + tl + '): check at its storage location. Undamaged, readable, dry, untouched.'));
          if(bk.bagNo) seeds.push(T(nm + ', Backup ' + (b + 1) + ': Siegelbeutel Nr. ' + bk.bagNo + ' unversehrt, Nummer stimmt.',
                                    nm + ', backup ' + (b + 1) + ': tamper-evident bag no. ' + bk.bagNo + ' intact, number matches.'));
        }
        if(s.passphrases > 0) seeds.push(T(nm + ': Aufbewahrung der Passphrase(n) prüfen. Getrennt vom Seed und noch auffindbar.',
                                           nm + ': check the storage of the passphrase(s). Kept apart from the seed and still findable.'));
      }
    });
    add(T('Seeds und Backups', 'Seeds and backups'), seeds);

    var sw = [];
    safe(function(){
      var hot = hotWalletList();
      for(var i = 0; i < hot.length; i++){
        sw.push(T(hot[i].label + ': App öffnen, Updates installieren und prüfen, dass die Wiederherstellung noch möglich ist.',
                  hot[i].label + ': open the app, install updates and confirm that recovery is still possible.'));
      }
    });
    add(T('Software-Wallets', 'Software wallets'), sw);

    var ex = [];
    safe(function(){
      for(var i = 0; i < state.ex.count; i++){
        var nm = exDisplayName(i) || ((isDe() ? 'Börse ' : 'Exchange ') + (i + 1));
        ex.push(T(nm + ': Login und Zwei-Faktor-Authentifizierung testen, Kontaktdaten aktuell, Wiederherstellungscodes vorhanden.',
                  nm + ': test login and two-factor authentication, contact details current, recovery codes available.'));
      }
    });
    add(T('Börsen und Kaufdienste', 'Exchanges and services'), ex);

    var other = [];
    safe(function(){
      if(state.pwm.use === true){
        var a = pwmDisplayName();
        other.push(T('Passwortmanager' + (a ? ' (' + a + ')' : '') + ': Zugang, Notfallzugriff und Wiederherstellungsschlüssel testen.',
                     'Password manager' + (a ? ' (' + a + ')' : '') + ': test access, emergency access and recovery key.'));
      }
    });
    safe(function(){
      for(var i = 0; i < state.multisigs.length; i++){
        var ms = state.multisigs[i], nm = ms.name || ('Multisig ' + (i + 1));
        other.push(T(nm + ' (' + ms.m + ' von ' + ms.n + '): Descriptor-Backup vorhanden und lesbar.', nm + ' (' + ms.m + ' of ' + ms.n + '): descriptor backup present and readable.'));
        other.push(T(nm + ': alle Schlüssel sind noch auffindbar, externe Cosigner sind erreichbar.', nm + ': all keys can still be found, external cosigners are reachable.'));
      }
    });
    safe(function(){
      if(anyLianaCompanion()){
        for(var i = 0; i < state.lianaWallets.length; i++){
          var lw = state.lianaWallets[i], nm = lw.name || ('Liana ' + (i + 1));
          other.push(T(nm + ': Recovery-Pfad und Timelock-Restlaufzeit prüfen, Wallet rechtzeitig vor Ablauf erneuern.',
                       nm + ': check the recovery path and remaining timelock, renew the wallet in time before it expires.'));
        }
      }
    });
    safe(function(){
      if(state.timelock && state.timelock.use === true){
        other.push(T('Timelock Recovery: Restlaufzeit prüfen und das Guthaben rechtzeitig erneuern, damit der Timelock nicht unbemerkt ausläuft.',
                     'Timelock recovery: check the remaining time and refresh the funds in time so the timelock does not expire unnoticed.'));
      }
    });
    safe(function(){
      if(state.dig && state.dig.use === true){
        other.push(T('Digitale Kopie des Plans: Datei öffnen, Passwort bzw. Entschlüsselung testen, Speicherort noch vorhanden.',
                     'Digital copy of the plan: open the file, test the password/decryption, storage location still available.'));
      }
    });
    add(T('Weitere Bausteine', 'Other components'), other);

    add(T('Abschluss', 'Wrap-up'), [
      T('Bei Änderungen: neuen Plan mit dieser App erstellen und alte Ausdrucke sicher vernichten.', 'If anything changed: create a new plan with this app and securely destroy old printouts.'),
      T('Check im Jahresprotokoll eintragen und nächsten Termin bestätigen.', 'Log the check in the yearly record and confirm the next date.')
    ]);

    // Stable IDs from the text: ticks are kept even when the plan changes
    var seen = {};
    var out = groups.map(function(g){
      return {t: g.t, items: g.items.map(function(text){
        var h = 5381; for(var c = 0; c < text.length; c++) h = ((h * 33) ^ text.charCodeAt(c)) >>> 0;
        var id = 'c' + h.toString(36); while(seen[id]) id += 'x'; seen[id] = 1;
        return {id: id, t: text};
      })};
    });
    return applyCustom(out, !!(opts && opts.includeRemoved));
  }
  function countItems(groups){ var n = 0; groups.forEach(function(g){ n += g.items.length; }); return n; }

  /* ---------- Calendar file (.ics) ---------- */
  function icsEscape(s){ return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line){
    var out = [], rest = line;
    while(rest.length > 73){ out.push(rest.slice(0, 73)); rest = ' ' + rest.slice(73); }
    out.push(rest);
    return out.join('\r\n');
  }
  function icsStamp(d){ return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00'; }
  // Calendar entries are synced to the calendar provider (often a cloud account) and can be shared with other
  // people. They therefore contain NO plan details: no plan name, seed names, storage places or checklist items.
  // The checklist stays inside the app.
  function descriptionFor(){
    return T('Jährlicher Bitcoin-Check. Öffne die App „Bitcoin Inheritance Planner“ und arbeite die Checkliste ab.',
             'Yearly Bitcoin check. Open the "Bitcoin Inheritance Planner" app and work through the checklist.');
  }
  // Neutral title; with several plans only the plan number tells them apart (never the plan name)
  function calendarTitle(check){
    return T('Jährlicher Bitcoin-Check', 'Yearly Bitcoin check') + (check && check.planNo > 1 ? ' (' + T('Plan ', 'Plan ') + check.planNo + ')' : '');
  }
  // check = {date, time, planNo, planId}
  function buildIcs(check){
    var start = nextOccurrence(check.date, check.time);
    if(!start) return null;
    var end = new Date(start.getTime() + 45 * 60000), now = new Date();
    var utc = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
    var desc = descriptionFor();
    var title = calendarTitle(check);
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ClavaStack//Bitcoin Inheritance Planner//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:yearly-check-' + (check.planId || icsStamp(start).slice(4, 8)) + '@inheritance-planner.clavastack.com',
      'DTSTAMP:' + utc,
      'DTSTART:' + icsStamp(start),
      'DTEND:' + icsStamp(end),
      'RRULE:FREQ=YEARLY',
      'SUMMARY:' + icsEscape(title),
      'DESCRIPTION:' + icsEscape(desc),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P7D', 'DESCRIPTION:' + icsEscape(T('In einer Woche: Bitcoin-Jahrescheck', 'In one week: yearly Bitcoin check')), 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0S', 'DESCRIPTION:' + icsEscape(title), 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ];
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  /* ---------- Save/share a file ---------- */
  // Files for the share sheet live in their own cache folder (the only folder the FileProvider exposes).
  // The receiving app reads the file after the sheet closes, so it cannot be deleted right away. Instead the folder is
  // emptied before every new share, at app start, when the app locks, after "Delete all data" and when the app
  // comes back to the foreground more than a minute after the share.
  var SHARE_DIR = 'shared', sharedAt = 0;
  function cleanShared(){
    if(!NATIVE) return Promise.resolve();
    sharedAt = 0;
    try { return plug('Filesystem').rmdir({path: SHARE_DIR, directory: 'CACHE', recursive: true}).catch(function(){}); }
    catch(err){ return Promise.resolve(); }
  }
  function cleanSharedIfOld(){
    if(sharedAt && Date.now() - sharedAt > 60000) return cleanShared();
    return Promise.resolve();
  }
  function shareTextFile(text, fname, mime, dialogTitle){
    if(NATIVE){
      var fs = plug('Filesystem'), sh = plug('Share');
      return cleanShared().then(function(){
        return fs.writeFile({path: SHARE_DIR + '/' + fname, data: text, directory: 'CACHE', encoding: 'utf8', recursive: true});
      }).then(function(res){
        sharedAt = Date.now();
        return sh.share({title: dialogTitle || fname, url: res.uri, dialogTitle: dialogTitle || fname});
      });
    }
    var blob = new Blob([text], {type: mime});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    return Promise.resolve();
  }

  if(NATIVE && typeof window.triggerDownload === 'function'){
    // Save the plan file (.json): the system share sheet (Files, iCloud, mail ...) instead of a browser download
    window.triggerDownload = function(text, fname){
      shareTextFile(text, fname, 'application/json', T('Plan speichern', 'Save plan')).catch(function(err){
        if(err && /cancel/i.test(String(err.message || err))) return;
        toast(T('Speichern fehlgeschlagen', 'Save failed'), 'err');
      });
    };
  }

  /* ---------- Interface to the app shell (app-shell.js overrides these fields) ---------- */
  var host = {
    planName: function(){ return ''; },
    planId: function(){ return ''; },
    planNo: function(){ return 0; },
    onCheckSave: function(){ return Promise.resolve(); },   // Save the check data of the active plan
    onCheckRemove: function(){},                            // The yearly check of the active plan was turned off
    onCheckChanged: function(){},                           // Progress/completion changed
    customRef: null,                                        // Customizations of another plan (calendar path), otherwise null
    rebuild: null,                                          // Rebuild the checklist of another plan, otherwise null
    onEditReminder: null,                                   // Change date (open plan)
    onPdfDone: null,                                        // PDF print dialog was completed
    beforePrint: null                                       // Hint before the print dialog: Promise<boolean>
  };

  /* ---------- Printing: native system print dialog (save/share PDF) ---------- */
  // The system print dialog does not report "afterprint". So that the print mode of the graphic (diagram.js) does not get stuck
  // and the PDF is not distorted, we fire afterprint ourselves: on iOS after the dialog, on Android when returning to the app.
  var printPending = null;
  function finishPrint(){
    if(!printPending) return;
    var p = printPending; printPending = null;
    window.dispatchEvent(new Event('afterprint'));
    if(!p.diagram && typeof host.onPdfDone === 'function') host.onPdfDone();
  }
  if(NATIVE){
    var origPrint = window.print ? window.print.bind(window) : null;
    var platform = (typeof cap.getPlatform === 'function' && cap.getPlatform()) || '';
    window.print = function(){
      window.__pxPrintStart = Date.now();   // Proof that printing was really started
      var dv = document.getElementById('diagram-view'), diagram = !!(dv && !dv.hidden);
      // A stuck graphic print mode must not distort the PDF print
      if(!diagram && document.body.classList.contains('diagram-print')) window.dispatchEvent(new Event('afterprint'));
      var name = T('Bitcoin-Nachlassplan', 'Bitcoin inheritance plan');
      var start = function(){
        plug('NativePrint').print({name: name, landscape: diagram}).then(function(){
          printPending = {diagram: diagram};
          if(platform === 'ios') finishPrint();
        }).catch(function(){
          if(diagram) window.dispatchEvent(new Event('afterprint'));
          toast(T('Drucken ist auf diesem Gerät nicht verfügbar', 'Printing is not available on this device'), 'err');
          if(origPrint) origPrint();
        });
      };
      if(typeof host.beforePrint === 'function'){
        host.beforePrint().then(function(go){ if(go) start(); else if(diagram) window.dispatchEvent(new Event('afterprint')); });
      } else start();
    };
  }

  /* ---------- Check data of the active plan ---------- */
  var snap = null;   // {planName, date, time, groups, ticks, lastDone, history, created, lang}

  function isDue(s){
    if(!s || !s.date) return false;
    var d = parseDate(s.date); if(!d) return false;
    var md = normalizedMD(d), t = parseTime(s.time), now = new Date();
    if(now < occurrenceIn(d.getFullYear(), md, t)) return false;
    var due = occurrenceIn(now.getFullYear(), md, t);
    if(now < due) return false;
    if(s.lastDone && s.lastDone >= ymd(due)) return false;
    return true;
  }

  /* ---------- Reminder (local notifications) ---------- */
  // Schedules the next 5 yearly dates as individual notifications (more reliable than a repeat rule).
  // The ID is unique per plan: 100 + planNo * 10 + year. The app tops them up on every start.
  var NOTIF_COUNT = 5;
  function notifIds(no){ var a = []; for(var i = 0; i < 10; i++) a.push({id: 100 + no * 10 + i}); return a; }
  function cancelNotifications(no){
    if(!NATIVE) return Promise.resolve();
    return plug('LocalNotifications').cancel({notifications: notifIds(no)}).catch(function(){});
  }
  function scheduleNotification(ref, dateStr, timeStr, silent){
    var d = parseDate(dateStr), t = parseTime(timeStr), first = nextOccurrence(dateStr, timeStr);
    if(!d || !first) return Promise.reject(new Error('date'));
    var md = normalizedMD(d), ln = plug('LocalNotifications');
    var perm = silent ? ln.checkPermissions() : ln.requestPermissions();
    return perm.then(function(p){
      if(!p || p.display !== 'granted') throw new Error('denied');
      return cancelNotifications(ref.no);
    }).then(function(){
      var list = [];
      for(var i = 0; i < NOTIF_COUNT; i++){
        list.push({
          id: 100 + ref.no * 10 + i,
          title: T('Dein Bitcoin-Jahrescheck ist fällig', 'Your yearly Bitcoin check is due'),
          body: T('Öffne die App und arbeite deine Checkliste ab.', 'Open the app and work through your checklist.'),
          schedule: {at: occurrenceIn(first.getFullYear() + i, md, t), allowWhileIdle: true},
          extra: {planId: ref.id}
        });
      }
      return ln.schedule({notifications: list});
    });
  }

  function setStatus(msg, bad, calBtn){
    var el = $('px-rem-status');
    if(!el) return;
    el.className = 'px-status ' + (bad ? 'px-status-bad' : 'px-status-ok'); el.style.display = 'block';
    el.textContent = msg;
    // Direct feedback: scroll to the middle of the screen and flash briefly
    try { el.scrollIntoView({behavior: 'smooth', block: 'center'}); } catch(err){}
    void el.offsetWidth; el.classList.add('px-flash');
    if(bad) toast(msg, 'err');
    if(calBtn){
      var b = document.createElement('button');
      b.className = 'btn btn-primary px-cal-btn'; b.textContent = T('Jetzt in den Handy-Kalender eintragen', 'Add to your phone calendar now');
      b.onclick = function(){ exportIcs(); };
      el.appendChild(b);
    }
  }

  function activate(){
    var r = rem(), groups = buildChecklist();
    if(!parseDate(r.date)){ setStatus(T('Bitte wähle ein Datum.', 'Please choose a date.'), true); return; }
    var next = nextOccurrence(r.date, r.time);
    var actBtn = document.querySelector('.px-actions .btn[onclick="PX.activate()"]'), actLabel = actBtn ? actBtn.textContent : '';
    if(actBtn){ actBtn.disabled = true; actBtn.textContent = T('Wird gesetzt ...', 'Setting ...'); }
    var snapshot = {
      planName: host.planName(), created: ymd(new Date()), date: r.date, time: r.time, groups: groups,
      ticks: {}, lastDone: snap ? snap.lastDone : null, history: snap && snap.history ? snap.history : [], lang: isDe() ? 'de' : 'en'
    };
    scheduleNotification({id: host.planId(), no: host.planNo()}, r.date, r.time, false).then(function(){
      snap = snapshot;
      return host.onCheckSave(snapshot);
    }).then(function(){
      if(actBtn){ actBtn.disabled = false; actBtn.textContent = '\u2713 ' + T('Erinnerung aktiv', 'Reminder active'); actBtn.classList.add('px-done-btn'); }
      toast('\u2713 ' + T('Erinnerung gesetzt: ', 'Reminder set: ') + fmtLong(next));
      setStatus(T('Erinnerung gesetzt. Nächster Termin: ', 'Reminder set. Next date: ') + fmtLong(next) + '. ' +
                T('Tippe auf „In Handy-Kalender eintragen“, um ihn auch in deinen Kalender zu übernehmen.', 'Tap "Add to phone calendar" to also put it in your calendar.'));
    }).catch(function(err){
      if(actBtn){ actBtn.disabled = false; actBtn.textContent = actLabel; }
      if(err && err.message === 'denied') setStatus(T('Benachrichtigungen sind nicht erlaubt. Aktiviere sie in den Einstellungen deines Geräts oder nutze den Kalendereintrag.', 'Notifications are not allowed. Enable them in your device settings or use the calendar entry.'), true);
      else setStatus(T('Die Erinnerung konnte nicht gesetzt werden. Nutze alternativ den Kalendereintrag.', 'The reminder could not be set. Use the calendar entry instead.'), true);
    });
  }

  function removeCheck(){
    if(!snap) return Promise.resolve();
    snap = null;
    return cancelNotifications(host.planNo()).then(function(){ return host.onCheckRemove(); });
  }

  // Share a calendar file: check = {groups, date, time, planName, planId}
  function shareIcs(check){
    var ics = buildIcs(check);
    if(!ics){ setStatus(T('Bitte wähle ein Datum.', 'Please choose a date.'), true); return Promise.resolve(); }
    return shareTextFile(ics, 'bitcoin-jahrescheck.ics', 'text/calendar', T('Kalendereintrag', 'Calendar entry')).then(function(){
      if(!NATIVE) setStatus(T('Kalenderdatei heruntergeladen. Öffne sie, um den jährlichen Termin in deinen Kalender zu übernehmen.', 'Calendar file downloaded. Open it to add the yearly event to your calendar.'));
    }).catch(function(err){
      if(err && /cancel/i.test(String(err.message || err))) return;
      setStatus(T('Die Kalenderdatei konnte nicht erstellt werden.', 'The calendar file could not be created.'), true);
    });
  }
  // Straight into the phone calendar: opens the calendar app with a ready-made, yearly repeating event
  function addToCalendar(check){
    var start = nextOccurrence(check.date, check.time);
    if(!start){ setStatus(T('Bitte wähle ein Datum.', 'Please choose a date.'), true); return Promise.resolve(); }
    if(!NATIVE) return shareIcs(check);
    var title = calendarTitle(check);
    return plug('NativeCalendar').addEvent({
      title: title, notes: descriptionFor(), start: start.getTime(), end: start.getTime() + 45 * 60000, rrule: 'FREQ=YEARLY'
    }).catch(function(){
      toast(T('Kalender nicht erreichbar, ich gebe dir stattdessen eine Kalenderdatei.', 'Calendar not reachable, giving you a calendar file instead.'), 'err');
      return shareIcs(check);
    });
  }
  function exportIcs(){
    var r = rem();
    return addToCalendar({date: r.date, time: r.time, planNo: host.planNo(), planId: host.planId()});
  }
  function exportIcsFile(){
    var r = rem();
    return shareIcs({date: r.date, time: r.time, planNo: host.planNo(), planId: host.planId()});
  }

  /* ---------- Wizard screen: yearly check ---------- */
  function renderReminder(){
    var r = rem(), on = r.on === true, groups = buildChecklist(), total = countItems(groups);
    var h = '<div class="section-card"><div class="section-card-body">';
    h += '<div class="wizard-question">' + e(T('Dein jährlicher Check', 'Your yearly check')) + '</div>';
    h += '<p class="wizard-hint">' + e(T(
      'Ein Bitcoin-Setup hilft den Erben nur, wenn es nach Jahren noch stimmt. Lege einen festen Termin fest, an dem du einmal im Jahr prüfst, ob alles noch da ist und funktioniert. Du bekommst dazu eine Checkliste passend zu deinem Plan.',
      'A Bitcoin setup only helps your heirs if it is still correct years later. Pick a fixed date once a year to check that everything is still in place and working. You get a checklist tailored to your plan.')) + '</p>';
    h += '<div class="wizard-choice-group">';
    h += '<button class="wizard-choice-btn ' + (on ? 'selected' : '') + '" onclick="PX.setOn(true)">' + e(T('Ja, jährlich erinnern', 'Yes, remind me yearly')) + '</button>';
    h += '<button class="wizard-choice-btn ' + (r.on === false ? 'selected' : '') + '" onclick="PX.setOn(false)">' + e(T('Nein, später', 'No, maybe later')) + '</button>';
    h += '</div>';
    if(on){
      h += '<div class="px-card">';
      h += '<div class="px-row"><label class="px-field"><span>' + e(T('Erster Termin', 'First date')) + '</span>' +
           '<input class="px-input" type="date" value="' + e(r.date) + '" oninput="PX.setDate(this.value)"></label>';
      h += '<label class="px-field"><span>' + e(T('Uhrzeit', 'Time')) + '</span>' +
           '<input class="px-input" type="time" value="' + e(r.time) + '" oninput="PX.setTime(this.value)"></label></div>';
      h += '<p class="mini-note">' + e(T('Der Termin wiederholt sich jedes Jahr.', 'The date repeats every year.')) + '</p>';
      h += '<div class="px-actions">';
      if(NATIVE) h += '<button class="btn btn-primary" onclick="PX.activate()">' + e(snap ? T('Termin aktualisieren', 'Update reminder') : T('Erinnerung aktivieren', 'Activate reminder')) + '</button>';
      h += '<button class="btn ' + (NATIVE ? 'btn-primary' : 'btn-primary') + '" onclick="PX.exportIcs()">' + e(NATIVE ? T('In Handy-Kalender eintragen', 'Add to phone calendar') : T('Kalenderdatei (.ics) laden', 'Download calendar file (.ics)')) + '</button>';
      if(NATIVE) h += '<button class="btn btn-ghost" onclick="PX.exportIcsFile()">' + e(T('Als .ics-Datei teilen', 'Share as .ics file')) + '</button>';
      h += '<button class="btn btn-ghost" onclick="PX.openCheck()">' + e(T('Checkliste ansehen', 'View checklist')) + '</button>';
      h += '</div>';
      var active = snap && nextOccurrence(snap.date, snap.time);
      h += '<div id="px-rem-status" class="px-status px-status-ok" style="display:' + (active ? 'block' : 'none') + '">' +
           (active ? e(T('Aktiv. Nächster Termin: ', 'Active. Next date: ') + fmtLong(active)) : '') + '</div>';
      h += '<p class="mini-note">' + e(NATIVE
        ? T('Die Erinnerung läuft lokal auf diesem Gerät. Es werden keine Daten an Server gesendet. Die Benachrichtigung enthält keine Details zu deinem Plan.', 'The reminder runs locally on this device. No data is sent to any server. The notification contains no details about your plan.')
        : T('Die Kalenderdatei enthält keine Plandetails und erinnert dich eine Woche vorher und am Tag selbst. Mit der Mobile-App erinnert dich dein Handy direkt.', 'The calendar file contains no plan details and reminds you a week before and on the day. With the mobile app your phone reminds you directly.')) + '</p>';
      h += '</div>';
      h += '<details class="px-preview"><summary>' + e(T('Vorschau: deine Checkliste (', 'Preview: your checklist (') + total + T(' Punkte)', ' items)')) + '</summary>';
      groups.forEach(function(g){
        h += '<div class="px-pgroup"><strong>' + e(g.t) + '</strong><ul>';
        g.items.forEach(function(it){ h += '<li>' + e(it.t) + '</li>'; });
        h += '</ul></div>';
      });
      h += '</details>';
      h += '<p class="mini-note">' + e(T('Mit "Checkliste ansehen" kannst du Punkte entfernen oder eigene hinzufügen. Die Checkliste wird außerdem als eigene Seite mit Jahresprotokoll an dein PDF angehängt.', 'With "View checklist" you can remove items or add your own. The checklist is also added to your PDF as its own page with a yearly log.')) + '</p>';
    }
    h += nav();
    h += '</div></div>';
    return h;
  }

  /* ---------- Checklist view (overlay) ---------- */
  var view = null;   // {groups, ticks, date, time, lastDone, persisted, planName}

  function currentModel(){
    if(snap && snap.groups) return Promise.resolve({groups: snap.groups, ticks: snap.ticks || {}, date: snap.date, time: snap.time, lastDone: snap.lastDone, persisted: true, planName: snap.planName || ''});
    var r = rem();
    return Promise.resolve({groups: buildChecklist(), ticks: {}, date: r.date, time: r.time, lastDone: null, persisted: false, planName: host.planName()});
  }

  function openCheck(){
    currentModel().then(function(m){ view = m; drawCheck(); });
  }
  function closeCheck(){
    var o = $('px-check'); if(o && o.parentNode) o.parentNode.removeChild(o);
    document.documentElement.classList.remove('px-lock');
    view = null;
  }
  function progress(){
    var done = 0, total = 0;
    view.groups.forEach(function(g){ g.items.forEach(function(it){ total++; if(view.ticks[it.id]) done++; }); });
    return {done: done, total: total};
  }
  function persistView(){
    if(!snap || !view || !view.persisted) return;
    snap.ticks = view.ticks; snap.lastDone = view.lastDone;
    host.onCheckSave(snap);
  }
  function drawCheck(){
    var o = $('px-check');
    if(!o){ o = document.createElement('div'); o.id = 'px-check'; document.body.appendChild(o); }
    document.documentElement.classList.add('px-lock');
    var next = nextOccurrence(view.date, view.time), p = progress();
    var due = view.persisted && isDue(snap), edit = !!view.edit;
    var h = '<div class="px-check-inner">';
    h += '<div class="px-check-head"><div><div class="px-check-title">' + e(T('Jahrescheck', 'Yearly check')) + '</div>';
    h += '<div class="px-check-sub">' + e((view.planName ? view.planName + ' · ' : '') + (next ? T('Nächster Termin: ', 'Next date: ') + fmtLong(next) : '')) +
         (view.lastDone ? e(' · ' + T('zuletzt erledigt: ', 'last completed: ') + view.lastDone) : '') + '</div></div>';
    h += '<div class="px-head-btns"><button class="btn ' + (edit ? 'btn-primary' : 'btn-ghost') + ' px-edit-toggle" onclick="PX.toggleEdit()">' + e(edit ? T('Fertig', 'Done') : T('Anpassen', 'Edit')) + '</button>' +
         '<button class="btn btn-ghost px-close" onclick="PX.closeCheck()" aria-label="' + e(T('Schließen', 'Close')) + '">&#10005;</button></div></div>';
    if(due && !edit) h += '<div class="px-due">' + e(T('Dein Jahrescheck ist fällig. Nimm dir etwa 30 bis 45 Minuten Zeit.', 'Your yearly check is due. Set aside about 30 to 45 minutes.')) + '</div>';
    if(!view.persisted && !edit) h += '<div class="px-due px-due-info">' + e(T('Vorschau. In der Mobile-App wird die Checkliste auf dem Gerät gespeichert, sobald du die Erinnerung aktivierst.', 'Preview. In the mobile app the checklist is stored on the device once you activate the reminder.')) + '</div>';
    if(edit) h += '<div class="px-due px-due-info">' + e(T('Entferne Punkte, die für dich nicht passen, oder füge eigene hinzu. Die Liste kommt weiter aus deinem Plan, deine Änderungen werden dazu gemerkt und erscheinen auch im PDF.', 'Remove items that do not fit you, or add your own. The list still comes from your plan; your changes are remembered and also appear in the PDF.')) + '</div>';
    if(!edit){
      h += '<div class="px-bar"><div class="px-bar-fill" style="width:' + (p.total ? Math.round(p.done / p.total * 100) : 0) + '%"></div></div>';
      h += '<div class="px-bar-label">' + p.done + ' / ' + p.total + '</div>';
    }
    view.groups.forEach(function(g){
      h += '<div class="px-group"><div class="px-group-title">' + e(g.t) + '</div>';
      g.items.forEach(function(it){
        if(edit){
          h += '<div class="px-item px-editrow"><span class="px-txt">' + e(it.t) + '</span>' +
               '<button class="px-del" data-id="' + e(it.id) + '" onclick="PX.removeItem(this.dataset.id)" aria-label="' + e(T('Entfernen', 'Remove')) + '">&#10005;</button></div>';
        } else {
          h += '<label class="px-item' + (view.ticks[it.id] ? ' px-done' : '') + '"><input type="checkbox" data-id="' + e(it.id) + '" ' + (view.ticks[it.id] ? 'checked' : '') +
               ' onchange="PX.tick(this.dataset.id,this.checked)"><span class="px-box"></span><span class="px-txt">' + e(it.t) + '</span></label>';
        }
      });
      h += '</div>';
    });
    if(edit){
      h += '<div class="px-group"><div class="px-group-title">' + e(T('Eigenen Punkt hinzufügen', 'Add your own item')) + '</div>' +
           '<div class="px-add"><input id="px-add-input" class="px-input" type="text" maxlength="140" placeholder="' + e(T('z. B. Tresor-Schlüssel prüfen', 'e.g. check the safe key')) + '" onkeydown="if(event.key===\'Enter\'){PX.addItem();}">' +
           '<button class="btn btn-primary" onclick="PX.addItem()">' + e(T('Hinzufügen', 'Add')) + '</button></div></div>';
      var gone = [];
      buildChecklist({includeRemoved: true}).forEach(function(g){ g.items.forEach(function(it){ if(it.removed) gone.push(it); }); });
      if(gone.length){
        h += '<details class="px-preview"><summary>' + e(T('Entfernte Punkte (', 'Removed items (') + gone.length + ')') + '</summary>';
        gone.forEach(function(it){
          h += '<div class="px-item px-editrow"><span class="px-txt">' + e(it.t) + '</span>' +
               '<button class="btn btn-ghost btn-sm" data-id="' + e(it.id) + '" onclick="PX.restoreItem(this.dataset.id)">' + e(T('Zurück', 'Restore')) + '</button></div>';
        });
        h += '</details>';
      }
    } else {
      h += '<div class="px-actions px-final">';
      h += '<button class="btn btn-primary" onclick="PX.finish()">' + e(T('Check abschließen', 'Complete check')) + '</button>';
      h += '<button class="btn btn-ghost" onclick="PX.editReminder()">' + e(T('Termin ändern', 'Change date')) + '</button>';
      h += '</div>';
    }
    h += '</div>';
    var keep = o.scrollTop;
    o.innerHTML = h; o.scrollTop = keep;
  }

  // Apply the change, rebuild the list and save
  function mutate(fn){
    if(!view) return;
    var c = customData(); fn(c);
    var g = (typeof host.rebuild === 'function' && host.rebuild()) || buildChecklist();
    view.groups = g;
    if(snap){ snap.groups = g; host.onCheckSave(snap); }
    else if(typeof render === 'function') render();   // saves the plan (wizard redraws in the background)
    drawCheck();
  }
  function toggleEdit(){ if(!view) return; view.edit = !view.edit; drawCheck(); }
  function addItem(){
    var inp = $('px-add-input'), t = inp ? inp.value.trim() : '';
    if(!t) return;
    mutate(function(c){ c.add.push({id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t: t.slice(0, 140)}); });
    var again = $('px-add-input'); if(again) again.focus();
  }
  function removeItem(id){
    mutate(function(c){
      var i = -1; c.add.forEach(function(a, k){ if(a.id === id) i = k; });
      if(i >= 0) c.add.splice(i, 1);
      else if(c.removed.indexOf(id) < 0) c.removed.push(id);
      if(view && view.ticks) delete view.ticks[id];
    });
  }
  function restoreItem(id){
    mutate(function(c){ var i = c.removed.indexOf(id); if(i >= 0) c.removed.splice(i, 1); });
  }
  function tick(id, on){
    if(!view) return;
    view.ticks[id] = !!on; persistView();
    var p = progress();
    var fill = document.querySelector('#px-check .px-bar-fill'), lab = document.querySelector('#px-check .px-bar-label');
    if(fill) fill.style.width = (p.total ? Math.round(p.done / p.total * 100) : 0) + '%';
    if(lab) lab.textContent = p.done + ' / ' + p.total;
    var boxes = document.querySelectorAll('#px-check input[type="checkbox"]');
    for(var i = 0; i < boxes.length; i++){
      if(boxes[i].getAttribute('data-id') === id && boxes[i].parentNode) boxes[i].parentNode.classList.toggle('px-done', !!on);
    }
  }
  function finish(){
    var p = progress();
    if(p.done < p.total && !window.confirm(T('Es sind noch nicht alle Punkte abgehakt. Trotzdem abschließen?', 'Not all items are ticked yet. Complete anyway?'))) return;
    view.lastDone = ymd(new Date()); view.ticks = {};
    if(snap) snap.history = (snap.history || []).concat([view.lastDone]);
    persistView();
    toast(T('Jahrescheck abgeschlossen. Bis zum nächsten Mal!', 'Yearly check completed. See you next time!'));
    closeCheck();
    if(typeof host.onCheckChanged === 'function') host.onCheckChanged();
  }
  function editReminder(){
    closeCheck();
    if(typeof host.onEditReminder === 'function') host.onEditReminder();
    else if(typeof gotoScreen === 'function') gotoScreen('reminder');
  }

  /* ---------- First-consultation card ---------- */
  function consultCard(){
    var url = NATIVE ? BOOK_URL_APP : BOOK_URL;
    return '<div class="px-consult"><div class="px-consult-text"><strong>' + e(T('Kostenloses Erstgespräch', 'Free first consultation')) + '</strong>' +
      '<span>' + e(T('Im kostenlosen Erstgespräch gehen wir deinen Plan gemeinsam mit dir in dieser App durch und beantworten deine Fragen.',
                     'In the free first consultation we go through your plan together with you in this app and answer your questions.')) + '</span></div>' +
      '<a class="btn btn-primary" href="' + e(url) + '" target="_blank" rel="noopener">' + e(T('Erstgespräch buchen', 'Book consultation')) + '</a></div>';
  }

  function summaryExtras(){
    var r = rem(), h = '<div class="px-summary">';
    if(r.on === true){
      h += '<button class="btn btn-subtle" onclick="PX.openCheck()">' + e(T('Jahrescheck-Checkliste ansehen', 'View yearly check checklist')) + '</button>';
    } else {
      h += '<button class="btn btn-subtle" onclick="gotoScreen(\'reminder\')">' + e(T('Jährlichen Check einrichten', 'Set up yearly check')) + '</button>';
    }
    h += '</div>' + consultCard();
    return h;
  }

  /* ---------- PDF page: yearly checklist ---------- */
  function pdfChecklistHtml(){
    var groups = buildChecklist(), r = rem();
    var d = parseDate(r.date), when = (r.on === true && d) ? fmtDayMonth(d) : null;
    var h = '<h2 class="pdf-h2 pdf-notes-page">' + e(T('Jahres-Check', 'Yearly check')) + '</h2>';
    h += '<p class="pdf-text">' + e(T(
      'Einmal im Jahr wird geprüft, ob das Setup noch vollständig ist und funktioniert. Hake jeden Punkt ab, sobald du ihn kontrolliert hast.',
      'Once a year, check that the setup is still complete and working. Tick each item once you have verified it.')) + '</p>';
    if(when) h += '<p class="pdf-text"><strong>' + e(T('Fester Termin: jedes Jahr am ', 'Fixed date: every year on ') + when) + '</strong></p>';
    groups.forEach(function(g){
      h += '<div class="px-pdf-group"><div class="px-pdf-gt">' + e(g.t) + '</div>';
      g.items.forEach(function(it){ h += '<div class="px-pdf-item"><span class="px-pdf-box"></span><span>' + e(it.t) + '</span></div>'; });
      h += '</div>';
    });
    h += '<div class="px-pdf-group"><div class="px-pdf-gt">' + e(T('Jahresprotokoll', 'Yearly record')) + '</div>';
    h += '<table class="px-pdf-log"><thead><tr><th>' + e(T('Datum', 'Date')) + '</th><th>' + e(T('Durchgeführt von', 'Done by')) + '</th><th>' + e(T('Auffälligkeiten / Änderungen', 'Findings / changes')) + '</th></tr></thead><tbody>';
    for(var i = 0; i < 6; i++) h += '<tr><td></td><td></td><td></td></tr>';
    h += '</tbody></table></div>';
    return h;
  }

  /* ---------- Hooking into the existing app ---------- */
  if(typeof renderIntro === 'function'){
    var origIntro = renderIntro;
    window.renderIntro = function(){ return origIntro() + consultCard(); };
  }

  window.PX = {
    NATIVE: NATIVE,
    host: host,
    plug: plug,
    store: store,
    T: T, e: e, ymd: ymd, parseDate: parseDate, parseTime: parseTime, pad: pad,
    nextOccurrence: nextOccurrence, occurrenceIn: occurrenceIn, normalizedMD: normalizedMD,
    fmtLong: fmtLong, fmtDayMonth: fmtDayMonth,
    isDue: isDue, countItems: countItems, buildChecklist: buildChecklist,
    shareTextFile: shareTextFile, shareIcs: shareIcs, addToCalendar: addToCalendar, exportIcsFile: exportIcsFile,
    scheduleFor: scheduleNotification, cancelFor: cancelNotifications,
    setCheck: function(s){ snap = s; },
    getCheck: function(){ return snap; },
    renderReminder: renderReminder,
    summaryExtras: summaryExtras,
    pdfChecklistHtml: pdfChecklistHtml,
    consultCard: consultCard,
    setOn: function(v){ rem().on = v; if(v === false && snap) removeCheck(); render(); },
    setDate: function(v){ rem().date = v; },
    setTime: function(v){ rem().time = v; },
    activate: activate,
    exportIcs: exportIcs,
    openCheck: openCheck,
    closeCheck: closeCheck,
    isCheckOpen: function(){ return !!view; },
    finishPrint: finishPrint,
    tick: tick,
    toggleEdit: toggleEdit,
    addItem: addItem,
    removeItem: removeItem,
    restoreItem: restoreItem,
    finish: finish,
    editReminder: editReminder,
    sanitizeState: sanitizeState,
    cleanShared: cleanShared,
    cleanSharedIfOld: cleanSharedIfOld,
    buildIcs: buildIcs
  };
})();
