// Run with: node tests/test-dates.js   (checks the days and time windows of dates.js)
const dir = process.argv[2] || __dirname + '/..';
require(dir + '/dates.js');
const D = globalThis.GSTDates;
let fail = 0;
const check = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fail++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const now = new Date(2026, 10, 16, 10, 7); // Monday 16 November 2026, 10:07
const at = (y, m, d, hh = 12) => new Date(y, m - 1, d, hh).getTime();

check('ymd uses the local day', D.ymd(new Date(2026, 0, 5, 23, 59)) === '2026-01-05');
check('addDays over a month end', D.addDays('2026-10-31', 1) === '2026-11-01' && D.addDays('2026-03-01', -1) === '2026-02-28');
check('addMonths never jumps into the next month', D.addMonths('2026-03-31', -1) === '2026-02-28' && D.addMonths('2024-03-31', -1) === '2024-02-29');
check('today', eq(D.presetRange('today', now), { from: '2026-11-16', to: '2026-11-16' }));
check('yesterday', eq(D.presetRange('yesterday', now), { from: '2026-11-15', to: '2026-11-15' }));
check('past week = 7 days with today', eq(D.presetRange('week', now), { from: '2026-11-10', to: '2026-11-16' }));
check('past month', eq(D.presetRange('month', now), { from: '2026-10-17', to: '2026-11-16' }));
check('past 3 months', eq(D.presetRange('3months', now), { from: '2026-08-17', to: '2026-11-16' }));
check('all = no window', D.rangeOf({ preset: 'all' }, now) === null && D.isAll(null));
check('custom range in either order', eq(D.rangeOf({ preset: 'custom', from: '2026-11-09', to: '2026-11-03' }), { from: '2026-11-03', to: '2026-11-09' }));
check('custom with one day', eq(D.rangeOf({ preset: 'custom', from: '2026-11-03' }), { from: '2026-11-03', to: '2026-11-03' }));

const items = [
  { id: 'a', savedAt: at(2026, 11, 16, 0) },   // just after midnight today
  { id: 'b', savedAt: at(2026, 11, 15, 23) },  // late yesterday
  { id: 'c', savedAt: at(2026, 11, 10) },      // 6 days ago
  { id: 'd', savedAt: at(2026, 11, 9) },       // 7 days ago: not in "past week"
  { id: 'e', savedAt: at(2026, 9, 1) },
  { id: 'f' },                                  // very old item, no date
];
const ids = (list) => list.map((i) => i.id).join('');
check('filter today', ids(D.filter(items, { preset: 'today' }, now)) === 'a');
check('filter yesterday', ids(D.filter(items, { preset: 'yesterday' }, now)) === 'b');
check('filter past week', ids(D.filter(items, { preset: 'week' }, now)) === 'abc');
check('filter past month', ids(D.filter(items, { preset: 'month' }, now)) === 'abcd');
check('filter 3 months', ids(D.filter(items, { preset: '3months' }, now)) === 'abcde');
check('filter all keeps items without a date', ids(D.filter(items, { preset: 'all' }, now)) === 'abcdef');
check('filter custom', ids(D.filter(items, { preset: 'custom', from: '2026-11-09', to: '2026-11-15' }, now)) === 'bcd');

const counts = D.countByDay(items);
check('count by day', counts.get('2026-11-16') === 1 && counts.get('2026-11-09') === 1 && counts.size === 5);
const groups = D.groupByDay([items[5], items[2], items[0], items[3]]);
check('groups: newest day first, no date last', eq(groups.map((g) => g.day), ['2026-11-16', '2026-11-10', '2026-11-09', null]));

const grid = D.monthGrid(2026, 10, 1); // November 2026, Monday first
check('grid: 6 rows of 7', grid.length === 6 && grid.every((r) => r.length === 7));
check('grid: November 2026 starts on a Sunday (Monday first: 26 Oct ... 1 Nov)', grid[0][0].day === '2026-10-26' && grid[0][6].day === '2026-11-01' && grid[0][6].inMonth && !grid[0][5].inMonth);
const gridSun = D.monthGrid(2026, 10, 7);
check('grid with Sunday first starts on 1 Nov', gridSun[0][0].day === '2026-11-01');
check('weekday names start on Monday', D.weekdayNames('en', 1)[0] === 'Mon' && D.weekdayNames('de', 1)[6] === 'So');
check('first day of week in Germany is Monday', D.firstDayOf('de-DE') === 1);
const words = { today: 'Today', yesterday: 'Yesterday' };
check('day names', D.dayName('2026-11-16', 'en', words, now) === 'Today' && D.dayName('2026-11-15', 'en', words, now) === 'Yesterday' && D.dayName('2026-11-09', 'en-GB', words, now) === 'Monday 9 November');
check('range text', D.rangeText({ from: '2026-11-03', to: '2026-11-16' }, 'en-GB') .replace(/\s/g, '') === '3–16Nov2026');
console.log(fail ? fail + ' FAILED' : 'all passed');
process.exit(fail ? 1 : 0);
