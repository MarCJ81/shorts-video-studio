/* ============================================================
   원탭 숏폼 스튜디오 · nle.js  v2.0.0
   ------------------------------------------------------------
   AI 멀티에이전트 NLE 워크스페이스.
     · 미디어 소스 / SWARM ACTIVITY 로그
     · 프로그램 모니터(타임코드) · 오디오 파형·스펙트럼
     · 컬러 휠 + 노출·대비·채도·온도 슬라이더(프리뷰·녹화 동일)
     · V1·T1·A1·FX 멀티트랙 타임라인 + 클립 선택/편집
     · Claude·Gemini·GPT 커서가 실제로 이동하는 스웜 자동 편집
   로직(그레이드 계산·트랙 모델·스웜 계획)은 core.js,
   이 파일은 화면·애니메이션·상태 연결만 맡는다.
   ============================================================ */
(function (root) {
  'use strict';

  var C = root.ShortsCore;
  var D = root.ShortsData;
  var P = root.ShortsPro;

  function $(sel, el) { return (el || document).querySelector(sel); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var api = null;
  var ui = {
    tracks: null,
    selected: null,
    running: false,
    logCount: 0,
    scopeSamples: [],
    lastTick: 0,
    rafPending: false,
    cursorPos: {},
    startedAt: 0
  };

  /* ══════════════════════════════════════════════════════
     정적 조각 (미디어 · 에이전트 · 프리셋 · 커서)
     ══════════════════════════════════════════════════════ */
  function agentRows() {
    return C.AGENTS.map(function (a) {
      return '<div class="swarm-agent" data-agent="' + a.id + '" data-state="idle" style="--agent:' + a.color + '">' +
        '<span class="agent-dot" aria-hidden="true"></span>' +
        '<div><b>' + esc(a.name) + '</b><span class="agent-role">' + esc(a.role) + '</span></div>' +
        '<span class="agent-state">IDLE</span>' +
      '</div>';
    }).join('');
  }

  function presetChips() {
    return C.GRADES.map(function (g) {
      return '<button type="button" class="grade-chip" data-grade="' + g.id + '" aria-pressed="false" title="' + esc(g.note) + '">' + esc(g.name) + '</button>';
    }).join('');
  }

  function cursorEls() {
    var svg = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 2l13 7.2-5.6 1.5L8.1 17z" fill="currentColor"/></svg>';
    return C.AGENTS.map(function (a) {
      return '<span class="swarm-cursor" data-agent="' + a.id + '" data-visible="false" style="color:' + a.color + '">' + svg + '<b>' + esc(a.name) + '</b></span>';
    }).join('');
  }

  function buildStatic() {
    var agents = $('#swarm-agents');
    if (agents) agents.innerHTML = agentRows();
    var presets = $('#grade-presets');
    if (presets) presets.innerHTML = presetChips();
    var layer = $('#swarm-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'swarm-layer';
      layer.id = 'swarm-layer';
      layer.setAttribute('aria-hidden', 'true');
      var ws = $('#nle-workspace');
      if (ws) ws.appendChild(layer);
    }
    layer.innerHTML = cursorEls();
  }

  function musicName(id) {
    for (var i = 0; i < D.MUSIC.length; i++) if (D.MUSIC[i].id === id) return D.MUSIC[i].name;
    return '배경음';
  }

  function renderMedia() {
    var el = $('#media-list');
    if (!el) return;
    var p = api.state.project;
    var tracks = ui.tracks || C.buildTracks(p);
    var res = (D.RESOLUTIONS.filter(function (r) { return r.id === p.resolution; })[0] || D.RESOLUTIONS[0]);
    var topic = C.clean(p.topic || '새 프로젝트', 18) || '새 프로젝트';
    el.innerHTML =
      '<div class="media-item" data-kind="video">' +
        '<span class="media-ico">9:16</span>' +
        '<div><b>' + esc(topic) + '</b><span class="media-sub">' + res.w + '×' + res.h + ' · ' + (p.fps === 24 ? 24 : 30) + 'fps</span></div>' +
        '<span class="media-badge">9:16</span>' +
      '</div>' +
      '<div class="media-item" data-kind="audio">' +
        '<span class="media-ico">A1</span>' +
        '<div><b>' + esc(p.music === 'none' ? '무음' : musicName(p.music)) + '</b><span class="media-sub">' +
          ((tracks.voiceCount || 0) ? '성우 ' + tracks.voiceCount + '컷 · ' : '') +
          (p.music === 'none' ? '배경음 없음' : '합성 · ' + tracks.a1.beats.length + ' beats') + '</span></div>' +
        '<span class="media-badge">SYNC</span>' +
      '</div>' +
      '<div class="media-item" data-kind="text">' +
        '<span class="media-ico">T1</span>' +
        '<div><b>자막 ' + tracks.t1.length + '줄</b><span class="media-sub">17자 단위 · 테마 자동</span></div>' +
        '<span class="media-badge">AUTO</span>' +
      '</div>';
  }

  /* ══════════════════════════════════════════════════════
     타임라인
     ══════════════════════════════════════════════════════ */
  function pct(ms, total) {
    if (!total) return 0;
    return clamp((ms / total) * 100, 0, 100);
  }

  function clipButton(clip, track) {
    var total = ui.tracks.total || 1;
    var left = pct(clip.start, total);
    var width = Math.max(1.2, pct(clip.end - clip.start, total));
    var attrs = ' data-track="' + track + '" data-id="' + esc(clip.id) + '" data-start="' + clip.start + '"';
    var body = '';
    if (track === 'V1') {
      attrs += ' data-cut="' + clip.cutIndex + '" data-stage="' + clip.stage + '"';
      body = '<b>' + esc(clip.label) + (clip.part ? ' · ' + clip.part : '') + '</b><span>' + esc(clip.text) + '</span>';
    } else if (track === 'T1') {
      attrs += ' data-cut="' + clip.cutIndex + '" data-sub="' + esc(clip.id) + '" data-stage="' + clip.stage + '"';
      body = '<span>' + esc(clip.text) + '</span>';
    } else if (track === 'FX') {
      attrs += ' data-type="' + esc(clip.type) + '"';
      body = '<span>' + esc(clip.label) + '</span>';
    }
    return '<button type="button" class="tl-clip" ' + attrs +
      ' style="left:' + left.toFixed(3) + '%;width:' + width.toFixed(3) + '%" ' +
      'aria-label="' + esc((clip.label || clip.text || clip.type) + ' ' + (clip.start / 1000).toFixed(1) + '초') + '">' + body + '</button>';
  }

  function renderRuler(total) {
    var el = $('#tl-ruler');
    if (!el) return;
    var marks = total ? [0, 0.25, 0.5, 0.75, 1] : [0];
    el.innerHTML = marks.map(function (f) {
      return '<span style="left:' + (f * 100).toFixed(2) + '%">' + C.formatClock(total * f) + '</span>';
    }).join('');
  }

  function renderTracks() {
    var p = api.state.project;
    ui.tracks = C.buildTracks(p, { captionChars: 17 });
    var t = ui.tracks;
    var total = t.total || 1;

    var v1 = $('#tl-v1');
    if (v1) v1.innerHTML = t.v1.map(function (c) { return clipButton(c, 'V1'); }).join('');
    var t1 = $('#tl-t1');
    if (t1) t1.innerHTML = t.t1.map(function (c) { return clipButton(c, 'T1'); }).join('');
    var fx = $('#tl-fx');
    if (fx) fx.innerHTML = t.fx.map(function (c) { return clipButton(c, 'FX'); }).join('');

    var marks = $('#tl-a1-marks');
    if (marks) {
      var voiceHtml = (t.a1.voices || []).map(function (v) {
        var left = pct(v.start, total), width = Math.max(1.4, pct(v.end - v.start, total));
        var title = esc(v.label + ' · ' + ((v.end - v.start) / 1000).toFixed(1) + '초');
        return '<span class="tl-voice" data-cut="' + v.cutIndex + '" style="left:' + left.toFixed(3) + '%;width:' + width.toFixed(3) + '%" title="' + title + '">' + esc(v.label) + '</span>';
      }).join('');
      marks.innerHTML = voiceHtml + t.a1.beats.map(function (ms, i) {
        return '<span class="tl-beat" data-strong="' + (i % 4 === 0 ? 'true' : 'false') + '" style="left:' + pct(ms, total).toFixed(3) + '%"></span>';
      }).join('');
    }
    drawTrackWave(t);

    renderRuler(total);

    ['v1', 't1', 'a1', 'fx'].forEach(function (k) {
      var el = $('#tl-count-' + k);
      if (el) el.textContent = String(t.counts[k.toUpperCase()] || 0);
    });

    var tlMeta = $('#tl-meta');
    if (tlMeta) tlMeta.textContent = t.v1.length + ' CLIPS · ' + (total / 1000).toFixed(1) + 'S';
    var sm = $('#scope-meta');
    if (sm) sm.textContent = 'RMS · ' + t.a1.beats.length + 'B';
    var eg = $('#export-grade');
    if (eg) eg.textContent = C.gradeLabel(p.grade);
    var stageMeta = $('#stage-meta');
    if (stageMeta) {
      var res = (D.RESOLUTIONS.filter(function (r) { return r.id === p.resolution; })[0] || D.RESOLUTIONS[0]);
      stageMeta.textContent = t.v1.length + '클립 · ' + res.w + '×' + res.h;
    }

    if (ui.selected) markSelected();
  }

  function drawTrackWave(t) {
    var canvas = $('#tl-a1');
    if (!canvas || !canvas.getContext) return;
    var row = canvas.parentNode;
    var w = Math.max(220, Math.round((row.clientWidth || 640)));
    var h = 34;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    var samples = t.a1.samples;
    var bars = Math.min(160, Math.max(40, Math.round(w / 6)));
    var bw = w / bars;
    for (var i = 0; i < bars; i++) {
      var v = samples[Math.floor(i / bars * samples.length)] || 0.3;
      var bh = Math.max(2, v * (h - 8));
      ctx.fillStyle = 'rgba(96,165,250,' + (0.34 + v * 0.5).toFixed(2) + ')';
      ctx.fillRect(i * bw + 0.5, (h - bh) / 2, Math.max(1, bw - 1), bh);
    }
  }

  function markSelected() {
    var all = document.querySelectorAll('.tl-clip');
    Array.prototype.forEach.call(all, function (el) {
      el.classList.toggle('is-selected', el.getAttribute('data-id') === ui.selected.id);
    });
  }

  function select(info) {
    ui.selected = info;
    markSelected();
    var label = $('#sel-label');
    var dur = $('#sel-dur');
    var durV = $('#sel-dur-v');
    var text = $('#sel-text');
    if (!label) return;
    if (!info) {
      label.textContent = '클립을 선택하세요';
      dur.disabled = true; text.disabled = true; durV.textContent = '—'; text.value = '';
      return;
    }
    var t = ui.tracks || C.buildTracks(api.state.project);
    if (info.track === 'V1') {
      var cut = api.state.project.cuts[info.cutIndex];
      if (!cut) return;
      label.textContent = 'V1 · ' + ('0' + (info.cutIndex + 1)).slice(-2) + ' ' + C.stageById(cut.stage).label + (info.part ? ' · ' + info.part : '');
      dur.disabled = false;
      dur.value = String(cut.duration);
      durV.textContent = cut.duration.toFixed(1) + 's';
      text.disabled = false;
      text.value = cut.headline;
      text.placeholder = '컷 제목';
    } else if (info.track === 'T1') {
      var sub = findSub(info.id);
      if (!sub) return;
      label.textContent = 'T1 · 자막 · ' + (info.start / 1000).toFixed(1) + 's';
      dur.disabled = true;
      durV.textContent = ((sub.end - sub.start) / 1000).toFixed(1) + 's';
      dur.value = String(Math.max(0.8, (sub.end - sub.start) / 1000));
      text.disabled = false;
      text.value = sub.text;
      text.placeholder = '자막 문장';
    } else {
      var fx = (t.fx.filter(function (f) { return f.id === info.id; })[0]);
      label.textContent = (fx ? 'FX · ' + fx.label : 'FX');
      dur.disabled = true; text.disabled = true; durV.textContent = '—'; text.value = '';
    }
  }

  function findSub(id) {
    var p = api.state.project;
    var list = Array.isArray(p.subtitles) && p.subtitles.length ? p.subtitles : ((ui.tracks || {}).t1 || []);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function materializeSubtitles() {
    var p = api.state.project;
    if (!Array.isArray(p.subtitles) || !p.subtitles.length) {
      p.subtitles = ((ui.tracks || C.buildTracks(p)).t1 || []).map(function (s) { return Object.assign({}, s); });
    }
    return p.subtitles;
  }

  /* ══════════════════════════════════════════════════════
     컬러 (휠 · 슬라이더 · 프리셋)
     ══════════════════════════════════════════════════════ */
  var GRADED_KEYS = ['exposure', 'contrast', 'saturation', 'temperature'];

  function renderGrade() {
    var g = C.normalizeGrade(api.state.project.grade);
    GRADED_KEYS.forEach(function (k) {
      var input = $('#g-' + k);
      var out = $('#g-' + k + '-v');
      if (input) input.value = String(g[k]);
      if (out) out.textContent = (g[k] > 0 ? '+' : '') + g[k];
    });
    var name = $('#grade-name');
    if (name) name.textContent = C.gradeLabel(g);
    var preset = C.matchGradePreset(g);
    Array.prototype.forEach.call(document.querySelectorAll('.grade-chip'), function (el) {
      el.setAttribute('aria-pressed', el.getAttribute('data-grade') === preset ? 'true' : 'false');
    });
    var puck = $('#wheel-puck');
    if (puck) {
      var r = 32;
      var x = clamp(g.temperature / 50, -1, 1) * r;
      var y = clamp(g.tint / 50, -1, 1) * r;
      puck.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    }
    var modeChip = $('#nle-mode-chip');
    var modeLabel = $('#nle-mode-label');
    if (modeChip && modeLabel) {
      var pro = P.hasAccess(api.state.pro);
      modeChip.setAttribute('data-mode', pro ? 'pro' : 'free');
      modeLabel.textContent = pro ? ('Pro · ' + P.providerById(api.state.pro.provider).name) : '무료 규칙 엔진';
    }
    var note = $('#grade-note p');
    if (note) {
      var theme = C.themeById(api.state.project.theme);
      var auto = C.gradeLabel(C.autoGrade(theme.id));
      note.textContent = '테마 ' + theme.name + ' 기준 추천은 ' + auto + '. ' +
        (preset ? '지금 룩은 ' + C.gradeById(preset).name + ' 프리셋과 같습니다.' : '지금 룩은 커스텀으로 저장됩니다.');
    }
  }

  function applyGrade(patch, commit) {
    var base = C.normalizeGrade(api.state.project.grade);
    Object.keys(patch).forEach(function (k) { base[k] = patch[k]; });
    api.state.project.grade = C.normalizeGrade(base);
    renderGrade();
    if (ui.rafPending) return;
    ui.rafPending = true;
    requestAnimationFrame(function () {
      ui.rafPending = false;
      api.onGrade();
      drawScope(api.state.preview ? api.state.preview.ms : 0);
    });
    if (commit) api.onGrade(true);
  }

  function bindGrade() {
    GRADED_KEYS.forEach(function (k) {
      var input = $('#g-' + k);
      if (!input) return;
      input.addEventListener('input', function () {
        var patch = {};
        patch[k] = Number(input.value) || 0;
        applyGrade(patch, false);
        api.saveSoon();
      });
      input.addEventListener('change', function () { api.saveSoon(); api.onGrade(true); });
    });
    var chips = $('#grade-presets');
    if (chips) {
      chips.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-grade]');
        if (!btn) return;
        var preset = C.gradeById(btn.getAttribute('data-grade'));
        api.state.project.grade = C.normalizeGrade(Object.assign({}, preset, { id: preset.id }));
        renderGrade();
        api.onGrade(true);
        api.saveSoon();
        drawScope(api.state.preview ? api.state.preview.ms : 0);
      });
    }
    var reset = $('#btn-grade-reset');
    if (reset) {
      reset.addEventListener('click', function () {
        api.state.project.grade = C.normalizeGrade(C.GRADES[0]);
        renderGrade();
        api.onGrade(true);
        api.saveSoon();
      });
    }
    var wheel = $('#color-wheel');
    if (wheel) {
      var drag = function (e) {
        var rect = wheel.getBoundingClientRect();
        var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        var dx = (e.clientX - cx) / (rect.width / 2);
        var dy = (e.clientY - cy) / (rect.height / 2);
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1) { dx /= d; dy /= d; }
        applyGrade({ temperature: Math.round(dx * 50), tint: Math.round(dy * 50) }, false);
      };
      wheel.addEventListener('pointerdown', function (e) {
        wheel.setPointerCapture && wheel.setPointerCapture(e.pointerId);
        wheel.setAttribute('data-drag', 'true');
        drag(e);
        e.preventDefault();
      });
      wheel.addEventListener('pointermove', function (e) {
        if (wheel.getAttribute('data-drag') !== 'true') return;
        drag(e);
      });
      wheel.addEventListener('pointerup', function () {
        wheel.setAttribute('data-drag', 'false');
        api.saveSoon();
        api.onGrade(true);
      });
      wheel.addEventListener('pointercancel', function () { wheel.setAttribute('data-drag', 'false'); });
      wheel.addEventListener('keydown', function (e) {
        var g = C.normalizeGrade(api.state.project.grade);
        var step = e.shiftKey ? 10 : 4;
        if (e.key === 'ArrowLeft') applyGrade({ temperature: g.temperature - step });
        else if (e.key === 'ArrowRight') applyGrade({ temperature: g.temperature + step });
        else if (e.key === 'ArrowUp') applyGrade({ tint: g.tint - step });
        else if (e.key === 'ArrowDown') applyGrade({ tint: g.tint + step });
        else return;
        e.preventDefault();
      });
    }
  }

  /* ══════════════════════════════════════════════════════
     스코프 (파형 + 스펙트럼)
     ══════════════════════════════════════════════════════ */
  function drawScope(ms) {
    var canvas = $('#scope-canvas');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var p = api.state.project;
    var total = (ui.tracks || C.buildTracks(p)).total || 1;
    var at = Number(ms) || 0;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(function (f) {
      ctx.beginPath(); ctx.moveTo(0, h * f); ctx.lineTo(w, h * f); ctx.stroke();
    });

    var samples = C.waveform(p, 72, at * 0.06);
    ctx.beginPath();
    for (var i = 0; i < samples.length; i++) {
      var x = (i / (samples.length - 1)) * w;
      var y = h * 0.5 - (samples[i] - 0.5) * h * 0.82;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(52,224,200,0.95)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    var bars = 34;
    for (var b = 0; b < bars; b++) {
      var v = samples[Math.floor(b / bars * samples.length)] || 0.2;
      var phase = (at / 240 + b * 0.19) % 1;
      var amp = clamp(v * (0.55 + 0.45 * Math.abs(Math.sin(phase * Math.PI))), 0.06, 1);
      var bh = amp * (h * 0.34);
      var bw = w / bars;
      ctx.fillStyle = 'rgba(139,92,246,' + (0.22 + amp * 0.5).toFixed(2) + ')';
      ctx.fillRect(b * bw + 1, h - bh - 4, Math.max(1, bw - 2), bh);
    }

    var playX = (at / Math.max(1, total)) * w;
    ctx.fillStyle = 'rgba(52,224,200,0.9)';
    ctx.fillRect(clamp(playX, 0, w - 1), 0, 1.5, h);
  }

  /* ══════════════════════════════════════════════════════
     시간 · 재생
     ══════════════════════════════════════════════════════ */
  function paintTime(ms, total) {
    var p = api.state.project;
    var fps = p.fps === 24 ? 24 : 30;
    var tc = C.formatTimecodeFrames(ms, fps);
    var a = $('#monitor-tc'), b = $('#tc-display');
    if (a) a.textContent = tc;
    if (b) b.textContent = tc;
    var head = $('#tl-playhead');
    if (head) head.style.left = (total ? clamp((ms / total) * 100, 0, 100) : 0) + '%';
  }

  function tick(ms, total) {
    paintTime(ms, total);
    var now = (root.performance && performance.now) ? performance.now() : Date.now();
    if (now - ui.lastTick > 66) {
      ui.lastTick = now;
      drawScope(ms);
    }
  }

  /* ══════════════════════════════════════════════════════
     스웜 활동 로그
     ══════════════════════════════════════════════════════ */
  function log(agentId, text, atMs) {
    var list = $('#swarm-log');
    if (!list) return;
    var li = document.createElement('li');
    li.setAttribute('data-agent', agentId);
    var name = agentId === 'system' ? 'SWARM' : C.agentById(agentId).name;
    var stamp = C.formatClock(atMs || 0);
    li.innerHTML = '<b>' + esc(name) + '</b><em>' + stamp + '</em><span>' + esc(text) + '</span>';
    list.appendChild(li);
    ui.logCount++;
    while (list.children.length > 24) list.removeChild(list.firstChild);
    list.scrollTop = list.scrollHeight;
  }

  function setAgentState(id, state) {
    var el = document.querySelector('.swarm-agent[data-agent="' + id + '"]');
    if (!el) return;
    el.setAttribute('data-state', state);
    var label = el.querySelector('.agent-state');
    if (label) label.textContent = state === 'working' ? 'WORKING' : (state === 'done' ? 'DONE' : 'IDLE');
  }

  function resetAgents() {
    C.AGENTS.forEach(function (a) { setAgentState(a.id, 'idle'); });
  }

  /* ══════════════════════════════════════════════════════
     커서 이동
     ══════════════════════════════════════════════════════ */
  function pointIn(selector, fx, fy) {
    var ws = $('#nle-workspace');
    var el = typeof selector === 'string' ? $(selector) : selector;
    if (!ws || !el) return { x: 40, y: 40 };
    var wr = ws.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left - wr.left + r.width * (fx === undefined ? 0.5 : fx)),
      y: Math.round(r.top - wr.top + r.height * (fy === undefined ? 0.5 : fy))
    };
  }

  function moveCursor(agentId, points, duration) {
    var el = document.querySelector('.swarm-cursor[data-agent="' + agentId + '"]');
    if (!el) return Promise.resolve();
    el.setAttribute('data-visible', 'true');
    if (!el.animate) {
      var last = points[points.length - 1];
      el.style.transform = 'translate3d(' + last.x + 'px,' + last.y + 'px,0)';
      return wait(duration);
    }
    var start = ui.cursorPos[agentId] || { x: 30 + Math.random() * 60, y: 60 + Math.random() * 40 };
    var frames = [{ transform: 'translate3d(' + start.x + 'px,' + start.y + 'px,0)' }];
    points.forEach(function (p, i) {
      frames.push({
        transform: 'translate3d(' + p.x + 'px,' + p.y + 'px,0)',
        offset: (i + 1) / points.length
      });
    });
    try {
      var anim = el.animate(frames, { duration: duration, easing: 'cubic-bezier(.33,.9,.3,1)', fill: 'forwards' });
      return new Promise(function (resolve) {
        anim.onfinish = function () {
          var last = points[points.length - 1];
          ui.cursorPos[agentId] = last;
          el.style.transform = 'translate3d(' + last.x + 'px,' + last.y + 'px,0)';
          try { anim.cancel(); } catch (e) { /* noop */ }
          resolve();
        };
        setTimeout(function () {
          if (!ui.cursorPos[agentId] || ui.cursorPos[agentId] !== points[points.length - 1]) {
            var last = points[points.length - 1];
            ui.cursorPos[agentId] = last;
            el.style.transform = 'translate3d(' + last.x + 'px,' + last.y + 'px,0)';
          }
          resolve();
        }, duration + 60);
      });
    } catch (e) {
      var last = points[points.length - 1];
      el.style.transform = 'translate3d(' + last.x + 'px,' + last.y + 'px,0)';
      return wait(duration);
    }
  }

  function hideCursors() {
    Array.prototype.forEach.call(document.querySelectorAll('.swarm-cursor'), function (el) {
      el.setAttribute('data-visible', 'false');
    });
  }

  /* ══════════════════════════════════════════════════════
     스웜 자동 편집
     ══════════════════════════════════════════════════════ */
  function setStatus(text, state) {
    var el = $('#swarm-status');
    if (!el) return;
    if (!text) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = text;
    if (state) el.setAttribute('data-state', state);
    else el.removeAttribute('data-state');
  }

  function proPlan(project) {
    var p = api.state.pro;
    var provider = P.providerById(p.provider);
    log('system', 'Pro 연결 감지 · ' + provider.name + ' API 호출');
    setStatus('Claude · API 응답 대기 중…');
    return P.script(p, {
      prompt: C.buildSwarmPrompt(project),
      topic: project.topic,
      tone: project.tone,
      platform: project.platform
    }).then(function (res) {
      var parsed = C.parseSwarmAi(res.text);
      var plan = C.planSwarm(project, { mode: 'pro' });
      if (parsed.cuts && parsed.cuts.length >= 3) {
        var merged = C.mergeAiCuts(project.cuts, parsed.cuts);
        plan.cuts = merged;
        plan.subtitles = C.subtitlesFromCuts(merged, 17);
        plan.steps[0].detail = merged.length + '컷 리듬 재구성 (API)';
        plan.steps[1].detail = plan.subtitles.length + '줄 자막 (API)';
      }
      if (parsed.grade) {
        plan.grade = parsed.grade;
        plan.steps[2].detail = C.gradeLabel(parsed.grade) + ' (API 추천)';
      }
      if (parsed.splits && Object.keys(parsed.splits).length) plan.splits = parsed.splits;
      if (parsed.notes) plan.steps[3].detail = parsed.notes.slice(0, 40);
      plan.mode = 'pro';
      log('gemini', 'API 응답 · 컷 ' + ((plan.cuts || project.cuts).length) + '개 · 색보정 ' + C.gradeLabel(plan.grade));
      return plan;
    }).catch(function (err) {
      log('system', 'API 실패(' + (err && err.message ? err.message.slice(0, 28) : '오류') + ') · 규칙 엔진으로 계속');
      var fallback = C.planSwarm(project, { mode: 'rules' });
      return fallback;
    });
  }

  function splitPoints() {
    var row = $('#tl-v1');
    return [
      pointIn(row, 0.12, 0.5), pointIn(row, 0.46, 0.5), pointIn(row, 0.78, 0.5), pointIn(row, 0.62, 0.5)
    ];
  }
  function captionPoints() {
    var row = $('#tl-t1');
    var monitor = $('.monitor-wrap');
    return [pointIn(row, 0.3, 0.5), pointIn(row, 0.7, 0.5), pointIn(monitor, 0.5, 0.72), pointIn(row, 0.5, 0.5)];
  }
  function colorPoints() {
    var wheel = $('.color-row');
    var monitor = $('.monitor-wrap');
    return [pointIn(wheel, 0.3, 0.4), pointIn(wheel, 0.7, 0.6), pointIn(monitor, 0.5, 0.45), pointIn(wheel, 0.5, 0.5)];
  }
  function audioPoints() {
    var row = $('.tl-row-audio');
    return [pointIn(row, 0.1, 0.5), pointIn(row, 0.5, 0.5), pointIn(row, 0.9, 0.5)];
  }

  function applyStep(project, plan, action) {
    if (action === 'split') {
      if (plan.cuts) project.cuts = C.normalizeCuts(plan.cuts);
      project.splits = plan.splits || {};
      project.subtitles = [];
    } else if (action === 'subtitles') {
      project.subtitles = plan.subtitles || C.subtitlesFromCuts(project.cuts, 17);
    } else if (action === 'grade') {
      project.grade = C.normalizeGrade(plan.grade);
    } else if (action === 'audio') {
      project.beats = plan.beats || C.audioBeats(project);
    }
    api.onSwarmChange(action);
  }

  function runSwarm() {
    if (ui.running) return Promise.resolve({ ok: false, reason: 'running' });
    var project = api.state.project;
    if (!project.cuts || !project.cuts.length) {
      api.toast('스토리보드를 먼저 만들어 주세요.', 'error');
      return Promise.resolve({ ok: false, reason: 'empty' });
    }
    ui.running = true;
    ui.startedAt = 0;
    var ws = $('#nle-workspace');
    if (ws) ws.setAttribute('data-swarm', 'running');
    var btn = $('#btn-swarm');
    if (btn) btn.disabled = true;
    resetAgents();
    var src = $('#swarm-log');
    if (src) src.innerHTML = '';
    var a1 = $$('.swarm-cursor'); // eslint-disable-line no-undef
    Array.prototype.forEach.call(a1, function (el) { el.setAttribute('data-visible', 'false'); });
    ui.cursorPos = {};
    var t0 = (root.performance && performance.now) ? performance.now() : Date.now();
    log('system', '스웜 세션 시작 · ' + (P.hasAccess(api.state.pro) ? 'Pro ' + P.providerById(api.state.pro.provider).name : '무료 규칙 엔진'));
    setStatus('스웜 준비 중…');

    var planPromise = P.hasAccess(api.state.pro) ? proPlan(project) : Promise.resolve(C.planSwarm(project, { mode: 'rules' }));
    return planPromise.then(function (plan) {
      var steps = plan.steps || [];
      if (plan.cuts) project.cuts = C.normalizeCuts(project.cuts); // 길이 유지 확인용
      log('system', '편집 계획 ' + steps.length + '단계 · ' + (plan.mode === 'pro' ? 'API 결과 반영' : '규칙 엔진'));
      setStatus('스웜 편집 중 · 0/' + steps.length);
      var chain = Promise.resolve();
      steps.forEach(function (step, i) {
        chain = chain.then(function () {
          setAgentState(step.agent, 'working');
          var pts = step.action === 'split' ? splitPoints()
            : step.action === 'subtitles' ? captionPoints()
            : step.action === 'grade' ? colorPoints()
            : audioPoints();
          var agentName = C.agentById(step.agent).name;
          setStatus(agentName + ' · ' + step.label + ' (' + (i + 1) + '/' + steps.length + ')');
          return moveCursor(step.agent, pts, 520).then(function () {
            applyStep(project, plan, step.action);
            var el = (root.performance && performance.now) ? performance.now() - t0 : 0;
            log(step.agent, step.label + ' — ' + step.detail, el);
            setAgentState(step.agent, 'done');
            setStatus('스웜 편집 중 · ' + (i + 1) + '/' + steps.length);
            return wait(160);
          });
        });
      });
      return chain.then(function () {
        var t = ui.tracks || C.buildTracks(project);
        log('system', '완료 · V1 ' + t.v1.length + '클립 / T1 ' + t.t1.length + '줄 / A1 ' + t.a1.beats.length + '비트 / ' + C.gradeLabel(project.grade),
          (root.performance && performance.now) ? performance.now() - t0 : 0);
        setStatus('스웜 편집 완료 · 타임라인에 적용됨', 'done');
        api.toast('AI 스웜 편집을 적용했습니다 · ' + t.v1.length + '클립');
        return { ok: true, mode: plan.mode, tracks: t };
      });
    }).catch(function (err) {
      log('system', '스웜 편집 실패 · ' + (err && err.message ? err.message : '알 수 없는 오류'));
      setStatus('스웜 편집 실패', 'done');
      return { ok: false, reason: 'error', message: err && err.message };
    }).then(function (result) {
      ui.running = false;
      if (ws) ws.setAttribute('data-swarm', 'done');
      if (btn) btn.disabled = false;
      setTimeout(hideCursors, 900);
      return result;
    });
  }

  /* ══════════════════════════════════════════════════════
     이벤트 연결
     ══════════════════════════════════════════════════════ */
  function bind() {
    var swarm = $('#btn-swarm');
    if (swarm) swarm.addEventListener('click', function () { runSwarm(); });

    var lanes = $('#tl-lanes');
    if (lanes) {
      lanes.addEventListener('click', function (e) {
        var btn = e.target.closest('.tl-clip');
        if (!btn) return;
        var info = {
          track: btn.getAttribute('data-track'),
          id: btn.getAttribute('data-id'),
          cutIndex: Number(btn.getAttribute('data-cut') || 0),
          part: (btn.querySelector('b') && / · B$/.test(btn.querySelector('b').textContent)) ? 'B' : '',
          start: Number(btn.getAttribute('data-start') || 0)
        };
        select(info);
        api.seek(info.start + 20);
      });
      lanes.addEventListener('dblclick', function (e) {
        var btn = e.target.closest('.tl-clip');
        if (!btn) return;
        api.playFrom(Number(btn.getAttribute('data-start') || 0));
      });
    }

    var dur = $('#sel-dur');
    if (dur) {
      dur.addEventListener('input', function () {
        if (!ui.selected || ui.selected.track !== 'V1') return;
        var cut = api.state.project.cuts[ui.selected.cutIndex];
        if (!cut) return;
        cut.duration = clamp(Number(dur.value) || cut.duration, 0.8, 15);
        api.state.project.subtitles = C.reflowSubtitles(api.state.project.subtitles, api.state.project.cuts);
        var out = $('#sel-dur-v');
        if (out) out.textContent = cut.duration.toFixed(1) + 's';
        api.onClipEdit('duration');
      });
    }
    var text = $('#sel-text');
    if (text) {
      text.addEventListener('input', function () {
        if (!ui.selected) return;
        if (ui.selected.track === 'V1') {
          var cut = api.state.project.cuts[ui.selected.cutIndex];
          if (!cut) return;
          cut.headline = text.value;
          api.state.project.subtitles = [];
          api.state.project.splits = api.state.project.splits || {};
          if (api.invalidateVoices) api.invalidateVoices();
        } else if (ui.selected.track === 'T1') {
          var list = materializeSubtitles();
          for (var i = 0; i < list.length; i++) {
            if (list[i].id === ui.selected.id) { list[i].text = text.value; break; }
          }
        } else return;
        api.onClipEdit('text');
      });
      text.addEventListener('change', function () { api.saveSoon(); });
    }

    root.addEventListener('resize', function () {
      if (ui.tracks) drawTrackWave(ui.tracks);
      drawScope(api.state.preview ? api.state.preview.ms : 0);
    });
  }

  function $$(sel) { return document.querySelectorAll(sel); }

  /* ══════════════════════════════════════════════════════
     공개
     ══════════════════════════════════════════════════════ */
  function refresh() {
    if (!api) return;
    renderTracks();
    renderMedia();
    renderGrade();
    paintTime(api.state.preview ? api.state.preview.ms : 0, (ui.tracks || {}).total || 0);
    drawScope(api.state.preview ? api.state.preview.ms : 0);
    if (ui.selected) {
      var info = ui.selected;
      ui.selected = null;
      select(info);
    }
  }

  function init(opts) {
    api = opts;
    buildStatic();
    bind();
    bindGrade();
    refresh();
    log('system', '준비됨 · 타임라인 ' + (ui.tracks ? ui.tracks.v1.length : 0) + '클립');
  }

  root.ShortsNLE = {
    init: init,
    refresh: refresh,
    renderGrade: renderGrade,
    runSwarm: runSwarm,
    tick: tick,
    select: select,
    drawScope: drawScope,
    isRunning: function () { return ui.running; },
    tracks: function () { return ui.tracks; },
    selected: function () { return ui.selected; },
    log: log
  };
})(typeof self !== 'undefined' ? self : this);
