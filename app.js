// The library page: saved sentences, saved words, games, settings and help.
// Every text goes through t() / tn() so it appears in the user's own language.
(() => {
  const GS = globalThis.GSTStore;
  const GG = globalThis.GSTGame;
  const I18n = globalThis.GSTI18n;
  const A = globalThis.GSTAudio;
  const Ui = globalThis.GSTUi;
  const Yt = globalThis.GSTYt;
  const X = globalThis.GSTExport;
  const D = globalThis.GSTDates;
  const { h, seg, dirOf, langLabel } = Ui;
  const { t, tn } = I18n;
  const Store = GS.create(chrome.storage.local);

  const $title = document.getElementById('title');
  const $sub = document.getElementById('sub');
  const $view = document.getElementById('view');
  const $tabs = document.getElementById('tabs');
  const $toast = document.getElementById('toast');

  const state = {
    tab: 'sentences',
    settings: GS.merge(GS.DEFAULT_SETTINGS, {}),
    sentences: [],
    words: [],
    open: null, // the word panel that is open under a sentence
    sentenceTranslations: new Map(), // translations cached by sentence ID + target language
    sentenceTranslationPending: new Set(),
    game: null, // the game being played: {kind: 'cards' | 'match' | 'gap' | 'build' | 'listen', ...}
    menu: null, // a game whose start screen is shown ('cards' or 'listen'), null = the list of games
    // the time window: only what was saved in these days is shown and practised (lists and games share it)
    // {preset: 'all' | 'today' | 'yesterday' | 'week' | 'month' | '3months'} or {preset: 'custom', from: 'YYYY-MM-DD', to: 'YYYY-MM-DD'}
    range: { preset: 'all' },
  };

  // ---------- small helpers ----------
  const fmtTime = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const today = () => new Date().toISOString().slice(0, 10);
  // everything on this page belongs to the language being learned; items saved for other languages are kept but hidden
  const learn = () => state.settings.learn || 'de';
  const mySentences = () => state.sentences.filter((s) => (s.learn || 'de') === learn());
  const myWords = () => state.words.filter((w) => (w.learn || 'de') === learn());
  const hiddenCount = () => state.sentences.length - mySentences().length + state.words.length - myWords().length;
  const hiddenNote = () => (hiddenCount() ? h('p', { class: 'muted' }, t('lib.hidden', { n: hiddenCount() })) : ''); // '' not null: append() would print "null"
  const savedWord = (w) => myWords().some((x) => GS.norm(x.word) === GS.norm(w));
  const kbd = (k) => h('kbd', null, k);
  const noSpaces = () => GS.NO_SPACES.includes(GS.baseLang(learn()));

  let toastTimer;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('show'), 2600);
  }

  // data: a text, or bytes (the Excel file)
  function download(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // "Download": a little window that asks which kind of file (kind = 'sentences' or 'words')
  function chooseDownload(kind) {
    const items = inWindow(kind === 'sentences' ? mySentences() : myWords()); // what is shown (the chosen days)
    if (!items.length) return toast(t(kind === 'sentences' ? 'set.noSentences' : 'set.noWords'));
    const title = t(kind === 'sentences' ? 'dl.titleSentences' : 'dl.titleWords', { n: items.length });
    const dlg = h('dialog', { class: 'dlg', 'aria-label': title });
    const pick = (f) => {
      const file = X.make(kind, f.id, items, learn(), today());
      download(file.name, file.data, file.mime);
      dlg.close();
      toast(t('dl.done', { name: file.name }));
    };
    dlg.append(
      h('h3', null, title),
      h('p', { class: 'muted' }, t('dl.text')),
      h('div', { class: 'dlopts' },
        X.FORMATS.map((f) =>
          h('button', { type: 'button', class: 'dlopt', 'data-f': f.id, onclick: () => pick(f) },
            h('span', { class: 'gicon', 'aria-hidden': 'true' }, f.icon),
            h('span', { class: 'dltext' }, h('b', null, t('dl.' + f.id)), h('span', { class: 'muted' }, t('dl.' + f.id + 'Text'))),
            h('span', { class: 'dlext', dir: 'ltr' }, '.' + f.ext.split('.').pop())))),
      h('div', { class: 'row' }, h('span', { class: 'grow' }), h('button', { class: 'btn secondary', type: 'button', onclick: () => dlg.close() }, t('common.cancel'))));
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // a click on the dark area around it
    document.body.append(dlg);
    dlg.showModal(); // the browser keeps the keyboard inside it and closes it with Esc
  }

  const translateWord = (text) =>
    chrome.runtime
      .sendMessage({ type: 'translate', text, sl: learn(), tl: state.settings.lang })
      .then((r) => (r && r.text ? String(r.text).trim() : ''));

  // ---------- translations of saved sentences ----------
  // A saved sentence may have been translated into a different native language.
  // Translate it on demand (at most 4 at a time) and cache each target language separately.
  const sentenceTranslationKey = (s, target = state.settings.lang) => `${s.id}|${target}`;
  const sentenceTranslationQueue = [];
  let sentenceTranslationWorkers = 0;

  function runSentenceTranslationQueue() {
    while (sentenceTranslationWorkers < 4 && sentenceTranslationQueue.length) {
      const job = sentenceTranslationQueue.shift();
      // Drop obsolete queued work after the user changes their native language.
      if (job.target !== state.settings.lang) {
        state.sentenceTranslationPending.delete(job.key);
        continue;
      }
      sentenceTranslationWorkers++;
      chrome.runtime.sendMessage({ type: 'translate', text: job.sentence.text, sl: job.sentence.learn || 'de', tl: job.target })
        .then(async (r) => {
          const translated = r && r.text ? String(r.text).trim() : '';
          if (!translated) throw new Error('Empty translation');
          state.sentenceTranslations.set(job.key, translated);
          // Remember it, unless the user picked yet another language in the meantime.
          if (state.settings.lang === job.target) {
            job.sentence.translation = translated;
            job.sentence.lang = job.target;
            await Store.updateSentence(job.sentence.id, { translation: translated, lang: job.target });
            if (state.tab === 'sentences' || state.game) render();
          }
        })
        .catch((e) => console.warn('[GST] sentence translation failed', e))
        .finally(() => {
          state.sentenceTranslationPending.delete(job.key);
          sentenceTranslationWorkers--;
          runSentenceTranslationQueue();
        });
    }
  }

  function requestSentenceTranslation(s, target) {
    const key = sentenceTranslationKey(s, target);
    if (state.sentenceTranslations.has(key) || state.sentenceTranslationPending.has(key)) return;
    state.sentenceTranslationPending.add(key);
    sentenceTranslationQueue.push({ key, sentence: s, target });
    runSentenceTranslationQueue();
  }

  // the translation of a saved sentence into the user's language ('…' while it is being fetched)
  function sentenceTranslation(s) {
    const target = state.settings.lang;
    if (s.lang === target && s.translation) return s.translation;
    const key = sentenceTranslationKey(s, target);
    if (state.sentenceTranslations.has(key)) return state.sentenceTranslations.get(key);
    requestSentenceTranslation(s, target);
    return '…';
  }

  const diffOptions = () => [[1, t('diff.easy')], [2, t('diff.medium')], [3, t('diff.hard')]];

  // the keys, as big rows with a picture of the key
  function keysCard() {
    const row = (k, text) => h('div', { class: 'keyrow' }, kbd(k), h('span', null, text));
    return h('div', { class: 'card' },
      h('h3', null, t('keys.title')),
      row('W', t('keys.saveText')),
      row('S', t('keys.repeatText')),
      row('A', t('keys.prevText')),
      row('D', t('keys.nextText')),
      row('C', t('keys.toggleText')),
      h('p', { class: 'tip' }, tn('keys.paused', { key: kbd('S') })),
      h('p', { class: 'muted' }, t('keys.mouse')),
      h('p', { class: 'muted' }, t('keys.word')),
      h('p', { class: 'muted' }, t('keys.drag'))
    );
  }

  // ---------- language and colours of this page ----------
  function applyLangChrome() {
    const lang = state.settings.lang;
    I18n.setLearn(learn());
    Ui.applyTheme(state.settings);
    document.documentElement.lang = lang;
    document.documentElement.dir = dirOf(lang);
    document.title = t('app.title');
    $title.textContent = t('app.heading');
    $sub.textContent = t('app.sub', { s: mySentences().length, w: myWords().length });
    $tabs.setAttribute('aria-label', t('tabs.aria'));
    Yt.setLabels({ title: t('yt.title'), again: t('yt.again'), close: t('yt.close'), note: t('yt.note'), failed: t('yt.failed'), open: t('yt.open') });
  }

  let langRun = 0;
  // load the texts of the chosen language, then draw everything again
  async function applyLang() {
    const run = ++langRun;
    const lang = state.settings.lang;
    const slow = lang !== 'en' ? setTimeout(() => toast(t('i18n.preparing')), 500) : null;
    const ok = await I18n.load(lang);
    clearTimeout(slow);
    if (run !== langRun) return;
    applyLangChrome();
    renderTabs();
    render();
    if (!ok && lang !== 'en') toast(t('i18n.failed'));
  }

  // ---------- tabs ----------
  const TABS = ['sentences', 'words', 'practice', 'settings', 'help', 'about'];
  function renderTabs() {
    $sub.textContent = t('app.sub', { s: mySentences().length, w: myWords().length });
    $tabs.replaceChildren(
      ...TABS.map((id) => {
        const n = id === 'sentences' ? mySentences().length : id === 'words' ? myWords().length : null;
        return h('button', {
          type: 'button', role: 'tab', 'aria-selected': String(state.tab === id),
          onclick: () => go(id),
        }, t('tab.' + id), n ? h('span', { class: 'n' }, String(n)) : null);
      })
    );
  }
  function go(tab) {
    if (tab !== state.tab) state.open = null;
    Yt.close();
    state.tab = tab;
    renderTabs();
    render(false);
  }

  function render(keepScroll = true) {
    const y = window.scrollY;
    const view = { sentences: viewSentences, words: viewWords, practice: viewPractice, settings: viewSettings, help: viewHelp, about: viewAbout }[state.tab]();
    $view.replaceChildren(view);
    window.scrollTo(0, keepScroll ? y : 0);
  }

  // ---------- when was it saved: the time window ----------
  const locale = () => GS.bcp47(state.settings.lang); // dates are written the way the user's language writes them
  const dayWords = () => ({ today: t('date.today'), yesterday: t('date.yesterday') });
  const inWindow = (items) => D.filter(items, state.range);
  const filtered = () => !D.isAll(state.range);
  const rangeLabel = (choice = state.range) => (choice.preset === 'custom' ? D.rangeText(D.rangeOf(choice), locale()) : t('date.' + choice.preset));
  const setRange = (choice) => { state.range = choice; render(); };
  // a window that is the same as a quick choice gets that name ("Past week" instead of "10–16 Nov 2026")
  function asChoice(from, to) {
    const now = new Date();
    for (const id of D.PRESETS) {
      const r = D.presetRange(id, now);
      if (r && r.from === from && r.to === to) return { preset: id };
    }
    return { preset: 'custom', from, to };
  }

  // the quick buttons: All · Today · Yesterday · Past week · Past month · Past 3 months · 📅 Pick days
  // items = what is counted: every button shows how many are in it; a button with nothing in it is greyed out
  // kind = 'words' or 'sentences' (for the texts of the calendar)
  function rangeChips(items, kind) {
    const now = new Date();
    const chips = D.PRESETS.map((id) => {
      const n = D.filter(items, { preset: id }, now).length;
      const on = state.range.preset === id;
      return h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(on), 'data-range': id, disabled: !n && !on,
        onclick: () => setRange({ preset: id }),
      }, t('date.' + id), h('span', { class: 'chipn' }, n));
    });
    const custom = state.range.preset === 'custom';
    chips.push(h('button', {
      type: 'button', class: 'chip pick', 'aria-pressed': String(custom), 'data-range': 'custom', 'aria-haspopup': 'dialog',
      onclick: () => openCalendar(items, kind),
    }, custom ? '📅 ' + rangeLabel() : t('date.pick')));
    return h('div', { class: 'chips', role: 'group', 'aria-label': t('date.saved') }, chips);
  }

  // the box above a list: the quick buttons, and when a window is chosen: "12 of 85 words", Practise these, Show all
  function rangeBar(all, kind) {
    const shown = inWindow(all);
    return h('div', { class: 'rangebar' + (filtered() ? ' on' : '') },
      h('span', { class: 'lbl first' }, t('date.saved')),
      rangeChips(all, kind),
      filtered()
        ? h('div', { class: 'row rangeinfo' },
          h('span', { class: 'grow' }, tn('date.of_' + kind, { n: h('b', null, shown.length), total: all.length })),
          shown.length ? h('button', { class: 'btn small', type: 'button', 'data-act': 'practise', onclick: () => go('practice') }, t('date.practise')) : null,
          h('button', { class: 'btn ghost small', type: 'button', 'data-act': 'all', onclick: () => setRange({ preset: 'all' }) }, t('date.showAll')))
        : null);
  }

  // the list put under headings by day: "Today", "Yesterday", "Monday, 9 November" ...
  // drawItem draws one item; wrap puts the items of one day into a box (the words use a grid)
  function byDay(items, drawItem, wrap = (kids) => kids) {
    return D.groupByDay(items).map((g) => [
      h('h3', { class: 'dayhead' },
        g.day ? D.dayName(g.day, locale(), dayWords()) : t('date.earlier'),
        h('span', { class: 'dayn' }, g.items.length)),
      wrap(g.items.map(drawItem)),
    ]);
  }

  // the calendar: tap the first day, then the last day; the quick choices sit next to it
  // items: what is counted (dots under the days, "12 words" at the bottom)
  function openCalendar(items, kind) {
    const counts = D.countByDay(items);
    const today = D.ymd(new Date());
    const firstDay = D.firstDayOf(navigator.language || 'de-DE'); // where the week starts where the user lives
    const cur = D.rangeOf(state.range);
    let from = cur ? cur.from : null;
    let to = cur ? cur.to : null;
    let hover = null; // the day under the mouse while the last day is chosen: shows the window before the tap
    const shownDay = D.parse(to || today);
    let year = shownDay.getFullYear();
    let month = shownDay.getMonth();
    const count = (f, tt) => items.filter((i) => D.inRange(i.savedAt, { from: f, to: tt })).length;
    const unit = (n) => t(kind === 'words' ? 'cal.nWords' : 'cal.nSentences', { n });

    const dlg = h('dialog', { class: 'dlg caldlg', 'aria-label': t('cal.title') });
    const $month = h('span', { class: 'calmonth', 'aria-live': 'polite' });
    const $grid = h('div', { class: 'calgrid', role: 'grid' });
    const $hint = h('p', { class: 'calhint' });
    const $apply = h('button', { class: 'btn', type: 'button', id: 'calok', onclick: apply });
    const $prev = h('button', { class: 'iconbtn calnav', type: 'button', 'aria-label': t('cal.prev'), title: t('cal.prev'), onclick: () => moveMonth(-1) }, '‹');
    const $next = h('button', { class: 'iconbtn calnav', type: 'button', 'aria-label': t('cal.next'), title: t('cal.next'), onclick: () => moveMonth(1) }, '›');
    const quick = D.PRESETS.filter((id) => id !== 'all').map((id) =>
      h('button', {
        type: 'button', class: 'calq', 'data-q': id,
        onclick: () => {
          const r = D.presetRange(id);
          from = r.from; to = r.to; hover = null;
          const d = D.parse(to);
          year = d.getFullYear(); month = d.getMonth();
          drawMonth();
        },
      }, h('span', null, t('date.' + id)), h('span', { class: 'chipn' }, count(D.presetRange(id).from, D.presetRange(id).to))));

    function moveMonth(step) {
      month += step;
      if (month < 0) { month = 11; year -= 1; }
      if (month > 11) { month = 0; year += 1; }
      drawMonth();
    }
    function pickDay(day) {
      if (!from || to) { from = day; to = null; } // first tap (or start again)
      else if (day < from) { to = from; from = day; } // the second tap may be the earlier day
      else to = day;
      hover = null;
      paint();
    }
    // the days of the month on screen
    function drawMonth() {
      $month.textContent = D.monthTitle(year, month, locale());
      const thisMonth = new Date();
      $next.disabled = year > thisMonth.getFullYear() || (year === thisMonth.getFullYear() && month >= thisMonth.getMonth()); // no months in the future
      $grid.replaceChildren(...[
        h('div', { class: 'calrow calwd', role: 'row' }, D.weekdayNames(locale(), firstDay).map((n) => h('span', { role: 'columnheader' }, n))),
        D.monthGrid(year, month, firstDay).map((row) =>
          h('div', { class: 'calrow', role: 'row' }, row.map(({ day, inMonth }) => {
            const n = counts.get(day) || 0;
            const date = D.parse(day);
            return h('button', {
              type: 'button', role: 'gridcell', class: 'calday' + (inMonth ? '' : ' out') + (day === today ? ' today' : '') + (n ? ' has' : ''),
              'data-day': day, disabled: day > today,
              'aria-label': new Intl.DateTimeFormat(locale(), { dateStyle: 'full' }).format(date) + (n ? ' · ' + unit(n) : ''),
              title: n ? unit(n) : '',
              onclick: () => pickDay(day),
              onmouseenter: () => { if (from && !to) { hover = day; paint(); } },
            }, h('span', { class: 'dnum' }, date.getDate()), n ? h('span', { class: 'ddot', 'aria-hidden': 'true' }) : null);
          })))].flat());
      paint();
    }
    // colours of the chosen days and the texts under the calendar (without drawing the days again)
    function paint() {
      const end = to || (from && hover) || from;
      const lo = from && end && end < from ? end : from;
      const hi = from && end && end < from ? from : end;
      for (const b of $grid.querySelectorAll('.calday')) {
        const d = b.dataset.day;
        const inside = lo && d >= lo && d <= hi;
        b.classList.toggle('mid', !!inside && d !== lo && d !== hi);
        b.classList.toggle('start', !!lo && d === lo);
        b.classList.toggle('end', !!hi && d === hi);
        b.classList.toggle('maybe', !!inside && !to); // not chosen yet: only under the mouse
        b.setAttribute('aria-selected', String(!!inside));
      }
      for (const q of quick) {
        const r = D.presetRange(q.dataset.q);
        q.setAttribute('aria-pressed', String(!!to && r.from === from && r.to === to));
      }
      if (!from) $hint.replaceChildren(h('b', null, '1 '), t('cal.first'));
      else if (!to) $hint.replaceChildren(h('b', null, '2 '), t('cal.last'));
      else $hint.replaceChildren(h('span', { class: 'calsum' }, D.rangeText({ from, to }, locale())), ' · ', unit(count(from, to)));
      const n = from ? count(from, to || from) : 0;
      $apply.disabled = !from;
      $apply.textContent = from ? t(kind === 'words' ? 'cal.showWords' : 'cal.showSentences', { n }) : t('cal.choose');
    }
    function apply() {
      if (!from) return;
      dlg.close();
      setRange(asChoice(from, to || from)); // one tap only = that one day
    }

    dlg.append(
      h('div', { class: 'calhead' },
        h('h3', null, t('cal.title')),
        h('button', { class: 'iconbtn small', type: 'button', 'aria-label': t('common.close'), title: t('common.close'), onclick: () => dlg.close() }, '✕')),
      h('div', { class: 'calbody' },
        h('div', { class: 'calquick', role: 'group', 'aria-label': t('cal.quick') }, h('span', { class: 'lbl first' }, t('cal.quick')), quick),
        h('div', { class: 'calmain' },
          h('div', { class: 'calbar' }, $prev, $month, $next),
          $grid,
          h('p', { class: 'calkey muted' }, h('span', { class: 'ddot', 'aria-hidden': 'true' }), ' ', t(kind === 'words' ? 'cal.dotWords' : 'cal.dotSentences')))),
      // the end of the window stays in sight when the window is small (it sticks to the bottom)
      h('div', { class: 'calend' }, $hint,
      h('div', { class: 'row calfoot' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { from = null; to = null; hover = null; paint(); } }, t('cal.clear')),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn secondary', type: 'button', onclick: () => dlg.close() }, t('common.cancel')),
        $apply)));
    $grid.addEventListener('mouseleave', () => { if (hover) { hover = null; paint(); } });
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg);
    drawMonth();
    dlg.showModal();
    (dlg.querySelector('.calday.start') || dlg.querySelector('.calday.today') || $apply).focus();
  }

  // ---------- saved sentences ----------
  function emptyCard(title, ...kids) {
    return h('div', { class: 'card empty' }, h('div', { class: 'big-emoji', 'aria-hidden': 'true' }, '🌱'), h('h3', null, title), kids);
  }

  function viewSentences() {
    const box = h('div');
    const list = mySentences();
    if (!list.length) {
      box.append(
        h('h2', null, t('sent.title')),
        emptyCard(t('sent.emptyTitle'),
          h('ol', { class: 'steps' },
            h('li', null, t('sent.step1')),
            h('li', null, tn('sent.step2', { key: kbd('W') })),
            h('li', null, t('sent.step3'))),
          h('div', { class: 'row center' },
            h('a', { class: 'btn', href: 'https://www.youtube.com/', target: '_blank', rel: 'noopener' }, t('wz.youtube')),
            h('a', { class: 'btn secondary', href: 'welcome.html' }, t('help.intro')))),
        hiddenNote()
      );
      return box;
    }
    box.append(
      h('div', { class: 'bar' },
        h('h2', null, t('sent.title')),
        h('button', {
          class: 'btn secondary small', type: 'button',
          onclick: () => chooseDownload('sentences'),
        }, t('sent.download'))),
      h('p', { class: 'hint' }, t('sent.hint')),
      rangeBar(list, 'sentences')
    );
    const shown = inWindow(list);
    if (!shown.length) box.append(noneInWindow('sentences'));
    box.append(h('div', { class: 'days' }, byDay(shown, sentenceCard)), hiddenNote()); // h() unpacks the lists, append() would not
    return box;
  }

  function sentenceCard(s) {
    const line = h('p', { class: 'de', lang: learn(), dir: dirOf(learn()) },
      GS.tokens(s.text, learn()).map((tk) => {
        if (!tk.w) return tk.t;
        const p = tk.t;
        const isOpen = state.open && state.open.sid === s.id && GS.norm(state.open.word) === GS.norm(p);
        return h('button', {
          type: 'button',
          class: 'w' + (savedWord(p) ? ' saved' : '') + (isOpen ? ' open' : ''),
          title: t('sent.lookup'),
          'aria-expanded': String(!!isOpen),
          onclick: () => lookup(s, p),
        }, p);
      })
    );
    const card = h('div', { class: 'card sentence' },
      line,
      h('p', { class: 'tr', dir: dirOf(state.settings.lang), lang: state.settings.lang }, sentenceTranslation(s)),
      // hear it: the original sound from the video (when we know the video), or a computer voice
      h('div', { class: 'row hear' },
        Yt.clipOf(s) ? h('button', { class: 'btn small', type: 'button', 'data-hear': 'video', onclick: () => playOriginal(s) }, t('sent.original')) : null,
        h('button', { class: 'btn secondary small', type: 'button', 'data-hear': 'voice', title: t('audio.voiceTitle'), onclick: () => playVoice(s) }, t('sent.voice'))),
      h('div', { class: 'row meta' },
        h('span', { class: 'src grow' },
          s.videoTitle ? `${s.videoTitle} · ` : '',
          s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener' }, t('sent.watch', { time: fmtTime(s.time) })) : null),
        h('button', {
          class: 'btn ghost small', type: 'button',
          onclick: async () => {
            if (!confirm(t('sent.confirmDelete'))) return;
            await Store.removeSentence(s.id);
            if (state.open && state.open.sid === s.id) state.open = null;
            await reload();
            toast(t('sent.deleted'));
          },
        }, t('sent.delete')))
    );
    if (state.open && state.open.sid === s.id) card.append(wordPanel(s));
    return card;
  }

  function lookup(s, rawWord) {
    const word = rawWord.replace(/^[-'’]+|[-'’]+$/g, '');
    if (!word) return;
    if (state.open && state.open.sid === s.id && GS.norm(state.open.word) === GS.norm(word)) {
      state.open = null; // tapping the same word again closes it
      return render();
    }
    const mine = { sid: s.id, word, translation: '', difficulty: 2, loading: true, error: false };
    state.open = mine;
    render();
    translateWord(word)
      .then((tr) => { mine.translation = tr; mine.error = !tr; })
      .catch(() => { mine.error = true; })
      .finally(() => {
        mine.loading = false;
        if (state.open === mine) render();
      });
  }

  function wordPanel(s) {
    const o = state.open;
    const panel = h('div', { class: 'panel', role: 'region', 'aria-label': t('word.aria') });
    panel.append(h('div', { class: 'pw' }, tn('word.to', { word: h('b', { lang: learn(), dir: dirOf(learn()) }, o.word), lang: langLabel(state.settings.lang) })));
    if (o.loading) {
      panel.append(h('p', null, t('common.translating')));
    } else {
      if (o.error) {
        panel.classList.add('err');
        panel.append(h('p', null, t('word.failed')));
      }
      const input = h('input', {
        type: 'text', class: 'input', value: o.translation, 'aria-label': t('common.meaning'), placeholder: t('common.meaning'),
        dir: dirOf(state.settings.lang), lang: state.settings.lang,
        oninput: (e) => { o.translation = e.target.value; },
      });
      panel.append(input);
      panel.append(h('p', { class: 'lbl' }, t('common.howHard')));
      panel.append(seg(diffOptions(), o.difficulty, (d) => { o.difficulty = Number(d); render(); }, 'data-d'));
      panel.append(
        h('div', { class: 'row' },
          h('button', {
            class: 'btn', type: 'button',
            onclick: async () => {
              const meaning = (o.translation || '').trim();
              if (!meaning) { toast(t('word.typeFirst')); input.focus(); return; }
              const res = await Store.addWord({
                word: o.word, translation: meaning, lang: state.settings.lang, learn: learn(), difficulty: o.difficulty,
                sentenceDe: s.text, sentenceTr: sentenceTranslation(s), videoTitle: s.videoTitle || '', url: s.url || '',
              });
              state.open = null;
              await reload();
              toast(res.added ? t('word.saved') : t('word.dup'));
            },
          }, t('word.save')),
          h('button', { class: 'btn secondary', type: 'button', onclick: () => { state.open = null; render(); } }, t('common.cancel')))
      );
    }
    requestAnimationFrame(() => panel.scrollIntoView({ block: 'nearest' }));
    return panel;
  }

  // ---------- saved words ----------
  function viewWords() {
    const box = h('div');
    const list = myWords();
    if (!list.length) {
      box.append(
        h('h2', null, t('words.title')),
        emptyCard(t('words.emptyTitle'), h('p', null, t('words.emptyText')),
          h('div', { class: 'row center' }, h('button', { class: 'btn', type: 'button', onclick: () => go('sentences') }, t('prac.goSentences')))),
        hiddenNote()
      );
      return box;
    }
    box.append(
      h('div', { class: 'bar' },
        h('h2', null, t('words.title')),
        h('button', {
          class: 'btn secondary small', type: 'button',
          onclick: () => chooseDownload('words'),
        }, t('words.download'))),
      h('p', { class: 'hint' }, t('words.hint')),
      rangeBar(list, 'words')
    );
    const shown = inWindow(list);
    if (!shown.length) box.append(noneInWindow('words'));
    box.append(h('div', { class: 'days' }, byDay(shown, wordCard, (cards) => h('div', { class: 'wgrid' }, cards))), hiddenNote());
    return box;
  }

  // nothing was saved in the chosen days
  const noneInWindow = (kind) =>
    emptyCard(t('date.none_' + kind, { when: rangeLabel() }),
      h('div', { class: 'row center' }, h('button', { class: 'btn', type: 'button', onclick: () => setRange({ preset: 'all' }) }, t('date.showAll'))));

  // one saved word: the word, its meaning, how hard it is, right / wrong, delete
  function wordCard(w) {
    return h('div', { class: 'card wcard' },
      h('div', { class: 'wmain' },
        h('span', { class: 'wde', lang: learn(), dir: dirOf(learn()) }, w.word),
        h('button', { class: 'iconbtn small', type: 'button', title: t('audio.voiceTitle'), 'aria-label': t('audio.voiceTitle'), onclick: () => speak(w.word) }, '🔊')),
      h('div', { class: 'wtr', dir: dirOf(w.lang), lang: w.lang }, w.translation, w.lang !== state.settings.lang ? h('span', { class: 'lang-tag' }, langLabel(w.lang)) : null),
      seg(diffOptions(), w.difficulty, async (d) => {
        await Store.updateWord(w.id, { difficulty: Number(d) });
        await reload();
      }, 'data-d'),
      h('div', { class: 'row meta' },
        h('span', { class: 'stats grow' }, t('words.stats', { right: w.correct || 0, wrong: w.wrong || 0 })),
        h('button', {
          class: 'btn ghost small', type: 'button',
          onclick: async () => {
            if (!confirm(t('words.confirmDelete', { word: w.word }))) return;
            await Store.removeWord(w.id);
            await reload();
            toast(t('words.deleted'));
          },
        }, t('sent.delete'))));
  }

  // ---------- the computer voice ----------
  // opts.onend: called when the voice has finished
  function speak(text, opts) {
    const r = A.speak(text, learn(), { rate: 1, ...(opts || {}) });
    if (!r.ok) toast(r.reason === 'no-voice' ? t('audio.noVoice') : t('audio.noSpeech'));
    return r.ok;
  }
  // the computer voice reads a sentence; onEnd (optional): called when the sentence has been heard
  const voice = (s, onEnd) => {
    const ok = speak(s.text, onEnd ? { onend: onEnd } : undefined);
    if (!ok && onEnd) onEnd(); // no voice at all: do not keep anyone waiting
    return ok;
  };
  // ... and the little YouTube window is closed first, so the two never talk at once
  const playVoice = (s, onEnd) => { Yt.close(); return voice(s, onEnd); };

  // ---------- the original sound ----------
  // plays the sentence in the little YouTube player in the corner; if YouTube cannot play it, the computer voice reads it
  function playOriginal(s, onEnd) {
    const clip = Yt.clipOf(s);
    if (!clip) return playVoice(s, onEnd);
    A.stopSpeaking();
    // YouTube cannot play it: the little window stays open with the reason and a link to YouTube, the voice reads it
    Yt.play(clip, { onEnd, onError: () => { toast(t('yt.failed')); voice(s, onEnd); } });
    return true;
  }
  // the sound of a sentence in the games: the original, or the computer voice (chosen before the game)
  const playSentence = (s, onEnd) => (state.settings.game.sound !== 'voice' && Yt.clipOf(s) ? playOriginal(s, onEnd) : playVoice(s, onEnd));

  // ---------- games: which ones can be played now ----------
  // Word games use only the saved words. Sentence games use only the saved sentences: they are for the ears.
  const wordPool = () => GG.pool(state.words, state.settings.lang, learn());
  const sentencePool = () => GG.listenPool(state.sentences, learn());
  const buildable = () => sentencePool().filter((s) => GG.makeBuild(GS.tokens(s.text, learn()), () => 0.5) !== null);
  // the words of all saved sentences except one: the wrong answers of "Fill the gap"
  const otherWords = (except) => {
    const out = [];
    for (const s of sentencePool()) if (s.id !== except) for (const tk of GS.tokens(s.text, learn())) if (tk.w) out.push(tk.t);
    return out;
  };
  const gappable = () => sentencePool().filter((s) => GG.makeGap(GS.tokens(s.text, learn()), myWords(), otherWords(s.id), () => 0.5));
  // the words for "Find the pairs": never two that look the same (two identical cards would be confusing)
  const matchable = () => {
    const seenW = new Set(), seenT = new Set();
    return wordPool().filter((w) => {
      const a = GS.norm(w.word), b = GS.norm(w.translation);
      if (seenW.has(a) || seenT.has(b)) return false;
      seenW.add(a); seenT.add(b);
      return true;
    });
  };

  // every game: icon, what it practises (words or sentences), what it can use, the smallest amount it needs,
  // the choices for "how many" (steps, and at most max)
  const GAMES = [
    { id: 'cards', icon: '🃏', uses: 'words', items: () => wordPool(), min: 2, need: 'games.needWords2', steps: [5, 10, 20] },
    { id: 'match', icon: '🧠', uses: 'words', items: matchable, min: 3, need: 'games.needWords3', steps: [4, 6, 8], max: 10 },
    { id: 'listen', icon: '🎧', uses: 'sentences', items: () => sentencePool(), min: 1, need: 'games.needSentence', steps: [5, 10, 20] },
    { id: 'gap', icon: '✏️', uses: 'sentences', items: gappable, min: 1, need: 'games.needSentences2', steps: [5, 10, 20] },
    { id: 'build', icon: '🧩', uses: 'sentences', items: buildable, min: 1, need: 'games.needSentence', steps: [5, 10, 20] },
  ];
  const gameOf = (id) => GAMES.find((x) => x.id === id);
  const savedCount = (id) => (state.settings.game.counts || {})[id] || GS.DEFAULT_SETTINGS.game.counts[id];

  function viewPractice() {
    const box = h('div');
    const g = state.game;
    if (g) {
      const view = { cards: viewCards, match: viewMatch, gap: viewGap, build: viewBuild, listen: viewListen }[g.kind];
      box.append(gameTop(g.kind), g.finished ? viewFinished(g) : view(g));
      return box;
    }
    if (state.menu) return viewGameSetup(state.menu);
    box.append(h('h2', null, t('games.title')), h('p', { class: 'muted' }, t('games.intro')));
    if (filtered()) {
      box.append(h('div', { class: 'rangenote row' },
        h('span', { class: 'grow' }, tn('games.onlyWindow', { when: h('b', null, rangeLabel()) })),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => setRange({ preset: 'all' }) }, t('date.showAll'))));
    }
    // two groups: games with the words, and listening games with the sentences
    for (const [uses, title, text] of [['words', 'games.withWords', 'games.withWordsText'], ['sentences', 'games.withSentences', 'games.withSentencesText']]) {
      const grid = h('div', { class: 'ggrid' });
      for (const game of GAMES.filter((x) => x.uses === uses)) {
        const ok = game.items().length >= game.min;
        grid.append(
          h('button', { type: 'button', class: 'gcard', disabled: !ok, 'data-game': game.id, onclick: () => openSetup(game.id) },
            h('span', { class: 'gicon', 'aria-hidden': 'true' }, game.icon),
            h('span', { class: 'gname' }, t('games.' + game.id)),
            h('span', { class: 'gdesc' }, t('games.' + game.id + 'Desc')),
            ok ? h('span', { class: 'gplay' }, t('games.play')) : h('span', { class: 'gneed' }, t(game.need)))
        );
      }
      box.append(h('div', { class: 'ggroup' }, h('h3', null, t(title)), h('p', { class: 'muted' }, t(text)), grid));
    }
    if (!myWords().length && !mySentences().length) {
      box.append(h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => go('sentences') }, t('prac.goSentences'))));
    }
    return box;
  }

  // the bar above a running game: back to the list, the name of the game
  function gameTop(kind) {
    return h('div', { class: 'gametop' },
      h('button', { class: 'btn ghost small', type: 'button', onclick: stopGame }, t('games.back')),
      h('span', { class: 'gtitle' }, gameOf(kind).icon + ' ' + t('games.' + kind)));
  }
  function stopGame() {
    state.game = null;
    state.menu = null;
    A.stopSpeaking();
    Yt.close();
    render(false);
  }
  // the "how many" screen of a game (also after "Play again": the finished game is put away)
  function openSetup(id) {
    state.game = null;
    state.menu = id;
    A.stopSpeaking();
    Yt.close();
    render(false);
  }

  // ---------- before every game: how many, and the other choices of that game ----------
  const saveGame = async (patch) => { state.settings = await Store.setSettings({ game: patch }); render(); };
  function viewGameSetup(id) {
    const game = gameOf(id);
    const lang = state.settings.lang;
    const available = inWindow(game.items()).length; // only what was saved in the chosen days
    const enough = available >= game.min;
    const choices = GG.countChoices(available, game.steps, game.max);
    const chosen = GG.countChoice(choices, savedCount(id));
    const intro = { cards: 'prac.intro', match: 'setup.matchIntro', listen: 'listen.intro', gap: 'setup.gapIntro', build: 'setup.buildIntro' }[id];
    const card = h('div', { class: 'card setup' },
      h('p', { class: 'lead' }, t(intro, { n: available })),
      // which ones: by the day they were saved (Past week, Yesterday, the calendar ...)
      h('div', { class: 'field' },
        h('span', { class: 'lbl' }, t(game.uses === 'words' ? 'setup.whichWords' : 'setup.whichSentences')),
        rangeChips(game.items(), game.uses)),
      enough
        ? h('div', { class: 'field' },
          h('span', { class: 'lbl' }, t(game.uses === 'words' ? 'setup.howManyWords' : 'setup.howManySentences')),
          seg(choices.map((n) => [n, n === available && choices.length > 1 ? t('setup.all', { n }) : String(n)]), chosen,
            (v) => saveGame({ counts: { [id]: Number(v) } }), 'data-n'))
        : h('p', { class: 'panel err', id: 'toofew' }, t(game.uses === 'words' ? 'setup.tooFewWords' : 'setup.tooFewSentences', { n: available, min: game.min })));
    if (id === 'cards') {
      card.append(h('div', { class: 'field' }, h('span', { class: 'lbl' }, t('prac.see')),
        seg([
          ['mixed', t('prac.both')],
          ['de2tr', t('prac.de2tr', { lang: langLabel(lang) })],
          ['tr2de', t('prac.tr2de', { lang: langLabel(lang) })],
        ], state.settings.game.direction, (v) => saveGame({ direction: v }))));
    }
    if (game.uses === 'sentences') {
      card.append(h('div', { class: 'field' }, h('span', { class: 'lbl' }, t('games.sound')),
        seg([['video', t('games.soundVideo')], ['voice', t('games.soundVoice')]], state.settings.game.sound === 'voice' ? 'voice' : 'video',
          (v) => saveGame({ sound: v }), 'data-snd')));
    }
    card.append(h('div', { class: 'row' },
      h('button', { class: 'btn big', type: 'button', id: 'start', disabled: !enough, onclick: () => startGame(id, chosen) }, t('prac.start')),
      h('span', { class: 'muted' }, t('prac.enter'))));
    return h('div', null, gameTop(id), card);
  }

  // start a game with `count` words / sentences (each one is practised once)
  function startGame(kind, count) {
    const game = gameOf(kind);
    state.menu = null;
    const pool = inWindow(game.items()); // only what was saved in the chosen days
    const n = count || GG.countChoice(GG.countChoices(pool.length, game.steps, game.max), savedCount(kind));
    const items = game.uses === 'words' ? GG.pickWords(pool, n) : GG.pickSentences(pool, n);
    // asked = how many rounds have begun; results = id -> right (true) or not (false)
    state.game = { kind, items, total: items.length, asked: 0, score: 0, results: new Map(), cur: null, finished: false };
    if (kind === 'match') {
      const cards = GG.makeMatch(items, items.length);
      Object.assign(state.game, { cards, total: cards.length / 2, up: [], found: new Set(), missed: new Set(), moves: 0, lock: false });
      return render(false);
    }
    nextRound();
  }

  function nextRound() {
    const g = state.game;
    if (!g) return;
    if (g.asked >= g.total) return finishGame(g);
    const item = g.items[g.asked];
    g.asked += 1;
    if (g.kind === 'cards') {
      g.cur = { word: item, q: GG.makeQuestion(wordPool(), item, state.settings.game.direction), answered: null };
    } else if (g.kind === 'listen') {
      g.cur = { s: item, shown: false, rated: false };
      render(false);
      playSentence(item); // still inside the click that started this, so the browser allows the sound
      return;
    } else if (g.kind === 'gap') {
      const tokens = GS.tokens(item.text, learn());
      g.cur = { s: item, tokens, q: GG.makeGap(tokens, myWords(), otherWords(item.id)), answered: null, heard: false };
      render(false);
      hearGap(); // first the ears: the answers come when the sentence has been heard
      return;
    } else if (g.kind === 'build') {
      const puzzle = GG.makeBuild(GS.tokens(item.text, learn()), Math.random, 10, noSpaces() ? '' : ' ');
      g.cur = { s: item, puzzle, picked: [], checked: null, helped: false };
      render(false);
      playSentence(item); // hear it first, then build it
      return;
    }
    render(false);
  }

  function finishGame(g) {
    g.finished = true;
    A.stopSpeaking();
    Yt.close();
    render(false);
  }

  // progress: "Question 3 of 10" and a bar
  function progress(g, label) {
    const done = g.asked - 1;
    return [
      h('p', { class: 'qlabel' }, label),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(g.total), 'aria-valuenow': String(done) },
        h('div', { style: `width:${(done / g.total) * 100}%` })),
    ];
  }

  // ---------- the end of every game: the score, then the list of what was practised ----------
  function viewFinished(g) {
    const ratio = g.total ? g.score / g.total : 0;
    const extra = g.kind === 'match' ? t('match.moves', { n: g.moves }) : g.kind === 'listen' ? t('listen.result', { got: g.score, total: g.total }) : '';
    return h('div', null,
      h('div', { class: 'card center finish' },
        h('div', { class: 'big-emoji', 'aria-hidden': 'true' }, ratio >= 0.8 ? '🏆' : ratio >= 0.5 ? '🌟' : '💪'),
        h('p', { class: 'qlabel' }, t('prac.finished')),
        h('div', { class: 'score', dir: 'ltr' }, `${g.score} / ${g.total}`),
        extra ? h('p', null, extra) : null,
        h('p', null, ratio >= 0.8 ? t('prac.great') : ratio >= 0.5 ? t('prac.good') : t('prac.keep')),
        h('div', { class: 'row center' },
          h('button', { class: 'btn big', type: 'button', onclick: () => openSetup(g.kind) }, t('prac.again')),
          h('button', { class: 'btn secondary', type: 'button', onclick: stopGame }, t('games.back')))),
      reviewList(g));
  }

  // the words or sentences of this game, each with its result, to change right away
  function reviewList(g) {
    const isWords = gameOf(g.kind).uses === 'words';
    const card = h('div', { class: 'card review' },
      h('h3', null, t(isWords ? 'review.titleWords' : 'review.titleSentences', { n: g.items.length })),
      h('p', { class: 'muted' }, t(isWords ? 'review.textWords' : 'review.textSentences')));
    const list = h('div', { class: 'rvlist' });
    for (const item of g.items) {
      // the newest version from the storage (it may have been changed a moment ago)
      const cur = (isWords ? state.words : state.sentences).find((x) => x.id === item.id);
      if (!cur) continue; // deleted
      list.append(isWords ? reviewWord(g, cur) : reviewSentence(g, cur));
    }
    if (!list.children.length) list.append(h('p', { class: 'muted' }, t('review.empty')));
    card.append(list);
    return card;
  }
  // ✓ or ✗: how it went in this game
  function badge(g, id) {
    if (!g.results.has(id)) return h('span', { class: 'rvbadge' });
    const ok = g.results.get(id);
    return h('span', { class: 'rvbadge ' + (ok ? 'good' : 'bad'), title: t(ok ? 'review.right' : 'review.wrong'), 'aria-label': t(ok ? 'review.right' : 'review.wrong') }, ok ? '✓' : '✗');
  }
  const delBtn = (onclick) => h('button', { class: 'btn ghost small', type: 'button', onclick }, t('sent.delete'));

  function reviewWord(g, w) {
    return h('div', { class: 'rv', 'data-id': w.id },
      badge(g, w.id),
      h('div', { class: 'rvmain' },
        h('div', { class: 'rvhead' },
          h('b', { class: 'rvword', lang: learn(), dir: dirOf(learn()) }, w.word),
          h('button', { class: 'iconbtn small', type: 'button', 'aria-label': t('audio.voiceTitle'), title: t('audio.voiceTitle'), onclick: () => speak(w.word) }, '🔊')),
        h('input', {
          type: 'text', class: 'input small', value: w.translation, 'aria-label': t('common.meaning'), dir: dirOf(w.lang), lang: w.lang,
          // a changed meaning is saved when you leave the field (or press Enter)
          onchange: async (e) => {
            const v = e.target.value.trim();
            if (!v) { e.target.value = w.translation; return toast(t('word.typeFirst')); }
            if (v === w.translation) return;
            await Store.updateWord(w.id, { translation: v });
            state.words = await Store.listWords();
            toast(t('review.saved'));
          },
          onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
        }),
        seg(diffOptions(), w.difficulty, async (d) => {
          await Store.updateWord(w.id, { difficulty: Number(d) });
          state.words = await Store.listWords();
          render();
        }, 'data-d')),
      delBtn(async () => {
        if (!confirm(t('words.confirmDelete', { word: w.word }))) return;
        await Store.removeWord(w.id);
        state.words = await Store.listWords();
        render();
        toast(t('words.deleted'));
      }));
  }

  function reviewSentence(g, s) {
    return h('div', { class: 'rv', 'data-id': s.id },
      badge(g, s.id),
      h('div', { class: 'rvmain' },
        h('p', { class: 'rvsent', lang: learn(), dir: dirOf(learn()) }, s.text),
        h('p', { class: 'tr small', lang: state.settings.lang, dir: dirOf(state.settings.lang) }, sentenceTranslation(s)),
        h('div', { class: 'row hear' },
          Yt.clipOf(s) ? h('button', { class: 'btn small', type: 'button', onclick: () => playOriginal(s) }, t('sent.original')) : null,
          h('button', { class: 'btn secondary small', type: 'button', onclick: () => playVoice(s) }, t('sent.voice'))),
        h('span', { class: 'lbl' }, t('review.hardToHear')),
        seg(diffOptions(), s.difficulty || 0, async (d) => {
          await Store.updateSentence(s.id, { difficulty: Number(d) });
          state.sentences = await Store.listSentences();
          render();
        }, 'data-d')),
      delBtn(async () => {
        if (!confirm(t('sent.confirmDelete'))) return;
        await Store.removeSentence(s.id);
        state.sentences = await Store.listSentences();
        render();
        toast(t('sent.deleted'));
      }));
  }

  // "Next" after an answer (or "See my score" after the last one)
  const nextBtn = (g) =>
    h('div', { class: 'row' },
      h('button', { class: 'btn big', type: 'button', id: 'next', onclick: nextRound }, g.asked >= g.total ? t('prac.score') : t('prac.next')),
      h('span', { class: 'muted' }, t('prac.enter')));

  const scrollTo = (el) => requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));

  // ---------- game 1: word cards (choose the meaning) ----------
  function viewCards(g) {
    const lang = state.settings.lang;
    const { q, answered } = g.cur;
    const word = state.words.find((w) => w.id === g.cur.word.id) || g.cur.word;
    const done = answered !== null;
    const promptDir = q.dir === 'de2tr' ? dirOf(learn()) : dirOf(lang);
    const optDir = q.dir === 'de2tr' ? dirOf(lang) : dirOf(learn());
    const box = h('div');
    box.append(
      h('div', { class: 'card' },
        progress(g, t('prac.q', { n: g.asked, total: g.total })),
        h('p', { class: 'qlabel' }, q.dir === 'de2tr' ? t('prac.askDe', { lang: langLabel(lang) }) : t('prac.askTr')),
        h('div', { class: 'prompt', dir: promptDir, lang: q.dir === 'de2tr' ? learn() : lang }, q.prompt,
          q.dir === 'de2tr' ? h('button', { class: 'iconbtn small', type: 'button', 'aria-label': t('audio.voiceTitle'), onclick: () => speak(q.prompt) }, '🔊') : null),
        h('div', { class: 'opts' },
          q.options.map((opt, i) =>
            h('button', {
              type: 'button',
              class: 'opt' + (done ? (i === q.correctIndex ? ' right' : i === answered ? ' wrong' : '') : ''),
              disabled: done, dir: optDir, lang: q.dir === 'de2tr' ? lang : learn(),
              onclick: () => answerCards(i),
            }, h('span', { class: 'k' }, `${i + 1}`), opt))))
    );
    if (done) {
      const ok = answered === q.correctIndex;
      const fb = h('div', { class: 'card' },
        h('div', { class: 'verdict ' + (ok ? 'good' : 'bad') }, ok ? t('prac.correct') : t('prac.wrong')),
        ok ? null : h('p', null, tn('prac.answerIs', { answer: h('b', null, q.correct) })),
        h('p', { class: 'muted' }, h('b', { lang: learn(), dir: dirOf(learn()) }, word.word), ' = ', h('span', { dir: dirOf(word.lang) }, word.translation)));
      if (word.sentenceDe) {
        const ex = h('div', { class: 'example', lang: learn(), dir: dirOf(learn()) });
        const idx = word.sentenceDe.toLowerCase().indexOf(word.word.toLowerCase());
        if (idx >= 0) ex.append(word.sentenceDe.slice(0, idx), h('mark', null, word.sentenceDe.slice(idx, idx + word.word.length)), word.sentenceDe.slice(idx + word.word.length));
        else ex.append(word.sentenceDe);
        fb.append(ex);
      }
      fb.append(
        h('p', { class: 'lbl' }, t('prac.howHardWord')),
        seg(diffOptions(), word.difficulty, async (d) => {
          await Store.updateWord(word.id, { difficulty: Number(d) });
          state.words = await Store.listWords();
          render();
        }, 'data-d'),
        nextBtn(g));
      box.append(fb);
      scrollTo(fb); // on small screens the feedback is below the visible area: bring it into view
    } else {
      box.append(h('p', { class: 'muted' }, t('prac.tip')));
    }
    return box;
  }

  async function answerCards(i) {
    const g = state.game;
    if (!g || g.kind !== 'cards' || g.finished || !g.cur || g.cur.answered !== null) return;
    g.cur.answered = i;
    const ok = i === g.cur.q.correctIndex;
    if (ok) g.score += 1;
    g.results.set(g.cur.word.id, ok);
    render();
    const w = state.words.find((x) => x.id === g.cur.word.id);
    if (w) {
      await Store.updateWord(w.id, ok ? { correct: (w.correct || 0) + 1 } : { wrong: (w.wrong || 0) + 1 });
      state.words = await Store.listWords();
    }
  }

  // ---------- game 2: find the pairs (memory) ----------
  function viewMatch(g) {
    const box = h('div');
    box.append(h('p', { class: 'muted' }, t('match.how')), h('p', { class: 'qlabel' }, t('match.status', { found: g.found.size, total: g.total, moves: g.moves })));
    const grid = h('div', { class: 'mgrid' });
    for (const c of g.cards) {
      const faceUp = g.up.includes(c.key) || g.found.has(c.pair);
      const isLearn = c.side === 'w';
      grid.append(
        h('button', {
          type: 'button',
          class: 'mcard' + (faceUp ? ' up' : '') + (g.found.has(c.pair) ? ' found' : '') + (isLearn ? ' learn' : ''),
          disabled: g.found.has(c.pair),
          'aria-label': faceUp ? c.text : t('match.hidden'),
          onclick: () => flip(c),
        }, faceUp ? h('span', { lang: isLearn ? learn() : state.settings.lang, dir: dirOf(isLearn ? learn() : state.settings.lang) }, c.text) : h('span', { class: 'back', 'aria-hidden': 'true' }, '?'))
      );
    }
    box.append(grid);
    return box;
  }

  function flip(c) {
    const g = state.game;
    if (!g || g.kind !== 'match' || g.finished || g.lock || g.found.has(c.pair) || g.up.includes(c.key)) return;
    g.up.push(c.key);
    if (c.side === 'w') speak(c.text); // hear the word when its card turns over
    if (g.up.length === 2) {
      g.moves += 1;
      const [a, b] = g.up.map((k) => g.cards.find((x) => x.key === k));
      if (a.pair === b.pair) {
        g.found.add(a.pair);
        g.up = [];
        if (g.found.size === g.total) {
          // every pair found. A word whose card was part of a wrong try is "to practise more"
          for (const id of g.found) {
            const ok = !g.missed.has(id);
            g.results.set(id, ok);
            if (ok) g.score += 1;
            const w = state.words.find((x) => x.id === id);
            if (w) Store.updateWord(w.id, ok ? { correct: (w.correct || 0) + 1 } : { wrong: (w.wrong || 0) + 1 });
          }
          finishGame(g);
          return;
        }
      } else {
        // not a pair: both words are marked, shown for a moment, then turned back
        g.missed.add(a.pair);
        g.missed.add(b.pair);
        g.lock = true;
        setTimeout(() => {
          if (state.game !== g) return;
          g.up = [];
          g.lock = false;
          render();
        }, 1100);
      }
    }
    render();
  }

  // ---------- game 3: fill the gap (hear it first) ----------
  // play the sentence; the answers can be chosen when it has been heard (or after "I heard it")
  function hearGap() {
    const g = state.game;
    if (!g || g.kind !== 'gap' || !g.cur) return;
    const cur = g.cur;
    cur.playing = true;
    render();
    const done = () => {
      if (state.game !== g || g.cur !== cur || !cur.playing) return;
      cur.playing = false;
      cur.heard = true;
      render();
    };
    playSentence(cur.s, done);
    // a safety net: if the sound never says that it has ended, the answers still come
    const clip = Yt.clipOf(cur.s);
    const secs = clip ? clip.to - clip.from : [...cur.s.text].length * 0.08;
    setTimeout(done, (secs + 4) * 1000);
  }
  function heardGap() {
    const c = state.game && state.game.cur;
    if (!c || c.heard) return;
    c.playing = false;
    c.heard = true;
    render();
  }

  function viewGap(g) {
    const { s, tokens, q, answered, heard, playing } = g.cur;
    const done = answered !== null;
    const line = h('p', { class: 'de', lang: learn(), dir: dirOf(learn()) },
      tokens.map((tk, i) => (i === q.gap ? h('span', { class: 'gap' + (done ? ' filled' : '') }, done ? tk.t : ' '.repeat(Math.max(4, [...tk.t].length))) : tk.t)));
    const listenRow = h('div', { class: 'row hearrow' },
      h('button', { class: 'btn' + (heard ? ' secondary' : '') + ' small', type: 'button', id: 'hear', onclick: hearGap }, playing ? t('gap.listening') : t('listen.replay')),
      heard || done ? null : h('button', { class: 'btn ghost small', type: 'button', id: 'heard', onclick: heardGap }, t('gap.heard')));
    const box = h('div');
    box.append(
      h('div', { class: 'card' },
        progress(g, t('prac.q', { n: g.asked, total: g.total })),
        h('p', { class: 'qlabel' }, heard ? t('gap.ask') : t('gap.listenFirst')),
        line,
        listenRow,
        // the translation is a help for afterwards: before, the ears should do the work
        done ? h('p', { class: 'tr', lang: state.settings.lang, dir: dirOf(state.settings.lang) }, sentenceTranslation(s)) : null,
        heard
          ? h('div', { class: 'opts two' },
            q.options.map((opt, i) =>
              h('button', {
                type: 'button', lang: learn(), dir: dirOf(learn()),
                class: 'opt' + (done ? (i === q.correctIndex ? ' right' : i === answered ? ' wrong' : '') : ''),
                disabled: done, onclick: () => answerGap(i),
              }, h('span', { class: 'k' }, `${i + 1}`), opt)))
          : null)
    );
    if (done) {
      const ok = answered === q.correctIndex;
      const fb = h('div', { class: 'card' },
        h('div', { class: 'verdict ' + (ok ? 'good' : 'bad') }, ok ? t('prac.correct') : t('prac.wrong')),
        nextBtn(g));
      box.append(fb);
      scrollTo(fb);
    } else {
      box.append(h('p', { class: 'muted' }, heard ? t('prac.tip') : t('gap.tip')));
    }
    return box;
  }

  function answerGap(i) {
    const g = state.game;
    if (!g || g.kind !== 'gap' || !g.cur.heard || g.cur.answered !== null) return;
    g.cur.answered = i;
    const ok = i === g.cur.q.correctIndex;
    if (ok) g.score += 1;
    g.results.set(g.cur.s.id, ok);
    render();
  }

  // ---------- game 4: put the words in order ----------
  function viewBuild(g) {
    const { s, puzzle, picked, checked } = g.cur;
    const tileOf = (id) => puzzle.answer[id];
    const box = h('div');
    const answerRow = h('div', { class: 'tiles answer' + (checked === true ? ' right' : checked === false ? ' wrong' : ''), lang: learn(), dir: dirOf(learn()) },
      picked.length
        ? picked.map((id, k) => h('button', { type: 'button', class: 'tile', disabled: checked === true, onclick: () => unpick(k) }, tileOf(id).text))
        : h('span', { class: 'placeholder' }, t('build.empty')));
    const left = puzzle.tiles.filter((x) => !picked.includes(x.id));
    box.append(
      h('div', { class: 'card' },
        progress(g, t('prac.q', { n: g.asked, total: g.total })),
        h('p', { class: 'qlabel' }, t('build.ask')),
        h('p', { class: 'tr', lang: state.settings.lang, dir: dirOf(state.settings.lang) }, sentenceTranslation(s)),
        answerRow,
        h('div', { class: 'tiles pool', lang: learn(), dir: dirOf(learn()) },
          left.map((x) => h('button', { type: 'button', class: 'tile', onclick: () => pick(x.id) }, x.text))),
        checked === true
          ? null
          : h('div', { class: 'row' },
            h('button', { class: 'btn secondary small', type: 'button', onclick: () => playSentence(s) }, t('build.listen')),
            h('button', { class: 'btn secondary small', type: 'button', onclick: hintBuild }, t('build.hint')),
            picked.length ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => { g.cur.picked = []; g.cur.checked = null; render(); } }, t('build.clear')) : null))
    );
    if (checked === false) box.append(h('p', { class: 'verdict bad' }, t('build.notYet')));
    if (checked === true) {
      const fb = h('div', { class: 'card' },
        h('div', { class: 'verdict good' }, t('prac.correct')),
        nextBtn(g));
      box.append(fb);
      scrollTo(fb);
    } else {
      box.append(h('p', { class: 'muted' }, t('build.tip')));
    }
    return box;
  }

  function pick(id) {
    const c = state.game && state.game.cur;
    if (!c || c.checked === true) return;
    c.picked.push(id);
    c.checked = null;
    if (c.picked.length === c.puzzle.answer.length) checkBuild();
    render();
  }
  function unpick(k) {
    const c = state.game && state.game.cur;
    if (!c || c.checked === true) return;
    c.picked.splice(k, 1);
    c.checked = null;
    render();
  }
  // all tiles placed: is the order right?
  function checkBuild() {
    const g = state.game;
    const c = g.cur;
    c.checked = GG.buildIsRight(c.puzzle, c.picked);
    if (c.checked) {
      const ok = !c.helped; // with a hint it does not count
      if (ok) g.score += 1;
      g.results.set(c.s.id, ok);
      playSentence(c.s);
    }
  }
  // a hint: keep the right beginning, then put the next right tile in its place
  function hintBuild() {
    const c = state.game && state.game.cur;
    if (!c || c.checked === true) return;
    c.helped = true;
    const answer = c.puzzle.answer;
    let k = 0;
    while (k < c.picked.length && GS.norm(answer[c.picked[k]].text) === GS.norm(answer[k].text)) k++;
    c.picked = c.picked.slice(0, k);
    // the next right tile (any tile with the same text works)
    const free = c.puzzle.tiles.filter((x) => !c.picked.includes(x.id));
    const next = free.find((x) => GS.norm(x.text) === GS.norm(answer[k].text));
    if (next) c.picked.push(next.id);
    c.checked = null;
    if (c.picked.length === answer.length) checkBuild();
    render();
  }

  // ---------- game 5: listening ----------
  function viewListen(g) {
    const { s, shown } = g.cur;
    const box = h('div');
    box.append(
      h('div', { class: 'card center' },
        progress(g, t('listen.q', { n: g.asked, total: g.total })),
        h('p', { class: 'qlabel' }, t('listen.question')),
        h('div', { class: 'row center' },
          h('button', { class: 'btn big round', type: 'button', id: 'hear', onclick: () => playSentence(s) }, t('listen.play'))))
    );
    if (!shown) {
      box.append(
        h('div', { class: 'row center' },
          h('button', { class: 'btn big secondary', type: 'button', id: 'show', onclick: showListen }, t('listen.show'))),
        h('p', { class: 'muted center' }, t('listen.tip'))
      );
    } else {
      const fb = h('div', { class: 'card' },
        h('p', { class: 'de', lang: learn(), dir: dirOf(learn()) }, s.text),
        h('p', { class: 'tr', lang: state.settings.lang, dir: dirOf(state.settings.lang) }, sentenceTranslation(s)),
        h('div', { class: 'row' },
          h('button', { class: 'btn big', type: 'button', id: 'got', onclick: () => rateListen(true) }, t('listen.got')),
          h('button', { class: 'btn big secondary', type: 'button', id: 'miss', onclick: () => rateListen(false) }, t('listen.miss'))));
      box.append(fb);
      scrollTo(fb);
    }
    return box;
  }

  function showListen() {
    const g = state.game;
    if (!g || g.kind !== 'listen' || g.cur.shown) return;
    g.cur.shown = true;
    render();
  }
  async function rateListen(ok) {
    const g = state.game;
    if (!g || g.kind !== 'listen' || !g.cur.shown || g.cur.rated) return;
    g.cur.rated = true;
    const s = g.cur.s;
    if (ok) g.score += 1;
    g.results.set(s.id, ok);
    // store the rating, so the next game picks the missed ones more often
    await Store.updateSentence(s.id, ok ? { got: (s.got || 0) + 1 } : { missed: (s.missed || 0) + 1 });
    state.sentences = await Store.listSentences();
    if (state.game !== g) return; // the game was stopped meanwhile
    nextRound();
  }

  // ---------- keys inside the games ----------
  document.addEventListener('keydown', (e) => {
    if (state.tab !== 'practice' || e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target;
    if (tg && (tg.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tg.tagName))) return; // typing
    if (e.key === 'Enter' && tg && ['BUTTON', 'A'].includes(tg.tagName)) return; // Enter on a button already presses that button
    const k = e.key.toLowerCase();
    const take = (fn) => { e.preventDefault(); fn(); };
    // the start screen of a game: Enter starts it
    if (!state.game && state.menu) { if (k === 'enter') take(() => document.getElementById('start').click()); return; }
    const g = state.game;
    if (!g || g.finished) return;
    const num = /^[1-4]$/.test(k) ? Number(k) - 1 : -1;
    const c = g.cur;
    if (g.kind === 'cards') {
      if (c.answered === null && num >= 0 && num < c.q.options.length) take(() => answerCards(num));
      else if (c.answered !== null && k === 'enter') take(nextRound);
    } else if (g.kind === 'gap') {
      if (k === 'r') take(hearGap);
      else if (!c.heard && k === 'enter') take(heardGap);
      else if (c.heard && c.answered === null && num >= 0 && num < c.q.options.length) take(() => answerGap(num));
      else if (c.answered !== null && k === 'enter') take(nextRound);
    } else if (g.kind === 'build') {
      if (c.checked === true && k === 'enter') take(nextRound);
      else if (k === 'r') take(() => playSentence(c.s));
      else if (k === 'backspace' && c.picked.length) take(() => unpick(c.picked.length - 1));
    } else if (g.kind === 'listen') {
      if (k === 'enter' && !c.shown) take(showListen);
      else if (k === 'r') take(() => playSentence(c.s));
      else if (c.shown && k === '1') take(() => rateListen(true));
      else if (c.shown && k === '2') take(() => rateListen(false));
    }
  });

  // the language being learned changed: everything on this page is about the other language now
  async function afterLearnChange() {
    state.game = null;
    state.menu = null;
    state.open = null;
    A.stopSpeaking();
    Yt.close();
    applyLangChrome();
    renderTabs();
    render(false);
  }

  // ---------- settings ----------
  const SWATCHES = [
    ['#ffffff', 'white'], ['#ffd54f', 'yellow'], ['#9ae6b4', 'green'],
    ['#7dd3fc', 'blue'], ['#fda4af', 'pink'], ['#fdba74', 'orange'],
  ];

  function viewSettings() {
    const box = h('div');
    const s = state.settings;
    box.append(h('h2', null, t('set.title')));

    // ---- languages ----
    const learnSel = h('select', {
      id: 'learn', 'aria-label': t('set.learnAria'),
      onchange: async (e) => {
        state.settings = await Store.setSettings({ learn: e.target.value });
        await afterLearnChange();
        toast(t('set.learnNow'));
      },
    }, Ui.langOptions(s.learn, s.lang));
    const langSel = h('select', {
      id: 'lang', 'aria-label': t('set.langAria'),
      onchange: async (e) => {
        state.settings = await Store.setSettings({ lang: e.target.value });
        await applyLang();
        toast(t('set.langNow', { lang: langLabel(state.settings.lang) }));
      },
    }, Ui.langOptions(s.lang, s.learn));
    box.append(
      h('div', { class: 'card' },
        h('h3', null, t('set.learnTitle')),
        h('p', { class: 'muted' }, t('set.learnText')),
        h('div', { class: 'field' }, learnSel),
        h('h3', null, t('set.langTitle')),
        h('p', { class: 'muted' }, t('set.langText')),
        h('div', { class: 'field' }, langSel))
    );

    // ---- colours of the pages + size of the text ----
    const uiVal = h('span', { class: 'val', dir: 'ltr' }, `${Math.round((s.uiScale || 1) * 100)}%`);
    const nudgeUi = async (delta) => {
      const cur = state.settings.uiScale || 1;
      const next = Math.round(Math.min(1.6, Math.max(0.9, cur + delta)) * 10) / 10;
      state.settings = await Store.setSettings({ uiScale: next });
      Ui.applyTheme(state.settings);
      uiVal.textContent = `${Math.round(next * 100)}%`;
    };
    box.append(
      h('div', { class: 'card' },
        h('h3', null, t('set.palTitle')),
        h('p', { class: 'muted' }, t('set.palText')),
        Ui.paletteChooser(s.palette, async (id) => {
          state.settings = await Store.setSettings({ palette: id });
          Ui.applyTheme(state.settings);
          render();
        }, t),
        h('h3', { class: 'spaced' }, t('set.uiTitle')),
        h('div', { class: 'sizer' },
          h('button', { type: 'button', 'aria-label': t('common.smaller'), onclick: () => nudgeUi(-0.1) }, '−'),
          uiVal,
          h('button', { type: 'button', 'aria-label': t('common.bigger'), onclick: () => nudgeUi(0.1) }, '+')))
    );

    // ---- the text on the video ----
    // the preview: one long example sentence, cut with the chosen sentence length,
    // in caption boxes that look like the ones on the video (same colours and sizes)
    const preview = h('div', { class: 'preview', 'aria-label': t('set.previewAria') });
    const lenNote = h('p', { class: 'muted' });
    function refreshPreview() {
      const plates = Ui.lengthPlates(state.settings, refreshPreview); // calls us again when a translation arrives
      preview.replaceChildren(...plates);
      lenNote.textContent = t('set.lenDemo', { n: plates.length });
    }

    const refreshers = [];
    function styleControl(key, title) {
      const sizeVal = h('span', { class: 'val', dir: 'ltr' });
      const nudge = async (delta) => {
        const cur = Number(state.settings[key].size) || 100;
        const size = Math.min(250, Math.max(60, cur + delta));
        state.settings = await Store.setSettings({ [key]: { size } });
        refreshAll();
      };
      const setColor = async (color) => {
        state.settings = await Store.setSettings({ [key]: { color } });
        refreshAll();
      };
      const swatches = SWATCHES.map(([c, name]) =>
        h('button', { type: 'button', class: 'sw', style: `background:${c}`, 'aria-label': t('color.' + name), title: t('color.' + name), 'data-c': c, onclick: () => setColor(c) }));
      const custom = h('input', {
        type: 'color', 'aria-label': `${title} — ${t('set.customColour')}`,
        oninput: (e) => { state.settings[key].color = e.target.value; refreshPreview(); },
        onchange: (e) => setColor(e.target.value),
      });
      const refresh = () => {
        const cur = state.settings[key];
        sizeVal.textContent = `${cur.size}%`;
        for (const b of swatches) b.setAttribute('aria-pressed', String(b.dataset.c.toLowerCase() === String(cur.color).toLowerCase()));
        custom.value = /^#[0-9a-f]{6}$/i.test(cur.color) ? cur.color : '#ffffff';
      };
      refreshers.push(refresh);
      return h('div', { class: 'stylebox', 'data-key': key },
        h('h4', null, title),
        h('div', { class: 'row' },
          h('div', { class: 'sizer' },
            h('button', { type: 'button', 'aria-label': t('common.smaller'), onclick: () => nudge(-10) }, '−'),
            sizeVal,
            h('button', { type: 'button', 'aria-label': t('common.bigger'), onclick: () => nudge(10) }, '+')),
          h('div', { class: 'swatches' }, swatches, h('label', { class: 'custom' }, t('common.other') + ' ', custom))));
    }
    const refreshAll = () => { refreshPreview(); refreshers.forEach((f) => f()); };

    box.append(
      h('div', { class: 'card' },
        h('h3', null, t('set.previewTitle')),
        preview,
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, t('set.lenTitle')),
          h('p', { class: 'muted' }, t('set.lenText')),
          seg(Object.keys(GS.LENGTHS).map((id) => [id, t('len.' + id)]), s.len, async (id) => {
            state.settings = await Store.setSettings({ len: id });
            render();
          }, 'data-len'),
          lenNote),
        styleControl('de', t('text.de')),
        styleControl('tr', t('text.tr')))
    );

    // ---- downloads + reset ----
    box.append(
      h('div', { class: 'card' },
        h('h3', null, t('set.filesTitle')),
        h('p', { class: 'muted' }, t('set.filesText')),
        h('div', { class: 'row' },
          h('button', { class: 'btn secondary', type: 'button', onclick: () => chooseDownload('sentences') }, t('set.dlSentences')),
          h('button', { class: 'btn secondary', type: 'button', onclick: () => chooseDownload('words') }, t('set.dlWords'))),
        h('hr'),
        h('div', { class: 'row' },
          h('a', { class: 'btn secondary small', href: 'welcome.html' }, t('help.intro')),
          h('span', { class: 'grow' }),
          h('button', {
            class: 'btn danger small', type: 'button',
            onclick: async () => {
              if (!confirm(t('set.confirmReset'))) return;
              const D = GS.DEFAULT_SETTINGS;
              state.settings = await Store.setSettings({
                lang: D.lang, learn: D.learn, de: { ...D.de }, tr: { ...D.tr }, pos: null, uiScale: D.uiScale,
                game: { ...D.game }, palette: D.palette, len: D.len,
              });
              await applyLang();
              await afterLearnChange();
              toast(t('set.resetDone'));
            },
          }, t('set.reset'))))
    );
    refreshAll();
    return box;
  }

  // ---------- help ----------
  function viewHelp() {
    const step = (n, title, text) => h('div', { class: 'hstep' }, h('span', { class: 'num' }, String(n)), h('div', null, h('h4', null, title), h('p', null, text)));
    return h('div', null,
      h('h2', null, t('help.title')),
      h('div', { class: 'card' },
        step(1, t('help.s1'), t('help.s1Text')),
        step(2, t('help.s2'), t('help.s2Text')),
        step(3, t('help.s3'), t('help.s3Text')),
        step(4, t('help.s4'), t('help.s4Text')),
        h('div', { class: 'row' },
          h('a', { class: 'btn', href: 'https://www.youtube.com/', target: '_blank', rel: 'noopener' }, t('wz.youtube')),
          h('a', { class: 'btn secondary', href: 'welcome.html' }, t('help.intro')))),
      keysCard(),
      h('div', { class: 'card' },
        h('h3', null, t('help.problems')),
        h('p', null, t('help.p1')),
        h('p', null, t('help.p2')),
        h('p', null, t('help.p3'))),
      // who made this, with a link to the "About me" tab
      h('p', { class: 'madeby' }, t('about.madeBy'), ' ',
        h('button', { type: 'button', class: 'linkbtn', onclick: () => go('about') }, 'Sami Khaleel →')));
  }

  // ---------- about me: the developer of this extension ----------
  // name, links and numbers are the same in every language, so they are not in i18n.js
  const ABOUT = {
    name: 'Sami Khaleel',
    photo: 'about-sami.jpg',
    links: [
      { id: 'xing', label: 'XING', text: 'xing.com/profile/sami_khaleel031626', href: 'https://www.xing.com/profile/sami_khaleel031626' },
      { id: 'github', label: 'GitHub', text: 'github.com/sami000khaleel', href: 'https://github.com/sami000khaleel' },
      { id: 'email', label: 'about.email', text: 'sami000khaleel@gmail.com', href: 'mailto:sami000khaleel@gmail.com' },
      { id: 'phone', label: 'about.phone', text: '+49 179 1761950', href: 'tel:+491791761950' },
    ],
  };
  function viewAbout() {
    // a label with a dot is a text key (translated), otherwise a name (XING, GitHub)
    const label = (l) => (l.includes('.') ? t(l) : l);
    return h('div', null,
      h('h2', null, t('about.title')),
      h('div', { class: 'card about' },
        h('img', { class: 'aboutphoto', src: ABOUT.photo, alt: ABOUT.name }),
        h('div', { class: 'aboutmain' },
          h('h3', { class: 'aboutname' }, ABOUT.name),
          h('p', { class: 'aboutrole' }, t('about.role')),
          h('p', null, t('about.text')))),
      h('div', { class: 'card' },
        h('h3', null, t('about.contact')),
        h('div', { class: 'contacts' },
          ABOUT.links.map((l) =>
            h('a', {
              class: 'contact', 'data-contact': l.id, href: l.href,
              // web pages open in a new tab; e-mail and phone open the computer's mail / phone app
              ...(l.href.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {}),
            }, h('b', null, label(l.label)), h('span', { dir: 'ltr' }, l.text))))));
  }

  // ---------- loading ----------
  async function reload() {
    [state.settings, state.sentences, state.words] = await Promise.all([Store.getSettings(), Store.listSentences(), Store.listWords()]);
    renderTabs();
    render();
  }

  // something was saved or changed on YouTube while this page is open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let langChanged = false;
    let learnChanged = false;
    if (changes.sentences) state.sentences = changes.sentences.newValue || [];
    if (changes.words) state.words = changes.words.newValue || [];
    if (changes.settings) {
      const prev = state.settings.lang;
      const prevLearn = learn();
      state.settings = GS.merge(GS.DEFAULT_SETTINGS, changes.settings.newValue || {});
      Ui.applyTheme(state.settings);
      langChanged = state.settings.lang !== prev;
      learnChanged = learn() !== prevLearn;
    }
    if (learnChanged) afterLearnChange();
    if (langChanged) { applyLang(); return; }
    if (learnChanged) return;
    renderTabs();
    // do not disturb the user while typing, playing or editing settings
    const busy = state.open || state.tab === 'settings' || (state.tab === 'practice' && (state.game || state.menu));
    if (!busy) render();
  });

  (async () => {
    try {
      [state.settings, state.sentences, state.words] = await Promise.all([Store.getSettings(), Store.listSentences(), Store.listWords()]);
      if (location.hash === '#games') state.tab = 'practice';
      if (location.hash === '#help') state.tab = 'help';
      if (location.hash === '#about') state.tab = 'about';
      applyLangChrome();
      renderTabs();
      render();
      if (state.settings.lang !== 'en') await applyLang(); // draw again in the user's language
    } catch (e) {
      console.error(e);
      document.documentElement.setAttribute('data-ready', '');
      $view.replaceChildren(h('div', { class: 'card' }, h('h3', null, t('app.loadFail')), h('p', null, String(e))));
    }
  })();
})();
