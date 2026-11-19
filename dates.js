// Days and time windows: "which words did I save last week?"
// Plain functions without the page, so they can be tested on their own (tests/test-dates.js).
// A day is written as text 'YYYY-MM-DD' in the user's own time zone; a time window is {from, to} (both days included).
globalThis.GSTDates = (() => {
  const pad = (n) => String(n).padStart(2, '0');
  // the day of a Date (or of a time in milliseconds), in the computer's time zone
  const ymd = (d) => {
    d = d instanceof Date ? d : new Date(d);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  // 'YYYY-MM-DD' -> a Date at noon of that day (noon: a summer-time change never moves it to another day)
  const parse = (day) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  };
  const addDays = (day, n) => {
    const d = parse(day);
    d.setDate(d.getDate() + n);
    return ymd(d);
  };
  // the same day n months earlier / later; 31 March - 1 month = 28/29 February (never jumps into March)
  const addMonths = (day, n) => {
    const d = parse(day);
    const want = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(want, last));
    return ymd(d);
  };

  // the quick choices, in the order of the buttons; 'all' = no time window
  const PRESETS = ['all', 'today', 'yesterday', 'week', 'month', '3months'];
  function presetRange(id, now = new Date()) {
    const today = ymd(now);
    switch (id) {
      case 'today': return { from: today, to: today };
      case 'yesterday': { const y = addDays(today, -1); return { from: y, to: y }; }
      case 'week': return { from: addDays(today, -6), to: today }; // the last 7 days, today included
      case 'month': return { from: addDays(addMonths(today, -1), 1), to: today };
      case '3months': return { from: addDays(addMonths(today, -3), 1), to: today };
      default: return null;
    }
  }
  // the choice of the user -> {from, to}, or null for "all"
  // choice: {preset: 'week'} or {preset: 'custom', from: '2026-11-03', to: '2026-11-09'}
  function rangeOf(choice, now = new Date()) {
    if (!choice || !choice.preset || choice.preset === 'all') return null;
    if (choice.preset === 'custom') {
      if (!choice.from) return null;
      const to = choice.to || choice.from;
      return choice.from <= to ? { from: choice.from, to } : { from: to, to: choice.from }; // either order works
    }
    return presetRange(choice.preset, now);
  }
  // was an item saved inside the window? (text 'YYYY-MM-DD' can be compared like numbers)
  function inRange(savedAt, range) {
    if (!range) return true;
    if (!savedAt) return false; // very old items without a date are only in "all"
    const day = ymd(savedAt);
    return day >= range.from && day <= range.to;
  }
  const filter = (items, choice, now = new Date()) => {
    const r = rangeOf(choice, now);
    return r ? items.filter((i) => inRange(i.savedAt, r)) : items;
  };
  const isAll = (choice) => !rangeOf(choice);

  // how many items were saved on each day: Map 'YYYY-MM-DD' -> number (the dots in the calendar)
  function countByDay(items) {
    const m = new Map();
    for (const i of items) if (i.savedAt) { const d = ymd(i.savedAt); m.set(d, (m.get(d) || 0) + 1); }
    return m;
  }

  // the first day of the week where the user lives: 1 = Monday ... 7 = Sunday (Germany: Monday)
  function firstDayOf(locale) {
    try {
      const l = new Intl.Locale(locale);
      const info = typeof l.getWeekInfo === 'function' ? l.getWeekInfo() : l.weekInfo;
      if (info && info.firstDay) return info.firstDay;
    } catch {}
    return 1;
  }
  // the days of one month as 6 rows of 7, starting on firstDay; days of the months around it have inMonth = false
  function monthGrid(year, month, firstDay = 1) {
    const first = new Date(year, month, 1, 12);
    const weekday = first.getDay() || 7; // 1 = Monday ... 7 = Sunday
    const back = (weekday - firstDay + 7) % 7;
    let day = addDays(ymd(first), -back);
    const rows = [];
    for (let r = 0; r < 6; r++) {
      const row = [];
      for (let c = 0; c < 7; c++) {
        row.push({ day, inMonth: parse(day).getMonth() === month });
        day = addDays(day, 1);
      }
      rows.push(row);
    }
    return rows;
  }
  // the short names of the weekdays in the user's language, starting on firstDay
  function weekdayNames(locale, firstDay = 1) {
    const f = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const out = [];
    // 2024-01-01 was a Monday
    for (let i = 0; i < 7; i++) out.push(f.format(new Date(2024, 0, ((firstDay - 1 + i) % 7) + 1, 12)));
    return out;
  }

  // words for people: "Today", "Yesterday", "Monday, 9 November", "3 Nov – 16 Nov 2026"
  // words = {today, yesterday} in the user's language (from the text list)
  function dayName(day, locale, words, now = new Date()) {
    const today = ymd(now);
    if (day === today) return words.today;
    if (day === addDays(today, -1)) return words.yesterday;
    const sameYear = day.slice(0, 4) === today.slice(0, 4);
    return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) }).format(parse(day));
  }
  function rangeText(range, locale) {
    if (!range) return '';
    const f = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    if (range.from === range.to) return f.format(parse(range.from));
    try { return f.formatRange(parse(range.from), parse(range.to)); } catch { return f.format(parse(range.from)) + ' – ' + f.format(parse(range.to)); }
  }
  const monthTitle = (year, month, locale) => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(year, month, 1, 12));

  // the items put into groups by the day they were saved, newest day first; items without a date come last (day null)
  function groupByDay(items) {
    const groups = new Map();
    for (const i of items) {
      const d = i.savedAt ? ymd(i.savedAt) : null;
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(i);
    }
    return [...groups.entries()]
      .sort((a, b) => (a[0] === null ? 1 : b[0] === null ? -1 : a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
      .map(([day, list]) => ({ day, items: list }));
  }

  return { ymd, parse, addDays, addMonths, PRESETS, presetRange, rangeOf, inRange, filter, isAll, countByDay, firstDayOf, monthGrid, weekdayNames, dayName, rangeText, monthTitle, groupByDay };
})();
