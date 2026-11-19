globalThis.GST = (() => {
  // Per language (edit these to taste):
  //  abbr  = abbreviations whose full stop does not end a sentence
  //  conj  = connectors that start a new sentence when they follow a comma
  //  and   = the word for "and", which only counts as a connector when one of the words in `next` follows
  //  month = (German) "3. März": the full stop after a number does not end the sentence
  //  prep  = prepositions: a good place to cut a long sentence is in front of one ("... | mit dem Fahrrad")
  //  art   = articles: a bad place to cut is right after one, or right after a preposition ("in den | Supermarkt")
  //  glue  = little words that tie two nouns together: no cut in front of them ("a bottle | of milk")
  // A language without an entry is simply split at sentence ends and, where long enough, at commas.
  const PROFILES = {
    de: {
      prep: 'mit|nach|für|in|im|an|am|auf|von|vom|zu|zum|zur|bei|beim|aus|über|unter|vor|seit|ohne|gegen|durch|bis|während|wegen|trotz',
      art: 'der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines|mein|meine|meinen|meinem|meiner|sein|seine|ihr|ihre|unser|unsere|kein|keine|sehr',
      abbr: 'z|B|d|h|u|a|ca|bzw|vgl|ggf|evtl|Nr|Dr|Prof|Str|inkl|bspw|sog|Tel|Abb',
      month: /^(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)(?![\p{L}])/u,
      conj: 'und|aber|oder|sondern|denn|doch|jedoch|allerdings|weil|obwohl|damit|sodass',
      and: 'und',
      next: 'ich|du|er|sie|es|wir|ihr|man|um|dann|jetzt|da|dort|hier|deshalb|deswegen|darum|so|das|dies|heute|also|natürlich|vielleicht|später|zuerst|danach|dabei|was|wie|wer|wo|wann|warum|wieso|weshalb|welche|welcher|welches|wenn|dass|ob',
    },
    en: {
      prep: 'in|on|at|to|for|with|from|by|about|after|before|into|over|under|without|during|through',
      glue: 'of',
      art: 'the|a|an|my|your|his|her|its|our|their|some|very',
      abbr: 'Mr|Mrs|Ms|Dr|Prof|St|vs|etc|Jr|Sr|Inc|Ltd|No|e\\.g|i\\.e',
      conj: 'and|but|or|so|because|although|though|while|whereas|yet|however',
      and: 'and',
      next: 'I|you|he|she|it|we|they|then|now|there|here|so|this|that|what|how|who|where|when|why|if',
    },
    es: {
      prep: 'en|a|con|por|para|sin|sobre|desde|hasta|entre',
      glue: 'de|del',
      art: 'el|la|los|las|un|una|unos|unas|mi|tu|su|del|al|muy',
      abbr: 'Sr|Sra|Srta|Dr|Dra|etc|pág|núm|Ud|Uds',
      conj: 'y|pero|o|sino|porque|aunque|mientras|así que|sin embargo',
      and: 'y',
      next: 'yo|tú|él|ella|nosotros|ellos|ellas|ahora|entonces|aquí|allí|eso|esto|qué|cómo|quién|dónde|cuándo|por qué|si',
    },
    fr: {
      prep: 'à|en|dans|avec|pour|sur|sans|chez|par|vers|depuis',
      glue: 'de|du|des',
      art: 'le|la|les|un|une|des|du|au|aux|mon|ma|mes|ton|ta|son|sa|ses|notre|votre|leur|très',
      abbr: 'M|Mme|Mlle|Dr|Pr|etc|cf|env',
      conj: 'et|mais|ou|car|donc|parce que|bien que|alors que|pourtant',
      and: 'et',
      next: 'je|tu|il|elle|on|nous|vous|ils|elles|puis|alors|ici|là|ça|ce|cela|que|comment|qui|où|quand|pourquoi|si',
    },
    it: {
      prep: 'a|in|con|per|su|da|tra|fra|senza|verso',
      glue: 'di|del|della|dei|delle',
      art: 'il|lo|la|i|gli|le|un|uno|una|del|della|al|alla|nel|nella|mio|mia|tuo|tua|suo|sua|molto',
      abbr: 'Sig|Sig\\.ra|Dott|Prof|ecc|pag',
      conj: 'e|ma|o|però|perché|anche se|mentre|quindi|tuttavia',
      and: 'e',
      next: 'io|tu|lui|lei|noi|voi|loro|poi|ora|qui|là|questo|quello|che|come|chi|dove|quando|perché|se',
    },
    pt: {
      prep: 'em|a|com|por|para|sem|sobre|desde|até|entre',
      glue: 'de|do|da|dos|das',
      art: 'o|os|as|um|uma|uns|umas|do|da|dos|das|no|na|ao|meu|minha|seu|sua|muito',
      abbr: 'Sr|Sra|Dr|Dra|etc|pág',
      conj: 'e|mas|ou|porque|embora|enquanto|então|porém|contudo',
      and: 'e',
      next: 'eu|tu|ele|ela|nós|eles|elas|então|agora|aqui|ali|isso|isto|que|como|quem|onde|quando|porque|se',
    },
    nl: {
      prep: 'in|op|aan|met|voor|naar|bij|uit|over|onder|zonder|door|tot|tijdens',
      glue: 'van',
      art: 'de|het|een|mijn|jouw|je|zijn|haar|ons|onze|hun|heel',
      abbr: 'bv|mevr|dhr|enz|bijv|nr|dr',
      conj: 'en|maar|of|want|omdat|hoewel|terwijl|dus|echter',
      and: 'en',
      next: 'ik|jij|je|hij|zij|ze|wij|we|jullie|dan|nu|hier|daar|dit|dat|wat|hoe|wie|waar|wanneer|waarom|als',
    },
  };
  const NO_SPACES = ['ja', 'zh', 'th']; // no spaces between words: clause splitting by word count makes no sense
  const baseOf = (lang) => String(lang || 'de').toLowerCase().split(/[-_]/)[0];
  const profileOf = (lang) => PROFILES[baseOf(lang)] || {};
  const U = '(?![\\p{L}\\p{M}])'; // "the word ends here" (works for letters with accents too)
  const abbrRe = (pr) => (pr.abbr ? new RegExp(`(?:^|[\\s(])(?:${pr.abbr})\\.$`, 'u') : null);

  // seeking with s / a / d lands a little BEFORE the sentence start, so the first word is not cut off:
  // LEAD_IN seconds when there is silence before the sentence, down to MIN_LEAD when the speaker does not pause
  const LEAD_IN = 0.3;
  const MIN_LEAD = 0.1;
  const EST_LEAD = 0.2; // ... but not below this when the start is only estimated (better a bit early than a cut first word)

  // ---- reading caption data ----
  const clean = (s) => String(s).replace(/\s+/g, ' ').trim();

  // segs: [{txt, off}] ; off = word offset in ms inside the cue, undefined when the format has no word timing
  function makeCue(startMs, durMs, segs) {
    const base = startMs / 1000;
    const timed = segs.some((s) => s.off !== undefined && s.off !== null);
    let raw = '';
    const parts = [];
    for (const sg of segs) {
      const txt = sg.txt || '';
      const lead = (txt.match(/^\s*/) || [''])[0];
      if (timed && txt.trim()) {
        // character position (in the cleaned text) where this word starts
        const pre = (raw + lead).replace(/\s+/g, ' ').replace(/^ /, '');
        parts.push({ pos: pre.length, start: base + (sg.off || 0) / 1000 });
      }
      raw += txt;
    }
    return { start: base, end: (startMs + (durMs || 0)) / 1000, text: clean(raw), parts };
  }

  function cuesFromJson3(data) {
    return (data.events || [])
      .filter((e) => e.segs)
      .map((e) => makeCue(e.tStartMs, e.dDurationMs, e.segs.map((s) => ({ txt: s.utf8, off: s.tOffsetMs }))))
      .filter((c) => c.text);
  }

  // ---- splitting long sentences at connectors (see PROFILES above) ----
  const MIN_WORDS = 3;
  const words = (t) => (t.match(/\S+/g) || []).length;

  // after a comma, a clause of at least this many words (up to the next comma) starts a new sentence;
  // short bits (2-3 words) and list items stay attached
  const MIN_COMMA_CLAUSE = 3;
  const MIN_COMMA_REST = 4;

  // text -> [{offset, text}] ; offset = character position of the piece in the original text
  function splitClauses(text, lang = 'de') {
    if (NO_SPACES.includes(baseOf(lang))) return [{ offset: 0, text }];
    const pr = profileOf(lang);
    const cand = new Map(); // position -> 'conj' | 'comma'
    let m;
    if (pr.conj) {
      const reComma = new RegExp(`,\\s+(?=(?:${pr.conj})${U})`, 'giu');
      while ((m = reComma.exec(text))) cand.set(m.index + m[0].length, 'conj');
    }
    if (pr.and && pr.next) {
      const reUnd = new RegExp(`\\s+(?=${pr.and}\\s+(?:${pr.next})${U})`, 'giu');
      while ((m = reUnd.exec(text))) cand.set(m.index + m[0].length, 'conj');
    }
    const reAnyComma = /,\s+(?=\S)/g;
    while ((m = reAnyComma.exec(text))) {
      const pos = m.index + m[0].length;
      if (!cand.has(pos)) cand.set(pos, 'comma');
    }

    const cuts = [];
    let last = 0;
    for (const pos of [...cand.keys()].sort((a, b) => a - b)) {
      if (pos === last) continue;
      const rest = text.slice(pos);
      // the new sentence (connector included) must have at least MIN_COMMA_REST words
      if (words(text.slice(last, pos)) < MIN_WORDS || words(rest) < MIN_COMMA_REST) continue;
      if (cand.get(pos) === 'comma') {
        const clause = rest.split(',')[0];
        if (words(clause) < MIN_COMMA_CLAUSE) continue;
        // the part before the comma must be clause-sized too, otherwise it is a list item ("..., Eier, Butter und Milch")
        const prevParts = text.slice(last, pos).replace(/,\s*$/, '').split(',');
        if (words(prevParts[prevParts.length - 1]) < MIN_COMMA_CLAUSE) continue;
      }
      cuts.push(pos);
      last = pos;
    }
    const bounds = [0, ...cuts, text.length];
    const out = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      let piece = text.slice(bounds[i], bounds[i + 1]).trim().replace(/,$/, '');
      if (!piece) continue;
      if (i > 0) piece = piece[0].toLocaleUpperCase(lang) + piece.slice(1);
      out.push({ offset: bounds[i], text: piece });
    }
    return out;
  }

  // ---- the length limit: no sentence on the screen may be longer than maxWords ----
  // A sentence can come out very long: captions without full stops, a speaker who never stops,
  // or captions that only have a full stop every few lines. Such a piece is cut in two at the best
  // place near its middle, again and again, until every part is short enough.
  const DEFAULT_MAX_WORDS = 15;
  const MIN_PART = 3; // a part must keep at least this many words
  const _wordSeg = {};
  function wordSegmenter(lang) {
    const key = baseOf(lang);
    if (!_wordSeg[key]) {
      try { _wordSeg[key] = new Intl.Segmenter(key, { granularity: 'word' }); }
      catch { _wordSeg[key] = new Intl.Segmenter('en', { granularity: 'word' }); }
    }
    return _wordSeg[key];
  }

  // piece = {text, index}; returns a list of pieces, each at most limit.maxWords long
  function splitLong(piece, limit) {
    const { maxWords, unpunctuated, cueStarts, pauseAt, lang } = limit;
    const noSpaces = NO_SPACES.includes(baseOf(lang));
    const text = piece.text;

    // the words of the piece: where each starts and ends, and how much it "weighs"
    // (one word = 1; in languages without spaces two characters count as one word)
    const ws = [];
    for (const s of wordSegmenter(lang).segment(text)) {
      if (!s.isWordLike) continue;
      ws.push({ off: s.index, end: s.index + s.segment.length, size: noSpaces ? s.segment.length / 2 : 1 });
    }
    const total = ws.reduce((a, w) => a + w.size, 0);
    if (total <= maxWords || ws.length < MIN_PART * 2) return [piece];

    // how good a place is "just before word k" for a cut (higher = better)
    const pr = profileOf(lang);
    const asSet = (list) => new Set(String(list || '').split('|').filter((c) => c && !c.includes(' ')).map((c) => c.toLowerCase()));
    const conj = asSet(pr.conj); // connectors: "und", "aber", "because", ...
    const starters = asSet(pr.next); // words that often start a clause: "ich", "you", "dass", ...
    const preps = asSet(pr.prep); // prepositions
    const arts = asSet(pr.art); // articles and other little words that belong to the word after them
    const glue = asSet(pr.glue); // "of": belongs to the word before it and the word after it
    const pauses = ws.map((w) => pauseAt(piece.index + w.off)); // the silence in front of every word, in seconds
    const score = ws.map((w, k) => {
      if (k === 0) return -Infinity;
      const prev = ws[k - 1];
      const between = text.slice(prev.end, w.off); // spaces and punctuation between the two words
      const word = text.slice(w.off, w.end).toLowerCase();
      let sc = 0;
      if (/[.!?。！？｡؟…]/.test(between)) sc += 9; // end of a sentence
      else if (/[,;:、，；：–—]|\s-\s/.test(between)) sc += 6; // comma, colon, dash
      const nextWord = ws[k + 1] ? text.slice(ws[k + 1].off, ws[k + 1].end).toLowerCase() : '';
      if (word === String(pr.and || '').toLowerCase()) {
        // "und" only starts a new part when a new clause follows ("und dann", "und ich"), not in "Brot und Milch"
        if (starters.has(nextWord)) sc += 4;
      } else if (conj.has(word)) sc += 4; // "aber", "weil", "because", ...
      else if (starters.has(word)) sc += 2; // "ich", "you", "dass", ...
      else if (preps.has(word)) sc += 2; // "mit", "for", ...: a new group of words begins
      // never between an article or preposition and its noun: "in den | kleinen Supermarkt"
      const prevWord = text.slice(prev.off, prev.end).toLowerCase();
      if (arts.has(prevWord) || preps.has(prevWord) || glue.has(prevWord)) sc -= 4;
      if (glue.has(word)) sc -= 3;
      // a pause of the speaker
      const pause = pauses[k];
      if (pause >= 0.7) sc += 7;
      else if (pause >= 0.4) sc += 4;
      else if (pause >= 0.2) sc += 2;
      if (cueStarts.has(piece.index + w.off)) sc += 3; // the captioner started a new line here
      return sc;
    });

    // prefix sums of the word sizes, so the size of any part is quick to get
    const before = [0];
    for (const w of ws) before.push(before[before.length - 1] + w.size);
    const sizeOf = (a, b) => before[b] - before[a]; // words a .. b-1

    const cuts = [];
    // without punctuation, a long silence always ends a sentence (when both sides are big enough)
    if (unpunctuated) {
      let lastCut = 0;
      for (let k = 1; k < ws.length; k++) {
        if (pauses[k] >= 1.2 && sizeOf(lastCut, k) >= MIN_PART && sizeOf(k, ws.length) >= MIN_PART) { cuts.push(k); lastCut = k; }
      }
    }
    // cut the words a .. b-1 until every part fits
    const cut = (a, b) => {
      const size = sizeOf(a, b);
      if (size <= maxWords) return;
      const half = size / 2;
      let best = -1, bestVal = -Infinity;
      for (let k = a + 1; k < b; k++) {
        if (sizeOf(a, k) < MIN_PART || sizeOf(k, b) < MIN_PART) continue;
        // a good place near the middle wins; far from the middle costs up to 8 points
        const val = score[k] - 8 * (Math.abs(sizeOf(a, k) - half) / half);
        if (val > bestVal) { bestVal = val; best = k; }
      }
      if (best < 0) return; // too short to cut safely
      cut(a, best);
      cuts.push(best);
      cut(best, b);
    };
    const fixed = [0, ...cuts, ws.length];
    for (let i = 0; i < fixed.length - 1; i++) cut(fixed[i], fixed[i + 1]);
    cuts.sort((x, y) => x - y);

    const out = [];
    const bounds = [0, ...cuts.map((k) => ws[k].off), text.length];
    for (let i = 0; i < bounds.length - 1; i++) {
      const raw = text.slice(bounds[i], bounds[i + 1]);
      const lead = raw.length - raw.trimStart().length;
      const part = raw.trim().replace(/\s*[,;:、，；：–—-]$/, ''); // no comma / dash at the end of a part
      if (part) out.push({ text: part, index: piece.index + bounds[i] + lead });
    }
    return out;
  }

  // ---- timing: when is every word spoken? ----
  // Auto-captions tell the start of every word. Captions written by a person only tell when a whole
  // line appears and disappears, and a line often stays on the screen after the speaker has finished it.
  // So for those lines the word times are estimated (spread), and, when the video also has auto-captions,
  // corrected with the real word times from there (alignMarks).

  // letters of a word (a Japanese or Chinese character counts as one, too)
  const lettersOf = (t) => Math.max(1, [...t].length);
  // how long the speaker pauses between two words, measured in "letters": more after a full stop or a comma
  function gapWeight(between) {
    if (/[.!?。！？｡؟…]/.test(between)) return 5;
    if (/[,;:、，；：–—]|\s-\s/.test(between)) return 2;
    return 0.5;
  }
  // the words of one caption line: [{off, end, len, before}] ; before = pause in front of the word (in letters)
  function lineWords(text, lang) {
    const out = [];
    let lastEnd = 0;
    for (const s of wordSegmenter(lang).segment(text)) {
      if (!s.isWordLike) continue;
      const end = s.index + s.segment.length;
      out.push({ off: s.index, end, len: lettersOf(s.segment), before: out.length ? gapWeight(text.slice(lastEnd, s.index)) : 0 });
      lastEnd = end;
    }
    return out;
  }
  const lineWeight = (ws) => ws.reduce((a, w) => a + w.len + w.before, 0);

  // seconds per letter of this speaker: taken from the lines that are spoken fastest
  // (in those the speech fills the whole line; slower lines are mostly lines that stay on the screen longer)
  function speakingRate(lines, lang) {
    const noSpaces = NO_SPACES.includes(baseOf(lang));
    const ratios = [];
    for (const l of lines) {
      const weight = lineWeight(l.ws);
      const dur = l.cue.end - l.cue.start;
      if (weight >= (noSpaces ? 5 : 12) && dur > 0.3) ratios.push(dur / weight);
    }
    ratios.sort((a, b) => a - b);
    const r = ratios.length ? ratios[Math.floor(ratios.length / 4)] : noSpaces ? 0.18 : 0.065;
    const [lo, hi] = noSpaces ? [0.08, 0.3] : [0.035, 0.11];
    return Math.min(hi, Math.max(lo, r));
  }

  // one caption line without word times -> the estimated time of each of its words
  function spread(line, rate) {
    const { cue, ws } = line;
    const weight = Math.max(1, lineWeight(ws));
    const dur = cue.end - cue.start;
    // the speech fills the line from its start, but not longer than this many letters take to say
    const speech = Math.min(dur > 0 ? dur : Infinity, weight * rate * 1.25 + 0.2);
    const unit = speech / weight;
    let at = 0;
    return ws.map((w) => {
      at += w.before;
      const start = cue.start + at * unit;
      at += w.len;
      return { off: w.off, end: w.end, len: w.len, start, spEnd: cue.start + at * unit };
    });
  }

  // the words of auto-captions with their times: [{text, start}]
  function wordsOf(cues) {
    const out = [];
    for (const c of cues) {
      const parts = c.parts && c.parts.length ? c.parts : [{ pos: 0, start: c.start }];
      parts.forEach((p, i) => {
        const text = c.text.slice(p.pos, parts[i + 1] ? parts[i + 1].pos : c.text.length);
        for (const w of text.split(/\s+/)) if (w) out.push({ text: w, start: p.start });
      });
    }
    return out;
  }

  // a word without capitals and punctuation, for comparing
  const plain = (s) => s.toLowerCase().replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]/gu, '');

  // Give the estimated words (marks) the real times of the same words in the auto-captions (aw).
  // Both texts say the same thing in the same order, but not word for word, so the longest chain of
  // equal words in the same order is searched ("longest common subsequence"). Returns false when the
  // two texts do not fit together.
  const ALIGN_WINDOW = 8; // a word is searched at most this many seconds from its estimated time
  function alignMarks(marks, full, aw) {
    const M = marks.map((m) => plain(full.slice(m.pos, m.wEnd)));
    const A = aw.map((w) => ({ n: plain(w.text), t: w.start })).filter((w) => w.n);
    if (A.length < 5) return false;
    const where = new Map(); // word -> its places in A
    A.forEach((w, j) => { if (!where.has(w.n)) where.set(w.n, []); where.get(w.n).push(j); });

    // every possible pair (word i of ours, word j of theirs): the same word, near in time,
    // and the word before or after is the same too (so a lonely "die" is not matched to a wrong "die")
    const pairs = [];
    for (let i = 0; i < M.length; i++) {
      const list = M[i] && where.get(M[i]);
      if (!list) continue;
      for (let q = list.length - 1; q >= 0; q--) {
        const j = list[q];
        const dt = A[j].t - marks[i].start;
        if (dt > ALIGN_WINDOW) continue;
        if (dt < -ALIGN_WINDOW) break;
        const inRun = (i > 0 && j > 0 && M[i - 1] === A[j - 1].n) || (i + 1 < M.length && j + 1 < A.length && M[i + 1] === A[j + 1].n);
        if (inRun) pairs.push([i, j]);
      }
    }
    // the longest chain of pairs in which both i and j grow (pairs are sorted by i, and by j downwards inside one i)
    const tails = []; // tails[k] = the pair that ends the best chain of length k+1
    const prev = new Array(pairs.length).fill(-1);
    pairs.forEach(([, j], p) => {
      let lo = 0, hi = tails.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (pairs[tails[mid]][1] < j) lo = mid + 1; else hi = mid; }
      if (lo > 0) prev[p] = tails[lo - 1];
      tails[lo] = p;
    });
    const anchors = []; // [i, real time]
    for (let p = tails.length ? tails[tails.length - 1] : -1; p >= 0; p = prev[p]) anchors.push([pairs[p][0], A[pairs[p][1]].t]);
    anchors.reverse();
    if (anchors.length < M.filter(Boolean).length * 0.4) return false; // not the same text

    // matched words get the real time; the words between two matched words keep their place between them
    const est = marks.map((m) => m.start);
    let a = 0;
    marks.forEach((m, i) => {
      while (a < anchors.length && anchors[a][0] < i) a++;
      const next = anchors[a];
      const before = anchors[a - 1];
      const dur = m.spEnd - m.start;
      if (next && next[0] === i) { m.start = next[1]; m.exact = true; }
      else if (before && next) {
        const span = est[next[0]] - est[before[0]];
        m.start = before[1] + (span > 0 ? ((est[i] - est[before[0]]) / span) * (next[1] - before[1]) : 0);
      } else if (before) m.start = Math.max(before[1], est[i] + before[1] - est[before[0]]);
      else if (next) m.start = Math.min(next[1], est[i] + next[1] - est[next[0]]);
      m.spEnd = m.start + dur;
    });
    return true;
  }

  // cues: [{start, end, text, parts?}] in seconds -> [{start, end, lead, text}]   (lang = language of the captions)
  //   start = when the first word begins, end = when the last word has been said,
  //   lead  = how much earlier a replay may start without playing the sentence before
  // opts.maxWords: the longest sentence allowed on the screen (see splitLong)
  // opts.words: the words of the auto-captions of the same video with their times (see wordsOf), if there are any
  function build(cues, lang = 'de', opts = {}) {
    const pr = profileOf(lang);
    const abbr = abbrRe(pr);
    cues = cues.filter((c) => c.text && !/^\[.*\]$/.test(c.text));
    if (!cues.length) return [];
    const noSpaces = NO_SPACES.includes(baseOf(lang));

    // one joined text, plus one "mark" per word: where the word is in the text and when it is spoken
    const timed = cues.some((c) => c.parts && c.parts.length); // auto-captions: every word has its time
    const lines = timed ? [] : cues.map((cue) => ({ cue, ws: lineWords(cue.text, lang) }));
    const rate = timed ? 0 : speakingRate(lines, lang);
    const marks = [];
    const cuePos = [];
    let full = '';
    cues.forEach((c, ci) => {
      if (full) full += ' ';
      const base = full.length;
      cuePos.push(base);
      if (timed) {
        const parts = c.parts && c.parts.length ? c.parts : [{ pos: 0, start: c.start }];
        parts.forEach((p, i) => {
          const word = c.text.slice(p.pos, parts[i + 1] ? parts[i + 1].pos : c.text.length).trimEnd();
          marks.push({ pos: base + p.pos, wEnd: base + p.pos + word.length, len: lettersOf(word), start: p.start, spEnd: 0, exact: true, line: ci });
        });
      } else {
        for (const w of spread(lines[ci], rate)) {
          marks.push({ pos: base + w.off, wEnd: base + w.end, len: w.len, start: w.start, spEnd: w.spEnd, exact: false, line: ci });
        }
      }
      full += c.text;
    });
    if (!marks.length) return [];
    if (!timed && opts.words && opts.words.length) alignMarks(marks, full, opts.words);

    // times never go backwards
    for (let k = 1; k < marks.length; k++) if (marks[k].start < marks[k - 1].start) marks[k].start = marks[k - 1].start;
    // when is a word with a real time finished? Its start + the time its letters take, at the usual speed of this speaker
    const steps = [];
    for (let k = 0; k + 1 < marks.length; k++) {
      if (marks[k].exact && marks[k + 1].exact) steps.push((marks[k + 1].start - marks[k].start) / marks[k].len);
    }
    steps.sort((a, b) => a - b);
    const [lo, hi] = noSpaces ? [0.1, 0.35] : [0.04, 0.12];
    const perLetter = Math.min(hi, Math.max(lo, steps.length ? steps[steps.length >> 1] : rate || lo));
    marks.forEach((m, k) => {
      if (m.exact) m.spEnd = m.start + 0.12 + m.len * perLetter * 1.2;
      const next = marks[k + 1];
      if (next && m.spEnd > next.start) m.spEnd = next.start; // the next word has started: this one is over
      if (m.spEnd < m.start) m.spEnd = m.start;
    });

    // the mark of the word at (or after) character `index` of `full`
    const markAt = (index) => {
      // binary search for the first mark whose word ends after index
      let lo = 0, hi = marks.length - 1, k = marks.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (marks[mid].wEnd > index) { k = mid; hi = mid - 1; } else lo = mid + 1;
      }
      return k;
    };
    // when that word starts
    const timeAt = (index) => marks[markAt(index)].start;
    // how long the speaker is silent in front of that word. Only real knowledge counts: word times from
    // auto-captions, or the gap between two caption lines (inside an estimated line there is nothing to know)
    const pauseAt = (index) => {
      const k = markAt(index);
      const m = marks[k], before = marks[k - 1];
      if (!before || !((m.exact && before.exact) || m.line !== before.line)) return 0;
      return Math.max(0, m.start - before.spEnd);
    };
    // when the last word before character `index` has been said
    const endAt = (index) => {
      let lo = 0, hi = marks.length - 1, k = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (marks[mid].pos < index) { k = mid; lo = mid + 1; } else hi = mid - 1;
      }
      return marks[k].spEnd;
    };

    let segs = [];
    const punct = (full.match(/[.!?。！？｡।؟…]/g) || []).length;
    const unpunctuated = punct < full.split(/\s+/).length / 40;
    if (unpunctuated) {
      // auto-captions without punctuation: everything is one long text for now;
      // splitLong (below) cuts it at the pauses of the speaker
      segs.push({ text: full, index: 0 });
    } else {
      let sentenceSeg;
      try { sentenceSeg = new Intl.Segmenter(lang, { granularity: 'sentence' }); } catch { sentenceSeg = new Intl.Segmenter('en', { granularity: 'sentence' }); }
      for (const s of sentenceSeg.segment(full)) {
        const text = s.segment.trim();
        if (!text) continue;
        const prev = segs[segs.length - 1];
        const joinPrev =
          prev &&
          ((abbr && abbr.test(prev.text)) ||
            (pr.month && /\d\.$/.test(prev.text) && pr.month.test(text)) ||
            /^\p{Ll}/u.test(text));
        if (joinPrev) prev.text += ' ' + text;
        else segs.push({ text, index: s.index });
      }
    }

    const cueStarts = new Set(cuePos);
    const limit = { maxWords: opts.maxWords || DEFAULT_MAX_WORDS, unpunctuated, cueStarts, pauseAt, lang };
    const pieces = segs
      .flatMap((s) => splitClauses(s.text, lang).map((p) => ({ text: p.text, index: s.index + p.offset })))
      .flatMap((p) => splitLong(p, limit)); // nothing may stay longer than maxWords

    const r2 = (x) => Math.round(x * 100) / 100;
    let last = -Infinity;
    const out = pieces.map((s) => {
      let start = timeAt(s.index);
      if (start <= last) start = last + 0.01;
      last = start;
      return { start: r2(start), text: s.text };
    });
    pieces.forEach((s, i) => {
      // the end: when the last word has been said (never later than the next sentence starts)
      let end = Math.max(out[i].start + 0.25, endAt(s.index + s.text.length));
      const next = out[i + 1];
      if (next && end > next.start) end = Math.max(out[i].start + 0.05, next.start);
      out[i].end = r2(end);
      // the lead: a replay starts a little before the first word, but not inside the sentence before
      const gap = i ? out[i].start - out[i - 1].end : LEAD_IN;
      const sure = marks[markAt(s.index)].exact; // do we really know when the first word starts?
      out[i].lead = r2(Math.min(LEAD_IN, Math.max(sure ? MIN_LEAD : EST_LEAD, gap)));
    });
    return out;
  }

  // index of the sentence that is playing at time t (-1 = before the first)
  function indexAt(ss, t) {
    let lo = 0, hi = ss.length - 1, ans = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      // a sentence counts as "current" from a moment before its lead, so that after a jump to it, it is shown at once
      if (ss[m].start - (ss[m].lead ?? LEAD_IN) - 0.05 <= t) { ans = m; lo = m + 1; } else hi = m - 1;
    }
    return ans;
  }

  // key: 's' repeat, 'a' previous, 'd' next -> time to seek to
  function targetFor(key, ss, t) {
    if (!ss.length) return null;
    const cur = indexAt(ss, t);
    let i = cur;
    if (key === 's') i = Math.max(cur, 0);
    else if (key === 'a') i = Math.max(cur - 1, 0);
    else if (key === 'd') i = Math.min(cur + 1, ss.length - 1);
    return Math.max(0, ss[i].start - (ss[i].lead ?? LEAD_IN));
  }

  // a replay of sentence i stops here: shortly after its last word, and just before the next sentence starts
  function stopFor(ss, i) {
    const s = ss[i];
    const next = ss[i + 1];
    const stop = next ? Math.min(s.end + 0.2, next.start - 0.05) : s.end + 0.2;
    return Math.max(stop, s.start + 0.2);
  }

  return { build, indexAt, targetFor, stopFor, wordsOf, makeCue, cuesFromJson3, clean, splitClauses, splitLong, PROFILES, LEAD_IN, DEFAULT_MAX_WORDS };
})();
