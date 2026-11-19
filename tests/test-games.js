// Run with: node tests/test-games.js   (checks the rules of the games)
globalThis.navigator ??= { language: 'en' };
const dir = process.argv[2] || __dirname + '/..'; require(dir + '/store.js'); require(dir + '/game.js');
const GS = globalThis.GSTStore, G = globalThis.GSTGame;
let fail = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fail++; };
const words = [['Hund','dog',3],['Katze','cat',1],['Haus','house',2],['Baum','tree',2],['laufen','to run',3],['schön','beautiful',1],['Auto','car',2]]
  .map(([w,t,d],i)=>({id:'w'+i,word:w,translation:t,lang:'en',learn:'de',difficulty:d}));
const cards = G.makeMatch(words, 6);
check('match: 12 cards, 6 pairs', cards.length === 12 && new Set(cards.map(c=>c.pair)).size === 6);
check('match: needs 3 pairs', !G.canMatch(words.slice(0,2)) && G.canMatch(words.slice(0,3)));
const tk = GS.tokens('Ich habe heute keinen Hunger, danke!', 'de');
const p = G.makeBuild(tk);
console.log('   tiles:', p.tiles.map(x=>x.text).join(' | '));
check('build: tiles keep punctuation', p.answer.map(x=>x.text).join(' ') === 'Ich habe heute keinen Hunger, danke!');
check('build: shuffled', !G.buildIsRight(p, p.tiles.map(x=>x.id)));
check('build: right order accepted', G.buildIsRight(p, p.answer.map(x=>x.id)));
const p2 = G.makeBuild(GS.tokens('¿Dónde está el baño?', 'es'));
check('build: spanish leading ¿', p2.answer[0].text === '¿Dónde' && p2.answer[3].text === 'baño?');
const long = G.makeBuild(GS.tokens('eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn', 'de'));
check('build: long sentence <= 10 tiles', long.answer.length <= 10);
check('build: too short', G.makeBuild(GS.tokens('Ja.', 'de')) === null);
const jp = G.makeBuild(GS.tokens('私は毎日日本語を勉強します。', 'ja'));
console.log('   ja tiles:', jp && jp.answer.map(x=>x.text).join(' | '));
const gtk = GS.tokens('Der Hund läuft schnell durch den Garten.', 'de');
const g = G.makeGap(gtk, words, ['Fenster','Tisch','Lampe','Stuhl','Garten','läuft'], () => 0.3);
console.log('   gap:', g);
check('gap: hides the saved word', gtk[g.gap].t === 'Hund' && g.options.length === 4 && g.options[g.correctIndex] === 'Hund');
check('gap: no option from the sentence itself', !g.options.includes('Garten') || g.correct === 'Garten');
check('gap: capitals match', g.options.every(o => o[0] === o[0].toUpperCase()));

// ---- choosing what to practise ----
let seed = 3; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const set = G.pickWords(words, 5, rng);
check('pickWords: 5 different words', set.length === 5 && new Set(set.map((w) => w.id)).size === 5);
check('pickWords: never more than there are', G.pickWords(words, 50, rng).length === words.length);
let hard = 0, easy = 0;
for (let k = 0; k < 3000; k++) { const one = G.pickWords(words, 1, rng)[0]; if (one.difficulty === 3) hard++; if (one.difficulty === 1) easy++; }
check(`pickWords: hard words chosen more often (hard ${hard}, easy ${easy})`, hard > easy * 2.5);
check('countChoices: steps below what there is, then all', JSON.stringify(G.countChoices(12)) === '[5,10,12]' && JSON.stringify(G.countChoices(3)) === '[3]' && JSON.stringify(G.countChoices(30)) === '[5,10,20,30]');
check('countChoices: with a maximum', JSON.stringify(G.countChoices(30, [4, 6, 8], 10)) === '[4,6,8,10]');
check('countChoice: a saved number that is no longer offered', G.countChoice([5, 10, 12], 10) === 10 && G.countChoice([5, 8], 10) === 8 && G.countChoice([5, 10, 12], 7) === 10);
const sents = [{ id: 'a', difficulty: 3 }, { id: 'b', difficulty: 1 }, { id: 'c' }, { id: 'd', missed: 2, got: 0 }];
check('listenWeight: hard to understand > easy; missed counts double', G.listenWeight(sents[0]) > G.listenWeight(sents[1]) && G.listenWeight(sents[3]) === 6 && G.listenWeight(sents[2]) === 1);
check('pickSentences: all different', new Set(G.pickSentences(sents, 4, rng).map((s) => s.id)).size === 4);
process.exit(fail ? 1 : 0);
