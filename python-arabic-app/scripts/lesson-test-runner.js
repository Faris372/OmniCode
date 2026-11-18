// اختبار آلي لكل الدروس والتمارين داخل الصفحة (الموقع أو التطبيق عبر أدوات المطوّر/CDP).
// الاستخدام: الصق هذا الملف في Console ثم:  await __omniTest('cpp')  أو  __omniTest('java', {sections: ['java-classes']})
// يتحقق أن كل حل ينجح وكل كود ابتدائي يفشل، ويشغّل كل الأمثلة. window.prompt يُستبدل بإجابات ثابتة.
window.__omniTest = async function (lang, opt) {
  opt = opt || {};
  const T = window.__T = { lang, done: false, n: 0, fails: [], log: [], t0: Date.now() };
  const answers = opt.answers || ['7'];
  let ai = 0;
  window.prompt = () => answers[(ai++) % answers.length];
  const run = (code, check) => window.__omni.runCode(lang, code, check, () => { });
  const secs = opt.sections || null;
  const lessons = LESSONS.filter(l => (lang === 'java' ? /^java/.test(l.sec) : l.sec.startsWith(lang)) && (!secs || secs.includes(l.sec)) && (!opt.only || opt.only.includes(l.id)));
  for (const L of lessons) {
    if (!opt.skipExamples) {
      let i = 0;
      for (const b of L.blocks) {
        if (!b || !b.ex) continue;
        i++; ai = 0;
        const r = await run(b.code);
        T.n++;
        const expectErr = /\/\/\s*(❌|خطأ)/.test(b.code) && false;
        if (r.error && !b.expectError) T.fails.push({ id: L.id, what: 'example ' + i + ' (' + b.ex + ')', err: r.error.type + ': ' + (r.error.tb || r.error.ar), out: (r.out || '').slice(0, 200) });
      }
    }
    if (L.ch) {
      ai = 0;
      const s = await run(L.ch.solution + '\n', L.ch.check);
      T.n++;
      if (!s.check || !s.check.ok) T.fails.push({ id: L.id, what: 'solution', msg: s.check && s.check.msg, err: s.error && (s.error.type + ': ' + (s.error.tb || s.error.ar)), out: (s.out || '').slice(0, 300) });
      ai = 0;
      const st = await run(L.ch.starter + '\n', L.ch.check);
      T.n++;
      if (st.check && st.check.ok) T.fails.push({ id: L.id, what: 'starter passes!' });
    }
    T.log.push(L.id);
  }
  if (opt.practice === true || (opt.practice !== false && !opt.only && !secs)) {
    (PRACTICE[lang] || []).forEach((lv, li) => lv.items.forEach((it, ii) => { it._id = (li + 1) + '-' + (ii + 1); }));
    for (const lv of (PRACTICE[lang] || [])) for (const it of lv.items) {
      if (it.t === 'quiz') { if (!(it.a >= 0 && it.a < it.opts.length)) T.fails.push({ id: 'P' + it._id, what: 'quiz answer index' }); continue; }
      ai = 0;
      const s = await run(it.solution + '\n', it.check);
      T.n++;
      if (!s.check || !s.check.ok) T.fails.push({ id: 'P' + it._id + ' ' + it.title, what: 'solution', msg: s.check && s.check.msg, err: s.error && (s.error.type + ': ' + (s.error.tb || s.error.ar)), out: (s.out || '').slice(0, 300) });
      ai = 0;
      const st = await run((it.t === 'bug' ? it.code : it.starter) + '\n', it.check);
      T.n++;
      if (st.check && st.check.ok) T.fails.push({ id: 'P' + it._id + ' ' + it.title, what: 'starter/bug passes!' });
      T.log.push('P' + it._id);
    }
  }
  T.done = true; T.secs = Math.round((Date.now() - T.t0) / 1000);
  return T;
};
