/* قراريط — نظام اللغات المشترك بين المتصفح وتحدي الأسرة. لا يعتمد على أي مكتبة.
   يفصل بين ترجمات الواجهة (i18n/ui/<lang>.json و i18n/family/<lang>.json)
   وترجمات المحتوى (data/content/<lang>.json)، ويحمّل اللغة المختارة فقط ويحفظها في الذاكرة. */
(function () {
  "use strict";

  var REG = window.QARARIT_LOCALES;
  var LS_LANG = "qararit.lang";
  // مسار جذر الموقع (الصفحة الرئيسية و /en/ و family/ كلها تحمّل من الجذر نفسه)
  // يُستنتج من مكان هذا الملف نفسه (جذر الموقع)، إلا إذا حددته الصفحة صراحة
  var here = (document.currentScript && document.currentScript.src) || location.href;
  var ROOT = window.QARARIT_BASE ? new URL(window.QARARIT_BASE, location.href).href : new URL(".", here).href;
  var cache = {};       // url -> Promise
  var dicts = {};       // ns -> { lang -> dict }
  var cur = null;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* غير متاح */ } }

  function info(code) {
    for (var i = 0; i < REG.list.length; i++) if (REG.list[i].code === code) return REG.list[i];
    return null;
  }
  function supported(code) { return !!info(code); }

  // اللغة الأولى: رابط صريح (?lang= أو صفحة /en/) ثم اختيار محفوظ ثم لغة المتصفح ثم العربية
  function fromUrl() {
    var m = /[?&]lang=([a-z]{2,3})/.exec(location.search);
    if (m && supported(m[1])) return m[1];
    var d = document.documentElement.getAttribute("data-lang-page");
    return d && supported(d) ? d : null;
  }
  function stored() { var v = lsGet(LS_LANG); return v && supported(v) ? v : null; }
  function fromBrowser() {
    var langs = navigator.languages || [navigator.language || ""];
    for (var i = 0; i < langs.length; i++) {
      var c = String(langs[i]).toLowerCase().split("-")[0];
      if (c === "in") c = "id";
      if (supported(c)) return c;
    }
    return null;
  }
  // لغة المتصفح لا تُفرض: كثير من قراء العربية هواتفهم بالإنجليزية. نعرضها اقتراحًا فقط (انظر offerStored في app.js)
  function initial() { return fromUrl() || stored() || REG.source; }

  function fetchJSON(rel) {
    var url = ROOT + rel;
    if (!cache[url]) {
      cache[url] = fetch(url, { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      });
      cache[url].catch(function () { delete cache[url]; });
    }
    return cache[url];
  }

  // يحمّل قاموس الواجهة للغة المطلوبة، ومعه العربية احتياطًا حتى لا يظهر مفتاح برمجي أبدًا
  function loadDict(ns, code) {
    var need = [code];
    if (code !== REG.source) need.push(REG.source);
    return Promise.all(need.map(function (c) {
      return fetchJSON("i18n/" + ns + "/" + c + ".json").then(function (d) {
        (dicts[ns] = dicts[ns] || {})[c] = d;
      });
    }));
  }

  function lookup(key, code) {
    for (var ns in dicts) {
      var d = dicts[ns][code];
      if (d && Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    }
    return undefined;
  }
  function fill(s, vars) {
    if (!vars) return s;
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  }
  function t(key, vars) {
    var v = lookup(key, cur);
    if (v === undefined) { v = lookup(key, REG.source); if (v !== undefined && window.console) console.warn("i18n: missing", cur, key); }
    if (v === undefined) return "";
    if (typeof v === "object") v = v.other;
    return fill(v, vars);
  }
  // نص بلغة محددة غير الحالية (مثل عرض لغة الزائر المعتادة عليه بلغته)
  function tIn(code, key, vars) {
    var v = lookup(key, code);
    if (v === undefined) v = lookup(key, REG.source);
    if (v === undefined) return "";
    if (typeof v === "object") v = v.other;
    return fill(v, vars);
  }
  // صيغ الجمع حسب قواعد كل لغة (العربية: واحد، اثنان، 3–10، 11 فأكثر)
  var pr = {};
  function plural(key, n, vars) {
    var v = lookup(key, cur);
    if (v === undefined) v = lookup(key, REG.source);
    if (v == null) return "";
    if (typeof v === "string") return fill(v, Object.assign({ n: num(n) }, vars));
    var rules = pr[cur] || (pr[cur] = new Intl.PluralRules(info(cur).intl));
    var form = n === 0 && v.zero ? "zero" : rules.select(n);
    var s = v[form] != null ? v[form] : v.other;
    return fill(s, Object.assign({ n: num(n) }, vars));
  }
  function num(n, family) {
    var l = info(cur);
    var nu = family && l.familyNums ? l.familyNums : (l.nums || "latn");
    try { return new Intl.NumberFormat(l.intl + "-u-nu-" + nu).format(n); } catch (e) { return String(n); }
  }
  function date(d, opts) {
    try { return new Date(d).toLocaleString(info(cur).intl, opts); } catch (e) { return String(d); }
  }

  // الخطوط: نحمّل خطوط اللغة المختارة فقط. خط أميري يبقى دائمًا للنص العربي الأصلي
  function loadFonts(code) {
    var l = info(code), id = "lang-fonts";
    var el = document.getElementById(id);
    if (code === REG.source) { if (el) el.remove(); return Promise.resolve(); }
    var href = "https://fonts.googleapis.com/css2?" + l.fonts + "&display=swap";
    if (el && el.getAttribute("href") === href) return Promise.resolve();
    if (!el) { el = document.createElement("link"); el.id = id; el.rel = "stylesheet"; document.head.appendChild(el); }
    return new Promise(function (res) { el.onload = el.onerror = function () { res(); }; el.href = href; setTimeout(res, 2500); });
  }

  // يطبّق اتجاه الصفحة ولغتها ويحفظ الاختيار. لا يعيد تحميل الصفحة.
  function setLang(code, opts) {
    opts = opts || {};
    if (!supported(code)) code = REG.source;
    cur = code;
    var l = info(code), html = document.documentElement;
    html.lang = code; html.dir = l.dir;
    if (opts.remember !== false) lsSet(LS_LANG, code);
    if (opts.url !== false) syncUrl(code);
    return loadFonts(code);
  }

  // الرابط يحمل اللغة حتى يفتحه المستقبِل بها، ويبقى معرّف الحديث بعد # كما هو
  function syncUrl(code) {
    try {
      var u = new URL(location.href);
      if (REG.pathUrls && document.documentElement.hasAttribute("data-lang-page")) {
        // صفحات /ar/ /en/ ... المولّدة: ننتقل بين المسارات دون إعادة تحميل
        u.pathname = u.pathname.replace(/\/(ar|en|ur|id|fr|[a-z]{2,3})\/(index\.html)?$/, "/" + code + "/");
        u.searchParams.delete("lang");
      } else if (code === REG.source && !fromUrlParam()) {
        u.searchParams.delete("lang");
      } else {
        u.searchParams.set("lang", code);
      }
      if (u.href !== location.href) history.replaceState(history.state, "", u.href);
    } catch (e) { /* بيئة لا تسمح بتغيير العنوان */ }
  }
  function fromUrlParam() { return /[?&]lang=/.test(location.search); }

  // ترجمة عناصر الصفحة الثابتة: data-i18n="مفتاح" و data-i18n-attr="aria-label:مفتاح;title:مفتاح"
  function applyDom(root) {
    root = root || document;
    Array.prototype.forEach.call(root.querySelectorAll("[data-i18n]"), function (el) {
      var v = t(el.getAttribute("data-i18n"));
      if (v) el.textContent = v;
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-i18n-attr]"), function (el) {
      el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var p = pair.split(":"); if (p.length < 2) return;
        var v = t(p[1].trim()); if (v) el.setAttribute(p[0].trim(), v);
      });
    });
  }

  // حالة اعتماد الترجمة: المعتمد يظهر دائمًا، والمسودة في نسخة المعاينة فقط
  function shows(status) {
    if (REG.publish.indexOf(status) !== -1) return true;
    return !!REG.preview && REG.previewStatuses.indexOf(status) !== -1;
  }
  function isApproved(status) { return REG.publish.indexOf(status) !== -1; }

  // توحيد النص للبحث في أي لغة: حذف التشكيل والعلامات اللاتينية وتوحيد الحروف المتقاربة
  function fold(s) {
    return String(s || "").normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, "")
      .replace(/[أإآٱ]/g, "ا").replace(/[ىيی]/g, "ي").replace(/[ةۃہھ]/g, "ه").replace(/[كک]/g, "ك")
      .replace(/[ۓے]/g, "ي").replace(/ؤ/g, "و").replace(/[ʿʾ'’`‘]/g, "")
      .toLowerCase();
  }

  /* زر اللغة: أيقونة الكرة الأرضية واسم اللغة الحالية، وقائمة صغيرة بأسماء اللغات الأصلية */
  var GLOBE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5s1.2-6.1 3.6-8.5z"/></svg>';
  function picker(host, onPick) {
    host.classList.add("lang-picker");
    host.innerHTML = '<button type="button" class="lang-btn" aria-haspopup="true" aria-expanded="false">' + GLOBE +
      '<span class="lang-cur"></span><svg class="caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>' +
      '<ul class="lang-menu" role="menu" hidden></ul>';
    var btn = host.querySelector(".lang-btn"), menu = host.querySelector(".lang-menu");
    function paint() {
      var l = info(cur || initial());
      var curEl = host.querySelector(".lang-cur");
      curEl.textContent = l.name; curEl.lang = l.code; curEl.dir = l.dir;
      btn.setAttribute("aria-label", t("lang.choose") + " — " + l.name);
      menu.innerHTML = REG.list.map(function (x) {
        return '<li role="none"><button type="button" role="menuitemradio" aria-checked="' + (x.code === l.code) + '" data-lang="' + x.code +
          '" lang="' + x.code + '" dir="' + x.dir + '">' + x.name + '</button></li>';
      }).join("");
    }
    function open(v) {
      menu.hidden = !v; btn.setAttribute("aria-expanded", String(v));
      if (v) { var c = menu.querySelector('[aria-checked="true"]') || menu.querySelector("button"); if (c) c.focus(); }
    }
    btn.addEventListener("click", function () { open(menu.hidden); });
    menu.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-lang]"); if (!b) return;
      open(false); btn.focus();
      var code = b.getAttribute("data-lang");
      if (code !== cur) onPick(code);
    });
    menu.addEventListener("keydown", function (e) {
      var items = Array.prototype.slice.call(menu.querySelectorAll("button"));
      var i = items.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); open(false); btn.focus(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === "Tab") open(false);
    });
    document.addEventListener("click", function (e) { if (!host.contains(e.target)) open(false); });
    paint();
    return { paint: paint };
  }

  // قبل رسم الصفحة: اتجاه اللغة المتوقعة فورًا، مع إخفاء النص العربي الثابت حتى تصل الترجمة (بحد أقصى ثوانٍ)
  (function early() {
    var code = initial(), l = info(code), html = document.documentElement;
    if (!l || code === REG.source) return;
    html.lang = code; html.dir = l.dir;
    html.classList.add("i18n-wait");
    setTimeout(function () { html.classList.remove("i18n-wait"); }, 4000);
  })();

  window.QI18N = {
    reg: REG, root: ROOT, info: info, supported: supported, initial: initial, stored: stored, fromBrowser: fromBrowser,
    fromUrl: fromUrl, fromBrowser: fromBrowser,
    get lang() { return cur; }, get dir() { return info(cur).dir; },
    setLang: setLang, loadDict: loadDict, fetchJSON: fetchJSON,
    t: t, tIn: tIn, plural: plural, num: num, date: date, applyDom: applyDom,
    shows: shows, isApproved: isApproved, fold: fold, picker: picker, syncUrl: syncUrl
  };
})();
