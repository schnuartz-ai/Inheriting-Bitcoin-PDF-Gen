/* Bitcoin Inheritance Planner: app shell (loaded in the mobile app only)
 *  - First start: choose language, short overview
 *  - Bottom bar: Plans, Calendar, Settings (always visible)
 *  - Store several plans locally: view, edit, rename, duplicate, delete
 *  - Calendar with the yearly check dates of all plans
 *  - After a finished plan: offer the yearly check
 * Builds on planner-extras.js (window.PX) and the existing wizard (index.html).
 */
(function(){
  'use strict';

  /* ---------- Safety net: make errors visible, never a black screen ---------- */
  var isApp = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  var fatalLines = [];
  function tr(de, en){ return (typeof LANG !== 'undefined' && LANG === 'de') ? de : en; }
  function showFatal(msg, watchdog){
    if(!isApp) return;
    fatalLines.push(String(msg).slice(0, 220));
    var d = document.getElementById('px-fatal');
    if(!d){ d = document.createElement('div'); d.id = 'px-fatal'; document.body.appendChild(d); d.onclick = function(){ if(d.parentNode) d.parentNode.removeChild(d); fatalLines = []; }; }
    // Watchdog-only messages disappear on their own once the UI is up
    if(watchdog && fatalLines.length === 1) d.setAttribute('data-wd', '1'); else d.removeAttribute('data-wd');
    d.innerHTML = '<b>Fehler / Error</b><br>' + fatalLines.slice(-4).map(function(l){ return l.replace(/</g, '&lt;'); }).join('<br>');
    // Show the normal UI again so the app stays usable
    var app = document.getElementById('app-ui'), shell = document.getElementById('px-shell'), tabs = document.getElementById('px-tabbar');
    var shellOk = shell && shell.style.display !== 'none' && shell.children.length;
    if(app && !shellOk) app.style.display = '';
    if(shell && !shellOk) shell.style.display = 'none';
    if(tabs && !shellOk) tabs.style.display = 'none';
  }
  window.addEventListener('error', function(ev){ showFatal((ev.message || 'error') + ' (' + String(ev.filename || '').split('/').pop() + ':' + ev.lineno + ')'); });
  window.addEventListener('unhandledrejection', function(ev){
    var m = ev.reason && (ev.reason.message || ev.reason);
    if(m === 'locked') return;   // locked (password): expected behavior, not an error
    showFatal('Promise: ' + m);
  });
  if(isApp) setTimeout(function(){
    // While the user is still at the password prompt or the introduction, the shell is empty on purpose
    if(document.getElementById('px-pw') || document.getElementById('px-onb')) return;
    var shell = document.getElementById('px-shell');
    if(!shell || !shell.children.length) showFatal(tr('Die App-Oberfläche konnte nicht geladen werden. Bitte starte die App neu.', 'The app screen could not be loaded. Please restart the app.'), true);
  }, 4000);

  var PX = window.PX;
  if(!PX || !PX.NATIVE) return;

  var T = PX.T, e = PX.e, store = PX.store, plug = PX.plug;
  var BOOK_URL_APP = 'https://clavastack.com/security-talk?utm_source=inheritance-planner-app';
  var APP_VERSION = '__APP_VERSION__';   // replaced by scripts/build-www.mjs
  var KEY_SETTINGS = 'px.settings.v1', KEY_INDEX = 'px.plans.index', KEY_PLAN = 'px.plan.';

  var settings = {lang: null, onboarded: false, nextNo: 1};
  var index = [];          // Short info for all plans
  var active = null;       // the plan currently being edited in the wizard
  var external = null;     // plan whose checklist was opened from the calendar: {rec}
  var current = 'plans';   // 'plans' | 'calendar' | 'settings' | 'wizard'
  var cal = {y: new Date().getFullYear(), m: new Date().getMonth(), sel: null};
  var saveTimer = null;

  function $(id){ return document.getElementById(id); }
  function isDe(){ return typeof LANG !== 'undefined' && LANG === 'de'; }
  function loc(){ return isDe() ? 'de-DE' : 'en-GB'; }
  function toast(msg, kind){ if(typeof showToast === 'function') showToast(msg, kind); }
  function openLink(url){ window.open(url, '_blank'); }

  /* ---------- Storage ---------- */
  var KEY_PIN = 'px.pin.v1', KEY_FAIL = 'px.pin.fail';
  // The storage key keeps its old name so existing installations keep their encrypted data.
  // New passwords need at least 10 characters and 600,000 PBKDF2 rounds. Older 6-digit PINs still unlock.
  var PW_ITER = 600000, PW_MIN_LEGACY = 6, PW_MIN_NEW = 10, PW_MAX = 128, LOCK_AFTER_MS = 30000;
  // meta: {salt, iter, wrapped}. key: the data key, kept in memory only and only while unlocked.
  var pin = {meta: null, key: null};
  function pinOn(){ return !!pin.meta; }
  function isSecretKey(key){ return key === KEY_INDEX || key.indexOf(KEY_PLAN) === 0; }

  var te = new TextEncoder(), td = new TextDecoder();
  function b64e(buf){ var b = new Uint8Array(buf), s = ''; for(var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function b64d(str){ var s = atob(str), u = new Uint8Array(s.length); for(var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function parseEnc(text){
    if(typeof text !== 'string' || text.charAt(0) !== '{') return null;
    try { var o = JSON.parse(text); if(o && o.v === 1 && typeof o.iv === 'string' && typeof o.ct === 'string' && Object.keys(o).length === 3) return o; } catch(err){}
    return null;
  }
  function encBytes(key, bytes){
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({name: 'AES-GCM', iv: iv}, key, bytes).then(function(ct){ return {v: 1, iv: b64e(iv), ct: b64e(ct)}; });
  }
  function decBytes(key, o){ return crypto.subtle.decrypt({name: 'AES-GCM', iv: b64d(o.iv)}, key, b64d(o.ct)); }
  function deriveKek(pinStr, salt, iter){
    return crypto.subtle.importKey('raw', te.encode(pinStr), 'PBKDF2', false, ['deriveKey']).then(function(km){
      return crypto.subtle.deriveKey({name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256'}, km, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
    });
  }
  // The data key is never extractable in memory: it is created from random bytes, wrapped once with the password key
  // and imported as a non-extractable CryptoKey. Changing the password re-wraps the raw bytes (decrypted with the old password key).
  function importDek(raw){ return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
  function unwrapDek(wrapped, kek){ return decBytes(kek, wrapped).then(importDek); }

  function loadJson(key){
    return store.get(key).then(function(v){
      if(!v) return null;
      var o = parseEnc(v);
      if(o){
        if(!pin.key) return Promise.reject(new Error('locked'));
        return decBytes(pin.key, o).then(function(buf){ return JSON.parse(td.decode(buf)); });
      }
      try { return JSON.parse(v); } catch(err){ return null; }
    });
  }
  function saveJson(key, obj){
    var text = JSON.stringify(obj);
    if(pinOn() && isSecretKey(key)){
      if(!pin.key) return Promise.reject(new Error('locked'));   // never write plaintext while locked
      return encBytes(pin.key, te.encode(text)).then(function(o){ return store.set(key, JSON.stringify(o)); });
    }
    return store.set(key, text);
  }
  function saveSettings(){ return saveJson(KEY_SETTINGS, settings); }
  function saveIndex(){ return saveJson(KEY_INDEX, index); }
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function entryFrom(rec, total){
    var old = findEntry(rec.id) || {};
    return {
      id: rec.id, no: rec.no, name: rec.name, created: rec.created, updated: rec.updated,
      pos: rec.pos || 0, total: total != null ? total : (old.total || 0), finished: !!rec.finished,
      chk: rec.check ? {date: rec.check.date, time: rec.check.time, lastDone: rec.check.lastDone || null, history: rec.check.history || []} : null
    };
  }
  function findEntry(id){ for(var i = 0; i < index.length; i++) if(index[i].id === id) return index[i]; return null; }
  function upsertEntry(entry){
    for(var i = 0; i < index.length; i++) if(index[i].id === entry.id){ index[i] = entry; return; }
    index.push(entry);
  }
  function savePlanRec(rec, total){
    upsertEntry(entryFrom(rec, total));
    // One after the other: the plan itself first, the index afterwards. If the app dies in between, the plan exists
    // without index entry (harmless) instead of an index entry that points to nothing.
    return saveJson(KEY_PLAN + rec.id, rec).then(function(){ return saveIndex(); });
  }

  function createPlan(name){
    var rec = {id: uid(), no: settings.nextNo++, name: name, created: Date.now(), updated: Date.now(), pos: 0, finished: false, state: defaultState(), check: null};
    return Promise.all([saveSettings(), savePlanRec(rec, 0)]).then(function(){ return rec; });
  }

  /* ---------- Save the active plan ---------- */
  // Adapt the checklist to the current plan, ticks that were already set are kept
  function refreshCheck(){
    var chk = PX.getCheck();
    if(!chk || !active) return chk;
    chk.planName = active.name;
    var groups = PX.buildChecklist(), ids = {};
    groups.forEach(function(g){ g.items.forEach(function(it){ ids[it.id] = true; }); });
    var ticks = {};
    for(var k in (chk.ticks || {})) if(ids[k] && chk.ticks[k]) ticks[k] = true;
    chk.groups = groups; chk.ticks = ticks;
    return chk;
  }
  function signature(){ refreshCheck(); return JSON.stringify([state, pos, PX.getCheck()]); }
  function saveActive(){
    if(!active || current !== 'wizard') return Promise.resolve();
    if(pinOn() && !pin.key) return Promise.resolve();
    var total = screens().length - 1;
    if(pos >= total) active.finished = true;
    var sig = signature();
    if(sig === active.sig) return Promise.resolve();   // nothing changed: the 'last edited' date stays
    active.sig = sig;
    var chk = PX.getCheck();
    var rec = {id: active.id, no: active.no, name: active.name, created: active.created, updated: Date.now(), pos: pos, finished: active.finished, state: state, check: chk || null};
    return savePlanRec(rec, total);
  }
  function saveSoon(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){ saveActive().catch(saveFailed); }, 500);
  }
  // A failed save must be visible, never silent (shown at most every 10 seconds)
  var saveFailAt = 0;
  function saveFailed(err){
    if(err && err.message === 'locked') return;
    if(Date.now() - saveFailAt < 10000) return;
    saveFailAt = Date.now();
    toast(T('Speichern fehlgeschlagen. Deine letzten Änderungen sind eventuell nicht gesichert.', 'Saving failed. Your latest changes may not be stored.'), 'err');
  }

  /* ---------- Connection to planner-extras.js ---------- */
  PX.host.planName = function(){ return active ? active.name : ''; };
  PX.host.planId = function(){ return active ? active.id : ''; };
  PX.host.planNo = function(){ return active ? active.no : 0; };
  PX.host.onCheckSave = function(s){
    if(external){ external.rec.check = s; external.rec.updated = Date.now(); return savePlanRec(external.rec); }
    return saveActive();
  };
  PX.host.onCheckRemove = function(){ return saveActive(); };
  PX.host.onCheckChanged = function(){
    if(current !== 'wizard') renderShell(); else saveSoon();
  };
  PX.host.onEditReminder = function(){
    var id = external ? external.rec.id : (active && active.id);
    if(!id) return;
    openPlan(id, 'resume').then(function(){
      if(!state.reminder) state.reminder = {on: true, date: '', time: '10:00'};
      state.reminder.on = true;
      gotoScreen('reminder');
    });
  };
  PX.host.onPdfDone = function(){ setTimeout(askAfterPdf, 1500); };
  // Short hint before the system print dialog (can be turned off once)
  PX.host.beforePrint = function(){
    if(settings.printHintSeen) return Promise.resolve(true);
    var ios = (window.Capacitor && typeof window.Capacitor.getPlatform === 'function' && window.Capacitor.getPlatform() === 'ios');
    return ask({
      title: T('PDF speichern', 'Save as PDF'),
      text: ios
        ? T('Im nächsten Fenster tippst du oben rechts auf das Teilen-Symbol und wählst „In Dateien sichern“. Dort liegt dein PDF.', 'In the next window tap the Share icon at the top right and choose "Save to Files". That is where your PDF is stored.')
        : T('Im nächsten Fenster tippst du oben auf „Drucker auswählen“ und wählst „Als PDF speichern“. Dann tippst du unten auf den PDF-Button und wählst einen Ordner.', 'In the next window tap "Select printer" at the top and choose "Save as PDF". Then tap the PDF button at the bottom and pick a folder.'),
      ok: T('Weiter', 'Continue'), cancel: T('Abbrechen', 'Cancel'),
      remember: T('Nicht mehr anzeigen', 'Do not show again'),
      onRemember: function(){ settings.printHintSeen = true; saveSettings(); }
    }).then(function(ok){ return !!ok; });
  };
  // Edit the checklist of a plan that is not open in the wizard (calendar path)
  PX.host.customRef = function(){
    if(!external) return null;
    var st = external.rec.state = external.rec.state || {};
    if(!st.checkCustom) st.checkCustom = {add: [], removed: []};
    return st.checkCustom;
  };
  PX.host.rebuild = function(){
    if(!external) return null;
    var saved = state;
    state = Object.assign(defaultState(), PX.sanitizeState(external.rec.state));
    try { return PX.buildChecklist(); } finally { state = saved; }
  };

  var origRender = window.render;
  window.render = function(){ origRender.apply(this, arguments); if(current === 'wizard') saveSoon(); };

  /* ---------- Icons ---------- */
  function ico(name){
    var p = {
      plans: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/>',
      calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
      settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      dots: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
      left: '<path d="M15 5l-7 7 7 7"/>',
      right: '<path d="M9 5l7 7-7 7"/>',
      boxes: '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.8"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.8"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.8"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.8"/>',
      pen: '<path d="M4 20l1-4L16.5 4.5a2 2 0 013 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
      check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
    }[name] || '';
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }

  /* ---------- Dialogs ---------- */
  var modalOpen = false;
  function closeModal(){ var m = $('px-modal'); if(m && m.parentNode) m.parentNode.removeChild(m); modalOpen = false; }
  // ask({title, text, input:{value}, ok, cancel, danger}) -> Promise<string|true|null>
  function ask(o){
    return new Promise(function(resolve){
      closeModal(); modalOpen = true;
      var m = document.createElement('div'); m.id = 'px-modal';
      var h = '<div class="m-sheet" role="dialog" aria-modal="true"><div class="m-title">' + e(o.title) + '</div>';
      if(o.text) h += '<div class="m-text">' + e(o.text) + '</div>';
      if(o.input) h += '<input id="px-modal-input" class="px-input" type="text" maxlength="60" value="' + e(o.input.value || '') + '" placeholder="' + e(o.input.placeholder || '') + '">';
      if(o.textarea) h += '<textarea id="px-modal-input" class="px-input px-textarea" rows="6" spellcheck="false" placeholder="' + e(o.textarea.placeholder || '') + '"></textarea>' +
        (o.textarea.paste ? '<button class="btn btn-ghost btn-sm m-paste" id="px-modal-paste" type="button">' + e(o.textarea.paste) + '</button>' : '');
      if(o.check) h += '<label class="m-check"><input type="checkbox" id="px-modal-check"><span>' + e(o.check) + '</span></label>';
      if(o.remember) h += '<label class="m-check"><input type="checkbox" id="px-modal-remember"><span>' + e(o.remember) + '</span></label>';
      h += '<div class="m-actions">';
      if(o.cancel !== false) h += '<button class="btn btn-ghost" id="px-modal-cancel">' + e(o.cancel || T('Abbrechen', 'Cancel')) + '</button>';
      h += '<button class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" id="px-modal-ok">' + e(o.ok || 'OK') + '</button></div></div>';
      m.innerHTML = h;
      m.addEventListener('click', function(ev){ if(ev.target === m){ closeModal(); resolve(null); } });
      document.body.appendChild(m);
      var inp = $('px-modal-input'); if(inp){ inp.focus(); inp.select(); }
      var chk = $('px-modal-check');
      if(chk){ $('px-modal-ok').disabled = true; chk.onchange = function(){ $('px-modal-ok').disabled = !chk.checked; }; }
      var pst = $('px-modal-paste');
      if(pst) pst.onclick = function(){
        if(navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function(t){ if(inp) inp.value = t; })
          .catch(function(){ toast(T('Einfügen nicht möglich. Halte das Textfeld gedrückt und wähle Einfügen.', 'Cannot paste. Long-press the text field and choose Paste.'), 'err'); });
      };
      $('px-modal-ok').onclick = function(){
        var v = inp ? inp.value.trim() : true;
        var rm = $('px-modal-remember'); if(rm && rm.checked && typeof o.onRemember === 'function') o.onRemember();
        closeModal(); resolve(inp && !v ? null : v);
      };
      var c = $('px-modal-cancel'); if(c) c.onclick = function(){ closeModal(); resolve(null); };
      m._cancel = function(){ closeModal(); resolve(null); };
    });
  }
  // sheet(title, [{label, danger}]) -> Promise<index|null>
  function sheet(title, items){
    return new Promise(function(resolve){
      closeModal(); modalOpen = true;
      var m = document.createElement('div'); m.id = 'px-modal';
      var h = '<div class="m-sheet"><div class="m-title">' + e(title) + '</div><div class="m-list">';
      items.forEach(function(it, i){ h += '<button class="m-item' + (it.danger ? ' m-danger' : '') + '" data-i="' + i + '">' + e(it.label) + '</button>'; });
      h += '</div><button class="btn btn-ghost m-close" id="px-modal-cancel">' + e(T('Abbrechen', 'Cancel')) + '</button></div>';
      m.innerHTML = h;
      m.addEventListener('click', function(ev){
        var b = ev.target.closest ? ev.target.closest('.m-item') : null;
        if(b){ closeModal(); resolve(+b.getAttribute('data-i')); }
        else if(ev.target === m){ closeModal(); resolve(null); }
      });
      document.body.appendChild(m);
      $('px-modal-cancel').onclick = function(){ closeModal(); resolve(null); };
      m._cancel = function(){ closeModal(); resolve(null); };
    });
  }

  /* ---------- Switch views ---------- */
  function ensureShell(){
    if($('px-shell')) return;
    // Only visible once the first view is really built (otherwise the normal UI stays visible)
    var shell = document.createElement('div'); shell.id = 'px-shell'; shell.style.display = 'none';
    document.body.insertBefore(shell, document.body.firstChild);
    var bar = document.createElement('nav'); bar.id = 'px-tabbar'; bar.setAttribute('aria-label', 'Navigation'); bar.style.display = 'none';
    document.body.appendChild(bar);
    var tag = document.createElement('span'); tag.id = 'px-plan-tag';
    var hdr = document.querySelector('.app-header');
    if(hdr) hdr.appendChild(tag);
  }
  function drawTabbar(){
    var bar = $('px-tabbar'); if(!bar) return;
    var tabs = [['plans', T('Pläne', 'Plans')], ['calendar', T('Kalender', 'Calendar')], ['settings', T('Einstellungen', 'Settings')]];
    var cur = current === 'wizard' ? 'plans' : current;
    bar.innerHTML = tabs.map(function(t){
      return '<button type="button" class="tab' + (t[0] === cur ? ' on' : '') + '" onclick="PXS.tab(\'' + t[0] + '\')"' + (t[0] === cur ? ' aria-current="page"' : '') + '>' + ico(t[0]) + '<span>' + e(t[1]) + '</span></button>';
    }).join('');
  }
  function leaveWizard(){
    if(current === 'wizard') { clearTimeout(saveTimer); var p = saveActive(); active = null; PX.setCheck(null); return p; }
    return Promise.resolve();
  }
  function showView(v){
    var dv = $('diagram-view');
    if(dv && !dv.hidden && typeof closeDiagram === 'function') closeDiagram();
    current = v;
    var app = $('app-ui'), shell = $('px-shell');
    document.documentElement.classList.toggle('in-wizard', v === 'wizard');
    var bar = $('px-tabbar');
    if(v !== 'wizard') renderShell();   // build first, switch afterwards
    if(app) app.style.display = v === 'wizard' ? '' : 'none';
    if(shell) shell.style.display = v === 'wizard' ? 'none' : '';
    if(bar) bar.style.display = '';
    drawTabbar();
    window.scrollTo(0, 0);
  }
  function tab(v){
    if(PX.isCheckOpen()) PX.closeCheck();
    external = null;
    var p = current === 'wizard' ? leaveWizard() : Promise.resolve();
    p.then(function(){ if(v === 'calendar'){ var n = new Date(); cal.y = n.getFullYear(); cal.m = n.getMonth(); cal.sel = null; } showView(v); });
  }

  /* ---------- Open a plan ---------- */
  function openPlan(id, target){
    external = null;
    return loadJson(KEY_PLAN + id).then(function(rec){
      if(!rec){ toast(T('Plan nicht gefunden', 'Plan not found'), 'err'); return; }
      active = {id: rec.id, no: rec.no, name: rec.name, created: rec.created, finished: !!rec.finished};
      current = 'wizard';
      state = Object.assign(defaultState(), PX.sanitizeState(rec.state));   // plans saved by 1.0.0 may carry unsafe ids
      PX.setCheck(rec.check || null);
      var total = screens().length - 1;
      pos = target === 'summary' ? total : Math.max(0, Math.min(rec.pos || 0, total));
      var tag = $('px-plan-tag'); if(tag) tag.textContent = rec.name;
      showView('wizard');
      render();
      active.sig = signature();
    });
  }

  function newPlan(){
    ask({title: T('Neuer Plan', 'New plan'), text: T('Wie soll dein Plan heißen? Zum Beispiel "Mein Bitcoin-Setup".', 'What should your plan be called? For example "My Bitcoin setup".'),
         input: {value: T('Mein Plan', 'My plan')}, ok: T('Erstellen', 'Create')}).then(function(name){
      if(!name) return;
      createPlan(name).then(function(rec){ openPlan(rec.id, 'resume'); });
    });
  }
  function planMenu(id){
    var en = findEntry(id); if(!en) return;
    sheet(en.name, [{label: T('Umbenennen', 'Rename')}, {label: T('Duplizieren', 'Duplicate')}, {label: T('Backup sichern', 'Back up')}, {label: T('Löschen', 'Delete'), danger: true}]).then(function(i){
      if(i === 0) renamePlan(id); else if(i === 1) duplicatePlan(id); else if(i === 2) openPlan(id, 'summary').then(function(){ window.savePlan(); }); else if(i === 3) deletePlan(id);
    });
  }
  function renamePlan(id){
    var en = findEntry(id);
    ask({title: T('Plan umbenennen', 'Rename plan'), input: {value: en.name}, ok: T('Speichern', 'Save')}).then(function(name){
      if(!name) return;
      loadJson(KEY_PLAN + id).then(function(rec){
        rec.name = name; if(rec.check) rec.check.planName = name;
        return savePlanRec(rec);
      }).then(renderShell);
    });
  }
  function duplicatePlan(id){
    loadJson(KEY_PLAN + id).then(function(rec){
      var copy = JSON.parse(JSON.stringify(rec));
      copy.id = uid(); copy.no = settings.nextNo++; copy.name = rec.name + T(' (Kopie)', ' (copy)');
      copy.created = copy.updated = Date.now(); copy.check = null;
      if(copy.state && copy.state.reminder) copy.state.reminder.on = null;
      return saveSettings().then(function(){ return savePlanRec(copy, (findEntry(id) || {}).total); });
    }).then(function(){ toast(T('Plan dupliziert', 'Plan duplicated')); renderShell(); });
  }
  function deletePlan(id){
    var en = findEntry(id); if(!en) return;
    ask({title: T('Plan löschen?', 'Delete plan?'), text: T('"' + en.name + '" und sein Jahrescheck werden von diesem Gerät gelöscht. Das lässt sich nicht rückgängig machen.', '"' + en.name + '" and its yearly check will be deleted from this device. This cannot be undone.'),
         ok: T('Löschen', 'Delete'), danger: true}).then(function(ok){
      if(!ok) return;
      PX.cancelFor(en.no);
      index = index.filter(function(x){ return x.id !== id; });
      Promise.all([store.remove(KEY_PLAN + id), saveIndex()]).then(function(){ toast(T('Plan gelöscht', 'Plan deleted')); renderShell(); });
    });
  }

  /* ---------- Checklist of a plan, opened from the calendar ---------- */
  function openCheckOf(id){
    var p = current === 'wizard' ? leaveWizard() : Promise.resolve();
    p.then(function(){ return loadJson(KEY_PLAN + id); }).then(function(rec){
      if(!rec || !rec.check){ toast(T('Für diesen Plan ist kein Jahrescheck eingerichtet', 'No yearly check is set up for this plan'), 'err'); return; }
      if(current === 'wizard') showView('plans');
      external = {rec: rec};
      PX.setCheck(rec.check);
      PX.openCheck();
    });
  }
  function icsOf(id){
    loadJson(KEY_PLAN + id).then(function(rec){
      if(!rec || !rec.check) return;
      return PX.addToCalendar({date: rec.check.date, time: rec.check.time, planNo: rec.no, planId: rec.id});
    });
  }
  function setupCheckFor(id){
    openPlan(id, 'resume').then(function(){
      if(!state.reminder) state.reminder = {on: true, date: '', time: '10:00'};
      state.reminder.on = true;
      gotoScreen('reminder');
    });
  }

  /* ---------- After a finished plan: offer the yearly check ---------- */
  function askAfterPdf(){
    if(current !== 'wizard' || !active || PX.getCheck()) return;
    if(state.reminder && state.reminder.on === false) return;
    ask({
      title: T('Plan fertig. Jahrescheck einrichten?', 'Plan done. Set up the yearly check?'),
      text: T('Möchtest du einmal im Jahr erinnert werden, dein Backup zu prüfen? Du wählst den Tag, die App trägt ihn in den Kalender ein und gibt dir eine Checkliste.',
              'Would you like a yearly reminder to check your backup? You pick the day, the app adds it to the calendar and gives you a checklist.'),
      ok: T('Ja, Termin wählen', 'Yes, pick a date'), cancel: T('Später', 'Later')
    }).then(function(ok){
      if(!ok) return;
      if(!state.reminder) state.reminder = {on: true, date: '', time: '10:00'};
      state.reminder.on = true;
      gotoScreen('reminder');
    });
  }

  /* ---------- Display helpers ---------- */
  function fmtDate(ts){ try { return new Date(ts).toLocaleDateString(loc(), {day: 'numeric', month: 'short', year: 'numeric'}); } catch(err){ return ''; } }
  function daysUntil(d){ var n = new Date(); n.setHours(0, 0, 0, 0); var t = new Date(d); t.setHours(0, 0, 0, 0); return Math.round((t - n) / 86400000); }
  function whenText(days){
    if(days === 0) return T('heute', 'today');
    if(days === 1) return T('morgen', 'tomorrow');
    return T('in ' + days + ' Tagen', 'in ' + days + ' days');
  }

  /* ---------- View: Plans ---------- */
  function viewPlans(){
    var h = '<div class="sv"><div class="sv-head"><h1>' + e(T('Meine Pläne', 'My plans')) + '</h1>' +
            '<button class="btn btn-primary btn-sm" onclick="PXS.newPlan()">' + ico('plus') + e(T('Neuer Plan', 'New plan')) + '</button></div>';
    if(!index.length){
      h += '<div class="empty"><img class="empty-logo" src="assets/app-logo.svg" alt="">' +
           '<div class="empty-title">' + e(T('Noch kein Plan', 'No plan yet')) + '</div>' +
           '<p>' + e(T('Erstelle deinen ersten Vererbungsplan. Du gehst Schritt für Schritt durch kurze Boxen, am Ende bekommst du ein PDF.', 'Create your first inheritance plan. You go through short boxes step by step and get a PDF at the end.')) + '</p>' +
           '<button class="btn btn-primary" onclick="PXS.newPlan()">' + e(T('Ersten Plan erstellen', 'Create first plan')) + '</button></div>';
    } else {
      index.slice().sort(function(a, b){ return b.updated - a.updated; }).forEach(function(p){
        var pct = p.finished ? 100 : (p.total ? Math.round(p.pos / p.total * 100) : 0);
        var due = p.chk && PX.isDue({date: p.chk.date, time: p.chk.time, lastDone: p.chk.lastDone});
        var chkTxt = p.chk ? (due ? T('Jahrescheck fällig', 'Yearly check due') : T('Jahrescheck: ', 'Yearly check: ') + PX.fmtDayMonth(PX.nextOccurrence(p.chk.date, p.chk.time))) : T('Kein Jahrescheck', 'No yearly check');
        h += '<div class="pc"><div class="pc-top"><div class="pc-name">' + e(p.name) + '</div>' +
             '<button class="pc-menu" aria-label="' + e(T('Mehr', 'More')) + '" onclick="PXS.menu(\'' + p.id + '\')">' + ico('dots') + '</button></div>' +
             '<div class="pc-meta">' + e(T('Zuletzt bearbeitet: ', 'Last edited: ') + fmtDate(p.updated)) + '</div>' +
             '<div class="pc-bar"><div class="pc-fill" style="width:' + pct + '%"></div></div>' +
             '<div class="pc-meta">' + e(p.finished ? T('Plan fertig', 'Plan complete') : (p.total ? Lf('stepLabel', p.pos, p.total) : T('Noch nicht begonnen', 'Not started'))) + '</div>' +
             '<div class="pc-chip' + (due ? ' due' : (p.chk ? ' on' : '')) + '">' + ico('calendar') + '<span>' + e(chkTxt) + '</span></div>' +
             '<div class="pc-actions"><button class="btn btn-primary" onclick="PXS.open(\'' + p.id + '\')">' + e(p.finished ? T('Bearbeiten', 'Edit') : T('Weiter', 'Continue')) + '</button>' +
             '<button class="btn btn-ghost" onclick="PXS.view(\'' + p.id + '\')">' + e(T('Ansehen', 'View')) + '</button></div></div>';
      });
    }
    if(index.length && !pinOn()){
      h += '<div class="empty small"><div class="empty-title">' + e(T('Plan nicht geschützt', 'Plans not protected')) + '</div><p>' +
           e(T('Ohne Passwort liegen deine Pläne unverschlüsselt im App-Speicher dieses Geräts. Aktiviere den Passwort-Schutz in den Einstellungen.', 'Without a password your plans are stored unencrypted in the app storage of this device. Turn on password protection in Settings.')) + '</p>' +
           '<button class="btn btn-primary" onclick="PXS.tab(\'settings\')">' + e(T('Zu den Einstellungen', 'Open settings')) + '</button></div>';
    }
    h += '<button class="row-btn" onclick="PXS.restore()"><span>' + e(T('Plan aus Backup wiederherstellen', 'Restore a plan from a backup')) + '</span>' + ico('right') + '</button>';
    return h + PX.consultCard() + '</div>';
  }

  /* ---------- View: Calendar ---------- */
  function eventsOn(y, m, d){
    var out = [], key = y + '-' + PX.pad(m + 1) + '-' + PX.pad(d);
    index.forEach(function(p){
      if(!p.chk) return;
      var first = PX.parseDate(p.chk.date); if(!first) return;
      var md = PX.normalizedMD(first);
      if(y >= first.getFullYear() && md.month === m + 1 && md.day === d){
        var cur = PX.isDue({date: p.chk.date, time: p.chk.time, lastDone: p.chk.lastDone}) && y === new Date().getFullYear();
        out.push({p: p, kind: cur ? 'due' : 'plan'});
      }
      if((p.chk.history || []).indexOf(key) >= 0) out.push({p: p, kind: 'done'});
    });
    return out;
  }
  function viewCalendar(){
    var first = new Date(cal.y, cal.m, 1), offset = (first.getDay() + 6) % 7, days = new Date(cal.y, cal.m + 1, 0).getDate();
    var today = new Date(), tKey = PX.ymd(today);
    var wd = isDe() ? ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var title = first.toLocaleDateString(loc(), {month: 'long', year: 'numeric'});
    var h = '<div class="sv"><div class="sv-head"><h1>' + e(T('Kalender', 'Calendar')) + '</h1></div>';
    h += '<div class="cal"><div class="cal-nav"><button aria-label="' + e(T('Vorheriger Monat', 'Previous month')) + '" onclick="PXS.month(-1)">' + ico('left') + '</button>' +
         '<div class="cal-title">' + e(title) + '</div><button aria-label="' + e(T('Nächster Monat', 'Next month')) + '" onclick="PXS.month(1)">' + ico('right') + '</button></div>';
    h += '<div class="cal-grid">' + wd.map(function(w){ return '<div class="cal-wd">' + e(w) + '</div>'; }).join('');
    for(var i = 0; i < offset; i++) h += '<div class="cal-d empty"></div>';
    for(var d = 1; d <= days; d++){
      var key = cal.y + '-' + PX.pad(cal.m + 1) + '-' + PX.pad(d), ev = eventsOn(cal.y, cal.m, d);
      var cls = 'cal-d' + (key === tKey ? ' today' : '') + (key === cal.sel ? ' sel' : '');
      var dots = ev.map(function(x){ return '<i class="dot ' + x.kind + '"></i>'; }).join('');
      h += '<button class="' + cls + '" onclick="PXS.day(\'' + key + '\')"><span>' + d + '</span><div class="dots">' + dots + '</div></button>';
    }
    h += '</div></div>';

    var anyCheck = index.some(function(p){ return !!p.chk; });
    if(cal.sel){
      var sd = PX.parseDate(cal.sel), sev = eventsOn(sd.getFullYear(), sd.getMonth(), sd.getDate());
      h += '<div class="sec-title">' + e(sd.toLocaleDateString(loc(), {weekday: 'long', day: 'numeric', month: 'long'})) + '</div>';
      if(!sev.length) h += '<p class="muted">' + e(T('Kein Termin an diesem Tag.', 'No event on this day.')) + '</p>';
      sev.forEach(function(x){ h += eventRow(x.p, x.kind === 'done' ? T('Check erledigt', 'Check completed') : T('Jahrescheck', 'Yearly check')); });
    } else if(anyCheck){
      h += '<div class="sec-title">' + e(T('Nächste Termine', 'Upcoming')) + '</div>';
      index.filter(function(p){ return p.chk; }).map(function(p){ return {p: p, d: PX.nextOccurrence(p.chk.date, p.chk.time)}; })
        .sort(function(a, b){ return a.d - b.d; }).forEach(function(x){
          var due = PX.isDue({date: x.p.chk.date, time: x.p.chk.time, lastDone: x.p.chk.lastDone});
          h += eventRow(x.p, due ? T('Jetzt fällig', 'Due now') : PX.fmtLong(x.d) + ' · ' + whenText(daysUntil(x.d)));
        });
    }
    var without = index.filter(function(p){ return !p.chk; });
    if(!anyCheck){
      h += '<div class="empty small"><div class="empty-title">' + e(T('Noch kein Jahrescheck', 'No yearly check yet')) + '</div><p>' +
           e(T('Wähle einmal im Jahr einen Tag, an dem du prüfst, ob dein Bitcoin-Setup noch stimmt. Die App erinnert dich und legt ihn hier in den Kalender.', 'Pick one day a year to check that your Bitcoin setup is still correct. The app reminds you and shows it here in the calendar.')) + '</p></div>';
    }
    if(without.length){
      h += '<div class="sec-title">' + e(T('Jahrescheck einrichten', 'Set up yearly check')) + '</div>';
      without.forEach(function(p){
        h += '<button class="row-btn" onclick="PXS.setupCheck(\'' + p.id + '\')"><span>' + e(p.name) + '</span>' + ico('right') + '</button>';
      });
    }
    return h + '</div>';
  }
  function eventRow(p, sub){
    return '<div class="ev"><div class="ev-main"><div class="ev-name">' + e(p.name) + '</div><div class="ev-sub">' + e(sub) + '</div></div>' +
           '<div class="ev-actions"><button class="btn btn-primary btn-sm" onclick="PXS.check(\'' + p.id + '\')">' + e(T('Checkliste', 'Checklist')) + '</button>' +
           '<button class="btn btn-ghost btn-sm" onclick="PXS.ics(\'' + p.id + '\')">' + e(T('In Kalender eintragen', 'Add to calendar')) + '</button></div></div>';
  }

  /* ---------- View: Settings ---------- */
  function viewSettings(){
    var h = '<div class="sv"><div class="sv-head"><h1>' + e(T('Einstellungen', 'Settings')) + '</h1></div>';
    h += '<div class="sg"><div class="sg-title">' + e(T('Sprache', 'Language')) + '</div><div class="seg">' +
         '<button class="' + (isDe() ? 'on' : '') + '" onclick="PXS.lang(\'de\')">Deutsch</button><button class="' + (!isDe() ? 'on' : '') + '" onclick="PXS.lang(\'en\')">English</button></div></div>';
    h += '<div class="sg"><div class="sg-title">' + e(T('Jahrescheck', 'Yearly check')) + '</div>' +
         '<div class="sg-row"><span id="px-notif-state">' + e(T('Benachrichtigungen: wird geprüft ...', 'Notifications: checking ...')) + '</span>' +
         '<button id="px-notif-btn" class="btn btn-ghost btn-sm" onclick="PXS.notif()" style="display:none">' + e(T('Erlauben', 'Allow')) + '</button></div>' +
         '<p class="muted">' + e(T('Erinnerungen laufen lokal auf deinem Gerät und enthalten keine Details zu deinem Plan.', 'Reminders run locally on your device and contain no details about your plan.')) + '</p></div>';
    h += '<div class="sg"><div class="sg-title">' + e(T('Sicherheit', 'Security')) + '</div>' +
         '<div class="sg-row"><span>' + e(T('Passwort-Schutz: ', 'Password protection: ') + (pinOn() ? T('an', 'on') : T('aus', 'off'))) + '</span></div>' +
         '<p class="muted">' + e(T('Optional. Mit einem Passwort (mindestens 10 Zeichen) werden alle Pläne und Termine auf diesem Gerät verschlüsselt (AES-256), und die App sperrt sich, wenn sie 30 Sekunden im Hintergrund war. Mit „Passwort zurücksetzen“ legst du mit deinem alten Passwort ein neues fest. Ohne das alte Passwort gibt es keine Wiederherstellung, dann bleibt nur, alle Daten zu löschen. Schreibe das Passwort deshalb sicher auf.',
                                 'Optional. With a password (at least 10 characters) all plans and dates on this device are encrypted (AES-256), and the app locks after being in the background for 30 seconds. With "Reset password" you set a new one using your old password. Without the old password there is no recovery; the only way out is deleting all data. So write the password down safely.')) + '</p>' +
         (pinOn() ? '<div class="sg-btns"><button class="btn btn-primary" onclick="PXS.lock()">' + e(T('Jetzt sperren', 'Lock now')) + '</button><button class="btn btn-ghost" onclick="PXS.pwChange()">' + e(T('Passwort zurücksetzen', 'Reset password')) + '</button><button class="btn btn-danger-ghost" onclick="PXS.pwRemove()">' + e(T('Passwort entfernen', 'Remove password')) + '</button></div>'
                  : '<button class="btn btn-primary btn-wide" onclick="PXS.pwSet()">' + e(T('Passwort festlegen', 'Set a password')) + '</button>') + '</div>';
    h += '<div class="sg"><div class="sg-title">' + e(T('Hilfe', 'Help')) + '</div>' +
         '<button class="row-btn" onclick="PXS.intro()"><span>' + e(T('Einführung erneut ansehen', 'View the introduction again')) + '</span>' + ico('right') + '</button>' +
         '<button class="row-btn" onclick="PXS.link(\'' + BOOK_URL_APP + '\')"><span>' + e(T('Kostenloses Erstgespräch buchen', 'Book a free first consultation')) + '</span>' + ico('right') + '</button></div>';
    h += '<div class="sg"><div class="sg-title">' + e(T('Daten', 'Data')) + '</div>' +
         '<p class="muted">' + e(T('Deine Pläne und Termine liegen nur auf diesem Gerät, ohne Konto und ohne Cloud. Seeds, PINs und Passphrasen werden nie abgefragt.', 'Your plans and dates are stored only on this device, with no account and no cloud. Seeds, PINs and passphrases are never requested.')) + '</p>' +
         '<button class="btn btn-danger-ghost" onclick="PXS.wipe()">' + e(T('Alle Daten auf diesem Gerät löschen', 'Delete all data on this device')) + '</button></div>';
    h += '<div class="sg"><div class="sg-title">' + e(T('Über die App', 'About')) + '</div>' +
         '<p class="muted">Bitcoin Inheritance Planner ' + APP_VERSION + '<br>' + e(T('Entwickelt von ', 'Built by ')) + '<a href="#" onclick="PXS.link(\'https://clavastack.com\');return false;">ClavaStack</a> · ' +
         '<a href="#" onclick="PXS.link(\'https://github.com/Schnuartz/bitcoin-inheritance-planner\');return false;">' + e(T('Open Source', 'Open source')) + '</a></p></div></div>';
    return h;
  }
  function refreshNotifState(){
    var el = $('px-notif-state'); if(!el) return;
    plug('LocalNotifications').checkPermissions().then(function(p){
      var ok = p && p.display === 'granted';
      el.textContent = T('Benachrichtigungen: ', 'Notifications: ') + (ok ? T('erlaubt', 'allowed') : T('nicht erlaubt', 'not allowed'));
      var b = $('px-notif-btn'); if(b) b.style.display = ok ? 'none' : '';
    }).catch(function(){ el.textContent = ''; });
  }
  function wipe(){
    ask({title: T('Alle Daten löschen?', 'Delete all data?'), text: T('Alle Pläne, Termine und Erinnerungen werden von diesem Gerät entfernt. Das lässt sich nicht rückgängig machen.', 'All plans, dates and reminders will be removed from this device. This cannot be undone.'),
         ok: T('Alles löschen', 'Delete everything'), danger: true}).then(function(ok){
      if(!ok) return;
      wipeEverything().then(function(){ toast(T('Alle Daten gelöscht', 'All data deleted')); renderShell(); },
                            function(){ toast(T('Löschen fehlgeschlagen. Bitte versuche es erneut.', 'Deleting failed. Please try again.'), 'err'); });
    });
  }

  // Deletes all plans, dates and the password, even without access to the (encrypted) index
  function wipeEverything(){
    return plug('Preferences').keys().then(function(r){
      var ks = ((r && r.keys) || []).filter(function(k){ return k === KEY_INDEX || k === KEY_PIN || k === KEY_FAIL || k.indexOf(KEY_PLAN) === 0; });
      return Promise.all(ks.map(function(k){ return store.remove(k); }));
    }).then(function(){ return PX.cleanShared(); }).then(function(){
      var ln = plug('LocalNotifications');
      return ln.getPending().then(function(r){
        var list = ((r && r.notifications) || []).map(function(n){ return {id: n.id}; });
        return list.length ? ln.cancel({notifications: list}) : null;
      }).catch(function(){});
    }).then(function(){ index = []; pin.meta = null; pin.key = null; external = null; });
  }

  /* ---------- Password protection ---------- */
  var pendingOpen = null, bgAt = 0, promptOpen = false;

  // passwordPrompt({title, text, cancel, submit(password) -> Promise<error text|null>, extra:{label, onClick(finish)}}) -> Promise<string|null>
  function passwordPrompt(o){
    return new Promise(function(resolve){
      var old = $('px-pw'); if(old && old.parentNode) old.parentNode.removeChild(old);
      var el = document.createElement('div'); el.id = 'px-pw'; promptOpen = true;
      var busy = false, min = o.min || PW_MIN_LEGACY, max = o.max || PW_MAX;
      var h = '<div class="pw-inner"><img class="pw-logo" src="assets/app-logo.svg" alt="">' +
              '<div class="pw-title">' + e(o.title) + '</div><div class="pw-text">' + e(o.text || '') + '</div>' +
              '<label class="pw-field"><span>' + e(T('Passwort', 'Password')) + '</span>' +
              '<input class="pw-input" id="px-pw-input" type="password" autocomplete="' + (o.autocomplete || 'current-password') + '" maxlength="' + max + '">' +
              '<button class="pw-reveal" type="button" id="px-pw-reveal" aria-label="' + e(T('Passwort anzeigen', 'Show password')) + '">' + e(T('anzeigen', 'show')) + '</button></label>' +
              '<div class="pw-msg" id="px-pw-msg"></div>' +
              '<button class="btn btn-primary pw-ok" id="px-pw-ok" disabled>OK</button>' +
              (o.cancel ? '<button class="pw-link pw-cancel" id="px-pw-cancel">' + e(T('Abbrechen', 'Cancel')) + '</button>' : '') +
              (o.extra ? '<button class="pw-link" id="px-pw-extra">' + e(o.extra.label) + '</button>' : '') + '</div>';
      el.innerHTML = h;
      document.body.appendChild(el);
      var inp = $('px-pw-input'), msg = $('px-pw-msg'), ok = $('px-pw-ok');
      var reveal = $('px-pw-reveal'), extra = $('px-pw-extra'), cancel = $('px-pw-cancel');
      function close(){ if(el.parentNode) el.parentNode.removeChild(el); promptOpen = false; }
      function finish(v){ close(); resolve(v); }
      function setBusy(on){
        busy = on;
        inp.disabled = on;
        if(reveal) reveal.disabled = on;
        if(extra) extra.disabled = on;
        if(cancel) cancel.disabled = on;
      }
      function paint(text){ msg.textContent = text || ''; ok.disabled = busy || inp.value.length < min; }
      function submit(){
        if(busy || inp.value.length < min) return;
        var submitted = inp.value;
        setBusy(true);
        paint(T('Bitte warten ...', 'Please wait ...'));
        Promise.resolve(o.submit(submitted)).then(function(err){
          if(!err){ finish(submitted); return; }
          setBusy(false); inp.value = ''; paint(err); inp.focus();
        }, function(){ setBusy(false); inp.value = ''; paint(T('Das hat nicht geklappt.', 'That did not work.')); inp.focus(); });
      }
      el._cancel = o.cancel ? function(){ if(!busy) finish(null); } : null;
      inp.addEventListener('input', function(){ paint(''); });
      inp.addEventListener('keydown', function(ev){ if(ev.key === 'Enter') submit(); else if(ev.key === 'Escape' && o.cancel && !busy) finish(null); });
      ok.addEventListener('click', submit);
      if(reveal) reveal.addEventListener('click', function(){ if(busy) return; inp.type = inp.type === 'password' ? 'text' : 'password'; inp.focus(); });
      if(extra) extra.addEventListener('click', function(){ if(!busy) o.extra.onClick(finish); });
      if(cancel) cancel.addEventListener('click', function(){ if(!busy) finish(null); });
      el.addEventListener('mousedown', function(ev){ if(ev.target === el && o.cancel && !busy) finish(null); });
      paint('');
      setTimeout(function(){ inp.focus(); }, 30);
    });
  }

  function failInfo(){ return loadJson(KEY_FAIL).then(function(f){ return f || {n: 0, until: 0}; }); }
  // Checks the password and sets the data key on success. Returns null on success, otherwise the error text.
  function verifyPassword(password){
    return failInfo().then(function(f){
      var now = Date.now();
      if(f.until && f.until > now) return T('Zu viele Versuche. Bitte warte ', 'Too many attempts. Please wait ') + Math.ceil((f.until - now) / 1000) + T(' Sekunden.', ' seconds.');
      return deriveKek(password, b64d(pin.meta.salt), pin.meta.iter).then(function(kek){ return unwrapDek(pin.meta.wrapped, kek); }).then(function(dek){
        pin.key = dek;
        return store.remove(KEY_FAIL).then(function(){ return null; }, function(){ return null; });
      }, function(){
        var n = (f.n || 0) + 1, until = n >= 5 ? now + Math.min(15 * 60000, 30000 * Math.pow(2, n - 5)) : 0;
        return saveJson(KEY_FAIL, {n: n, until: until}).then(function(){
          return T('Falsches Passwort.', 'Wrong password.') + (until ? T(' Bitte warte ', ' Please wait ') + Math.ceil((until - now) / 1000) + T(' Sekunden.', ' seconds.') : '');
        });
      });
    });
  }

  function enableLock(password){
    var ids = index.map(function(p){ return p.id; }), salt = crypto.getRandomValues(new Uint8Array(16));
    return Promise.all(ids.map(function(id){ return loadJson(KEY_PLAN + id); })).then(function(recs){
      var raw = crypto.getRandomValues(new Uint8Array(32));
      return Promise.all([importDek(raw), deriveKek(password, salt, PW_ITER)]).then(function(r){
        var dek = r[0], kek = r[1];
        return encBytes(kek, raw).then(function(wrapped){
          var meta = {salt: b64e(salt), iter: PW_ITER, wrapped: wrapped};
          return store.setVerified(KEY_PIN, JSON.stringify(meta)).then(function(){
            pin.meta = meta; pin.key = dek;
            var jobs = [];
            recs.forEach(function(rec, i){ if(rec) jobs.push(saveJson(KEY_PLAN + ids[i], rec)); });
            jobs.push(saveIndex());
            return Promise.all(jobs);
          });
        });
      });
    });
  }
  function disableLock(){
    var ids = index.map(function(p){ return p.id; });
    return Promise.all(ids.map(function(id){ return loadJson(KEY_PLAN + id); })).then(function(recs){
      var saved = pin.meta; pin.meta = null;
      var jobs = [];
      recs.forEach(function(rec, i){ if(rec) jobs.push(saveJson(KEY_PLAN + ids[i], rec)); });
      jobs.push(saveIndex());
      return Promise.all(jobs).then(function(){ return store.remove(KEY_PIN); }).then(function(){ pin.key = null; }, function(err){ pin.meta = saved; throw err; });
    });
  }
  // The old password is needed to read the raw data key again (it is not kept extractable in memory).
  function changePassword(oldPassword, newPassword){
    var salt = crypto.getRandomValues(new Uint8Array(16));
    return Promise.all([deriveKek(oldPassword, b64d(pin.meta.salt), pin.meta.iter), deriveKek(newPassword, salt, PW_ITER)]).then(function(ks){
      return decBytes(ks[0], pin.meta.wrapped).then(function(raw){ return encBytes(ks[1], raw); }).then(function(wrapped){
        var meta = {salt: b64e(salt), iter: PW_ITER, wrapped: wrapped};
        return store.setVerified(KEY_PIN, JSON.stringify(meta)).then(function(){ pin.meta = meta; });
      });
    });
  }

  function askNewPassword(){
    return passwordPrompt({
      title: T('Neues Passwort festlegen', 'Set a new password'),
      text: T('Mindestens 10 Zeichen. Verwende Buchstaben, Zahlen und Sonderzeichen. Schreibe das Passwort sicher auf, es lässt sich nicht wiederherstellen.',
              'At least 10 characters. Use letters, numbers and special characters. Write the password down safely; it cannot be recovered.'),
      min: PW_MIN_NEW, max: PW_MAX, autocomplete: 'new-password', cancel: true,
      submit: function(){ return Promise.resolve(null); }
    }).then(function(p1){
      if(!p1) return null;
      return passwordPrompt({
        title: T('Passwort wiederholen', 'Repeat the password'), text: '', min: PW_MIN_NEW, max: PW_MAX,
        autocomplete: 'new-password', cancel: true,
        submit: function(p2){ return Promise.resolve(p2 === p1 ? null : T('Die Passwörter stimmen nicht überein.', 'The passwords do not match.')); }
      }).then(function(p2){ return p2 ? p1 : null; });
    });
  }
  function askCurrentPassword(title){
    return passwordPrompt({title: title, text: T('Gib dein aktuelles Passwort ein.', 'Enter your current password.'), cancel: true, submit: verifyPassword});
  }
  // Warning with mandatory checkbox: the password cannot be recovered.
  function passwordWarning(okLabel){
    return ask({
      title: T('Wichtig: Passwort sicher aufschreiben', 'Important: write your password down safely'),
      text: T('Das Passwort ist der Schlüssel zu deinen verschlüsselten Daten. Verlierst oder vergisst du es, ist die Verschlüsselung nicht mehr zu öffnen, und die Daten lassen sich nicht wiederherstellen. Auch wir können das nicht.\n\nSchreibe das Passwort deshalb sicher auf, zum Beispiel auf Papier an einem sicheren Ort oder in deinem Passwort-Manager, und bewahre es getrennt vom Handy auf.',
              'The password is the key to your encrypted data. If you lose or forget it, the encryption can no longer be opened and the data cannot be recovered. We cannot do it either.\n\nSo write the password down safely, for example on paper in a safe place or in your password manager, and keep it apart from your phone.'),
      check: T('Ich habe verstanden und schreibe das Passwort sicher auf.', 'I understand and will write the password down safely.'),
      ok: okLabel
    });
  }
  function pwSet(){
    passwordWarning(T('Weiter', 'Continue')).then(function(ok){
      if(!ok) return;
      askNewPassword().then(function(p){
        if(!p) return;
        toast(T('Verschlüssele ...', 'Encrypting ...'));
        return enableLock(p).then(function(){ toast(T('Passwort-Schutz ist an. Schreibe das Passwort sicher auf.', 'Password protection is on. Write the password down safely.')); renderShell(); },
                                 function(){ toast(T('Passwort konnte nicht gesetzt werden', 'Could not set the password'), 'err'); });
      });
    });
  }
  function pwChange(){
    askCurrentPassword(T('Passwort zurücksetzen', 'Reset password')).then(function(ok){
      if(!ok) return;
      return passwordWarning(T('Weiter', 'Continue')).then(function(acc){
        if(!acc) return;
        return askNewPassword().then(function(p){
          if(!p) return;
          return changePassword(ok, p).then(function(){ toast(T('Passwort zurückgesetzt. Schreibe das neue Passwort sicher auf.', 'Password reset. Write the new password down safely.')); },
                                       function(){ toast(T('Passwort konnte nicht geändert werden. Das alte Passwort gilt weiter.', 'Could not change the password. The old password still works.'), 'err'); });
        });
      });
    });
  }
  function pwRemove(){
    askCurrentPassword(T('Passwort entfernen', 'Remove password')).then(function(ok){
      if(!ok) return;
      return disableLock().then(function(){ toast(T('Passwort-Schutz ist aus', 'Password protection is off')); renderShell(); }, function(){ toast(T('Das hat nicht geklappt', 'That did not work'), 'err'); });
    });
  }

  function loadIndexAndShow(){
    return loadJson(KEY_INDEX).then(function(i){
      index = i || [];
      showView('plans');
      if(!settings.onboarded) showOnboarding();
      // Top up reminders so the next 5 years are always scheduled
      index.forEach(function(p){
        if(p.chk) PX.scheduleFor({id: p.id, no: p.no}, p.chk.date, p.chk.time, true).catch(function(){});
      });
    });
  }
  function afterUnlock(){
    return loadIndexAndShow().then(function(){
      if(pendingOpen){ var id = pendingOpen; pendingOpen = null; openCheckOf(id); }
    });
  }
  function unlockFlow(){
    return passwordPrompt({
      title: 'Bitcoin Inheritance Planner', text: T('Gib dein Passwort ein.', 'Enter your password.'), cancel: false, submit: verifyPassword,
      extra: {label: T('Passwort vergessen? Alle Daten löschen', 'Forgot your password? Delete all data'), onClick: function(finish){
        ask({title: T('Alle Daten löschen?', 'Delete all data?'), text: T('Ohne Passwort lassen sich die Daten nicht entschlüsseln. Alle Pläne und Termine werden gelöscht, danach startet die App leer.', 'Without the password the data cannot be decrypted. All plans and dates will be deleted and the app starts empty.'),
             ok: T('Alles löschen', 'Delete everything'), danger: true}).then(function(ok){
          if(ok) wipeEverything().then(function(){ finish('wiped'); }, function(){ toast(T('Löschen fehlgeschlagen. Bitte versuche es erneut.', 'Deleting failed. Please try again.'), 'err'); });
        });
      }}
    }).then(function(){ return afterUnlock(); });
  }
  // Locks the app: data and display are removed from memory, then the password prompt follows.
  function lockNow(){
    if(!pinOn() || !pin.key || promptOpen) return Promise.resolve();
    if(PX.isCheckOpen()) PX.closeCheck();
    var m = $('px-modal'); if(m && m._cancel) m._cancel();
    var p = current === 'wizard' ? leaveWizard() : Promise.resolve();
    return p.catch(function(){}).then(function(){
      PX.cleanShared();
      if(typeof closeDiagram === 'function') closeDiagram();
      var dv = $('diagram-view'); if(dv) dv.innerHTML = '';
      pin.key = null; index = []; external = null; active = null; PX.setCheck(null);
      state = defaultState();
      ['px-shell', 'wizard-host', 'pdf-body'].forEach(function(id){ var x = $(id); if(x) x.innerHTML = ''; });
      var cd = $('px-onb'); if(cd && cd.parentNode) cd.parentNode.removeChild(cd);
      return unlockFlow();
    });
  }

  /* ---------- Backup for a password manager (e.g. Bitwarden) and restore ---------- */
  var BACKUP_NOTE_LIMIT = 9500;   // Bitwarden notes are limited to about 10,000 characters
  function packText(text){
    var bytes = te.encode(text);
    if(typeof CompressionStream === 'undefined') return Promise.resolve('CSIP-RAW1:' + b64e(bytes));
    var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Response(stream).arrayBuffer().then(function(buf){ return 'CSIP-GZ1:' + b64e(buf); });
  }
  // Limits protect against crafted backup texts (huge input, gzip bombs)
  var MAX_PACKED_CHARS = 3000000, MAX_UNPACKED_BYTES = 4 * 1024 * 1024;
  function readLimited(stream){
    var reader = stream.getReader(), chunks = [], total = 0;
    function pump(){
      return reader.read().then(function(r){
        if(r.done){
          var all = new Uint8Array(total), off = 0;
          chunks.forEach(function(c){ all.set(c, off); off += c.length; });
          return all;
        }
        total += r.value.length;
        if(total > MAX_UNPACKED_BYTES){ reader.cancel(); throw new Error('too-large'); }
        chunks.push(r.value);
        return pump();
      });
    }
    return pump();
  }
  function unpackText(input){
    input = String(input || '');
    if(input.length > MAX_PACKED_CHARS) return Promise.reject(new Error('too-large'));
    var m = /CSIP-(GZ|RAW)1:([A-Za-z0-9+\/=]+)/.exec(input);
    if(!m) return Promise.resolve(input.trim());
    var bytes = b64d(m[2]);
    if(m[1] === 'RAW'){
      if(bytes.length > MAX_UNPACKED_BYTES) return Promise.reject(new Error('too-large'));
      return Promise.resolve(td.decode(bytes));
    }
    if(typeof DecompressionStream === 'undefined') return Promise.reject(new Error('gunzip'));
    return readLimited(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).then(function(all){ return td.decode(all); });
  }
  function copyText(text){
    function legacy(){
      return new Promise(function(resolve, reject){
        var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
        document.body.appendChild(ta); ta.select();
        var ok = false; try { ok = document.execCommand('copy'); } catch(err){}
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('copy'));
      });
    }
    if(navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(legacy);
    return legacy();
  }
  // Compact backup text (gzip + Base64) as clipboard content for a secure note in the password manager
  function backupToManager(){
    var payload = JSON.stringify({app: 'clavastack-nachlassplan', version: 1, savedAt: new Date().toISOString(), state: state});
    packText(payload).then(function(packed){
      var note = 'Bitcoin Inheritance Planner Backup' + (active ? ' (' + active.name + ')' : '') + ' ' + PX.ymd(new Date()) + '\n' + packed;
      return copyText(note).then(function(){ return note.length; });
    }).then(function(len){
      var long = len > BACKUP_NOTE_LIMIT;
      return ask({
        title: T('Backup kopiert', 'Backup copied'),
        text: T('Der Backup-Text (' + len + ' Zeichen) ist in der Zwischenablage.\n\n1. Öffne deinen Passwort-Manager, zum Beispiel Bitwarden.\n2. Lege eine „Sichere Notiz“ an, etwa „Bitcoin Vererbungsplan Backup“.\n3. Füge den Text in das Notizfeld ein und speichere.\n4. Lösche danach die Zwischenablage.\n\nDer Text enthält keine Seeds, PINs oder Passphrasen, aber den Aufbau deines Setups.' +
                  (long ? '\n\nAchtung: Der Text ist länger als das übliche Notizlimit von etwa 10.000 Zeichen. Nutze dann „Als Datei teilen“ und hänge die Datei an einen Eintrag.' : ''),
                'The backup text (' + len + ' characters) is on the clipboard.\n\n1. Open your password manager, for example Bitwarden.\n2. Create a "Secure note", e.g. "Bitcoin inheritance plan backup".\n3. Paste the text into the notes field and save.\n4. Clear the clipboard afterwards.\n\nThe text contains no seeds, PINs or passphrases, but the structure of your setup.' +
                  (long ? '\n\nNote: the text is longer than the usual note limit of about 10,000 characters. Use "Share as file" and attach the file to an entry instead.' : '')),
        ok: T('Verstanden', 'Got it'), cancel: false
      });
    }).catch(function(){ toast(T('Kopieren nicht möglich. Nutze „Als Datei teilen“.', 'Copying failed. Use "Share as file".'), 'err'); });
  }
  // "Save plan" in the summary: choose the way first
  var origSavePlan = window.savePlan;
  window.savePlan = function(){
    sheet(T('Plan sichern', 'Back up plan'), [
      {label: T('In Passwort-Manager sichern (Text kopieren)', 'Save to password manager (copy text)')},
      {label: T('Als Datei teilen (optional mit Passwort)', 'Share as file (optional password)')}
    ]).then(function(i){
      if(i === 0) backupToManager(); else if(i === 1) origSavePlan();
    });
  };

  function startRestore(file){
    createPlan(T('Wiederhergestellter Plan', 'Restored plan')).then(function(rec){ return openPlan(rec.id, 'resume'); }).then(function(){ loadPlan({files: [file]}); });
  }
  function restoreFromFile(){
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json,text/plain'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = function(){ var f = inp.files && inp.files[0]; document.body.removeChild(inp); if(f) startRestore(f); };
    inp.click();
  }
  function restoreFromText(){
    ask({title: T('Backup-Text einfügen', 'Paste backup text'), text: T('Kopiere die Notiz aus deinem Passwort-Manager und füge sie hier ein.', 'Copy the note from your password manager and paste it here.'),
         textarea: {placeholder: 'CSIP-GZ1:...', paste: T('Aus Zwischenablage einfügen', 'Paste from clipboard')}, ok: T('Wiederherstellen', 'Restore')}).then(function(text){
      if(!text) return;
      unpackText(text).then(function(json){
        try { JSON.parse(json); } catch(err){ throw new Error('json'); }
        startRestore(new File([json], 'plan.json', {type: 'application/json'}));
      }).catch(function(){ toast(T('Der Text ist kein gültiges Backup.', 'The text is not a valid backup.'), 'err'); });
    });
  }
  function restorePlan(){
    sheet(T('Plan wiederherstellen', 'Restore a plan'), [
      {label: T('Backup-Text einfügen (Passwort-Manager)', 'Paste backup text (password manager)')},
      {label: T('Aus Datei', 'From file')}
    ]).then(function(i){ if(i === 0) restoreFromText(); else if(i === 1) restoreFromFile(); });
  }

  /* ---------- Summary for phones ---------- */
  // Clear variant of "Review plan": actions on top, setup as tiles, open items and next steps as cards
  function planEmpty(){
    return !state.devices.length && !state.seeds.length && !((state.sw.pc || 0) + (state.sw.phone || 0)) && !state.ex.count && !state.multisigs.length && !(state.lianaWallets && state.lianaWallets.length);
  }

  /* ---------- Feedback for PDF and graphic: never silent ---------- */
  var origBuild = window.buildAndPrint;
  window.buildAndPrint = function(){
    var t0 = Date.now();
    toast(T('PDF wird vorbereitet ...', 'Preparing the PDF ...'));
    try { origBuild.apply(this, arguments); } catch(err){ showFatal('PDF: ' + (err && err.message)); return; }
    setTimeout(function(){
      if(!window.__pxPrintStart || window.__pxPrintStart < t0) showFatal(tr('PDF: Der Druckdialog wurde nicht gestartet. Bitte versuche es erneut.', 'PDF: The print dialog did not start. Please try again.'));
    }, 8000);
  };
  var origOpenDiagram = window.openDiagram;
  window.openDiagram = function(mode){
    if(planEmpty()){ toast(T('Noch keine Angaben im Plan. Ergänze zuerst dein Setup.', 'No plan details yet. Add your setup first.'), 'err'); return; }
    // a stale print mode of the graphic must not disturb the display
    if(document.body.classList.contains('diagram-print')) window.dispatchEvent(new Event('afterprint'));
    try { origOpenDiagram.call(this, mode); } catch(err){ showFatal('Grafik: ' + (err && err.message)); return; }
    setTimeout(function(){
      var dv = $('diagram-view');
      if(dv && !dv.hidden && dv.getBoundingClientRect().height < 50) showFatal(tr('Grafik: Die Anzeige ist leer. Bitte versuche es erneut.', 'Graphic: The display is empty. Please try again.'));
    }, 1200);
  };
  document.addEventListener('visibilitychange', function(){ if(!document.hidden && PX.finishPrint) PX.finishPrint(); });

  var origSummary = window.renderSummary;
  // Security tips compact and collapsed: title, text and links per tip
  function renderTipsMobile(){
    var tips = buildRecommendations(), regular = [], adv = [];
    tips.forEach(function(t){ (t.advanced ? adv : regular).push(t); });
    function one(t){
      var links = (t.links || []).map(function(l){ return '<a class="sm-link" href="' + e(l.url) + '" target="_blank" rel="noopener">' + e(l.text) + '</a>'; }).join('');
      return '<div class="sm-tip' + (t.warn ? ' warn' : '') + '"><b>' + (t.warn ? '&#9888; ' : '') + e(t.title) + '</b><p>' + t.body + '</p>' + (links ? '<div>' + links + '</div>' : '') + '</div>';
    }
    var h = '<details class="sm-card"><summary>' + L('secTipsLabel') + (regular.length ? ' <span class="sm-count info">' + regular.length + '</span>' : '') + '</summary><div class="sm-body">';
    if(!regular.length && !adv.length) h += '<p class="muted">' + L('secTipsEmpty') + '</p>';
    regular.forEach(function(t){ h += one(t); });
    if(adv.length){ h += '<div class="sec-title">' + L('secTipsAdvanced') + '</div>'; adv.forEach(function(t){ h += one(t); }); }
    h += '<p class="muted">' + e(T('Basis-Tipps aus deiner Wallet-Struktur. Sie ersetzen keine umfassende Sicherheitsanalyse.', 'Basic tips based on your wallet structure. They do not replace a full security review.')) + '</p>';
    return h + '</div></details>';
  }
  function renderSummaryMobile(){
    var inc = buildIncompleteItems();
    var ready = inc.length === 0;
    var h = '<div class="sm">';

    h += '<div class="sm-hero"><div class="sm-hero-top"><div><div class="sm-kicker">' + L('summary') + '</div>' +
         '<div class="sm-name">' + e(active ? active.name : '') + '</div></div>' +
         '<span class="sm-badge ' + (ready && !planEmpty() ? 'ok' : 'warn') + '">' + e(planEmpty() ? T('Leer', 'Empty') : (ready ? T('Bereit', 'Ready') : T(inc.length + ' offen', inc.length + ' open'))) + '</span></div>' +
         '<button class="btn btn-primary sm-pdf" onclick="buildAndPrint()">' + L('createPDF') + '</button>' +
         '<button class="btn btn-ghost sm-graph" onclick="openDiagram(\'overview\')">' + e(T('Als Grafik ansehen', 'Show as graphic')) + '</button></div>';

    // Setup tiles
    var tiles = [];
    function tile(n, label, txt){ tiles.push('<div class="sm-tile"><div class="sm-n' + (txt ? ' txt' : '') + '">' + n + '</div><div class="sm-l">' + label + '</div></div>'); }
    if(state.devices.length) tile(state.devices.length, L('hwWallets'));
    if(state.seeds.length) tile(state.seeds.length, L('seedPhrases'));
    var sc = allSmartcards().length; if(sc) tile(sc, L('smartcards'));
    var sw = (state.sw.pc || 0) + (state.sw.phone || 0); if(sw) tile(sw, L('softwareWallets'));
    if(state.ex.count) tile(state.ex.count, L('exchanges'));
    if(state.multisigs.length) tile(state.multisigs.length, 'Multisig');
    var inMs = 0; for(var i = 0; i < state.seeds.length; i++){ if(seedInMultisig(i)) inMs++; }
    if(inMs) tile(inMs, L('seedsInMultisig'));
    if(state.pwm.use === true) tile(e(pwmDisplayName() || T('Ja', 'Yes')), L('passwordManager'), true);
    if(state.timelock.use) tile(state.timelock.ritrek ? 'Ritrek' : T('Ja', 'Yes'), L('timelockRecovery'), true);
    if(anyLianaCompanion()) tile(state.lianaWallets.length, 'Liana');
    h += '<div class="sec-title">' + e(T('Dein Setup', 'Your setup')) + '</div>';
    h += tiles.length ? '<div class="sm-tiles">' + tiles.join('') + '</div>'
                      : '<div class="sm-empty"><b>' + e(T('Dein Plan ist noch leer', 'Your plan is still empty')) + '</b><p>' +
                        e(T('Für die Grafik und ein aussagekräftiges PDF brauchst du mindestens ein Gerät, einen Seed oder eine Börse.', 'For the graphic and a meaningful PDF you need at least one device, seed or exchange.')) + '</p>' +
                        '<button class="btn btn-primary" onclick="gotoScreen(\'devcount\')">' + e(T('Setup ergänzen', 'Add your setup')) + '</button></div>';

    // Open items
    if(inc.length){
      h += '<details class="sm-card sm-warn" open><summary>' + e(T('Noch offen', 'Still open')) + ' <span class="sm-count">' + inc.length + '</span></summary><div class="sm-body">';
      inc.forEach(function(it){
        h += '<button class="sm-row" onclick="gotoScreen(\'' + it.key + '\',' + (it.idx == null ? 'null' : it.idx) + ')"><span class="sm-row-t">' + it.label + '</span>' + ico('right') + '</button>';
      });
      h += '</div></details>';
    }

    // Next steps
    var chk = PX.getCheck(), nextDate = chk ? PX.nextOccurrence(chk.date, chk.time) : null;
    h += '<div class="sec-title">' + e(T('Nächste Schritte', 'Next steps')) + '</div>';
    h += '<button class="sm-row sm-step" onclick="' + (chk ? 'PX.openCheck()' : 'gotoScreen(\'reminder\')') + '"><span class="sm-row-t"><b>' + e(T('Jahrescheck', 'Yearly check')) + '</b>' +
         '<small>' + e(chk && nextDate ? T('Aktiv, nächster Termin ', 'Active, next date ') + PX.fmtLong(nextDate) : T('Einmal im Jahr prüfen, ob alles stimmt', 'Check once a year that everything is still right')) + '</small></span>' + ico('right') + '</button>';
    h += '<button class="sm-row sm-step" onclick="savePlan()"><span class="sm-row-t"><b>' + e(T('Backup sichern', 'Back up')) + '</b>' +
         '<small>' + e(T('In den Passwort-Manager oder als Datei', 'To your password manager or as a file')) + '</small></span>' + ico('right') + '</button>';

    // Where to keep the PDF
    h += '<details class="sm-card"><summary>' + L('postPdfBtn') + '</summary><div class="sm-body"><ol class="sm-steps">';
    for(var n = 1; n <= 5; n++){ h += '<li><b>' + L('postPdfStep' + n + 'Title') + '</b><small>' + L('postPdfStep' + n + 'Body') + '</small></li>'; }
    h += '</ol></div></details>';

    h += renderTipsMobile();
    h += PX.consultCard();
    h += '<div class="wizard-nav"><button class="btn btn-back" onclick="go(-1)">' + L('back') + '</button></div>';
    return h + '</div>';
  }
  window.renderSummary = function(){
    try { return renderSummaryMobile(); }
    catch(err){ showFatal('Zusammenfassung: ' + (err && err.message)); return origSummary(); }
  };

  /* ---------- Draw the shell ---------- */
  function renderShell(){
    var s = $('px-shell'); if(!s || current === 'wizard') return;
    s.innerHTML = current === 'calendar' ? viewCalendar() : (current === 'settings' ? viewSettings() : viewPlans());
    var wd = $('px-fatal'); if(wd && wd.getAttribute('data-wd') === '1' && wd.parentNode) wd.parentNode.removeChild(wd);
    drawTabbar();
    if(current === 'settings') refreshNotifState();
  }

  /* ---------- Onboarding ---------- */
  var onb = {i: 0};
  function onbSlides(){
    return [
      {icon: 'boxes', t: T('Plane dein Erbe in kurzen Boxen', 'Plan your legacy in short boxes'),
       p: T('Du gehst Schritt für Schritt durch Kategorien wie Hardware-Wallets, Seeds, Börsen und Vertrauenspersonen. Jede Box ist kurz und klar.', 'You go step by step through categories like hardware wallets, seeds, exchanges and trusted contacts. Each box is short and clear.')},
      {icon: 'pen', t: T('Geheimnisse bleiben auf Papier', 'Secrets stay on paper'),
       p: T('Seed-Phrasen, PINs und Passphrasen gibst du nie in die App ein. Am Ende bekommst du ein gut lesbares PDF, in das du sie von Hand einträgst.', 'You never enter seed phrases, PINs or passphrases in the app. At the end you get a readable PDF where you write them in by hand.')},
      {icon: 'calendar', t: T('Einmal im Jahr kurz prüfen', 'A quick check once a year'),
       p: T('Wähle einen festen Tag. Die App erinnert dich, trägt ihn in den Kalender ein und gibt dir eine Checkliste für dein Backup. Unten findest du immer Pläne, Kalender und Einstellungen.', 'Pick a fixed day. The app reminds you, adds it to the calendar and gives you a checklist for your backup. At the bottom you always find Plans, Calendar and Settings.')}
    ];
  }
  function drawOnb(){
    var o = $('px-onb');
    if(!o){ o = document.createElement('div'); o.id = 'px-onb'; document.body.appendChild(o); }
    var sl = onbSlides(), h = '<div class="onb-inner">';
    if(onb.i === 0){
      h += '<img class="onb-logo" src="assets/app-logo.svg" alt=""><div class="onb-title">Bitcoin Inheritance Planner</div>' +
           '<p class="onb-p">Wähle deine Sprache<br>Choose your language</p>' +
           '<div class="onb-langs"><button class="btn btn-primary" onclick="PXS.onbLang(\'de\')">Deutsch</button><button class="btn btn-primary" onclick="PXS.onbLang(\'en\')">English</button></div>';
    } else {
      var s = sl[onb.i - 1], last = onb.i === sl.length;
      h += '<div class="onb-ico">' + ico(s.icon) + '</div><div class="onb-title">' + e(s.t) + '</div><p class="onb-p">' + e(s.p) + '</p>' +
           '<div class="onb-dots">' + sl.map(function(x, k){ return '<i class="' + (k === onb.i - 1 ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
           '<div class="onb-actions"><button class="btn btn-primary" onclick="PXS.onbNext()">' + e(last ? T('Los geht\'s', 'Get started') : T('Weiter', 'Next')) + '</button>' +
           (last ? '' : '<button class="btn btn-ghost" onclick="PXS.onbDone()">' + e(T('Überspringen', 'Skip')) + '</button>') + '</div>';
    }
    o.innerHTML = h + '</div>';
  }
  function showOnboarding(){ onb.i = 0; drawOnb(); }
  function closeOnboarding(){ var o = $('px-onb'); if(o && o.parentNode) o.parentNode.removeChild(o); }
  function onbDone(){
    settings.onboarded = true; saveSettings(); closeOnboarding();
    if(current === 'wizard') leaveWizard();
    showView('plans');
  }
  function setLanguage(l){
    settings.lang = l; saveSettings();
    if(typeof LANG !== 'undefined' && LANG !== l && typeof setLang === 'function') setLang(l);
    drawTabbar();
  }

  /* ---------- Back button ---------- */
  function onBack(){
    var mm = $('px-modal');
    if(mm && mm._cancel){ mm._cancel(); return; }
    if(promptOpen){ var pe = $('px-pw'); if(pe && pe._cancel) pe._cancel(); else plug('App').exitApp(); return; }
    var m = $('px-modal');
    if(m && m._cancel){ m._cancel(); return; }
    if(PX.isCheckOpen()){ PX.closeCheck(); return; }
    if($('px-onb')){ if(onb.i > 0 && settings.onboarded === false){ onb.i--; drawOnb(); } else if(settings.onboarded) closeOnboarding(); return; }
    var dv = $('diagram-view');
    if(dv && !dv.hidden && typeof closeDiagram === 'function'){ closeDiagram(); return; }
    if(current === 'wizard'){
      if(pos > 0 && typeof go === 'function'){ go(-1); return; }
      tab('plans'); return;
    }
    if(current !== 'plans'){ tab('plans'); return; }
    plug('App').exitApp();
  }

  /* ---------- Start ---------- */
  function init(){
    ensureShell();
    PX.cleanShared();   // leftovers of an earlier share (or of version 1.0.0) are removed on every start
    // Do not load external links in the WebView
    var logo = $('logo-link');
    if(logo) logo.addEventListener('click', function(ev){ ev.preventDefault(); openLink('https://clavastack.com'); }, true);
    var book = $('btn-book'); if(book) book.href = BOOK_URL_APP;
    try { var sb = plug('StatusBar'); sb.setStyle({style: 'DARK'}); sb.setBackgroundColor({color: '#04070B'}); } catch(err){}

    // Header title: app name instead of the web title (also after a language change)
    function setAppTitle(){
      var t = $('header-title-text'); if(t) t.textContent = 'Bitcoin Inheritance Planner';
      var pf = document.querySelector('.header-brand-prefix'); if(pf) pf.style.display = 'none';
    }
    if(typeof updateHeaderLang === 'function'){
      var origHeader = updateHeaderLang;
      window.updateHeaderLang = function(){ origHeader.apply(this, arguments); setAppTitle(); };
    }
    setAppTitle();

    return Promise.all([loadJson(KEY_SETTINGS), store.get(KEY_PIN)]).then(function(r){
      settings = Object.assign(settings, r[0] || {});
      try { pin.meta = r[1] ? JSON.parse(r[1]) : null; } catch(err){ pin.meta = null; }
      if(settings.lang) setLanguage(settings.lang);
      // Register listeners first so the back button also works at the password prompt
      plug('App').addListener('backButton', onBack);
      plug('App').addListener('appStateChange', function(st){
        if(!st) return;
        if(st.isActive && PX.finishPrint) PX.finishPrint();   // back from the print dialog
        if(st.isActive) PX.cleanSharedIfOld();                // shared plan/calendar files are not kept
        if(!st.isActive){ bgAt = Date.now(); if(active && current === 'wizard') saveActive().catch(saveFailed); }   // no edit is lost if the system kills the app in the background
        else if(pinOn() && pin.key && bgAt && Date.now() - bgAt > LOCK_AFTER_MS){ lockNow(); }
      });
      plug('LocalNotifications').addListener('localNotificationActionPerformed', function(ev){
        var id = ev && ev.notification && ev.notification.extra && ev.notification.extra.planId;
        if(!id) return;
        if(pinOn() && !pin.key){ pendingOpen = id; return; }
        openCheckOf(id);
      });
      try { plug('SplashScreen').hide(); } catch(err){}
      return pinOn() ? unlockFlow() : loadIndexAndShow();
    }).catch(function(err){ showFatal('Start: ' + (err && (err.message || err))); });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.PXS = {
    tab: tab, newPlan: newPlan, menu: planMenu,
    open: function(id){ openPlan(id, 'resume'); },
    view: function(id){ openPlan(id, 'summary'); },
    month: function(d){ cal.m += d; if(cal.m < 0){ cal.m = 11; cal.y--; } if(cal.m > 11){ cal.m = 0; cal.y++; } cal.sel = null; renderShell(); },
    day: function(k){ cal.sel = cal.sel === k ? null : k; renderShell(); },
    check: openCheckOf, ics: icsOf, setupCheck: setupCheckFor,
    lang: function(l){ setLanguage(l); renderShell(); },
    notif: function(){ plug('LocalNotifications').requestPermissions().then(refreshNotifState); },
    intro: function(){ settings.onboarded = true; showOnboarding(); },
    link: openLink, wipe: wipe, pwSet: pwSet, pwChange: pwChange, pwRemove: pwRemove, lock: lockNow, restore: restorePlan,
    onbLang: function(l){ setLanguage(l); onb.i = 1; drawOnb(); },
    onbNext: function(){ if(onb.i >= onbSlides().length) onbDone(); else { onb.i++; drawOnb(); } },
    onbDone: onbDone
  };
})();
