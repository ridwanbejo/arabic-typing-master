(function (global) {
  'use strict';

  const CSV_PATH = 'assets/data/oddadmix_english-arabic-translation.csv';
  const CREDITS_PATH = 'CREDITS.md';

  let dataset = null;
  let creditsLoaded = false;
  let phaserScene = null;
  let lastConfig = null;
  let isComposing = false;
  let practiceMode = 'ar-to-en'; // 'ar-to-en' | 'en-to-ar'

  const el = {
    gameContainer: document.getElementById('game-container'),
    configOverlay: document.getElementById('config-overlay'),
    resultsOverlay: document.getElementById('results-overlay'),
    creditsOverlay: document.getElementById('credits-overlay'),
    creditsContent: document.getElementById('credits-content'),
    btnOpenCredits: document.getElementById('btn-open-credits'),
    btnResultsCredits: document.getElementById('btn-results-credits'),
    btnCloseCredits: document.getElementById('btn-close-credits'),
    btnCloseCreditsX: document.getElementById('btn-close-credits-x'),
    datasetLoading: document.getElementById('dataset-loading'),
    configForm: document.getElementById('config-form'),
    scriptNote: document.getElementById('script-note'),
    poolSummary: document.getElementById('pool-summary'),
    btnStartGame: document.getElementById('btn-start-game'),

    modeDescNote: document.getElementById('mode-desc-note'),
    btnModeAr: document.getElementById('btn-mode-ar'),
    btnModeEn: document.getElementById('btn-mode-en'),
    btnConfigModeToggle: document.getElementById('btn-config-mode-toggle'),
    easinessSectionLabel: document.getElementById('easiness-section-label'),
    diffEasySub: document.getElementById('diff-easy-sub'),
    diffMediumSub: document.getElementById('diff-medium-sub'),
    diffHardSub: document.getElementById('diff-hard-sub'),
    diffAllSub: document.getElementById('diff-all-sub'),

    wordCountRange: document.getElementById('word-count-range'),
    wordCountNumber: document.getElementById('word-count-number'),
    gameTimeRange: document.getElementById('game-time-range'),
    gameTimeDisplay: document.getElementById('game-time-display'),

    imeDock: document.getElementById('ime-dock'),
    imeInput: document.getElementById('ime-input'),
    imeStatusBadge: document.getElementById('ime-status-badge'),
    imeHintText: document.getElementById('ime-hint-text'),
    btnToggleMode: document.getElementById('btn-toggle-mode'),
    btnToggleModeLabel: document.getElementById('btn-toggle-mode-label'),
    btnQuitGame: document.getElementById('btn-quit-game'),

    resultsBadge: document.getElementById('results-badge'),
    resultsTitle: document.getElementById('results-title'),
    resultsSubtitle: document.getElementById('results-subtitle'),
    resScore: document.getElementById('res-score'),
    resWpm: document.getElementById('res-wpm'),
    resCleared: document.getElementById('res-cleared'),
    resTime: document.getElementById('res-time'),
    resAccuracy: document.getElementById('res-accuracy'),
    resMistakes: document.getElementById('res-mistakes'),
    btnPlayAgain: document.getElementById('btn-play-again'),
    btnBackConfig: document.getElementById('btn-back-config'),
  };

  function getDefaultHintHtml(mode) {
    if (mode === 'en-to-ar') {
      return 'Type the highlighted bottom row in <strong>English</strong>, then press <strong>Enter</strong>.';
    }
    return 'Type the highlighted bottom row in <strong>Arabic</strong> (RTL), then press <strong>Enter</strong>.';
  }

  function initPhaser() {
    global.onPhaserSceneReady = (scene) => {
      phaserScene = scene;
      updatePoolPreview();
    };

    new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-container',
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#1d0f06',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [global.ArabicGameScene],
    });
  }

  function applyPracticeModeUI(mode) {
    practiceMode = mode === 'en-to-ar' ? 'en-to-ar' : 'ar-to-en';
    const isEnMode = practiceMode === 'en-to-ar';

    // Update pre-game config toggle UI
    el.btnModeAr.classList.toggle('active', !isEnMode);
    el.btnModeAr.setAttribute('aria-pressed', String(!isEnMode));
    el.btnModeEn.classList.toggle('active', isEnMode);
    el.btnModeEn.setAttribute('aria-pressed', String(isEnMode));
    el.btnConfigModeToggle.setAttribute('aria-checked', String(isEnMode));

    el.modeDescNote.textContent = isEnMode
      ? 'Type English blocks (LTR) with Arabic translation & syllable minimap'
      : 'Type Arabic blocks (RTL) with English translation & syllable minimap';

    const ranges = global.ArabicVocabLoader.getEasinessRanges(practiceMode);
    el.easinessSectionLabel.textContent = isEnMode
      ? '4. Easiness (English Letters per Word)'
      : '4. Easiness (Arabic Letters per Word)';
    el.diffEasySub.textContent = ranges.easy.label;
    el.diffMediumSub.textContent = ranges.medium.label;
    el.diffHardSub.textContent = ranges.hard.label;
    el.diffAllSub.textContent = ranges.all.label;

    // Update in-game IME dock UI
    el.imeDock.classList.toggle('mode-en', isEnMode);
    el.imeDock.classList.remove('script-warn');
    el.imeInput.setAttribute('dir', isEnMode ? 'ltr' : 'rtl');
    el.imeInput.setAttribute('lang', isEnMode ? 'en' : 'ar');
    el.imeInput.placeholder = isEnMode
      ? 'Type the English word and press Enter...'
      : 'اكتب الكلمة العربية ثم اضغط Enter...';
    el.imeStatusBadge.textContent = isEnMode ? 'ENGLISH' : 'ARABIC';
    el.imeHintText.innerHTML = getDefaultHintHtml(practiceMode);
    el.btnToggleModeLabel.textContent = isEnMode ? 'EN → AR' : 'AR → EN';
  }

  function togglePracticeMode() {
    const nextMode = practiceMode === 'ar-to-en' ? 'en-to-ar' : 'ar-to-en';
    applyPracticeModeUI(nextMode);

    if (lastConfig) {
      lastConfig.practiceMode = nextMode;
    }

    if (phaserScene && phaserScene.isPlaying) {
      phaserScene.setPracticeMode(nextMode);
      el.imeInput.value = '';
      updateImeInputWarning();
      requestAnimationFrame(() => el.imeInput.focus());
    } else {
      updatePoolPreview();
    }
  }

  function readConfig() {
    const rawCount = parseInt(el.wordCountNumber.value, 10);
    const wordCount = Number.isFinite(rawCount) ? Math.min(200, Math.max(10, rawCount)) : 30;

    const scriptInput = document.querySelector('input[name="script-mode"]:checked');
    const scriptMode = scriptInput ? scriptInput.value : 'all';

    const easinessInput = document.querySelector('input[name="easiness"]:checked');
    const easiness = easinessInput ? easinessInput.value : 'easy';

    const rawMinutes = parseInt(el.gameTimeRange.value, 10);
    const minutes = Number.isFinite(rawMinutes) ? Math.min(5, Math.max(1, rawMinutes)) : 2;

    return {
      practiceMode,
      wordCount,
      scriptMode,
      easiness,
      minutes,
    };
  }

  function updatePoolPreview() {
    if (!dataset) return;

    const cfg = readConfig();
    el.poolSummary.classList.remove('warn', 'empty');

    const filtered = global.ArabicVocabLoader.filterWords(dataset.items, cfg);
    const usable = Math.min(cfg.wordCount, filtered.length);

    if (filtered.length === 0) {
      el.poolSummary.classList.add('empty');
      el.poolSummary.innerHTML = 'Matching words: <strong>0</strong> — adjust your filter or easiness.';
      el.btnStartGame.disabled = true;
      return;
    }

    const sample = global.ArabicVocabLoader.sampleWords(filtered, 2);
    const chips = sample
      .map((w) => {
        if (cfg.practiceMode === 'en-to-ar') {
          return `<span class="sample-chip"><span>${escapeHtml(w.english)}</span> <small class="arabic-font" dir="rtl">(${escapeHtml(w.arabic)})</small></span>`;
        }
        return `<span class="sample-chip"><span class="arabic-font" dir="rtl">${escapeHtml(w.arabic)}</span> <small>(${escapeHtml(w.english)})</small></span>`;
      })
      .join(' ');

    if (filtered.length < cfg.wordCount) {
      el.poolSummary.classList.add('warn');
      el.poolSummary.innerHTML =
        `Pool: <strong>${filtered.length}</strong> words (using all <strong>${usable}</strong>) ${chips}`;
    } else {
      el.poolSummary.innerHTML =
        `Pool: <strong>${filtered.length.toLocaleString()}</strong> words (sampling <strong>${usable}</strong>) ${chips}`;
    }

    el.btnStartGame.disabled = !phaserScene;
  }

  function startGameWithConfig(cfg) {
    if (!dataset || !phaserScene) return;

    const pool = global.ArabicVocabLoader.filterWords(dataset.items, cfg);
    const sampled = global.ArabicVocabLoader.sampleWords(pool, cfg.wordCount);
    if (sampled.length === 0) return;

    lastConfig = Object.assign({}, cfg);
    applyPracticeModeUI(cfg.practiceMode);

    el.configOverlay.classList.add('hidden');
    el.resultsOverlay.classList.add('hidden');
    el.imeDock.classList.remove('hidden', 'composing', 'script-warn', 'error-flash', 'success-flash');

    el.imeInput.value = '';
    el.imeInput.disabled = false;
    isComposing = false;

    phaserScene.startSession(sampled, cfg, {
      onGameOver: handleGameOver,
    });

    requestAnimationFrame(() => {
      el.imeInput.focus();
    });
  }

  function handleGameOver(stats) {
    el.imeInput.disabled = true;
    el.imeDock.classList.add('hidden');

    const modeLabel = stats.practiceMode === 'en-to-ar' ? 'English (AR translation)' : 'Arabic (EN translation)';

    el.resultsBadge.classList.remove('victory');
    if (stats.reason === 'completed') {
      el.resultsBadge.textContent = 'ALL WORDS CLEARED';
      el.resultsBadge.classList.add('victory');
      el.resultsTitle.textContent = 'Outstanding!';
      el.resultsSubtitle.textContent = `You cleared all ${stats.totalWords} words in ${modeLabel} mode before time ran out.`;
    } else if (stats.reason === 'quit') {
      el.resultsBadge.textContent = 'SESSION ENDED';
      el.resultsTitle.textContent = 'Session Summary';
      el.resultsSubtitle.textContent = `Session ended early (${modeLabel}).`;
    } else {
      el.resultsBadge.textContent = "TIME'S UP";
      el.resultsTitle.textContent = 'Session Complete';
      el.resultsSubtitle.textContent = `Here is your ${modeLabel} typing performance.`;
    }

    const mins = Math.floor(stats.elapsedSeconds / 60);
    const secs = Math.floor(stats.elapsedSeconds % 60);

    el.resScore.textContent = String(stats.score);
    el.resWpm.textContent = stats.wpm.toFixed(1);
    el.resCleared.textContent = `${stats.wordsCleared} / ${stats.totalWords}`;
    el.resTime.textContent = `${mins}:${String(secs).padStart(2, '0')} elapsed`;
    el.resAccuracy.textContent = `${stats.accuracy}%`;
    el.resMistakes.textContent = `${stats.mistakes} ${stats.mistakes === 1 ? 'mistake' : 'mistakes'}`;

    el.resultsOverlay.classList.remove('hidden');
  }

  function flashImeDock(cls) {
    el.imeDock.classList.remove('error-flash', 'success-flash');
    void el.imeDock.offsetWidth;
    el.imeDock.classList.add(cls);
    setTimeout(() => el.imeDock.classList.remove(cls), 360);
  }

  function updateImeInputWarning() {
    const val = el.imeInput.value || '';
    const isEnMode = practiceMode === 'en-to-ar';

    if (!isComposing && !isEnMode && /[A-Za-z]/.test(val)) {
      el.imeDock.classList.add('script-warn');
      el.imeStatusBadge.textContent = 'CHECK IME';
      el.imeHintText.innerHTML =
        'Latin letters detected — switch keyboard to <strong>Arabic</strong> or toggle to <strong>EN → AR</strong>.';
    } else if (!isComposing && isEnMode && /[\u0600-\u06FF]/.test(val)) {
      el.imeDock.classList.add('script-warn');
      el.imeStatusBadge.textContent = 'CHECK IME';
      el.imeHintText.innerHTML =
        'Arabic letters detected — switch keyboard to <strong>English</strong> or toggle to <strong>AR → EN</strong>.';
    } else if (!isComposing) {
      el.imeDock.classList.remove('script-warn');
      el.imeStatusBadge.textContent = isEnMode ? 'ENGLISH' : 'ARABIC';
      el.imeHintText.innerHTML = getDefaultHintHtml(practiceMode);
    }
  }

  function bindEvents() {
    // Practice direction toggles (config modal + live in-game dock)
    el.btnModeAr.addEventListener('click', () => {
      if (practiceMode !== 'ar-to-en') {
        applyPracticeModeUI('ar-to-en');
        updatePoolPreview();
      }
    });

    el.btnModeEn.addEventListener('click', () => {
      if (practiceMode !== 'en-to-ar') {
        applyPracticeModeUI('en-to-ar');
        updatePoolPreview();
      }
    });

    el.btnConfigModeToggle.addEventListener('click', togglePracticeMode);
    el.btnToggleMode.addEventListener('click', togglePracticeMode);

    // Live pool recalculation on any filter change
    document
      .querySelectorAll('input[name="script-mode"], input[name="easiness"]')
      .forEach((input) => input.addEventListener('change', updatePoolPreview));

    // Sync word count slider & numeric input (10..200)
    el.wordCountRange.addEventListener('input', () => {
      el.wordCountNumber.value = el.wordCountRange.value;
      updatePoolPreview();
    });

    el.wordCountNumber.addEventListener('input', () => {
      const val = parseInt(el.wordCountNumber.value, 10);
      if (Number.isFinite(val)) {
        const clamped = Math.min(200, Math.max(10, val));
        el.wordCountRange.value = String(clamped);
      }
      updatePoolPreview();
    });

    el.wordCountNumber.addEventListener('blur', () => {
      const val = parseInt(el.wordCountNumber.value, 10);
      const clamped = Number.isFinite(val) ? Math.min(200, Math.max(10, val)) : 30;
      el.wordCountNumber.value = String(clamped);
      el.wordCountRange.value = String(clamped);
      updatePoolPreview();
    });

    // Game time slider (1..5 min)
    el.gameTimeRange.addEventListener('input', () => {
      const mins = el.gameTimeRange.value;
      el.gameTimeDisplay.textContent = `${mins} min`;
    });

    // Submit config form
    el.configForm.addEventListener('submit', (e) => {
      e.preventDefault();
      startGameWithConfig(readConfig());
    });

    // IME composition events
    el.imeInput.addEventListener('compositionstart', () => {
      isComposing = true;
      el.imeDock.classList.add('composing');
      el.imeDock.classList.remove('script-warn');
      el.imeStatusBadge.textContent = 'IME ACTIVE';
    });

    el.imeInput.addEventListener('compositionend', () => {
      isComposing = false;
      el.imeDock.classList.remove('composing');
      updateImeInputWarning();
    });

    el.imeInput.addEventListener('input', updateImeInputWarning);

    // Submit typed word on Enter
    el.imeInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (isComposing || e.isComposing || e.keyCode === 229) return;

      e.preventDefault();
      const value = el.imeInput.value.trim();
      if (!value || !phaserScene || !phaserScene.isPlaying) return;

      const outcome = phaserScene.submitAnswer(value);
      el.imeInput.value = '';
      updateImeInputWarning();

      if (outcome === 'correct') {
        flashImeDock('success-flash');
      } else if (outcome === 'incorrect') {
        flashImeDock('error-flash');
      }
    });

    // Keep typing focus when clicking on Phaser canvas
    el.gameContainer.addEventListener('pointerdown', () => {
      if (phaserScene && phaserScene.isPlaying) {
        el.imeInput.focus();
      }
    });

    // Quit session early
    el.btnQuitGame.addEventListener('click', () => {
      if (phaserScene && phaserScene.isPlaying) {
        phaserScene.endSession('quit');
      }
    });

    // Play Again with same configuration & freshly sampled random words
    el.btnPlayAgain.addEventListener('click', () => {
      startGameWithConfig(lastConfig || readConfig());
    });

    // Return to Configuration screen
    el.btnBackConfig.addEventListener('click', () => {
      el.resultsOverlay.classList.add('hidden');
      el.configOverlay.classList.remove('hidden');
      if (phaserScene) {
        phaserScene.cleanupSession();
        phaserScene.setHUDVisible(false);
      }
      updatePoolPreview();
    });

    // Credits popup controls
    el.btnOpenCredits.addEventListener('click', openCreditsModal);
    el.btnResultsCredits.addEventListener('click', openCreditsModal);
    el.btnCloseCredits.addEventListener('click', closeCreditsModal);
    el.btnCloseCreditsX.addEventListener('click', closeCreditsModal);
    el.creditsOverlay.addEventListener('click', (e) => {
      if (e.target === el.creditsOverlay) {
        closeCreditsModal();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !el.creditsOverlay.classList.contains('hidden')) {
        closeCreditsModal();
      }
    });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderInlineMarkdown(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
  }

  function renderCreditsMarkdown(md) {
    const lines = md.replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let inList = false;

    const closeList = () => {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        closeList();
        continue;
      }

      if (/^#{1,3}\s+/.test(line)) {
        closeList();
        const headingText = line.replace(/^#{1,3}\s+/, '');
        html.push(`<h3>${renderInlineMarkdown(headingText)}</h3>`);
      } else if (/^[-*]\s+/.test(line)) {
        if (!inList) {
          html.push('<ul>');
          inList = true;
        }
        const itemText = line.replace(/^[-*]\s+/, '');
        html.push(`<li>${renderInlineMarkdown(itemText)}</li>`);
      } else {
        closeList();
        html.push(`<p>${renderInlineMarkdown(line)}</p>`);
      }
    }

    closeList();
    return html.join('');
  }

  async function openCreditsModal() {
    el.creditsOverlay.classList.remove('hidden');
    if (creditsLoaded) return;

    el.creditsContent.textContent = 'Loading credits...';
    try {
      const resp = await fetch(CREDITS_PATH, { cache: 'no-store' });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const md = await resp.text();
      el.creditsContent.innerHTML = renderCreditsMarkdown(md);
      creditsLoaded = true;
    } catch (err) {
      el.creditsContent.innerHTML =
        `<p>Unable to load <code>${CREDITS_PATH}</code> (${escapeHtml(err.message)}).</p>`;
    }
  }

  function closeCreditsModal() {
    el.creditsOverlay.classList.add('hidden');
  }

  /**
   * Ensure Noto Sans Arabic loads before Phaser renders text (with safe offline timeout).
   */
  function waitForArabicFont() {
    if (!document.fonts || !document.fonts.load) {
      return Promise.resolve();
    }
    const fontLoad = document.fonts.load('700 32px "Noto Sans Arabic"').catch(() => {});
    const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
    return Promise.race([fontLoad, timeout]);
  }

  async function bootstrap() {
    bindEvents();
    applyPracticeModeUI(practiceMode);
    await waitForArabicFont();
    initPhaser();

    try {
      dataset = await global.ArabicVocabLoader.loadDataset(CSV_PATH);
      el.datasetLoading.classList.add('hidden');
      el.configForm.classList.remove('hidden');
      el.scriptNote.textContent = `${dataset.items.length.toLocaleString()} Arabic–English words ready`;
      updatePoolPreview();
    } catch (err) {
      el.datasetLoading.classList.remove('loading');
      el.datasetLoading.classList.add('error');
      el.datasetLoading.innerHTML =
        `Failed to load <code>${CSV_PATH}</code> (${escapeHtml(err.message)}). ` +
        `Serve this directory over HTTP (e.g. <code>python3 -m http.server 8080</code>) rather than opening <code>file://</code> directly.`;
    }
  }

  bootstrap();
})(window);
