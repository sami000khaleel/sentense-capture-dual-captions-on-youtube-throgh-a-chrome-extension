// Run with: node tests/test-timing.js   (checks how exactly a replay starts and stops)
// A speaker with known word times is simulated. The subtitles are written "by a person": lines of a few
// words that do not follow the sentences and stay on the screen after the speaker has finished them.
// Then we measure how much of the NEXT sentence a replay would play, and how much of its own it would cut off.
const dir = process.argv[2] || __dirname + '/..';
require(dir + '/sentences.js');
const { build, makeCue, stopFor, wordsOf } = globalThis.GST;
let fail = 0;
const check = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fail++; };

const TEXT = [
  'Ihre Route führt uns über Bled, einen See, in dessen Mitte ein Kloster auf einer Insel thront.',
  'Dann weiter über die Berge zum Bohinjer See.',
  'Dort wartet schon unser Boot.',
  'Der Kapitän, ein freundlicher älterer Herr, erzählt uns viel über die Geschichte der Region.',
  'Die Menschen hier leben seit Jahrhunderten vom Fischfang und von der Landwirtschaft.',
  'Am Abend erreichen wir das kleine Dorf, in dem wir die Nacht verbringen.',
  'Die Wirtin begrüßt uns herzlich.',
  'Morgen wollen wir früh aufstehen, weil der Weg zum Gipfel lang und steil ist.',
  'Das Wetter soll gut bleiben.',
  'Wir freuen uns schon sehr auf die Aussicht.',
];
// a deterministic "random" number generator, so the test always gives the same result
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// ---- the truth: when every word really starts and ends ----
// shown = false: a small word the speaker says but the subtitles leave out ("und", "ja", "also")
const truth = []; // {word, start, end, shown}
let t = 2;
for (let rep = 0; rep < 6; rep++) {
  TEXT.forEach((sentence, si) => {
    const speed = 0.055 + 0.02 * rnd(); // seconds per letter: every sentence a bit different
    const list = sentence.split(' ').map((w) => ({ word: w, shown: true }));
    if (si % 3 === 1) list.unshift({ word: 'und', shown: false });
    for (const w of list) {
      const letters = w.word.replace(/[^\p{L}]/gu, '').length;
      const start = t;
      const end = start + 0.08 + letters * speed;
      truth.push({ ...w, start, end, first: w === list.find((x) => x.shown) });
      t = end + (/[.!?]$/.test(w.word) ? 0.35 + 0.4 * rnd() : /,$/.test(w.word) ? 0.18 : 0.03);
    }
    if (si === 4) t += 3; // a break in the middle
  });
}
const shown = truth.filter((w) => w.shown);

// ---- subtitles written by a person ----
// A: lines of 6 to 9 words that appear exactly when their first word is said and stay until the next line
function linesA() {
  const lines = [];
  for (let i = 0; i < shown.length;) {
    const n = 6 + Math.floor(rnd() * 4);
    const part = shown.slice(i, i + n);
    lines.push({ start: part[0].start, lastEnd: part[part.length - 1].end, text: part.map((w) => w.word).join(' ') });
    i += n;
  }
  return lines;
}
// B: like on TV: one line per sentence, which appears 0.2 to 0.9 seconds late and stays until the next line
function linesB() {
  const lines = [];
  let cur = null;
  for (const w of shown) {
    if (w.first) { cur = { start: w.start + 0.2 + 0.7 * rnd(), text: '', lastEnd: 0 }; lines.push(cur); }
    cur.text += (cur.text ? ' ' : '') + w.word;
    cur.lastEnd = w.end;
  }
  return lines;
}
const toCues = (lines) => lines.map((c, k) => {
  const next = lines[k + 1];
  const end = next ? Math.min(next.start, c.lastEnd + 2.5) : c.lastEnd + 2;
  return makeCue(c.start * 1000, (Math.max(end, c.start + 0.5) - c.start) * 1000, [{ txt: c.text }]);
});
const cuesA = toCues(linesA());
const cuesB = toCues(linesB());

// ---- auto-captions: every spoken word with its time (40 ms early or late), no capitals, some words heard wrongly ----
const asrCues = [];
for (let i = 0; i < truth.length; i += 8) {
  const part = truth.slice(i, i + 8);
  const base = part[0].start;
  asrCues.push(makeCue(base * 1000, 4000, part.map((w, k) => ({
    txt: (k ? ' ' : '') + (rnd() < 0.08 ? 'äh' : w.word.toLowerCase().replace(/[.,]/g, '')),
    off: Math.max(0, Math.round((w.start - base + (rnd() - 0.5) * 0.08) * 1000)),
  }))));
}

