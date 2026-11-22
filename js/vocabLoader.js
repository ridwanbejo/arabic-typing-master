(function (global) {
  'use strict';

  const ARABIC_WORD_RE = /^[\u0621-\u064A\u064B-\u065F\u0670]+$/;
  const ENGLISH_WORD_RE = /^[A-Za-z]+$/;
  const TASHKEEL_RE = /[\u064B-\u065F\u0670]/;
  const TASHKEEL_GLOBAL_RE = /[\u064B-\u065F\u0670]/g;
  const HAMZA_RE = /[أإآؤئء]/;

  const ROMAN_MAP = {
    'ا': 'ā',
    'أ': 'ʾa',
    'إ': 'ʾi',
    'آ': 'ʾā',
    'ء': 'ʾ',
    'ؤ': 'ʾu',
    'ئ': 'ʾi',
    'ب': 'b',
    'ت': 't',
    'ث': 'th',
    'ج': 'j',
    'ح': 'ḥ',
    'خ': 'kh',
    'د': 'd',
    'ذ': 'dh',
    'ر': 'r',
    'ز': 'z',
    'س': 's',
    'ش': 'sh',
    'ص': 'ṣ',
    'ض': 'ḍ',
    'ط': 'ṭ',
    'ظ': 'ẓ',
    'ع': 'ʿ',
    'غ': 'gh',
    'ف': 'f',
    'ق': 'q',
    'ك': 'k',
    'ل': 'l',
    'م': 'm',
    'ن': 'n',
    'ه': 'h',
    'و': 'w',
    'ي': 'y',
    'ى': 'ā',
    'ة': 'a',
  };

  const EASINESS_RANGES = {
    'ar-to-en': {
      easy: { min: 1, max: 4, label: '1 – 4 letters' },
      medium: { min: 5, max: 6, label: '5 – 6 letters' },
      hard: { min: 7, max: 15, label: '7+ letters' },
      all: { min: 1, max: 99, label: 'All lengths' },
    },
    'en-to-ar': {
      easy: { min: 1, max: 5, label: '1 – 5 letters' },
      medium: { min: 6, max: 8, label: '6 – 8 letters' },
      hard: { min: 9, max: 20, label: '9+ letters' },
      all: { min: 1, max: 99, label: 'All lengths' },
    },
  };

  /**
   * RFC 4180 compliant CSV parser (handles quoted fields, escaped quotes, embedded commas, CRLF/LF).
   */
  function parseCSV(text) {
    const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];

      if (inQuotes) {
        if (ch === '"') {
          if (clean[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r') {
        if (clean[i + 1] === '\n') i++;
        row.push(field);
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function isTashkeelChar(ch) {
    const cp = ch.codePointAt(0);
    return (cp >= 0x064b && cp <= 0x065f) || cp === 0x0670;
  }

  /**
   * Split an Arabic word into letter clusters (each base letter + any attached tashkīl marks).
   */
  function splitArabicLetterClusters(word) {
    const clusters = [];
    for (const ch of Array.from(word)) {
      if (isTashkeelChar(ch) && clusters.length > 0) {
        const last = clusters[clusters.length - 1];
        last.text += ch;
        last.marks += ch;
      } else if (!isTashkeelChar(ch)) {
        clusters.push({
          base: ch,
          text: ch,
          marks: '',
          roman: ROMAN_MAP[ch] || ch,
        });
      }
    }
    return clusters;
  }

  /**
   * Segment an Arabic word into orthographic syllables (CVV / Al- / CV / C) for the syllable minimap.
   */
  function segmentArabicSyllables(clusters) {
    const n = clusters.length;
    const rawGroups = [];
    let i = 0;

    while (i < n) {
      // Group definite article 'ال' when followed by a stem
      if (i === 0 && n > 3 && clusters[0].base === 'ا' && clusters[1].base === 'ل') {
        rawGroups.push([clusters[0], clusters[1]]);
        i += 2;
        continue;
      }

      const cur = [clusters[i]];
      i += 1;

      if (i < n) {
        const nxt = clusters[i];
        const nxtBase = nxt.base;
        const hasShadda = nxt.marks.includes('\u0651');
        const followedByMadd =
          i + 1 < n && (clusters[i + 1].base === 'ا' || clusters[i + 1].base === 'ى' || clusters[i + 1].base === 'و');

        if ((nxtBase === 'ا' || nxtBase === 'ى') && !hasShadda) {
          cur.push(nxt);
          i += 1;
        } else if (
          (nxtBase === 'و' || nxtBase === 'ي') &&
          !hasShadda &&
          !followedByMadd &&
          cur[0].base !== 'ا' &&
          cur[0].base !== 'أ' &&
          cur[0].base !== 'إ' &&
          cur[0].base !== 'آ'
        ) {
          cur.push(nxt);
          i += 1;
        }
      }

      // Attach trailing tāʾ marbūṭa 'ة' to a single preceding consonant
      if (i === n - 1 && clusters[i].base === 'ة' && cur.length === 1) {
        cur.push(clusters[i]);
        i += 1;
      }

      rawGroups.push(cur);
    }

    return rawGroups.map((group) => {
      const text = group.map((c) => c.text).join('');
      let roman = '';
      group.forEach((c, idx) => {
        let r;
        if (idx > 0 && c.base === 'و') {
          r = 'ū';
        } else if (idx > 0 && c.base === 'ي') {
          r = 'ī';
        } else if (idx === 0 && c.base === 'ا') {
          r = 'a';
        } else {
          r = ROMAN_MAP[c.base] || c.base;
        }
        if (c.marks.includes('\u0651') && r.length <= 2) {
          r = r + r;
        }
        roman += r;
      });
      return { text, roman };
    });
  }

  /**
   * Analyse an Arabic-English pair into brick blocks, syllables, and script tags.
   */
  function buildVocabItem(arabic, english) {
    const arLetters = splitArabicLetterClusters(arabic);
    if (arLetters.length === 0) return null;

    const arSyllables = segmentArabicSyllables(arLetters);
    const enLetters = Array.from(english).map((ch) => ({ text: ch }));

    const hasHamza = HAMZA_RE.test(arabic);
    const hasTashkeel = TASHKEEL_RE.test(arabic);
    const hasTaaMarbuta = arabic.includes('ة');
    const isPlain = !hasHamza && !hasTashkeel;

    const tags = [];
    if (isPlain) tags.push('Basic');
    if (hasHamza) tags.push('Hamza');
    if (hasTashkeel) tags.push('Tashkīl');
    if (hasTaaMarbuta) tags.push('Tāʾ Marbūṭa');

    return {
      arabic,
      english,
      arLetters,
      enLetters,
      arSyllables,
      syllableBreakdown: arSyllables.map((s) => s.roman).join(' · '),
      letterBreakdown: arLetters.map((l) => l.text).join(' · '),
      hasHamza,
      hasTashkeel,
      hasTaaMarbuta,
      isPlain,
      tags,
    };
  }

  /**
   * Load and parse the Arabic-English CSV dataset (ignoring source and hash columns).
   * @param {string} csvPath
   * @returns {Promise<{items: Array<object>, totalRows: number, skippedRows: number}>}
   */
  async function loadDataset(csvPath) {
    const resp = await fetch(csvPath);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const text = await resp.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      throw new Error('CSV dataset is empty');
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idxAr = header.indexOf('arabic');
    const idxEn = header.indexOf('english');
    if (idxAr === -1 || idxEn === -1) {
      throw new Error('Expected columns: arabic, english');
    }

    const items = [];
    const seen = new Set();
    let skippedRows = 0;

    for (let r = 1; r < rows.length; r++) {
      const cols = rows[r];
      // Explicitly ignore source and hash columns — read only arabic and english
      const arabic = (cols[idxAr] || '').trim().normalize('NFC');
      const english = (cols[idxEn] || '').trim().normalize('NFC');

      if (!arabic || !english || !ARABIC_WORD_RE.test(arabic) || !ENGLISH_WORD_RE.test(english)) {
        skippedRows += 1;
        continue;
      }

      const dedupKey = `${arabic}|${english.toLowerCase()}`;
      if (seen.has(dedupKey)) {
        skippedRows += 1;
        continue;
      }
      seen.add(dedupKey);

      const item = buildVocabItem(arabic, english);
      if (!item) {
        skippedRows += 1;
        continue;
      }
      items.push(item);
    }

    return {
      items,
      totalRows: rows.length - 1,
      skippedRows,
    };
  }

  function getEasinessRanges(practiceMode) {
    return EASINESS_RANGES[practiceMode] || EASINESS_RANGES['ar-to-en'];
  }

  /**
   * Filter vocabulary entries by Arabic script category and easiness (letter block count).
   */
  function filterWords(items, config) {
    const practiceMode = config.practiceMode || 'ar-to-en';
    const ranges = getEasinessRanges(practiceMode);
    const range = ranges[config.easiness] || ranges.easy;
    const scriptMode = config.scriptMode || 'all';

    return items.filter((item) => {
      const len = practiceMode === 'en-to-ar' ? item.enLetters.length : item.arLetters.length;
      if (len < range.min || len > range.max) return false;

      if (scriptMode === 'plain') return item.isPlain;
      if (scriptMode === 'hamza') return item.hasHamza;
      if (scriptMode === 'tashkeel') return item.hasTashkeel;
      return true;
    });
  }

  /**
   * Randomly sample up to `count` unique entries using Fisher-Yates shuffle.
   */
  function sampleWords(pool, count) {
    const copy = pool.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy.slice(0, Math.min(count, copy.length));
  }

  /**
   * Canonicalise Arabic input for reliable typing comparison.
   * Strips bidi control chars, tatweel, and whitespace; optionally strips tashkīl diacritics.
   */
  function normalizeArabicInput(str, stripTashkeel) {
    let cleaned = (str || '')
      .normalize('NFC')
      .replace(/[\s\u0640\u200B-\u200F\u202A-\u202E\uFEFF]/g, '');

    if (stripTashkeel) {
      return cleaned.replace(TASHKEEL_GLOBAL_RE, '');
    }

    // Canonicalise combining diacritic ordering per base letter (shadda first, then vowel mark)
    const chars = Array.from(cleaned);
    const out = [];
    let i = 0;
    while (i < chars.length) {
      const base = chars[i];
      if (isTashkeelChar(base)) {
        out.push(base);
        i += 1;
        continue;
      }
      const marks = [];
      let j = i + 1;
      while (j < chars.length && isTashkeelChar(chars[j])) {
        marks.push(chars[j]);
        j += 1;
      }
      marks.sort((a, b) => {
        const pa = a === '\u0651' ? 0 : 1;
        const pb = b === '\u0651' ? 0 : 1;
        return pa - pb || a.codePointAt(0) - b.codePointAt(0);
      });
      out.push(base, ...marks);
      i = j;
    }

    return out.join('');
  }

  function normalizeEnglishInput(str) {
    return (str || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  global.ArabicVocabLoader = {
    EASINESS_RANGES,
    getEasinessRanges,
    loadDataset,
    filterWords,
    sampleWords,
    normalizeArabicInput,
    normalizeEnglishInput,
  };
})(window);
