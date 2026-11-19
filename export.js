// Turns the saved sentences and words into files: Excel, CSV, plain text, Anki flashcards, JSON.
// No page and no Chrome code in here, so it can be tested with Node (tests/test-export.js).
globalThis.GSTExport = (() => {
  const DIFFICULTY = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
  const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
  const clock = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  // the formats, in the order they are offered. ext = ending of the file name, mime = what kind of file it is
  const FORMATS = [
    { id: 'xlsx', icon: '📊', ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { id: 'txt', icon: '📄', ext: 'txt', mime: 'text/plain;charset=utf-8' },
    { id: 'anki', icon: '🗂️', ext: 'anki.txt', mime: 'text/plain;charset=utf-8' },
    { id: 'csv', icon: '📑', ext: 'csv', mime: 'text/csv;charset=utf-8' },
    { id: 'json', icon: '🧩', ext: 'json', mime: 'application/json' },
  ];

  // ---- the lists as tables: one row per sentence / word (used for Excel and CSV) ----
  // every column: [heading, width in Excel, value]
  const COLUMNS = {
    sentences: [
      ['Sentence', 60, (s) => s.text],
      ['Translation', 60, (s) => s.translation],
      ['Sentence language', 10, (s) => s.learn || 'de'],
      ['Translation language', 10, (s) => s.lang],
      ['Video', 40, (s) => s.videoTitle],
      ['Time', 8, (s) => clock(s.time)],
      ['Link', 50, (s) => s.url],
      ['Saved on', 12, (s) => day(s.savedAt)],
    ],
    words: [
      ['Word', 24, (w) => w.word],
      ['Translation', 30, (w) => w.translation],
      ['Word language', 10, (w) => w.learn || 'de'],
      ['Translation language', 10, (w) => w.lang],
      ['Difficulty', 10, (w) => DIFFICULTY[w.difficulty] || ''],
      ['Sentence', 60, (w) => w.sentenceDe],
      ['Sentence translation', 60, (w) => w.sentenceTr],
      ['Video', 40, (w) => w.videoTitle],
      ['Link', 50, (w) => w.url],
      ['Saved on', 12, (w) => day(w.savedAt)],
      ['Right answers', 8, (w) => w.correct || 0],
      ['Wrong answers', 8, (w) => w.wrong || 0],
    ],
  };
  // -> { head: [...], widths: [...], rows: [[cell, ...], ...] } ; a cell is a text or a number
  function table(kind, items) {
    const cols = COLUMNS[kind];
    return {
      head: cols.map((c) => c[0]),
      widths: cols.map((c) => c[1]),
      rows: items.map((it) => cols.map((c) => c[2](it) ?? '')),
    };
  }

  // ---- CSV: a table as text, cells separated by commas ----
  const csvCell = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  function toCsv(kind, items) {
    const tb = table(kind, items);
    // the invisible first character (BOM) tells Excel that the file is UTF-8 (umlauts, other alphabets)
    return '﻿' + [tb.head, ...tb.rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  // ---- plain text: easy to read and to print ----
  function toText(kind, items) {
    const out = [];
    items.forEach((it, i) => {
      if (kind === 'sentences') {
        out.push(`${i + 1}. ${it.text}`);
        if (it.translation) out.push(`   ${it.translation}`);
        if (it.videoTitle) out.push(`   (${it.videoTitle}, ${clock(it.time)})`);
      } else {
        out.push(`${it.word} = ${it.translation}`);
        if (it.sentenceDe) out.push(`   ${it.sentenceDe}`);
      }
      out.push('');
    });
    return out.join('\r\n');
  }

  // ---- Anki: one flashcard per line, front and back separated by a tab ----
  const oneLine = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  function toAnki(kind, items) {
    const lines = ['#separator:tab', '#html:false'];
    for (const it of items) {
      if (kind === 'sentences') lines.push([it.text, it.translation].map(oneLine).join('\t'));
      else lines.push([it.word, it.translation, it.sentenceDe].map(oneLine).join('\t')); // third field: the example sentence
    }
    return lines.join('\n') + '\n';
  }

  // ---- JSON: for programs ----
  const round1 = (x) => (typeof x === 'number' ? Math.round(x * 10) / 10 : null);
  function toJson(kind, items) {
    const list = kind === 'sentences'
      ? items.map((s) => ({
        sentence: s.text, sentenceLanguage: s.learn || 'de', translation: s.translation, translationLanguage: s.lang, video: s.videoTitle,
        link: s.url, timeSeconds: round1(s.time || 0), endSeconds: round1(s.end),
        savedAt: s.savedAt ? new Date(s.savedAt).toISOString() : null,
      }))
      : items.map((w) => ({
        word: w.word, wordLanguage: w.learn || 'de', translation: w.translation, translationLanguage: w.lang,
        difficulty: DIFFICULTY[w.difficulty] || null, sentence: w.sentenceDe || '', sentenceTranslation: w.sentenceTr || '',
        video: w.videoTitle || '', link: w.url || '', rightAnswers: w.correct || 0, wrongAnswers: w.wrong || 0,
        savedAt: w.savedAt ? new Date(w.savedAt).toISOString() : null,
      }));
    return JSON.stringify(list, null, 2);
  }

  // ---- Excel (.xlsx) ----
  // An .xlsx file is a ZIP archive with a few XML files in it. Both are written by hand here,
  // so no extra library is needed. The files are stored without compression, which is allowed and simple.
  const enc = new TextEncoder();
  // characters that are not allowed in XML are removed, the special ones are written as &...;
  const xml = (v) => String(v ?? '')
    .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // column 0 -> A, 25 -> Z, 26 -> AA
  const colName = (i) => {
    let s = '';
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  };

  function sheetXml(tb) {
    const cell = (v, r, c, style) => {
      const ref = colName(c) + (r + 1);
      if (typeof v === 'number') return `<c r="${ref}"${style}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    };
    const row = (cells, r, style) => `<row r="${r + 1}">${cells.map((v, c) => cell(v, r, c, style)).join('')}</row>`;
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      // the first row stays visible when scrolling
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      `<cols>${tb.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
      `<sheetData>${row(tb.head, 0, ' s="1"')}${tb.rows.map((r, i) => row(r, i + 1, '')).join('')}</sheetData>` +
      '</worksheet>';
  }

  // the fixed files every workbook needs
  const XLSX_PARTS = (sheetName) => ({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>',
    // two looks for cells: 0 = normal, 1 = bold (the headings)
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '</styleSheet>',
  });

  // CRC-32: the checksum a ZIP archive keeps for every file in it
  const CRC_TABLE = (() => {
    const tb = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tb[n] = c >>> 0;
    }
    return tb;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // files: {name: text} -> the bytes of a ZIP archive (files stored without compression)
  function zip(files) {
    const chunks = []; // the pieces of the archive, in order
    const central = []; // the table of contents at the end
    let offset = 0;
    const push = (bytes) => { chunks.push(bytes); offset += bytes.length; };
    // a header: a list of [value, number of bytes], written with the lowest byte first
    const header = (fields) => {
      const buf = new Uint8Array(fields.reduce((a, f) => a + f[1], 0));
      const view = new DataView(buf.buffer);
      let at = 0;
      for (const [value, size] of fields) {
        if (size === 2) view.setUint16(at, value, true); else view.setUint32(at, value, true);
        at += size;
      }
      return buf;
    };
    for (const [name, text] of Object.entries(files)) {
      const nameBytes = enc.encode(name);
      const data = enc.encode(text);
      const crc = crc32(data);
      const start = offset;
      // the fields both headers share: version, flags (UTF-8 names), method 0 = stored, time, date (1 Jan 2024), checksum, sizes, name length, extra length
      const shared = [[20, 2], [0x0800, 2], [0, 2], [0, 2], [0x5821, 2], [crc, 4], [data.length, 4], [data.length, 4], [nameBytes.length, 2], [0, 2]];
      push(header([[0x04034b50, 4], ...shared]));
      push(nameBytes);
      push(data);
      central.push(header([[0x02014b50, 4], [20, 2], ...shared, [0, 2], [0, 2], [0, 2], [0, 4], [start, 4]]), nameBytes);
    }
    const centralStart = offset;
    central.forEach(push);
    const count = Object.keys(files).length;
    push(header([[0x06054b50, 4], [0, 2], [0, 2], [count, 2], [count, 2], [offset - centralStart, 4], [centralStart, 4], [0, 2]]));
    const out = new Uint8Array(offset);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
  }

  function toXlsx(kind, items) {
    const files = XLSX_PARTS(kind === 'sentences' ? 'Sentences' : 'Words');
    files['xl/worksheets/sheet1.xml'] = sheetXml(table(kind, items));
    return zip(files);
  }

  // kind: 'sentences' | 'words' ; format: one of FORMATS' ids ; learn: language code and date: for the file name
  // -> { name, mime, data } ; data is a text, or bytes for Excel
  function make(kind, format, items, learn, date) {
    const f = FORMATS.find((x) => x.id === format) || FORMATS[0];
    const data = { xlsx: toXlsx, csv: toCsv, txt: toText, anki: toAnki, json: toJson }[f.id](kind, items);
    return { name: `${kind}-${learn}-${date}.${f.ext}`, mime: f.mime, data };
  }

  return { FORMATS, make, table, toCsv, toText, toAnki, toJson, toXlsx, zip, crc32 };
})();
