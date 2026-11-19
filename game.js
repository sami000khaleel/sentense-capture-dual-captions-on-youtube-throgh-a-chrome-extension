// Card game logic (no page code in here, so it can be tested on its own).
globalThis.GSTGame = (() => {
  // the harder a word is rated, the more often it shows up
  const WEIGHTS = { 1: 1, 2: 3, 3: 6 };
  const weight = (w) => WEIGHTS[w.difficulty] ?? WEIGHTS[2];
  const norm = (s) => String(s || '').trim().toLowerCase();

  // words that can be played: words of the language being learned (old items are German), with a translation in the chosen language
  const pool = (words, lang, learn = 'de') =>
    words.filter((w) => w.lang === lang && (w.learn || 'de') === learn && norm(w.translation));
  const canPlay = (words) => words.length >= 2;

  function shuffle(a, rng = Math.random) {
    const x = [...a];
    for (let i = x.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [x[i], x[j]] = [x[j], x[i]];
    }
    return x;
  }

  function pickWord(words, rng = Math.random, avoidId = null) {
    const list = avoidId && words.length > 1 ? words.filter((w) => w.id !== avoidId) : words;
    const total = list.reduce((s, w) => s + weight(w), 0);
    let r = rng() * total;
    for (const w of list) {
      r -= weight(w);
      if (r < 0) return w;
    }
    return list[list.length - 1];
  }

  // direction: 'de2tr' (the learned language shown), 'tr2de' (own language shown) or 'mixed' (random each time)
  function makeQuestion(words, word, direction = 'mixed', rng = Math.random) {
    const dir = direction === 'mixed' ? (rng() < 0.5 ? 'de2tr' : 'tr2de') : direction;
    const answerOf = (w) => (dir === 'de2tr' ? w.translation : w.word);
    const correct = answerOf(word);
    const seen = new Set([norm(correct)]);
    const distractors = [];
    for (const w of shuffle(words.filter((x) => x.id !== word.id), rng)) {
      const a = answerOf(w);
      if (!norm(a) || seen.has(norm(a))) continue;
      // two words can share a translation: do not offer the other one as a wrong answer
      if (dir === 'tr2de' && norm(w.translation) === norm(word.translation)) continue;
      seen.add(norm(a));
      distractors.push(a);
      if (distractors.length === 3) break;
    }
    const options = shuffle([correct, ...distractors], rng);
    return {
      dir,
      wordId: word.id,
      prompt: dir === 'de2tr' ? word.word : word.translation,
      correct,
      options,
      correctIndex: options.indexOf(correct),
    };
  }

  // ---- listening game: sentences ----
  // sentences of the language being learned. A sentence you rated hard to understand comes up more often,
  // and one you missed more often than you got it ("Again later") twice as often again.
  const listenPool = (sentences, learn = 'de') => sentences.filter((s) => (s.learn || 'de') === learn && norm(s.text));
  function listenWeight(s) {
    const missed = s.missed || 0;
    const got = s.got || 0;
    const base = s.difficulty ? WEIGHTS[s.difficulty] ?? WEIGHTS[2] : missed > 0 ? WEIGHTS[2] : WEIGHTS[1];
    return base * (missed > got ? 2 : 1);
  }
  function pickSentence(list, rng = Math.random, avoidId = null) {
    const cand = avoidId && list.length > 1 ? list.filter((s) => s.id !== avoidId) : list;
    const total = cand.reduce((a, s) => a + listenWeight(s), 0);
    let r = rng() * total;
    for (const s of cand) {
      r -= listenWeight(s);
      if (r < 0) return s;
    }
    return cand[cand.length - 1];
  }

  // ---- memory game ("Find the pairs"): word cards and meaning cards, turned face down ----
  // words: the pool of the word game. Returns a shuffled list of cards: {key, pair, side: 'w'|'t', text}
  function makeMatch(words, n = 6, rng = Math.random) {
    const chosen = [];
    const seenW = new Set();
    const seenT = new Set();
    let left = [...words];
    // hard words first in line (pickWord), and never two cards that look the same
    while (chosen.length < n && left.length) {
      const w = pickWord(left, rng);
      left = left.filter((x) => x.id !== w.id);
      if (seenW.has(norm(w.word)) || seenT.has(norm(w.translation))) continue;
      seenW.add(norm(w.word));
      seenT.add(norm(w.translation));
      chosen.push(w);
    }
    const cards = chosen.flatMap((w) => [
      { key: w.id + ':w', pair: w.id, side: 'w', text: w.word },
      { key: w.id + ':t', pair: w.id, side: 't', text: w.translation },
    ]);
    return shuffle(cards, rng);
  }
  const canMatch = (words) => makeMatch(words, 3, () => 0.5).length >= 6; // at least 3 different pairs

  // ---- "Put the words in order": a sentence cut into tiles ----
  // tokens: GSTStore.tokens(text, lang) = [{t, w}] (w = a word). Punctuation sticks to the word before it,
  // so the tiles are "Ich", "habe", "Hunger." Returns null when the sentence is too short.
  function makeBuild(tokens, rng = Math.random, maxTiles = 10, joiner = ' ') {
    let tiles = [];
    let lead = ''; // punctuation before the first word (Spanish "¿", quotes)
    for (const tk of tokens) {
      if (tk.w) { tiles.push(lead + tk.t); lead = ''; }
      else if (!tk.t.trim()) continue; // spaces
      else if (tiles.length) tiles[tiles.length - 1] += tk.t.trim();
      else lead += tk.t.trim();
    }
    if (tiles.length < 3) return null;
    // a long sentence: put two words on one tile until it is short enough
    while (tiles.length > maxTiles) {
      const merged = [];
      for (let i = 0; i < tiles.length; i += 2) merged.push(tiles.slice(i, i + 2).join(joiner)); // joiner '' for languages without spaces
      tiles = merged;
    }
    const answer = tiles.map((text, i) => ({ id: i, text }));
    // shuffle until the order is really different (gives up for sentences like "ja ja ja")
    let order = answer;
    for (let i = 0; i < 20 && order.every((x, k) => norm(x.text) === norm(answer[k].text)); i++) order = shuffle(answer, rng);
    if (order.every((x, k) => norm(x.text) === norm(answer[k].text))) return null;
    return { answer, tiles: order };
  }
  // is the order the user made right? (the same word twice may be swapped)
  const buildIsRight = (puzzle, ids) =>
    ids.length === puzzle.answer.length &&
    ids.every((id, k) => norm(puzzle.answer[id].text) === norm(puzzle.answer[k].text));

  // ---- "Fill the gap": one word of a sentence is hidden, choose it from 4 ----
  // tokens: the sentence's tokens; savedWords: the user's saved words (those are hidden first);
  // otherWords: words from other sentences, used as the wrong answers. Returns null when it does not work.
  function makeGap(tokens, savedWords, otherWords, rng = Math.random) {
    const saved = new Set(savedWords.map((w) => norm(w.word)));
    const idx = tokens.map((tk, i) => (tk.w && [...tk.t].length >= 2 ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) return null;
    const mine = idx.filter((i) => saved.has(norm(tokens[i].t)));
    let gap;
    if (mine.length) gap = mine[Math.floor(rng() * mine.length)];
    else {
      // otherwise one of the longer words (short ones like "a", "es" are too easy to guess)
      const byLen = [...idx].sort((a, b) => [...tokens[b].t].length - [...tokens[a].t].length);
      const top = byLen.slice(0, Math.max(1, Math.ceil(byLen.length / 3)));
      gap = top[Math.floor(rng() * top.length)];
    }
    const correct = tokens[gap].t;
    const inSentence = new Set(idx.map((i) => norm(tokens[i].t)));
    const len = [...correct].length;
    const seen = new Set([norm(correct)]);
    const cand = shuffle(otherWords.filter((w) => [...w].length >= 2 && !inSentence.has(norm(w))), rng)
      // words of a similar length first, so the answer does not stand out
      .sort((a, b) => Math.abs([...a].length - len) - Math.abs([...b].length - len));
    const wrong = [];
    for (const w of cand) {
      if (seen.has(norm(w))) continue;
      seen.add(norm(w));
      // same capital letter as the answer (a capital alone should not give it away)
      const first = correct[0] === correct[0].toLocaleUpperCase() && correct[0] !== correct[0].toLocaleLowerCase();
      wrong.push(first ? w[0].toLocaleUpperCase() + w.slice(1) : w[0].toLocaleLowerCase() + w.slice(1));
      if (wrong.length === 3) break;
    }
    if (!wrong.length) return null;
    const options = shuffle([correct, ...wrong], rng);
    return { gap, correct, options, correctIndex: options.indexOf(correct) };
  }

  // ---- what to practise: n different items, the harder ones more likely ----
  // A weighted draw without putting back: every item can be chosen once, an item with weight 6 is
  // six times as likely as one with weight 1. The chosen ones are shuffled, so the hard ones do not all come first.
  function pickSet(items, n, weightOf, rng = Math.random) {
    const left = [...items];
    const out = [];
    while (out.length < n && left.length) {
      const total = left.reduce((a, x) => a + weightOf(x), 0);
      let r = rng() * total;
      let k = left.length - 1;
      for (let i = 0; i < left.length; i++) {
        r -= weightOf(left[i]);
        if (r < 0) { k = i; break; }
      }
      out.push(left[k]);
      left.splice(k, 1);
    }
    return shuffle(out, rng);
  }
  const pickWords = (words, n, rng) => pickSet(words, n, weight, rng);
  const pickSentences = (sentences, n, rng) => pickSet(sentences, n, listenWeight, rng);

  // the choices for "how many?": the usual steps that are smaller than what there is, then "all"
  // (max: some games cannot show more, e.g. 10 pairs of cards)
  function countChoices(available, steps = [5, 10, 20], max = Infinity) {
    const all = Math.min(available, max);
    return [...steps.filter((x) => x < all), all];
  }
  // the choice that fits a number saved earlier: the same one, or the next bigger one, or "all"
  function countChoice(choices, saved) {
    if (choices.includes(saved)) return saved;
    return choices.find((c) => c >= saved) ?? choices[choices.length - 1];
  }

  return {
    WEIGHTS, pool, canPlay, pickWord, makeQuestion, shuffle, listenPool, listenWeight, pickSentence,
    pickSet, pickWords, pickSentences, countChoices, countChoice,
    makeMatch, canMatch, makeBuild, buildIsRight, makeGap,
  };
})();
