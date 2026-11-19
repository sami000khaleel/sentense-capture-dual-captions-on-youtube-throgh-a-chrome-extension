// Shared by the video script and the library page: settings, saved sentences, saved words.
// Everything lives in chrome.storage.local; the library page can export it as .json / .csv files.
globalThis.GSTStore = (() => {
  // the language the user's browser is set to, when we can translate into it (else English)
  function detectLang() {
    try {
      const full = navigator.language || 'en';
      const base = full.split('-')[0];
      const codes = LANGS.map((l) => l[0]);
      if (codes.includes(full)) return full;
      if (base === 'zh') return 'zh-CN';
      if (base === 'nb' || base === 'nn') return 'no';
      if (codes.includes(base)) return base;
    } catch {}
    return 'en';
  }
  const DEFAULT_SETTINGS = {
    lang: 'en', // language of the interface and the translations (replaced by the browser language below)
    learn: 'de', // the language being learned (the language of the videos)
    de: { size: 100, color: '#ffffff' }, // German line on the video (size in %)
    tr: { size: 100, color: '#ffd54f' }, // translation line on the video
    pos: null, // where the captions sit on the video: {x, y} = centre as a share of the video size; null = default place
    uiScale: 1, // text size of the library page
    // the games: direction of the word cards; how many words / sentences each game practises (counts);
    // sound: 'video' = original sound of the video, 'voice' = computer voice
    game: { direction: 'mixed', counts: { cards: 10, match: 6, gap: 5, build: 5, listen: 10 }, sound: 'video' },
    palette: 'ocean', // the colours of the library, the introduction and the menus on the video (see PALETTES)
    len: 'normal', // how long a sentence on the video may be (see LENGTHS)
  };

  // the longest sentence (in words) shown on the video, per choice in the settings
  const LENGTHS = { short: 10, normal: 15, long: 24 };

  // ---- colour palettes ----
  // Every palette fills the same CSS variables, so the pages only ever use var(--primary) etc.
  // bg = page, card = boxes, soft = light tint of the main colour, ink = text, tr = colour of translations
  const PALETTES = [
    { id: 'ocean', dark: false, c: { bg: '#f3f6fb', card: '#ffffff', ink: '#14202e', muted: '#5a6b80', line: '#dde5f0', primary: '#2563eb', onPrimary: '#ffffff', soft: '#e3ecfe', accent: '#f59e0b', tr: '#9a5b00', ok: '#15803d', okBg: '#dcf5e4', bad: '#c0262d', badBg: '#fde7e7', note: '#fff6d8' } },
    { id: 'forest', dark: false, c: { bg: '#f2f6f1', card: '#ffffff', ink: '#16241a', muted: '#58705d', line: '#d7e5d6', primary: '#2f7d4f', onPrimary: '#ffffff', soft: '#ddf0e3', accent: '#c98a16', tr: '#8a5a00', ok: '#1f7a3e', okBg: '#dcf2e2', bad: '#b4282e', badBg: '#fbe6e6', note: '#fbf4d9' } },
    { id: 'sunset', dark: false, c: { bg: '#fdf5ef', card: '#ffffff', ink: '#2b1c14', muted: '#7d6152', line: '#f1dccd', primary: '#c2410c', onPrimary: '#ffffff', soft: '#fde5d6', accent: '#7c3aed', tr: '#7c3aed', ok: '#15803d', okBg: '#dcf5e4', bad: '#b91c1c', badBg: '#fde4e4', note: '#fff1d6' } },
    { id: 'lavender', dark: false, c: { bg: '#f6f4fc', card: '#ffffff', ink: '#1f1a2e', muted: '#685f80', line: '#e3ddf3', primary: '#6d28d9', onPrimary: '#ffffff', soft: '#ece3ff', accent: '#db2777', tr: '#a3266a', ok: '#15803d', okBg: '#dcf5e4', bad: '#be123c', badBg: '#fde4ea', note: '#fbf1dc' } },
    { id: 'rose', dark: false, c: { bg: '#fdf3f5', card: '#ffffff', ink: '#2a1419', muted: '#7d5a63', line: '#f2d9df', primary: '#be185d', onPrimary: '#ffffff', soft: '#fce1ec', accent: '#0f766e', tr: '#0f766e', ok: '#15803d', okBg: '#dcf5e4', bad: '#b91c1c', badBg: '#fde4e4', note: '#fff3dc' } },
    { id: 'night', dark: true, c: { bg: '#0f1420', card: '#18202f', ink: '#e8edf5', muted: '#9babbf', line: '#2a364b', primary: '#60a5fa', onPrimary: '#0b1220', soft: '#1d3352', accent: '#fbbf24', tr: '#fcd34d', ok: '#4ade80', okBg: '#12321f', bad: '#f87171', badBg: '#3a181b', note: '#2b2814' } },
    { id: 'contrast', dark: false, c: { bg: '#ffffff', card: '#ffffff', ink: '#000000', muted: '#222222', line: '#000000', primary: '#0033cc', onPrimary: '#ffffff', soft: '#e3e9ff', accent: '#b45309', tr: '#7a2e00', ok: '#006b1f', okBg: '#d9f7e1', bad: '#b00000', badBg: '#ffe0e0', note: '#fff3c4' } },
  ];
  const paletteOf = (id) => PALETTES.find((p) => p.id === id) || PALETTES[0];
  // put the colours of a palette on an element as CSS variables (--bg, --primary, ...)
  function applyPalette(el, id) {
    const p = paletteOf(id);
    for (const [k, v] of Object.entries(p.c)) el.style.setProperty('--' + k, v);
    el.style.setProperty('color-scheme', p.dark ? 'dark' : 'light');
    if (el.dataset) el.dataset.palette = p.id;
  }

  // [Google Translate code, name in its own language, English name]
  const LANGS = [
    ['en', 'English', 'English'], ['ar', 'العربية', 'Arabic'], ['tr', 'Türkçe', 'Turkish'],
    ['es', 'Español', 'Spanish'], ['fr', 'Français', 'French'], ['ru', 'Русский', 'Russian'],
    ['uk', 'Українська', 'Ukrainian'], ['fa', 'فارسی', 'Persian'], ['ku', 'Kurdî', 'Kurdish'],
    ['nl', 'Nederlands', 'Dutch'], ['it', 'Italiano', 'Italian'], ['pl', 'Polski', 'Polish'],
    ['pt', 'Português', 'Portuguese'], ['ro', 'Română', 'Romanian'], ['el', 'Ελληνικά', 'Greek'],
    ['sv', 'Svenska', 'Swedish'], ['da', 'Dansk', 'Danish'], ['no', 'Norsk', 'Norwegian'],
    ['fi', 'Suomi', 'Finnish'], ['cs', 'Čeština', 'Czech'], ['sk', 'Slovenčina', 'Slovak'],
    ['hu', 'Magyar', 'Hungarian'], ['bg', 'Български', 'Bulgarian'], ['hr', 'Hrvatski', 'Croatian'],
    ['sr', 'Српски', 'Serbian'], ['sq', 'Shqip', 'Albanian'], ['zh-CN', '中文（简体）', 'Chinese (Simplified)'],
    ['ja', '日本語', 'Japanese'], ['ko', '한국어', 'Korean'], ['hi', 'हिन्दी', 'Hindi'],
    ['ur', 'اردو', 'Urdu'], ['bn', 'বাংলা', 'Bengali'], ['vi', 'Tiếng Việt', 'Vietnamese'],
    ['th', 'ไทย', 'Thai'], ['id', 'Bahasa Indonesia', 'Indonesian'], ['he', 'עברית', 'Hebrew'],
    ['sw', 'Kiswahili', 'Swahili'], ['am', 'አማርኛ', 'Amharic'],
    ['de', 'Deutsch', 'German'], ['ca', 'Català', 'Catalan'], ['lt', 'Lietuvių', 'Lithuanian'], ['lv', 'Latviešu', 'Latvian'],
    ['et', 'Eesti', 'Estonian'], ['sl', 'Slovenščina', 'Slovenian'], ['ms', 'Bahasa Melayu', 'Malay'], ['tl', 'Filipino', 'Filipino'],
    ['af', 'Afrikaans', 'Afrikaans'],
  ];
  const RTL = ['ar', 'fa', 'ur', 'he', 'ku'];
  DEFAULT_SETTINGS.lang = detectLang(); // (LANGS is known from here on)

  // ---- language helpers ----
  // the main part of a language code, with the old / alternative codes YouTube and Google use mapped together
  const baseLang = (c) => {
    c = String(c || '').toLowerCase().split(/[-_]/)[0];
    return { iw: 'he', in: 'id', nb: 'no', nn: 'no', jw: 'jv' }[c] || c;
  };
  const sameLang = (a, b) => !!a && !!b && baseLang(a) === baseLang(b);
  // a code the browser (speech, word splitting) understands
  const bcp47 = (c) => ({ no: 'nb', 'zh-CN': 'zh-CN', he: 'he', id: 'id' }[c] || c);
  const langEnglish = (code) => (LANGS.find((l) => l[0] === code) || [code, code, code])[2];
  const langNative = (code) => (LANGS.find((l) => l[0] === code) || [code, code, code])[1];
  // languages written without spaces between words
  const NO_SPACES = ['ja', 'zh', 'th'];

  // text -> [{t, w}] ; w = true for the words (to click on), false for spaces / punctuation / numbers
  const _seg = {};
  function tokens(text, lang) {
    text = String(text || '');
    const key = bcp47(lang || 'en');
    let seg = _seg[key];
    if (!seg) {
      try { seg = new Intl.Segmenter(key, { granularity: 'word' }); } catch { seg = new Intl.Segmenter('en', { granularity: 'word' }); }
      _seg[key] = seg;
    }
    const out = [];
    for (const s of seg.segment(text)) out.push({ t: s.segment, w: !!s.isWordLike && /\p{L}/u.test(s.segment) });
    return out;
  }

  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  function merge(base, patch) {
    const out = { ...base };
    for (const [k, v] of Object.entries(patch || {})) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
    return out;
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const norm = (w) => String(w || '').trim().toLowerCase();

  function create(area) {
    const get = (keys) => new Promise((res) => area.get(keys, res));
    const set = (obj) => new Promise((res) => area.set(obj, res));
    // one change at a time, so two quick saves cannot overwrite each other
    let queue = Promise.resolve();
    const run = (fn) => {
      const p = queue.then(fn);
      queue = p.catch(() => {});
      return p;
    };
    const list = async (key) => {
      const o = await get(key);
      return Array.isArray(o[key]) ? o[key] : [];
    };

    return {
      async getSettings() {
        const { settings } = await get('settings');
        return merge(DEFAULT_SETTINGS, settings || {});
      },
      setSettings: (patch) =>
        run(async () => {
          const { settings } = await get('settings');
          const next = merge(merge(DEFAULT_SETTINGS, settings || {}), patch);
          await set({ settings: next });
          return next;
        }),

      listSentences: () => list('sentences'),
      addSentence: (s) =>
        run(async () => {
          const items = await list('sentences');
          const dup = items.find((i) => i.videoId === s.videoId && i.text === s.text && Math.abs(i.time - s.time) < 1);
          if (dup) return { added: false, item: dup };
          const item = { id: uid(), savedAt: Date.now(), learn: 'de', ...s };
          await set({ sentences: [item, ...items] });
          return { added: true, item };
        }),
      updateSentence: (id, patch) =>
        run(async () => {
          const items = await list('sentences');
          const i = items.findIndex((x) => x.id === id);
          if (i < 0) return null;
          items[i] = { ...items[i], ...patch };
          await set({ sentences: items });
          return items[i];
        }),
      removeSentence: (id) =>
        run(async () => {
          await set({ sentences: (await list('sentences')).filter((i) => i.id !== id) });
        }),

      listWords: () => list('words'),
      addWord: (w) =>
        run(async () => {
          const items = await list('words');
          const dup = items.find((i) => i.lang === w.lang && (i.learn || 'de') === (w.learn || 'de') && norm(i.word) === norm(w.word));
          if (dup) return { added: false, item: dup };
          const item = { id: uid(), savedAt: Date.now(), learn: 'de', difficulty: 2, correct: 0, wrong: 0, ...w };
          await set({ words: [item, ...items] });
          return { added: true, item };
        }),
      updateWord: (id, patch) =>
        run(async () => {
          const items = await list('words');
          const i = items.findIndex((x) => x.id === id);
          if (i < 0) return null;
          items[i] = { ...items[i], ...patch };
          await set({ words: items });
          return items[i];
        }),
      removeWord: (id) =>
        run(async () => {
          await set({ words: (await list('words')).filter((i) => i.id !== id) });
        }),
    };
  }

  return { create, DEFAULT_SETTINGS, LENGTHS, PALETTES, paletteOf, applyPalette, LANGS, RTL, NO_SPACES, merge, norm, baseLang, sameLang, bcp47, langEnglish, langNative, tokens };
})();