// ---- measure ----
function measure(name, sentences, withStop, words = shown) {
  let leak = 0, cut = 0, early = 0, n = 0, worstLeak = 0;
  let wi = 0;
  sentences.forEach((s, i) => {
    const count = s.text.split(' ').length;
    const first = words[wi], last = words[wi + count - 1], after = words[wi + count], before = words[wi - 1];
    wi += count;
    if (!first || !last) return;
    const from = s.start - (s.lead ?? 0.3);
    const stop = withStop(sentences, i);
    const l = after ? Math.max(0, stop - after.start) : 0; // seconds of the next sentence that are played
    const e = before ? Math.max(0, before.end - from) : 0; // seconds of the sentence before that are played
    const c = Math.max(0, last.end - stop) + Math.max(0, from - first.start); // seconds of this sentence that are missing
    leak += l; cut += c; early += e; n++;
    worstLeak = Math.max(worstLeak, l);
  });
  const ms = (x) => String(Math.round((x / n) * 1000)).padStart(4);
  console.log(`   ${name.padEnd(36)} next sentence heard:${ms(leak)} ms (worst ${String(Math.round(worstLeak * 1000)).padStart(4)})   sentence before heard:${ms(early)} ms   own words cut:${ms(cut)} ms`);
  return { leak: leak / n, cut: cut / n, early: early / n, worstLeak };
}
const newStop = (ss, i) => stopFor(ss, i);
const oldStop = (ss, i) => (ss[i + 1] ? Math.max(ss[i].end, Math.min(ss[i].end + 0.25, ss[i + 1].start)) : ss[i].end + 0.25);
const big = { maxWords: 99 };
const withAsr = { maxWords: 99, words: wordsOf(asrCues) };
const newBuild = build;
let oldBuild = null;
if (process.argv[3]) { delete globalThis.GST; require(process.argv[3]); oldBuild = globalThis.GST.build; } // version 1.5.0, for comparison

console.log('A. Subtitle lines that appear exactly with the speech:');
if (oldBuild) measure('before (1.5.0)', oldBuild(cuesA, 'de', big), oldStop);
const a1 = measure('now, written subtitles only', newBuild(cuesA, 'de', big), newStop);
const a2 = measure('now, with auto-caption word times', newBuild(cuesA, 'de', withAsr), newStop);
console.log('B. Like TV subtitles: one line per sentence, appearing late:');
if (oldBuild) measure('before (1.5.0)', oldBuild(cuesB, 'de', big), oldStop);
const b1 = measure('now, written subtitles only', newBuild(cuesB, 'de', big), newStop);
const alignedB = newBuild(cuesB, 'de', withAsr);
const b2 = measure('now, with auto-caption word times', alignedB, newStop);
console.log('C. Auto-captions only:');
if (oldBuild) measure('before (1.5.0)', oldBuild(asrCues, 'de', { maxWords: 12 }), oldStop, truth);
const c1 = measure('now', newBuild(asrCues, 'de', { maxWords: 12 }), newStop, truth);

const texts = (ss) => ss.map((s) => s.text).join('|');
check('the auto-caption times change only the times, not the sentences', texts(alignedB) === texts(newBuild(cuesB, 'de', big)));
check('A with auto-caption times: next sentence under 30 ms, never over 150 ms', a2.leak < 0.03 && a2.worstLeak < 0.15);
check('B with auto-caption times: next sentence under 30 ms, never over 150 ms', b2.leak < 0.03 && b2.worstLeak < 0.15);
check('with auto-caption times: own words not cut (under 60 ms)', a2.cut < 0.06 && b2.cut < 0.06);
check('A written subtitles only: next sentence under 60 ms on average', a1.leak < 0.06);
check('C auto-captions only: next sentence under 30 ms', c1.leak < 0.03);
const k = alignedB.findIndex((s) => s.text.startsWith('Dann weiter'));
const dann = truth.find((w) => w.word === 'Dann');
console.log(`   "…${alignedB[k - 1].text.slice(-14)}" replay stops at ${stopFor(alignedB, k - 1).toFixed(2)} s;  "Dann" is really said at ${dann.start.toFixed(2)} s`);
process.exit(fail ? 1 : 0);
