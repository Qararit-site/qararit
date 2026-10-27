/* تحدي الأسرة — نمط «مجلس على هذا الجهاز» (الإصدار الأول، بلا خادم).
 * الأسرة حول جهاز واحد يتناوب عليه أفرادها. كل شيء يُحفظ في هذا المتصفح فقط، ولا يتزامن مع أي جهاز آخر،
 * والواجهة تقول ذلك صراحة. يطبّق القواعد نفسها التي تفرضها قاعدة البيانات في النمط المشترك
 * (هوية مستقلة لكل مشارك، ومنع تكرار الإجابة، والرمز الشخصي على الجهاز المشترك، وكشف الجواب بعد إجابة الجميع)،
 * ويعيد البيانات بالشكل نفسه حتى تعمل الشاشات ذاتها في النمطين.
 */
(function () {
  "use strict";

  var KEY = "qararit.family.local";
  var PREFIX = "local-";
  var loadContent = null, pilot = false, bank = null;

  function E(code) { return new Error(code); }
  function now() { return Date.now(); }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
  }
  function load() {
    var raw;
    try { raw = localStorage.getItem(KEY); } catch (e) { throw E("storage_unavailable"); }
    var db = raw ? JSON.parse(raw) : null;
    return db && db.v === 1 ? db : { v: 1, families: {}, unlock: null };
  }
  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { throw E("storage_unavailable"); }
  }
  function cleanName(t, max) {
    var s = String(t == null ? "" : t).replace(/[\s\u0000-\u001f]+/g, " ").trim();
    if (s.length < 1 || s.length > max) throw E("bad_name");
    return s;
  }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function daysSince(t) { return Math.floor((today() - t) / 86400000); }
  function hashPin(salt, pin) {
    var data = new TextEncoder().encode(salt + ":" + pin);
    return crypto.subtle.digest("SHA-256", data).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    });
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function fam(db, id) { var f = db.families[id]; if (!f) throw E("not_member"); return f; }
  function part(f, pid) { return f.participants.filter(function (p) { return p.id === pid; })[0]; }
  function actor(db, f, pid, needAdmin, forWrite) {
    var p = part(f, pid);
    if (!p) throw E("not_member");
    if (forWrite && f.closed) throw E("family_closed");
    if (needAdmin && !p.is_admin) throw E("not_admin");
    if (p.has_pin && f.participants.length > 1) {
      var u = db.unlock;
      if (!(u && u.fid === f.id && u.pid === pid && u.exp > now())) throw E("pin_required");
    }
    return p;
  }
  function chal(f, cid) { var c = f.challenges.filter(function (x) { return x.id === cid; })[0]; if (!c) throw E("not_found"); return c; }
  function unlockedIndex(c) { return c.kind === "week" ? Math.min(c.hadith_ids.length - 1, Math.max(0, daysSince(c.starts_on))) : c.hadith_ids.length - 1; }
  function published(q) { return q.review_status === "approved" || (pilot && q.review_status === "auto_checked"); }
  function bump(f) { f.rev = (f.rev || 0) + 1; }

  function loadBank() {
    if (bank) return Promise.resolve(bank);
    return fetch("questions.json").then(function (r) { if (!r.ok) throw E("not_enough_questions"); return r.json(); })
      .then(function (d) { bank = {}; d.questions.forEach(function (q) { bank[q.id] = q; }); return bank; });
  }

  var fns = {
    create_local_family: function (a) {
      var db = load();
      var fid = PREFIX + uid(), pid = uid();
      db.families[fid] = { id: fid, name: cleanName(a.p_family_name, 60), closed: false, rev: 0, created_at: now(),
        participants: [{ id: pid, name: cleanName(a.p_display_name, 30), is_admin: true, color: 0, has_pin: false, created_at: now() }],
        challenges: [], answers: [] };
      save(db);
      return { family_id: fid, participant_id: pid };
    },
    my_families: function () {
      var db = load();
      return Object.keys(db.families).map(function (k) {
        var f = db.families[k];
        return { family_id: f.id, name: f.name, closed: f.closed, local: true,
          participants: f.participants.map(function (p) { return { id: p.id, name: p.name, is_admin: p.is_admin, has_pin: p.has_pin }; }) };
      });
    },
    family_state: function (a) {
      var db = load(), f = fam(db, a.p_family);
      return {
        family: { id: f.id, name: f.name, closed: f.closed, rev: f.rev || 0 }, local: true,
        mine: f.participants.map(function (p) { return p.id; }),
        participants: f.participants.map(function (p) { return { id: p.id, name: p.name, is_admin: p.is_admin, color: p.color, has_pin: p.has_pin, present: true }; }),
        challenges: f.challenges.slice().sort(function (x, y) { return y.created_at - x.created_at; }).map(function (c) {
          return { id: c.id, kind: c.kind, level: c.level, status: c.status, show_ranking: c.show_ranking, allow_retry: c.allow_retry,
            count: c.hadith_ids.length, created_at: new Date(c.created_at).toISOString(), finished_at: c.finished_at ? new Date(c.finished_at).toISOString() : null };
        }),
        pilot_questions: pilot
      };
    },
    family_rev: function (a) { return fam(load(), a.p_family).rev || 0; },
    add_local_participant: function (a) {
      var db = load(), f = fam(db, a.p_family);
      if (f.closed) throw E("family_closed");
      if (f.participants.length >= 30) throw E("family_full");
      var p = { id: uid(), name: cleanName(a.p_display_name, 30), is_admin: false, color: f.participants.length % 8, has_pin: false, created_at: now() };
      var pin = a.p_pin || "";
      if (pin && !/^[0-9]{4,6}$/.test(pin)) throw E("bad_pin");
      var ready = pin ? (p.pin_salt = uid(), hashPin(p.pin_salt, pin).then(function (hh) { p.pin_hash = hh; p.has_pin = true; })) : Promise.resolve();
      return ready.then(function () {
        f.participants.push(p); bump(f); save(db);
        return { participant_id: p.id, recovery_code: null };
      });
    },
    unlock_participant: function (a) {
      var db = load(), f = fam(db, a.p_family), p = part(f, a.p_participant);
      if (!p) throw E("not_member");
      if (!p.has_pin) return { ok: true };
      if (p.pin_locked_until && p.pin_locked_until > now()) throw E("pin_locked");
      return hashPin(p.pin_salt, a.p_pin || "").then(function (hh) {
        if (hh === p.pin_hash) {
          p.pin_failures = 0; p.pin_locked_until = null;
          db.unlock = { fid: f.id, pid: p.id, exp: now() + 30 * 60000 };
          save(db); return { ok: true };
        }
        p.pin_failures = (p.pin_failures || 0) + 1;
        if (p.pin_failures >= 5) { p.pin_locked_until = now() + 10 * 60000; p.pin_failures = 0; }
        save(db); return { ok: false };
      });
    },
    lock_device: function () { var db = load(); db.unlock = null; save(db); return null; },
    set_pin: function (a) {
      var db = load(), f = fam(db, a.p_family), p = actor(db, f, a.p_participant, false, true);
      var pin = a.p_new_pin || "";
      if (!pin) { p.has_pin = false; p.pin_hash = null; save(db); return null; }
      if (!/^[0-9]{4,6}$/.test(pin)) throw E("bad_pin");
      p.pin_salt = uid();
      return hashPin(p.pin_salt, pin).then(function (hh) { p.pin_hash = hh; p.has_pin = true; bump(f); save(db); return null; });
    },
    rename_participant: function (a) {
      var db = load(), f = fam(db, a.p_family);
      actor(db, f, a.p_actor, a.p_actor !== a.p_target, true);
      var t = part(f, a.p_target); if (!t) throw E("not_member");
      t.name = cleanName(a.p_name, 30); bump(f); save(db); return null;
    },
    remove_participant: function (a) {
      var db = load(), f = fam(db, a.p_family);
      actor(db, f, a.p_actor, a.p_actor !== a.p_target, false);
      var t = part(f, a.p_target); if (!t) throw E("not_member");
      if (t.is_admin && f.participants.filter(function (p) { return p.is_admin; }).length === 1 && f.participants.length > 1) throw E("last_admin");
      f.participants = f.participants.filter(function (p) { return p.id !== t.id; });
      f.answers = f.answers.filter(function (x) { return x.participant_id !== t.id; });   // تُحذف إجاباته معه
      if (db.unlock && db.unlock.pid === t.id) db.unlock = null;
      bump(f); save(db); return null;
    },
    set_admin: function (a) {
      var db = load(), f = fam(db, a.p_family);
      actor(db, f, a.p_actor, true, true);
      var t = part(f, a.p_target); if (!t) throw E("not_member");
      if (!a.p_admin && !f.participants.some(function (p) { return p.is_admin && p.id !== t.id; })) throw E("last_admin");
      t.is_admin = !!a.p_admin; bump(f); save(db); return null;
    },
    close_family: function (a) {
      var db = load(), f = fam(db, a.p_family);
      actor(db, f, a.p_actor, true, false);
      f.closed = !!a.p_closed; bump(f); save(db); return null;
    },
    delete_family: function (a) {
      var db = load(), f = fam(db, a.p_family);
      actor(db, f, a.p_actor, true, false);
      if (f.name !== String(a.p_confirm_name || "").trim()) throw E("confirm_mismatch");
      delete db.families[f.id];
      if (db.unlock && db.unlock.fid === f.id) db.unlock = null;
      save(db); return null;
    },
    create_challenge: function (a) {
      return Promise.all([loadBank(), loadContent()]).then(function (r) {
        var qb = r[0], content = r[1];
        var db = load(), f = fam(db, a.p_family);
        actor(db, f, a.p_actor, true, true);
        var n = { c3: 3, c5: 5, c10: 10, week: 7 }[a.p_kind];
        if (!n || ["kids", "general", "advanced"].indexOf(a.p_level) === -1) throw E("bad_input");
        if (f.challenges.filter(function (c) { return c.status === "active"; }).length >= 5) throw E("too_many_active");
        var per = a.p_level === "kids" ? 1 : 2;
        var byH = {};
        Object.keys(qb).forEach(function (id) {
          var q = qb[id];
          if (q.level === a.p_level && published(q) && content.byId[q.hadith_id]) (byH[q.hadith_id] = byH[q.hadith_id] || []).push(q.id);
        });
        var used = {};
        f.challenges.forEach(function (c) { c.hadith_ids.forEach(function (h) { used[h] = true; }); });
        var fresh = shuffle(Object.keys(byH).filter(function (h) { return !used[h]; }));
        var old = shuffle(Object.keys(byH).filter(function (h) { return used[h]; }));
        var hids = fresh.concat(old).slice(0, n);
        if (hids.length < Math.min(n, 3)) throw E("not_enough_questions");
        var c = { id: uid(), kind: a.p_kind, level: a.p_level, allow_retry: !!a.p_allow_retry, show_ranking: !!a.p_show_ranking,
          hadith_ids: hids, current_index: 0, starts_on: today(), status: "active", created_at: now(), finished_at: null, questions: [] };
        var pos = 0;
        hids.forEach(function (h, i) {
          byH[h].sort().reverse().slice(0, per).forEach(function (qid) { c.questions.push({ question_id: qid, hadith_index: i, position: pos++, revealed: false }); });
        });
        f.challenges.push(c); bump(f); save(db);
        return c.id;
      });
    },
    challenge_view: function (a) {
      return loadBank().then(function (qb) {
        var db = load(), f = fam(db, a.p_family);
        if (!part(f, a.p_participant)) throw E("not_member");
        var c = chal(f, a.p_challenge), done = c.status === "done";
        return {
          id: c.id, kind: c.kind, level: c.level, status: c.status, allow_retry: c.allow_retry, show_ranking: c.show_ranking,
          hadith_ids: c.hadith_ids, current_index: c.current_index, unlocked_index: unlockedIndex(c),
          questions: c.questions.map(function (cq) {
            var q = qb[cq.question_id] || { prompt: "", choices: [] };
            var all = f.answers.filter(function (x) { return x.challenge_id === c.id && x.question_id === cq.question_id; });
            var mineA = all.filter(function (x) { return x.participant_id === a.p_participant; }).sort(function (x, y) { return y.attempt - x.attempt; });
            var rev = cq.revealed || done;
            var who = {}; all.forEach(function (x) { who[x.participant_id] = true; });
            return {
              id: cq.question_id, hadith_index: cq.hadith_index, hadith_id: q.hadith_id, qtype: q.type, prompt: q.prompt, choices: q.choices,
              revealed: rev, answered_by: Object.keys(who),
              mine: mineA.length ? { attempts: mineA.length, last_choice: mineA[0].choice,
                correct: rev || c.allow_retry ? mineA.some(function (x) { return x.is_correct; }) : null } : null,
              key: rev ? { correct: q.correct, explanation: q.explanation, source: q.source } : null
            };
          })
        };
      });
    },
    submit_answer: function (a) {
      return loadBank().then(function (qb) {
        var db = load(), f = fam(db, a.p_family);
        actor(db, f, a.p_participant, false, true);
        var c = chal(f, a.p_challenge);
        if (c.status !== "active") throw E("challenge_done");
        var cq = c.questions.filter(function (x) { return x.question_id === a.p_question; })[0];
        if (!cq) throw E("not_found");
        if (cq.hadith_index > unlockedIndex(c)) throw E("not_unlocked");
        if (cq.revealed) return { status: "closed" };
        var q = qb[a.p_question];
        if (typeof a.p_choice !== "number" || a.p_choice < 0 || a.p_choice >= q.choices.length) throw E("bad_input");
        var prev = f.answers.filter(function (x) { return x.challenge_id === c.id && x.participant_id === a.p_participant && x.question_id === a.p_question; });
        var prevOk = prev.some(function (x) { return x.is_correct; });
        if (prev.length && (!c.allow_retry || prevOk || prev.length >= 3)) return { status: "duplicate" };
        var ok = a.p_choice === q.correct;
        f.answers.push({ challenge_id: c.id, participant_id: a.p_participant, question_id: a.p_question, attempt: prev.length + 1, choice: a.p_choice, is_correct: ok, created_at: now() });
        // تنتهي مرحلة الإجابة حين يجيب كل المشاركين
        var finished = {};
        f.answers.forEach(function (x) {
          if (x.challenge_id === c.id && x.question_id === a.p_question && (x.is_correct || !c.allow_retry || x.attempt >= 3)) finished[x.participant_id] = true;
        });
        var revealed = f.participants.every(function (p) { return finished[p.id]; });
        if (revealed) cq.revealed = true;
        bump(f); save(db);
        return { status: "recorded", revealed: revealed, correct: c.allow_retry || revealed ? ok : null, can_retry: c.allow_retry && !ok && prev.length + 1 < 3 };
      });
    },
    reveal_question: function (a) {
      var db = load(), f = fam(db, a.p_family);
      actor(db, f, a.p_actor, true, false);
      var cq = chal(f, a.p_challenge).questions.filter(function (x) { return x.question_id === a.p_question; })[0];
      if (!cq) throw E("not_found");
      cq.revealed = true; bump(f); save(db); return null;
    },
    set_current_index: function (a) {
      var db = load(), f = fam(db, a.p_family);
      actor(db, f, a.p_actor, true, true);
      var c = chal(f, a.p_challenge);
      if (a.p_index < 0 || a.p_index > unlockedIndex(c)) throw E("not_unlocked");
      c.current_index = a.p_index; bump(f); save(db); return null;
    },
    finish_challenge: function (a) {
      var db = load(), f = fam(db, a.p_family);
      actor(db, f, a.p_actor, true, false);
      var c = chal(f, a.p_challenge);
      if (c.status === "active") { c.status = "done"; c.finished_at = now(); c.questions.forEach(function (q) { q.revealed = true; }); }
      bump(f); save(db); return null;
    },
    challenge_board: function (a) {
      var db = load(), f = fam(db, a.p_family), c = chal(f, a.p_challenge), done = c.status === "done";
      var rev = {}; c.questions.forEach(function (q) { rev[q.question_id] = q.revealed || done; });
      var hadithsTouched = {};
      var rows = f.participants.map(function (p) {
        var ans = {}, cor = {};
        f.answers.forEach(function (x) {
          if (x.challenge_id !== c.id || x.participant_id !== p.id) return;
          ans[x.question_id] = true;
          if (x.is_correct && rev[x.question_id]) cor[x.question_id] = true;
        });
        Object.keys(ans).forEach(function (qid) {
          var cq = c.questions.filter(function (q) { return q.question_id === qid; })[0]; if (cq) hadithsTouched[cq.hadith_index] = true;
        });
        var n = Object.keys(ans).length;
        return { participant_id: p.id, name: p.name, color: p.color, answered: n, correct: Object.keys(cor).length, complete: n >= c.questions.length };
      });
      return { total: c.questions.length, show_ranking: c.show_ranking, status: c.status, hadith_count: c.hadith_ids.length,
               hadiths_reached: Object.keys(hadithsTouched).length, rows: rows };
    }
  };

  window.FamilyLocal = {
    init: function (opts) { loadContent = opts.loadContent; pilot = !!opts.pilot; },
    isLocal: function (id) { return typeof id === "string" && id.indexOf(PREFIX) === 0; },
    call: function (fn, args) {
      if (!fns[fn]) return Promise.reject(E("not_available_offline"));
      try { return Promise.resolve(fns[fn](args || {})); } catch (e) { return Promise.reject(e); }
    }
  };
})();
