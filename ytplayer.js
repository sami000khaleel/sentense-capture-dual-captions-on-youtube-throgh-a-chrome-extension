// The original sound: a small YouTube player on the library page that plays exactly one sentence
// of the video it was saved from, and then stops.
// The player is YouTube's own embedded player in an <iframe>. We talk to it with messages
// (window.postMessage): "load this video at second 42", "pause". It answers with its state and time.
globalThis.GSTYt = (() => {
  const EMBED = 'https://www.youtube.com/embed/';

  let dock = null; // the little window in the corner
  let frame = null; // the <iframe> with YouTube's player in it
  let noteEl = null;
  let linkEl = null;
  let labels = { title: 'Original sound', again: 'Play again', close: 'Close', note: '', failed: 'This video cannot be played here.', open: 'Open on YouTube' };

  // the clip that is playing: {videoId, from, to, url, onError, onEnd} plus
  //   done = we have stopped it, sought = it is at the exact start, at = when we asked for it,
  //   armed = the player's reports are about this clip (and not still about the one before)
  let cur = null;
  let talking = false; // the player has answered: we can steer it with messages
  let subscribed = false; // ... and has confirmed that it reports its state and time to us
  let state = -1; // the player's state: 1 = playing, 2 = paused, 3 = loading, 0 = ended
  let time = null; // the player's time in seconds, as last reported
  let stopTimer = null;
  let helloTimer = null;

  // the video id from a link like https://www.youtube.com/watch?v=abc123&t=42s
  function idFromUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'youtu.be') return u.pathname.slice(1);
      return u.searchParams.get('v') || '';
    } catch { return ''; }
  }

  // the part of the video in which a saved sentence is spoken (null = we do not know the video or the time)
  function clipOf(s) {
    const videoId = s.videoId || idFromUrl(s.url || '');
    if (!videoId || !Number.isFinite(s.time)) return null;
    const from = Math.max(0, s.time - (s.lead ?? 0.3));
    // sentences saved before version 1.6 have no exact end: guess it from the length of the text
    const end = Number.isFinite(s.end) && s.end > s.time ? s.end : s.time + 0.6 + 0.075 * [...(s.text || '')].length;
    const to = Number.isFinite(s.stop) && s.stop > s.time ? s.stop : end + 0.15;
    return { videoId, from, to, url: s.url || `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(from)}s` };
  }

  // tell the player to do something
  function send(func, args = []) {
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' }), '*');
  }
  // "we are listening": after this the player reports its state and time to us
  function hello() {
    clearInterval(helloTimer);
    let n = 0;
    helloTimer = setInterval(() => {
      if (subscribed || !cur || ++n > 40 || !frame || !frame.contentWindow) return clearInterval(helloTimer);
      frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
    }, 250);
  }

  function setNote(text, link) {
    noteEl.textContent = text || '';
    linkEl.hidden = !link;
    if (link) linkEl.href = link;
    noteEl.parentNode.hidden = !text && !link;
  }

  // create the little window (once)
  function ensure() {
    if (dock) return;
    const el = (tag, props, ...kids) => {
      const n = document.createElement(tag);
      Object.assign(n, props);
      n.append(...kids);
      return n;
    };
    frame = el('iframe', { allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', referrerPolicy: 'strict-origin-when-cross-origin' });
    frame.addEventListener('load', hello);
    noteEl = el('span', {});
    linkEl = el('a', { target: '_blank', rel: 'noopener', hidden: true });
    dock = el('div', { id: 'ytdock', className: 'ytdock', hidden: true },
      el('div', { className: 'ythead' },
        el('span', { className: 'yttitle' }),
        el('button', { type: 'button', className: 'ytagain', onclick: () => cur && play(cur) }, '↻'),
        el('button', { type: 'button', className: 'ytclose', onclick: close }, '✕')),
      frame,
      el('div', { className: 'ytnote', hidden: true }, noteEl, ' ', linkEl));
    dock.setAttribute('role', 'region');
    document.body.append(dock);
    window.addEventListener('message', onMessage);
    applyLabels();
  }

  function applyLabels() {
    if (!dock) return;
    dock.setAttribute('aria-label', labels.title);
    dock.querySelector('.yttitle').textContent = labels.title;
    const again = dock.querySelector('.ytagain');
    again.title = labels.again;
    again.setAttribute('aria-label', labels.again);
    const x = dock.querySelector('.ytclose');
    x.title = labels.close;
    x.setAttribute('aria-label', labels.close);
    linkEl.textContent = labels.open;
  }
  // the texts of the little window, in the user's language
  function setLabels(l) {
    labels = { ...labels, ...l };
    applyLabels();
  }

  // a message from the player
  function onMessage(e) {
    if (!frame || e.source !== frame.contentWindow) return;
    let d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
    if (!d || typeof d !== 'object') return;
    if (!talking) {
      talking = true;
      send('addEventListener', ['onStateChange']);
      send('addEventListener', ['onError']);
      send('unloadModule', ['captions']); // YouTube's own subtitles would give the answer away in the games
    }
    if (d.event === 'initialDelivery' || d.event === 'infoDelivery' || d.event === 'onReady') subscribed = true;
    if (d.event === 'onError') return problem(d.info);
    if (d.event === 'onStateChange') state = d.info;
    const info = d.info && typeof d.info === 'object' ? d.info : null;
    if (info && typeof info.playerState === 'number') state = info.playerState;
    if (cur && !cur.armed) {
      // right after "play this clip" a report about the clip before may still be on its way: do not trust it
      if (performance.now() - cur.at > 300) cur.armed = true;
      else if (state !== 1) { cur.armed = true; return; } // the player has reacted; the time comes with a later report
      else return;
    }
    if (info && typeof info.currentTime === 'number') time = info.currentTime;
    watch();
  }

  // stop the player at the end of the sentence
  function watch() {
    clearTimeout(stopTimer);
    if (!cur || cur.done || state !== 1 || time === null) return;
    if (time < cur.from - 2 || time > cur.to + 2) return; // an old report from the clip before, or the user jumped away
    if (!cur.sought && time < cur.from - 0.35) {
      // the address can only say "start at second 42": go to the exact place
      cur.sought = true;
      time = null;
      return send('seekTo', [cur.from, true]);
    }
    cur.sought = true;
    const stop = () => {
      const c = cur;
      if (!c || c.done) return;
      c.done = true;
      send('pauseVideo');
      if (c.onEnd) c.onEnd(); // tell the page: the sentence has been heard
    };
    if (time >= cur.to) stop();
    else stopTimer = setTimeout(stop, (cur.to - time) * 1000); // corrected with every report of the player
  }

  // the player cannot play this video here (the owner does not allow it, the video is gone, ...)
  function problem(code) {
    console.warn('[GST] YouTube player error', code);
    const c = cur;
    if (c) c.done = true;
    setNote(labels.failed, c && c.url);
    if (c && c.onError) c.onError(code);
  }

  // play one clip: {videoId, from, to} in seconds (see clipOf);
  // opts.onError is called when it cannot be played, opts.onEnd when it has been played to its end
  function play(clip, opts = {}) {
    ensure();
    clearTimeout(stopTimer);
    cur = { ...clip, onError: opts.onError || clip.onError, onEnd: opts.onEnd, done: false, sought: false, at: performance.now(), armed: !talking };
    time = null;
    state = -1;
    dock.hidden = false;
    document.body.classList.add('yt-open'); // the page makes room for the little window (see app.css)
    setNote(labels.note);
    if (talking) {
      // the player is there already: just give it the new place
      send('loadVideoById', [{ videoId: cur.videoId, startSeconds: cur.from, endSeconds: cur.to + 1 }]);
      cur.sought = true;
      return;
    }
    const q = new URLSearchParams({
      autoplay: '1', enablejsapi: '1', playsinline: '1', rel: '0', iv_load_policy: '3',
      start: String(Math.floor(cur.from)),
      end: String(Math.ceil(cur.to + 0.5)), // a safety net: without messages the player still stops near the end
    });
    if (/^(chrome-extension|https?):$/.test(location.protocol)) q.set('origin', location.origin);
    frame.src = EMBED + encodeURIComponent(cur.videoId) + '?' + q;
  }

  // close the little window and stop the sound
  function close() {
    clearTimeout(stopTimer);
    clearInterval(helloTimer);
    cur = null;
    talking = false;
    subscribed = false;
    if (!dock) return;
    dock.hidden = true;
    document.body.classList.remove('yt-open');
    frame.src = 'about:blank';
  }

  return { clipOf, play, close, setLabels, idFromUrl, isOpen: () => !!dock && !dock.hidden };
})();
