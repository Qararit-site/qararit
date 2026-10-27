/* قراريط: متصفّح بطاقات الأحاديث. لا يعتمد على أي مكتبة.
   البيانات العربية المرجعية في data/hadiths.json، وترجمات المحتوى في data/content/<lang>.json،
   ونصوص الواجهة في i18n/ui/<lang>.json. هذا الملف لا يحتوي أي نص حديث ولا نص واجهة. */
(function () {
  "use strict";

  var I = window.QI18N;
  var t = I.t;
  var DATA_URL = "data/hadiths.json";
  var TASHKEEL_URL = "data/tashkeel.json"; // نصوص الموقع مشكولة، ما عدا نصوص الأحاديث فتشكيلها من الدرر
  var LS_SAVED = "qararit.saved";
  var LS_SCALE = "qararit.scale";
  var LS_READ = "qararit.read";
  var LS_RECENT = "qararit.recent";
  var LS_TASHKEEL = "qararit.tashkeel";
  var UNREAD = "unread"; // مرشّح خاص: أجور لم أقرأها بعد
  var SCALES = [0.9, 1, 1.12, 1.25, 1.4];

  var state = {
    site: null,       // إعدادات الموقع من البيانات العربية (حالات النشر، الرابط)
    text: null,       // العنوان والأقسام وأصل العبارة باللغة الحالية
    categories: [],
    base: [],         // الأحاديث المنشورة بالعربية: المرجع الثابت للترتيب والمعرّفات
    all: [],          // المتاح باللغة الحالية (في العربية هو base نفسه)
    list: [],         // القائمة الحالية (كلها أو تصنيف)
    filter: null,     // معرف التصنيف
    index: 0,
    pending: null,    // حديث مطلوب لم تُعتمد ترجمته في هذه اللغة: تُعرض بطاقة تشرح ذلك
    flipped: false,
    showAr: false,    // إظهار النص العربي الأصلي تحت الترجمة (اختياري، مغلق افتراضيًا)
    saved: [],
    read: [],         // ما قرأه الزائر على هذا الجهاز
    recent: [],       // آخر ما عُرض عبر «اكتشف أجرًا جديدًا»
    view: "deck",
    tashkeel: true,   // عرض كل نصوص الموقع مشكولة (في الواجهة العربية)
    busy: false
  };
  var content = {};   // lang -> data/content/<lang>.json بعد تحميله

  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function isAr() { return I.lang === I.reg.source; }
  function ltr() { return I.dir === "ltr"; }

  /* ---------- تخزين محلي آمن ---------- */
  function lsGet(k, fallback) {
    try { var v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* غير متاح */ } }

  /* ---------- أدوات نصية ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // نص عربي داخل واجهة بلغة أخرى: يبقى من اليمين لليسار بخطه العربي
  function arHTML(s, tag) {
    tag = tag || "bdi";
    return "<" + tag + ' lang="ar" dir="rtl">' + esc(s) + "</" + tag + ">";
  }
  // الأرقام والإحالات (مثل 1323–1324) تُعزل حتى لا تنقلب داخل النص العربي أو الأردي
  function iso(s) { return "⁦" + s + "⁩"; }
  var HARAKAT = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
  function shown(s) { return state.tashkeel ? s : String(s).replace(HARAKAT, ""); }

  /* ---------- تشكيل بقية النصوص (الواجهة العربية فقط) ----------
     data/tashkeel.json يربط كل نص (بلا حركات، والأرقام فيه {n}) بنسخته المشكولة.
     نمرّ على نصوص الصفحة ونبدّلها، ونحفظ الأصل في كل عقدة لنعود إليه. */
  var TK = null;
  var TK_SKIP = ".h-text,.i-snip,.tk,.ar-orig,script,style";
  var TK_SEP = /( · |، |: )/;
  function tkKey(s) { return s.replace(HARAKAT, "").replace(/\d+/g, "{n}"); }
  function tkLookup(s) {
    var v = TK && TK[tkKey(s)];
    if (!v) return null;
    var nums = s.match(/\d+/g) || [], i = 0;
    return v.replace(/\{n\}/g, function () { return nums[i++] || ""; });
  }
  function vowel(s) {
    if (!isAr()) return s;
    if (!state.tashkeel) return String(s).replace(HARAKAT, "");
    if (!TK) return s;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), body = m[2];
    var v = tkLookup(body);
    if (v == null) {
      // نص مركّب (مثل «الراوي: …» أو «تصنيف · تصنيف»): نشكّل أجزاءه كلٌّ على حدة
      var hit = false;
      v = body.split(TK_SEP).map(function (part) {
        var x = TK_SEP.test(part) ? null : tkLookup(part);
        if (x != null) hit = true;
        return x == null ? part : x;
      }).join("");
      if (!hit) return s;
    }
    return m[1] + v + m[3];
  }
  function vowelNode(n) {
    if (n.__set !== n.nodeValue) n.__orig = n.nodeValue; // نص جديد كتبه الموقع
    var v = vowel(n.__orig);
    if (v !== n.nodeValue) n.nodeValue = v;
    n.__set = n.nodeValue;
  }
  function vowelTree(root) {
    if (!isAr()) return;
    if (root.nodeType === 3) { if (!(root.parentElement && root.parentElement.closest(TK_SKIP))) vowelNode(root); return; }
    if (root.nodeType !== 1 || root.closest(TK_SKIP)) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { return n.parentElement.closest(TK_SKIP) || !/[ء-ي]/.test(n.nodeValue) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
    });
    var list = [], n;
    while ((n = w.nextNode())) list.push(n);
    list.forEach(vowelNode);
  }
  // إبراز عبارات الأجر دون تغيير النص: نبحث عن كل عبارة حرفيًا ونلفّها بـ <mark>
  function highlight(text, phrases) {
    var ranges = [];
    (phrases || []).slice().sort(function (a, b) { return b.length - a.length; }).forEach(function (p) {
      var from = 0, i;
      while (p && (i = text.indexOf(p, from)) !== -1) {
        var end = i + p.length;
        var clash = ranges.some(function (r) { return i < r[1] && end > r[0]; });
        if (!clash) ranges.push([i, end]);
        from = end;
      }
    });
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var out = "", pos = 0;
    ranges.forEach(function (r) {
      out += esc(text.slice(pos, r[0])) + "<mark>" + esc(text.slice(r[0], r[1])) + "</mark>";
      pos = r[1];
    });
    return out + esc(text.slice(pos));
  }

  /* ---------- أسماء الكتب والأئمة والدرجات ----------
     تبقى بالعربية في البيانات، وتُترجم عبر مفاتيح name.* في قاموس الواجهة. ما لا ترجمة له يظهر بالعربية معزولًا. */
  function nameText(s, short) {
    if (isAr() || !s) return s || "";
    return (short && t("name.short." + s)) || t("name." + s) || s;
  }
  function nameHTML(s, short) {
    var v = nameText(s, short);
    return !isAr() && v === s && /[؀-ۿ]/.test(s) ? arHTML(s) : esc(v);
  }
  function shortBook(book) {
    return isAr() ? book.replace("صحيح ", "").replace("جامع ", "") : nameText(book, true);
  }
  function catName(id) {
    for (var i = 0; i < state.categories.length; i++) if (state.categories[i].id === id) return state.categories[i].name;
    return "";
  }
  function refsLine(h) {
    return h.sources.map(function (s) { return shortBook(s.book) + " (" + iso(s.number) + ")"; }).join(t("sep.list") || "، ");
  }
  function countLabel(n) { return I.plural("count.hadith", n); }

  var ICON = {
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4h11v16l-5.5-4-5.5 4z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0L8 8m4-4 4 4"/><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
    next: '<svg class="dir-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
    back: '<svg class="dir-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h11a5 5 0 0 1 0 10h-3"/><path d="m8 6-4 4 4 4"/></svg>',
    meaning: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5m0-8.2v.2"/></svg>',
    act: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    step: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h4v-4h4v-4h4V7h2"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3 19.5h18z"/><path d="M12 10v4.5m0 2.5v.2"/></svg>',
    lang: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5s1.2-6.1 3.6-8.5z"/></svg>'
  };

  /* ---------- دمج الترجمة مع الأصل ----------
     الحديث المعروض بلغة أخرى = بياناته الثابتة من العربية (المعرّف، المصادر، التصنيفات)
     + الحقول المترجمة. الإضافات الاختيارية لا تظهر إلا إذا تُرجمت، وإلا أُخفيت مع تنبيه. */
  function visible(x) {
    var ok = (state.site && state.site.enrich_statuses) || ["approved"];
    return x && ok.indexOf(x.status) !== -1;
  }
  function merge(ar, tr) {
    var h = {};
    for (var k in ar) h[k] = ar[k];
    ["title", "lead", "text", "reward", "narrator", "grade", "meaning", "imani", "tarbawi", "action"].forEach(function (k) { h[k] = tr[k]; });
    h.wording = tr.wording || "";
    h.caveat = tr.caveat || "";
    h.commentary = tr.commentary || [];
    h.grade_ref = "";
    h.story = ar.story && tr.story ? Object.assign({}, ar.story, { text: tr.story.text, grade: tr.story.grade || "" }) : null;
    h.poem = ar.poem && tr.poem && tr.poem.meaning ? Object.assign({}, ar.poem, { meaning: tr.poem.meaning, poet: tr.poem.poet || ar.poem.poet, note: tr.poem.note || "" }) : null;
    h.quotes = (ar.quotes || []).map(function (q, i) {
      var x = (tr.quotes || [])[i];
      return x ? Object.assign({}, q, { text: x.text, scholar: x.scholar || q.scholar }) : null;
    }).filter(Boolean);
    h.extrasHidden = (visible(ar.story) && !h.story) || (visible(ar.poem) && !h.poem) ||
      (ar.quotes || []).filter(visible).length > h.quotes.filter(visible).length;
    h.ar = ar;
    h.tr = { status: tr.status, review: tr.review || {} };
    return h;
  }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function baseIndex(id) { for (var i = 0; i < state.base.length; i++) if (state.base[i].id === id) return i; return -1; }

  /* ---------- «للمزيد من التأمل»: يظهر فيه فقط ما وُثّق ---------- */
  function srcLinks(list) {
    return (list || []).map(function (s) {
      var label = nameHTML(s.book) + (s.number ? " (" + esc(iso(s.number)) + ")" : "") + (s.loc ? t("sep.list") + esc(s.loc) : "");
      return s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + label + "</a>" : label;
    }).join(t("sep.list"));
  }
  function dorarLine(x) {
    var label = [x.muhaddith ? nameHTML(x.muhaddith) : "", x.source ? nameHTML(x.source) : "",
      x.number ? esc(t("more.dorar_number", { n: iso(x.number) })) : ""].filter(Boolean).join(t("sep.list"));
    return (x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + label + "</a>" : label) +
      (x.grade ? '<br><span class="cite">' + esc(t("more.dorar_grade", { g: "\u0000" })).replace("\u0000", nameHTML(x.grade)) + "</span>" : "");
  }
  function dorarHTML(d) {
    if (!d || !d.url) return "";
    return "<dt>" + esc(t("more.dorar")) + "</dt><dd><ul><li>" + dorarLine(d) + "</li>" +
      (d.albani && d.albani.grade && d.muhaddith !== "الألباني" ? "<li>" + esc(t("more.albani")) + t("sep.list") + dorarLine({ source: d.albani.source, number: d.albani.number, grade: d.albani.grade, url: d.albani.url }) + "</li>" : "") +
      "</ul></dd>";
  }
  function moreHTML(h, src, commentary) {
    var parts = [];
    if (visible(h.poem)) {
      parts.push('<section class="more-item"><h4>' + esc(t("more.poem")) + "</h4>" +
        '<p class="verse ar-orig" lang="ar" dir="rtl">' + h.poem.lines.map(esc).join("<br>") + "</p>" +
        (h.poem.meaning ? '<p class="verse-meaning"><span class="lbl">' + esc(t("more.poem_meaning")) + "</span> " + esc(h.poem.meaning) + "</p>" : "") +
        '<p class="cite">' + esc(h.poem.poet) + (h.poem.sources ? t("sep.list") + srcLinks(h.poem.sources) : "") + "</p>" +
        (h.poem.note ? '<p class="cite">' + esc(h.poem.note) + "</p>" : "") +
        (h.poem.original ? '<p class="cite">' + esc(t("more.poem_original")) + "</p>" : "") + "</section>");
    }
    if (visible(h.story)) {
      parts.push('<section class="more-item"><h4>' + esc(t("more.story")) + "</h4><p>" + esc(h.story.text) + "</p>" +
        '<p class="cite">' + srcLinks(h.story.sources) + (h.story.grade ? t("sep.list") + esc(h.story.grade) : "") + "</p></section>");
    }
    (h.quotes || []).filter(visible).forEach(function (q) {
      parts.push('<section class="more-item"><h4>' + esc(t("more.quote")) + "</h4>" +
        "<p>" + (q.verbatim ? "«" + esc(q.text) + "»" : esc(q.text)) + "</p>" +
        '<p class="cite">' + nameHTML(q.scholar) + t("sep.list") + srcLinks(q.sources) + (q.verbatim ? "" : esc(t("more.paraphrase"))) + "</p></section>");
    });
    if (h.extrasHidden) parts.push('<p class="cite tr-note">' + esc(t("tr.extras_hidden")) + "</p>");
    parts.push('<section class="more-item"><h4>' + esc(t("more.takhrij")) + "</h4><dl>" +
      "<dt>" + esc(t("more.narrator")) + "</dt><dd>" + esc(h.narrator) + "</dd>" +
      "<dt>" + esc(t("more.source")) + "</dt><dd><ul>" + src + "</ul>" + (h.wording ? esc(h.wording) : "") + "</dd>" +
      "<dt>" + esc(t("more.grade")) + "</dt><dd>" + esc(h.grade) + (h.grade_ref ? '<br><span class="cite">' + esc(h.grade_ref) + "</span>" : "") + "</dd>" +
      dorarHTML(h.dorar) +
      (commentary ? "<dt>" + esc(t("more.commentary")) + "</dt><dd><ul>" + commentary + "</ul></dd>" : "") +
      "</dl></section>");
    return '<details class="detail more" id="more"><summary>' + esc(t("more.summary")) + "</summary>" + parts.join("") + "</details>";
  }

  /* ---------- رسم البطاقة ---------- */
  function trBadge(h) {
    if (!h.tr) return "";
    var ok = I.isApproved(h.tr.status);
    return '<span class="tr-status ' + (ok ? "ok" : "draft") + '">' + esc(t(ok ? "tr.approved" : "tr.draft")) + "</span>";
  }
  function arOriginal(h) {
    var a = h.ar;
    return '<div class="ar-orig" id="ar-orig" lang="ar" dir="rtl"' + (state.showAr ? "" : " hidden") + ">" +
      '<p class="ar-h">' + esc(t("tr.ar_heading")) + "</p>" +
      (a.lead ? '<p class="lead">' + esc(a.lead) + "</p>" : "") +
      '<p class="h-text">' + highlight(shown(a.text), (a.reward || []).map(shown)) + "</p>" +
      (a.dorar && a.dorar.url ? '<a class="dorar" href="' + esc(a.dorar.url) + '" target="_blank" rel="noopener" lang="' + I.lang + '" dir="' + I.dir + '">' + esc(t("card.dorar")) + "</a>" : "") +
      "</div>";
  }
  function cardHTML(h) {
    var saved = state.saved.indexOf(h.id) !== -1;
    var cats = h.categories.map(catName).filter(Boolean).join(" · ");
    var src = h.sources.map(function (s) {
      return "<li>" + esc(t("more.source_item", { book: "\u0000", n: iso(s.number) })).replace("\u0000", nameHTML(s.book)) +
        (s.url ? ' — <a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(t("more.source_link")) + "</a>" : "") + "</li>";
    }).join("");
    var commentary = (h.commentary || []).map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("");
    var more = moreHTML(h, src, commentary);
    var tr = !!h.tr;
    return "" +
      '<article class="card" id="card" aria-roledescription="' + esc(t("card.role")) + '">' +
      '<div class="card-inner" id="card-inner">' +

      // الوجه الأول
      '<div class="face front" id="face-front">' +
        '<div class="face-top">' +
          '<span class="cat-tag">' + esc(cats) + "</span>" +
          '<div class="face-tools">' +
            '<button type="button" class="mini-btn labeled" id="btn-save" aria-pressed="' + saved + '">' + ICON.bookmark + '<span class="lbl">' + esc(saveLabel(saved)) + "</span></button>" +
            '<button type="button" class="mini-btn" id="btn-share" aria-label="' + esc(t("share.aria")) + '">' + ICON.share + "</button>" +
          "</div>" +
        "</div>" +
        '<h2 class="h-title">' + esc(h.title) + "</h2>" +
        (tr ? '<p class="tr-label"><span>' + esc(t("tr.label")) + "</span>" + trBadge(h) + "</p>" : "") +
        (h.lead ? '<p class="lead">' + esc(h.lead) + "</p>" : "") +
        '<p class="h-text"' + (tr ? ' lang="' + I.lang + '"' : "") + ">" + highlight(tr ? h.text : shown(h.text), tr ? h.reward : (h.reward || []).map(shown)) + "</p>" +
        (tr ? '<div class="tr-row"><p class="tr-note">' + esc(t("tr.label_note")) + "</p>" +
          '<button type="button" class="link-btn" id="btn-ar" aria-expanded="' + state.showAr + '" aria-controls="ar-orig">' + esc(t(state.showAr ? "tr.hide_ar" : "tr.show_ar")) + "</button></div>" + arOriginal(h) : "") +
        '<div class="meta">' +
          '<span class="grade">' + esc(h.grade) + "</span>" +
          '<span class="refs">' + esc(refsLine(h)) + "</span>" +
          "<span>" + esc(t("card.narrator", { name: h.narrator })) + "</span>" +
          (!tr && h.dorar && h.dorar.url ? '<a class="dorar" href="' + esc(h.dorar.url) + '" target="_blank" rel="noopener">' + esc(t("card.dorar")) + "</a>" : "") +
        "</div>" +
        '<button type="button" class="btn flip" id="btn-flip">' + esc(t("card.flip")) + "</button>" +
      "</div>" +

      // الوجه الثاني
      '<div class="face back" id="face-back">' +
        '<p class="back-title" id="back-title" tabindex="-1">' + esc(h.title) + "</p>" +
        '<div class="block"><h3>' + ICON.meaning + esc(t("card.meaning")) + "</h3><p>" + esc(h.meaning) + "</p></div>" +
        (h.imani ? '<div class="block reflect"><h3>' + ICON.heart + esc(t("card.imani")) + "</h3><p>" + esc(h.imani) + "</p></div>" : "") +
        (h.tarbawi ? '<div class="block"><h3>' + ICON.step + esc(t("card.tarbawi")) + "</h3><p>" + esc(h.tarbawi) + "</p></div>" : "") +
        (h.action ? '<div class="block"><h3>' + ICON.act + esc(t("card.action")) + "</h3><p>" + esc(h.action) + "</p>" +
          (h.caveat ? '<p class="cond">' + ICON.note + "<span>" + esc(h.caveat) + "</span></p>" : "") + "</div>" : "") +
        more +
        '<div class="back-actions">' +
          '<button type="button" class="btn" id="btn-unflip">' + ICON.back + esc(t("card.unflip")) + "</button>" +
          '<button type="button" class="btn primary" id="btn-next-back">' + esc(t("nav.next")) + ICON.next + "</button>" +
        "</div>" +
      "</div>" +

      "</div></article>";
  }

  // حديث منشور بالعربية لم تُعتمد ترجمته بعد في هذه اللغة: لا نعرض ترجمة غير معتمدة، ونعرض طريقين دون فقد الموضع
  function pendingHTML(a) {
    var n = state.all.length;
    return '<article class="card pending" id="card" aria-roledescription="' + esc(t("card.role")) + '">' +
      '<div class="card-inner" id="card-inner"><div class="face front" id="face-front">' +
        '<div class="face-top"><span class="tr-status draft">' + esc(t("tr.ar_only")) + "</span></div>" +
        '<h2 class="h-title" lang="ar" dir="rtl">' + esc(a.title) + "</h2>" +
        '<p class="pending-h">' + esc(t("tr.unavailable_title")) + "</p>" +
        "<p>" + esc(t("tr.unavailable_body")) + "</p>" +
        '<div class="back-actions">' +
          '<button type="button" class="btn primary" id="btn-read-ar">' + ICON.lang + '<span>' + esc(t("tr.read_in_ar")) + "</span></button>" +
          (n ? '<button type="button" class="btn" id="btn-browse">' + esc(t("tr.browse_available", { n: I.num(n) })) + "</button>" : "") +
        "</div>" +
      '</div><div class="face back" id="face-back"></div></div></article>';
  }

  function render(direction, opts) {
    opts = opts || {};
    var deck = $("deck");
    $("share-box").hidden = true;
    clearTimeout(readTimer);
    if (state.pending) {
      var a = byId(state.base, state.pending);
      state.flipped = false;
      deck.innerHTML = pendingHTML(a);
      syncFaces();
      $("counter").textContent = t("nav.counter", { i: "–", n: I.num(state.list.length) });
      $("btn-prev").disabled = $("btn-next").disabled = !state.list.length;
      $("btn-read-ar").onclick = function () { switchLang(I.reg.source); };
      if ($("btn-browse")) $("btn-browse").onclick = function () { go(1); };
      setHash(a.id);
      return;
    }
    var h = state.list[state.index];
    if (!h) { deck.innerHTML = '<p class="error">' + esc(t("card.empty_cat")) + "</p>"; $("counter").textContent = ""; return; }
    state.flipped = !!opts.flipped;
    deck.innerHTML = cardHTML(h);
    var card = $("card");
    if (direction && !reduceMotion) {
      card.classList.add(direction === "next" ? "slide-in-next" : "slide-in-prev");
      card.addEventListener("animationend", function () { card.classList.remove("slide-in-next", "slide-in-prev"); }, { once: true });
    }
    syncFaces();
    $("counter").textContent = t("nav.counter", { i: I.num(state.index + 1), n: I.num(state.list.length) });
    $("btn-prev").disabled = state.list.length < 2;
    $("btn-next").disabled = state.list.length < 2;

    $("btn-flip").onclick = function () { flip(true); };
    $("btn-unflip").onclick = function () { flip(false); };
    $("btn-next-back").onclick = function () { go(1); };
    $("btn-save").onclick = function () { toggleSave(h.id); };
    if ($("btn-ar")) $("btn-ar").onclick = function () { toggleAr(); };
    readTimer = setTimeout(function () { markRead(h.id); }, 2500);
    $("more").addEventListener("toggle", function () { requestAnimationFrame(syncFaces); });
    $("btn-share").onclick = function () { share(h); };
    setHash(h.id);
  }

  function toggleAr() {
    state.showAr = !state.showAr;
    var box = $("ar-orig"), b = $("btn-ar");
    if (box) box.hidden = !state.showAr;
    if (b) { b.setAttribute("aria-expanded", state.showAr); b.textContent = t(state.showAr ? "tr.hide_ar" : "tr.show_ar"); }
    syncFaces();
  }

  // ارتفاع البطاقة يتبع الوجه الظاهر حتى لا يُقتطع أي نص
  function syncFaces() {
    var inner = $("card-inner"); if (!inner) return;
    var front = $("face-front"), back = $("face-back");
    var active = state.flipped ? back : front, hidden = state.flipped ? front : back;
    inner.style.height = active.offsetHeight + "px";
    $("card").classList.toggle("is-flipped", state.flipped);
    active.removeAttribute("inert"); active.removeAttribute("aria-hidden");
    hidden.setAttribute("inert", ""); hidden.setAttribute("aria-hidden", "true");
  }

  /* ---------- ما قرأه الزائر ---------- */
  var readTimer;
  function markRead(id) {
    if (state.read.indexOf(id) !== -1) return;
    state.read.push(id);
    lsSet(LS_READ, state.read);
    updateUnread();
  }
  function unreadCount() {
    return state.all.filter(function (h) { return state.read.indexOf(h.id) === -1; }).length;
  }
  function updateUnread() { $("unread-count").textContent = I.num(unreadCount()); }

  function flip(toBack) {
    state.flipped = toBack;
    if (toBack) { var cur = state.list[state.index]; if (cur) markRead(cur.id); }
    syncFaces();
    var target = toBack ? $("back-title") : $("btn-flip");
    if (target) setTimeout(function () { target.focus({ preventScroll: true }); }, reduceMotion ? 0 : 300);
    if (toBack) {
      var top = $("card").getBoundingClientRect().top;
      if (top < 0) $("card").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }
  }

  function go(step) {
    if (state.busy) return;
    if (state.pending) {
      // من بطاقة «لم تكتمل الترجمة»: ننتقل إلى أقرب حديث متاح بعدها (أو قبلها) في الترتيب الأصلي
      if (!state.list.length) return;
      var bi = baseIndex(state.pending), pick = -1, i;
      if (step > 0) { for (i = 0; i < state.list.length; i++) if (baseIndex(state.list[i].id) > bi) { pick = i; break; } if (pick === -1) pick = 0; }
      else { for (i = state.list.length - 1; i >= 0; i--) if (baseIndex(state.list[i].id) < bi) { pick = i; break; } if (pick === -1) pick = state.list.length - 1; }
      state.pending = null; state.index = pick;
      render(step > 0 ? "next" : "prev");
      return;
    }
    if (state.list.length < 2) return;
    var dir = step > 0 ? "next" : "prev";
    var apply = function () {
      state.index = (state.index + step + state.list.length) % state.list.length;
      render(dir);
      state.busy = false;
    };
    var card = $("card");
    if (reduceMotion || !card) return apply();
    state.busy = true;
    card.classList.add(dir === "next" ? "slide-out-next" : "slide-out-prev");
    setTimeout(apply, 190);
  }

  function openHadith(id, keepFilter) {
    if (!byId(state.all, id)) {
      if (baseIndex(id) === -1) return;
      state.pending = id; show("deck"); render(); window.scrollTo(0, 0); return;
    }
    state.pending = null;
    if (!keepFilter) setFilter(null, true);
    var i = state.list.findIndex(function (h) { return h.id === id; });
    if (i === -1) { setFilter(null, true); i = state.list.findIndex(function (h) { return h.id === id; }); }
    state.index = Math.max(0, i);
    show("deck");
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- التصنيفات ---------- */
  function setFilter(catId, silent) {
    state.filter = catId;
    state.list = !catId ? state.all.slice()
      : catId === UNREAD ? state.all.filter(function (h) { return state.read.indexOf(h.id) === -1; })
      : state.all.filter(function (h) { return h.categories.indexOf(catId) !== -1; });
    state.index = 0;
    $("filter-bar").hidden = !catId;
    if (catId) $("filter-label").textContent = (catId === UNREAD ? t("filter.unread") : catName(catId)) + " · " + countLabel(state.list.length);
    if (!silent) { state.pending = null; render(); }
  }

  function renderTopics() {
    $("topic-list").innerHTML = state.categories.map(function (c) {
      var n = state.all.filter(function (h) { return h.categories.indexOf(c.id) !== -1; }).length;
      if (!n) return "";
      var r = state.all.filter(function (h) { return h.categories.indexOf(c.id) !== -1 && state.read.indexOf(h.id) !== -1; }).length;
      return '<li><button type="button" data-cat="' + esc(c.id) + '">' +
        '<span class="t-name">' + esc(c.name) + '<span class="count">' + I.num(n) + "</span></span>" +
        '<span class="t-hint">' + esc(c.hint) + "</span>" +
        (r ? '<span class="t-progress">' + esc(t("topics.read", { r: I.num(r), n: I.num(n) })) + "</span>" : "") + "</button></li>";
    }).join("");
  }

  /* ---------- القوائم (المحفوظة والبحث) ---------- */
  function itemHTML(h) {
    var text = h.tr ? h.text : shown(h.text);
    var snip = text.length > 120 ? text.slice(0, 118) + "…" : text;
    return '<li><button type="button" data-id="' + esc(h.id) + '">' +
      '<span class="i-title">' + esc(h.title) + "</span>" +
      '<span class="i-snip"' + (h.tr ? ' lang="' + I.lang + '"' : "") + ">" + esc(snip) + "</span>" +
      '<span class="i-sub">' + esc(h.grade) + " · " + esc(refsLine(h)) + (h.tr && !I.isApproved(h.tr.status) ? " · " + esc(t("tr.draft")) : "") + "</span></button></li>";
  }
  // محفوظ لم تُترجم بطاقته بعد إلى هذه اللغة: يبقى في القائمة بعنوانه العربي ووسم واضح
  function itemPendingHTML(a) {
    return '<li><button type="button" data-id="' + esc(a.id) + '">' +
      '<span class="i-title">' + arHTML(a.title) + "</span>" +
      '<span class="i-sub">' + esc(t("tr.ar_only")) + "</span></button></li>";
  }
  function renderSaved() {
    var html = state.saved.map(function (id) {
      var h = byId(state.all, id);
      if (h) return itemHTML(h);
      var a = byId(state.base, id);
      return a ? itemPendingHTML(a) : "";
    }).join("");
    $("saved-list").innerHTML = html;
    $("saved-empty").hidden = !!html;
  }
  // البحث في نصوص اللغة المختارة فقط، بعد توحيد الحروف والتشكيل والعلامات
  function renderSearch() {
    var q = I.fold($("search-input").value.trim());
    if (!q) { $("search-list").innerHTML = state.all.map(itemHTML).join(""); $("search-empty").hidden = true; return; }
    var words = q.split(/\s+/);
    var hits = state.all.filter(function (h) {
      var hay = h.__hay || (h.__hay = I.fold([h.title, h.text, h.meaning, h.imani || "", h.tarbawi || "", h.action || "", h.narrator, h.categories.map(catName).join(" ")].join(" ")));
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    });
    $("search-list").innerHTML = hits.map(itemHTML).join("");
    $("search-empty").hidden = hits.length > 0;
  }

  /* ---------- الحفظ والمشاركة ---------- */
  function saveLabel(on) { return t(on ? "card.saved" : "card.save"); }
  function toggleSave(id) {
    var i = state.saved.indexOf(id);
    if (i === -1) state.saved.push(id); else state.saved.splice(i, 1);
    lsSet(LS_SAVED, state.saved);
    var on = i === -1;
    var b = $("btn-save");
    if (b) {
      b.setAttribute("aria-pressed", on);
      b.querySelector(".lbl").textContent = saveLabel(on);
    }
    $("saved-count").textContent = I.num(state.saved.length);
    toast(t(on ? "toast.saved" : "toast.unsaved"));
  }

  // رابط الحديث يحمل معرّفه الثابت ولغة المرسل، والمستقبِل يستطيع تغيير اللغة بعد فتحه
  function linkFor(h) {
    var code = I.lang, site = state.site && state.site.site_url;
    if (site) {
      site = site.replace(/\/?$/, "/");
      if (I.reg.pathUrls) return site + code + "/#" + h.id;
      return site + (code === I.reg.source ? "" : "?lang=" + code) + "#" + h.id;
    }
    try {
      var u = new URL(location.href);
      u.hash = h.id;
      if (!document.documentElement.hasAttribute("data-lang-page")) {
        if (code === I.reg.source) u.searchParams.delete("lang"); else u.searchParams.set("lang", code);
      }
      return u.href;
    } catch (e) { return location.href.split("#")[0] + "#" + h.id; }
  }

  /* ---------- صورة البطاقة للمشاركة ---------- */
  var shareBlob = null, shareFor = null;
  function share(h) {
    var url = linkFor(h);
    var box = $("share-box");
    if (!box.hidden && shareFor === h.id) { box.hidden = true; return; }
    shareFor = h.id; shareBlob = null;
    $("share-url").value = url;
    $("share-wa").href = "https://wa.me/?text=" + encodeURIComponent(h.title + "\n" + url);
    $("share-img").removeAttribute("src");
    $("share-image").disabled = true;
    box.hidden = false;
    var fileShare = false;
    try { fileShare = !!(navigator.canShare && navigator.canShare({ files: [new File([""], "x.png", { type: "image/png" })] })); } catch (e) { /* غير مدعوم */ }
    $("share-image").textContent = t(fileShare ? "share.image" : "share.download");
    drawCard(h, url).then(function (canvas) {
      $("share-img").src = canvas.toDataURL("image/png");
      canvas.toBlob(function (b) { shareBlob = b; $("share-image").disabled = false; }, "image/png");
    });
    box.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }
  function shareImage() {
    var h = byId(state.all, shareFor);
    if (!h || !shareBlob) return;
    var name = "qararit-" + h.id + "-" + I.lang + ".png";
    var file;
    try { file = new File([shareBlob], name, { type: "image/png" }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: h.title, text: h.title + "\n" + linkFor(h) }).catch(function () {});
      return;
    }
    try {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(shareBlob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    } catch (e) { /* غير متاح */ }
    toast(t("toast.image_hint"));
  }

  // خطوط الصورة حسب اللغة. النستعليق الأردي يحتاج سطورًا أعلى
  function canvasFonts() {
    var l = I.lang;
    if (l === "ar") return { serif: '"Amiri", "Traditional Arabic", serif', sans: '"IBM Plex Sans Arabic", Tahoma, sans-serif', load: ["40px Amiri", "700 40px Amiri", "28px 'IBM Plex Sans Arabic'"], lh: 1.9 };
    if (l === "ur") return { serif: '"Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", serif', sans: '"Noto Sans Arabic", Tahoma, sans-serif', load: ["40px 'Noto Nastaliq Urdu'", "600 40px 'Noto Nastaliq Urdu'", "28px 'Noto Sans Arabic'"], lh: 2.35 };
    return { serif: '"IBM Plex Serif", Georgia, serif', sans: '"IBM Plex Sans", "Segoe UI", Arial, sans-serif', load: ["40px 'IBM Plex Serif'", "600 40px 'IBM Plex Serif'", "28px 'IBM Plex Sans'"], lh: 1.6 };
  }

  // يرسم البطاقة على لوحة 1080×1350 مناسبة لواتساب. كل كلمة تُرسم منفردة حتى نلوّن عبارات الأجر،
  // في اتجاه اللغة المختارة. الترجمة تُوسم في الصورة نفسها بأنها ترجمة للمعنى، والمسودة بأنها لم تُراجَع.
  function drawCard(h, url) {
    var W = 1080, H = 1350, P = 96;
    var C = { paper: "#faf8f2", ink: "#18302a", muted: "#5d6b64", green: "#1d4f40", gold: "#9a6a12", wash: "#f6ead0", line: "#e3e0d4" };
    var F = canvasFonts(), rtl = !ltr();
    var ready = document.fonts && document.fonts.load
      ? Promise.all(F.load.map(function (f) { return document.fonts.load(f); })).catch(function () {})
      : Promise.resolve();
    return ready.then(function () {
      var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      var c = cv.getContext("2d");
      var align = function () { c.direction = rtl ? "rtl" : "ltr"; c.textAlign = rtl ? "right" : "left"; };
      align(); c.textBaseline = "alphabetic";
      c.fillStyle = C.paper; c.fillRect(0, 0, W, H);
      c.strokeStyle = C.line; c.lineWidth = 3; roundRect(c, 40, 40, W - 80, H - 80, 36); c.stroke();

      var x0 = rtl ? W - P : P, y = P + 40, maxW = W - 2 * P;
      c.fillStyle = C.green; c.font = "700 44px " + F.serif;
      c.fillText(fit(c, vowel(state.text.title), maxW), x0, y);
      y += 64;
      c.fillStyle = C.ink; c.font = "600 40px " + F.sans;
      c.fillText(fit(c, vowel(h.title), maxW), x0, y);
      y += 40;
      if (h.tr) {
        y += 18; c.fillStyle = C.gold; c.font = "600 26px " + F.sans;
        c.fillText(fit(c, t("tr.label") + (I.isApproved(h.tr.status) ? "" : " · " + t("tr.draft")), maxW), x0, y);
      }
      if (h.lead) { c.fillStyle = C.muted; c.font = "30px " + F.sans; y += 46; c.fillText(fit(c, vowel(h.lead), maxW), x0, y); }
      y += 40;

      // تقسيم النص إلى كلمات مع معرفة ما يقع داخل عبارات الأجر (الصورة العربية تتبع اختيار التشكيل)
      var text = h.tr ? h.text : shown(h.text);
      var phrases = h.tr ? h.reward : (h.reward || []).map(shown);
      var marks = new Array(text.length).fill(false);
      (phrases || []).forEach(function (p) {
        var from = 0, i;
        while (p && (i = text.indexOf(p, from)) !== -1) { for (var k = i; k < i + p.length; k++) marks[k] = true; from = i + p.length; }
      });
      var words = [], re = /\S+/g, m;
      while ((m = re.exec(text))) {
        var hot = false; for (var k = m.index; k < m.index + m[0].length; k++) if (marks[k]) { hot = true; break; }
        words.push({ t: m[0], hot: hot });
      }
      var footerTop = H - P - 190;
      var size = 52, lines, lh;
      for (; size >= 22; size -= 2) {
        c.font = size + "px " + F.serif; lh = size * F.lh;
        lines = layout(c, words, maxW, size, F.serif);
        if (y + lines.length * lh <= footerTop) break;
      }
      // توسيط النص القصير عموديًا بدل ترك فراغ أسفله
      var spare = footerTop - (y + lines.length * lh);
      if (spare > 0) y += Math.round(spare / 2.2);
      lines.forEach(function (line) {
        y += lh;
        var x = x0;
        line.forEach(function (w) {
          c.font = (w.hot ? "700 " : "") + size + "px " + F.serif;
          var ww = c.measureText(w.t).width;
          var left = rtl ? x - ww : x;
          if (w.hot) { c.fillStyle = C.wash; c.fillRect(left - 4, y - size * 0.55, ww + 8, size * 0.62); }
          c.fillStyle = w.hot ? C.gold : C.ink;
          c.fillText(w.t, x, y);
          x += (rtl ? -1 : 1) * (ww + c.measureText(" ").width);
        });
      });

      // التذييل: الدرجة والمصدر والرابط
      var fy = H - P - 150;
      c.strokeStyle = C.line; c.lineWidth = 2; c.beginPath(); c.moveTo(P, fy); c.lineTo(W - P, fy); c.stroke();
      c.fillStyle = C.green; c.font = "600 32px " + F.sans;
      c.fillText(fit(c, vowel(h.grade + " · " + refsLine(h)), maxW), x0, fy + 56);
      c.fillStyle = C.muted; c.font = "28px " + F.sans;
      c.fillText(fit(c, vowel(t("card.narrator", { name: h.narrator })), maxW), x0, fy + 100);
      c.direction = "ltr"; c.textAlign = rtl ? "left" : "left"; c.fillStyle = C.green; c.font = "26px " + F.sans;
      c.fillText(shorten(c, url, maxW), P, fy + 144);
      align();
      return cv;
    });
  }
  function layout(c, words, maxW, size, family) {
    var lines = [], line = [], width = 0, space = c.measureText(" ").width;
    words.forEach(function (w) {
      c.font = (w.hot ? "700 " : "") + size + "px " + family;
      var ww = c.measureText(w.t).width;
      if (line.length && width + space + ww > maxW) { lines.push(line); line = []; width = 0; }
      width += (line.length ? space : 0) + ww; line.push(w);
    });
    c.font = size + "px " + family;
    if (line.length) lines.push(line);
    return lines;
  }
  function fit(c, s, maxW) {
    if (c.measureText(s).width <= maxW) return s;
    while (s.length > 4 && c.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
  }
  function shorten(c, s, maxW) {
    s = s.replace(/^https?:\/\//, "");
    while (c.measureText(s).width > maxW && s.length > 10) s = s.slice(0, -2);
    return s;
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  /* ---------- اكتشف أجرًا ---------- */
  function discover() {
    var cur = state.pending ? null : state.list[state.index];
    if (state.filter) setFilter(null, true);
    var notCur = state.all.filter(function (h) { return !cur || h.id !== cur.id; });
    if (!notCur.length) return;
    // نفضّل ما لم يُقرأ ولم يظهر مؤخرًا، ثم ما لم يظهر مؤخرًا، ثم أي حديث آخر
    var fresh = notCur.filter(function (h) { return state.recent.indexOf(h.id) === -1; });
    var unread = fresh.filter(function (h) { return state.read.indexOf(h.id) === -1; });
    var pool = unread.length ? unread : fresh.length ? fresh : notCur;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    state.recent.push(pick.id);
    var keep = Math.min(20, Math.floor(state.all.length / 2));
    state.recent = state.recent.slice(-keep);
    lsSet(LS_RECENT, state.recent);
    state.pending = null;
    state.index = state.list.indexOf(pick);
    show("deck");
    render("next");
  }
  function copy(text, done) {
    try {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } catch (e) { done(false); }
  }

  var toastTimer;
  function toast(msg) {
    var tEl = $("toast"); tEl.textContent = msg; tEl.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { tEl.classList.remove("show"); }, 2200);
  }

  /* ---------- الواجهات ---------- */
  var lastView = "deck";
  function show(view) {
    ["deck", "topics", "saved", "search"].forEach(function (v) { $("view-" + v).hidden = v !== view; });
    if (view !== "deck") lastView = state.view === "deck" ? "deck" : lastView;
    state.view = view;
    if (view === "topics") { renderTopics(); focusLater("topics-h"); }
    if (view === "saved") { renderSaved(); focusLater("saved-h"); }
    if (view === "search") { renderSearch(); focusLater("search-input"); }
    if (view === "deck") requestAnimationFrame(syncFaces);
    window.scrollTo(0, 0);
  }
  function focusLater(id) { setTimeout(function () { var el = $(id); if (el) el.focus(); }, 30); }

  function setHash(id) {
    try { history.replaceState(history.state, "", "#" + id); } catch (e) { /* بيئة لا تسمح */ }
  }

  /* ---------- حجم الخط ---------- */
  function applyScale(i) {
    i = Math.max(0, Math.min(SCALES.length - 1, i));
    document.documentElement.style.setProperty("--scale", SCALES[i]);
    lsSet(LS_SCALE, i);
    $("btn-font-down").disabled = i === 0;
    $("btn-font-up").disabled = i === SCALES.length - 1;
    state.scaleIndex = i;
    requestAnimationFrame(syncFaces);
  }

  /* ---------- التشكيل (زر خاص بالواجهة العربية) ---------- */
  function paintTashkeel() {
    var b = $("btn-tashkeel"), on = state.tashkeel;
    b.hidden = !isAr();
    b.setAttribute("aria-pressed", on);
    b.setAttribute("aria-label", t("tool.tashkeel"));
    b.title = t(on ? "tool.tashkeel.hide" : "tool.tashkeel.show");
    b.querySelector(".tk-glyph").textContent = on ? "حَ" : "ح";
    b.querySelector(".tk-lbl").textContent = t("tool.tashkeel.label");
  }
  function applyTashkeel(on, announce) {
    state.tashkeel = on;
    lsSet(LS_TASHKEEL, on);
    paintTashkeel();
    if (!announce) return;
    // نحدّث النص في مكانه دون إعادة رسم البطاقة ولا قلبها
    if (state.all.length) {
      var h = state.list[state.index], el = document.querySelector("#face-front .h-text");
      if (h && el && !state.pending) { el.innerHTML = highlight(shown(h.text), (h.reward || []).map(shown)); syncFaces(); }
      if (state.view === "saved") renderSaved();
      if (state.view === "search") renderSearch();
      renderOrigin();
      $("share-box").hidden = true;
    }
    vowelTree(document.body);
    toast(t(on ? "toast.tashkeel_on" : "toast.tashkeel_off"));
  }

  /* ---------- السحب على الهاتف ---------- */
  function bindSwipe() {
    var deck = $("deck"), sx = 0, sy = 0, tracking = false;
    deck.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      tracking = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    deck.addEventListener("touchend", function (e) {
      if (!tracking) return; tracking = false;
      var tc = e.changedTouches[0], dx = tc.clientX - sx, dy = tc.clientY - sy;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      // اتجاه عربي: سحب الإصبع نحو اليمين يُظهر الحديث التالي القادم من اليسار، والعكس في اللغات اللاتينية
      go((dx > 0) !== ltr() ? 1 : -1);
    }, { passive: true });
  }

  /* ---------- لوحة المفاتيح ---------- */
  function bindKeys() {
    document.addEventListener("keydown", function (e) {
      if (state.view !== "deck") { if (e.key === "Escape") show("deck"); return; }
      var tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target.closest(".lang-picker")) return;
      var fwd = ltr() ? "ArrowRight" : "ArrowLeft", bwd = ltr() ? "ArrowLeft" : "ArrowRight";
      if (e.key === fwd) { e.preventDefault(); go(1); }
      else if (e.key === bwd) { e.preventDefault(); go(-1); }
      else if (e.key === "Escape" && state.flipped) flip(false);
    });
  }

  /* ---------- أصل العبارة ---------- */
  function renderOrigin() {
    var o = state.site.origin, ot = state.text.origin;
    if (!o) { $("origin").hidden = true; return; }
    var srcs = o.sources.map(function (s) {
      var label = nameHTML(s.book) + " (" + esc(iso(s.number)) + ")";
      return s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + label + "</a>" : label;
    }).join(t("sep.list"));
    if (isAr() || !ot) {
      $("origin-body").innerHTML = (isAr() ? "" : '<div class="ar-orig" lang="ar" dir="rtl">') +
        '<p class="quote">«' + esc(shown(o.text)) + "»</p>" +
        "<p>" + esc(o.context) + "</p>" +
        '<p class="src">' + srcs + (o.note ? ". " + esc(o.note) : "") + "</p>" + (isAr() ? "" : "</div>");
      return;
    }
    $("origin-body").innerHTML =
      '<p class="quote">' + esc(ot.text) + "</p>" +
      '<p class="quote-ar ar-orig" lang="ar" dir="rtl">«' + esc(o.text) + "»</p>" +
      '<p class="cite">' + esc(ot.speaker) + "</p>" +
      "<p>" + esc(ot.context) + "</p>" +
      '<p class="src">' + srcs + (ot.note ? ". " + esc(ot.note) : "") + "</p>";
  }

  /* ---------- اللغة ---------- */
  // يبني قائمة الأحاديث المتاحة للغة الحالية. لا يُعرض إلا ما تسمح حالته بالعرض (المعتمد، والمسودة في المعاينة فقط)
  function buildLang() {
    var code = I.lang;
    if (isAr()) {
      state.all = state.base;
      state.text = { title: state.site.title, tagline: state.site.tagline, pilot_notice: state.site.pilot_notice, origin: null };
      state.categories = state.baseCats;
    } else {
      var c = content[code] || { site: {}, hadiths: {} };
      state.all = state.base.map(function (a) {
        var tr = c.hadiths[a.id];
        return tr && I.shows(tr.status) ? merge(a, tr) : null;
      }).filter(Boolean);
      var s = c.site || {};
      state.text = { title: s.title || state.site.title, tagline: s.tagline || "", pilot_notice: s.pilot_notice || "", origin: s.origin || null };
      state.categories = state.baseCats.map(function (x) {
        var y = (s.categories || {})[x.id];
        return y ? { id: x.id, name: y.name, hint: y.hint } : x;
      });
    }
  }
  function paintChrome() {
    I.applyDom(document);
    document.title = t("meta.title");
    var md = document.querySelector('meta[name="description"]'); if (md) md.setAttribute("content", t("meta.description"));
    $("brand").textContent = state.text ? state.text.title : t("meta.title");
    if (state.text) {
      $("site-title").textContent = state.text.title;
      $("site-tagline").textContent = state.text.tagline;
      $("site-tagline").hidden = !state.text.tagline;
    }
    var allowed = (state.site && state.site.publish_statuses) || ["approved"];
    $("pilot-notice").textContent = isAr() ? (allowed.indexOf("text_verified") !== -1 ? (state.site.pilot_notice || "") : "") : (I.reg.preview ? state.text.pilot_notice : "");
    // نسبة ما تُرجم، ووسم واضح إذا كانت في المعروض ترجمات أولية
    var banner = $("tr-banner");
    if (isAr()) banner.hidden = true;
    else {
      var drafts = state.all.some(function (h) { return !I.isApproved(h.tr.status); });
      var parts = [];
      if (state.all.length < state.base.length) parts.push(t("tr.coverage", { n: I.num(state.all.length), total: I.num(state.base.length) }));
      if (drafts) parts.push(t("tr.preview_banner"));
      banner.textContent = parts.join(" ");
      banner.hidden = !parts.length;
    }
    $("saved-count").textContent = I.num(state.saved.length);
    updateUnread();
    paintTashkeel();
    var fam = $("btn-family"), fb = fam.getAttribute("data-base") || fam.getAttribute("href");
    fam.setAttribute("data-base", fb);
    fam.setAttribute("href", fb + (fb.indexOf("?") === -1 ? "?" : "&") + "lang=" + I.lang);
    if (pick) pick.paint();
  }

  function loadLang(code) {
    var jobs = [I.loadDict("ui", code)];
    if (code !== I.reg.source && !content[code]) {
      jobs.push(I.fetchJSON("data/content/" + code + ".json").then(function (c) { content[code] = c; }, function () { content[code] = { site: {}, hadiths: {} }; }));
    }
    if (code === I.reg.source && !TK) {
      I.fetchJSON(TASHKEEL_URL).then(function (m) { TK = m; vowelTree(document.body); }, function () { /* يبقى النص كما هو */ });
    }
    return Promise.all(jobs);
  }

  // تبديل اللغة في مكانها: نفس الحديث ونفس الواجهة ونفس الوجه، والمفضلة والتقدم كما هما
  var switching = 0;
  function switchLang(code, opts) {
    opts = opts || {};
    var ticket = ++switching;
    var curId = state.pending || (state.list[state.index] && state.list[state.index].id);
    var wasFlipped = state.flipped, view = state.view, filter = state.filter;
    document.documentElement.classList.add("lang-busy");
    return loadLang(code).then(function () {
      return I.setLang(code, { remember: opts.remember !== false });
    }).then(function () {
      if (ticket !== switching) return;
      buildLang();
      paintChrome();
      renderOrigin();
      $("lang-offer").hidden = true;
      // نحافظ على التصنيف إن كان الحديث فيه، وإلا نعرض الكل
      setFilter(filter, true);
      var i = state.list.findIndex(function (h) { return h.id === curId; });
      if (i === -1 && filter) { setFilter(null, true); i = state.list.findIndex(function (h) { return h.id === curId; }); }
      state.pending = i === -1 && curId ? curId : null;
      state.index = Math.max(0, i);
      render(null, { flipped: wasFlipped && !state.pending });
      if (view === "topics") renderTopics();
      if (view === "saved") renderSaved();
      if (view === "search") renderSearch();
      if (!opts.silent) toast(t("toast.lang"));
    }).catch(function () { toast(t("error.load")); })
      .then(function () { document.documentElement.classList.remove("lang-busy", "i18n-wait"); });
  }

  // رابط بلغة غير لغة الزائر المعتادة: نعرض عليه لغته بلغته هو، ويبقى الحديث نفسه.
  // وزائر جديد بلا اختيار سابق ولغة متصفحه مدعومة: نقترح عليه لغته دون فرضها
  function offerStored() {
    var urlLang = I.fromUrl(), st = I.stored(), msg = "tr.link_offer";
    if (!urlLang && !st) {
      var b = I.fromBrowser();
      try { if (localStorage.getItem("qararit.lang.offered")) b = null; } catch (e) {}
      if (!b || b === I.lang) return;
      st = b; msg = "tr.browser_offer";
    }
    if (!st || (urlLang || I.lang) === st) return;
    I.loadDict("ui", st).then(function () {
      var box = $("lang-offer"), l = I.info(st);
      box.setAttribute("lang", st); box.setAttribute("dir", l.dir);
      box.innerHTML = ICON.lang + "<span>" + esc(I.tIn(st, msg, { lang: l.name })) + "</span>" +
        '<button type="button" class="btn small primary" id="offer-yes">' + esc(I.tIn(st, "tr.link_switch", { lang: l.name })) + "</button>" +
        '<button type="button" class="link-btn" id="offer-no">' + esc(I.tIn(st, "tr.dismiss")) + "</button>";
      box.hidden = false;
      function seen() { try { localStorage.setItem("qararit.lang.offered", "1"); } catch (e) {} }
      $("offer-yes").onclick = function () { seen(); switchLang(st); };
      $("offer-no").onclick = function () { seen(); box.hidden = true; };
    }).catch(function () {});
  }

  /* ---------- التشغيل ---------- */
  var pick = null;
  function boot(data) {
    var allowed = (data.site && data.site.publish_statuses) || ["approved"];
    state.site = data.site || {};
    state.baseCats = data.categories || [];
    state.base = (data.hadiths || []).filter(function (h) { return allowed.indexOf(h.status) !== -1; });
    var ids = state.base.map(function (h) { return h.id; });
    // المفضلة والتقدم تُحفظ بمعرّفات الأحاديث، فلا تتأثر باللغة
    state.saved = lsGet(LS_SAVED, []).filter(function (id) { return ids.indexOf(id) !== -1; });
    state.read = lsGet(LS_READ, []).filter(function (id) { return ids.indexOf(id) !== -1; });
    state.recent = lsGet(LS_RECENT, []).filter(function (id) { return ids.indexOf(id) !== -1; });
    buildLang();
    paintChrome();
    renderOrigin();
    setFilter(null, true);

    var id = (location.hash || "").slice(1);
    var i = state.list.findIndex(function (h) { return h.id === id; });
    state.pending = i === -1 && baseIndex(id) !== -1 ? id : null;
    state.index = i === -1 ? 0 : i;
    render();
    document.documentElement.classList.remove("i18n-wait");
    offerStored();
  }

  function init() {
    var code = I.initial();
    applyScale(lsGet(LS_SCALE, 1));
    state.tashkeel = lsGet(LS_TASHKEEL, true) !== false;
    $("btn-tashkeel").onclick = function () { applyTashkeel(!state.tashkeel, true); };
    $("btn-font-down").onclick = function () { applyScale(state.scaleIndex - 1); };
    $("btn-font-up").onclick = function () { applyScale(state.scaleIndex + 1); };
    $("btn-next").onclick = function () { go(1); };
    $("btn-prev").onclick = function () { go(-1); };
    $("btn-topics").onclick = function () { show("topics"); };
    $("btn-saved").onclick = function () { show("saved"); };
    $("btn-random").onclick = discover;
    $("btn-unread").onclick = function () {
      if (!unreadCount()) { toast(t("toast.all_read")); return; }
      state.pending = null; setFilter(UNREAD, true); show("deck"); render();
    };
    $("share-image").onclick = shareImage;
    $("share-close").onclick = function () { $("share-box").hidden = true; };
    $("btn-search").onclick = function () { show("search"); };
    $("brand").onclick = function () { state.pending = null; setFilter(null, true); state.index = 0; show("deck"); render(); };
    $("filter-clear").onclick = function () {
      var cur = state.list[state.index];
      setFilter(null, true);
      state.index = Math.max(0, state.list.indexOf(cur));
      render();
    };
    $("share-copy").onclick = function () {
      var inp = $("share-url");
      copy(inp.value, function (ok) {
        if (ok) toast(t("toast.copied"));
        else { inp.focus(); inp.select(); toast(t("toast.copy_manual")); }
      });
    };
    $("search-input").addEventListener("input", renderSearch);
    Array.prototype.forEach.call(document.querySelectorAll("[data-back]"), function (b) {
      b.onclick = function () { show("deck"); };
    });
    $("topic-list").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-cat]"); if (!b) return;
      state.pending = null; setFilter(b.getAttribute("data-cat"), true); show("deck"); render();
    });
    ["saved-list", "search-list"].forEach(function (id) {
      $(id).addEventListener("click", function (e) {
        var b = e.target.closest("button[data-id]"); if (b) openHadith(b.getAttribute("data-id"));
      });
    });
    window.addEventListener("hashchange", function () {
      var id = location.hash.slice(1), cur = state.pending || (state.list[state.index] && state.list[state.index].id);
      if (id && id !== cur && baseIndex(id) !== -1) openHadith(id);
    });
    window.addEventListener("resize", function () { requestAnimationFrame(syncFaces); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { requestAnimationFrame(syncFaces); });
    if (document.fonts) document.fonts.addEventListener && document.fonts.addEventListener("loadingdone", function () { requestAnimationFrame(syncFaces); });
    bindSwipe();
    bindKeys();
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        $("brand").classList.toggle("is-quiet", es[0].isIntersecting && state.view === "deck");
      }).observe($("site-title"));
    }

    if ("MutationObserver" in window) {
      new MutationObserver(function (ms) {
        if (!isAr()) return;
        ms.forEach(function (m) {
          if (m.type === "characterData") vowelTree(m.target);
          else Array.prototype.forEach.call(m.addedNodes, vowelTree);
        });
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    var data = I.fetchJSON(DATA_URL);
    Promise.all([loadLang(code), I.setLang(code, { remember: false }), data]).then(function (r) {
      pick = I.picker($("lang-picker"), function (c) { switchLang(c); });
      boot(r[2]);
      vowelTree(document.body);
    }).catch(function () {
      document.documentElement.classList.remove("i18n-wait");
      $("deck").innerHTML = '<p class="error">' + esc(t("error.load") || "تعذّر تحميل الأحاديث. إن كنت فتحت الملف مباشرة من جهازك، فشغّله عبر خادم محلي أو انشره على الإنترنت كما في دليل النشر.") + "</p>";
    });
  }

  init();
})();
