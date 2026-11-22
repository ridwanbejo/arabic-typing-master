(function (global) {
  'use strict';

  // Sahara Desert vibrant arcade tile palette
  const BLOCK_PALETTE = [
    0xd97706, // Sahara Amber Gold
    0xc2410c, // Burnt Terracotta
    0xea580c, // Sunset Dune Orange
    0xf59e0b, // Sunlit Saffron (light)
    0x0d9488, // Oasis Turquoise
    0xb45309, // Ochre Sandstone
    0x0284c7, // Tuareg Mirage Blue
    0xb91c1c, // Crimson Spice
    0xeab308, // Desert Sand Gold (light)
    0x65a30d, // Oasis Palm Olive
  ];

  const LIGHT_TILES = new Set([0xf59e0b, 0xeab308]);

  const FONT_ARABIC = '"Noto Sans Arabic", "Geeza Pro", "Tahoma", "Arial", sans-serif';
  const FONT_UI = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

  const VISIBLE_ROWS = 6;

  const SFX_PATHS = {
    'sfx-success':
      'assets/sfx/vadim_makes_sound-modern-success-confirmation-notification-566072.mp3',
    'sfx-fail':
      'assets/sfx/lesiakower-error-mistake-sound-effect-incorrect-answer-437420.mp3',
  };

  function createSfxPool(src, volume, size = 4) {
    const pool = Array.from({ length: size }, () => {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.volume = volume;
      return audio;
    });
    let idx = 0;

    return {
      play(overrideVolume) {
        const audio = pool[idx];
        idx = (idx + 1) % pool.length;
        if (typeof overrideVolume === 'number') {
          audio.volume = overrideVolume;
        }
        try {
          audio.currentTime = 0;
        } catch (_err) {
          // Ignore seek errors before metadata is loaded
        }
        const promise = audio.play();
        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => {});
        }
      },
    };
  }

  class ArabicGameScene extends Phaser.Scene {
    constructor() {
      super({ key: 'ArabicGameScene' });

      this.isPlaying = false;
      this.config = null;
      this.practiceMode = 'ar-to-en'; // 'ar-to-en' | 'en-to-ar'
      this.callbacks = {};

      this.wordQueue = [];
      this.totalWords = 0;
      this.nextWordIdx = 0;
      this.rowItems = []; // index 0 = active bottom row, index 1..N = stacked above

      this.score = 0;
      this.wordsCleared = 0;
      this.mistakes = 0;
      this.streak = 0;
      this.sessionStartMs = 0;
      this.durationMs = 120000;
      this.remainingMs = 120000;
      this.lastDisplayedSec = -1;

      this.timerEvent = null;
      this.errorResetTimer = null;
      this.bgShapes = [];
      this.colorCursor = 0;

      this.sfxPools = {
        'sfx-success': createSfxPool(SFX_PATHS['sfx-success'], 0.8),
        'sfx-fail': createSfxPool(SFX_PATHS['sfx-fail'], 0.85),
      };
    }

    preload() {}

    create() {
      this.createProceduralTextures();
      this.createBackground();
      this.createPlayfieldRails();
      this.createHUD();
      this.setHUDVisible(false);

      this.scale.on('resize', this.handleResize, this);

      if (global.onPhaserSceneReady) {
        global.onPhaserSceneReady(this);
      }
    }

    update(_time, delta) {
      const w = this.scale.width;
      const h = this.scale.height;
      const dt = delta / 1000;
      for (const shape of this.bgShapes) {
        shape.obj.y -= shape.speed * dt;
        shape.obj.x += shape.drift * dt;
        shape.obj.rotation += shape.rotSpeed * dt;
        if (shape.obj.y < -60) {
          shape.obj.y = h + 60;
          shape.obj.x = Phaser.Math.Between(40, Math.max(80, w - 40));
        }
        if (shape.obj.x > w + 60) shape.obj.x = -50;
        if (shape.obj.x < -60) shape.obj.x = w + 50;
      }
    }

    /**
     * Pure procedural particle textures (zero external image assets).
     */
    createProceduralTextures() {
      if (!this.textures.exists('particle-square')) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1);
        g.fillRoundedRect(0, 0, 14, 14, 3);
        g.generateTexture('particle-square', 14, 14);
        g.destroy();
      }

      if (!this.textures.exists('particle-spark')) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1);
        g.fillPoints(
          [
            { x: 7, y: 0 },
            { x: 14, y: 7 },
            { x: 7, y: 14 },
            { x: 0, y: 7 },
          ],
          true
        );
        g.generateTexture('particle-spark', 14, 14);
        g.destroy();
      }
    }

    /**
     * Sahara Desert atmosphere using pure Phaser Graphics + floating warm sand-gold tiles.
     */
    createBackground() {
      this.bgGraphics = this.add.graphics().setDepth(0);
      this.drawBackgroundGrid();

      const bgPalette = [0xf59e0b, 0xfbbf24, 0xea580c, 0xd97706, 0xfde68a];
      this.bgShapes = [];
      for (let i = 0; i < 18; i++) {
        const size = Phaser.Math.Between(14, 36);
        const color = bgPalette[i % bgPalette.length];
        const rect = this.add
          .rectangle(
            Phaser.Math.Between(40, Math.max(80, this.scale.width - 40)),
            Phaser.Math.Between(0, this.scale.height),
            size,
            size,
            color,
            0.08
          )
          .setStrokeStyle(1.5, color, 0.22)
          .setRotation(Math.PI / 4)
          .setDepth(1);
        this.bgShapes.push({
          obj: rect,
          speed: Phaser.Math.FloatBetween(10, 28),
          drift: Phaser.Math.FloatBetween(4, 14),
          rotSpeed: Phaser.Math.FloatBetween(-0.25, 0.25),
        });
      }
    }

    drawDuneBand(g, w, h, baseYRatio, amp, freq, phase, color, alpha) {
      g.fillStyle(color, alpha);
      g.beginPath();
      g.moveTo(0, h);
      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = t * w;
        const y =
          h * baseYRatio +
          Math.sin(t * Math.PI * freq + phase) * amp +
          Math.cos(t * Math.PI * (freq * 0.55) + phase * 1.4) * (amp * 0.45);
        g.lineTo(x, y);
      }
      g.lineTo(w, h);
      g.closePath();
      g.fillPath();
    }

    drawBackgroundGrid() {
      const w = this.scale.width;
      const h = this.scale.height;
      const m = this.getLayoutMetrics();
      const g = this.bgGraphics;
      g.clear();

      // Sahara Desert golden twilight sky-to-sandstone gradient
      g.fillGradientStyle(0x6b3410, 0x8a4515, 0x1d0f06, 0x2d1709, 1);
      g.fillRect(0, 0, w, h);

      // Soft Sahara sun halo on upper horizon
      const sunX = w * 0.5;
      const sunY = h * 0.24;
      g.fillStyle(0xf59e0b, 0.055);
      g.fillCircle(sunX, sunY, Math.min(w, h) * 0.34);
      g.fillStyle(0xfbbf24, 0.07);
      g.fillCircle(sunX, sunY, Math.min(w, h) * 0.2);
      g.fillStyle(0xfde68a, 0.08);
      g.fillCircle(sunX, sunY, Math.min(w, h) * 0.1);

      // Layered Sahara sand dune silhouettes
      this.drawDuneBand(g, w, h, 0.7, 36, 1.9, 0.6, 0x7c3a12, 0.36);
      this.drawDuneBand(g, w, h, 0.79, 28, 2.4, 2.2, 0x52250b, 0.52);
      this.drawDuneBand(g, w, h, 0.89, 20, 1.6, 4.1, 0x2b1306, 0.72);

      // Subtle warm desert gold grid
      g.lineStyle(1, 0xf59e0b, 0.07);
      const step = 48;
      for (let x = 0; x < w; x += step) {
        g.lineBetween(x, 0, x, h);
      }
      for (let y = 0; y < h; y += step) {
        g.lineBetween(0, y, w, y);
      }

      // Centre sandstone spotlight column (sized cleanly between left and right HUD panels)
      const colW = m.colWidth;
      const colH = Math.max(220, h - 270);
      g.fillStyle(0x1a0d05, 0.48);
      g.fillRoundedRect((w - colW) / 2, 92, colW, colH, 24);
      g.lineStyle(1.5, 0xf59e0b, 0.34);
      g.strokeRoundedRect((w - colW) / 2, 92, colW, colH, 24);
    }

    /**
     * Active target rail + pulsing arrows framing the bottom active row.
     */
    createPlayfieldRails() {
      this.railGraphics = this.add.graphics().setDepth(4);

      this.leftPointer = this.add
        .text(0, 0, '▶', {
          fontFamily: FONT_UI,
          fontSize: '26px',
          color: '#fbbf24',
          stroke: '#2b1306',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(12);

      this.rightPointer = this.add
        .text(0, 0, '◀', {
          fontFamily: FONT_UI,
          fontSize: '26px',
          color: '#fbbf24',
          stroke: '#2b1306',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(12);

      this.tweens.add({
        targets: [this.leftPointer, this.rightPointer],
        scale: 1.18,
        duration: 460,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      this.stackLayer = this.add.container(0, 0).setDepth(10);
    }

    /**
     * Build the Sahara HUD directly in Phaser:
     * - Top-Left: Time remaining + word progress
     * - Top-Right: Score (+10 per word) + streak / mistakes
     * - Bottom-Left: Active target word full connected preview + char count + script tags
     * - Bottom-Right (Upper): Arabic Syllable Minimap (above Translation minimap)
     * - Bottom-Right (Lower): Translation Minimap (English in AR mode, Arabic in EN mode)
     */
    createHUD() {
      this.hudContainer = this.add.container(0, 0).setDepth(20);

      // --- TOP LEFT: TIME ---
      this.timePanelBg = this.add.graphics();
      this.timeTitleText = this.add.text(0, 0, 'TIME', {
        fontFamily: FONT_UI,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#5eead4',
        letterSpacing: 2,
      });
      this.timeValueText = this.add.text(0, 0, '02:00', {
        fontFamily: FONT_MONO,
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#fef3c7',
      });
      this.progressText = this.add.text(0, 0, 'Words: 0 / 0', {
        fontFamily: FONT_UI,
        fontSize: '13px',
        fontStyle: '600',
        color: '#d6b48c',
      });

      // --- TOP RIGHT: SCORE ---
      this.scorePanelBg = this.add.graphics();
      this.scoreTitleText = this.add
        .text(0, 0, 'SCORE', {
          fontFamily: FONT_UI,
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#fde047',
          letterSpacing: 2,
        })
        .setOrigin(1, 0);
      this.scoreValueText = this.add
        .text(0, 0, '0', {
          fontFamily: FONT_MONO,
          fontSize: '34px',
          fontStyle: 'bold',
          color: '#fbbf24',
        })
        .setOrigin(1, 0);
      this.streakText = this.add
        .text(0, 0, 'Mistakes: 0', {
          fontFamily: FONT_UI,
          fontSize: '13px',
          fontStyle: '600',
          color: '#fed7aa',
        })
        .setOrigin(1, 0);

      // --- BOTTOM LEFT: ACTIVE TARGET WORD PREVIEW ---
      this.wordPanelBg = this.add.graphics();
      this.wordHeaderText = this.add.text(0, 0, 'ARABIC WORD', {
        fontFamily: FONT_UI,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#fdba74',
        letterSpacing: 2,
      });
      this.countBadgeBg = this.add.graphics();
      this.countBadgeText = this.add
        .text(0, 0, '0 letters', {
          fontFamily: FONT_MONO,
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#fef3c7',
        })
        .setOrigin(0.5);
      this.wordValueText = this.add.text(0, 0, '', {
        fontFamily: FONT_ARABIC,
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#fef3c7',
        padding: { left: 4, right: 4, top: 8, bottom: 8 },
      });
      this.wordLettersText = this.add.text(0, 0, '', {
        fontFamily: FONT_ARABIC,
        fontSize: '14px',
        fontStyle: '600',
        color: '#fcd34d',
        padding: { left: 2, right: 2, top: 4, bottom: 4 },
      });
      this.wordTagsText = this.add.text(0, 0, '', {
        fontFamily: FONT_UI,
        fontSize: '11px',
        fontStyle: '600',
        color: '#d6b48c',
      });

      // --- BOTTOM RIGHT (UPPER): ARABIC SYLLABLE MINIMAP ---
      this.syllablePanelBg = this.add.graphics();
      this.syllableHeaderText = this.add.text(0, 0, 'ARABIC SYLLABLES', {
        fontFamily: FONT_UI,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#fbbf24',
        letterSpacing: 2,
      });
      this.syllableBadgeBg = this.add.graphics();
      this.syllableBadgeText = this.add
        .text(0, 0, '0 syl', {
          fontFamily: FONT_MONO,
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#2b1306',
        })
        .setOrigin(0.5);
      this.syllableTilesContainer = this.add.container(0, 0);
      this.syllableRomanText = this.add.text(0, 0, '', {
        fontFamily: FONT_MONO,
        fontSize: '12px',
        fontStyle: '600',
        color: '#fed7aa',
      });

      // --- BOTTOM RIGHT (LOWER): TRANSLATION MINIMAP ---
      this.translationPanelBg = this.add.graphics();
      this.translationHeaderText = this.add.text(0, 0, 'ENGLISH TRANSLATION', {
        fontFamily: FONT_UI,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#5eead4',
        letterSpacing: 2,
      });
      this.translationValueText = this.add.text(0, 0, '', {
        fontFamily: FONT_UI,
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#fde047',
        padding: { left: 4, right: 4, top: 6, bottom: 6 },
      });
      this.translationSubText = this.add.text(0, 0, '', {
        fontFamily: FONT_UI,
        fontSize: '12px',
        fontStyle: '600',
        color: '#d6b48c',
        padding: { left: 2, right: 2, top: 4, bottom: 4 },
      });

      this.hudContainer.add([
        this.timePanelBg,
        this.timeTitleText,
        this.timeValueText,
        this.progressText,
        this.scorePanelBg,
        this.scoreTitleText,
        this.scoreValueText,
        this.streakText,
        this.wordPanelBg,
        this.wordHeaderText,
        this.countBadgeBg,
        this.countBadgeText,
        this.wordValueText,
        this.wordLettersText,
        this.wordTagsText,
        this.syllablePanelBg,
        this.syllableHeaderText,
        this.syllableBadgeBg,
        this.syllableBadgeText,
        this.syllableTilesContainer,
        this.syllableRomanText,
        this.translationPanelBg,
        this.translationHeaderText,
        this.translationValueText,
        this.translationSubText,
      ]);

      this.layoutHUD();
    }

    setHUDVisible(visible) {
      this.hudContainer.setVisible(visible);
      this.railGraphics.setVisible(visible);
      this.leftPointer.setVisible(visible);
      this.rightPointer.setVisible(visible);
    }

    /**
     * Responsive desktop layout metrics for 4-corner + stacked bottom-right minimap HUD and centre stack.
     */
    getLayoutMetrics() {
      const w = this.scale.width;
      const h = this.scale.height;

      const margin = 22;
      const topCardW = 215;
      const topCardH = 88;
      const sideCardW = Phaser.Math.Clamp(Math.floor(w * 0.23), 248, 336);
      const sideCardH = h < 620 ? 134 : 148;
      const translationCardH = h < 620 ? 102 : 114;
      const syllableCardH = h < 620 ? 114 : 128;
      const minimapGap = 12;

      const centerClearW = Math.max(420, w - (sideCardW + margin) * 2 - 28);
      const colWidth = Math.min(840, centerClearW);
      const maxRowWidth = Math.min(790, colWidth - 36);

      const playTop = 108;
      const playBottom = h - 186;
      const playHeight = Math.max(240, playBottom - playTop);
      const rowPitch = Phaser.Math.Clamp(Math.floor((playHeight - 24) / VISIBLE_ROWS), 54, 82);
      const baseBrickHeight = Phaser.Math.Clamp(rowPitch - 12, 44, 68);
      const baseY = playBottom - Math.round(baseBrickHeight / 2) - 10;

      return {
        w,
        h,
        margin,
        topCardW,
        topCardH,
        sideCardW,
        sideCardH,
        translationCardH,
        syllableCardH,
        minimapGap,
        colWidth,
        centerX: Math.round(w / 2),
        baseY,
        rowPitch,
        baseBrickHeight,
        maxRowWidth,
      };
    }

    layoutHUD() {
      const m = this.getLayoutMetrics();

      // Top-Left: TIME
      this.drawHudCard(this.timePanelBg, m.margin, m.margin, m.topCardW, m.topCardH, 0x14b8a6);
      this.timeTitleText.setPosition(m.margin + 16, m.margin + 10);
      this.timeValueText.setPosition(m.margin + 16, m.margin + 26);
      this.progressText.setPosition(m.margin + 16, m.margin + 65);

      // Top-Right: SCORE
      const scoreX = m.w - m.margin - m.topCardW;
      this.drawHudCard(this.scorePanelBg, scoreX, m.margin, m.topCardW, m.topCardH, 0xfbbf24);
      this.scoreTitleText.setPosition(m.w - m.margin - 16, m.margin + 10);
      this.scoreValueText.setPosition(m.w - m.margin - 16, m.margin + 26);
      this.streakText.setPosition(m.w - m.margin - 16, m.margin + 65);

      // Bottom-Left: ACTIVE TARGET WORD PREVIEW
      const bottomLeftY = m.h - m.margin - m.sideCardH;
      this.drawHudCard(this.wordPanelBg, m.margin, bottomLeftY, m.sideCardW, m.sideCardH, 0xea580c);
      this.wordHeaderText.setPosition(m.margin + 16, bottomLeftY + 12);
      this.wordValueText.setPosition(m.margin + 16, bottomLeftY + 34);
      this.wordLettersText.setPosition(m.margin + 16, bottomLeftY + m.sideCardH - 54);
      this.wordTagsText.setPosition(m.margin + 16, bottomLeftY + m.sideCardH - 26);
      this.drawCountBadge(m.margin + m.sideCardW - 48, bottomLeftY + 20);

      // Bottom-Right (LOWER): TRANSLATION MINIMAP
      const rightX = m.w - m.margin - m.sideCardW;
      const transY = m.h - m.margin - m.translationCardH;
      this.drawHudCard(
        this.translationPanelBg,
        rightX,
        transY,
        m.sideCardW,
        m.translationCardH,
        0x14b8a6
      );
      this.translationHeaderText.setPosition(rightX + 16, transY + 12);
      this.translationValueText.setPosition(rightX + 16, transY + 32);
      this.translationSubText.setPosition(rightX + 16, transY + m.translationCardH - 28);

      // Bottom-Right (UPPER): ARABIC SYLLABLE MINIMAP (directly above Translation minimap)
      const sylY = transY - m.minimapGap - m.syllableCardH;
      this.drawHudCard(
        this.syllablePanelBg,
        rightX,
        sylY,
        m.sideCardW,
        m.syllableCardH,
        0xf59e0b
      );
      this.syllableHeaderText.setPosition(rightX + 16, sylY + 12);
      this.syllableTilesContainer.setPosition(
        rightX + Math.round(m.sideCardW / 2),
        sylY + Math.round(m.syllableCardH * 0.54)
      );
      this.syllableRomanText.setPosition(rightX + 16, sylY + m.syllableCardH - 24);
      this.drawSyllableBadge(rightX + m.sideCardW - 42, sylY + 20);

      this.updateActiveRailPosition();
    }

    drawHudCard(g, x, y, width, height, borderColor) {
      g.clear();
      g.fillStyle(0x241207, 0.92);
      g.fillRoundedRect(x, y, width, height, 14);
      g.lineStyle(2, borderColor, 0.85);
      g.strokeRoundedRect(x, y, width, height, 14);
      // Warm top accent strip
      g.fillStyle(borderColor, 0.28);
      g.fillRoundedRect(x + 2, y + 2, width - 4, 4, 2);
    }

    drawCountBadge(cx, cy) {
      const active = this.rowItems[0];
      const blocks = active ? this.getTargetBlocks(active.vocab) : [];
      const count = blocks.length;
      const label = count === 1 ? '1 letter' : `${count} letters`;

      this.countBadgeBg.clear();
      this.countBadgeBg.fillStyle(0xb45309, 1);
      this.countBadgeBg.fillRoundedRect(cx - 34, cy - 11, 68, 22, 8);
      this.countBadgeText.setText(label).setPosition(cx, cy);
    }

    drawSyllableBadge(cx, cy) {
      const active = this.rowItems[0];
      const count = active ? active.vocab.arSyllables.length : 0;
      const label = `${count} syl`;

      this.syllableBadgeBg.clear();
      this.syllableBadgeBg.fillStyle(0xfbbf24, 1);
      this.syllableBadgeBg.fillRoundedRect(cx - 26, cy - 11, 52, 22, 8);
      this.syllableBadgeText.setText(label).setPosition(cx, cy);
    }

    updateActiveRailPosition() {
      const m = this.getLayoutMetrics();
      const active = this.rowItems[0];
      const activeWidth = active ? active.rowWidth : 280;
      const railHalfW = Math.min(m.maxRowWidth / 2, activeWidth / 2 + 26);

      this.railGraphics.clear();
      if (this.isPlaying && active) {
        const railY = m.baseY + Math.round(active.brickHeight / 2) + 8;
        this.railGraphics.fillStyle(0xf59e0b, 0.25);
        this.railGraphics.fillRoundedRect(m.centerX - railHalfW, railY - 2, railHalfW * 2, 10, 5);
        this.railGraphics.fillStyle(0xfbbf24, 0.96);
        this.railGraphics.fillRoundedRect(m.centerX - railHalfW + 6, railY, railHalfW * 2 - 12, 4, 2);

        this.leftPointer.setPosition(m.centerX - railHalfW - 22, m.baseY).setVisible(true);
        this.rightPointer.setPosition(m.centerX + railHalfW + 22, m.baseY).setVisible(true);
      } else {
        this.leftPointer.setVisible(false);
        this.rightPointer.setVisible(false);
      }
    }

    handleResize() {
      this.drawBackgroundGrid();
      this.layoutHUD();
      this.relayoutStackImmediate();
      if (this.isPlaying) {
        this.updateActiveWordDisplay();
      }
    }

    playSfx(key, volume) {
      const pool = this.sfxPools[key];
      if (!pool) return;
      pool.play(volume);
    }

    getTargetBlocks(vocab) {
      return this.practiceMode === 'en-to-ar' ? vocab.enLetters : vocab.arLetters;
    }

    /**
     * Switch practice mode live during a session without losing score, queue, or timer.
     * @param {'ar-to-en' | 'en-to-ar'} mode
     */
    setPracticeMode(mode) {
      const normalized = mode === 'en-to-ar' ? 'en-to-ar' : 'ar-to-en';
      if (this.practiceMode === normalized) return;
      this.practiceMode = normalized;
      if (this.config) {
        this.config.practiceMode = normalized;
      }

      if (!this.isPlaying) return;

      if (this.errorResetTimer) {
        this.errorResetTimer.remove(false);
        this.errorResetTimer = null;
      }

      const activeVocabs = this.rowItems.map((r) => r.vocab);
      for (const row of this.rowItems) {
        if (row.container && row.container.active) {
          row.container.destroy();
        }
      }
      this.rowItems = [];
      this.stackLayer.removeAll(true);

      activeVocabs.forEach((vocab, slot) => {
        const row = this.createWordRow(vocab, slot);
        this.rowItems.push(row);
      });

      this.updateActiveWordDisplay();
    }

    /**
     * Start a new typing session with the generated word list and user config.
     */
    startSession(words, config, callbacks) {
      this.cleanupSession();

      this.config = Object.assign({}, config);
      this.practiceMode = config.practiceMode === 'en-to-ar' ? 'en-to-ar' : 'ar-to-en';
      this.callbacks = callbacks || {};
      this.wordQueue = words.slice();
      this.totalWords = this.wordQueue.length;
      this.nextWordIdx = 0;

      this.score = 0;
      this.wordsCleared = 0;
      this.mistakes = 0;
      this.streak = 0;
      this.colorCursor = 0;

      this.durationMs = config.minutes * 60 * 1000;
      this.remainingMs = this.durationMs;
      this.lastDisplayedSec = -1;
      this.sessionStartMs = performance.now();
      this.isPlaying = true;

      if (this.sound.context && this.sound.context.state === 'suspended') {
        this.sound.context.resume().catch(() => {});
      }

      this.setHUDVisible(true);
      this.layoutHUD();

      const initialCount = Math.min(VISIBLE_ROWS, this.wordQueue.length);
      for (let slot = 0; slot < initialCount; slot++) {
        const vocab = this.wordQueue[this.nextWordIdx++];
        const row = this.createWordRow(vocab, slot);
        this.rowItems.push(row);

        const targetY = row.container.y;
        row.container.y = targetY - 90 - slot * 20;
        row.container.alpha = 0;
        this.tweens.add({
          targets: row.container,
          y: targetY,
          alpha: this.getSlotAlpha(slot),
          duration: 320 + slot * 45,
          ease: 'Back.easeOut',
        });
      }

      this.updateHUDValues();
      this.updateActiveWordDisplay();
      this.updateTimerDisplay(true);

      this.timerEvent = this.time.addEvent({
        delay: 100,
        loop: true,
        callback: () => this.tickTimer(),
      });
    }

    cleanupSession() {
      this.isPlaying = false;

      if (this.timerEvent) {
        this.timerEvent.remove(false);
        this.timerEvent = null;
      }
      if (this.errorResetTimer) {
        this.errorResetTimer.remove(false);
        this.errorResetTimer = null;
      }

      for (const row of this.rowItems) {
        if (row.container && row.container.active) {
          row.container.destroy();
        }
      }
      this.rowItems = [];
      this.stackLayer.removeAll(true);
      if (this.syllableTilesContainer) {
        this.syllableTilesContainer.removeAll(true);
      }
    }

    getSlotAlpha(slot) {
      if (slot === 0) return 1;
      return Math.max(0.56, 0.92 - slot * 0.08);
    }

    getSlotScale(slot) {
      return slot === 0 ? 1.0 : 0.9;
    }

    /**
     * Build a horizontal row of colourful 3D letter blocks.
     * - Arabic typing mode ('ar-to-en'): RTL visual order (letter 0 at rightmost brick).
     * - English typing mode ('en-to-ar'): LTR visual order (letter 0 at leftmost brick).
     */
    createWordRow(vocab, slot) {
      const m = this.getLayoutMetrics();
      const isArabicMode = this.practiceMode === 'ar-to-en';
      const blocks = this.getTargetBlocks(vocab);
      const gap = blocks.length >= 9 ? 5 : blocks.length >= 7 ? 6 : 8;

      const idealBrickW = Math.round(m.baseBrickHeight * 1.08);
      const maxBrickFromWidth = Math.floor(
        (m.maxRowWidth - gap * (blocks.length - 1)) / Math.max(1, blocks.length)
      );
      const brickW = Phaser.Math.Clamp(Math.min(idealBrickW, maxBrickFromWidth), 36, idealBrickW);
      const brickH = Phaser.Math.Clamp(
        Math.min(m.baseBrickHeight, Math.round(brickW * 0.98)),
        40,
        m.baseBrickHeight
      );
      const totalWidth = blocks.length * brickW + (blocks.length - 1) * gap;

      const rowY = m.baseY - slot * m.rowPitch;
      const container = this.add.container(m.centerX, rowY);
      container.setScale(this.getSlotScale(slot));
      container.setAlpha(this.getSlotAlpha(slot));

      const bricks = [];
      const startX = -totalWidth / 2 + brickW / 2;
      const rowColorOffset = this.colorCursor;
      this.colorCursor = (this.colorCursor + 2) % BLOCK_PALETTE.length;

      blocks.forEach((blk, idx) => {
        // Place Arabic letters Right-to-Left so index 0 is on the rightmost brick
        const visualIdx = isArabicMode ? blocks.length - 1 - idx : idx;
        const bx = startX + visualIdx * (brickW + gap);
        const colorHex = BLOCK_PALETTE[(rowColorOffset + idx) % BLOCK_PALETTE.length];

        const brickContainer = this.add.container(bx, 0);
        const bg = this.add.graphics();
        this.paintBrick(bg, brickW, brickH, colorHex, false, slot === 0);

        const baseFontSize = Math.round(brickH * (isArabicMode ? 0.5 : 0.46));
        const isLightTile = LIGHT_TILES.has(colorHex);
        const label = this.add
          .text(0, isArabicMode ? -2 : 0, blk.text, {
            fontFamily: isArabicMode ? FONT_ARABIC : FONT_UI,
            fontSize: `${baseFontSize}px`,
            fontStyle: 'bold',
            color: isLightTile ? '#271205' : '#fef3c7',
            stroke: isLightTile ? '#fef9c3' : '#1c0c04',
            strokeThickness: isLightTile ? 1 : 3,
            padding: { left: 6, right: 6, top: 10, bottom: 10 },
          })
          .setOrigin(0.5);

        const maxInnerW = brickW - 10;
        const maxInnerH = brickH - 8;
        const rawW = Math.max(1, label.width - 12);
        const rawH = Math.max(1, label.height - 20);
        const fitScale = Math.min(1, maxInnerW / rawW, maxInnerH / rawH);
        if (fitScale < 1) {
          label.setScale(fitScale);
        }

        brickContainer.add([bg, label]);
        container.add(brickContainer);

        bricks.push({
          container: brickContainer,
          bg,
          label,
          text: blk.text,
          baseColor: colorHex,
          isLightTile,
          width: brickW,
          height: brickH,
          localX: bx,
        });
      });

      this.stackLayer.add(container);

      return {
        vocab,
        container,
        bricks,
        brickWidth: brickW,
        brickHeight: brickH,
        rowWidth: totalWidth,
        isErrorHighlighted: false,
      };
    }

    /**
     * Draw a single glossy 3D Sahara sandstone/gem brick with Phaser Graphics.
     */
    paintBrick(g, width, height, fillHex, isError, isActive) {
      g.clear();
      const halfW = width / 2;
      const halfH = height / 2;
      const radius = Math.max(8, Math.round(Math.min(width, height) * 0.16));

      const mainColor = isError ? 0xdc2626 : fillHex;
      const colorObj = Phaser.Display.Color.IntegerToColor(mainColor);
      const darkBevel = Phaser.Display.Color.GetColor(
        Math.max(0, colorObj.red - 55),
        Math.max(0, colorObj.green - 55),
        Math.max(0, colorObj.blue - 55)
      );

      // Warm desert drop shadow
      g.fillStyle(0x120802, 0.5);
      g.fillRoundedRect(-halfW + 2, -halfH + 5, width, height, radius);

      // Outer crimson glow on error
      if (isError) {
        g.fillStyle(0xef4444, 0.35);
        g.fillRoundedRect(-halfW - 5, -halfH - 5, width + 10, height + 10, radius + 4);
      }

      // Main brick body
      g.fillStyle(mainColor, 1);
      g.fillRoundedRect(-halfW, -halfH, width, height, radius);

      // Bottom 3D bevel lip
      g.fillStyle(darkBevel, 0.92);
      g.fillRoundedRect(-halfW + 1, halfH - 8, width - 2, 8, {
        tl: 0,
        tr: 0,
        bl: radius,
        br: radius,
      });

      // Top sunlit highlight strip
      g.fillStyle(0xfef3c7, isError ? 0.22 : 0.28);
      g.fillRoundedRect(
        -halfW + 5,
        -halfH + 4,
        width - 10,
        Math.max(6, Math.round(height * 0.16)),
        4
      );

      // Crisp border
      if (isError) {
        g.lineStyle(3, 0xfca5a5, 1);
      } else if (isActive) {
        g.lineStyle(2.5, 0xfef3c7, 0.94);
      } else {
        g.lineStyle(1.5, 0xfef3c7, 0.32);
      }
      g.strokeRoundedRect(-halfW, -halfH, width, height, radius);
    }

    relayoutStackImmediate() {
      const m = this.getLayoutMetrics();
      this.rowItems.forEach((row, slot) => {
        row.container.setPosition(m.centerX, m.baseY - slot * m.rowPitch);
        row.container.setScale(this.getSlotScale(slot));
        row.container.setAlpha(this.getSlotAlpha(slot));
      });
      this.updateActiveRailPosition();
    }

    /**
     * Evaluate submitted input against the active bottom row according to practiceMode.
     * @param {string} rawInput
     * @returns {'correct' | 'incorrect' | 'ignored'}
     */
    submitAnswer(rawInput) {
      if (!this.isPlaying || this.rowItems.length === 0) return 'ignored';

      const activeRow = this.rowItems[0];
      const loader = global.ArabicVocabLoader;

      if (this.practiceMode === 'en-to-ar') {
        const typed = loader.normalizeEnglishInput(rawInput);
        if (!typed) return 'ignored';
        const expected = loader.normalizeEnglishInput(activeRow.vocab.english);
        if (typed === expected) {
          this.handleCorrectWord(activeRow);
          return 'correct';
        }
        this.handleIncorrectWord(activeRow);
        return 'incorrect';
      }

      // Arabic typing mode ('ar-to-en')
      const strictTashkeel = this.config && this.config.scriptMode === 'tashkeel';
      const typedExact = loader.normalizeArabicInput(rawInput, false);
      if (!typedExact) return 'ignored';

      const expectedExact = loader.normalizeArabicInput(activeRow.vocab.arabic, false);
      let isMatch = typedExact === expectedExact;

      if (!isMatch && !strictTashkeel) {
        const typedBase = loader.normalizeArabicInput(rawInput, true);
        const expectedBase = loader.normalizeArabicInput(activeRow.vocab.arabic, true);
        isMatch = typedBase === expectedBase;
      }

      if (isMatch) {
        this.handleCorrectWord(activeRow);
        return 'correct';
      }

      this.handleIncorrectWord(activeRow);
      return 'incorrect';
    }

    /**
     * Success: play confirmation SFX, explode blocks with desert sparks, award +10, drop stack down.
     */
    handleCorrectWord(activeRow) {
      if (this.errorResetTimer) {
        this.errorResetTimer.remove(false);
        this.errorResetTimer = null;
      }

      this.playSfx('sfx-success', 0.75);

      this.score += 10;
      this.wordsCleared += 1;
      this.streak += 1;

      const rowWorldX = activeRow.container.x;
      const rowWorldY = activeRow.container.y;

      activeRow.bricks.forEach((brick, idx) => {
        const wx = rowWorldX + brick.localX;
        const wy = rowWorldY;

        const burst = this.add.particles(wx, wy, 'particle-square', {
          speed: { min: 110, max: 340 },
          angle: { min: 0, max: 360 },
          scale: { start: 1.05, end: 0 },
          alpha: { start: 1, end: 0 },
          lifespan: { min: 400, max: 760 },
          gravityY: 440,
          rotate: { min: -240, max: 240 },
          tint: brick.baseColor,
          emitting: false,
        });
        burst.setDepth(18);
        burst.explode(14);
        this.time.delayedCall(820, () => burst.destroy());

        const sparks = this.add.particles(wx, wy, 'particle-spark', {
          speed: { min: 160, max: 380 },
          angle: { min: 0, max: 360 },
          scale: { start: 0.85, end: 0 },
          alpha: { start: 1, end: 0 },
          lifespan: { min: 280, max: 520 },
          tint: 0xfbbf24,
          emitting: false,
        });
        sparks.setDepth(19);
        sparks.explode(6);
        this.time.delayedCall(580, () => sparks.destroy());

        activeRow.container.remove(brick.container, false);
        this.add.existing(brick.container);
        brick.container.setPosition(wx, wy);
        brick.container.setDepth(16);

        const spread = idx - (activeRow.bricks.length - 1) / 2;
        const targetX = wx + spread * Phaser.Math.Between(55, 95) + Phaser.Math.Between(-35, 35);
        const targetY = wy - Phaser.Math.Between(70, 150);

        this.tweens.add({
          targets: brick.container,
          x: targetX,
          y: targetY,
          angle: Phaser.Math.Between(-150, 150),
          scale: 0.15,
          alpha: 0,
          duration: 460,
          ease: 'Cubic.easeOut',
          onComplete: () => brick.container.destroy(),
        });
      });

      activeRow.container.destroy();

      // Floating "+10" score burst
      const plusTen = this.add
        .text(rowWorldX, rowWorldY - 12, '+10', {
          fontFamily: FONT_MONO,
          fontSize: '34px',
          fontStyle: 'bold',
          color: '#fde047',
          stroke: '#2b1306',
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(25);

      this.tweens.add({
        targets: plusTen,
        y: rowWorldY - 96,
        scale: 1.3,
        alpha: 0,
        duration: 680,
        ease: 'Cubic.easeOut',
        onComplete: () => plusTen.destroy(),
      });

      this.cameras.main.shake(95, 0.0032);

      // Advance stack
      this.rowItems.shift();

      if (this.nextWordIdx < this.wordQueue.length) {
        const nextVocab = this.wordQueue[this.nextWordIdx++];
        const topSlot = this.rowItems.length;
        const newRow = this.createWordRow(nextVocab, topSlot);
        const m = this.getLayoutMetrics();
        newRow.container.y = m.baseY - (topSlot + 1) * m.rowPitch - 30;
        newRow.container.alpha = 0;
        this.rowItems.push(newRow);
      }

      const m = this.getLayoutMetrics();
      this.rowItems.forEach((row, slot) => {
        const isNowActive = slot === 0;
        if (isNowActive) {
          row.bricks.forEach((b) =>
            this.paintBrick(b.bg, b.width, b.height, b.baseColor, false, true)
          );
        }

        this.tweens.add({
          targets: row.container,
          y: m.baseY - slot * m.rowPitch,
          scale: this.getSlotScale(slot),
          alpha: this.getSlotAlpha(slot),
          duration: 320,
          ease: 'Bounce.easeOut',
        });
      });

      this.updateHUDValues();
      this.tweens.add({
        targets: this.scoreValueText,
        scale: 1.28,
        duration: 110,
        yoyo: true,
        ease: 'Quad.easeOut',
      });

      if (this.rowItems.length === 0) {
        this.updateActiveWordDisplay();
        this.time.delayedCall(420, () => {
          if (this.isPlaying) {
            this.endSession('completed');
          }
        });
        return;
      }

      this.updateActiveWordDisplay();
    }

    /**
     * Failure: play error SFX, flash blocks red, shake horizontally, allow retry.
     */
    handleIncorrectWord(activeRow) {
      this.playSfx('sfx-fail', 0.78);

      this.mistakes += 1;
      this.streak = 0;
      this.updateHUDValues();

      activeRow.isErrorHighlighted = true;
      activeRow.bricks.forEach((brick) => {
        this.paintBrick(brick.bg, brick.width, brick.height, brick.baseColor, true, true);
        brick.label.setColor('#ffffff');
        brick.label.setStroke('#7f1d1d', 3);
      });

      const m = this.getLayoutMetrics();
      this.tweens.killTweensOf(activeRow.container);
      activeRow.container.x = m.centerX;
      this.tweens.add({
        targets: activeRow.container,
        x: m.centerX + 14,
        duration: 45,
        yoyo: true,
        repeat: 4,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          if (activeRow.container && activeRow.container.active) {
            activeRow.container.x = m.centerX;
          }
        },
      });

      const errLabel = this.add
        .text(m.centerX, m.baseY - activeRow.brickHeight / 2 - 22, '✗ Incorrect', {
          fontFamily: FONT_UI,
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#fca5a5',
          stroke: '#450a0a',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(25);

      this.tweens.add({
        targets: errLabel,
        y: errLabel.y - 26,
        alpha: 0,
        duration: 700,
        ease: 'Cubic.easeOut',
        onComplete: () => errLabel.destroy(),
      });

      if (this.errorResetTimer) {
        this.errorResetTimer.remove(false);
      }
      this.errorResetTimer = this.time.delayedCall(850, () => {
        if (!activeRow.container || !activeRow.container.active) return;
        activeRow.isErrorHighlighted = false;
        activeRow.bricks.forEach((brick) => {
          this.paintBrick(brick.bg, brick.width, brick.height, brick.baseColor, false, true);
          brick.label.setColor(brick.isLightTile ? '#271205' : '#fef3c7');
          brick.label.setStroke(
            brick.isLightTile ? '#fef9c3' : '#1c0c04',
            brick.isLightTile ? 1 : 3
          );
        });
      });
    }

    updateHUDValues() {
      this.scoreValueText.setText(String(this.score));
      this.progressText.setText(`Words: ${this.wordsCleared} / ${this.totalWords}`);
      this.streakText.setText(
        this.streak > 1 ? `Streak: x${this.streak}` : `Mistakes: ${this.mistakes}`
      );
    }

    /**
     * Render the visual RTL mini-tiles inside the Arabic Syllable Minimap card.
     */
    renderArabicSyllableMinimap(vocab, maxInnerW) {
      this.syllableTilesContainer.removeAll(true);
      const syllables = vocab.arSyllables || [];
      if (syllables.length === 0) return;

      const tileColors = [0xd97706, 0xc2410c, 0x0d9488, 0xb45309, 0x0284c7, 0x9a3412];
      const gap = syllables.length >= 6 ? 4 : 6;
      const tileH = 38;
      const idealTileW = 48;
      const tileW = Phaser.Math.Clamp(
        Math.floor((maxInnerW - gap * (syllables.length - 1)) / syllables.length),
        28,
        idealTileW
      );
      const totalW = syllables.length * tileW + (syllables.length - 1) * gap;
      const startX = -totalW / 2 + tileW / 2;

      syllables.forEach((syl, idx) => {
        // Place syllables RTL so syllable 0 sits on the right
        const visualIdx = syllables.length - 1 - idx;
        const tx = startX + visualIdx * (tileW + gap);
        const bgColor = tileColors[idx % tileColors.length];

        const tileBg = this.add.graphics();
        tileBg.fillStyle(bgColor, 0.94);
        tileBg.fillRoundedRect(tx - tileW / 2, -tileH / 2, tileW, tileH, 8);
        tileBg.lineStyle(1.5, 0xfef3c7, 0.65);
        tileBg.strokeRoundedRect(tx - tileW / 2, -tileH / 2, tileW, tileH, 8);

        const fontSize = syl.text.length >= 3 ? 16 : 20;
        const tileText = this.add
          .text(tx, -1, syl.text, {
            fontFamily: FONT_ARABIC,
            fontSize: `${fontSize}px`,
            fontStyle: 'bold',
            color: '#fef3c7',
            padding: { left: 4, right: 4, top: 6, bottom: 6 },
          })
          .setOrigin(0.5);

        const rawW = Math.max(1, tileText.width - 8);
        if (rawW > tileW - 6) {
          tileText.setScale((tileW - 6) / rawW);
        }

        this.syllableTilesContainer.add([tileBg, tileText]);
      });
    }

    /**
     * Refresh Bottom-Left Target Word card, Bottom-Right Upper Arabic Syllable Minimap,
     * and Bottom-Right Lower Translation Minimap.
     */
    updateActiveWordDisplay() {
      const active = this.rowItems[0];
      const m = this.getLayoutMetrics();

      if (!active) {
        this.wordValueText.setText('');
        this.wordLettersText.setText('');
        this.wordTagsText.setText('');
        this.syllableTilesContainer.removeAll(true);
        this.syllableRomanText.setText('');
        this.translationValueText.setText('');
        this.translationSubText.setText('');
        this.updateActiveRailPosition();
        return;
      }

      const vocab = active.vocab;
      const isArabicMode = this.practiceMode === 'ar-to-en';
      const maxCardInnerW = m.sideCardW - 32;

      // 1. Bottom-Left: Active Target Word
      if (isArabicMode) {
        this.wordHeaderText.setText('ARABIC WORD');
        const arLen = vocab.arLetters.length;
        const wordFontSize = arLen > 7 ? 24 : arLen > 5 ? 28 : 32;
        this.wordValueText
          .setFontFamily(FONT_ARABIC)
          .setFontSize(`${wordFontSize}px`)
          .setText(vocab.arabic);
        this.wordLettersText
          .setFontFamily(FONT_ARABIC)
          .setFontSize('14px')
          .setText(vocab.letterBreakdown);
        this.wordTagsText.setText(`RTL · ${vocab.tags.join(' · ')}`);
      } else {
        this.wordHeaderText.setText('ENGLISH WORD');
        const enLen = vocab.enLetters.length;
        const wordFontSize = enLen > 12 ? 20 : enLen > 8 ? 24 : 28;
        this.wordValueText
          .setFontFamily(FONT_UI)
          .setFontSize(`${wordFontSize}px`)
          .setText(vocab.english);
        this.wordLettersText
          .setFontFamily(FONT_MONO)
          .setFontSize('12px')
          .setText(vocab.enLetters.map((l) => l.text).join(' · '));
        this.wordTagsText.setText(`LTR · Arabic: ${vocab.tags.join(' · ')}`);
      }

      this.wordValueText.setScale(1);
      if (this.wordValueText.width > maxCardInnerW) {
        this.wordValueText.setScale(maxCardInnerW / this.wordValueText.width);
      }
      this.wordLettersText.setScale(1);
      if (this.wordLettersText.width > maxCardInnerW) {
        this.wordLettersText.setScale(maxCardInnerW / this.wordLettersText.width);
      }

      // 2. Bottom-Right (UPPER): Arabic Syllable Minimap (always shown for the active pair)
      this.renderArabicSyllableMinimap(vocab, maxCardInnerW);
      this.syllableRomanText.setText(vocab.syllableBreakdown);
      this.syllableRomanText.setScale(1);
      if (this.syllableRomanText.width > maxCardInnerW) {
        this.syllableRomanText.setScale(maxCardInnerW / this.syllableRomanText.width);
      }

      // 3. Bottom-Right (LOWER): Translation Minimap
      if (isArabicMode) {
        this.translationHeaderText.setText('ENGLISH TRANSLATION');
        const enFontSize = vocab.english.length > 13 ? 20 : vocab.english.length > 9 ? 23 : 26;
        this.translationValueText
          .setFontFamily(FONT_UI)
          .setFontSize(`${enFontSize}px`)
          .setText(vocab.english);
        this.translationSubText
          .setFontFamily(FONT_UI)
          .setText(`Type Arabic (${vocab.arLetters.length} letters)`);
      } else {
        this.translationHeaderText.setText('ARABIC TRANSLATION');
        const arFontSize = vocab.arLetters.length > 7 ? 24 : 28;
        this.translationValueText
          .setFontFamily(FONT_ARABIC)
          .setFontSize(`${arFontSize}px`)
          .setText(vocab.arabic);
        this.translationSubText
          .setFontFamily(FONT_UI)
          .setText(`Type English (${vocab.enLetters.length} letters)`);
      }

      this.translationValueText.setScale(1);
      if (this.translationValueText.width > maxCardInnerW) {
        this.translationValueText.setScale(maxCardInnerW / this.translationValueText.width);
      }
      this.translationSubText.setScale(1);
      if (this.translationSubText.width > maxCardInnerW) {
        this.translationSubText.setScale(maxCardInnerW / this.translationSubText.width);
      }

      const bottomLeftY = m.h - m.margin - m.sideCardH;
      const rightX = m.w - m.margin - m.sideCardW;
      const transY = m.h - m.margin - m.translationCardH;
      const sylY = transY - m.minimapGap - m.syllableCardH;

      this.drawCountBadge(m.margin + m.sideCardW - 48, bottomLeftY + 20);
      this.drawSyllableBadge(rightX + m.sideCardW - 42, sylY + 20);
      this.updateActiveRailPosition();
    }

    tickTimer() {
      if (!this.isPlaying) return;

      const elapsed = performance.now() - this.sessionStartMs;
      this.remainingMs = Math.max(0, this.durationMs - elapsed);
      this.updateTimerDisplay(false);

      if (this.remainingMs <= 0) {
        this.endSession('timeout');
      }
    }

    updateTimerDisplay(force) {
      const totalSec = Math.ceil(this.remainingMs / 1000);
      if (!force && totalSec === this.lastDisplayedSec) return;
      this.lastDisplayedSec = totalSec;

      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      this.timeValueText.setText(formatted);

      if (totalSec <= 15) {
        this.timeValueText.setColor('#f87171');
        this.tweens.add({
          targets: this.timeValueText,
          scale: 1.12,
          duration: 130,
          yoyo: true,
        });
      } else if (totalSec <= 30) {
        this.timeValueText.setColor('#fbbf24');
      } else {
        this.timeValueText.setColor('#fef3c7');
      }
    }

    /**
     * Stop gameplay and report Score, WPM, Accuracy, and Elapsed Time.
     * @param {'timeout' | 'completed' | 'quit'} reason
     */
    endSession(reason) {
      if (!this.isPlaying) return;
      this.isPlaying = false;

      if (this.timerEvent) {
        this.timerEvent.remove(false);
        this.timerEvent = null;
      }

      const elapsedMs =
        reason === 'timeout'
          ? this.durationMs
          : Math.max(1000, performance.now() - this.sessionStartMs);
      const elapsedSeconds = elapsedMs / 1000;
      const elapsedMinutes = Math.max(elapsedSeconds / 60, 1 / 60);

      const wpm = this.wordsCleared / elapsedMinutes;
      const totalAttempts = this.wordsCleared + this.mistakes;
      const accuracy = totalAttempts > 0 ? Math.round((this.wordsCleared / totalAttempts) * 100) : 0;

      this.updateActiveRailPosition();

      if (this.callbacks && typeof this.callbacks.onGameOver === 'function') {
        this.callbacks.onGameOver({
          reason,
          practiceMode: this.practiceMode,
          score: this.score,
          wordsCleared: this.wordsCleared,
          totalWords: this.totalWords,
          mistakes: this.mistakes,
          elapsedSeconds,
          wpm,
          accuracy,
        });
      }
    }
  }

  global.ArabicGameScene = ArabicGameScene;
})(window);
