/* ============================================================
   원탭 숏폼 스튜디오 · render.js  v1.0.0
   ------------------------------------------------------------
   Canvas 1080×1920(9:16) 장면 그리기 + 실시간 미리보기 +
   MediaRecorder 로 실제 .webm 파일 녹화 + Web Audio 배경음.

   이 파일은 브라우저 전용이다. 순수 로직은 core.js.
   ============================================================ */
(function (root) {
  'use strict';
  var C = root.ShortsCore;
  var W = 1080, H = 1920;
  var M = 96, TEXT_W = 800, SAFE_BOTTOM = 1668;
  var FONT = "'PlexKR', 'Pretendard', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
  var noisePattern = null;

  /* ── 작은 유틸 ─────────────────────────────────────────── */
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }

  function font(size, weight) { return (weight || 700) + ' ' + size + 'px ' + FONT; }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, rr); return; }
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function luminance(hex) {
    var h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    function s(v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * s(r) + 0.7152 * s(g) + 0.0722 * s(b);
  }
  function readableOn(bg) { return luminance(bg) > 0.45 ? '#141414' : '#FFFFFF'; }

  function withAlpha(hex, a) {
    var h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function noise(ctx, alpha) {
    if (!noisePattern && typeof document !== 'undefined') {
      var c = document.createElement('canvas');
      c.width = c.height = 160;
      var nctx = c.getContext('2d');
      var img = nctx.createImageData(160, 160);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = 120 + Math.random() * 135;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 26;
      }
      nctx.putImageData(img, 0, 0);
      noisePattern = ctx.createPattern(c, 'repeat');
    }
    if (!noisePattern) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = noisePattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* ── 폰트 ─────────────────────────────────────────────── */
  function loadFonts() {
    if (!document.fonts) return Promise.resolve([]);
    return Promise.all([
      document.fonts.load('400 48px PlexKR'),
      document.fonts.load('600 48px PlexKR'),
      document.fonts.load('700 48px PlexKR'),
      document.fonts.load('800 48px PlexKR')
    ]).catch(function () { return []; });
  }

  /* ── 배경 ─────────────────────────────────────────────── */
  function drawBackground(ctx, s) {
    var th = s.theme, g;
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);

    if (th.deco === 'paper') {
      g = ctx.createLinearGradient(0, H * 0.45, 0, H);
      g.addColorStop(0, withAlpha(th.bg, 0));
      g.addColorStop(1, withAlpha(th.bg2, 0.85));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = withAlpha(th.line, 0.75);
      ctx.lineWidth = 2;
      [300, 1500].forEach(function (y) { ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke(); });
      ctx.fillStyle = withAlpha(th.accent, 0.07);
      ctx.beginPath(); ctx.arc(W * 0.86, H * 0.2, 360, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(W * 0.1, H * 0.9, 260, 0, Math.PI * 2); ctx.fill();
      drawBigNumber(ctx, s, withAlpha(th.ink, 0.055));
    } else if (th.deco === 'cinema') {
      g = ctx.createLinearGradient(0, 0, W * 0.4, H);
      g.addColorStop(0, th.bg); g.addColorStop(0.55, th.bg2); g.addColorStop(1, th.bg);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      var glow = ctx.createRadialGradient(W * 0.72, H * 0.34, 20, W * 0.72, H * 0.34, 640);
      glow.addColorStop(0, withAlpha(th.accent, 0.22));
      glow.addColorStop(1, withAlpha(th.accent, 0));
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#0A0806';
      ctx.fillRect(0, 0, W, 90); ctx.fillRect(0, H - 90, W, 90);
      ctx.fillStyle = withAlpha(th.accent, 0.85);
      ctx.fillRect(M, 88, 84, 3);
      drawBigNumber(ctx, s, withAlpha(th.accent, 0.1));
    } else if (th.deco === 'neon') {
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      var gl = ctx.createRadialGradient(W * 0.82, H * 0.24, 10, W * 0.82, H * 0.24, 620);
      gl.addColorStop(0, withAlpha(th.accent, 0.2)); gl.addColorStop(1, withAlpha(th.accent, 0));
      ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
      var gl2 = ctx.createRadialGradient(W * 0.15, H * 0.82, 10, W * 0.15, H * 0.82, 520);
      gl2.addColorStop(0, 'rgba(255,79,216,0.13)'); gl2.addColorStop(1, 'rgba(255,79,216,0)');
      ctx.fillStyle = gl2; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = withAlpha(th.line, 0.9); ctx.lineWidth = 1;
      for (var gx = 120; gx < W; gx += 120) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
      for (var gy = 240; gy < H; gy += 240) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
      ctx.strokeStyle = withAlpha(th.accent, 0.85); ctx.lineWidth = 4;
      [[M, 150], [W - M, 150]].forEach(function (p, i) {
        var dir = i === 0 ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(p[0], p[1] + 46); ctx.lineTo(p[0], p[1]); ctx.lineTo(p[0] + dir * 46, p[1]); ctx.stroke();
      });
      drawBigNumber(ctx, s, withAlpha(th.accent, 0.12));
    } else if (th.deco === 'gradient') {
      g = ctx.createLinearGradient(0, 0, W * 0.9, H);
      g.addColorStop(0, th.bg); g.addColorStop(0.52, '#A3263F'); g.addColorStop(1, th.bg2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      var drift = Math.sin((s.globalP || 0) * Math.PI * 2) * 30;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.arc(W * 0.78 + drift, H * 0.16, 300, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = withAlpha(th.accent, 0.16);
      ctx.beginPath(); ctx.arc(W * 0.2 - drift, H * 0.86, 380, 0, Math.PI * 2); ctx.fill();
      var g2 = ctx.createLinearGradient(0, H * 0.55, 0, H);
      g2.addColorStop(0, 'rgba(20,0,15,0)'); g2.addColorStop(1, 'rgba(20,0,15,0.45)');
      ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
      drawBigNumber(ctx, s, 'rgba(255,255,255,0.09)');
    } else if (th.deco === 'clean') {
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, withAlpha(th.bg2, 0.9)); g.addColorStop(0.5, withAlpha(th.bg, 0)); g.addColorStop(1, withAlpha(th.bg2, 0.7));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = withAlpha(th.line, 0.9); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(M - 30, 420); ctx.lineTo(M - 30, 1360); ctx.stroke();
      ctx.strokeStyle = withAlpha(th.accent, 0.9); ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(M - 30, 640 + Math.min(420, s.index * 40)); ctx.lineTo(M - 30, 900 + Math.min(420, s.index * 40)); ctx.stroke();
      ctx.strokeStyle = withAlpha(th.line, 0.8); ctx.lineWidth = 2;
      [[W - M - 26, 300], [W - M - 26, 1620]].forEach(function (p) {
        ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p[0] - 26, p[1]); ctx.lineTo(p[0] + 26, p[1]); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p[0], p[1] - 26); ctx.lineTo(p[0], p[1] + 26); ctx.stroke();
      });
      drawBigNumber(ctx, s, withAlpha(th.accent, 0.07));
    } else if (th.deco === 'brutal') {
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, 360); ctx.clip();
      ctx.strokeStyle = 'rgba(20,20,20,0.14)'; ctx.lineWidth = 26;
      for (var sx = -200; sx < W + 200; sx += 74) {
        ctx.beginPath(); ctx.moveTo(sx, 360); ctx.lineTo(sx + 240, 0); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = th.ink; ctx.lineWidth = 14;
      ctx.strokeRect(38, 38, W - 76, H - 76);
      ctx.fillStyle = th.ink; ctx.fillRect(W - 280, H - 250, 170, 10);
      ctx.fillStyle = withAlpha(th.ink, 0.06);
      ctx.beginPath(); ctx.arc(W * 0.2, H * 0.78, 340, 0, Math.PI * 2); ctx.fill();
      drawBigNumber(ctx, s, 'rgba(20,20,20,0.10)');
    }

    if (th.vignette) {
      var v = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.22, W / 2, H * 0.5, H * 0.78);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,' + th.vignette + ')');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
  }

  function drawBigNumber(ctx, s, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = font(420, 800);
    ctx.textAlign = 'right';
    ctx.fillText(('0' + (s.index + 1)).slice(-2), W - 44, H - 190);
    ctx.restore();
  }

  /* ── 사진 배경 ─────────────────────────────────────────── */
  function drawImageLayer(ctx, img, p) {
    if (!img || !img.width) return false;
    var scale = Math.max(W / img.width, H / img.height) * (1.03 + 0.055 * p);
    var dw = img.width * scale, dh = img.height * scale;
    var dx = (W - dw) / 2, dy = (H - dh) / 2 - 24 * p;
    ctx.save();
    ctx.drawImage(img, dx, dy, dw, dh);
    var scrim = ctx.createLinearGradient(0, 0, 0, H);
    scrim.addColorStop(0, 'rgba(10,8,6,0.5)');
    scrim.addColorStop(0.34, 'rgba(10,8,6,0.18)');
    scrim.addColorStop(0.62, 'rgba(10,8,6,0.42)');
    scrim.addColorStop(1, 'rgba(8,6,4,0.9)');
    ctx.fillStyle = scrim; ctx.fillRect(0, 0, W, H);
    var side = ctx.createLinearGradient(0, 0, W * 0.85, 0);
    side.addColorStop(0, 'rgba(8,6,4,0.5)');
    side.addColorStop(1, 'rgba(8,6,4,0)');
    ctx.fillStyle = side; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return true;
  }

  /* ── 글자 ─────────────────────────────────────────────── */
  function wrapByWidth(ctx, text, maxW) {
    var words = String(text).replace(/\s+/g, ' ').trim().split(' ');
    var lines = [], line = '';
    function breakLong(w) {
      var out = '', i = 0;
      while (i < w.length) {
        var chunk = w.slice(i, i + 1);
        if (ctx.measureText(out + chunk).width > maxW && out) { lines.push(out); out = chunk; }
        else out += chunk;
        i++;
      }
      return out;
    }
    words.forEach(function (w) {
      if (!w) return;
      var test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width <= maxW) { line = test; return; }
      if (line) lines.push(line);
      line = ctx.measureText(w).width > maxW ? breakLong(w) : w;
    });
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function fitHeadline(ctx, text, maxW, maxLines, startSize, minSize, weight) {
    var size = startSize;
    for (; size >= minSize; size -= 2) {
      ctx.font = font(size, weight);
      var lines = wrapByWidth(ctx, text, maxW);
      if (lines.length <= maxLines) return { size: size, lines: lines };
    }
    ctx.font = font(minSize, weight);
    var lines = wrapByWidth(ctx, text, maxW).slice(0, maxLines);
    return { size: minSize, lines: lines };
  }

  function highlightTokens(cut) {
    var tokens = (cut.highlight && cut.highlight.length) ? cut.highlight : C.findHighlights(cut.headline, 2);
    return tokens.filter(Boolean);
  }

  function drawSegments(ctx, segments, x, baseline, size, th, capStyle, colors) {
    var cursor = x;
    ctx.textBaseline = 'alphabetic';
    segments.forEach(function (seg) {
      ctx.font = font(size, th.weight || 700);
      var w = ctx.measureText(seg.text).width;
      if (seg.hl) {
        var pad = size * 0.14;
        if (capStyle === 'chip' || capStyle === 'solid') {
          var bg = capStyle === 'solid' ? colors.ink : th.accent;
          var fg = capStyle === 'solid' ? colors.bg : readableOn(th.accent);
          roundRect(ctx, cursor - pad, baseline - size * 0.86, w + pad * 2, size * 1.06, capStyle === 'chip' ? size * 0.16 : 2);
          ctx.fillStyle = bg; ctx.fill();
          ctx.fillStyle = fg;
        } else if (capStyle === 'bar') {
          ctx.fillStyle = th.accent;
        } else {
          ctx.fillStyle = withAlpha(th.accent, 0.2);
          roundRect(ctx, cursor - pad * 0.7, baseline - size * 0.78, w + pad * 1.4, size * 0.98, size * 0.08);
          ctx.fill();
          ctx.fillStyle = th.accent;
        }
      } else {
        ctx.fillStyle = colors.ink;
      }
      ctx.fillText(seg.text, cursor, baseline);
      cursor += w;
    });
  }

  function drawStageChip(ctx, s, colors) {
    var stage = C.stageById(s.cut.stage);
    var y = 150;
    ctx.save();
    ctx.globalAlpha = s.chipAlpha;
    ctx.strokeStyle = withAlpha(colors.chipAccent, 0.55);
    ctx.lineWidth = 2;
    roundRect(ctx, M, y, 68, 44, 22);
    ctx.stroke();
    ctx.fillStyle = colors.chipAccent;
    ctx.font = font(24, 700);
    ctx.textBaseline = 'middle';
    ctx.fillText(('0' + (s.index + 1)).slice(-2), M + 18, y + 23);
    ctx.font = font(24, 700);
    ctx.letterSpacing = '5px';
    ctx.fillText(stage.en, M + 92, y + 23);
    ctx.letterSpacing = '0px';
    ctx.font = font(23, 500);
    ctx.fillStyle = withAlpha(colors.ink, 0.7);
    ctx.fillText(stage.label, M + 92 + stage.en.length * 17 + 18, y + 23);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  /* ── 한 장면 ──────────────────────────────────────────── */
  function drawScene(ctx, s) {
    var th = s.theme;
    var cut = s.cut;
    var p = clamp(s.p, 0, 1);
    var hasImage = !!(s.image);

    ctx.save();
    if (s.scale && s.scale !== 1) {
      ctx.translate(W / 2, H / 2); ctx.scale(s.scale, s.scale); ctx.translate(-W / 2, -H / 2);
    }
    if (s.alpha !== undefined && s.alpha < 1) ctx.globalAlpha = Math.max(0, s.alpha);

    drawBackground(ctx, s);
    if (hasImage) drawImageLayer(ctx, s.image, p);
    if (th.deco !== 'neon') noise(ctx, th.deco === 'paper' ? 0.05 : 0.07);

    var colors = hasImage
      ? { ink: '#FFFCF4', sub: '#EFE3D3', bg: '#0C0A08', chipAccent: th.accent }
      : { ink: th.ink, sub: th.sub, bg: th.bg, chipAccent: th.accent };

    if (hasImage) {
      var bottomShade = ctx.createLinearGradient(0, H * 0.55, 0, H);
      bottomShade.addColorStop(0, 'rgba(6,5,4,0)');
      bottomShade.addColorStop(1, 'rgba(6,5,4,0.55)');
      ctx.fillStyle = bottomShade; ctx.fillRect(0, 0, W, H);
    }

    var tMs = p * (cut.duration || 3) * 1000;
    var e1 = easeOut(Math.min(1, tMs / 420));
    var e2 = easeOut(Math.min(1, Math.max(0, (tMs - 130) / 460)));
    var e3 = easeOut(Math.min(1, tMs / 300));
    s.chipAlpha = e3;

    var showText = s.project.showCaption !== false;

    if (showText) drawStageChip(ctx, s, colors);

    // 제목
    var headline = C.stripMarks(cut.headline || '');
    var maxW = hasImage ? 820 : TEXT_W;
    var fit = fitHeadline(ctx, headline, maxW, 4, 128, 62, th.weight || 700);
    var lh = Math.round(fit.size * 1.16);
    var blockH = fit.lines.length * lh;
    var top = 930 - blockH / 2 + (hasImage ? 30 : 0);
    if (top < 300) top = 300;
    var tokens = highlightTokens(cut);

    ctx.save();
    ctx.globalAlpha = e1;
    ctx.translate(0, (1 - e1) * 46);
    var baseline = top + fit.size * 0.86;
    if (showText) fit.lines.forEach(function (line, i) {
      var segments = C.splitHighlight(line, tokens);
      drawSegments(ctx, segments, M, baseline + i * lh, fit.size, th, hasImage ? 'chip' : th.cap, colors);
    });
    ctx.restore();

    // 보조 문장
    if (cut.sub && showText) {
      ctx.save();
      ctx.globalAlpha = e2;
      ctx.translate(0, (1 - e2) * 28);
      ctx.font = font(40, 400);
      var subLines = wrapByWidth(ctx, C.stripMarks(cut.sub), maxW - 40).slice(0, 3);
      var subTop = top + blockH + 46;
      ctx.fillStyle = hasImage ? colors.sub : withAlpha(colors.sub, 0.95);
      subLines.forEach(function (line, i) {
        ctx.fillText(line, M, subTop + 40 + i * 62);
      });
      ctx.restore();
    }

    // CTA 표시
    if (cut.stage === 'cta' && showText) {
      ctx.save();
      ctx.globalAlpha = e2 * 0.9;
      ctx.strokeStyle = withAlpha(th.accent, 0.9);
      ctx.lineWidth = 5; ctx.lineCap = 'round';
      var ay = H - 300;
      ctx.beginPath(); ctx.moveTo(M, ay); ctx.lineTo(M + 34, ay); ctx.lineTo(M + 22, ay - 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(M, ay); ctx.lineTo(M + 34, ay); ctx.lineTo(M + 22, ay + 12); ctx.stroke();
      ctx.restore();
    }

    // 워터마크 · 컷 점 · 진행 바
    var bottomY = H - 132;
    if (s.project.handle) {
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = colors.sub;
      ctx.font = font(28, 500);
      ctx.fillText('@' + String(s.project.handle).replace(/^@/, ''), M, bottomY);
      ctx.restore();
    }

    ctx.save();
    var dotY = H - 196, dotW = 46, gap = 12;
    for (var i = 0; i < s.total; i++) {
      ctx.fillStyle = i === s.index ? th.accent : withAlpha(colors.ink, 0.22);
      roundRect(ctx, M + i * (dotW + gap), dotY, dotW, 5, 3);
      ctx.fill();
    }
    ctx.restore();

    if (s.project.showProgress) {
      ctx.save();
      ctx.fillStyle = withAlpha(colors.ink, 0.14);
      ctx.fillRect(0, H - 58, W, 10);
      var fillW = W * clamp(s.globalP, 0, 1);
      ctx.fillStyle = th.accent;
      ctx.fillRect(0, H - 58, fillW, 10);
      var knob = ctx.createRadialGradient(fillW, H - 53, 0, fillW, H - 53, 24);
      knob.addColorStop(0, withAlpha(th.accent, 0.9)); knob.addColorStop(1, withAlpha(th.accent, 0));
      ctx.fillStyle = knob; ctx.fillRect(Math.max(0, fillW - 24), H - 77, 48, 48);
      ctx.restore();
    }

    ctx.restore();
  }

  /* ── 시간축 프레임 ─────────────────────────────────────── */
  function resolveFrame(cuts, ms) {
    var tl = C.timeline(cuts);
    var total = tl.length ? tl[tl.length - 1].end : 1;
    var t = clamp(ms, 0, Math.max(0, total - 1));
    var i = 0;
    for (var k = 0; k < tl.length; k++) { if (t >= tl[k].start) i = k; }
    var seg = tl[i] || tl[0];
    return { timeline: tl, index: i, seg: seg, total: total, local: t - seg.start };
  }

  /**
   * 특정 시점의 프레임을 그린다.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} s {cuts, project, theme, ms, images: {cutId: Image}}
   */
  function drawFrame(ctx, s) {
    var cuts = s.cuts || [];
    if (!cuts.length) return;
    var fr = resolveFrame(cuts, s.ms);
    var cut = cuts[fr.index];
    var project = s.project || {};
    var theme = s.theme || C.themeById(project.theme);
    var images = s.images || {};
    var trans = project.transition || 'fade';
    var TD = 340;
    var localP = fr.seg.duration ? clamp(fr.local / fr.seg.duration, 0, 1) : 0;
    var globalP = fr.total ? clamp(s.ms / fr.total, 0, 1) : 0;

    ctx.setTransform(s.scaleX || 1, 0, 0, s.scaleY || 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var base = {
      cuts: cuts, project: project, theme: theme, total: cuts.length,
      globalP: globalP, images: images
    };

    var inTransition = fr.index > 0 && fr.local < TD && trans !== 'none';
    if (inTransition) {
      var prev = cuts[fr.index - 1];
      drawScene(ctx, Object.assign({}, base, {
        cut: prev, index: fr.index - 1, p: 1, image: images[prev.id], alpha: 1
      }));
      var q = clamp(fr.local / TD, 0, 1);
      if (trans === 'zoom') {
        drawScene(ctx, Object.assign({}, base, {
          cut: cut, index: fr.index, p: localP, image: images[cut.id],
          alpha: 0.15 + 0.85 * q, scale: 1.1 - 0.1 * easeOut(q)
        }));
      } else {
        drawScene(ctx, Object.assign({}, base, {
          cut: cut, index: fr.index, p: localP, image: images[cut.id], alpha: easeOut(q)
        }));
      }
    } else {
      drawScene(ctx, Object.assign({}, base, {
        cut: cut, index: fr.index, p: localP, image: images[cut.id], alpha: 1
      }));
    }
    return fr;
  }

  /* ── 미리보기 재생기 ───────────────────────────────────── */
  function Preview(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.project = null;
    this.images = {};
    this.ms = 0;
    this.playing = false;
    this.loop = false;
    this.raf = 0;
    this.last = 0;
    this.onTick = null;
    this.onEnd = null;
    this.scaleX = canvas.width / W;
    this.scaleY = canvas.height / H;
  }
  Preview.prototype.setProject = function (project, images, keepMs) {
    this.project = project;
    this.images = images || {};
    if (!keepMs) this.ms = 0;
    this.render();
  };
  Preview.prototype.duration = function () {
    return this.project ? C.totalMs(this.project.cuts) : 0;
  };
  Preview.prototype.render = function () {
    if (!this.project) return;
    if (this.canvas.width !== Math.round(W * this.scaleX)) { this.scaleX = this.canvas.width / W; }
    var ms = this.ms;
    // 멈춰 있을 때 0ms면 등장 애니메이션 때문에 빈 화면처럼 보인다. 살짝 진행된 프레임을 보여 준다.
    if (!this.playing && ms < 380) ms = 380;
    drawFrame(this.ctx, {
      cuts: this.project.cuts, project: this.project,
      theme: C.themeById(this.project.theme), ms: ms,
      images: this.images, scaleX: this.scaleX, scaleY: this.scaleY
    });
  };
  Preview.prototype.seek = function (ms) {
    var total = this.duration();
    this.ms = clamp(ms, 0, Math.max(0, total - 1));
    this.render();
    if (this.onTick) this.onTick(this.ms, total);
  };
  Preview.prototype.play = function () {
    var self = this;
    if (this.playing || !this.project) return;
    if (this.duration() <= 0) return;
    if (this.ms >= this.duration() - 30) this.ms = 0;
    this.playing = true;
    this.last = performance.now();
    function step(now) {
      if (!self.playing) return;
      var dt = now - self.last;
      self.last = now;
      self.ms += Math.min(120, dt);
      if (self.ms >= self.duration()) {
        if (self.loop) self.ms = 0;
        else { self.ms = self.duration() - 1; self.playing = false; self.render(); if (self.onTick) self.onTick(self.ms, self.duration()); if (self.onEnd) self.onEnd(); return; }
      }
      self.render();
      if (self.onTick) self.onTick(self.ms, self.duration());
      self.raf = requestAnimationFrame(step);
    }
    this.raf = requestAnimationFrame(step);
  };
  Preview.prototype.pause = function () {
    this.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  };
  Preview.prototype.toggle = function () { if (this.playing) this.pause(); else this.play(); };

  /* ── 배경음 · 효과음 합성 ─────────────────────────────── */
  function makeNoise(ac, seconds) {
    var len = Math.floor(ac.sampleRate * (seconds || 1));
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function AudioEngine(style, opts) {
    opts = opts || {};
    this.ok = false;
    this.style = style || 'lofi';
    var Ctx = root.AudioContext || root.webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ac = new Ctx();
      this.master = this.ac.createGain();
      this.master.gain.value = 0;
      this.dest = this.ac.createMediaStreamDestination();
      this.master.connect(this.dest);
      if (opts.monitor) {
        this.out = this.ac.createGain();
        this.out.gain.value = opts.volume === undefined ? 0.5 : opts.volume;
        this.master.connect(this.out);
        this.out.connect(this.ac.destination);
      }
      this.noiseBuf = makeNoise(this.ac, 2);
      this.voices = [];
      this.timer = 0;
      this.ok = true;
    } catch (e) { this.ok = false; }
  }
  AudioEngine.prototype.stream = function () { return this.dest ? this.dest.stream : null; };
  AudioEngine.prototype.resume = function () {
    if (this.ac && this.ac.state === 'suspended') return this.ac.resume().catch(function () {});
    return Promise.resolve();
  };
  AudioEngine.prototype.tone = function (freq, at, dur, type, gain, filterFreq) {
    var ac = this.ac;
    var osc = ac.createOscillator();
    var g = ac.createGain();
    osc.type = type || 'triangle';
    osc.frequency.value = freq;
    var node = g;
    if (filterFreq) {
      var f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = filterFreq;
      g.connect(f); node = f;
    }
    osc.connect(g);
    node.connect(this.master);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), at + Math.min(0.35, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  };
  AudioEngine.prototype.kick = function (at, gain) {
    var ac = this.ac;
    var osc = ac.createOscillator();
    var g = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, at);
    osc.frequency.exponentialRampToValueAtTime(44, at + 0.16);
    g.gain.setValueAtTime(gain || 0.55, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.connect(g); g.connect(this.master);
    osc.start(at); osc.stop(at + 0.26);
  };
  AudioEngine.prototype.hat = function (at, gain) {
    var ac = this.ac;
    var src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    var hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7200;
    var g = ac.createGain();
    g.gain.setValueAtTime(gain || 0.05, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    src.connect(hp); hp.connect(g); g.connect(this.master);
    src.start(at); src.stop(at + 0.08);
  };
  AudioEngine.prototype.whoosh = function (at) {
    var ac = this.ac;
    var src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(420, at);
    bp.frequency.exponentialRampToValueAtTime(2600, at + 0.42);
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.12, at + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.46);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(at); src.stop(at + 0.5);
  };
  AudioEngine.prototype.playVoice = function (buffer, at) {
    if (!buffer || !this.ac) return;
    var src = this.ac.createBufferSource();
    var g = this.ac.createGain();
    src.buffer = buffer;
    g.gain.value = 1;
    src.connect(g); g.connect(this.master);
    src.start(at);
  };
  AudioEngine.prototype.start = function (totalMs, timelines, voices) {
    if (!this.ok) return;
    var self = this, ac = this.ac;
    var totalSec = Math.max(1, totalMs / 1000);
    this.t0 = ac.currentTime + 0.08;
    var chords = {
      lofi: [[196, 246.94, 293.66], [174.61, 220, 261.63], [164.81, 196, 246.94], [146.83, 185, 220]],
      calm: [[261.63, 329.63, 392], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]],
      upbeat: [[261.63, 329.63, 392], [293.66, 369.99, 440], [220, 277.18, 329.63], [246.94, 311.13, 369.99]]
    };
    var bpm = this.style === 'upbeat' ? 118 : (this.style === 'lofi' ? 74 : 58);
    var beat = 60 / bpm;
    var chordSet = chords[this.style] || chords.lofi;
    var chordLen = beat * (this.style === 'calm' ? 4 : 2);
    var nextChord = 0, nextBeat = 0, nextChordAt = this.t0;

    this.master.gain.setValueAtTime(0.0001, this.t0);
    this.master.gain.linearRampToValueAtTime(0.85, this.t0 + 0.9);
    this.master.gain.setValueAtTime(0.85, this.t0 + Math.max(1, totalSec - 1.3));
    this.master.gain.linearRampToValueAtTime(0.0001, this.t0 + totalSec);

    (timelines || []).forEach(function (seg) {
      if (seg.start > 0) self.whoosh(self.t0 + seg.start / 1000);
    });
    (voices || []).forEach(function (v) {
      if (v && v.buffer) self.playVoice(v.buffer, self.t0 + (v.startMs || 0) / 1000 + 0.05);
    });

    var horizon = this.t0 + 1.6;
    function schedule() {
      if (!self.ok) return;
      var now = ac.currentTime;
      while (nextChordAt < now + 1.6) {
        var chord = chordSet[nextChord % chordSet.length];
        chord.forEach(function (f, idx) {
          if (self.style === 'upbeat') {
            self.tone(f * 2, nextChordAt + idx * 0.02, chordLen * 0.55, 'triangle', 0.05, 4200);
          } else if (self.style === 'calm') {
            self.tone(f, nextChordAt, chordLen * 0.98, 'sine', 0.075, 1800);
            self.tone(f * 2, nextChordAt + 0.1, chordLen * 0.6, 'sine', 0.03, 2400);
          } else {
            self.tone(f, nextChordAt, chordLen * 0.92, 'triangle', 0.085, 1200);
          }
        });
        nextChord++;
        nextChordAt += chordLen;
      }
      while (self.t0 + nextBeat * beat < now + 1.6) {
        var at = self.t0 + nextBeat * beat;
        var b = nextBeat % 4;
        if (self.style === 'upbeat') {
          if (b === 0 || b === 2) self.kick(at, 0.5);
          self.hat(at, b % 2 ? 0.035 : 0.055);
          if (b === 2) self.hat(at, 0.05);
          if (b === 1 || b === 3) {
            var arp = chordSet[nextChord % chordSet.length][b % 3] * 4;
            self.tone(arp, at + 0.02, 0.22, 'square', 0.022, 5200);
          }
        } else if (self.style === 'lofi') {
          if (b === 0) self.kick(at, 0.42);
          if (b === 2) self.hat(at + beat / 2, 0.028);
          if (b === 3) self.hat(at, 0.022);
        } else if (b === 0 && nextBeat % 8 === 0) {
          self.tone(chordSet[nextChord % chordSet.length][0] * 2, at, 1.6, 'sine', 0.03, 2600);
        }
        nextBeat++;
      }
      if (self.t0 + nextBeat * beat < self.t0 + totalSec + 0.4) {
        self.timer = setTimeout(schedule, 220);
      }
    }
    schedule();
  };
  AudioEngine.prototype.stop = function () {
    var self = this;
    if (this.timer) { clearTimeout(this.timer); this.timer = 0; }
    try {
      if (this.master && this.ac) {
        var t = this.ac.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setValueAtTime(this.master.gain.value || 0.0001, t);
        this.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      }
    } catch (e) { /* noop */ }
    setTimeout(function () {
      try { if (self.ac && self.ac.state !== 'closed') self.ac.close(); } catch (e) { /* noop */ }
    }, 340);
  };

  /* ── 녹화 ─────────────────────────────────────────────── */
  function pickMime(hasAudio) {
    var list = hasAudio
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    for (var i = 0; i < list.length; i++) {
      if (root.MediaRecorder && root.MediaRecorder.isTypeSupported(list[i])) return list[i];
    }
    return '';
  }

  function extensionFor(mime) {
    if (/mp4/.test(mime)) return 'mp4';
    return 'webm';
  }

  /**
   * 실제 영상 파일을 만든다. 실시간으로 녹화하므로 길이만큼 시간이 걸린다.
   * @returns {Promise<{blob, mime, ext, durationMs, width, height, audio}>}
   */
  /* ── WebM 길이 메타데이터 보정 ─────────────────────────
     MediaRecorder가 만든 .webm은 Duration 요소가 없어 일부 플레이어가
     길이를 ∞로 표시한다. Info 안에 Duration(0x4489)을 넣어 준다.
     실패하면 null을 돌려주고 원본을 그대로 쓴다. */
  function vintWidthFor(v) {
    for (var w = 1; w <= 8; w++) {
      if (v < Math.pow(2, 7 * w) - 1) return w;
    }
    return 8;
  }
  function encodeVint(v, w) {
    var out = new Uint8Array(w), n = v;
    for (var i = w - 1; i >= 0; i--) { out[i] = n % 256; n = Math.floor(n / 256); }
    out[0] |= (0x80 >> (w - 1));
    return out;
  }
  function readVint(buf, pos) {
    if (pos >= buf.length) return null;
    var first = buf[pos], mask = 0x80, width = 1;
    while (width <= 8 && !(first & mask)) { mask >>= 1; width++; }
    if (width > 8) return null;
    var value = first & (mask - 1);
    var unknown = (first & (mask - 1)) === (mask - 1);
    for (var i = 1; i < width; i++) {
      var b = buf[pos + i];
      value = value * 256 + b;
      if (b !== 0xFF) unknown = false;
    }
    return { value: value, width: width, unknown: unknown };
  }
  function findBytes(buf, bytes, from) {
    outer:
    for (var i = from || 0; i <= buf.length - bytes.length; i++) {
      for (var j = 0; j < bytes.length; j++) {
        if (buf[i + j] !== bytes[j]) continue outer;
      }
      return i;
    }
    return -1;
  }
  function patchWebmDuration(arrayBuffer, durationMs) {
    var buf = new Uint8Array(arrayBuffer);
    var seg = findBytes(buf, [0x18, 0x53, 0x80, 0x67], 0);
    if (seg < 0) return null;
    var segSize = readVint(buf, seg + 4);
    if (!segSize) return null;
    var segData = seg + 4 + segSize.width;
    var info = findBytes(buf, [0x15, 0x49, 0xA9, 0x66], segData);
    if (info < 0) return null;
    var infoSize = readVint(buf, info + 4);
    if (!infoSize || infoSize.unknown) return null;
    var infoData = info + 4 + infoSize.width;
    var infoEnd = infoData + infoSize.value;

    var scale = 1000000;
    var ts = findBytes(buf, [0x2A, 0xD7, 0xB1], infoData);
    if (ts >= 0 && ts < infoEnd) {
      var tsSize = readVint(buf, ts + 3);
      if (tsSize && tsSize.value <= 8) {
        var v = 0;
        for (var i = 0; i < tsSize.value; i++) v = v * 256 + buf[ts + 3 + tsSize.width + i];
        if (v > 0) scale = v;
      }
    }
    var units = Math.max(0, durationMs * 1e6 / scale);

    var existing = -1;
    for (var pos = infoData; pos < infoEnd - 1; pos++) {
      if (buf[pos] === 0x44 && buf[pos + 1] === 0x89) { existing = pos; break; }
    }
    if (existing >= 0) {
      var ds = readVint(buf, existing + 2);
      if (!ds) return null;
      var dataPos = existing + 2 + ds.width;
      var dv = new DataView(buf.buffer, buf.byteOffset + dataPos, ds.value);
      if (ds.value === 8) dv.setFloat64(0, units, false);
      else if (ds.value === 4) dv.setFloat32(0, units, false);
      else return null;
      return buf.buffer;
    }

    var elem = new Uint8Array(11);
    elem[0] = 0x44; elem[1] = 0x89; elem[2] = 0x88;
    new DataView(elem.buffer).setFloat64(3, units, false);
    var newSize = infoSize.value + elem.length;
    var newWidth = vintWidthFor(newSize);
    var delta = elem.length + (newWidth - infoSize.width);
    var out = new Uint8Array(buf.length + delta);
    out.set(buf.subarray(0, info + 4), 0);
    out.set(encodeVint(newSize, newWidth), info + 4);
    out.set(elem, info + 4 + newWidth);
    out.set(buf.subarray(infoData), info + 4 + newWidth + elem.length);
    if (!segSize.unknown) {
      var newSeg = segSize.value + delta;
      if (vintWidthFor(newSeg) !== segSize.width) return null;
      out.set(encodeVint(newSeg, segSize.width), seg + 4);
    }
    return out.buffer;
  }

  function validateWebm(blob, expectedMs) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(blob);
      var v = document.createElement('video');
      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        try { URL.revokeObjectURL(url); } catch (e) { /* noop */ }
        resolve(ok);
      }
      var timer = setTimeout(function () { finish(false); }, 3500);
      v.preload = 'metadata';
      v.muted = true;
      v.onloadedmetadata = function () {
        clearTimeout(timer);
        var d = v.duration;
        if (!isFinite(d)) finish(true); // 브라우저가 못 읽어도 파일 자체는 살아 있다
        else finish(Math.abs(d * 1000 - expectedMs) < Math.max(900, expectedMs * 0.35));
      };
      v.onerror = function () { clearTimeout(timer); finish(false); };
      v.src = url;
    });
  }

  async function recordVideo(opts) {
    if (!root.MediaRecorder) throw new Error('이 브라우저는 영상 녹화(MediaRecorder)를 지원하지 않습니다.');
    var cuts = opts.cuts || [];
    if (!cuts.length) throw new Error('스토리보드가 비어 있습니다.');
    var project = opts.project || {};
    var theme = C.themeById(opts.theme || project.theme);
    var width = opts.width || 1080, height = opts.height || 1920;
    var fps = opts.fps || 30;
    var total = C.totalMs(cuts);
    var canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    var ctx = canvas.getContext('2d', { alpha: false });
    var stream = canvas.captureStream(fps);
    var audio = null;
    var wantsAudio = (project.music && project.music !== 'none') || (opts.voices && opts.voices.length);
    var mime = pickMime(false);
    if (wantsAudio) {
      try {
        audio = new AudioEngine(project.music === 'none' ? 'calm' : project.music, { monitor: false });
        if (audio.ok) {
          await audio.resume();
          var withAudio = pickMime(true);
          if (/opus/.test(withAudio) || /mp4/.test(withAudio)) {
            mime = withAudio;
            audio.start(total, C.timeline(cuts), opts.voices || []);
            audio.stream().getAudioTracks().forEach(function (t) { try { stream.addTrack(t); } catch (e) { /* noop */ } });
          } else {
            audio.stop();
            audio = null;
          }
        } else { audio = null; }
      } catch (e) { audio = null; }
    }

    var options = { mimeType: mime || undefined };
    if (/webm|mp4/.test(mime || '')) {
      options.videoBitsPerSecond = width >= 1000 ? 6000000 : (width >= 700 ? 3500000 : 2000000);
    }
    var rec;
    try { rec = new MediaRecorder(stream, options); }
    catch (e) {
      if (audio) audio.stop();
      stream.getTracks().forEach(function (t) { try { t.stop(); } catch (err) { /* noop */ } });
      throw new Error('녹화기를 시작하지 못했습니다: ' + e.message);
    }
    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    var done = new Promise(function (res) {
      rec.onstop = function () { res(new Blob(chunks, { type: mime || 'video/webm' })); };
    });

    var scaleX = width / W, scaleY = height / H;
    var t0 = performance.now();
    var lastReport = 0;
    var cancelled = false;
    rec.start(250);

    await new Promise(function (resolve) {
      function frame(now) {
        if (opts.signal && opts.signal.cancelled) {
          cancelled = true;
          try { rec.stop(); } catch (e) { /* noop */ }
          resolve();
          return;
        }
        var ms = Math.min(total, now - t0);
        try {
          drawFrame(ctx, {
            cuts: cuts, project: project, theme: theme, ms: ms,
            images: opts.images || {}, scaleX: scaleX, scaleY: scaleY
          });
        } catch (e) { /* 한 프레임 실패는 계속 */ }
        if (opts.onProgress && (now - lastReport > 200 || ms >= total)) {
          lastReport = now;
          opts.onProgress(Math.min(1, ms / total), ms, total);
        }
        if (ms < total && !cancelled) requestAnimationFrame(frame);
        else {
          if (!cancelled) {
            try {
              drawFrame(ctx, { cuts: cuts, project: project, theme: theme, ms: total - 1, images: opts.images || {}, scaleX: scaleX, scaleY: scaleY });
            } catch (e) { /* noop */ }
          }
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });

    // 마지막 조각이 인코더에 들어가도록 잠깐 기다린다.
    await new Promise(function (r) { setTimeout(r, 160); });
    if (rec.state !== 'inactive') {
      try { rec.stop(); } catch (e) { /* noop */ }
    }
    var blob = await done;
    if (/webm/.test(blob.type || mime || '')) {
      try {
        var raw = await blob.arrayBuffer();
        var fixed = patchWebmDuration(raw, total);
        if (fixed) {
          var candidate = new Blob([fixed], { type: blob.type });
          if (await validateWebm(candidate, total)) blob = candidate;
        }
      } catch (e) { /* 보정 실패 시 원본 유지 */ }
    }
    if (audio) { try { audio.stop(); } catch (e) { /* noop */ } }
    stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* noop */ } });
    if (cancelled) throw new Error('녹화를 취소했습니다.');

    var finalType = blob.type || mime || 'video/webm';
    return {
      blob: blob,
      mime: finalType,
      ext: extensionFor(finalType),
      durationMs: total,
      width: width,
      height: height,
      hasAudio: /opus|mp4a/i.test(finalType)
    };
  }

  /** 스틸 이미지(컷 미리보기 PNG) */
  function stillFrame(opts) {
    var width = opts.width || 1080, height = opts.height || 1920;
    var canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    var ctx = canvas.getContext('2d', { alpha: false });
    drawFrame(ctx, {
      cuts: opts.cuts, project: opts.project,
      theme: C.themeById((opts.project && opts.project.theme) || 'editorial'),
      ms: opts.ms || 0, images: opts.images || {},
      scaleX: width / W, scaleY: height / H
    });
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('이미지를 만들지 못했습니다.')); }, 'image/png');
    });
  }

  /** 업로드한 이미지/영상 → Image 객체(영상은 대표 프레임) */
  function loadImageSource(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      if (/^video\//.test(file.type)) {
        var v = document.createElement('video');
        v.preload = 'metadata';
        v.muted = true;
        v.playsInline = true;
        v.src = url;
        v.onloadeddata = function () {
          try { v.currentTime = Math.min(0.6, (v.duration || 1) / 2); } catch (e) { /* noop */ }
        };
        v.onseeked = function () {
          try {
            var c = document.createElement('canvas');
            c.width = v.videoWidth; c.height = v.videoHeight;
            c.getContext('2d').drawImage(v, 0, 0);
            var img = new Image();
            img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('영상 프레임을 읽지 못했습니다.')); };
            img.src = c.toDataURL('image/jpeg', 0.92);
          } catch (e) { URL.revokeObjectURL(url); reject(e); }
        };
        v.onerror = function () { URL.revokeObjectURL(url); reject(new Error('영상 파일을 읽지 못했습니다.')); };
        return;
      }
      var image = new Image();
      image.onload = function () { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('이미지 파일을 읽지 못했습니다.')); };
      image.src = url;
    });
  }

  function dataUrlToImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('이미지를 읽지 못했습니다.')); };
      img.src = dataUrl;
    });
  }

  function estimateBytes(seconds, width) {
    var bps = width >= 1000 ? 6000000 : (width >= 700 ? 3500000 : 2000000);
    return Math.round(seconds * bps / 8);
  }

  root.ShortsRender = {
    WIDTH: W, HEIGHT: H,
    loadFonts: loadFonts,
    drawFrame: drawFrame,
    Preview: Preview,
    AudioEngine: AudioEngine,
    recordVideo: recordVideo,
    stillFrame: stillFrame,
    loadImageSource: loadImageSource,
    dataUrlToImage: dataUrlToImage,
    pickMime: pickMime,
    patchWebmDuration: patchWebmDuration,
    validateWebm: validateWebm,
    extensionFor: extensionFor,
    estimateBytes: estimateBytes
  };
})(typeof self !== 'undefined' ? self : this);
