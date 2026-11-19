// Runs in the page context (MAIN world).
// 1) Reads the player's own caption responses (YouTube guards the caption files with tokens
//    that only the player's request carries, so we copy the response instead of re-downloading).
// 2) Switches the subtitle track of the language being learned on through the player API, retrying until the player
//    really delivers the file, then puts the player back the way it was.
// 3) When the subtitles were written by a person, also gets the automatic subtitles of the same language:
//    only those say when every single word is spoken, which makes the sentence times exact.
(() => {
  const TAG = '[GST]';
  const isTT = (u) => typeof u === 'string' && u.includes('/api/timedtext');

  // the language being learned (set by the content script when it asks for the captions)
  let want = 'de';
  // main part of a language code; old / alternative codes YouTube and Google use are mapped together
  const base = (c) => {
    c = String(c || '').toLowerCase().split(/[-_]/)[0];
    return { iw: 'he', in: 'id', nb: 'no', nn: 'no', jw: 'jv' }[c] || c;
  };
  const isWanted = (t) => !!t && base(t.languageCode) === base(want);

  // ---------- read caption responses ----------
  // what has arrived in the language being learned: subtitles written by a person (manual) and automatic ones (asr)
  const got = { manual: false, asr: false };
  let manualUrl = ''; // the address the written subtitles came from

  function onBody(url, body) {
    let lang = '', tlang = '', kind = '';
    try {
      const u = new URL(url, location.origin);
      lang = u.searchParams.get('lang') || '';
      tlang = u.searchParams.get('tlang') || '';
      kind = u.searchParams.get('kind') || '';
    } catch {}
    if (!body || !body.trim()) { console.log(TAG, 'empty caption response', lang, kind); return; }
    console.log(TAG, 'caption response', lang || '?', kind, body.length, 'chars');
    if (base(lang) === base(want) && !tlang) {
      if (kind === 'asr') got.asr = true;
      else { got.manual = true; manualUrl = url; }
    }
    window.postMessage({ source: 'gst-timedtext-body', url, body }, '*');
  }

  const origFetch = window.fetch;
  window.fetch = function (input, ...rest) {
    const p = origFetch.call(this, input, ...rest);
    try {
      const url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
      if (isTT(url)) {
        p.then((res) => res.clone().text().then((b) => onBody(url, b)).catch(() => {})).catch(() => {});
      }
    } catch {}
    return p;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      const u = String(url);
      if (isTT(u)) {
        this.addEventListener('load', () => {
          try {
            let body = '';
            if (this.responseType === '' || this.responseType === 'text') body = this.responseText;
            else if (this.responseType === 'json') body = JSON.stringify(this.response);
            else if (this.responseType === 'arraybuffer') body = new TextDecoder().decode(this.response);
            onBody(u, body);
          } catch {}
        });
      }
    } catch {}
    return origOpen.call(this, method, url, ...rest);
  };

  // The automatic subtitles have the same address as the written ones, with "kind=asr" added.
  // Asking for them directly is quick and changes nothing in the player; if YouTube does not answer,
  // the track is switched in the player instead (see step below).
  function fetchAsrDirect() {
    try {
      const u = new URL(manualUrl, location.origin);
      u.searchParams.set('kind', 'asr');
      u.searchParams.delete('name');
      const url = u.toString();
      origFetch.call(window, url).then((res) => (res.ok ? res.text() : '')).then((b) => onBody(url, b)).catch(() => {});
    } catch {}
  }

  // ---------- switch the track of the language being learned on ----------
  const player = () => document.getElementById('movie_player');

  let running = false;
  let runId = 0;
  let touched = false;
  let prevTrack = null;
  let wasOn = false;

  function trackList(p) {
    let list = [];
    try { list = p.getOption('captions', 'tracklist', { includeAsr: true }) || []; } catch {}
    if (!list.length) { try { list = p.getOption('captions', 'tracklist') || []; } catch {} }
    return list;
  }

  function restore() {
    if (!touched) return;
    touched = false;
    const p = player();
    if (!p) return;
    try {
      if (wasOn && prevTrack) p.setOption('captions', 'track', prevTrack);
      else {
        p.setOption('captions', 'track', {});
        if (p.unloadModule) p.unloadModule('captions');
      }
    } catch {}
  }

  function finish(ok, reason) {
    if (!running) return;
    running = false;
    runId++;
    restore();
    console.log(TAG, 'caption switch finished', ok ? 'ok' : 'failed: ' + reason);
    if (!ok) window.postMessage({ source: 'gst-captions-result', ok: false, reason }, '*');
  }

  function start() {
    if (running) { window.postMessage({ source: 'gst-captions-result', stage: 'started' }, '*'); return; }
    running = true;
    const id = ++runId;
    got.manual = got.asr = false;
    manualUrl = '';
    touched = false;
    let attempt = 0;
    let tries = 0;
    let lastSet = 0;
    let extraSince = 0; // the attempt at which the search for the automatic subtitles began
    let reason = 'no-player';
    window.postMessage({ source: 'gst-captions-result', stage: 'started' }, '*');

    const step = () => {
      if (id !== runId || !running) return;
      const haveText = got.manual || got.asr;
      if (++attempt > 60) return haveText ? finish(true) : finish(false, reason === 'ok' ? 'no-response' : reason);

      const p = player();
      if (!p || typeof p.getOption !== 'function') { reason = 'no-player'; return setTimeout(step, 1000); }
      try {
        if (p.loadModule) p.loadModule('captions');
        const list = trackList(p);
        if (!list.length) { reason = 'no-tracklist'; return setTimeout(step, 1000); }
        const manual = list.find((t) => isWanted(t) && t.kind !== 'asr');
        const asr = list.find((t) => isWanted(t) && t.kind === 'asr');
        if (!manual && !asr) return finish(false, 'no-language');

        // what is still missing? First the text (written by a person, if there is one),
        // then the automatic subtitles for the word times
        let target;
        if (manual && !got.manual) target = manual;
        else if (asr && !got.asr) {
          target = asr;
          if (manual) {
            if (!extraSince) {
              // the text is there: first ask for the word times directly, and give that two seconds
              extraSince = attempt;
              tries = 0;
              lastSet = Date.now() - 1500;
              fetchAsrDirect();
            }
            if (attempt - extraSince > 14) return finish(true); // no word times: the text alone has to do
          }
        } else return finish(true);

        const cur = p.getOption('captions', 'track');
        if (!touched) {
          prevTrack = cur;
          wasOn = !!(cur && cur.languageCode);
          touched = true;
        }
        reason = 'no-response';

        if (Date.now() - lastSet > 3500) {
          lastSet = Date.now();
          // alternate between the exact track object and a minimal one
          const minimal = { languageCode: target.languageCode };
          if (target.kind) minimal.kind = target.kind;
          const wanted = tries % 2 === 0 ? target : minimal;
          console.log(TAG, 'switching track to', target.languageCode, target.kind || '', 'try', tries + 1);
          if (isWanted(cur) || tries > 0) {
            // make the player request the file again
            p.setOption('captions', 'track', {});
            setTimeout(() => { try { p.setOption('captions', 'track', wanted); } catch {} }, 300);
          } else {
            p.setOption('captions', 'track', wanted);
          }
          tries++;
        }
      } catch (e) {
        console.warn(TAG, 'player API error', e);
      }
      setTimeout(step, 1000);
    };
    step();
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const s = e.data && e.data.source;
    if (s === 'gst-enable-captions') {
      const l = e.data.lang || 'de';
      // another language than before: stop the old run and start again for the new one
      if (running && base(l) !== base(want)) finish(true);
      want = l;
      start();
    }
    else if (s === 'gst-cancel-captions') finish(true);
  });
})();
