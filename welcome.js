// The introduction: a few short steps, shown once after the installation (and again from Settings).
// It explains the two lines of text on the video, the keys A S D W, saving words, the library and its games.
(() => {
  const GS = globalThis.GSTStore;
  const I18n = globalThis.GSTI18n;
  const A = globalThis.GSTAudio;
  const Ui = globalThis.GSTUi;
  const { h, seg, dirOf } = Ui;
  const { t } = I18n;
  const Store = GS.create(chrome.storage.local);
  const $root = document.getElementById('wiz');

  const state = {
    step: 0,
    settings: GS.merge(GS.DEFAULT_SETTINGS, {}),
    demo: 0, // which example sentence the little video shows
    note: '', // a message on the little video ("Sentence saved")
    pressed: '', // the key that was tried last
    playing: true, // the pretend video of the step about the keys: playing or paused
    replaying: false, // ... and a sentence is being played once because S was pressed while it was paused
    samples: new Map(), // the example sentences in the language being learned
    platePos: null, // step 2: where the text was dragged to ({x, y} = its centre as a share of the little video; null = bottom)
    dragging: false, // ... it is being dragged right now
    gearOpen: false, // ... the ⚙ panel is open
    part: 0, // step 6: which part of the long example the little video shows
  };
  const kbd = (k) => h('kbd', null, k);

  // ---------- the example sentences ----------
  const DEMO = ['wz.d1', 'wz.d2', 'wz.d3'];
  // Top line: the English example translated into the language being learned (asked once, then remembered).
  function sample(i) {
    const en = I18n.EN[DEMO[i]];
    const learn = state.settings.learn;
    if (GS.baseLang(learn) === 'en') return en;
    const key = `${learn}|${i}`;
    if (!state.samples.has(key)) {
      state.samples.set(key, '…');
      chrome.runtime.sendMessage({ type: 'translate', text: en, sl: 'en', tl: learn })
        .then((r) => state.samples.set(key, (r && r.text) || en))
        .catch(() => state.samples.set(key, en))
        .finally(render);
    }
    return state.samples.get(key);
  }

  // a little picture of a video with our two lines of text on it; `top` replaces the first line when given.
  // The top line has the size and colour from the settings, like on YouTube.
  function screen(i, top, ...extra) {
    const learn = state.settings.learn;
    const de = state.settings.de;
    return h('div', { class: 'screen' },
      h('div', { class: 'plate' },
        h('div', { class: 'l1', lang: learn, dir: dirOf(learn), style: `color:${de.color};font-size:${(1.3 * de.size) / 100}rem` }, top || sample(i)),
        h('div', { class: 'l2', dir: dirOf(state.settings.lang) }, t(DEMO[i]))),
      extra);
  }

  // the pretend video that plays (steps 2 and 3): a badge that says playing / paused, and a bar that fills while
  // the sentence is spoken. A click on it pauses or plays it, like on a real video.
  function liveScreen(top, ...extra) {
    const moving = state.playing || state.replaying;
    const sc = screen(state.demo, top,
      h('div', { class: 'vstate' + (moving ? ' on' : '') }, moving ? t('wz.3.isPlaying') : t('wz.3.isPaused')),
      h('div', { class: 'vbar' }, moving ? h('i', { style: `animation-duration:${state.playing ? SENTENCE_MS : replayMs}ms` }) : null),
      // what just happened ("Playing this sentence once …"), on the video itself
      h('p', { class: 'demonote', role: 'status' }, state.note || ''),
      extra);
    sc.classList.add('live');
    sc.classList.toggle('paused', !moving);
    sc.addEventListener('click', () => demoKey(' '));
    return sc;
  }

  // ---------- the steps (each gives a title and what is shown under it) ----------
  function stepWelcome() {
    const s = state.settings;
    const pick = (key) => async (e) => {
      state.settings = await Store.setSettings({ [key]: e.target.value });
      render();
      if (key === 'lang') { await I18n.load(state.settings.lang); render(); } // the texts of this page in the new language
    };
    return {
      title: t('wz.1.title'),
      body: [
        h('p', { class: 'lead' }, t('wz.1.text')),
        h('div', { class: 'field' },
          h('label', { for: 'wz-lang' }, t('wz.1.speak')),
          h('select', { id: 'wz-lang', onchange: pick('lang') }, Ui.langOptions(s.lang, s.learn))),
        h('div', { class: 'field' },
          h('label', { for: 'wz-learn' }, t('wz.1.learn')),
          h('select', { id: 'wz-learn', onchange: pick('learn') }, Ui.langOptions(s.learn, s.lang))),
      ],
    };
  }

  // ---------- step 2: the two lines, and the text can be moved and changed like on YouTube ----------
  const SWATCHES = ['#ffffff', '#ffd54f', '#9ae6b4', '#7dd3fc', '#fda4af', '#fdba74'];
  // size and colour of the top line: saved in the settings, so they are used on YouTube too
  async function setDe(patch) {
    state.settings = await Store.setSettings({ de: patch });
    state.note = t('wz.2.saved');
    render();
  }
  // the ⚙ panel on the little video
  function gearPanel() {
    const de = state.settings.de;
    const size = (delta) => () => setDe({ size: Math.min(250, Math.max(60, de.size + delta)) });
    return h('div', { class: 'gearpanel', onclick: (e) => e.stopPropagation(), onpointerdown: (e) => e.stopPropagation() },
      h('div', { class: 'gprow' },
        h('span', null, t('wz.2.size')),
        h('button', { type: 'button', 'aria-label': t('common.smaller'), onclick: size(-10) }, '−'),
        h('b', { dir: 'ltr' }, `${de.size}%`),
        h('button', { type: 'button', 'aria-label': t('common.bigger'), onclick: size(10) }, '+')),
      h('div', { class: 'gprow' },
        h('span', null, t('wz.2.colour')),
        SWATCHES.map((c) => h('button', {
          type: 'button', class: 'gpsw', style: `background:${c}`, 'aria-pressed': String(c === String(de.color).toLowerCase()),
          'aria-label': t('wz.2.colour'), onclick: () => setDe({ color: c }),
        }))));
  }
  // dragging the text inside the little video (pointer events work for mouse, pen and finger)
  function makeDraggable(plate, sc) {
    let start = null;
    plate.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.wzgear')) return;
      const box = sc.getBoundingClientRect();
      const r = plate.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, cx: r.left + r.width / 2 - box.left, cy: r.top + r.height / 2 - box.top, box, w: r.width, h: r.height, moved: false };
      plate.setPointerCapture(e.pointerId);
    });
    plate.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) < 5) return; // under 5 pixels it is still a click
      start.moved = true;
      state.dragging = true;
      const { box, w, h: ht } = start;
      // the centre, kept so that the whole text stays inside the video, and its ⚙ too
      // (the button sticks out GEAR pixels at the top right: it must stay clickable)
      const GEAR = 14;
      const cx = Math.min(box.width - w / 2 - GEAR, Math.max(w / 2, start.cx + dx));
      const cy = Math.min(box.height - ht / 2, Math.max(ht / 2 + GEAR, start.cy + dy));
      state.platePos = { x: cx / box.width, y: cy / box.height };
      plate.style.left = `${cx}px`;
      plate.style.top = `${cy}px`;
      plate.classList.add('placed');
    });
    const end = () => {
      if (!start) return;
      const moved = start.moved;
      start = null;
      state.dragging = false;
      // a drag is not a click on the video: do not pause it
      if (moved) plate.addEventListener('click', (e) => e.stopPropagation(), { capture: true, once: true });
    };
    plate.addEventListener('pointerup', end);
    plate.addEventListener('pointercancel', end);
  }
  function stepCaptions() {
    const gear = h('button', {
      type: 'button', class: 'wzgear', 'aria-label': t('m.title'), title: t('m.title'),
      onclick: (e) => { e.stopPropagation(); state.gearOpen = !state.gearOpen; render(); },
    }, '⚙');
    const sc = liveScreen(null, state.gearOpen ? gearPanel() : null);
    const plate = sc.querySelector('.plate');
    plate.append(gear);
    plate.classList.add('movable');
    if (state.platePos) {
      plate.classList.add('placed');
      plate.style.left = `${state.platePos.x * 100}%`;
      plate.style.top = `${state.platePos.y * 100}%`;
    }
    makeDraggable(plate, sc);
    return {
      title: t('wz.2.title'),
      body: [
        sc,
                h('p', { class: 'lead' }, t('wz.2.text')),
        h('p', { class: 'muted' }, t('wz.2.try')),
      ],
    };
  }

  // ---------- the pretend video of the step about the keys ----------
  // It "plays" the example sentences one after another. Space pauses it. While it is paused,
  // S (and A, D) play one sentence and then pause again by themselves, exactly like on YouTube.
  const SENTENCE_MS = 3600; // how long one sentence takes while the pretend video plays
  let advanceTimer = null;
  let replayTimer = null;
  let replayId = 0; // changes with every replay, so an older one that ends late is ignored
  let replayMs = 0; // how long the current replay takes (for the moving bar)
  const onKeysStep = () => STEPS[state.step] === stepKeys;
  const onLiveStep = () => STEPS[state.step] === stepKeys || STEPS[state.step] === stepCaptions; // steps with the playing video

  // (re)start the clock of the pretend video: when this sentence is over, the next one comes
  function runDemo() {
    clearTimeout(advanceTimer);
    if (!onLiveStep() || !state.playing) return;
    advanceTimer = setTimeout(() => {
      if (state.dragging) return runDemo(); // the text is being dragged: drawing the page again now would drop it
      state.demo = (state.demo + 1) % DEMO.length;
      state.note = '';
      state.pressed = '';
      render();
      runDemo();
    }, SENTENCE_MS);
  }
  function stopReplay() {
    replayId++;
    clearTimeout(replayTimer);
    state.replaying = false;
    A.stopSpeaking();
  }
  // play the sentence once, then "pause the video" again
  function replayOnce() {
    stopReplay();
    const id = replayId;
    const text = sample(state.demo);
    state.replaying = true;
    state.note = t('wz.3.once');
    const done = () => {
      if (id !== replayId) return; // another replay has started, or the step was left
      clearTimeout(replayTimer);
      state.replaying = false;
      state.note = t('wz.3.pausedAgain');
      render();
    };
    replayMs = Math.max(1800, [...text].length * 75);
    // really say it, when this computer has a voice for the language; otherwise just wait as long as it would take
    const spoken = text !== '…' && A.speak(text, state.settings.learn, { onend: done }).ok;
    replayTimer = setTimeout(done, spoken ? 9000 : replayMs);
  }

  // what a key does on the pretend video (' ' = the space bar)
  function demoKey(k) {
    if (k === ' ') {
      stopReplay();
      state.playing = !state.playing;
      state.note = '';
    } else if (k === 'w') state.note = t('v.sentenceSaved');
    else if (['a', 's', 'd'].includes(k)) {
      if (k === 'a') state.demo = Math.max(0, state.demo - 1);
      if (k === 'd') state.demo = Math.min(DEMO.length - 1, state.demo + 1);
      if (state.playing) state.note = k === 's' ? t('wz.3.again') : ''; // playing: it just goes on from the start of that sentence
      else replayOnce(); // paused: this one sentence, then pause again
    } else return;
    state.pressed = k;
    render();
    runDemo();
  }
  // step 3: everything (video, keys, explanation) fits on one screen, without scrolling
  function stepKeys() {
    const key = (k, cap, label, cls = '') =>
      h('button', { type: 'button', class: 'key' + cls + (state.pressed === k ? ' on' : ''), onclick: () => demoKey(k) }, kbd(cap), h('span', null, label));
    return {
      title: t('wz.3.title'),
      body: [
        h('p', { class: 'lead tight' }, t('wz.3.text')),
        liveScreen(null),
                h('div', { class: 'keys' },
          key(' ', t('wz.3.spaceKey'), t('wz.3.space'), ' space'),
          key('a', 'A', t('wz.3.a')), key('s', 'S', t('wz.3.s')), key('d', 'D', t('wz.3.d')), key('w', 'W', t('wz.3.w'))),
        h('p', { class: 'muted small' }, t('wz.3.mouse')),
      ],
    };
  }

  function stepWords() {
    // the first example sentence with its longest word "clicked"
    const tokens = GS.tokens(sample(0), state.settings.learn);
    const longest = tokens.reduce((best, tk, i) => (tk.w && (best < 0 || tk.t.length > tokens[best].t.length) ? i : best), -1);
    return {
      title: t('wz.4.title'),
      body: [
        screen(0, tokens.map((tk, i) => (i === longest ? h('span', { class: 'hit' }, tk.t) : tk.t))),
        h('p', { class: 'lead' }, t('wz.4.text')),
        h('div', { class: 'chips' }, [t('diff.easy'), t('diff.medium'), t('diff.hard')].map((x) => h('span', null, x))),
        h('p', { class: 'muted' }, t('wz.4.note')),
      ],
    };
  }

  function stepLibrary() {
    const mini = (icon, label) => h('div', { class: 'mini' }, h('span', { class: 'gicon' }, icon), label);
    return {
      title: t('wz.5.title'),
      body: [
        h('div', { class: 'minis' },
          mini('🃏', t('games.cards')), mini('🧠', t('games.match')), mini('✏️', t('games.gap')),
          mini('🧩', t('games.build')), mini('🎧', t('games.listen'))),
        h('p', { class: 'lead' }, t('wz.5.text')),
        h('p', { class: 'muted' }, t('wz.5.pin')),
      ],
    };
  }

  // step 6: the example for the sentence length plays on the little video, part after part, like on YouTube
  const PART_MS = 2600; // how long each part stays on the little video
  let partTimer = null;
  function runParts() {
    clearTimeout(partTimer);
    if (STEPS[state.step] !== stepYours) return;
    partTimer = setTimeout(() => {
      state.part += 1; // render() starts from the first part again after the last
      render();
      runParts();
    }, PART_MS);
  }
  function stepYours() {
    const s = state.settings;
    const set = (patch) => async () => {
      state.settings = await Store.setSettings(patch);
      state.part = 0; // another length: show its parts from the first one
      render();
      runParts();
    };
    // the long example, cut with the chosen length (drawn again when its translations arrive)
    const parts = Ui.lengthParts(s, () => { if (STEPS[state.step] === stepYours) render(); }) || [{ text: '…', tr: '…' }];
    const k = state.part % parts.length;
    const p = parts[k];
    const sc = h('div', { class: 'screen live short' },
      h('div', { class: 'plate' },
        h('div', { class: 'l1', lang: s.learn, dir: dirOf(s.learn), style: `color:${s.de.color};font-size:${(1.15 * s.de.size) / 100}rem` }, p.text),
        h('div', { class: 'l2', lang: s.lang, dir: dirOf(s.lang), style: `color:${s.tr.color}` }, p.tr)),
      h('div', { class: 'vstate on' }, t('wz.6.part', { n: k + 1, total: parts.length })),
      h('div', { class: 'vbar' }, h('i', { style: `animation-duration:${PART_MS}ms` })));
    return {
      title: t('wz.6.title'),
      body: [
        h('p', { class: 'lead tight' }, t('wz.6.text')),
        h('div', { class: 'field tight' }, h('span', { class: 'lbl' }, t('set.palTitle')),
          Ui.paletteChooser(s.palette, (id) => set({ palette: id })(), t)),
        h('div', { class: 'field tight lenrow' }, h('span', { class: 'lbl' }, t('set.lenTitle')),
          seg(Object.keys(GS.LENGTHS).map((id) => [id, t('len.' + id)]), s.len, (id) => set({ len: id })(), 'data-len')),
        sc, // its badge says "Part 2 of 4": how many parts this length makes of the long sentence
      ],
    };
  }

  const STEPS = [stepWelcome, stepCaptions, stepKeys, stepWords, stepLibrary, stepYours];

  // ---------- drawing ----------
  function render() {
    const lang = state.settings.lang;
    I18n.setLearn(state.settings.learn);
    Ui.applyTheme(state.settings);
    document.documentElement.lang = lang;
    document.documentElement.dir = dirOf(lang);
    document.title = t('wz.title');
    const step = STEPS[state.step]();
    const last = state.step === STEPS.length - 1;
    $root.replaceChildren(
      h('div', { class: 'wizcard' },
        h('div', { class: 'wiztop' },
          h('span', { class: 'muted' }, t('wz.step', { n: state.step + 1, total: STEPS.length })),
          h('div', { class: 'dots', 'aria-hidden': 'true' }, STEPS.map((_, i) => h('i', { class: i === state.step ? 'on' : i < state.step ? 'past' : '' })))),
        h('h1', null, step.title),
        step.body,
        h('div', { class: 'wiznav' },
          state.step
            ? h('button', { class: 'btn secondary', type: 'button', onclick: () => go(-1) }, t('wz.back'))
            : h('a', { class: 'btn quiet', href: 'app.html' }, t('wz.skip')),
          h('span', { class: 'grow' }),
          last
            ? [h('a', { class: 'btn secondary', href: 'app.html' }, t('m.library')), h('a', { class: 'btn big', href: 'https://www.youtube.com/' }, t('wz.youtube'))]
            : h('button', { class: 'btn big', type: 'button', onclick: () => go(1) }, t('wz.next'))))
    );
  }

  function go(delta) {
    const next = Math.min(STEPS.length - 1, Math.max(0, state.step + delta));
    if (next === state.step) return;
    state.step = next;
    state.note = '';
    state.pressed = '';
    state.demo = 0;
    state.playing = true; // the pretend video starts playing when its step opens
    state.gearOpen = false;
    state.part = 0;
    stopReplay();
    render();
    runDemo();
    runParts();
    window.scrollTo(0, 0);
  }

  // on the step about the keys, Space and A S D W work like on a real video; the arrow keys turn the pages
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target;
    if (tg && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tg.tagName)) return;
    const k = e.key.toLowerCase();
    // Space on "Next" or "Back" presses that button, as always; everywhere else it pauses the pretend video
    const onNav = k === ' ' && tg && tg.closest && tg.closest('.wiznav');
    if (onKeysStep() && [' ', 'a', 's', 'd', 'w'].includes(k) && !onNav) { e.preventDefault(); if (!e.repeat) demoKey(k); }
    else if (k === 'arrowright') go(1);
    else if (k === 'arrowleft') go(-1);
  });

  // ---------- loading ----------
  (async () => {
    try { state.settings = await Store.getSettings(); } catch (e) { console.error(e); }
    render(); // at once, in English ...
    if (state.settings.lang !== 'en') { await I18n.load(state.settings.lang); render(); } // ... then in the user's language
  })();
})();
