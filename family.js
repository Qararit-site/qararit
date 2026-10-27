/* تحدي الأسرة | لِنغتنم الأجر
 * واجهة المجالس الأسرية. كل الصلاحيات تُفرض في قاعدة البيانات (supabase/schema.sql)؛
 * ما تخفيه هذه الواجهة إخفاء للتسهيل فقط وليس حماية.
 * أسماء المشاركين والمجالس نص يكتبه المستخدم، فلا تُدرج أبدًا عبر innerHTML.
 */
(function () {
  "use strict";

  var CFG = window.FAMILY_CONFIG || {};
  var LS_SESSION = "qararit.family.session";
  var LS_CURRENT = "qararit.family.current";
  var LS_SCALE = "qararit.scale";
  var POLL_MS = 4000;

  var main = document.getElementById("main");
  var dlg = document.getElementById("dlg");

  // ------------------------------------------------------------------ أدوات
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) for (var k in props) {
      var v = props[k];
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else if (k === "style") Object.assign(e.style, v);   // عبر CSSOM حتى لا تمنعه سياسة CSP
      else if (v === true) e.setAttribute(k, "");
      else e.setAttribute(k, v);
    }
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function add(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(e, x); }); return; }
    e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* التخزين غير متاح */ } }
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  // ------------------------------------------------------------------ اللغة
  // نصوص الواجهة مفتاحها النص العربي نفسه (i18n/family/<lang>.json)، فإن نقصت ترجمة ظهرت بالعربية لا بمفتاح برمجي.
  // كل مشارك يختار لغته، وتُحفظ على هذا الجهاز مع معرّفه لا مع اسمه، فلا تمسّ اسمه ولا إجاباته ولا لغات غيره.
  var I = window.QI18N;
  var LS_LANGS = "qararit.family.langs";
  function T(s, vars, raw) {
    var v = (I.lang && I.lang !== I.reg.source && I.tIn(I.lang, s)) || s;
    if (!vars) return v;
    // الأسماء والأرقام تُعزل اتجاهيًا حتى لا يختلط اسم عربي داخل جملة إنجليزية والعكس
    return v.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] == null ? m : raw ? String(vars[k]) : "\u2068" + vars[k] + "\u2069"; });
  }
  function N(n) { return I.num(n, true); }
  function langMap() { return lsGet(LS_LANGS, {}); }
  function partLang(fid, pid) { var m = langMap(); var l = m[fid] && m[fid][pid]; return l && I.supported(l) ? l : null; }
  function setPartLang(fid, pid, code) { if (!fid || !pid) return; var m = langMap(); (m[fid] = m[fid] || {})[pid] = code; lsSet(LS_LANGS, m); }
  function deviceLang() { return I.fromUrl() || I.stored() || I.reg.source; }
  // لغة الشاشة: لغة المشارك الحالي داخل مجلسه، وإلا لغة الجهاز
  function wantLang() {
    var r = route(), pid = r.fid && S.fam && S.famId === r.fid ? currentPid() : null;
    return (pid && partLang(r.fid, pid)) || deviceLang();
  }
  var trContent = {}, trQuestions = {};
  function ensureLang(code) {
    var jobs = [I.loadDict("ui", code), I.loadDict("family", code)];
    if (code !== I.reg.source) {
      if (!trContent[code]) jobs.push(I.fetchJSON("data/content/" + code + ".json").then(function (c) { trContent[code] = c; }, function () { trContent[code] = { hadiths: {} }; }));
      if (!trQuestions[code]) jobs.push(I.fetchJSON("family/questions." + code + ".json").then(function (c) { trQuestions[code] = c; }, function () { trQuestions[code] = { questions: {} }; }));
    }
    return Promise.all(jobs).catch(function () {}).then(function () {
      if (I.lang === code) return;
      return I.setLang(code, { remember: false, url: false }).then(paintChrome);
    });
  }
  var picker = null;
  function paintChrome() {
    document.title = T("تحدي الأسرة | لِنغتنم الأجر");
    var brand = document.getElementById("brand");
    var site = I.lang !== I.reg.source && trContent[I.lang] && trContent[I.lang].site;
    brand.textContent = (site && site.title) || T("لقد فرّطنا في قراريط كثيرة");
    brand.setAttribute("aria-label", T("العودة إلى متصفح الأحاديث"));
    if (!brand.hasAttribute("data-home")) brand.setAttribute("data-home", brand.getAttribute("href"));
    brand.setAttribute("href", brand.getAttribute("data-home") + (I.lang === I.reg.source ? "" : "?lang=" + I.lang));
    document.getElementById("btn-font-down").setAttribute("aria-label", T("تصغير الخط"));
    document.getElementById("btn-font-up").setAttribute("aria-label", T("تكبير الخط"));
    Array.prototype.forEach.call(document.querySelectorAll(".font-glyph"), function (g) { g.textContent = I.t("tool.font.glyph") || "أ"; });
    document.getElementById("foot-note").textContent = T("نقاط التحدي تقيس المشاركة والإجابات داخل مجلسكم فقط، ولا تعبّر عن الأجر أو المنزلة عند الله.");
    if (picker) picker.paint();
  }
  // اختيار اللغة: داخل المجلس يغيّر لغة المشارك الحالي وحده، وخارجه يغيّر لغة الجهاز
  function pickLang(code) {
    var r = route(), pid = r.fid && S.fam && S.famId === r.fid ? currentPid() : null;
    if (pid) setPartLang(r.fid, pid, code);
    else I.setLang(code, { remember: true, url: false });
    ensureLang(code).then(function () {
      var p = pid && person(pid);
      toast(p ? T("لغة {name}: {lang}", { name: p.name, lang: I.info(code).name }) : I.info(code).name);
      render(true);
    });
  }
  function langSelect(id, value) {
    return h("select", { id: id, class: "lang-select" }, I.reg.list.map(function (l) {
      return h("option", { value: l.code, lang: l.code, selected: l.code === value }, l.name);
    }));
  }
  // الحديث بلغة المشارك: الترجمة المسموح بعرضها فقط، وإلا العربية مع تنبيه
  function localized(x) {
    var c = I.lang !== I.reg.source && trContent[I.lang];
    var t = c && c.hadiths && c.hadiths[x.id];
    if (t && I.shows(t.status)) {
      return { tr: true, ar: x, id: x.id, status: t.status, title: t.title, lead: t.lead, text: t.text, reward: t.reward,
        narrator: t.narrator, grade: t.grade, meaning: t.meaning, imani: t.imani, tarbawi: t.tarbawi, sources: x.sources };
    }
    return { tr: false, missing: I.lang !== I.reg.source, ar: x, id: x.id, title: x.title, lead: x.lead, text: x.text, reward: x.reward,
      narrator: x.narrator, grade: x.grade, meaning: x.meaning, imani: x.imani, tarbawi: x.tarbawi, sources: x.sources };
  }
  // نص السؤال بلغة المشارك. المعرّف وترتيب الخيارات ومفتاح الإجابة واحد في كل اللغات؛ نترجم النص فقط.
  function qtext(q, key) {
    var c = I.lang !== I.reg.source && trQuestions[I.lang];
    var o = c && c.questions && c.questions[q.id];
    if (o && I.shows(o.status) && o.n === q.choices.length && o.choices.length === q.choices.length) {
      return { tr: true, status: o.status, prompt: o.prompt, choices: o.choices, explanation: o.explanation, source: o.source };
    }
    return { tr: false, missing: I.lang !== I.reg.source, prompt: q.prompt, choices: q.choices, explanation: key && key.explanation, source: key && key.source };
  }
  function bookName(b) { return I.lang === I.reg.source ? b : (I.t("name.short." + b) || I.t("name." + b) || b); }
  function copy(text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast(T("نُسخ")); }, function () { toast(T("انسخه يدويًا")); });
    else toast(T("انسخه يدويًا"));
  }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

  // حجم الخط مشترك مع المتصفح الأساسي
  var scale = lsGet(LS_SCALE, 1);
  function applyScale() { document.documentElement.style.setProperty("--scale", scale); }
  applyScale();
  document.getElementById("btn-font-up").onclick = function () { scale = Math.min(1.5, +(scale + .1).toFixed(2)); lsSet(LS_SCALE, scale); applyScale(); };
  document.getElementById("btn-font-down").onclick = function () { scale = Math.max(.85, +(scale - .1).toFixed(2)); lsSet(LS_SCALE, scale); applyScale(); };

  // ------------------------------------------------------------------ الاتصال بالخادم
  var ERR = {
    not_member: "لا تملك صلاحية الوصول إلى هذا المجلس من هذا الجهاز.",
    family_closed: "هذا المجلس مغلق.",
    not_admin: "هذا الإجراء لمسؤول المجلس فقط.",
    pin_required: "هذا المشارك محمي برمز شخصي. اختره من «تغيير المشارك» وأدخل رمزه.",
    pin_locked: "أُوقفت المحاولة عشر دقائق بعد تكرار الرمز الخاطئ.",
    invite_invalid: "رابط الدعوة أو الرمز غير صالح، أو انتهت مدته، أو أُغلق المجلس.",
    code_invalid: "الرمز غير صحيح أو انتهت مدته.",
    too_many_attempts: "محاولات كثيرة. انتظر ربع ساعة ثم أعد المحاولة.",
    bad_name: "اكتب اسمًا من حرف إلى ثلاثين حرفًا.",
    bad_pin: "الرمز الشخصي من 4 إلى 6 أرقام.",
    not_enough_questions: "لا توجد بعد أسئلة معتمدة من المراجع الشرعي تكفي لهذا التحدي.",
    too_many_active: "في المجلس خمسة تحديات جارية. أنهِ أحدها أولًا.",
    last_admin: "يجب أن يبقى في المجلس مسؤول واحد على الأقل.",
    confirm_mismatch: "اكتب اسم المجلس كما هو تمامًا للتأكيد.",
    not_unlocked: "هذا الحديث لم يُفتح بعد.",
    challenge_done: "انتهى هذا التحدي.",
    family_full: "بلغ المجلس الحد الأعلى للمشاركين (30).",
    not_found: "لم يُعثر على المطلوب في هذا المجلس.",
    not_signed_in: "تعذّر إنشاء جلسة لهذا الجهاز.",
    network: "تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.",
    not_configured: "المجالس المشتركة بين عدة أجهزة لم تُفعَّل بعد في هذه النسخة.",
    storage_unavailable: "لا يمكن الحفظ في هذا المتصفح (ربما لأنه في وضع التصفح الخاص).",
    bad_input: "اختيار غير صالح."
  };
  function errText(e) { return T(ERR[e && e.message] || (isLocal(S.famId) ? "حدث خطأ غير متوقع." : ERR.network)); }

  var session = lsGet(LS_SESSION, null);
  function authHeaders() {
    var hd = { "apikey": CFG.supabaseAnonKey, "content-type": "application/json" };
    if (session) hd.authorization = "Bearer " + session.access_token;
    return hd;
  }
  function saveSession(s) { session = s; lsSet(LS_SESSION, s); }
  function authCall(path, body) {
    return fetch(CFG.supabaseUrl + "/auth/v1/" + path, { method: "POST", headers: { "apikey": CFG.supabaseAnonKey, "content-type": "application/json" }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error("not_signed_in"); return j; }); });
  }
  var sessionPromise = null;
  function ensureSession() {
    if (session && session.access_token) {
      if (session.expires_at && session.expires_at * 1000 < Date.now() + 60000) return refresh();
      return Promise.resolve(session);
    }
    if (!sessionPromise) {
      // جلسة مجهولة لهذا المتصفح: لا بريد ولا كلمة مرور
      sessionPromise = authCall("signup", { data: {} }).then(function (s) { saveSession(s); sessionPromise = null; return s; },
        function (e) { sessionPromise = null; throw e; });
    }
    return sessionPromise;
  }
  var refreshPromise = null;
  function refresh() {
    if (!refreshPromise) {
      refreshPromise = authCall("token?grant_type=refresh_token", { refresh_token: session.refresh_token })
        .then(function (s) { saveSession(s); refreshPromise = null; return s; },
          function (e) {
            refreshPromise = null;
            // لا ننشئ جلسة جديدة بصمت: ذلك يُفقد الجهاز هويته. نطلب من المستخدم الاستعادة برمزه.
            throw e;
          });
    }
    return refreshPromise;
  }
  var remoteOn = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  function isLocal(id) { return window.FamilyLocal && FamilyLocal.isLocal(id); }
  // نمط الجهاز الواحد يُخدم محليًا، والنمط المشترك من الخادم. لا يختلط النمطان: معرّف المجلس يحدد مكانه.
  function rpc(fn, args) {
    args = args || {};
    if (fn === "my_families") {
      return Promise.all([FamilyLocal.call("my_families", {}),
        remoteOn ? rpcRemote("my_families", {}).catch(function () { return []; }) : Promise.resolve([])])
        .then(function (r) { return r[0].concat(r[1]); });
    }
    if (fn === "create_local_family" || isLocal(args.p_family) || (fn === "lock_device" && isLocal(S.famId))) return FamilyLocal.call(fn, args);
    if (!remoteOn) return Promise.reject(new Error("not_configured"));
    return rpcRemote(fn, args);
  }
  function rpcRemote(fn, args, retried) {
    return ensureSession().then(function () {
      return fetch(CFG.supabaseUrl + "/rest/v1/rpc/" + fn, { method: "POST", headers: authHeaders(), body: JSON.stringify(args || {}) });
    }).then(function (r) {
      if (r.status === 401 && !retried) return refresh().then(function () { return rpcRemote(fn, args, true); });
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* نص غير متوقع */ }
        if (!r.ok) throw new Error((j && j.message) || "network");
        if (j && typeof j === "object" && !Array.isArray(j) && typeof j.error === "string") throw new Error(j.error);
        setOnline(true);
        return j;
      });
    }, function (e) {
      if (e && e.message && ERR[e.message]) throw e;
      setOnline(false);
      throw new Error("network");
    });
  }

  // ------------------------------------------------------------------ البيانات المحلية (قراءة فقط)
  var content = null;
  function loadContent() {
    if (content) return Promise.resolve(content);
    return fetch("../data/hadiths.json").then(function (r) { return r.json(); }).then(function (d) {
      var pub = d.site.publish_statuses || ["approved"];
      var map = {};
      d.hadiths.forEach(function (x) { if (pub.indexOf(x.status) !== -1) map[x.id] = x; });
      content = { site: d.site, byId: map };
      return content;
    });
  }
  // إبراز عبارات الأجر كما في البطاقة الأساسية، دون تعديل النص
  function hadithText(x) {
    var text = x.text, marks = new Array(text.length).fill(false);
    (x.reward || []).forEach(function (p) {
      var from = 0, i;
      while (p && (i = text.indexOf(p, from)) !== -1) { for (var k = i; k < i + p.length; k++) marks[k] = true; from = i + p.length; }
    });
    var el = h("p", { class: "h-text" }), i = 0;
    while (i < text.length) {
      var j = i; while (j < text.length && marks[j] === marks[i]) j++;
      add(el, marks[i] ? h("mark", null, text.slice(i, j)) : text.slice(i, j));
      i = j;
    }
    return el;
  }
  function sourcesLine(x) {
    return h("div", { class: "meta" },
      h("span", { class: "grade" }, x.grade || ""),
      h("span", { class: "refs" }, (x.sources || []).map(function (s) { return bookName(s.book) + " \u2066" + s.number + "\u2069"; }).join(T("، "))),
      x.narrator ? h("span", null, T("رواه {name}", { name: x.narrator })) : null);
  }

  FamilyLocal.init({ loadContent: loadContent, pilot: !!CFG.localPilotQuestions });

  // ------------------------------------------------------------------ حالة المجلس والتزامن
  var S = { famId: null, fam: null, rev: null, online: true, lastSync: 0, ui: {} };
  function setOnline(v) {
    if (S.online !== v) { S.online = v; var s = document.querySelector(".sync"); if (s) paintSync(s); }
    if (v) S.lastSync = Date.now();
  }
  function paintSync(el) {
    el.className = "sync" + (S.online ? "" : " down");
    el.textContent = "";
    add(el, [h("span", { class: "dot" }), S.online ? T("متصل — تتحدث الأسماء والنتائج تلقائيًا") : T("انقطع الاتصال — نحاول مجددًا، ولا تُسجَّل الإجابات حتى يعود")]);
  }
  function syncBadge() {
    if (isLocal(S.famId)) return h("p", { class: "sync local" }, h("span", { class: "dot" }), T("مجلس على هذا الجهاز: يُحفظ في هذا المتصفح فقط ولا يتصل بأجهزة أخرى"));
    var s = h("p", { class: "sync" }); paintSync(s); return s;
  }

  function currentMap() { return lsGet(LS_CURRENT, {}); }
  function currentPid() {
    if (!S.fam) return null;
    var pid = currentMap()[S.famId];
    if (pid && S.fam.mine.indexOf(pid) !== -1) return pid;
    return S.fam.mine.length === 1 ? S.fam.mine[0] : null;
  }
  function setCurrent(pid) { setCurrentFor(S.famId, pid); }
  function person(pid) { return S.fam && S.fam.participants.filter(function (p) { return p.id === pid; })[0]; }
  function me() { return person(currentPid()); }
  function isAdmin() { var p = me(); return !!(p && p.is_admin); }
  function shared() { return S.fam && S.fam.mine.length > 1; }

  function loadFamily(fid) {
    return rpc("family_state", { p_family: fid }).then(function (st) {
      S.famId = fid; S.fam = st; S.rev = st.family.rev; return st;
    });
  }

  var pollTimer = null, polling = false;
  function startPoll() {
    clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (!S.famId || polling || document.hidden) return;
      polling = true;
      rpc("family_rev", { p_family: S.famId }).then(function (rev) {
        if (rev !== S.rev) return refreshView();
      }).catch(function (e) {
        if (e.message === "not_member") { S.famId = null; toast(T("لم يعد هذا الجهاز عضوًا في المجلس.")); go("#/"); }
      }).then(function () { polling = false; }, function () { polling = false; });
    }, POLL_MS);
  }
  function stopPoll() { clearInterval(pollTimer); S.famId = null; S.fam = null; }

  var refreshing = false;
  function refreshView() {
    // لا نعيد الرسم والمستخدم يكتب في حقل
    var a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") || dlg.open) return Promise.resolve();
    if (refreshing) return Promise.resolve();
    refreshing = true;
    return render(true).then(function () { refreshing = false; }, function () { refreshing = false; });
  }

  // ------------------------------------------------------------------ شريط «المشارك الحالي»
  function whoBar() {
    var p = me();
    return h("div", { class: "who" },
      h("div", null, h("span", { class: "small" }, T("المشارك الحالي: ")), h("span", { class: "name" }, p ? p.name : T("لم يُحدد"))),
      h("button", { class: "btn", type: "button", onclick: function () { pickParticipant(); } }, T("تغيير المشارك")));
  }

  function openDialog(content) {
    dlg.textContent = "";
    add(dlg, content);
    if (!dlg.open) dlg.showModal();
  }
  function closeDialog() { if (dlg.open) dlg.close(); }
  function ask(message, okLabel, danger, then) {
    openDialog(h("div", { class: "panel" },
      h("p", { id: "dlg-title" }, message),
      h("div", { class: "row" },
        h("button", { class: "btn " + (danger ? "danger" : "primary"), type: "button", onclick: function () { closeDialog(); then(); } }, okLabel),
        h("button", { class: "btn quiet", type: "button", onclick: closeDialog }, T("إلغاء")))));
  }
  function askText(label, value, then) {
    var inp = h("input", { id: "ask-text", type: "text", maxlength: "30", value: value });
    openDialog(h("div", { class: "panel" },
      h("div", { class: "field" }, h("label", { for: "ask-text", id: "dlg-title" }, label), inp),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", onclick: function () { closeDialog(); then(inp.value); } }, T("حفظ")),
        h("button", { class: "btn quiet", type: "button", onclick: closeDialog }, T("إلغاء")))));
    setTimeout(function () { inp.focus(); }, 50);
  }

  // اختيار المشارك على هذا الجهاز (مع رمزه الشخصي إن وُجد)
  function pickParticipant(after) {
    var mine = S.fam.mine.map(person).filter(Boolean);
    var list = h("ul", { class: "list" }, mine.map(function (p) {
      return h("li", null, h("button", { class: "item", type: "button", onclick: function () { choose(p); } },
        h("span", { class: "row" }, h("span", { class: "dot c" + p.color }), h("b", null, p.name), p.has_pin ? h("span", { class: "muted small" }, T("· له رمز")) : null)));
    }));
    function choose(p) {
      rpc("lock_device", {}).catch(function () {}).then(function () {
        if (p.has_pin && shared()) return askPin(p, after);
        setCurrent(p.id); closeDialog(); render(true).then(function () { toast(T("المشارك الحالي: {name}", { name: p.name })); if (after) after(); });
      });
    }
    openDialog(h("div", { class: "panel" },
      h("h2", { id: "dlg-title" }, T("من سيشارك الآن؟")),
      h("p", { class: "muted" }, T("تُسجَّل الإجابات باسم من تختاره فقط.")),
      list,
      addLocalForm(),
      h("button", { class: "btn quiet", type: "button", onclick: closeDialog }, T("إغلاق"))));
  }
  function askPin(p, after) {
    var input = h("input", { id: "pin", type: "password", inputmode: "numeric", autocomplete: "off", maxlength: "6", class: "code" });
    var msg = h("p", { class: "error", hidden: true });
    function submit() {
      rpc("unlock_participant", { p_family: S.famId, p_participant: p.id, p_pin: input.value }).then(function (r) {
        if (r.ok) { setCurrent(p.id); closeDialog(); render(true).then(function () { toast(T("المشارك الحالي: {name}", { name: p.name })); if (after) after(); }); }
        else { msg.hidden = false; msg.textContent = T("الرمز غير صحيح."); input.value = ""; input.focus(); }
      }, function (e) { msg.hidden = false; msg.textContent = errText(e); });
    }
    openDialog(h("div", { class: "panel" },
      h("h2", { id: "dlg-title" }, T("رمز {name}", { name: p.name })),
      h("div", { class: "field" }, h("label", { for: "pin" }, T("أدخل الرمز الشخصي")), input),
      msg,
      h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", onclick: submit }, T("متابعة")),
        h("button", { class: "btn quiet", type: "button", onclick: function () { pickParticipant(after); } }, T("رجوع")))));
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    setTimeout(function () { input.focus(); }, 50);
  }
  function addLocalForm() {
    var name = h("input", { id: "new-name", type: "text", maxlength: "30", autocomplete: "off", placeholder: T("الاسم الأول يكفي") });
    var pin = h("input", { id: "new-pin", type: "password", inputmode: "numeric", maxlength: "6", autocomplete: "off", placeholder: T("اختياري") });
    var lang = langSelect("new-lang", I.lang);
    var msg = h("p", { class: "error", hidden: true });
    var box = h("details", { class: "panel soft" },
      h("summary", null, T("إضافة مشارك على هذا الجهاز")),
      h("div", { class: "stack" },
        h("div", { class: "field" }, h("label", { for: "new-name" }, T("الاسم الظاهر")), name),
        h("div", { class: "field" }, h("label", { for: "new-pin" }, T("رمز شخصي (4–6 أرقام)")), pin,
          h("span", { class: "hint" }, T("يمنع غيره من الإجابة باسمه على الجهاز المشترك."))),
        h("div", { class: "field" }, h("label", { for: "new-lang" }, T("لغته في التحدي")), lang),
        msg,
        h("button", { class: "btn primary", type: "button", onclick: function () {
          rpc("add_local_participant", { p_family: S.famId, p_display_name: name.value, p_pin: pin.value || null }).then(function (r) {
            return loadFamily(S.famId).then(function () {
              setPartLang(S.famId, r.participant_id, lang.value);
              setCurrent(r.participant_id); closeDialog();
              if (r.recovery_code) showRecovery(r.recovery_code, name.value.trim(), function () { render(true); });
              else { var nm = name.value.trim(); render(true).then(function () { toast(T("أُضيف {name} وأصبح المشارك الحالي", { name: nm })); }); }
            });
          }, function (e) { msg.hidden = false; msg.textContent = errText(e); });
        } }, T("إضافة"))));
    return box;
  }
  function showRecovery(code, name, done) {
    openDialog(h("div", { class: "panel" },
      h("h2", { id: "dlg-title" }, name ? T("رمز الاستعادة لـ{name}", { name: name }) : T("رمز الاستعادة")),
      h("p", null, T("احتفظ بهذا الرمز في مكان آمن. به تستعيد مشاركتك ونتائجك إن غيّرت هاتفك أو مسحت بيانات المتصفح. لا تشاركه مع أحد.")),
      h("div", { class: "codebox" }, code),
      h("div", { class: "row" },
        h("button", { class: "btn", type: "button", onclick: function () { copy(code); } }, T("نسخ")),
        h("button", { class: "btn primary", type: "button", onclick: function () { closeDialog(); if (done) done(); } }, T("حفظته")))));
  }

  // ------------------------------------------------------------------ الشاشات
  function page(title, backHash) {
    return h("div", { class: "page-head" },
      backHash ? h("a", { class: "back-link", href: backHash }, svgBack(), T("رجوع")) : null,
      h("h2", { tabindex: "-1" }, title));
  }
  function svgBack() {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", "m9 5 7 7-7 7"); s.appendChild(p);
    return s;
  }
  function fail(e) {
    return [h("div", { class: "panel" }, h("p", { class: "error" }, errText(e)),
      h("a", { class: "btn", href: "#/" }, T("العودة إلى مجالسي")))];
  }

  function viewNotConfigured() {
    return [
      hero(),
      h("div", { class: "panel" },
        h("h2", null, T("المجالس المشتركة بين عدة أجهزة لم تُفعَّل بعد")),
        h("p", null, T("الانضمام من هواتف مختلفة يحتاج خادمًا وقاعدة بيانات تحفظ هوية كل مشارك وتعزل بيانات كل أسرة، وسيُفعَّل في الإصدار القادم.")),
        h("p", { class: "muted" }, T("يمكنكم الآن فتح مجلس على جهاز واحد تتناوبون عليه. لن تعرض الصفحة أي مزامنة وهمية بين الأجهزة.")),
        h("a", { class: "btn primary", href: "#/here" }, T("مجلس على هذا الجهاز")),
        h("a", { class: "btn", href: "#/" }, T("رجوع")))
    ];
  }
  function hero() {
    return h("section", { class: "f-hero" },
      h("h1", null, T("تحدي الأسرة "), h("span", null, "|"), T(" لِنغتنم الأجر")),
      h("p", null, T("مجلس إيماني خاص بأسرتكم: تقرؤون الحديث معًا، وتتأملون معناه، وتجيبون عن سؤال قصير.")));
  }

  function viewHome() {
    return rpc("my_families", {}).then(function (fams) {
      var cont = fams.length ? h("ul", { class: "list" }, fams.map(function (f) {
        return h("li", null, h("a", { class: "item", href: "#/f/" + f.family_id },
          h("b", null, f.name + (f.closed ? T(" (مغلق)") : "")),
          h("span", { class: "muted small" }, (f.local ? T("على هذا الجهاز") : T("مشترك بين الأجهزة")) + " · " + (f.participants || []).map(function (p) { return p.name; }).join(T("، ")))));
      })) : h("p", { class: "muted" }, T("لا توجد مجالس محفوظة على هذا الجهاز بعد."));
      return [
        hero(),
        h("section", { class: "panel" },
          h("h2", null, T("مجلس على هذا الجهاز")),
          h("p", { class: "muted" }, T("تجتمع الأسرة حول هاتف أو جهاز لوحي واحد، ويتناوب أفرادها على الإجابة. لا حساب ولا إنترنت بعد فتح الصفحة، ويُحفظ كل شيء في هذا المتصفح فقط.")),
          h("a", { class: "btn primary block", href: "#/here" }, T("إنشاء مجلس جديد"))),
        remoteOn ? h("section", { class: "panel" },
          h("h2", null, T("مجلس مشترك بين عدة أجهزة")),
          h("p", { class: "muted" }, T("يجيب كل فرد من هاتفه برابط دعوة، وتتحدث النتائج عند الجميع.")),
          h("div", { class: "stack" },
            h("a", { class: "btn block", href: "#/create" }, T("إنشاء مجلس مشترك")),
            h("a", { class: "btn block", href: "#/join" }, T("الانضمام إلى مجلس")))) :
          h("p", { class: "muted small", style: { textAlign: "center" } }, T("الانضمام من هواتف مختلفة سيُفعَّل في الإصدار القادم بعد ربط قاعدة بيانات آمنة.")),
        h("section", { class: "panel" }, h("h2", null, T("متابعة مجلس سابق")), cont,
          remoteOn ? h("a", { class: "link-btn", href: "#/recover" }, T("غيّرت جهازك؟ استعد مشاركتك في مجلس مشترك برمز")) : null),
        h("p", { class: "muted small", style: { textAlign: "center" } }, T("لا يلزم بريد إلكتروني ولا حساب. المجالس خاصة ولا تظهر لغير أعضائها."))
      ];
    });
  }

  function viewCreateLocal() {
    var fname = h("input", { id: "fname", type: "text", maxlength: "60", autocomplete: "off", placeholder: T("مثل: مجلس آل محمد") });
    var dname = h("input", { id: "dname", type: "text", maxlength: "30", autocomplete: "off", placeholder: T("الاسم الأول يكفي") });
    var msg = h("p", { class: "error", hidden: true });
    var form = h("form", { class: "panel", onsubmit: function (e) {
      e.preventDefault(); msg.hidden = true;
      rpc("create_local_family", { p_family_name: fname.value, p_display_name: dname.value }).then(function (r) {
        setCurrentFor(r.family_id, r.participant_id);
        S.justCreated = r.family_id;
        go("#/f/" + r.family_id);
      }, function (e2) { msg.hidden = false; msg.textContent = errText(e2); });
    } },
      h("div", { class: "field" }, h("label", { for: "fname" }, T("اسم الأسرة أو المجلس")), fname),
      h("div", { class: "field" }, h("label", { for: "dname" }, T("اسمك (مسؤول المجلس)")), dname,
        h("span", { class: "hint" }, T("بعدها تضيف أسماء بقية الأسرة على هذا الجهاز."))),
      msg, h("button", { class: "btn primary block", type: "submit" }, T("إنشاء المجلس")));
    return [page(T("مجلس على هذا الجهاز"), "#/"), form,
      h("p", { class: "muted small" }, T("يُحفظ المجلس ونتائجه في هذا المتصفح فقط، ولا ينتقل إلى جهاز آخر، ويُمحى إن مُسحت بيانات المتصفح."))];
  }

  function viewCreate() {
    var fname = h("input", { id: "fname", type: "text", maxlength: "60", autocomplete: "off", placeholder: T("مثل: مجلس آل محمد") });
    var dname = h("input", { id: "dname", type: "text", maxlength: "30", autocomplete: "off", placeholder: T("الاسم الأول يكفي") });
    var msg = h("p", { class: "error", hidden: true });
    var btn = h("button", { class: "btn primary block", type: "submit" }, T("إنشاء المجلس"));
    var form = h("form", { class: "panel", onsubmit: function (e) {
      e.preventDefault(); btn.disabled = true; msg.hidden = true;
      rpc("create_family", { p_family_name: fname.value, p_display_name: dname.value }).then(function (r) {
        setCurrentFor(r.family_id, r.participant_id);
        S.created = r;
        go("#/f/" + r.family_id + "/invite");
      }, function (e2) { btn.disabled = false; msg.hidden = false; msg.textContent = errText(e2); });
    } },
      h("div", { class: "field" }, h("label", { for: "fname" }, T("اسم الأسرة أو المجلس")), fname),
      h("div", { class: "field" }, h("label", { for: "dname" }, T("اسمك الظاهر")), dname,
        h("span", { class: "hint" }, T("ستكون مسؤول المجلس. يظهر اسمك لأعضاء المجلس فقط."))),
      msg, btn);
    return [page(T("إنشاء مجلس جديد"), "#/"), form];
  }
  // أول مرة يُختار فيها مشارك على هذا الجهاز تُثبَّت له اللغة الحالية، فلا تتغير لغته إذا غيّر غيره لغته
  function setCurrentFor(fid, pid) {
    var m = currentMap(); m[fid] = pid; lsSet(LS_CURRENT, m);
    if (!partLang(fid, pid)) setPartLang(fid, pid, I.lang || deviceLang());
  }

  function inviteLink(token) { return location.origin + location.pathname + "#/join/" + token; }
  function invitePanel(inv, famName) {
    var link = inviteLink(inv.invite_token);
    var text = T("ادعوك إلى مجلسنا «{family}» في تحدي الأسرة: نقرأ حديثًا ونتأمل معناه ونجيب عن سؤال قصير.\n{link}\nأو افتح صفحة تحدي الأسرة واكتب الرمز: {code}", { family: famName, link: link, code: inv.join_code }, true);
    var exp = new Date(inv.code_expires_at);
    return h("section", { class: "panel" },
      h("h2", null, T("دعوة الأسرة")),
      h("p", { class: "muted" }, T("أرسل الرابط في مجموعة الأسرة. من يفتحه يكتب اسمه وينضم دون حساب.")),
      h("div", { class: "linkbox" }, link),
      h("div", { class: "row" },
        h("a", { class: "btn primary", href: "https://wa.me/?text=" + encodeURIComponent(text), target: "_blank", rel: "noopener noreferrer" }, T("مشاركة عبر واتساب")),
        h("button", { class: "btn", type: "button", onclick: function () { copy(link); } }, T("نسخ الرابط"))),
      h("p", { class: "muted" }, T("أو رمز الانضمام المؤقت:")),
      h("div", { class: "codebox" }, inv.join_code.slice(0, 4) + "-" + inv.join_code.slice(4)),
      h("p", { class: "muted small" }, inv.code_expired ? T("انتهت مدة الرمز؛ الرابط ما زال يعمل، أو جدّد الدعوة من الإعدادات.") :
        T("يعمل الرمز حتى {time}. الرابط يبقى صالحًا حتى تلغيه.", { time: I.date(exp, { weekday: "long", hour: "numeric", minute: "2-digit" }) })));
  }

  function viewInvite(fid) {
    var created = S.created && S.created.family_id === fid ? S.created : null;
    return loadFamily(fid).then(function () {
      var p = me();
      var getInv = created ? Promise.resolve(created) : rpc("get_invite", { p_family: fid, p_actor: p && p.id });
      return getInv.then(function (inv) {
        var out = [page(T("تم إنشاء المجلس"), null), h("p", { class: "muted" }, T("مجلس «{family}» جاهز.", { family: S.fam.family.name }))];
        if (inv) out.push(invitePanel(inv, S.fam.family.name));
        out.push(h("a", { class: "btn primary block", href: "#/f/" + fid }, T("ادخل المجلس")));
        if (created && created.recovery_code) {
          var rc = created.recovery_code; S.created.recovery_code = null;
          setTimeout(function () { showRecovery(rc, p && p.name); }, 300);
        }
        return out;
      });
    });
  }

  function viewJoin(token) {
    var code = h("input", { id: "jcode", type: "text", maxlength: "9", autocomplete: "off", class: "code", placeholder: "XXXX-XXXX" });
    var msg = h("p", { class: "error", hidden: true });
    var area = h("div", { class: "stack" });
    function step2(info, args) {
      area.textContent = "";
      var name = h("input", { id: "jname", type: "text", maxlength: "30", autocomplete: "off", placeholder: T("الاسم الأول يكفي") });
      var m2 = h("p", { class: "error", hidden: true });
      var btn = h("button", { class: "btn primary block", type: "submit" }, T("انضمام"));
      add(area, h("form", { class: "panel", onsubmit: function (e) {
        e.preventDefault(); btn.disabled = true;
        rpc("join_family", { p_display_name: name.value, p_token: args.p_token || null, p_code: args.p_code || null }).then(function (r) {
          setCurrentFor(r.family_id, r.participant_id);
          showRecovery(r.recovery_code, name.value.trim(), function () { go("#/f/" + r.family_id); });
        }, function (e2) { btn.disabled = false; m2.hidden = false; m2.textContent = errText(e2); });
      } },
        h("p", null, T("ستنضم إلى مجلس: "), h("b", null, info.family_name)),
        info.already_member ? h("p", { class: "banner" }, T("هذا الجهاز عضو في المجلس من قبل. تابع فقط إن أردت إضافة مشارك آخر يستعمل الجهاز نفسه.")) : null,
        h("div", { class: "field" }, h("label", { for: "jname" }, T("اسمك الظاهر")), name,
          h("span", { class: "hint" }, T("يكفي الاسم الأول. لا نطلب عمرًا ولا بيانات أخرى."))),
        m2, btn,
        info.already_member ? h("a", { class: "btn block", href: "#/" }, T("دخول مجالسي")) : null));
      setTimeout(function () { name.focus(); }, 50);
    }
    if (token) {
      return rpc("peek_invite", { p_token: token }).then(function (info) {
        // نزيل الرمز من شريط العنوان بعد قراءته
        history.replaceState(null, "", location.pathname + "#/join");
        step2(info, { p_token: token });
        return [page(T("الانضمام إلى مجلس"), "#/"), area];
      });
    }
    var form = h("form", { class: "panel", onsubmit: function (e) {
      e.preventDefault(); msg.hidden = true;
      rpc("peek_invite", { p_code: code.value }).then(function (info) { form.hidden = true; step2(info, { p_code: code.value }); },
        function (e2) { msg.hidden = false; msg.textContent = errText(e2); });
    } },
      h("p", { class: "muted" }, T("افتح رابط الدعوة الذي وصلك، أو اكتب رمز الانضمام.")),
      h("div", { class: "field" }, h("label", { for: "jcode" }, T("رمز الانضمام")), code),
      msg, h("button", { class: "btn primary block", type: "submit" }, T("متابعة")));
    return [page(T("الانضمام إلى مجلس"), "#/"), form, area];
  }

  function viewRecover() {
    var code = h("input", { id: "rcode", type: "text", maxlength: "14", autocomplete: "off", class: "code", placeholder: "XXXX-XXXX-XXXX" });
    var msg = h("p", { class: "error", hidden: true });
    function redeem(fn) {
      msg.hidden = true;
      rpc(fn, { p_code: code.value }).then(function (r) { setCurrentFor(r.family_id, r.participant_id); toast(T("عادت مشاركتك إلى هذا الجهاز")); go("#/f/" + r.family_id); },
        function (e) { msg.hidden = false; msg.textContent = errText(e); });
    }
    return [page(T("استعادة مشاركتي"), "#/"),
      h("div", { class: "panel" },
        h("p", null, T("اكتب رمز الاستعادة الذي ظهر لك عند الانضمام، أو رمز إعادة الربط الذي يصدره لك مسؤول المجلس.")),
        h("div", { class: "field" }, h("label", { for: "rcode" }, T("الرمز")), code),
        msg,
        h("div", { class: "row" },
          h("button", { class: "btn primary", type: "button", onclick: function () { redeem(code.value.replace(/[^A-Za-z0-9]/g, "").length > 8 ? "redeem_recovery" : "redeem_relink_code"); } }, T("استعادة"))),
        h("p", { class: "muted small" }, T("لا تكفي كتابة الاسم لاستعادة المشاركة، حتى لا يدخل أحد باسم غيره.")))];
  }

  var KIND_AR = { c3: "تحدي ٣ أحاديث", c5: "تحدي ٥ أحاديث", c10: "تحدي ١٠ أحاديث", week: "تحدي الأسبوع" };
  var LEVEL_AR = { kids: "أطفال", general: "عام", advanced: "متقدم" };

  function viewFamily(fid) {
    return loadFamily(fid).then(function (st) {
      var p = me(), out = [];
      out.push(h("div", { class: "page-head" }, h("a", { class: "back-link", href: "#/" }, svgBack(), T("مجالسي")), h("h2", { tabindex: "-1" }, st.family.name)));
      if (st.family.closed) out.push(h("p", { class: "banner" }, T("المجلس مغلق: يمكن الاطلاع على النتائج فقط.")));
      out.push(whoBar());
      out.push(syncBadge());
      var local = !!st.local;
      if (local && st.participants.length === 1) out.push(h("section", { class: "panel gold" },
        h("h3", null, T("الخطوة التالية: أضيفوا أفراد الأسرة")),
        h("p", null, T("لكل فرد اسم وسجل إجابات مستقل. يكفي الاسم الأول، ويمكن وضع رمز شخصي اختياري يمنع غيره من الإجابة باسمه."))));
      out.push(h("section", { class: "panel" },
        h("h3", null, T("أعضاء المجلس")),
        h("ul", { class: "chips" }, st.participants.map(function (x) {
          return h("li", { class: "chip" + (local || x.present ? "" : " off") }, h("span", { class: "dot c" + x.color }), x.name,
            x.is_admin ? h("span", { class: "tag" }, T("مسؤول")) : null,
            !local && x.present ? h("span", { class: "tag" }, T("حاضر")) : null);
        })),
        local ? (st.family.closed ? null : h("button", { class: "btn", type: "button", onclick: function () { pickParticipant(); } }, T("إضافة فرد من الأسرة")))
          : h("p", { class: "muted small" }, T("«حاضر» تعني أن جهازه فتح المجلس خلال الدقيقة الأخيرة."))));
      var active = st.challenges.filter(function (c) { return c.status === "active"; });
      var done = st.challenges.filter(function (c) { return c.status === "done"; });
      out.push(h("section", { class: "panel" },
        h("h2", null, T("التحديات الجارية")),
        active.length ? h("ul", { class: "list" }, active.map(chItem)) : h("p", { class: "muted" }, isAdmin() ? T("لا يوجد تحدٍّ جارٍ. ابدأ أول تحدٍّ للأسرة.") : T("لا يوجد تحدٍّ جارٍ. سيظهر هنا حين يبدؤه مسؤول المجلس.")),
        isAdmin() && !st.family.closed ? h("a", { class: "btn primary block", href: "#/f/" + fid + "/new" }, T("تحدٍّ جديد")) : null));
      out.push(h("section", { class: "panel" },
        h("h2", null, T("سجل التحديات السابقة")),
        done.length ? h("ul", { class: "list" }, done.map(chItem)) : h("p", { class: "muted" }, T("لم تكتمل تحديات بعد."))));
      out.push(h("a", { class: "btn block", href: "#/f/" + fid + "/settings" }, isAdmin() ? T("إعدادات المجلس والخصوصية") : T("إعداداتي في المجلس")));
      if (!p) setTimeout(function () { pickParticipant(); }, 100);
      else if (S.justCreated === fid) { S.justCreated = null; setTimeout(function () { pickParticipant(); var d = dlg.querySelector("details"); if (d) d.open = true; }, 150); }
      return out;
      function chItem(c) {
        var d = new Date(c.created_at);
        return h("li", null, h("a", { class: "item", href: "#/f/" + fid + "/c/" + c.id + (c.status === "done" ? "/board" : "") },
          h("b", null, T(KIND_AR[c.kind]) + " · " + T(LEVEL_AR[c.level])),
          h("span", { class: "muted small" }, I.date(d, { day: "numeric", month: "long" }) + " · " + (c.show_ranking ? T("مع الترتيب") : T("تعاوني")) + (c.status === "done" ? " · " + T("مكتمل") : ""))));
      }
    });
  }

  function viewNew(fid) {
    return loadFamily(fid).then(function () {
      if (!isAdmin()) return [page(T("تحدٍّ جديد"), "#/f/" + fid), h("p", { class: "panel" }, T(ERR.not_admin))];
      var sel = { kind: "c3", level: "general" };
      function group(name, items) {
        var wrap = h("div", { class: "options", role: "group" });
        items.forEach(function (it) {
          var b = h("button", { class: "opt", type: "button", "aria-pressed": String(sel[name] === it[0]), onclick: function () {
            sel[name] = it[0];
            Array.prototype.forEach.call(wrap.children, function (x) { x.setAttribute("aria-pressed", "false"); });
            b.setAttribute("aria-pressed", "true");
          } }, h("b", null, it[1]), h("span", null, it[2]));
          wrap.appendChild(b);
        });
        return wrap;
      }
      var rank = h("input", { type: "checkbox", id: "rank" });
      var retry = h("input", { type: "checkbox", id: "retry" });
      var msg = h("p", { class: "error", hidden: true });
      var btn = h("button", { class: "btn primary block", type: "button", onclick: function () {
        btn.disabled = true;
        rpc("create_challenge", { p_family: fid, p_actor: me().id, p_kind: sel.kind, p_level: sel.level, p_allow_retry: retry.checked, p_show_ranking: rank.checked })
          .then(function (cid) { go("#/f/" + fid + "/c/" + cid); }, function (e) { btn.disabled = false; msg.hidden = false; msg.textContent = errText(e); });
      } }, T("ابدأ التحدي"));
      return [page(T("تحدٍّ جديد"), "#/f/" + fid), whoBar(),
        S.fam.pilot_questions ? h("p", { class: "banner" }, T("نسخة تجريبية: بعض الأسئلة لم يعتمدها المراجع الشرعي بعد.")) : null,
        h("section", { class: "panel" }, h("h3", null, T("مدة التحدي")), group("kind", [
          ["c3", T("تحدي ٣ أحاديث"), T("جلسة قصيرة")], ["c5", T("تحدي ٥ أحاديث"), T("جلسة أسرية")],
          ["c10", T("تحدي ١٠ أحاديث"), T("جلسة موسعة")], ["week", T("تحدي الأسبوع"), T("حديث كل يوم لسبعة أيام")]])),
        h("section", { class: "panel" }, h("h3", null, T("مستوى الأسئلة")), group("level", [
          ["kids", T("أطفال"), T("سؤال قصير وخياران وخط كبير، ويقرؤه ولي الأمر")], ["general", T("عام"), T("سؤالان لكل حديث")], ["advanced", T("متقدم"), T("أسئلة في المعنى والجزاء")]]),
          h("p", { class: "muted small" }, T("نص الحديث لا يتغير مع المستوى؛ يتغير شكل السؤال فقط."))),
        h("section", { class: "panel" },
          h("label", { class: "switch", for: "rank" }, rank, h("span", null, h("b", null, T("إظهار الترتيب")), h("br"), h("span", { class: "muted small" }, T("الافتراضي نمط تعاوني: «هدفنا أن نكمل التحدي معًا».")))),
          h("label", { class: "switch", for: "retry" }, retry, h("span", null, h("b", null, T("السماح بإعادة المحاولة")), h("br"), h("span", { class: "muted small" }, T("يعرف المشارك فورًا إن أخطأ ويحاول مرة أخرى (حتى ثلاث محاولات)."))))),
        msg, btn];
    });
  }

  var FAMILY_PAUSES = [
    "ما أكثر أجر لفت انتباهنا اليوم؟",
    "ما العمل الذي لم نكن نعرف فضله؟",
    "كيف نعين بعضنا على فعل هذا الخير؟",
    "ما الموقف الذي يمكننا تطبيق الحديث فيه؟"
  ];
  var DIALOGUE = [
    "ما العمل الذي نرغب أن نحرص عليه هذا الأسبوع؟",
    "متى يمكن أن نعمل بهذا الحديث في يومنا؟",
    "من نعرف ممن يحتاج أن نذكّره بهذا الأجر؟"
  ];

  function viewChallenge(fid, cid) {
    return Promise.all([loadFamily(fid), loadContent()]).then(function () {
      var p = me();
      if (!p) { setTimeout(function () { pickParticipant(); }, 100); return [page(T("التحدي"), "#/f/" + fid), whoBar(), h("p", { class: "panel" }, T("اختر المشارك أولًا."))]; }
      return rpc("challenge_view", { p_family: fid, p_challenge: cid, p_participant: p.id }).then(function (c) {
        var ui = S.ui[cid] || (S.ui[cid] = { idx: c.current_index, serverIdx: c.current_index, stage: {}, pick: {} });
        if (ui.serverIdx !== c.current_index) { ui.idx = c.current_index; ui.serverIdx = c.current_index; }
        if (ui.idx > c.unlocked_index) ui.idx = c.unlocked_index;
        var n = c.hadith_ids.length, idx = ui.idx;
        var hid = c.hadith_ids[idx], x = content.byId[hid];
        var qs = c.questions.filter(function (q) { return q.hadith_index === idx; });
        var stage = ui.stage[idx] || (qs.some(function (q) { return q.mine || q.revealed; }) ? 3 : 1);
        var answeredAll = c.questions.filter(function (q) { return q.mine; }).length;
        var root = [];
        root.push(h("div", { class: "page-head" }, h("a", { class: "back-link", href: "#/f/" + fid }, svgBack(), T("المجلس")),
          h("h2", { tabindex: "-1" }, T(KIND_AR[c.kind]) + " · " + T(LEVEL_AR[c.level]))));
        if (S.fam.pilot_questions) root.push(h("p", { class: "banner" }, T("نسخة تجريبية: الأسئلة مستخرجة من نص البطاقات ولم يعتمدها المراجع الشرعي بعد.")));
        root.push(whoBar(), syncBadge());
        root.push(h("div", { class: "stack" },
          h("div", { class: "row spread" }, h("span", null, T(c.kind === "week" ? "اليوم {i} من {n}" : "الحديث {i} من {n}", { i: N(idx + 1), n: N(n) })),
            h("a", { class: "link-btn", href: "#/f/" + fid + "/c/" + cid + "/board" }, T("نتائج الأسرة"))),
          h("div", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(c.questions.length), "aria-valuenow": String(answeredAll) },
            h("span", { style: { width: Math.round(100 * answeredAll / Math.max(1, c.questions.length)) + "%" } })),
          h("p", { class: "muted small" }, T("{name}: أجبت عن {a} من {n} أسئلة", { name: p.name, a: N(answeredAll), n: N(c.questions.length) }))));
        root.push(h("ol", { class: "steps" }, [T("القراءة"), T("المعنى"), T("السؤال")].map(function (t, i) { return h("li", { class: stage >= i + 1 ? "on" : "" }, t); })));

        if (!x) {
          root.push(h("p", { class: "panel" }, T("هذا الحديث غير متاح في نسخة المحتوى الحالية.")));
        } else {
          // أولًا وثانيًا: قراءة الحديث بلغة المشارك (ترجمة المعنى إن وُجدت، وإلا العربية مع تنبيه)
          var L = localized(x), arAttr = L.missing ? { lang: "ar", dir: "rtl" } : {};
          var arBox = L.tr ? h("div", { class: "ar-orig", lang: "ar", dir: "rtl", hidden: !ui.showAr },
            h("p", { class: "ar-h" }, I.t("tr.ar_heading")), x.lead ? h("p", { class: "lead" }, x.lead) : null, hadithText(x)) : null;
          root.push(h("article", { class: "panel hadith" + (c.level === "kids" ? " kids" : "") },
            h("div", { class: "stage-title" }, h("span", { class: "n" }, N(1)), T("نقرأ الحديث")),
            h("h3", Object.assign({ class: "h-title" }, arAttr), L.title),
            L.tr ? h("p", { class: "tr-label" }, h("span", null, I.t("tr.label")),
              h("span", { class: "tr-status " + (I.isApproved(L.status) ? "ok" : "draft") }, I.t(I.isApproved(L.status) ? "tr.approved" : "tr.draft"))) : null,
            L.missing ? h("p", { class: "banner" }, T("لم تكتمل ترجمة هذا الحديث إلى لغتك بعد، فعرضناه بالعربية.")) : null,
            L.lead ? h("p", Object.assign({ class: "lead" }, arAttr), L.lead) : null,
            (function () { var el = hadithText(L); if (L.missing) { el.lang = "ar"; el.dir = "rtl"; } return el; })(),
            L.tr ? h("div", { class: "tr-row" }, h("p", { class: "tr-note" }, I.t("tr.label_note")),
              h("button", { class: "link-btn", type: "button", "aria-expanded": String(!!ui.showAr), onclick: function () { ui.showAr = !ui.showAr; render(true); } },
                I.t(ui.showAr ? "tr.hide_ar" : "tr.show_ar"))) : null,
            arBox,
            sourcesLine(L),
            isAdmin() ? h("p", { class: "muted small" }, T("يقرؤه المسؤول بصوت مرتفع لأهل البيت.")) : null,
            stage === 1 ? h("button", { class: "btn flip", type: "button", onclick: function () { ui.stage[idx] = 2; render(true); } }, T("اكتشف المعنى")) : null));
          // ثالثًا: اكتشاف المعنى
          if (stage >= 2) {
            root.push(h("section", { class: "panel reflect fade-in" },
              h("div", { class: "stage-title" }, h("span", { class: "n" }, N(2)), T("نكتشف المعنى")),
              h("div", null, h("h4", null, T("المعنى ببساطة")), h("p", arAttr, L.meaning)),
              c.level !== "kids" && L.imani ? h("div", null, h("h4", null, T("وقفة إيمانية")), h("p", arAttr, L.imani)) : null,
              L.tarbawi ? h("div", null, h("h4", null, T("وقفة تربوية")), h("p", arAttr, L.tarbawi)) : null,
              stage === 2 ? h("button", { class: "btn primary", type: "button", onclick: function () { ui.stage[idx] = 3; render(true); } }, T("إلى السؤال")) : null));
          }
          // رابعًا إلى سادسًا: الأسئلة
          if (stage >= 3) {
            if (!qs.length) root.push(h("p", { class: "panel muted" }, T("لا سؤال لهذا الحديث في هذا المستوى.")));
            qs.forEach(function (q, qi) { root.push(questionCard(c, q, qi, ui, fid, cid)); });
          }
        }
        // وقفة مع الأسرة بعد كل ثلاثة أحاديث وفي آخر التحدي
        if (stage >= 3 && ((idx + 1) % 3 === 0 || idx === n - 1) && qs.every(function (q) { return q.revealed; })) {
          root.push(h("section", { class: "panel gold fade-in" },
            h("h3", null, T("وقفة مع الأسرة")),
            h("p", { style: { fontSize: "1.15rem" } }, T(FAMILY_PAUSES[Math.floor(idx / 3) % FAMILY_PAUSES.length])),
            h("p", { class: "muted small" }, T("للحوار بينكم شفهيًا. ليست اختبارًا، ولا تُحفظ الإجابات، ولا تدخل في النقاط."))));
        }
        // التنقل
        var nav = h("nav", { class: "row spread" });
        add(nav, h("button", { class: "btn", type: "button", disabled: idx === 0, onclick: function () { ui.idx = idx - 1; render(true); } }, T("السابق")));
        if (idx < n - 1) {
          var locked = idx + 1 > c.unlocked_index;
          add(nav, h("button", { class: "btn primary", type: "button", disabled: locked, onclick: function () {
            ui.idx = idx + 1;
            if (isAdmin() && c.status === "active" && idx + 1 > c.current_index) {
              rpc("set_current_index", { p_family: fid, p_actor: me().id, p_challenge: cid, p_index: idx + 1 }).then(function () { ui.serverIdx = idx + 1; render(true); }, function () { render(true); });
            } else render(true);
          } }, locked ? T("يُفتح غدًا إن شاء الله") : T("الحديث التالي")));
        } else if (isAdmin() && c.status === "active") {
          add(nav, h("button", { class: "btn primary", type: "button", onclick: function () {
            rpc("finish_challenge", { p_family: fid, p_actor: me().id, p_challenge: cid }).then(function () { go("#/f/" + fid + "/c/" + cid + "/board"); }, function (e) { toast(errText(e)); });
          } }, T("إنهاء التحدي وعرض النتائج")));
        } else {
          add(nav, h("a", { class: "btn primary", href: "#/f/" + fid + "/c/" + cid + "/board" }, c.status === "done" ? T("إنجاز الأسرة") : T("نتائج الأسرة")));
        }
        root.push(nav);
        if (isAdmin() && !isLocal(fid) && c.current_index !== idx) root.push(h("p", { class: "muted small" }, T("بقية الأجهزة على الحديث {n}.", { n: N(c.current_index + 1) })));
        return root;
      });
    });
  }

  function questionCard(c, q, qi, ui, fid, cid) {
    var p = me();
    var key = q.key, mine = q.mine, revealed = q.revealed;
    var pickKey = q.id + "|" + p.id;
    var picked = ui.pick[pickKey];
    var verbatim = q.qtype === "reward";
    var qt = qtext(q, key), arAttr = qt.missing ? { lang: "ar", dir: "rtl" } : {};
    var choices = h("div", Object.assign({ class: "choices" + (q.choices.length === 2 ? " two" : "") }, arAttr));
    var canAnswer = c.status === "active" && !revealed && !S.fam.family.closed && (!mine || (c.allow_retry && mine.correct === false && mine.attempts < 3));
    qt.choices.forEach(function (t, i) {
      var cls = "choice" + (verbatim ? " verbatim" : "");
      if (revealed && key && key.correct === i) cls += " right";
      if (mine && mine.last_choice === i && revealed && key && key.correct !== i) cls += " mine-wrong";
      add(choices, h("button", { class: cls, type: "button", disabled: !canAnswer,
        "aria-pressed": String(picked === i || (!canAnswer && mine && mine.last_choice === i)),
        onclick: function () { ui.pick[pickKey] = i; render(true); } }, t));
    });
    var card = h("section", { class: "panel question" + (c.level === "kids" ? " kids" : "") },
      h("div", { class: "stage-title" }, h("span", { class: "n" }, N(3)), qi === 0 ? T("السؤال") : T("سؤال آخر")),
      qt.missing ? h("p", { class: "banner" }, T("هذا السؤال لم يُترجم بعد إلى لغتك، فعرضناه بالعربية. مفتاح الإجابة واحد في كل اللغات.")) : null,
      qt.tr && !I.isApproved(qt.status) ? h("p", { class: "tr-label" }, h("span", { class: "tr-status draft" }, I.t("tr.draft"))) : null,
      h("p", Object.assign({ class: "prompt" }, arAttr), qt.prompt),
      choices);

    // تأكيد اسم المشارك قبل التسجيل
    if (canAnswer && picked != null) {
      add(card, h("div", { class: "confirm fade-in" },
        h("p", null, T("ستُسجَّل هذه الإجابة باسم:")),
        h("p", { class: "who-big" }, p.name),
        h("div", { class: "row" },
          h("button", { class: "btn primary", type: "button", onclick: function (e) {
            e.target.disabled = true;
            rpc("submit_answer", { p_family: fid, p_challenge: cid, p_participant: p.id, p_question: q.id, p_choice: picked }).then(function (r) {
              delete ui.pick[pickKey];
              if (r.status === "duplicate") toast(T("سبق تسجيل إجابة {name} لهذا السؤال.", { name: p.name }));
              else if (r.status === "closed") toast(T("انتهت مرحلة الإجابة لهذا السؤال."));
              else if (c.allow_retry && r.correct === false) toast(r.can_retry ? T("ليست هذه. حاول مرة أخرى.") : T("انتهت المحاولات."));
              else toast(T("سُجّلت إجابة {name}", { name: p.name }));
              S.handoff = shared() ? q.id : null;
              render(true);
            }, function (e2) { e.target.disabled = false; toast(errText(e2)); });
          } }, T("تأكيد")),
          h("button", { class: "btn", type: "button", onclick: function () { pickParticipant(); } }, T("لستُ {name}", { name: p.name })))));
    }
    if (mine && !revealed) {
      add(card, h("p", { class: "answer-note" }, c.allow_retry && mine.correct === true ? T("أحسنت، إجابة صحيحة.") :
        c.allow_retry && mine.correct === false && mine.attempts < 3 ? T("ليست هذه. اختر مرة أخرى.") :
        T("سُجّلت إجابة {name}. تظهر الإجابة الصحيحة بعد انتهاء مرحلة الإجابة.", { name: p.name })));
    }
    // من أجاب ومن ينتظر — الأسماء فقط، دون إجاباتهم
    var waiting = S.fam.participants.filter(function (x) { return q.answered_by.indexOf(x.id) === -1; });
    add(card, h("ul", { class: "chips", "aria-label": T("حالة الإجابة") }, S.fam.participants.map(function (x) {
      var did = q.answered_by.indexOf(x.id) !== -1;
      return h("li", { class: "chip" + (did ? " done" : " off") }, h("span", { class: "dot c" + x.color }), x.name, h("span", { class: "tag" }, did ? T("أجاب") : T("لم يجب بعد")));
    })));
    // الجهاز المشترك: تسليم الدور
    if (S.handoff === q.id && shared() && !revealed) {
      var next = S.fam.mine.map(person).filter(function (x) { return x && q.answered_by.indexOf(x.id) === -1; });
      if (next.length) {
        add(card, h("div", { class: "panel soft fade-in" },
          h("p", null, T("انتهى دور {name}. سلّم الجهاز إلى:", { name: p.name })),
          h("div", { class: "row" }, next.map(function (x) {
            return h("button", { class: "btn", type: "button", onclick: function () {
              rpc("lock_device", {}).catch(function () {}).then(function () {
                if (x.has_pin) askPin(x); else { setCurrent(x.id); S.handoff = q.id; render(true).then(function () { toast(T("المشارك الحالي: {name}", { name: x.name })); }); }
              });
            } }, x.name);
          }))));
      }
    }
    if (!revealed && isAdmin() && c.status === "active") {
      add(card, h("button", { class: "btn quiet", type: "button", onclick: function () {
        rpc("reveal_question", { p_family: fid, p_actor: me().id, p_challenge: cid, p_question: q.id }).then(function () { render(true); }, function (e) { toast(errText(e)); });
      } }, waiting.length ? T("إنهاء مرحلة الإجابة وإظهار الجواب ({n} لم يجيبوا)", { n: N(waiting.length) }) : T("إظهار الجواب")));
    }
    // سادسًا: النتيجة والتأمل
    if (revealed && key) {
      add(card, h("div", { class: "explain fade-in" },
        mine ? h("p", null, h("b", null, mine.correct ? T("إجابة {name} صحيحة.", { name: p.name }) : T("إجابة {name} لم تكن الصحيحة.", { name: p.name }))) : null,
        h("p", arAttr, qt.explanation),
        h("p", { class: "muted small" }, T("المصدر: {source}", { source: qt.source }))));
      add(card, h("div", { class: "panel soft" },
        h("p", null, h("b", null, T("سؤال للحوار (اختياري): ")), T(DIALOGUE[qi % DIALOGUE.length])),
        h("p", { class: "muted small" }, T("تحدثوا فيه معًا؛ لا يُكتب ولا يُحفظ."))));
    }
    return card;
  }

  // عدّ عربي بسيط: ١ حديث، ٢ حديثان، ٣–١٠ أحاديث، ١١+ حديثًا. وفي اللغات الأخرى صيغ الجمع من قاموسها (مفتاحها صيغة المفرد العربية)
  function countOf(n, one, two, few, many) {
    if (I.lang !== I.reg.source) { var v = I.plural(one, n); if (v && v !== one) return v; }
    if (n === 1) return one;
    if (n === 2) return two;
    return N(n) + " " + (n >= 3 && n <= 10 ? few : many);
  }

  function viewBoard(fid, cid) {
    return loadFamily(fid).then(function () {
      return rpc("challenge_board", { p_family: fid, p_challenge: cid }).then(function (b) {
        var rows = b.rows.slice();
        var totalQ = b.total * rows.length;
        var answered = rows.reduce(function (a, r) { return a + r.answered; }, 0);
        var correct = rows.reduce(function (a, r) { return a + r.correct; }, 0);
        var allDone = rows.length > 0 && rows.every(function (r) { return r.complete; });
        var finished = b.status === "done" || allDone;
        if (b.show_ranking) rows.sort(function (a, r) { return r.correct - a.correct || r.answered - a.answered; });
        var out = [page(finished ? T("إنجاز الأسرة المشترك") : T("نتائج الأسرة"), "#/f/" + fid + "/c/" + cid), syncBadge()];
        // إنجاز الأسرة المشترك: إنجاز واحد للمجلس كله، لا إعلان فائز
        if (finished) {
          var reached = b.status === "done" ? b.hadith_count : b.hadiths_reached;
          out.push(h("section", { class: "panel soft celebrate fade-in" },
            h("p", { class: "big" }, T("أحسنتم يا أهل المجلس!")),
            h("p", { class: "achv" }, T("أكملتم قراءة {hadiths}، وأجبتم عن {correct} إجابة صحيحة من أصل {answered}.", {
              hadiths: countOf(reached, "حديث واحد", "حديثين", "أحاديث", "حديثًا"),
              correct: countOf(correct, "سؤال واحد", "سؤالين", "أسئلة", "سؤالًا"), answered: N(answered) })),
            !allDone ? h("p", { class: "muted small" }, T("شارك {people} من {total}.", { people: countOf(rows.filter(function (r) { return r.answered > 0; }).length, "فرد واحد", "فردان", "أفراد", "فردًا"), total: N(rows.length) })) : null));
          out.push(h("section", { class: "panel gold" },
            h("h3", null, T("سؤال المجلس الختامي")),
            h("p", { class: "closing" }, T("ما العمل الذي نحب أن نبدأ بالمحافظة عليه؟")),
            h("p", { class: "muted small" }, T("تحدثوا فيه معًا. لا يُكتب ولا يُحفظ."))));
        }
        var details = h("details", { class: "panel", open: b.show_ranking || !finished },
          h("summary", null, b.show_ranking ? T("ترتيب نقاط المعرفة") : finished ? T("تفاصيل مشاركة كل فرد") : T("هدفنا أن نكمل التحدي معًا")),
          h("div", { class: "progress" }, h("span", { style: { width: Math.round(100 * answered / Math.max(1, totalQ)) + "%" } })),
          h("p", { class: "muted small" }, T("تقدّم الأسرة: {a} من {t} إجابة", { a: N(answered), t: N(totalQ) })),
          h("table", { class: "board" },
            h("thead", null, h("tr", null,
              b.show_ranking ? h("th", null, "#") : null,
              h("th", null, T("المشارك")), h("th", null, T("أجاب")), h("th", null, T("نقاط المعرفة")), h("th", null, T("الحالة")))),
            h("tbody", null, rows.map(function (r, i) {
              return h("tr", null,
                b.show_ranking ? h("td", { class: "num" }, N(i + 1)) : null,
                h("td", null, h("span", { class: "nm" }, h("span", { class: "dot c" + r.color }), r.name)),
                h("td", { class: "num" }, N(r.answered) + "/" + N(b.total)),
                h("td", { class: "num" }, N(r.correct)),
                h("td", null, r.complete ? T("أكمل ✓") : T("مستمر")));
            }))),
          h("p", { class: "muted small" }, T("نقاط المعرفة تُحتسب للإجابات الصحيحة بعد ظهور الجواب. وهي لقياس المشاركة والفهم في هذا المجلس فقط، لا للأجر ولا للمنزلة عند الله.")));
        out.push(details);
        out.push(h("a", { class: "btn block", href: "#/f/" + fid + "/c/" + cid }, finished ? T("مراجعة الأحاديث والأجوبة") : T("العودة إلى الأحاديث والأسئلة")));
        out.push(h("a", { class: "btn quiet block", href: "#/f/" + fid }, T("العودة إلى المجلس")));
        return out;
      });
    });
  }

  function viewSettings(fid) {
    return loadFamily(fid).then(function () {
      var p = me(), local = isLocal(fid), out = [page(isAdmin() ? T("إعدادات المجلس والخصوصية") : T("إعداداتي في المجلس"), "#/f/" + fid), whoBar()];
      if (!p) return out;
      // إعداداتي
      var rn = h("input", { id: "rn", type: "text", maxlength: "30", value: p.name });
      var mylang = langSelect("mylang", I.lang);
      var pin = h("input", { id: "mypin", type: "password", inputmode: "numeric", maxlength: "6", autocomplete: "off", placeholder: p.has_pin ? T("اتركه فارغًا لإزالته") : T("4–6 أرقام") });
      out.push(h("section", { class: "panel" },
        h("h2", null, T("مشاركتي: {name}", { name: p.name })),
        h("div", { class: "field" }, h("label", { for: "rn" }, T("تغيير الاسم الظاهر")), rn,
          h("span", { class: "hint" }, T("تبقى إجاباتك ونتائجك كما هي؛ فهي مرتبطة بهويتك لا باسمك."))),
        h("button", { class: "btn small", type: "button", onclick: function () { act("rename_participant", { p_family: fid, p_actor: p.id, p_target: p.id, p_name: rn.value }, T("تم تغيير الاسم")); } }, T("حفظ الاسم")),
        h("div", { class: "field" }, h("label", { for: "mypin" }, p.has_pin ? T("تغيير الرمز الشخصي") : T("رمز شخصي اختياري")), pin,
          h("span", { class: "hint" }, T("على الجهاز المشترك يمنع غيرك من الإجابة باسمك."))),
        h("button", { class: "btn small", type: "button", onclick: function () { act("set_pin", { p_family: fid, p_participant: p.id, p_new_pin: pin.value || null }, pin.value ? T("حُفظ الرمز") : T("أُزيل الرمز")); } }, T("حفظ الرمز")),
        h("div", { class: "field" }, h("label", { for: "mylang" }, T("لغتي في التحدي")), mylang,
          h("span", { class: "hint" }, T("تغيير لغتك لا يغيّر اسمك ولا نتائجك ولا لغة أي مشارك آخر."))),
        h("button", { class: "btn small", type: "button", onclick: function () {
          setPartLang(fid, p.id, mylang.value);
          ensureLang(mylang.value).then(function () { toast(T("حُفظت اللغة")); render(true); });
        } }, T("حفظ اللغة")),
        local ? null : h("div", { class: "row" },
          h("button", { class: "btn small", type: "button", onclick: function () {
            rpc("new_recovery_code", { p_family: fid, p_participant: p.id }).then(function (code) { showRecovery(code, p.name); }, function (e) { toast(errText(e)); });
          } }, T("رمز استعادة جديد")),
          h("button", { class: "btn small", type: "button", onclick: function () {
            ask(T("إزالة {name} من هذا الجهاز فقط؟ تبقى مشاركته ونتائجه، ويعود برمز الاستعادة.", { name: p.name }), T("إزالة من الجهاز"), false, function () {
              rpc("forget_on_device", { p_family: fid, p_participant: p.id }).then(function () { go("#/"); }, function (e) { toast(errText(e)); });
            });
          } }, T("الخروج من هذا الجهاز"))),
        !p.is_admin ? h("button", { class: "btn small danger", type: "button", onclick: function () {
          ask(T("حذف مشاركة {name} وكل إجاباته من المجلس نهائيًا؟", { name: p.name }), T("حذف نهائي"), true, function () {
            rpc("remove_participant", { p_family: fid, p_actor: p.id, p_target: p.id }).then(function () { go("#/"); }, function (e) { toast(errText(e)); });
          });
        } }, T("حذف مشاركتي ونتائجي")) : null));
      if (!isAdmin()) return out;

      return (local ? Promise.resolve(null) : rpc("get_invite", { p_family: fid, p_actor: p.id })).then(function (inv) {
        if (!S.fam.family.closed && !local) {
          out.push(inv ? invitePanel(inv, S.fam.family.name) : h("section", { class: "panel" }, h("h2", null, T("دعوة الأسرة")), h("p", { class: "muted" }, T("لا توجد دعوة فعالة."))));
          out.push(h("div", { class: "row" },
            h("button", { class: "btn small", type: "button", onclick: function () { ask(T("إلغاء الرابط والرمز الحاليين وإنشاء جديدين؟"), T("إنشاء دعوة جديدة"), false, function () { act("rotate_invite", { p_family: fid, p_actor: p.id }, T("أُنشئت دعوة جديدة، والقديمة لم تعد تعمل")); }); } }, T("إلغاء الدعوة وإنشاء جديدة")),
            inv ? h("button", { class: "btn small", type: "button", onclick: function () { ask(T("إيقاف الانضمام بالرابط والرمز الحاليين؟"), T("إلغاء الدعوة"), true, function () { act("revoke_invite", { p_family: fid, p_actor: p.id }, T("أُلغيت الدعوة")); }); } }, T("إلغاء الدعوة فقط")) : null));
        }
        out.push(h("section", { class: "panel" },
          h("h2", null, T("المشاركون")),
          h("div", null, S.fam.participants.map(function (x) {
            return h("div", { class: "person" },
              h("span", { class: "row" }, h("span", { class: "dot c" + x.color }), h("b", null, x.name), x.is_admin ? h("span", { class: "muted small" }, T("مسؤول")) : null),
              x.id === p.id ? null : h("span", { class: "row" },
                h("button", { class: "btn small", type: "button", onclick: function () { personMenu(x); } }, T("إدارة"))));
          })),
          local ? null : h("p", { class: "muted small" }, T("إن غيّر أحدهم هاتفه ولم يحفظ رمز الاستعادة، أصدر له «رمز إعادة ربط» من «إدارة»؛ صالح ربع ساعة ولمرة واحدة."))));
        out.push(h("section", { class: "panel" },
          h("h2", null, T("إغلاق المجلس وحذفه")),
          h("p", { class: "muted" }, S.fam.family.closed ? T("المجلس مغلق: لا إجابات جديدة، والنتائج متاحة للاطلاع.") : T("الإغلاق يوقف الإجابات الجديدة ويُبقي النتائج للاطلاع.")),
          h("button", { class: "btn small", type: "button", onclick: function () { act("close_family", { p_family: fid, p_actor: p.id, p_closed: !S.fam.family.closed }, S.fam.family.closed ? T("أُعيد فتح المجلس") : T("أُغلق المجلس")); } },
            S.fam.family.closed ? T("إعادة فتح المجلس") : T("إغلاق المجلس")),
          h("button", { class: "btn small danger", type: "button", onclick: function () { deleteFamily(p); } }, T("حذف المجلس وكل نتائجه نهائيًا"))));
        out.push(h("section", { class: "panel soft" },
          h("h3", null, T("الخصوصية")),
          h("ul", null,
            local ? h("li", null, T("هذا المجلس محفوظ في هذا المتصفح فقط، ولا يُرسل منه شيء إلى أي خادم.")) : null,
            h("li", null, T("لا يرى المجلسَ ولا أسماءَ مشاركيه إلا أعضاؤه، ولا توجد لوحة ترتيب عامة.")),
            h("li", null, T("لا نطلب بريدًا ولا عمرًا ولا أي بيانات تعريفية. يكفي اسم أول.")),
            h("li", null, T("إجابات «سؤال للحوار» و«وقفة مع الأسرة» لا تُكتب ولا تُحفظ.")),
            local ? null : h("li", null, T("رابط الدعوة لا يمنح صلاحية المسؤول، ولا يحمل أي جلسة.")),
            h("li", null, T("الصفحة مستثناة من محركات البحث.")))));
        return out;
      });
    });
    function act(fn, args, ok) {
      return rpc(fn, args).then(function () { toast(ok); render(true); }, function (e) { toast(errText(e)); });
    }
    function personMenu(x) {
      var actor = me();
      openDialog(h("div", { class: "panel" },
        h("h2", { id: "dlg-title" }, x.name),
        isLocal(fid) ? null : h("button", { class: "btn", type: "button", onclick: function () {
          rpc("issue_relink_code", { p_family: fid, p_actor: actor.id, p_target: x.id }).then(function (r) {
            openDialog(h("div", { class: "panel" }, h("h2", { id: "dlg-title" }, T("رمز إعادة ربط {name}", { name: x.name })),
              h("p", null, T("يكتبه {name} في «استعادة مشاركتي» على جهازه الجديد. صالح ربع ساعة ولمرة واحدة.", { name: x.name })),
              h("div", { class: "codebox" }, r.code),
              h("button", { class: "btn primary", type: "button", onclick: closeDialog }, T("تم"))));
          }, function (e) { toast(errText(e)); });
        } }, T("رمز إعادة ربط لجهاز جديد")),
        h("button", { class: "btn", type: "button", onclick: function () {
          askText(T("الاسم الجديد لـ{name}", { name: x.name }), x.name, function (nn) { act("rename_participant", { p_family: fid, p_actor: actor.id, p_target: x.id, p_name: nn }, T("تم تغيير الاسم")); });
        } }, T("تغيير الاسم")),
        h("button", { class: "btn", type: "button", onclick: function () { closeDialog(); act("set_admin", { p_family: fid, p_actor: actor.id, p_target: x.id, p_admin: !x.is_admin }, T("تم")); } },
          x.is_admin ? T("إلغاء صلاحية المسؤول") : T("جعله مسؤولًا")),
        h("button", { class: "btn danger", type: "button", onclick: function () {
          ask(T("حذف {name} من المجلس؟ تُحذف إجاباته ونتائجه نهائيًا.", { name: x.name }), T("حذف نهائي"), true, function () {
            act("remove_participant", { p_family: fid, p_actor: actor.id, p_target: x.id }, T("حُذف المشارك وبياناته"));
          });
        } }, T("حذف من المجلس")),
        h("button", { class: "btn quiet", type: "button", onclick: closeDialog }, T("إغلاق"))));
    }
    function deleteFamily(actor) {
      var inp = h("input", { id: "confirm-name", type: "text", autocomplete: "off" });
      var msg = h("p", { class: "error", hidden: true });
      openDialog(h("div", { class: "panel" },
        h("h2", { id: "dlg-title" }, T("حذف المجلس نهائيًا")),
        h("p", null, T("تُحذف أسماء المشاركين وكل التحديات والإجابات والنتائج، ولا يمكن استرجاعها.")),
        h("div", { class: "field" }, h("label", { for: "confirm-name" }, T("للتأكيد اكتب اسم المجلس: {family}", { family: S.fam.family.name })), inp),
        msg,
        h("div", { class: "row" },
          h("button", { class: "btn danger", type: "button", onclick: function () {
            rpc("delete_family", { p_family: fid, p_actor: actor.id, p_confirm_name: inp.value }).then(function () {
              closeDialog(); var m = currentMap(); delete m[fid]; lsSet(LS_CURRENT, m); toast(T("حُذف المجلس وكل بياناته")); go("#/");
            }, function (e) { msg.hidden = false; msg.textContent = errText(e); });
          } }, T("حذف نهائي")),
          h("button", { class: "btn quiet", type: "button", onclick: closeDialog }, T("إلغاء")))));
    }
  }

  // ------------------------------------------------------------------ الموجّه
  function route() {
    var parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (!parts.length) return { v: "home" };
    if (parts[0] === "create") return { v: "create" };
    if (parts[0] === "here") return { v: "create-local" };
    if (parts[0] === "join") return { v: "join", token: parts[1] };
    if (parts[0] === "recover") return { v: "recover" };
    if (parts[0] === "f" && parts[1]) {
      if (!parts[2]) return { v: "family", fid: parts[1] };
      if (parts[2] === "invite") return { v: "invite", fid: parts[1] };
      if (parts[2] === "new") return { v: "new", fid: parts[1] };
      if (parts[2] === "settings") return { v: "settings", fid: parts[1] };
      if (parts[2] === "c" && parts[3]) return { v: parts[4] === "board" ? "board" : "challenge", fid: parts[1], cid: parts[3] };
    }
    return { v: "home" };
  }

  var renderSeq = 0;
  function render(soft) {
    var seq = ++renderSeq;
    var r = route();
    if (!remoteOn && (["create", "join", "recover"].indexOf(r.v) !== -1 || (r.fid && !isLocal(r.fid)))) { stopPoll(); paint(viewNotConfigured(), soft); return Promise.resolve(); }
    if (!r.fid) stopPoll();
    else if (r.fid !== S.famId) { S.famId = r.fid; if (isLocal(r.fid)) clearInterval(pollTimer); else startPoll(); }
    var y = window.scrollY;
    var p;
    switch (r.v) {
      case "create": p = Promise.resolve(viewCreate()); break;
      case "create-local": p = Promise.resolve(viewCreateLocal()); break;
      case "join": p = viewJoin(r.token); break;
      case "recover": p = Promise.resolve(viewRecover()); break;
      case "family": p = viewFamily(r.fid); break;
      case "invite": p = viewInvite(r.fid); break;
      case "new": p = viewNew(r.fid); break;
      case "settings": p = viewSettings(r.fid); break;
      case "challenge": p = viewChallenge(r.fid, r.cid); break;
      case "board": p = viewBoard(r.fid, r.cid); break;
      default: p = viewHome();
    }
    return Promise.resolve(p).then(function (nodes) {
      if (seq !== renderSeq) return;
      // عرفنا المشارك الحالي الآن: إن كانت لغته غير لغة الشاشة نعيد الرسم بلغته
      if (wantLang() !== I.lang) return ensureLang(wantLang()).then(function () { if (seq === renderSeq) return render(soft); });
      paint(nodes, soft);
      if (soft) window.scrollTo(0, y);
    }, function (e) {
      if (seq !== renderSeq) return;
      if (soft && e.message === "network") return;   // نبقي ما على الشاشة ونشير إلى انقطاع الاتصال
      paint(fail(e), soft);
    });
  }
  function paint(nodes, soft) {
    document.documentElement.classList.remove("i18n-wait");
    main.textContent = "";
    add(main, nodes);
    if (!soft) { window.scrollTo(0, 0); var t = main.querySelector("h2, h1"); if (t) { t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); } }
  }

  window.addEventListener("hashchange", function () { S.handoff = null; render(false); });
  picker = I.picker(document.getElementById("lang-picker"), pickLang);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && S.famId) refreshView(); });
  window.addEventListener("online", function () { if (S.famId) refreshView(); });
  ensureLang(wantLang()).then(function () { paintChrome(); render(false); });
})();
