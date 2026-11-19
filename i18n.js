// Interface texts. English is the source; every other language is the English text translated once
// (Google Translate, done by background.js) and cached in chrome.storage.local ("i18n_<language>").
// {name} marks a value that is filled in later. Keep the keys short and the English plain and simple.
globalThis.GSTI18n = (() => {
  const EN = {
    // ---- shared ----
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.smaller': 'Smaller',
    'common.bigger': 'Bigger',
    'common.other': 'Other:',
    'common.translating': 'Translating…',
    'common.translationFailed': '(translation failed)',
    'common.meaning': 'Meaning',
    'common.howHard': 'How hard is this word for you?',
    'diff.easy': '🙂 Easy',
    'diff.medium': '😐 Medium',
    'diff.hard': '😣 Hard',
    'color.white': 'White',
    'color.yellow': 'Yellow',
    'color.green': 'Green',
    'color.blue': 'Blue',
    'color.pink': 'Pink',
    'color.orange': 'Orange',
    'text.de': '{learn} text',
    'text.tr': 'Translation text',
    'action.title': 'Open my library',
    'i18n.preparing': 'Preparing your language…',
    'i18n.failed': 'Could not load your language. Showing English for now.',
    'word.to': '{word} → {lang}',
    'word.failed': 'The translation did not work. Check your internet connection, or type the meaning yourself.',
    'word.save': '✓ Save this word',
    'word.typeFirst': 'Please type the meaning first',
    'word.saved': '✓ Word saved',

    // ---- the library page ----
    'app.title': 'My {learn} Library',
    'app.heading': 'My {learn} Library',
    'app.loadFail': 'Could not load your data',
    'tabs.aria': 'Sections',
    'tab.sentences': '💬 Sentences',
    'tab.words': '🔤 Words',
    'tab.practice': '🎮 Practice',
    'tab.settings': '⚙️ Settings',

    'sent.title': 'Your saved sentences',
    'sent.emptyTitle': 'Nothing saved yet',
    'sent.step1': 'Open a {learn} video on YouTube.',
    'sent.step2': 'When you hear a sentence you want to keep, press the {key} key.',
    'sent.step3': 'Come back here and tap any word you did not understand.',
    'sent.download': '⬇ Download',
    'sent.original': '🎬 Original sound',
    'sent.voice': '🔊 Computer voice',
    'sent.hint': '👆 Tap any {learn} word you did not understand. You can then save it for the card game.',
    'sent.lookup': 'Tap to look up this word',
    'sent.watch': '▶ Watch this moment ({time})',
    'sent.delete': '🗑 Delete',
    'sent.confirmDelete': 'Delete this sentence?',
    'sent.deleted': 'Sentence deleted',
    'word.aria': 'Word',
    'word.dup': 'This word is already saved',

    'keys.title': 'Keys to use on YouTube',
    'keys.word': '👆 Click a {learn} word on the video to save it to your words.',
    'keys.drag': '🖱 Drag the black part or the translation to move the text. Right-click it, or use the ⚙ button, for its settings.',

    'words.title': 'Your saved words',
    'words.emptyTitle': 'No words yet',
    'words.emptyText': 'Go to the Sentences tab, tap a word you did not understand, then press “Save this word”.',
    'words.download': '⬇ Download',
    'words.hint': 'The harder a word is, the more often it comes up in the game.',
    'words.stats': 'Right: {right} · Wrong: {wrong}',
    'words.confirmDelete': 'Delete the word “{word}”?',
    'words.deleted': 'Word deleted',

    'prac.goSentences': 'Go to my sentences',
    'prac.intro': 'Guess the meaning of your saved words. You have {n} words. Words you rated Hard are chosen most often.',
    'prac.see': 'What do you want to see?',
    'prac.both': '🔀 Both ways',
    'prac.de2tr': '{learn} → {lang}',
    'prac.tr2de': '{lang} → {learn}',
    'prac.start': '▶ Start',
    'prac.finished': 'Finished!',
    'prac.great': '🎉 Great job!',
    'prac.good': '👍 Good, keep going!',
    'prac.keep': '💪 Keep practising, it gets easier!',
    'prac.again': '↻ Play again',
    'prac.q': 'Question {n} of {total}',
    'prac.askDe': 'What does this {learn} word mean in {lang}?',
    'prac.askTr': 'How do you say this in {learn}?',
    'prac.correct': '✓ Correct!',
    'prac.wrong': '✗ Not quite',
    'prac.answerIs': 'The answer is: {answer}',
    'prac.howHardWord': 'How hard is this word?',
    'prac.score': 'See my score',
    'prac.next': 'Next →',
    'prac.enter': 'or press Enter',
    'prac.tip': 'Tip: you can also press the keys 1, 2, 3 or 4.',

    'set.title': 'Settings',
    'set.langTitle': '🌍 My language',
    'set.langText': 'Everything is shown in this language, and the sentences and words you learn are translated into it.',
    'set.learnTitle': '📚 The language I am learning',
    'set.learnText': 'The videos you watch are in this language. The sentences and words you save are kept for it.',
    'set.learnAria': 'The language I am learning',
    'set.learnNow': 'You are now learning {learn}',
    'lib.hidden': '{n} saved items in other languages are hidden. Change the language you are learning in Settings to see them.',
    'set.langAria': 'My language',
    'set.langNow': 'Your language is now {lang}',
    'set.previewTitle': '👀 How the text looks on the video',
    'set.lenDemo': 'With this length, this long sentence is shown in {n} parts, one after another.',
    'set.previewAria': 'Preview',
    'set.customColour': 'Custom colour',
    'set.uiTitle': '🔎 Text size of this page',
    'set.filesTitle': '💾 My files',
    'set.filesText': 'Everything is stored in your browser. You can also download it: for Excel, as text, as Anki flashcards and more.',
    'set.dlSentences': '⬇ Download my sentences',
    'set.dlWords': '⬇ Download my words',
    'set.noSentences': 'No saved sentences yet',
    'set.noWords': 'No saved words yet',
    'set.reset': 'Reset settings',
    'set.confirmReset': 'Put all settings back to normal? Your saved sentences and words are kept.',
    'set.resetDone': 'Settings reset',

    // ---- audio and the listening game ----
    'audio.voiceTitle': 'Hear a computer voice read the sentence',
    'audio.noVoice': 'No {learn} computer voice is installed on this device.',
    'audio.noSpeech': 'This browser cannot read text aloud.',
    'listen.intro': 'You hear a sentence. Try to understand it, then press “Show” to check. You have {n} sentences. The ones you missed are chosen more often.',
    'listen.q': 'Sentence {n} of {total}',
    'listen.question': 'Listen. What is being said?',
    'listen.play': '▶ Listen',
    'listen.replay': '🔁 Hear it again',
    'listen.show': '👁 Show the sentence',
    'listen.got': '✓ I understood it',
    'listen.miss': '↻ Again later',
    'listen.tip': 'Keys: Enter = show, R = hear again, 1 = understood, 2 = again later.',
    'listen.result': '{got} of {total} understood',

    // ---- header, help tab, keys ----
    'app.sub': '{s} sentences · {w} words',
    'tab.help': '❓ Help',
    'tab.about': '👤 About me',
    'about.title': 'About me',
    'about.role': 'Web developer in Germany',
    'about.text': 'Hi, I am Sami. I made this extension because I learn German from YouTube videos myself.',
    'about.contact': 'Get in touch',
    'about.email': 'Email',
    'about.phone': 'Phone',
    'about.madeBy': 'This extension was made by',
    'keys.saveText': 'Save the sentence you see',
    'keys.repeatText': 'Hear the sentence again',
    'keys.prevText': 'Go to the sentence before',
    'keys.nextText': 'Go to the next sentence',
    'keys.toggleText': 'Show or hide the text',
    'keys.paused': '⏸ Tip: pause the video, then press {key}. The sentence plays once and the video stops again by itself. Press it as often as you like.',
    'keys.mouse': '🖱 No keyboard? Move the mouse over the text: buttons appear under it for the same things.',
    'help.title': 'How it works',
    'help.s1': 'Open a video',
    'help.s1Text': 'Open a YouTube video in the language you are learning. It needs subtitles in that language.',
    'help.s2': 'Read along',
    'help.s2Text': 'Each sentence appears on the video, with its translation under it.',
    'help.s3': 'Keep what you like',
    'help.s3Text': 'Press W (or the ⭐ button) to save a sentence. Click a word on the video to save the word.',
    'help.s4': 'Practise',
    'help.s4Text': 'Come back here and play the games with your sentences and words. With “📅 Saved when?” you can practise only what you saved today, this week or on the days you choose.',
    'help.intro': '👋 Show the introduction',
    'help.problems': 'Something does not work?',
    'help.p1': 'No text on the video: the video has no subtitles in the language you are learning. Try another video.',
    'help.p2': 'The text stays on “Loading”: press the CC button of the video once, or reload the page.',
    'help.p3': 'No voice in the games: your computer has no voice for this language. You can add one in your computer’s language settings.',

    // ---- games ----
    'games.title': 'Games',
    'games.intro': 'Pick a game. First you choose how many words or sentences you want to practise.',
    'games.play': '▶ Play',
    'games.back': '← All games',
    'games.cards': 'Word cards',
    'games.cardsDesc': 'See a word and choose what it means.',
    'games.match': 'Find the pairs',
    'games.matchDesc': 'Turn over two cards and find a word and its meaning.',
    'games.gap': 'Fill the gap',
    'games.gapDesc': 'Hear a sentence. One word is missing: which one?',
    'games.build': 'Put in order',
    'games.buildDesc': 'Hear a sentence, then put its words in the right order.',
    'games.listen': 'Listen',
    'games.listenDesc': 'Hear a sentence. Did you understand it?',
    'games.needWords2': 'Save 2 words first',
    'games.needWords3': 'Save 3 words first',
    'games.needSentences2': 'Save 2 sentences first',
    'games.needSentence': 'Save a sentence first',
    'match.how': 'Tap two cards. If they are a word and its meaning, they stay open.',
    'match.status': 'Pairs found: {found} of {total} · Tries: {moves}',
    'match.moves': 'You needed {moves} tries.',
    'match.hidden': 'Hidden card',
    'gap.ask': 'Which word is missing?',
    'build.ask': 'Tap the words in the right order.',
    'build.empty': 'Your sentence appears here',
    'build.hint': '💡 Help me',
    'build.listen': '🔊 Listen',
    'build.clear': '↺ Start again',
    'build.notYet': 'Not quite yet. Tap a word above to take it back.',
    'build.tip': 'Tap a word in your sentence to take it back.',

    // ---- look ----
    'set.palTitle': '🎨 Colours',
    'set.palText': 'Choose the colours you like. They are used here, in the introduction and in the menus on the video.',
    'pal.ocean': 'Ocean',
    'pal.forest': 'Forest',
    'pal.sunset': 'Sunset',
    'pal.lavender': 'Lavender',
    'pal.rose': 'Rose',
    'pal.night': 'Night',
    'pal.contrast': 'Strong contrast',
    'set.lenTitle': 'Sentence length',
    'set.lenText': 'Long sentences are cut into smaller parts. Short parts are easier to read.',
    'len.short': 'Short',
    'len.normal': 'Normal',
    'len.long': 'Long',

    // ---- buttons under the text on the video ----
    'v.btnPrev': 'Sentence before (A)',
    'v.btnAgain': 'Hear it again (S)',
    'v.btnNext': 'Next sentence (D)',
    'v.btnSave': 'Save this sentence (W)',
    'v.btnSaveShort': 'Save',
    'm.help': '❓ How does this work?',

    // ---- the introduction (welcome.html) ----
    'wz.title': 'Welcome',
    'wz.step': 'Step {n} of {total}',
    'wz.next': 'Next →',
    'wz.back': '← Back',
    'wz.skip': 'Skip',
    'wz.youtube': '▶ Open YouTube',
    'wz.d1': 'I would like a cup of coffee, please.',
    'wz.d2': 'Where is the train station?',
    'wz.d3': 'We are going to the beach tomorrow.',
    'wz.1.title': '👋 Welcome!',
    'wz.1.text': 'Learn a language with YouTube videos. Let’s set it up in a few small steps.',
    'wz.1.speak': 'My language',
    'wz.1.learn': 'The language I am learning',
    'wz.2.title': 'Two lines on every video',
    'wz.2.text': 'On top: the sentence you hear. Below: what it means in your language.',
    'wz.3.title': 'A few keys, that is all',
    'wz.3.text': 'Try it: press Space to pause, then S. The sentence plays once, then the video pauses again by itself.',
    'wz.3.space': 'Pause / play',
    'wz.3.spaceKey': 'Space',
    'wz.3.isPlaying': '▶ Playing',
    'wz.3.isPaused': '⏸ Paused',
    'wz.3.once': '🔁 Playing this sentence once …',
    'wz.3.pausedAgain': '⏸ Paused again by itself. Press S as often as you like.',
    'wz.3.w': 'Save',
    'wz.3.a': 'Before',
    'wz.3.s': 'Again',
    'wz.3.d': 'Next',
    'wz.3.again': '🔁 Playing the sentence again',
    'wz.3.mouse': '🖱 No keyboard? Move the mouse over the text on YouTube: buttons appear.',
    'wz.4.title': 'Click a word you do not know',
    'wz.4.text': 'Click any word on the video. You see what it means and you can save it.',
    'wz.4.note': 'Say how hard the word is for you. Hard words come up more often in the games.',
    'wz.5.title': 'Your library and games',
    'wz.5.text': 'Click the extension’s icon at the top of Chrome to open your library: your sentences, your words and five games.',
    'wz.5.pin': 'Tip: click the puzzle piece 🧩 at the top right of Chrome, then the pin 📌, so the icon is always there.',
    'wz.6.title': 'Make it yours',
    'wz.6.text': 'Pick your colours and the sentence length. You can change both later in Settings.',
    'wz.6.part': 'Part {n} of {total}',

    // ---- the original sound (YouTube's player on the library page) ----
    'yt.title': '🎬 Original sound',
    'yt.again': 'Play it again',
    'yt.close': 'Close',
    'yt.note': 'Only this sentence is played.',
    'yt.failed': 'This video cannot be played here. You hear the computer voice instead.',
    'yt.open': 'Open on YouTube',
    'games.sound': 'Sound of the sentences in the games',
    'games.soundVideo': '🎬 Original sound of the video',
    'games.soundVoice': '🔊 Computer voice',

    // ---- before a game: how many ----
    'setup.matchIntro': 'Find each word and its meaning. You have {n} words. Words you rated Hard are chosen most often.',
    'setup.gapIntro': 'You hear one of your sentences. One word is missing: which one? You have {n} sentences.',
    'setup.buildIntro': 'You hear one of your sentences, then you put its words in the right order. You have {n} sentences.',
    'setup.howManyWords': 'How many words do you want to practise?',
    'setup.howManySentences': 'How many sentences do you want to practise?',
    'setup.all': 'All ({n})',
    'setup.whichWords': 'Which words? (by the day you saved them)',
    'setup.whichSentences': 'Which sentences? (by the day you saved them)',
    'setup.tooFewWords': 'There are only {n} words in these days. This game needs at least {min}. Please choose more days.',
    'setup.tooFewSentences': 'There are only {n} sentences in these days. This game needs at least {min}. Please choose more days.',
    'games.onlyWindow': '📅 Only what you saved: {when}',

    // ---- days: show and practise only what was saved in some days ----
    'date.saved': '📅 Saved when?',
    'date.all': 'All',
    'date.today': 'Today',
    'date.yesterday': 'Yesterday',
    'date.week': 'Past week',
    'date.month': 'Past month',
    'date.3months': 'Past 3 months',
    'date.pick': '📅 Choose days…',
    'date.earlier': 'Earlier',
    'date.of_words': '{n} of {total} words',
    'date.of_sentences': '{n} of {total} sentences',
    'date.practise': '🎮 Practise these',
    'date.showAll': '✕ Show all',
    'date.none_words': 'No words saved in these days ({when})',
    'date.none_sentences': 'No sentences saved in these days ({when})',
    'cal.title': '📅 Which days?',
    'cal.quick': 'Quick choice',
    'cal.prev': 'Previous month',
    'cal.next': 'Next month',
    'cal.first': 'Tap the first day.',
    'cal.last': 'Now tap the last day. (Tap the same day again for just one day.)',
    'cal.nWords': '{n} words',
    'cal.nSentences': '{n} sentences',
    'cal.dotWords': 'You saved words on this day',
    'cal.dotSentences': 'You saved sentences on this day',
    'cal.showWords': '✓ Show {n} words',
    'cal.showSentences': '✓ Show {n} sentences',
    'cal.choose': 'Choose a day first',
    'cal.clear': 'Start again',
    'games.withWords': '🔤 Practise your words',
    'games.withWordsText': 'These games only use the words you saved.',
    'games.withSentences': '🎧 Train your ears with your sentences',
    'games.withSentencesText': 'These games play your saved sentences, with the sound of the video.',

    // ---- after a game: what was practised ----
    'review.titleWords': 'The {n} words you practised',
    'review.titleSentences': 'The {n} sentences you practised',
    'review.textWords': 'You can change them here: the meaning, how hard the word is, or delete it.',
    'review.textSentences': 'You can change them here: how hard the sentence is to understand, or delete it.',
    'review.right': 'Right',
    'review.wrong': 'Practise this one more',
    'review.hardToHear': 'How hard is it to understand?',
    'review.saved': '✓ Saved',
    'review.empty': 'Nothing left in this list.',

    // ---- fill the gap: listen first ----
    'gap.listenFirst': '🎧 Listen to the sentence first.',
    'gap.listening': '🔊 Listening …',
    'gap.heard': 'I heard it →',
    'gap.tip': 'The answers appear when the sentence has been played. Keys: R = hear it again, Enter = I heard it.',

    // ---- the introduction, step 2: the little video can be tried ----
    'wz.2.try': 'Try it: click the video to pause it, drag the text, and click ⚙.',
    'wz.2.size': 'Size',
    'wz.2.colour': 'Colour',
    'wz.2.saved': 'Your choice is also used on YouTube.',

    // ---- download: choose the kind of file ----
    'dl.titleSentences': 'Download my sentences ({n})',
    'dl.titleWords': 'Download my words ({n})',
    'dl.text': 'Which kind of file would you like?',
    'dl.xlsx': 'Excel table',
    'dl.xlsxText': 'Opens in Excel, Numbers or Google Sheets.',
    'dl.txt': 'Text to read or print',
    'dl.txtText': 'A simple list. Opens on every computer.',
    'dl.anki': 'Anki flashcards',
    'dl.ankiText': 'For the Anki app: File → Import.',
    'dl.csv': 'CSV table',
    'dl.csvText': 'A table as plain text, for other programs.',
    'dl.json': 'JSON data',
    'dl.jsonText': 'For programmers.',
    'dl.done': 'Saved: {name}',

    // ---- on the video ----
    'v.loading': 'Loading the {learn} transcript…',
    'v.noLearn': 'This video has no {learn} subtitles.',
    'v.failed': 'Could not load the {learn} transcript ({reason}). Try the CC button once.',
    'v.noSentence': 'No sentence to save yet',
    'v.sentenceSaved': '✓ Sentence saved',
    'v.sentenceDup': 'This sentence is already saved',
    'v.saveFailed': 'Could not save (reload the page once)',
    'v.wordUpdated': '✓ Word updated',
    'v.wordDup': 'Already in your words',
    'v.boxTip': 'Drag to move · ⚙ or right-click for settings',
    'v.wordTip': 'Click a word to save it',
    'm.title': 'Caption settings',
    'm.tip': 'Tip: drag the black part or the translation to move the text.',
    'm.translateInto': 'My language',
    'm.learn': 'The language I am learning',
    'm.reset': '↺ Put the text back in its usual place',
    'm.library': '📖 Open my library',
    'w.aria': 'Save a word',
    'w.already': '✓ Already in your words',
    'w.failed': 'The translation did not work. You can type the meaning yourself.',
    'w.update': '✓ Update this word',
  };

  const hash = (s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  };
  // changes whenever an English text changes, so old cached translations are not reused
  const VERSION = hash(JSON.stringify(EN));

  let lang = 'en';
  let dict = {};

  const raw = (key) => (dict[key] !== undefined ? dict[key] : EN[key] !== undefined ? EN[key] : key);

  // {learn} is always the name of the language being learned, written in the interface language
  let learnCode = 'de';
  const learnName = () => {
    const code = String(learnCode).split('-')[0];
    for (const l of [lang, 'en']) {
      try {
        const n = new Intl.DisplayNames([l], { type: 'language' }).of(code);
        if (n && n !== code) return n;
      } catch {}
    }
    return code;
  };
  const setLearn = (code) => { learnCode = code || 'de'; };
  // the value for {k}; at the very start of a text a language name gets a capital letter (Spanish: "alemán" -> "Alemán")
  const valueOf = (k, vars, idx) => {
    if (vars && k in vars) return vars[k];
    if (k !== 'learn') return null;
    const n = learnName();
    return idx === 0 ? n.charAt(0).toLocaleUpperCase(lang) + n.slice(1) : n;
  };
  // text with {name} values filled in
  const t = (key, vars) =>
    raw(key).replace(/\{(\w+)\}/g, (m, k, idx) => {
      const v = valueOf(k, vars, idx);
      return v === null ? m : String(v);
    });
  // same, but values may be page elements (for example a <kbd>): returns a list of strings / nodes
  const tn = (key, vars) => {
    const str = raw(key);
    const out = [];
    let last = 0;
    str.replace(/\{(\w+)\}/g, (m, k, idx) => {
      const v = valueOf(k, vars, idx);
      out.push(str.slice(last, idx), v === null ? m : v);
      last = idx + m.length;
      return m;
    });
    out.push(str.slice(last));
    return out.filter((x) => x !== '');
  };

  const getCached = (code) =>
    new Promise((res) => chrome.storage.local.get('i18n_' + code, (o) => res((o && o['i18n_' + code]) || null)));

  // Make `code` the interface language. Resolves true when its texts are ready (English is always ready).
  async function load(code) {
    lang = code || 'en';
    dict = {};
    if (lang === 'en') return true;
    const want = lang;
    let c = await getCached(want);
    if (!(c && c.v === VERSION && c.s)) {
      let res = null;
      try { res = await chrome.runtime.sendMessage({ type: 'ui-translate', lang: want, strings: EN, version: VERSION }); } catch {}
      c = res && res.ok && res.strings ? { s: res.strings } : null;
    }
    if (lang !== want) return false; // the language changed again while we were waiting
    if (!c) return false;
    dict = c.s;
    return true;
  }

  return { EN, VERSION, t, tn, load, setLearn, learnName, get lang() { return lang; } };
})();
