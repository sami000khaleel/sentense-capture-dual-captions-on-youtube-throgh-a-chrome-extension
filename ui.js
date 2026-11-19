// Small building blocks shared by the library page (app.js) and the introduction (welcome.js).
globalThis.GSTUi = (() => {
  const GS = globalThis.GSTStore;

  // h('p', {class: 'x', onclick: fn}, 'text', otherElement) -> a <p> element
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) { // lists inside lists are allowed too
      if (kid == null || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return e;
  }

  // a language's name written in that language (what the user recognises)
  const langLabel = (code) => (GS.LANGS.find((l) => l[0] === code) || [code, code, code])[1];
  const dirOf = (code) => (GS.RTL.includes(code) ? 'rtl' : 'ltr');

  // a row of buttons of which one is chosen (difficulty, number of rounds, ...)
  function seg(options, current, onPick, attrName) {
    return h(
      'div',
      { class: 'seg', role: 'group' },
      options.map(([value, label]) =>
        h('button', {
          type: 'button',
          'aria-pressed': String(String(current) === String(value)),
          [attrName || 'data-v']: value,
          onclick: () => onPick(value),
        }, label)
      )
    );
  }

  // the list of languages for a <select>; `other` is the language that may not be picked here
  const langOptions = (current, other) =>
    GS.LANGS.map(([code, native, english]) =>
      h('option', { value: code, selected: code === current, disabled: code === other }, native === english ? english : `${native} — ${english}`));

  // the palettes as big buttons; every button is painted with its own colours
  function paletteChooser(current, onPick, t) {
    return h('div', { class: 'pals', role: 'group' },
      GS.PALETTES.map((p) => {
        const b = h('button', { type: 'button', class: 'pal', 'aria-pressed': String(p.id === current), onclick: () => onPick(p.id) },
          h('span', { class: 'dots' }, h('i', { class: 'd1' }), h('i', { class: 'd2' }), h('i', { class: 'd3' })),
          t('pal.' + p.id));
        GS.applyPalette(b, p.id);
        return b;
      }));
  }

  // colours and text size of the whole page, from the settings
  function applyTheme(settings) {
    const root = document.documentElement;
    GS.applyPalette(root, settings.palette);
    root.style.setProperty('--ui', String(settings.uiScale || 1));
    root.setAttribute('data-ready', ''); // the page stays hidden until its colours are known (no flash)
  }

  // ---- the example for "sentence length": one long sentence, cut the way the video's sentences are cut ----
  // a long sentence without commas, like the ones automatic subtitles produce
  const LONG = {
    en: 'Yesterday evening after work I quickly rode my old bike to the small supermarket on the corner of our street and then I bought some fresh bread and a bottle of milk there for breakfast the next morning.',
    de: 'Ich bin gestern Abend nach der Arbeit noch schnell mit dem Fahrrad in den kleinen Supermarkt an der Ecke gefahren und dann habe ich dort frisches Brot und eine Flasche Milch für das Frühstück am nächsten Morgen gekauft.',
  };
  const demoTr = new Map(); // "from|to|text" -> the translation ('' = it failed, true = on its way)
  // the translation of `text`, or null while it is being fetched (then `redraw` is called when it is there)
  function translated(text, from, to, redraw) {
    if (GS.sameLang(from, to)) return text;
    const key = `${from}|${to}|${text}`;
    const hit = demoTr.get(key);
    if (typeof hit === 'string') return hit;
    if (!hit) {
      demoTr.set(key, true);
      chrome.runtime.sendMessage({ type: 'translate', text, sl: from, tl: to })
        .then((r) => demoTr.set(key, r && r.text ? String(r.text).trim() : ''))
        .catch(() => demoTr.set(key, ''))
        .finally(redraw);
    }
    return null;
  }
  // The parts the long example is shown in with the chosen sentence length: [{text, tr}].
  // It uses the same function as the video (GST.build), so the example shows exactly what the setting does.
  function lengthParts(settings, redraw) {
    const learn = settings.learn;
    let long = LONG[GS.baseLang(learn)];
    if (!long) {
      long = translated(LONG.en, 'en', learn, redraw); // other languages: the English example, translated once
      if (long === null) return null; // on its way
      if (!long) long = LONG.en;
    }
    const maxWords = GS.LENGTHS[settings.len] || GS.LENGTHS.normal;
    const parts = globalThis.GST.build([globalThis.GST.makeCue(0, 20000, [{ txt: long }])], learn, { maxWords });
    return parts.map((p) => ({ text: p.text, tr: translated(p.text, learn, settings.lang, redraw) ?? '…' }));
  }
  // the parts as caption boxes like on the video, in the user's caption colours and sizes
  function lengthPlates(settings, redraw) {
    const parts = lengthParts(settings, redraw) || [{ text: '…', tr: '…' }];
    return parts.map((p) =>
      h('div', { class: 'plate' },
        h('div', { class: 'pde', lang: settings.learn, dir: dirOf(settings.learn), style: `color:${settings.de.color};font-size:${(22 * settings.de.size) / 100}px` }, p.text),
        h('div', { class: 'ptr', lang: settings.lang, dir: dirOf(settings.lang), style: `color:${settings.tr.color};font-size:${(18 * settings.tr.size) / 100}px` }, p.tr)));
  }

  return { h, seg, dirOf, langLabel, langOptions, paletteChooser, applyTheme, lengthParts, lengthPlates };
})();
