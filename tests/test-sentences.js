// Run with: node tests/test-sentences.js   (checks how subtitles are cut into sentences)
require((process.argv[2] || __dirname + '/..') + '/sentences.js');
const { build, makeCue } = globalThis.GST;
const wc = (t) => (t.match(/\S+/g) || []).length;
let fail = 0;
const check = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fail++; };

// 1. auto captions, no punctuation, word timing, a pause every ~9 words
const vocab = 'also ich habe gestern mit meinem freund über das wetter gesprochen und er hat gesagt dass es morgen regnen wird'.split(' ');
let t = 0, cues = [], segs = [], cueStart = 0;
for (let i = 0; i < 300; i++) {
  if (segs.length === 0) cueStart = t;
  segs.push({ txt: (segs.length ? ' ' : '') + vocab[i % vocab.length], off: Math.round((t - cueStart) * 1000) });
  t += 0.32 + (i % 9 === 8 ? 0.9 : 0);
  if (segs.length === 6) { cues.push(makeCue(cueStart * 1000, (t - cueStart) * 1000, segs)); segs = []; }
}
let out = build(cues, 'de');
check('auto captions: all <= 15 words (max ' + Math.max(...out.map((s) => wc(s.text))) + ', n=' + out.length + ')', out.every((s) => wc(s.text) <= 15));
check('auto captions: no tiny bits', out.every((s) => wc(s.text) >= 3));
check('auto captions: all words kept', out.reduce((a, s) => a + wc(s.text), 0) === 300);
check('auto captions: times increase', out.every((s, i) => i === 0 || s.start > out[i - 1].start));
console.log('   e.g.', out.slice(0, 4).map((s) => `[${s.start}-${s.end}] ${s.text}`).join('\n   '));
out = build(cues, 'de', { maxWords: 10 });
check('short setting: all <= 10', out.every((s) => wc(s.text) <= 10));

// 2. manual captions with punctuation but one huge sentence
const long = 'Ich bin gestern Abend nach der Arbeit noch schnell in den Supermarkt gegangen um Brot Milch Eier und Butter zu kaufen weil mein Kühlschrank wirklich komplett leer war und ich keine Lust hatte hungrig ins Bett zu gehen.';
const parts = long.split(' ');
cues = [];
for (let i = 0; i < parts.length; i += 7) cues.push(makeCue(i * 400, 7 * 400, [{ txt: parts.slice(i, i + 7).join(' ') }]));
cues.push(makeCue(parts.length * 400 + 500, 1500, [{ txt: 'Das war gut.' }]));
out = build(cues, 'de');
out.forEach((s) => console.log('   ', wc(s.text), s.text));
check('long manual sentence split, all <= 15', out.every((s) => wc(s.text) <= 15));
check('short sentence kept whole', out.some((s) => s.text === 'Das war gut.'));

// 3. normal sentences unchanged
cues = [makeCue(0, 2000, [{ txt: 'Wie geht es dir?' }]), makeCue(2000, 2000, [{ txt: 'Mir geht es gut, danke.' }])];
out = build(cues, 'de');
check('normal sentences unchanged', out.length === 2 && out[0].text === 'Wie geht es dir?' && out[1].text === 'Mir geht es gut, danke.');

// 4. Japanese without spaces
const ja = '今日はとても天気が良かったので友達と一緒に公園まで散歩に行ってそれからカフェでコーヒーを飲みながら長い時間話しました。';
cues = [makeCue(0, 9000, [{ txt: ja }])];
out = build(cues, 'ja');
out.forEach((s) => console.log('   ', s.text.length, s.text));
check("japanese split into parts", out.length >= 2 && out.every((s) => s.text.length <= 32));

// 5. English
cues = [makeCue(0, 12000, [{ txt: 'So what I really wanted to tell you today is that learning a language takes a lot of time but if you watch videos every day and you save the sentences you like you will get better much faster than you think.' }])];
out = build(cues, 'en');
out.forEach((s) => console.log('   ', wc(s.text), s.text));
check('english all <= 15', out.every((s) => wc(s.text) <= 15));
process.exit(fail ? 1 : 0);
