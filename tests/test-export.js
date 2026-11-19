// Run with: node tests/test-export.js   (checks the download formats; writes the files to the folder given as 2nd argument)
const dir = process.argv[2] || __dirname + '/..';
require(dir + '/export.js');
const X = globalThis.GSTExport;
const fs = require('fs');
let fail = 0;
const check = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fail++; };

const sentences = [
  { text: 'Ich hätte gern eine Tasse Kaffee, bitte.', translation: 'I would like a cup of coffee, please.', lang: 'en', learn: 'de', videoTitle: 'Im Café – "Deutsch" lernen', url: 'https://www.youtube.com/watch?v=x&t=42s', time: 42.3, end: 45.1, savedAt: Date.UTC(2026, 10, 15) },
  { text: 'Wo ist <der> Bahnhof & wann?', translation: 'Where is the\tstation?\nSecond line', lang: 'en', learn: 'de', videoTitle: '日本語 😀', url: '', time: 95, savedAt: 0 },
];
const words = [
  { word: 'Kaffee', translation: 'coffee', lang: 'en', learn: 'de', difficulty: 1, correct: 3, wrong: 1, sentenceDe: 'Ich hätte gern eine Tasse Kaffee, bitte.', sentenceTr: '', videoTitle: 'Im Café', url: '', savedAt: Date.UTC(2026, 10, 15) },
  { word: 'Bahnhof', translation: 'train station', lang: 'en', learn: 'de', difficulty: 3 },
];

check('crc32 of "123456789" is cbf43926', X.crc32(new TextEncoder().encode('123456789')).toString(16) === 'cbf43926');
const csv = X.toCsv('sentences', sentences);
check('csv: starts with BOM and headings', csv.startsWith('﻿Sentence,Translation,'));
check('csv: commas and quotes are escaped', csv.includes('"Ich hätte gern eine Tasse Kaffee, bitte."') && csv.includes('"Im Café – ""Deutsch"" lernen"'));
const txt = X.toText('sentences', sentences);
check('text: numbered, translation under it', txt.includes('1. Ich hätte gern') && txt.includes('   I would like') && txt.includes('(Im Café – "Deutsch" lernen, 0:42)'));
const anki = X.toAnki('sentences', sentences);
check('anki: one card per line, tab between front and back', anki.split('\n')[2] === 'Ich hätte gern eine Tasse Kaffee, bitte.\tI would like a cup of coffee, please.');
check('anki: tabs and line breaks inside a field are removed', anki.split('\n')[3] === 'Wo ist <der> Bahnhof & wann?\tWhere is the station? Second line' && anki.trim().split('\n').length === 4);
check('anki words: third field is the example', X.toAnki('words', words).split('\n')[2].split('\t').length === 3);
const json = JSON.parse(X.toJson('words', words));
check('json words', json.length === 2 && json[0].word === 'Kaffee' && json[0].difficulty === 'Easy' && json[1].rightAnswers === 0);
const made = X.make('words', 'anki', words, 'de', '2026-11-15');
check('file name', made.name === 'words-de-2026-11-15.anki.txt');
const xs = X.make('sentences', 'xlsx', sentences, 'de', '2026-11-15');
check('xlsx: bytes that start like a ZIP archive', xs.data instanceof Uint8Array && xs.data[0] === 0x50 && xs.data[1] === 0x4b && xs.name.endsWith('.xlsx'));
const out = process.argv[3];
if (out) {
  fs.writeFileSync(out + '/sentences.xlsx', xs.data);
  fs.writeFileSync(out + '/words.xlsx', X.make('words', 'xlsx', words, 'de', 'x').data);
  fs.writeFileSync(out + '/sentences.csv', csv);
}
process.exit(fail ? 1 : 0);
