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

  /* ── 자동 비주얼(그래픽 일러스트) ───────────────────────
     사진이 없는 컷에 키워드별 일러스트 카드를 그린다.
     미리보기·컷 PNG·.webm 녹화가 모두 같은 1080×1920 캔버스를 쓴다. */
  function visualPalette(theme) {
    var dark = luminance(theme.bg) < 0.45;
    return {
      dark: dark,
      key: theme.accent,
      key2: dark ? '#FFFFFF' : theme.ink,
      ink: theme.ink,
      sub: theme.sub,
      line: theme.line,
      card: dark ? withAlpha(theme.surface, 0.78) : withAlpha('#FFFFFF', 0.66)
    };
  }

  function vline(ctx, x1, y1, x2, y2, color, width, dash) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width || 4; ctx.lineCap = 'round';
    if (dash && ctx.setLineDash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  function vstar(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 4;
      var rad = i % 2 ? r * 0.34 : r;
      var px = cx + Math.cos(ang) * rad, py = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  var VISUAL_PAINTERS = {
    money: function (ctx, x, y, w, h, p) {
      var base = y + h - 54;
      var coin = Math.min(64, w / 9);
      for (var s = 0; s < 3; s++) {
        var cx = x + 90 + s * (coin * 1.5);
        var stack = 2 + (s % 2) + (s === 2 ? 2 : 0);
        for (var k = 0; k < stack; k++) {
          ctx.save();
          ctx.fillStyle = k === stack - 1 ? p.key : withAlpha(p.key, 0.55);
          ctx.beginPath();
          ctx.ellipse(cx, base - k * coin * 0.34, coin * 0.62, coin * 0.24, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = withAlpha(p.ink, 0.18); ctx.lineWidth = 2; ctx.stroke();
          ctx.restore();
        }
      }
      var ax = x + 90, ay = base - coin * 1.3, bx = x + w - 140, by = y + 60;
      vline(ctx, ax, ay, bx, by, withAlpha(p.key, 0.9), 10);
      vline(ctx, bx, by, bx - 44, by + 6, withAlpha(p.key, 0.9), 10);
      vline(ctx, bx, by, bx - 6, by + 44, withAlpha(p.key, 0.9), 10);
      ctx.save();
      ctx.fillStyle = withAlpha(p.ink, 0.86);
      ctx.font = font(Math.min(92, h * 0.24), 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('₩', x + w - 84, y + h * 0.42);
      ctx.restore();
    },
    time: function (ctx, x, y, w, h, p) {
      var cx = x + 140, cy = y + h / 2, r = Math.min(118, h * 0.36);
      ctx.save();
      ctx.fillStyle = withAlpha(p.key, 0.12); ctx.beginPath(); ctx.arc(cx, cy, r + 16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = withAlpha(p.key, 0.95); ctx.lineWidth = 9;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      for (var i = 0; i < 12; i++) {
        var a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        var r1 = r - (i % 3 === 0 ? 30 : 18), r2 = r - 8;
        vline(ctx, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2, withAlpha(p.ink, i % 3 === 0 ? 0.8 : 0.45), i % 3 === 0 ? 6 : 3);
      }
      vline(ctx, cx, cy, cx + Math.cos(-Math.PI / 3) * r * 0.52, cy + Math.sin(-Math.PI / 3) * r * 0.52, p.ink, 8);
      vline(ctx, cx, cy, cx + Math.cos(Math.PI / 2.3) * r * 0.72, cy + Math.sin(Math.PI / 2.3) * r * 0.72, p.key, 6);
      ctx.fillStyle = p.key; ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
      for (var j = 0; j < 3; j++) {
        var bx = x + w * 0.5 + j * 34, by = y + 78 + j * 108;
        ctx.fillStyle = withAlpha(p.ink, 0.10);
        roundRect(ctx, bx, by, w * 0.44 - j * 30, 54, 27); ctx.fill();
        ctx.fillStyle = withAlpha(p.key, 0.85);
        roundRect(ctx, bx + 14, by + 20, 46 + j * 18, 12, 6); ctx.fill();
      }
      ctx.restore();
    },
    clean: function (ctx, x, y, w, h, p) {
      var bx = x + 90, by = y + 86, bw = 130, bh = h - 170;
      ctx.save();
      ctx.fillStyle = withAlpha(p.key, 0.9);
      roundRect(ctx, bx, by + 60, bw, bh, 34); ctx.fill();
      ctx.fillStyle = withAlpha(p.ink, 0.85);
      roundRect(ctx, bx + 34, by, 62, 74, 14); ctx.fill();
      roundRect(ctx, bx + 30, by - 6, 150, 26, 13); ctx.fill();
      roundRect(ctx, bx + 84, by + 44, 28, 30, 10); ctx.fill();
      ctx.fillStyle = withAlpha(p.key2, 0.9);
      roundRect(ctx, bx + 94, by + 110, 42, 74, 8); ctx.fill();
      for (var i = 0; i < 9; i++) {
        var ang = (i * 41 + 12) * Math.PI / 180;
        var dist = 92 + (i % 4) * 46;
        var cx = bx + 200 + Math.cos(ang) * dist, cy = by + 84 + Math.sin(ang) * dist * 0.8;
        ctx.strokeStyle = withAlpha(p.key, 0.6 - (i % 4) * 0.09); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, 9 + (i % 3) * 7, 0, Math.PI * 2); ctx.stroke();
      }
      vstar(ctx, x + w - 90, y + 70, 28, withAlpha(p.key, 0.9));
      vstar(ctx, x + w - 150, y + h - 80, 18, withAlpha(p.ink, 0.5));
      ctx.restore();
    },
    food: function (ctx, x, y, w, h, p) {
      var cx = x + w * 0.5, cy = y + h * 0.58, r = Math.min(206, h * 0.47);
      ctx.save();
      ctx.fillStyle = withAlpha(p.key, 0.92);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0.08, Math.PI - 0.08); ctx.fill();
      ctx.fillStyle = withAlpha(p.key2, 0.35);
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = withAlpha(p.ink, 0.55); ctx.lineWidth = 7;
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.26, 0, 0, Math.PI * 2); ctx.stroke();
      for (var i = 0; i < 3; i++) {
        var sx = cx - 52 + i * 52;
        ctx.strokeStyle = withAlpha(p.key2, 0.65 - i * 0.12); ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, cy - r * 0.4);
        ctx.bezierCurveTo(sx - 22, cy - r * 0.75, sx + 26, cy - r * 0.95, sx + 4, cy - r * 1.25);
        ctx.stroke();
      }
      vline(ctx, cx + r * 0.55, cy - r * 1.2, cx + r * 1.35, cy + 30, withAlpha(p.ink, 0.65), 5);
      vline(ctx, cx + r * 0.75, cy - r * 1.26, cx + r * 1.5, cy + 16, withAlpha(p.ink, 0.65), 5);
      ctx.restore();
    },
    fitness: function (ctx, x, y, w, h, p) {
      var cy = y + h * 0.46, cx = x + w * 0.42, span = Math.min(360, w * 0.55);
      ctx.save();
      ctx.fillStyle = withAlpha(p.ink, 0.82);
      roundRect(ctx, cx - span / 2, cy - 14, span, 28, 14); ctx.fill();
      [-1, 1].forEach(function (s) {
        var px = cx + s * span / 2;
        ctx.fillStyle = withAlpha(p.key, 0.95);
        roundRect(ctx, px - (s > 0 ? 26 : 26), cy - 62, 52, 124, 16); ctx.fill();
        ctx.fillStyle = withAlpha(p.key2, 0.55);
        roundRect(ctx, px + s * 30 - 13, cy - 42, 26, 84, 10); ctx.fill();
      });
      ctx.strokeStyle = withAlpha(p.key, 0.9); ctx.lineWidth = 7; ctx.lineJoin = 'round';
      ctx.beginPath();
      var yy = y + h - 74;
      ctx.moveTo(x + 60, yy);
      ctx.lineTo(x + w * 0.32, yy);
      ctx.lineTo(x + w * 0.4, yy - 54);
      ctx.lineTo(x + w * 0.48, yy + 22);
      ctx.lineTo(x + w * 0.56, yy);
      ctx.lineTo(x + w - 70, yy);
      ctx.stroke();
      ctx.restore();
    },
    business: function (ctx, x, y, w, h, p) {
      var base = y + h - 58;
      var bars = [0.42, 0.62, 0.84];
      for (var i = 0; i < 3; i++) {
        var bw = Math.min(110, w / 7), bx = x + 70 + i * (bw + 34), bh = h * bars[i] * 0.72;
        ctx.save();
        ctx.fillStyle = withAlpha(p.key, i === 2 ? 0.95 : 0.32 + i * 0.18);
        roundRect(ctx, bx, base - bh, bw, bh, 10); ctx.fill();
        ctx.fillStyle = withAlpha(p.ink, 0.25);
        for (var r = 0; r < 4; r++) for (var c = 0; c < 2; c++) {
          roundRect(ctx, bx + 16 + c * 40, base - bh + 22 + r * 34, 22, 16, 4); ctx.fill();
        }
        ctx.restore();
      }
      var ax = x + 70, ay = base - h * 0.34, bx2 = x + w - 110, by2 = y + 58;
      vline(ctx, ax, ay, bx2, by2, withAlpha(p.ink, 0.75), 9);
      vline(ctx, bx2, by2, bx2 - 42, by2 + 4, withAlpha(p.ink, 0.75), 9);
      vline(ctx, bx2, by2, bx2 - 4, by2 + 42, withAlpha(p.ink, 0.75), 9);
      vstar(ctx, x + w - 70, y + h - 70, 20, withAlpha(p.key, 0.8));
    },
    tech: function (ctx, x, y, w, h, p) {
      var pw = Math.min(200, h * 0.46), ph = h - 70, px = x + 76, py = y + 34;
      ctx.save();
      ctx.fillStyle = withAlpha(p.ink, 0.82);
      roundRect(ctx, px, py, pw, ph, 30); ctx.fill();
      ctx.fillStyle = p.dark ? '#0B0F18' : '#FFFFFF';
      roundRect(ctx, px + 12, py + 16, pw - 24, ph - 32, 22); ctx.fill();
      for (var i = 0; i < 4; i++) {
        ctx.fillStyle = withAlpha(p.key, 0.35 + i * 0.15);
        roundRect(ctx, px + 30 + (i % 2) * 72, py + 44 + Math.floor(i / 2) * 72, 52, 52, 14); ctx.fill();
      }
      ctx.strokeStyle = withAlpha(p.key, 0.95); ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(px + 28, py + ph - 70);
      ctx.lineTo(px + 62, py + ph - 104);
      ctx.lineTo(px + 96, py + ph - 88);
      ctx.lineTo(px + 136, py + ph - 136);
      ctx.stroke();
      var cx = px + pw + 150, cy = y + h * 0.44;
      ctx.strokeStyle = withAlpha(p.key, 0.55); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(cx, cy, 150, 96, -0.32, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = withAlpha(p.key, 0.95);
      ctx.beginPath(); ctx.arc(cx + 132, cy - 58, 22, 0, Math.PI * 2); ctx.fill();
      vstar(ctx, cx - 70, cy + 82, 24, withAlpha(p.ink, 0.55));
      vstar(ctx, x + w - 60, y + 54, 18, withAlpha(p.key, 0.85));
      ctx.restore();
    },
    health: function (ctx, x, y, w, h, p) {
      var cx = x + w * 0.42, cy = y + h * 0.5, s = Math.min(160, h * 0.42);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = withAlpha(p.key, 0.92);
      ctx.beginPath();
      ctx.moveTo(0, s * 0.62);
      ctx.bezierCurveTo(-s * 1.25, -s * 0.1, -s * 0.62, -s * 1.05, 0, -s * 0.42);
      ctx.bezierCurveTo(s * 0.62, -s * 1.05, s * 1.25, -s * 0.1, 0, s * 0.62);
      ctx.fill();
      ctx.strokeStyle = withAlpha(p.key2, 0.85); ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-s * 0.72, 0); ctx.lineTo(-s * 0.28, 0); ctx.lineTo(-s * 0.1, -s * 0.34);
      ctx.lineTo(s * 0.1, s * 0.2); ctx.lineTo(s * 0.24, 0); ctx.lineTo(s * 0.66, 0);
      ctx.stroke();
      ctx.translate(s * 1.05, -s * 0.75);
      ctx.fillStyle = withAlpha(p.ink, 0.85);
      roundRect(ctx, -46, -46, 92, 92, 22); ctx.fill();
      ctx.fillStyle = withAlpha(p.card, 1);
      roundRect(ctx, -9, -30, 18, 60, 6); ctx.fill();
      roundRect(ctx, -30, -9, 60, 18, 6); ctx.fill();
      ctx.restore();
    },
    home: function (ctx, x, y, w, h, p) {
      var bw = Math.min(300, w * 0.44), bh = h * 0.5, bx = x + 100, by = y + h * 0.44;
      ctx.save();
      ctx.strokeStyle = withAlpha(p.key, 0.95); ctx.lineWidth = 9; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(bx - 34, by); ctx.lineTo(bx + bw / 2, by - bh * 0.62); ctx.lineTo(bx + bw + 34, by);
      ctx.stroke();
      ctx.fillStyle = withAlpha(p.ink, 0.14);
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = withAlpha(p.key, 0.9);
      roundRect(ctx, bx + bw / 2 - 34, by + bh - 92, 68, 92, 6); ctx.fill();
      ctx.strokeStyle = withAlpha(p.key2, 0.7); ctx.lineWidth = 4;
      ctx.strokeRect(bx + 26, by + 30, 62, 62);
      vline(ctx, bx + 57, by + 30, bx + 57, by + 92, withAlpha(p.key2, 0.7), 4);
      vline(ctx, bx + 26, by + 61, bx + 88, by + 61, withAlpha(p.key2, 0.7), 4);
      var px = bx + bw + 120, py = by + bh;
      ctx.fillStyle = withAlpha(p.key, 0.85);
      roundRect(ctx, px - 34, py - 46, 68, 46, 10); ctx.fill();
      for (var i = 0; i < 3; i++) {
        var a = -Math.PI / 2 + (i - 1) * 0.55;
        ctx.fillStyle = withAlpha(p.key, 0.55 + i * 0.12);
        ctx.beginPath(); ctx.ellipse(px + Math.cos(a) * 26, py - 70 + Math.sin(a) * 34, 18, 40, a, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = withAlpha(p.key2, 0.35);
      ctx.beginPath(); ctx.arc(x + w - 74, y + 66, 34, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },
    study: function (ctx, x, y, w, h, p) {
      var cx = x + w * 0.42, cy = y + h * 0.62, bw = Math.min(360, w * 0.6);
      ctx.save();
      ctx.fillStyle = withAlpha(p.ink, 0.16);
      ctx.beginPath();
      ctx.moveTo(cx, cy - 60); ctx.quadraticCurveTo(cx - bw * 0.55, cy - 96, cx - bw * 0.55, cy + 92);
      ctx.quadraticCurveTo(cx - bw * 0.24, cy + 62, cx, cy + 96);
      ctx.quadraticCurveTo(cx + bw * 0.24, cy + 62, cx + bw * 0.55, cy + 92);
      ctx.quadraticCurveTo(cx + bw * 0.55, cy - 96, cx, cy - 60);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = withAlpha(p.ink, 0.7); ctx.lineWidth = 6; ctx.stroke();
      vline(ctx, cx, cy - 58, cx, cy + 92, withAlpha(p.key, 0.9), 6);
      for (var i = 0; i < 4; i++) {
        vline(ctx, cx - bw * 0.4, cy - 34 + i * 28, cx - bw * 0.1, cy - 38 + i * 28, withAlpha(p.key2, 0.45), 4);
        vline(ctx, cx + bw * 0.1, cy - 38 + i * 28, cx + bw * 0.4, cy - 34 + i * 28, withAlpha(p.key2, 0.45), 4);
      }
      var lx = cx, ly = y + h * 0.22;
      ctx.fillStyle = withAlpha(p.key, 0.95);
      ctx.beginPath(); ctx.arc(lx, ly, 44, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.dark ? '#101014' : '#FFFFFF';
      ctx.fillRect(lx - 12, ly + 30, 24, 26);
      ctx.strokeStyle = withAlpha(p.key, 0.8); ctx.lineWidth = 5;
      for (var k = 0; k < 6; k++) {
        var a2 = -Math.PI / 2 + (k - 2.5) * 0.42;
        vline(ctx, lx + Math.cos(a2) * 58, ly + Math.sin(a2) * 58, lx + Math.cos(a2) * 82, ly + Math.sin(a2) * 82, withAlpha(p.key, 0.5), 5);
      }
      ctx.restore();
    },
    travel: function (ctx, x, y, w, h, p) {
      var cx = x + w * 0.36, cy = y + h * 0.44;
      ctx.save();
      ctx.fillStyle = withAlpha(p.key, 0.95);
      ctx.beginPath(); ctx.arc(cx, cy, 74, Math.PI * 0.82, Math.PI * 0.18);
      ctx.lineTo(cx, cy + 120); ctx.closePath(); ctx.fill();
      ctx.fillStyle = p.dark ? '#101014' : '#FFFFFF';
      ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = withAlpha(p.key, 0.55); ctx.lineWidth = 5;
      if (ctx.setLineDash) ctx.setLineDash([14, 16]);
      ctx.beginPath(); ctx.moveTo(cx + 92, cy + 34); ctx.bezierCurveTo(cx + 220, cy + 120, cx + 300, cy - 20, cx + 420, cy + 60); ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
      var bx = x + w - 210, by = y + h - 150;
      ctx.fillStyle = withAlpha(p.ink, 0.32);
      roundRect(ctx, bx, by, 150, 110, 18); ctx.fill();
      ctx.strokeStyle = withAlpha(p.ink, 0.65); ctx.lineWidth = 5;
      roundRect(ctx, bx, by, 150, 110, 18); ctx.stroke();
      vline(ctx, bx + 46, by, bx + 46, by - 24, withAlpha(p.key, 0.9), 10);
      vline(ctx, bx + 104, by, bx + 104, by - 24, withAlpha(p.key, 0.9), 10);
      ctx.restore();
    },
    warning: function (ctx, x, y, w, h, p) {
      var cx = x + w * 0.42, cy = y + h * 0.52, s = Math.min(180, h * 0.44);
      ctx.save();
      ctx.fillStyle = withAlpha(p.key, 0.92);
      ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy + s * 0.82); ctx.lineTo(cx - s, cy + s * 0.82); ctx.closePath(); ctx.fill();
      ctx.fillStyle = withAlpha(p.dark ? '#0B0B0F' : '#FFFFFF', 0.95);
      roundRect(ctx, cx - 12, cy - s * 0.42, 24, s * 0.72, 8); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.44, 15, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = withAlpha(p.ink, 0.35); ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + w - 160, y + 60); ctx.lineTo(x + w - 110, y + 110); ctx.lineTo(x + w - 150, y + 150); ctx.lineTo(x + w - 84, y + 196); ctx.stroke();
      ctx.restore();
    },
    spark: function (ctx, x, y, w, h, p) {
      var cx = x + w * 0.4, cy = y + h * 0.5;
      ctx.save();
      for (var i = 0; i < 4; i++) {
        ctx.strokeStyle = withAlpha(p.key, 0.5 - i * 0.09); ctx.lineWidth = 6 - i;
        ctx.beginPath(); ctx.arc(cx, cy, 46 + i * 42, -Math.PI * 0.15, Math.PI * 1.15); ctx.stroke();
      }
      vstar(ctx, cx + 10, cy - 6, 46, withAlpha(p.key, 0.95));
      vstar(ctx, x + w - 120, y + 84, 26, withAlpha(p.ink, 0.55));
      vstar(ctx, x + w - 210, y + h - 80, 18, withAlpha(p.key, 0.75));
      for (var j = 0; j < 3; j++) {
        vline(ctx, x + w * 0.66 + j * 26, y + h * 0.16, x + w * 0.82 + j * 26, y + h * 0.76, withAlpha(p.key2, 0.16), 10);
      }
      ctx.restore();
    }
  };

  /** 컷 하단의 자동 비주얼 카드. 사진이 없을 때만 그린다. */
  function drawAutoVisual(ctx, s) {
    var v = s.cut && s.cut.visual;
    if (!v) return false;
    if (s.project && s.project.autoVisual === false) return false;
    var th = s.theme;
    var p = visualPalette(th);
    var x = M, y = 1210, w = W - M * 2, h = 455;
    var enter = easeOut(clamp((s.p || 0) * 3.2, 0, 1));
    var paint = VISUAL_PAINTERS[v.id] || VISUAL_PAINTERS.spark;
    var hasStat = !!(v.stat && v.stat.value);

    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * enter;
    var glow = ctx.createRadialGradient(x + w * 0.3, y + h * 0.55, 20, x + w * 0.3, y + h * 0.55, w * 0.62);
    glow.addColorStop(0, withAlpha(th.accent, 0.2));
    glow.addColorStop(1, withAlpha(th.accent, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x - 120, y - 90, w + 240, h + 180);

    ctx.translate(0, (1 - enter) * 34);
    roundRect(ctx, x, y, w, h, 30);
    ctx.fillStyle = p.card; ctx.fill();
    ctx.strokeStyle = withAlpha(th.line, 0.85); ctx.lineWidth = 2; ctx.stroke();

    // 카드 안쪽의 은은한 광원·코너 마커로 빈 느낌을 줄인다.
    ctx.save();
    roundRect(ctx, x, y, w, h, 30); ctx.clip();
    var inner = ctx.createLinearGradient(x, y, x + w, y + h);
    inner.addColorStop(0, withAlpha(th.accent, 0.10));
    inner.addColorStop(0.55, withAlpha(th.accent, 0.015));
    inner.addColorStop(1, withAlpha(th.accent, 0.07));
    ctx.fillStyle = inner; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = withAlpha(th.accent, 0.5); ctx.lineWidth = 4;
    [[x + 22, y + 22, 1, 1], [x + w - 22, y + 22, -1, 1], [x + 22, y + h - 22, 1, -1], [x + w - 22, y + h - 22, -1, -1]].forEach(function (c) {
      ctx.beginPath();
      ctx.moveTo(c[0], c[1] + 34 * c[3]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0] + 34 * c[2], c[1]);
      ctx.stroke();
    });
    ctx.restore();

    ctx.save();
    roundRect(ctx, x, y, w, h, 30); ctx.clip();
    var motifW = hasStat ? w - 250 : w - 24;
    var mx = x + (hasStat ? 6 : 12);
    var my = y + 6;
    var seed = Math.abs(Number(v.seed) || 0);
    var mir = seed % 2 ? -1 : 1;
    var sc = 1.08 + (seed % 5) * 0.02;
    var rot = ((seed % 7) - 3) * 0.008;
    var ccx = mx + motifW / 2, ccy = my + (h - 12) / 2;
    ctx.save();
    // 같은 키워드라도 컷마다 시드로 방향·기울기·크기를 달리해 반복감을 줄인다.
    ctx.translate(ccx, ccy);
    ctx.scale(mir * sc, sc);
    ctx.rotate(rot);
    ctx.translate(-ccx, -ccy);
    try { paint(ctx, mx, my, motifW, h - 12, p, seed); } catch (e) { /* 한 그림 실패는 넘어간다 */ }
    ctx.restore();
    ctx.restore();

    if (hasStat) {
      var sx = x + w - 196;
      vline(ctx, x + w - 258, y + 34, x + w - 258, y + h - 34, withAlpha(th.line, 0.9), 2);
      ctx.save();
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = withAlpha(th.accent, 0.98);
      var val = String(v.stat.value);
      var size = val.length >= 5 ? 108 : (val.length === 4 ? 122 : 142);
      ctx.font = font(size, 800);
      var capH = size * 0.72;
      var valY = y + h / 2 + (v.stat.unit ? capH * 0.16 : capH * 0.35);
      ctx.fillText(val, sx, valY);
      if (v.stat.unit) {
        ctx.font = font(50, 700);
        ctx.fillStyle = withAlpha(th.ink, 0.8);
        ctx.fillText(v.stat.unit, sx + 4, valY + 58);
      }
      ctx.restore();
    }
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

    var hasVisual = false;
    if (!hasImage) {
      try { hasVisual = drawAutoVisual(ctx, Object.assign({}, s, { p: p })); } catch (e) { hasVisual = false; }
    }

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
    // 자동 비줼얼 카드(하단)와 살지 않도록 글자 블록을 위로 올린다.
    var centerY = hasImage ? 960 : (hasVisual ? 700 : 930);
    var top = centerY - blockH / 2 + (hasImage ? 30 : 0);
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
      var ay = hasVisual ? 1170 : H - 300;
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

  var gradeScratch = null;
  function ensureScratch(w, h) {
    if (typeof document === 'undefined') return null;
    if (!gradeScratch) {
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      gradeScratch = { canvas: canvas, ctx: canvas.getContext('2d', { alpha: false }) };
    }
    if (gradeScratch.canvas.width !== w || gradeScratch.canvas.height !== h) {
      gradeScratch.canvas.width = w; gradeScratch.canvas.height = h;
      gradeScratch.ctx = gradeScratch.canvas.getContext('2d', { alpha: false });
    }
    return gradeScratch;
  }

  /* ── 색보정(그레이드) 적용 ────────────────────────────────
     장면을 먼저 오프스크린에 그리고, 노출·대비·채도는 canvas
     filter 로, 온도·틴트는 soft-light 피막으로 입힌다.
     미리보기·컷 PNG·.webm 녹화가 모두 같은 drawFrame 을 쓴다. */
  function drawFrame(ctx, s) {
    var grade = C.normalizeGrade((s && s.grade) || ((s.project || {}).grade));
    if (!C.hasGrade(grade)) return paintFrame(ctx, s);
    var scratch = ensureScratch(ctx.canvas.width, ctx.canvas.height);
    if (!scratch) return paintFrame(ctx, s);
    var fr = paintFrame(scratch.ctx, s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.save();
    var filter = C.gradeFilterString(grade);
    if (filter !== 'none' && 'filter' in ctx) ctx.filter = filter;
    ctx.drawImage(scratch.canvas, 0, 0);
    ctx.restore();
    var ov = C.gradeOverlay(grade);
    if (ov) {
      ctx.save();
      ctx.globalCompositeOperation = ov.blend || 'soft-light';
      ctx.fillStyle = 'rgba(' + ov.r + ',' + ov.g + ',' + ov.b + ',' + ov.alpha + ')';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
    return fr;
  }

  /** 장면을 그대로 그리는 본체(그레이드 전 단계). */
  function paintFrame(ctx, s) {
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
  AudioEngine.prototype.playVoice = function (buffer, at, gain) {
    if (!buffer || !this.ac) return;
    var src = this.ac.createBufferSource();
    var g = this.ac.createGain();
    src.buffer = buffer;
    g.gain.value = gain === undefined ? 1 : gain;
    src.connect(g); g.connect(this.master);
    src.start(at);
  };
  /**
   * 배경음 + 성우 음성을 한 AudioContext에서 합성한다.
   * style 'none'은 음악 없이 성우·효과음만 낸다(내레이션 전용 영상).
   * voices: [{buffer, startMs, gain}] — 각 컷 시작 시각에 정확히 놓인다.
   */
  AudioEngine.prototype.start = function (totalMs, timelines, voices, opts) {
    if (!this.ok) return;
    opts = opts || {};
    var self = this, ac = this.ac;
    var totalSec = Math.max(1, totalMs / 1000);
    var lead = typeof opts.lead === 'number' ? Math.max(0, opts.lead) : 0.08;
    this.t0 = ac.currentTime + lead;
    var silentMusic = this.style === 'none';
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
      if (!silentMusic && seg.start > 0) self.whoosh(self.t0 + seg.start / 1000);
    });
    (voices || []).forEach(function (v) {
      if (v && v.buffer) self.playVoice(v.buffer, self.t0 + (v.startMs || 0) / 1000, v.gain);
    });

    if (silentMusic) return;

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

  /* ══════════════════════════════════════════════════════
     오프라인 오디오 믹스 + 파형 + MP4 렌더
     ------------------------------------------------------
     실시간 녹화는 30초 영상에 30초를 기다려야 하고, 결과물이
     사실상 .webm 이라 일부 앱이 업로드를 거부한다. 여기서는
        ① 배경음+내레이션을 OfflineAudioContext 로 한 번에 계산해
           파형(wavesurfer)에 진짜 소리를 보여 주고,
        ② 같은 소리를 WebCodecs(mediabunny)로 MP4 에 먹싱한다.
     WebCodecs 가 없는 브라우저는 기존 MediaRecorder(.webm)로 돌아간다. */
  var MP4 = {
    version: 'mediabunny-1.66.2',
    localPath: 'assets/vendor/mediabunny.min.mjs',
    module: null
  };

  function loadMediabunny() {
    if (MP4.module) return Promise.resolve(MP4.module);
    return import('./' + MP4.localPath).then(function (mod) {
      MP4.module = mod;
      return mod;
    });
  }

  function musicProfile(style) {
    var chords = {
      lofi: [[196, 246.94, 293.66], [174.61, 220, 261.63], [164.81, 196, 246.94], [146.83, 185, 220]],
      calm: [[261.63, 329.63, 392], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]],
      upbeat: [[261.63, 329.63, 392], [293.66, 369.99, 440], [220, 277.18, 329.63], [246.94, 311.13, 369.99]]
    };
    var bpm = style === 'upbeat' ? 118 : (style === 'lofi' ? 74 : 58);
    return {
      chords: chords[style] || chords.lofi,
      beat: 60 / bpm,
      chordLen: (60 / bpm) * (style === 'calm' ? 4 : 2)
    };
  }

  /** 같은 음악을 오프라인에서 통째로 예약한다(실시간 타이머 없이). */
  function scheduleMusic(ac, master, style, totalSec) {
    var prof = musicProfile(style);
    var noise = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * 2)), ac.sampleRate);
    var nd = noise.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    function tone(freq, at, dur, type, gain, filterFreq) {
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = type || 'triangle';
      osc.frequency.value = freq;
      var node = g;
      if (filterFreq) {
        var f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = filterFreq;
        g.connect(f);
        node = f;
      }
      osc.connect(g);
      node.connect(master);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), at + Math.min(0.35, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    }
    function kick(at, gain) {
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(130, at);
      osc.frequency.exponentialRampToValueAtTime(44, at + 0.16);
      g.gain.setValueAtTime(gain || 0.55, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      osc.connect(g);
      g.connect(master);
      osc.start(at);
      osc.stop(at + 0.26);
    }
    function hat(at, gain) {
      var src = ac.createBufferSource();
      src.buffer = noise;
      var hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7200;
      var g = ac.createGain();
      g.gain.setValueAtTime(gain || 0.05, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
      src.connect(hp); hp.connect(g); g.connect(master);
      src.start(at); src.stop(at + 0.08);
    }
    function whoosh(at) {
      var src = ac.createBufferSource();
      src.buffer = noise;
      var bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(420, at);
      bp.frequency.exponentialRampToValueAtTime(2600, at + 0.42);
      var g = ac.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.12, at + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.46);
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(at); src.stop(at + 0.5);
    }

    var chord = prof.chords;
    var at = 0;
    var idx = 0;
    while (at < totalSec) {
      var set = chord[idx % chord.length];
      for (var k = 0; k < set.length; k++) {
        if (style === 'upbeat') tone(set[k] * 2, at + k * 0.02, prof.chordLen * 0.55, 'triangle', 0.05, 4200);
        else if (style === 'calm') {
          tone(set[k], at, prof.chordLen * 0.98, 'sine', 0.075, 1800);
          tone(set[k] * 2, at + 0.1, prof.chordLen * 0.6, 'sine', 0.03, 2400);
        } else tone(set[k], at, prof.chordLen * 0.92, 'triangle', 0.085, 1200);
      }
      idx++;
      at += prof.chordLen;
    }
    var beat = prof.beat;
    var n = 0;
    while (n * beat < totalSec) {
      var t = n * beat;
      var b = n % 4;
      if (style === 'upbeat') {
        if (b === 0 || b === 2) kick(t, 0.5);
        hat(t, b % 2 ? 0.035 : 0.055);
        if (b === 2) hat(t, 0.05);
        if (b === 1 || b === 3) tone(chord[idx % chord.length][b % 3] * 4, t + 0.02, 0.22, 'square', 0.022, 5200);
      } else if (style === 'calm') {
        if (b === 0) kick(t, 0.22);
      } else if (b === 0 || b === 2) kick(t, 0.3);
      n++;
    }
    return { whoosh: whoosh };
  }

  /**
   * 배경음 + 내레이션 → AudioBuffer (영상 길이와 정확히 같음)
   * @param {{totalMs:number, music:string, voices:Array, timelines:Array, onCutMs?:number}} opts
   */
  function renderMixOffline(opts) {
    opts = opts || {};
    var Ctx = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    if (!Ctx) return Promise.reject(new Error('이 브라우저는 오프라인 오디오를 지원하지 않습니다.'));
    var totalMs = Math.max(400, Math.round(opts.totalMs || 0));
    var sr = 44100;
    var frames = Math.ceil((totalMs / 1000) * sr);
    var ac = new Ctx(2, frames, sr);
    var master = ac.createGain();
    master.connect(ac.destination);
    var totalSec = totalMs / 1000;
    master.gain.setValueAtTime(0.0001, 0);
    master.gain.linearRampToValueAtTime(0.85, Math.min(0.9, totalSec * 0.3));
    master.gain.setValueAtTime(0.85, Math.max(0.1, totalSec - 1.3));
    master.gain.linearRampToValueAtTime(0.0001, totalSec);

    var style = opts.music || (opts.project && opts.project.music) || 'none';
    var voices = (opts.voices || []).filter(function (v) { return v && v.buffer; });
    voices.forEach(function (v) {
      var src = ac.createBufferSource();
      var g = ac.createGain();
      src.buffer = v.buffer;
      g.gain.value = v.gain === undefined ? 1 : v.gain;
      src.connect(g);
      g.connect(master);
      src.start(Math.max(0, (v.startMs || 0) / 1000));
    });

    if (style !== 'none') {
      var music = scheduleMusic(ac, master, style, totalSec);
      (opts.timelines || []).forEach(function (seg) {
        if (seg && seg.start > 0) music.whoosh(seg.start / 1000);
      });
    }
    return ac.startRendering();
  }

  /** AudioBuffer → WAV(PCM16) — wavesurfer·다운로드용 */
  function encodeWav(buffer) {
    var channels = Math.min(2, buffer.numberOfChannels || 1);
    var len = buffer.length;
    var bytes = 44 + len * channels * 2;
    var out = new DataView(new ArrayBuffer(bytes));
    function str(off, s) { for (var i = 0; i < s.length; i++) out.setUint8(off + i, s.charCodeAt(i)); }
    str(0, 'RIFF');
    out.setUint32(4, bytes - 8, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, channels, true);
    out.setUint32(24, buffer.sampleRate, true);
    out.setUint32(28, buffer.sampleRate * channels * 2, true);
    out.setUint16(32, channels * 2, true);
    out.setUint16(34, 16, true);
    str(36, 'data');
    out.setUint32(40, len * channels * 2, true);
    var data = [];
    for (var c = 0; c < channels; c++) data.push(buffer.getChannelData(c));
    var off = 44;
    for (var i = 0; i < len; i++) {
      for (var ch = 0; ch < channels; ch++) {
        var v = Math.max(-1, Math.min(1, data[ch][i]));
        out.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
        off += 2;
      }
    }
    return new Uint8Array(out.buffer);
  }

  /** 이 브라우저가 MP4(H.264) + 오디오 인코딩을 할 수 있는지 */
  function mp4Capability() {
    if (!root.VideoEncoder || !root.AudioEncoder) return Promise.resolve({ ok: false, reason: 'WebCodecs 없음' });
    return loadMediabunny().then(function (mb) {
      return mb.canEncodeVideo('avc').then(function (avc) {
        if (!avc) return { ok: false, reason: 'H.264 인코더 없음' };
        return mb.canEncodeAudio('aac').then(function (aac) {
          return { ok: true, video: 'avc', audio: aac ? 'aac' : 'opus' };
        });
      });
    }).catch(function (e) {
      return { ok: false, reason: (e && e.message) || 'mediabunny 로드 실패' };
    });
  }

  /**
   * MP4 렌더(실시간 아님) — 프레임을 하나씩 그려 인코더에 넣는다.
   * 오디오는 renderMixOffline 결과를 그대로 먹싱해 TTS 싱크를 유지한다.
   */
  function renderMp4(opts) {
    var cuts = opts.cuts || [];
    if (!cuts.length) return Promise.reject(new Error('스토리보드가 비어 있습니다.'));
    var project = opts.project || {};
    var theme = C.themeById(opts.theme || project.theme);
    var width = opts.width || 1080, height = opts.height || 1920;
    var fps = Math.max(24, Math.min(30, opts.fps || 30));
    var total = C.totalMs(cuts);
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d', { alpha: false });
    var scaleX = width / W, scaleY = height / H;
    var voices = (opts.voices || []).filter(function (v) { return v && v.buffer; });
    var wantsAudio = (project.music && project.music !== 'none') || voices.length;
    var t0 = performance.now();

    return mp4Capability().then(function (cap) {
      if (!cap.ok) throw new Error(cap.reason || 'MP4를 만들 수 없습니다.');
      return loadMediabunny().then(function (mb) {
        var output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() });
        var videoSource = new mb.CanvasSource(canvas, {
          codec: cap.video,
          bitrate: width >= 1000 ? 6000000 : 3000000
        });
        output.addVideoTrack(videoSource, { frameRate: fps });

        var audioPromise = wantsAudio
          ? renderMixOffline({ totalMs: total, music: project.music, voices: voices, timelines: C.timeline(cuts) })
          : Promise.resolve(null);

        return audioPromise.then(function (audioBuffer) {
          var audioSource = null;
          if (audioBuffer && cap.audio) {
            try {
              audioSource = new mb.AudioBufferSource({ codec: cap.audio, bitrate: 128000 });
              output.addAudioTrack(audioSource);
            } catch (e) {
              audioSource = null;
            }
          }
          return output.start().then(function () {
            if (audioSource) {
              return audioSource.add(audioBuffer).then(function () { return null; });
            }
            return null;
          }).then(function () {
            var frames = Math.max(1, Math.round((total / 1000) * fps));
            var i = 0;
            function step() {
              if (opts.signal && opts.signal.cancelled) throw new Error('렌더를 취소했습니다.');
              if (i >= frames) return Promise.resolve();
              var ms = Math.min(total, (i * 1000) / fps);
              try {
                drawFrame(ctx, {
                  cuts: cuts, project: project, theme: theme, ms: ms,
                  images: opts.images || {}, scaleX: scaleX, scaleY: scaleY
                });
              } catch (e) { /* 한 프레임 실패는 계속 */ }
              var p = videoSource.add(i / fps, 1 / fps).then(function () {
                i++;
                if (opts.onProgress && (i % 6 === 0 || i === frames)) {
                  opts.onProgress(Math.min(1, i / frames), ms, total);
                }
                return step();
              });
              return p;
            }
            return step();
          }).then(function () {
            return output.finalize();
          }).then(function () {
            var buf = output.target.buffer;
            if (!buf) throw new Error('MP4 버퍼가 비었습니다.');
            var blob = new Blob([buf], { type: 'video/mp4' });
            var ms = Math.round(performance.now() - t0);
            return {
              blob: blob,
              mime: 'video/mp4',
              ext: 'mp4',
              durationMs: total,
              width: width,
              height: height,
              hasAudio: !!audioBuffer,
              audioCodec: audioSource ? cap.audio : '',
              encodeMs: ms
            };
          });
        });
      });
    });
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
        audio = new AudioEngine(project.music === 'none' ? 'none' : project.music, { monitor: false });
        if (audio.ok) {
          await audio.resume();
          var withAudio = pickMime(true);
          if (/opus/.test(withAudio) || /mp4/.test(withAudio)) {
            mime = withAudio;
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
    var lastReport = 0;
    var cancelled = false;
    rec.start(250);
    // 녹화기의 오디오 트랙은 rec.start 시점부터 기록된다. 성우를 영상 0초에
    // 맞추기 위해 20ms 리드만 두고 같은 순간에 출발시킨다.
    if (audio) audio.start(total, C.timeline(cuts), opts.voices || [], { lead: 0.02 });
    var t0 = performance.now();

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
    renderMixOffline: renderMixOffline,
    encodeWav: encodeWav,
    mp4Capability: mp4Capability,
    renderMp4: renderMp4,
    loaderVersion: MP4.version,
    patchWebmDuration: patchWebmDuration,
    validateWebm: validateWebm,
    extensionFor: extensionFor,
    estimateBytes: estimateBytes
  };
})(typeof self !== 'undefined' ? self : this);
