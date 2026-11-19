// Runs in the background: translation (Google's unofficial free endpoint), the interface-language
// translations, and opening the library page. Swap gtx() for DeepL etc. if you like.

async function gtx(text, sl, tl) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' +
    encodeURIComponent(sl || 'de') +
    '&tl=' +
    encodeURIComponent(tl || 'en') +
    '&dt=t&q=' +
    encodeURIComponent(text);
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return j[0].map((x) => x[0]).join('');
}

// ---- interface texts in the user's language ----
// Every English text is translated once, checked, and cached ("i18n_<language>").
const uiJobs = new Map();
const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join('|');

function uiTranslate(msg) {
  const id = msg.lang + '|' + msg.version;
  if (!uiJobs.has(id)) uiJobs.set(id, runUiTranslate(msg).finally(() => uiJobs.delete(id)));
  return uiJobs.get(id);
}

async function runUiTranslate({ lang, strings, version }) {
  const key = 'i18n_' + lang;
  const cached = (await chrome.storage.local.get(key))[key];
  if (cached && cached.v === version && cached.s) return { ok: true, strings: cached.s };

  const entries = Object.entries(strings);
  const out = {};
  const one = async ([k, en]) => {
    try {
      const tr = (await gtx(en, 'en', lang)).trim();
      // a text whose {values} got lost or changed would show broken: keep English for that one
      if (tr && placeholders(tr) === placeholders(en)) out[k] = tr;
    } catch {}
  };
  const run = async (list) => {
    let i = 0;
    await Promise.all(Array.from({ length: 6 }, async () => { while (i < list.length) await one(list[i++]); }));
  };
  await run(entries);
  const missing = entries.filter(([k]) => !(k in out));
  if (missing.length) await run(missing); // one more try for the ones that failed

  if (Object.keys(out).length < entries.length * 0.8) return { ok: false }; // too many failed: do not cache
  await chrome.storage.local.set({ [key]: { v: version, s: out } });
  return { ok: true, strings: out };
}

// the tooltip of the toolbar icon, in the user's language
async function updateActionTitle() {
  try {
    const { settings } = await chrome.storage.local.get('settings');
    const lang = (settings && settings.lang) || 'en';
    let title = 'Open my library';
    if (lang !== 'en') {
      const c = (await chrome.storage.local.get('i18n_' + lang))['i18n_' + lang];
      if (c && c.s && c.s['action.title']) title = c.s['action.title'];
    }
    await chrome.action.setTitle({ title });
  } catch {}
}
chrome.runtime.onInstalled.addListener(updateActionTitle);
chrome.runtime.onStartup.addListener(updateActionTitle);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.settings || Object.keys(changes).some((k) => k.startsWith('i18n_')))) updateActionTitle();
});

// ---- open (or focus) one of our pages: the library (app.html) or the introduction (welcome.html) ----
async function openPage(page) {
  const url = chrome.runtime.getURL(page);
  try {
    const [existing] = await chrome.tabs.query({ url });
    if (existing) {
      await chrome.tabs.update(existing.id, { active: true });
      await chrome.windows.update(existing.windowId, { focused: true });
      return;
    }
  } catch {}
  chrome.tabs.create({ url });
}
// ---- the original sound: YouTube's player on our library page ----
// YouTube's embedded player only plays when the request for it says which page it is shown on (the "Referer"
// header); without it the player shows "Error 153". Chrome sends no Referer from extension pages, so this
// rule adds one, only to player requests that come from our own pages.
const PLAYER_RULE = 1;
function allowPlayer() {
  const rule = {
    id: PLAYER_RULE,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'referer', operation: 'set', value: `https://${chrome.runtime.id}.chromiumapp.org/` }],
    },
    condition: { initiatorDomains: [chrome.runtime.id], requestDomains: ['www.youtube.com'], resourceTypes: ['sub_frame'] },
  };
  return chrome.declarativeNetRequest
    .updateDynamicRules({ removeRuleIds: [PLAYER_RULE], addRules: [rule] })
    .catch((e) => console.warn('[GST] player rule', e));
}
allowPlayer(); // every time the background starts; setting the same rule again does no harm

const openLibrary = () => openPage('app.html');
chrome.action.onClicked.addListener(openLibrary);

// right after the installation: show the short introduction (not after updates)
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') openPage('welcome.html');
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'translate') {
    gtx(msg.text, msg.sl, msg.tl)
      .then((text) => sendResponse({ text }))
      .catch((e) => sendResponse({ error: String(e) }));
    return true; // async response
  }
  if (msg.type === 'ui-translate') {
    uiTranslate(msg)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === 'open-library' || msg.type === 'open-welcome') {
    openPage(msg.type === 'open-library' ? 'app.html' : 'welcome.html').then(() => sendResponse({ ok: true }));
    return true;
  }
});
