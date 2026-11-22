/* ============================================================
   원탭 숏폼 스튜디오 · app.js  v1.0.0
   화면 조립과 상태 관리. 로직은 core.js, 그리기는 render.js,
   API는 pro.js.
   ============================================================ */
(function () {
  'use strict';

  var C = window.ShortsCore;
  var D = window.ShortsData;
  var R = window.ShortsRender;
  var P = window.ShortsPro;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var STORE_PROJECT = 'shorts-video-studio.project.v1';
  var STORE_THEME = 'shorts-video-studio.theme';
  var state = {
    project: C.emptyProject(),
    images: {},
    pro: P.load(),
    voices: [],
    useVoice: false,
    preview: null,
    previewAudio: null,
    exportBlob: null,
    exportName: '',
    recording: false,
    cancelFlag: null,
    aiDraft: null,
    aiImageData: null,
    aiRaw: '',
    saveTimer: 0,
    buildTimer: 0,
    sampleIndex: 0,
    fontsReady: false,
    activeCut: 0,
    modalMode: 'connect',
    guideBuilt: false,
    quotaWarned: false
  };

  /* ── 작은 도구 ─────────────────────────────────────────── */
  function toast(msg, tone) {
    var root = $('#toast-root');
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'toast';
    if (tone) el.setAttribute('data-tone', tone);
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .25s';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }, 2600);
  }

  function setSaveState(text) {
    var el = $('#save-state');
    if (el) el.textContent = text;
  }

  function saveProject() {
    try {
      var data = C.serializeProject(state.project);
      localStorage.setItem(STORE_PROJECT, JSON.stringify(data));
      setSaveState('저장됨');
      return true;
    } catch (e) {
      if (!state.quotaWarned) {
        state.quotaWarned = true;
        try {
          var slim = C.serializeProject(state.project);
          slim.cuts.forEach(function (c) { c.image = null; });
          localStorage.setItem(STORE_PROJECT, JSON.stringify(slim));
          setSaveState('이미지 제외 저장');
          toast('사진은 용량 때문에 자동 저장에서 제외했습니다. 영상에는 그대로 들어갑니다.');
        } catch (e2) {
          setSaveState('저장 안 됨');
        }
      }
      return false;
    }
  }

  function queueSave() {
    setSaveState('저장 중…');
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () { state.saveTimer = 0; saveProject(); }, 600);
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }, 60);
  }

  function downloadText(text, filename, mime) {
    downloadBlob(new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' }), filename);
  }

  function baseName() {
    return C.safeFileName(state.project.topic || 'shorts', 'shorts');
  }

  function activeCuts() {
    return state.project.cuts || [];
  }

  /* ── 정적 UI ───────────────────────────────────────────── */
  function buildSelects() {
    var platform = $('#f-platform');
    platform.innerHTML = C.PLATFORMS.map(function (p) {
      return '<option value="' + p.id + '">' + esc(p.name) + ' · ' + p.max + '초</option>';
    }).join('');

    var music = D.MUSIC.map(function (m) { return '<option value="' + m.id + '">' + esc(m.name) + '</option>'; }).join('');
    $('#f-music').innerHTML = music;
    $('#x-music').innerHTML = music;

    var res = D.RESOLUTIONS.map(function (r) {
      return '<option value="' + r.id + '">' + r.name + ' · ' + esc(r.desc) + '</option>';
    }).join('');
    $('#x-resolution').innerHTML = res;

    var tone = C.TONES.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('');
    $('#ai-tone-select').innerHTML = tone;

    $('#ai-voice').innerHTML = D.VOICES.map(function (v) {
      return '<option value="' + v.id + '">' + v.name + ' · ' + esc(v.desc) + '</option>';
    }).join('');
  }

  function buildToneCards() {
    $('#tone-cards').innerHTML = C.TONES.map(function (t) {
      return '<label class="tone-card">' +
        '<input type="radio" name="tone" value="' + t.id + '" />' +
        '<b>' + esc(t.name) + '</b>' +
        '<small>' + esc(t.desc) + ' · “' + esc(t.sample) + '”</small>' +
        '</label>';
    }).join('');
    $$('#tone-cards input').forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (!radio.checked) return;
        state.project.tone = radio.value;
        queueSave();
        refreshBridgePrompt();
      });
    });
  }

  function buildThemeCards() {
    $('#theme-grid').innerHTML = C.THEMES.map(function (t) {
      return '<button type="button" class="theme-card" role="radio" aria-checked="false" data-theme-id="' + t.id + '" title="' + esc(t.tagline) + '">' +
        '<span class="theme-swatch" style="background:' + t.bg + ';--sw-ink:' + t.ink + ';--sw-sub:' + t.sub + ';--sw-accent:' + t.accent + '">' +
        '<i style="background:' + t.accent + '"></i></span>' +
        '<span class="theme-name">' + esc(t.name) + '</span>' +
        '</button>';
    }).join('');
    $$('#theme-grid .theme-card').forEach(function (card) {
      card.addEventListener('click', function () {
        state.project.theme = card.getAttribute('data-theme-id');
        syncThemeCards();
        queueSave();
        refreshPreview(true);
        var theme = C.themeById(state.project.theme);
        $('#theme-name').textContent = theme.name;
        toast(theme.name + ' 테마 적용');
      });
    });
  }

  function syncThemeCards() {
    var current = state.project.theme;
    $$('#theme-grid .theme-card').forEach(function (card) {
      card.setAttribute('aria-checked', card.getAttribute('data-theme-id') === current ? 'true' : 'false');
    });
    var theme = C.themeById(current);
    $('#theme-name').textContent = theme.name;
  }

  function buildSamples() {
    $('#topic-samples').innerHTML = D.SAMPLES.map(function (s, i) {
      return '<button type="button" class="topic-chip" data-sample="' + i + '">' + esc(s.title) + '</button>';
    }).join('');
    $$('#topic-samples .topic-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var sample = D.SAMPLES[Number(chip.getAttribute('data-sample'))];
        loadSample(sample, true);
      });
    });
  }

  function buildGuide() {
    $('#guide-steps').innerHTML = D.GUIDE_STEPS.map(function (s) {
      return '<div class="guide-step"><b>STEP ' + s.no + '</b><h2>' + esc(s.title) + '</h2><p>' + esc(s.text) + '</p></div>';
    }).join('');

    $('#formula-list').innerHTML = C.STAGES.map(function (s, i) {
      return '<li><b>0' + (i + 1) + '</b><div><strong>' + esc(s.label) + ' · ' + esc(s.goal) + '</strong>' +
        '<span>' + esc(s.hint) + '</span></div></li>';
    }).join('');

    $('#hook-list').innerHTML = D.HOOK_FORMULAS.map(function (h) {
      return '<li><b>' + esc(h.name) + '</b><span>' + esc(h.tpl) + '</span><small>' + esc(h.why) + '</small></li>';
    }).join('');

    $('#platform-list').innerHTML = C.PLATFORMS.map(function (p) {
      return '<div class="platform-item"><b>' + esc(p.name) + '</b><span class="p-tag">' + p.ratio + ' · ' + p.max + '초</span>' +
        '<p>' + esc(p.note) + '</p></div>';
    }).join('');

    $('#caution-list').innerHTML = D.GUIDE_CAUTIONS.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('');

    $('#faq-list').innerHTML = D.FAQ.map(function (f) {
      return '<details><summary>' + esc(f.q) + '</summary><p>' + esc(f.a) + '</p></details>';
    }).join('');

    applyDesignReference();
  }

  /** Direction C(Dark Glass Studio) 팔레트를 그대로 참조해 대비 기준을 화면에 남긴다. */
  function applyDesignReference() {
    var DR = window.DesignRef;
    try {
      document.documentElement.setAttribute('data-design', 'designref.v3/dark-glass');
      var note = $('#design-note');
      if (!note || !DR || !DR.color) return;
      var ratio = DR.color.contrastRatio;
      var text = ratio('#F4F5F8', '#06070B');
      var sub = ratio('#ADB5C4', '#14161C');
      var accent = ratio('#B9A2FF', '#06070B');
      note.textContent = '디자인 기준 다크 글래스 스튜디오 (design-ref v3) · 본문 대비 ' + text.toFixed(2) + ':1 AA' +
        ' · 보조 ' + sub.toFixed(2) + ':1 AA · 포인트 #8B5CF6 / #34E0C8 · 포인트 글자 ' + accent.toFixed(2) + ':1';
    } catch (e) { /* 디자인 엔진이 없어도 앱은 동작한다 */ }
  }

  /* ── 테마(라이트/다크) ─────────────────────────────────── */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    var btn = $('#btn-theme');
    if (btn) btn.setAttribute('aria-label', theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
    try { localStorage.setItem(STORE_THEME, theme); } catch (e) { /* noop */ }
  }

  /* ── 프로젝트 <-> 폼 ──────────────────────────────────── */
  function syncFormFromProject() {
    var p = state.project;
    $('#f-topic').value = p.topic || '';
    $('#f-platform').value = p.platform;
    $('#f-transition').value = p.transition;
    $('#f-music').value = p.music;
    $('#f-handle').value = p.handle || '';
    $('#f-progress').checked = !!p.showProgress;
    $('#f-caption').checked = !!p.showCaption;
    $$('#tone-cards input').forEach(function (r) { r.checked = r.value === p.tone; });
    $$('#theme-grid .theme-card').forEach(function (c) { c.setAttribute('aria-checked', c.getAttribute('data-theme-id') === p.theme ? 'true' : 'false'); });
    $('#theme-name').textContent = C.themeById(p.theme).name;
    syncSettingsUI();
  }

  function syncSettingsUI() {
    var p = state.project;
    $$('#x-resolution option').forEach(function (o) { if (o.value === p.resolution) $('#x-resolution').value = p.resolution; });
    $('#x-fps').value = String(p.fps);
    $('#x-music').value = p.music;
    $('#x-transition').value = p.transition;
    $('#x-progress').checked = !!p.showProgress;
    $('#x-caption').checked = !!p.showCaption;
    $('#x-handle').value = p.handle || '';
    $('#f-music').value = p.music;
    $('#f-transition').value = p.transition;
    $('#f-platform').value = p.platform;
    $$('#tone-cards input').forEach(function (r) { r.checked = r.value === p.tone; });
    $('#ai-tone-select').value = p.tone;
  }

  /* ── 스토리보드 ───────────────────────────────────────── */
  function renderStoryboard() {
    var cuts = activeCuts();
    var list = $('#cut-list');
    if (!cuts.length) {
      list.innerHTML = '';
      $('#board-empty').hidden = false;
      $('#btn-to-studio').disabled = true;
      $('#btn-studio-cta').disabled = true;
      $('#btn-rebuild').disabled = true;
      $('#board-title').textContent = '아직 만든 스토리보드가 없습니다';
      updateStats();
      return;
    }
    $('#board-empty').hidden = true;
    $('#btn-to-studio').disabled = false;
    $('#btn-studio-cta').disabled = false;
    $('#btn-rebuild').disabled = false;

    list.innerHTML = cuts.map(function (cut, i) {
      var stage = C.stageById(cut.stage);
      var hasImage = !!cut.image;
      return '<li class="cut-card" data-cut-index="' + i + '" data-stage="' + cut.stage + '">' +
        '<div class="cut-rail">' +
          '<span class="cut-no">0' + (i + 1) + '</span>' +
          '<span class="cut-stage">' + esc(stage.label) + '</span>' +
          '<span class="cut-sec" data-role="sec">' + cut.duration.toFixed(1) + 's</span>' +
        '</div>' +
        '<div class="cut-body">' +
          '<label class="sr-only" for="cut-h-' + i + '">' + (i + 1) + '번 컷 제목</label>' +
          '<textarea class="cut-headline" id="cut-h-' + i + '" rows="2" maxlength="70" data-field="headline" data-index="' + i + '">' + esc(cut.headline) + '</textarea>' +
          '<label class="sr-only" for="cut-s-' + i + '">' + (i + 1) + '번 컷 보조 문장</label>' +
          '<input class="cut-sub" id="cut-s-' + i + '" type="text" maxlength="90" value="' + esc(cut.sub) + '" data-field="sub" data-index="' + i + '" placeholder="보조 문장 (선택)" />' +
          '<div class="cut-meta">' +
            '<label class="dur"><span>길이</span>' +
              '<input type="range" class="cut-duration" min="0.8" max="15" step="0.1" value="' + cut.duration + '" data-index="' + i + '" aria-label="' + (i + 1) + '번 컷 길이" />' +
              '<b data-role="dur">' + cut.duration.toFixed(1) + 's</b>' +
            '</label>' +
            '<div class="cut-tools">' +
              '<label class="mini-btn">사진/영상<input type="file" accept="image/*,video/*" hidden class="cut-file" data-index="' + i + '" /></label>' +
              '<button type="button" class="mini-btn lock" data-ai-image="' + i + '">AI 컷 이미지</button>' +
              '<button type="button" class="mini-btn" data-regen="' + i + '">문장 바꾸기</button>' +
              (hasImage ? '<button type="button" class="mini-btn" data-clear-img="' + i + '">이미지 빼기</button>' : '') +
            '</div>' +
          '</div>' +
          '<div class="cut-thumb" data-role="thumb"' + (hasImage ? '' : ' hidden') + '>' +
            (hasImage ? '<img src="' + esc(cut.image) + '" alt="' + (i + 1) + '번 컷 배경 이미지" />' : '') +
            '<span data-role="thumb-name">' + esc(cut.imageName || '내 이미지') + '</span>' +
          '</div>' +
          '<p class="cut-direction"><b>연출</b> ' + esc(cut.direction) + '</p>' +
        '</div>' +
      '</li>';
    }).join('');

    $$('#cut-list textarea.cut-headline').forEach(autoGrow);
    updateStats();
  }

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(120, Math.max(28, el.scrollHeight)) + 'px';
  }

  function updateStats() {
    var cuts = activeCuts();
    var stats = C.projectStats({ cuts: cuts, platform: state.project.platform });
    var title = state.project.topic ? state.project.topic + ' · 5컷 숏폼' : '5컷 숏폼 스토리보드';
    $('#board-title').textContent = cuts.length ? title : '아직 만든 스토리보드가 없습니다';
    var meta = $('#board-stats');
    if (cuts.length) {
      meta.innerHTML = '<b>' + cuts.length + '컷 · ' + stats.totalSec.toFixed(1) + '초 · ' + stats.chars + '자</b> · ' +
        esc(C.themeById(state.project.theme).name) + ' · ' + esc(C.platformById(state.project.platform).name) +
        (stats.overPlatformMax ? ' · <span style="color:var(--warn)">권장 ' + stats.platform.max + '초 초과</span>' : '');
    } else {
      meta.innerHTML = '왼쪽에 주제를 넣고 <strong>5컷 스토리보드 만들기</strong>를 누르면, 훅부터 행동까지 다섯 컷이 만들어집니다.';
    }

    var issues = C.validateProject({ cuts: cuts, topic: state.project.topic, platform: state.project.platform });
    var box = $('#board-issues');
    if (issues.length) {
      box.hidden = false;
      $('#issue-list').innerHTML = issues.map(function (it) {
        return '<li data-level="' + it.level + '">' + esc(it.text) + '</li>';
      }).join('');
    } else {
      box.hidden = true;
      $('#issue-list').innerHTML = '';
    }

    var tone = stats.aiTone;
    var badge = $('#ai-tone');
    if (cuts.length) {
      badge.hidden = false;
      var label = $('#ai-tone-label');
      label.textContent = 'AI 티 ' + tone.hits.length + '개 · ' + tone.label;
      label.setAttribute('data-tone', tone.score >= 86 ? 'ok' : (tone.score >= 60 ? 'warn' : 'danger'));
      $('#ai-tone-detail').textContent = tone.hits.length
        ? tone.hits.map(function (h) { return '“' + h.word + '” → ' + h.alt; }).join(' · ')
        : '상투적인 AI 표현이 없습니다.';
    } else {
      badge.hidden = true;
    }

    // 카피 축 진단 (copy-psych-engine): 5컷이 8개 설득 축을 얼마나 쓰는지
    var hookEl = $('#hook-score');
    var CP = window.CopyPsych;
    if (CP && CP.diagnose && cuts.length) {
      try {
        var script = cuts.map(function (c) { return C.stripMarks(c.headline) + ' ' + C.stripMarks(c.sub || ''); }).join(' ');
        var diag = CP.diagnose(script);
        var strong = (diag.strengths && diag.strengths[0]) || (diag.triggers || []).slice().sort(function (a, b) { return b.score - a.score; })[0];
        var gap = diag.gaps && diag.gaps[0];
        hookEl.hidden = false;
        hookEl.setAttribute('data-tone', diag.total >= 55 ? 'strong' : (diag.total >= 35 ? 'ok' : 'weak'));
        hookEl.innerHTML = '카피 축 진단 <b>' + (strong ? esc(strong.name) + ' ' + strong.score : '—') + '</b>' +
          (gap ? ' · 보완: ' + esc(gap.name) : ' · 8개 축 고루 사용');
        if (gap && gap.action) hookEl.title = gap.action;
      } catch (e) { hookEl.hidden = true; }
    } else {
      hookEl.hidden = true;
    }
    updateStudioFacts();
  }

  function updateStudioFacts() {
    var cuts = activeCuts();
    var stats = C.projectStats({ cuts: cuts, platform: state.project.platform });
    var res = D.RESOLUTIONS.filter(function (r) { return r.id === state.project.resolution; })[0] || D.RESOLUTIONS[0];
    var bytes = R.estimateBytes(stats.totalSec, res.w);
    var sizeText = bytes > 0 ? (bytes / 1048576).toFixed(1) + 'MB' : '-';
    $('#fact-len').textContent = stats.totalSec.toFixed(1) + '초';
    $('#fact-size').textContent = sizeText;
    $('#export-len').textContent = stats.totalSec.toFixed(1) + '초';
    $('#export-size').textContent = '약 ' + sizeText;
    $('#export-format').textContent = '.' + (R.pickMime(true).indexOf('mp4') >= 0 ? 'mp4' : 'webm') + ' · ' + res.name;
    $('#export-warn').hidden = !stats.overPlatformMax;
    $('#time-total').textContent = C.formatClock(C.totalMs(cuts));
    $('#stage-meta').textContent = cuts.length + '컷 · ' + res.w + '×' + res.h;
    var tlMeta = $('#tl-meta');
    if (tlMeta && window.ShortsNLE) {
      var nt = window.ShortsNLE.tracks();
      if (nt) tlMeta.textContent = nt.v1.length + ' CLIPS · ' + (nt.total / 1000).toFixed(1) + 'S';
    }
    $('#btn-export').disabled = !cuts.length || state.recording;
    $('#btn-srt').disabled = !cuts.length;
    $('#btn-vtt').disabled = !cuts.length;
    $('#btn-png').disabled = !cuts.length;
    $('#btn-txt').disabled = !cuts.length;
    $('#btn-caption').disabled = !cuts.length;
    $('#btn-poster').disabled = !cuts.length;
  }

  /* ── 미리보기 ──────────────────────────────────────────── */
  function initPreview() {
    var canvas = $('#preview-canvas');
    if (!canvas) return;
    state.preview = new R.Preview(canvas);
    state.preview.onTick = function (ms, total) {
      $('#time-now').textContent = C.formatClock(ms);
      $('#time-total').textContent = C.formatClock(total);
      if (window.ShortsNLE) window.ShortsNLE.tick(ms, total);
    };
    state.preview.onEnd = function () {
      stopPreviewAudio();
      $('#btn-play').textContent = '▶ 재생';
      $('#btn-play-big').setAttribute('data-playing', 'false');
    };
    drawPlaceholder();
  }

  function drawPlaceholder() {
    var canvas = $('#preview-canvas');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#181310';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(246,236,221,0.55)';
    ctx.font = '600 30px PlexKR, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('스토리보드를 먼저 만들어 주세요', canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'left';
  }

  function refreshPreview(keepMs) {
    if (!state.preview) return;
    if (!activeCuts().length) { drawPlaceholder(); return; }
    ensureImages();
    state.preview.setProject(state.project, state.images, keepMs);
    updateTimeline();
  }

  function ensureImages() {
    activeCuts().forEach(function (cut) {
      if (cut.image && !state.images[cut.id]) {
        R.dataUrlToImage(cut.image).then(function (img) {
          state.images[cut.id] = img;
          if (state.preview) state.preview.render();
        }).catch(function () { /* noop */ });
      }
    });
  }

  /** 타임라인은 NLE 모듈이 그린다(구 .tl-seg 행은 제거). */
  function updateTimeline() {
    if (window.ShortsNLE) window.ShortsNLE.refresh();
  }

  function stopPreviewAudio() {
    if (state.previewAudio) {
      try { state.previewAudio.stop(); } catch (e) { /* noop */ }
      state.previewAudio = null;
    }
  }

  function togglePlay() {
    if (!state.preview || !activeCuts().length) return;
    if (state.preview.playing) {
      state.preview.pause();
      stopPreviewAudio();
      $('#btn-play').textContent = '▶ 재생';
      $('#btn-play-big').setAttribute('data-playing', 'false');
      return;
    }
    var soundOn = $('#f-preview-sound').checked && state.project.music !== 'none';
    if (soundOn) {
      stopPreviewAudio();
      if (state.preview.ms > 40) state.preview.seek(0);
      try {
        var engine = new R.AudioEngine(state.project.music, { monitor: true, volume: 0.4 });
        if (engine.ok) {
          engine.resume();
          engine.start(C.totalMs(activeCuts()), C.timeline(activeCuts()));
          state.previewAudio = engine;
        }
      } catch (e) { /* noop */ }
    }
    state.preview.play();
    $('#btn-play').textContent = '❚❚ 일시정지';
    $('#btn-play-big').setAttribute('data-playing', 'true');
  }

  /* ── 스토리보드 조작 ──────────────────────────────────── */
  function buildStoryboard(silent) {
    var topic = $('#f-topic').value.trim();
    var script = $('#f-script').value.trim();
    if (!topic && !script) {
      toast('주제나 대본 중 하나는 넣어 주세요.', 'error');
      $('#f-topic').focus();
      return;
    }
    var res = C.distributeCuts({
      topic: topic,
      script: script,
      tone: state.project.tone,
      theme: state.project.theme,
      variant: Math.floor(Math.random() * 97)
    });
    state.project.topic = topic || res.topic;
    state.project.cuts = res.cuts;
    state.project.splits = {};
    state.project.subtitles = [];
    state.project.beats = [];
    state.images = {};
    state.voices = [];
    state.useVoice = false;
    $('#f-use-voice').checked = false;
    $('#voice-list').innerHTML = '';
    $('#voice-list').hidden = true;
    renderStoryboard();
    refreshPreview(false);
    refreshBridgePrompt();
    queueSave();
    updateAiCutSelect();
    if (!silent) toast('5컷을 만들었습니다 · ' + C.projectStats(state.project).totalSec.toFixed(1) + '초');
    if (!silent && window.innerWidth < 1020) {
      var panel = $('#cut-list');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function loadSample(sample, build) {
    if (!sample) return;
    state.project.topic = sample.topic;
    state.project.tone = sample.tone || 'friendly';
    state.project.theme = sample.theme || 'editorial';
    $('#f-topic').value = sample.topic;
    $('#f-script').value = sample.script || '';
    updateScriptCount();
    syncFormFromProject();
    syncThemeCards();
    if (build !== false) buildStoryboard();
  }

  function regenCut(index) {
    var cuts = C.regenerateCut(activeCuts(), index, {
      tone: state.project.tone,
      topic: state.project.topic
    });
    state.project.cuts = cuts;
    state.project.splits = {};
    state.project.subtitles = [];
    renderStoryboard();
    refreshPreview(true);
    refreshBridgePrompt();
    queueSave();
    toast((index + 1) + '번 컷 문장을 바꿨습니다');
  }

  function updateScriptCount() {
    var n = $('#f-script').value.length;
    $('#script-count').textContent = n + '자';
  }

  function attachImage(index, file) {
    if (!file) return;
    R.loadImageSource(file).then(function (img) {
      var canvas = document.createElement('canvas');
      var maxW = 1080, maxH = 1920;
      var scale = Math.min(1, maxW / img.width, maxH / img.height);
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var dataUrl;
      try { dataUrl = canvas.toDataURL('image/jpeg', 0.86); }
      catch (e) { toast('이 이미지는 브라우저에서 읽을 수 없습니다.', 'error'); return; }
      var cut = state.project.cuts[index];
      cut.image = dataUrl;
      cut.imageName = file.name ? file.name.slice(0, 48) : '내 이미지';
      cut.aiImage = false;
      state.images[cut.id] = img;
      renderStoryboard();
      refreshPreview(true);
      queueSave();
      toast((index + 1) + '번 컷에 사진을 넣었습니다');
    }).catch(function (err) {
      toast(err.message || '파일을 읽지 못했습니다.', 'error');
    });
  }

  /* ── 내보내기 ──────────────────────────────────────────── */
  function showExportProgress(pct, ms, total) {
    var box = $('#export-progress');
    box.hidden = false;
    $('#progress-bar').style.width = Math.round(pct * 100) + '%';
    var left = Math.max(0, Math.ceil((total - ms) / 1000));
    $('#progress-text').textContent = '녹화 중… ' + Math.round(pct * 100) + '% · 남은 시간 약 ' + left + '초';
  }

  function doExport() {
    if (state.recording || !activeCuts().length) return;
    var res = D.RESOLUTIONS.filter(function (r) { return r.id === state.project.resolution; })[0] || D.RESOLUTIONS[0];
    state.recording = true;
    state.cancelFlag = { cancelled: false };
    $('#btn-export').disabled = true;
    $('#export-result').hidden = true;
    $('#export-progress').hidden = false;
    $('#btn-cancel-export').hidden = false;
    $('#progress-bar').style.width = '0%';
    $('#progress-text').textContent = '녹화 준비 중…';
    $('#btn-cancel-export').onclick = function () {
      if (state.cancelFlag) state.cancelFlag.cancelled = true;
      $('#progress-text').textContent = '취소하는 중…';
    };

    var voices = state.useVoice ? state.voices.map(function (v) {
      return { buffer: v.buffer, startMs: v.startMs };
    }) : [];

    R.recordVideo({
      cuts: activeCuts(),
      project: state.project,
      width: res.w, height: res.h, fps: state.project.fps,
      images: state.images,
      voices: voices,
      signal: state.cancelFlag,
      onProgress: showExportProgress
    }).then(function (out) {
      state.exportBlob = out.blob;
      state.exportName = baseName() + '-9x16.' + out.ext;
      state.exportInfo = {
        type: out.blob.type, mime: out.mime, size: out.blob.size, hasAudio: out.hasAudio,
        width: out.width, height: out.height, durationMs: out.durationMs
      };
      if (state.exportUrl) { try { URL.revokeObjectURL(state.exportUrl); } catch (e) { /* noop */ } }
      var url = URL.createObjectURL(out.blob);
      state.exportUrl = url;
      var video = $('#result-video');
      video.src = url;
      $('#btn-download').href = url;
      $('#btn-download').setAttribute('download', state.exportName);
      $('#result-meta').textContent = out.width + '×' + out.height + ' · ' + (out.durationMs / 1000).toFixed(1) + '초 · ' +
        (out.blob.size / 1048576).toFixed(1) + 'MB · ' + (out.hasAudio ? '배경음 포함' : '무음') + ' · ' + out.ext.toUpperCase();
      $('#export-result').hidden = false;
      $('#export-progress').hidden = true;
      toast('영상이 완성됐습니다 · ' + (out.blob.size / 1048576).toFixed(1) + 'MB');
      if (window.innerWidth < 1020) $('#export-result').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }).catch(function (err) {
      $('#export-progress').hidden = true;
      toast(err && err.message ? err.message : '녹화에 실패했습니다.', 'error');
    }).then(function () {
      state.recording = false;
      state.cancelFlag = null;
      $('#btn-export').disabled = !activeCuts().length;
      $('#btn-cancel-export').hidden = true;
    });
  }

  function srtText() {
    var subs = state.project.subtitles;
    if (Array.isArray(subs) && subs.length) return C.buildSrtFromSubtitles(subs);
    return C.buildSrt(activeCuts(), { maxChars: 17 });
  }

  function vttText() {
    var subs = state.project.subtitles;
    if (Array.isArray(subs) && subs.length) return C.buildVttFromSubtitles(subs);
    return C.buildVtt(activeCuts());
  }

  /* ── Pro 연결 ─────────────────────────────────────────── */
  function currentEntry() {
    return state.pro.entries[state.pro.provider];
  }

  function proProvider() {
    return P.providerById(state.pro.provider);
  }

  function fillProFields() {
    var e = currentEntry();
    var p = proProvider();
    $('#p-key').value = e.key || '';
    $('#p-base').value = e.baseUrl || '';
    $('#p-model').value = e.model || p.models.script;
    $('#p-image-model').value = e.imageModel || p.models.image || '';
    $('#p-tts-model').value = e.ttsModel || p.models.tts || '';
    $('#wrap-base').hidden = !p.needsBase;
    $('#wrap-image-model').hidden = p.caps.indexOf('image') < 0;
    $('#wrap-tts-model').hidden = p.caps.indexOf('tts') < 0;
    $('#p-key').placeholder = p.keyHint || 'API 키 붙여넣기';
    $('#pro-note').textContent = p.note || '';
    $('#key-state').hidden = !e.key;
    $('#key-mask').textContent = e.key ? P.maskKey(e.key) : '';
    $('#btn-disconnect').hidden = !P.hasAccess(state.pro);
    $('#btn-connect').textContent = P.isConnected(state.pro) ? '다시 확인' : '연결 확인';
    $('#ai-topic').placeholder = state.project.topic ? '예) ' + state.project.topic : '예) 홈카페 라떼';
  }

  function captureProFields() {
    var e = currentEntry();
    e.key = $('#p-key').value.trim();
    e.baseUrl = P.normalizeBase($('#p-base').value);
    e.model = $('#p-model').value.trim() || proProvider().models.script;
    e.imageModel = $('#p-image-model').value.trim();
    e.ttsModel = $('#p-tts-model').value.trim();
    P.save(state.pro);
  }

  function setProvider(id) {
    captureProFields();
    state.pro.provider = P.providerById(id).id;
    P.save(state.pro);
    renderProviderCards();
    fillProFields();
    renderModalProviders();
    refreshProState();
    refreshCapChips();
    setStatus('#pro-status', '', '');
  }

  function renderProviderCards() {
    $('#provider-cards').innerHTML = P.PROVIDERS.map(function (p, i) {
      return '<button type="button" class="provider-card" role="radio" aria-checked="' + (p.id === state.pro.provider ? 'true' : 'false') + '" data-provider="' + p.id + '">' +
        '<span class="provider-rank">' + (i + 1) + '번</span>' +
        '<strong>' + esc(p.name) + '</strong>' +
        '<span class="p-tag">' + esc(p.tag) + '</span>' +
        '<small>' + esc(p.desc) + '</small>' +
        '<span class="p-caps">' + p.caps.map(function (c) {
          return '<span class="p-cap">' + ({ script: '대본', image: '이미지', tts: '성우' }[c] || c) + '</span>';
        }).join('') + '</span>' +
      '</button>';
    }).join('');
    $$('#provider-cards .provider-card').forEach(function (card) {
      card.addEventListener('click', function () { setProvider(card.getAttribute('data-provider')); });
    });
  }

  function refreshProState() {
    var connected = P.isConnected(state.pro);
    var hasKey = P.hasAccess(state.pro);
    var p = proProvider();
    var label = connected ? 'Pro 연결됨 · ' + p.name : (hasKey ? '확인 필요 · ' + p.name : '무료 모드');
    $('#pro-badge-label').textContent = label;
    $('#btn-pro-badge').setAttribute('data-connected', connected ? 'true' : 'false');
    $('#pro-state').setAttribute('data-connected', connected ? 'true' : 'false');
    $('#pro-state-label').textContent = connected ? p.name + ' 연결됨' : (hasKey ? p.name + ' 키 입력됨' : '무료 모드');
    $('#pro-state-detail').textContent = connected
      ? (currentEntry().model || p.models.script) + ' · 이 탭에서만'
      : (hasKey ? '“연결 확인”을 눌러 검증하세요' : '연결 없이 영상 제작 가능');
    if (connected) {
      setStatus('#pro-status', p.name + '에 연결되어 있습니다 · 키 ' + P.maskKey(currentEntry().key || '') + ' · 모델 ' + (currentEntry().model || p.models.script), 'ok');
    }
  }

  function refreshCapChips() {
    var caps = proProvider().caps;
    ['script', 'image', 'tts'].forEach(function (c) {
      var el = $('#cap-' + c);
      if (el) el.innerHTML = '<span class="cap-chip' + (caps.indexOf(c) >= 0 ? ' on' : '') + '">' + ({ script: 'SCRIPT', image: 'IMAGE', tts: 'VOICE' }[c]) + (caps.indexOf(c) >= 0 ? ' ✓' : ' ✕') + '</span>';
    });
  }

  function setStatus(sel, text, kind) {
    var el = $(sel);
    if (!el) return;
    el.textContent = text || '';
    if (kind) el.setAttribute('data-state', kind);
    else el.removeAttribute('data-state');
  }

  function connectPro(source) {
    var isModal = source === 'modal';
    if (isModal) {
      state.pro.provider = state.modalProvider || state.pro.provider;
      var e = currentEntry();
      e.key = $('#modal-key').value.trim();
      e.baseUrl = P.normalizeBase($('#modal-base').value) || e.baseUrl;
      P.save(state.pro);
    } else {
      captureProFields();
    }
    var p = proProvider();
    var e2 = currentEntry();
    if (!P.hasAccess(state.pro)) {
      var msg = p.needsBase ? '서버 주소를 입력하세요.' : 'API 키를 입력하세요.';
      setStatus(isModal ? '#modal-status' : '#pro-status', msg, 'error');
      return;
    }
    var btn = isModal ? $('#btn-modal-connect') : $('#btn-connect');
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '확인 중…';
    setStatus(isModal ? '#modal-status' : '#pro-status', p.name + '에 연결을 확인하는 중…', 'busy');
    P.test(state.pro).then(function (res) {
      e2.connected = true;
      P.save(state.pro);
      setStatus(isModal ? '#modal-status' : '#pro-status', res.label + ' · ' + res.detail, 'ok');
      if (isModal) {
        fillProFields();
        setTimeout(function () { closeModal(); }, 700);
      }
      renderProviderCards();
      refreshProState();
      fillProFields();
      refreshCapChips();
      toast(res.label);
    }).catch(function (err) {
      e2.connected = false;
      P.save(state.pro);
      setStatus(isModal ? '#modal-status' : '#pro-status', err.message || '연결하지 못했습니다.', 'error');
    }).then(function () {
      btn.disabled = false;
      btn.textContent = old;
    });
  }

  function disconnectPro() {
    var e = currentEntry();
    e.key = '';
    e.connected = false;
    P.save(state.pro);
    fillProFields();
    refreshProState();
    setStatus('#pro-status', '연결을 해제했습니다. 무료 모드로 동작합니다.', 'ok');
    $('#pro-badge-label').textContent = '무료 모드';
    $('#btn-pro-badge').setAttribute('data-connected', 'false');
    toast('연결을 해제했습니다');
  }

  /* ── Pro 모달 ─────────────────────────────────────────── */
  function renderModalProviders() {
    $('#modal-providers').innerHTML = P.PROVIDERS.map(function (p, i) {
      return '<button type="button" class="provider-card" role="radio" aria-checked="' + (p.id === (state.modalProvider || state.pro.provider) ? 'true' : 'false') + '" data-modal-provider="' + p.id + '">' +
        '<span class="provider-rank">' + (i + 1) + '</span>' +
        '<strong>' + esc(p.name) + '</strong>' +
        '<span class="p-tag">' + esc(p.tag) + '</span>' +
      '</button>';
    }).join('');
    $$('#modal-providers .provider-card').forEach(function (card) {
      card.addEventListener('click', function () {
        state.modalProvider = card.getAttribute('data-modal-provider');
        renderModalProviders();
        var e = state.pro.entries[state.modalProvider];
        $('#modal-key').value = e.key || '';
        $('#modal-base').value = e.baseUrl || '';
        $('#modal-base-wrap').hidden = !P.providerById(state.modalProvider).needsBase;
        setStatus('#modal-status', '', '');
      });
    });
    var p = P.providerById(state.modalProvider || state.pro.provider);
    $('#modal-base-wrap').hidden = !p.needsBase;
    setStatus('#modal-status', '', '');
  }

  function openModal() {
    state.modalProvider = state.pro.provider;
    var e = currentEntry();
    $('#modal-key').value = e.key || '';
    $('#modal-base').value = e.baseUrl || '';
    renderModalProviders();
    var dialog = $('#pro-modal');
    if (dialog && dialog.showModal) {
      try { dialog.showModal(); } catch (err) { dialog.setAttribute('open', 'open'); }
    }
  }

  function closeModal() {
    var dialog = $('#pro-modal');
    if (!dialog) return;
    if (dialog.close) dialog.close();
    else dialog.removeAttribute('open');
  }

  /* ── AI 기능 ──────────────────────────────────────────── */
  function requirePro(sel) {
    if (!P.hasAccess(state.pro)) {
      setStatus(sel, 'Pro 연결이 필요합니다. 아래에서 키를 넣거나 무료 브리지를 쓰세요.', 'error');
      openModal();
      return false;
    }
    return true;
  }

  function aiScript() {
    if (!requirePro('#ai-script-status')) return;
    var topic = $('#ai-topic').value.trim() || state.project.topic || $('#f-topic').value.trim();
    if (!topic) {
      setStatus('#ai-script-status', '주제를 먼저 입력하세요.', 'error');
      $('#ai-topic').focus();
      return;
    }
    var tone = $('#ai-tone-select').value;
    var extra = $('#ai-extra').value.trim();
    var prompt = C.buildScriptPrompt({ topic: topic, tone: tone, platform: state.project.platform, extra: extra });
    var btn = $('#btn-ai-script');
    btn.disabled = true;
    setStatus('#ai-script-status', '대본을 만드는 중… (10~30초)', 'busy');
    $('#ai-script-out').hidden = true;
    $('#btn-ai-apply').hidden = true;
    P.script(state.pro, { prompt: prompt, topic: topic, tone: tone, platform: state.project.platform }).then(function (res) {
      var cuts = C.parseAiCuts(res.text);
      state.aiRaw = res.text;
      if (!cuts.length) {
        state.aiDraft = null;
        $('#ai-script-out').hidden = false;
        $('#ai-script-out').textContent = res.text.slice(0, 1400);
        setStatus('#ai-script-status', '응답을 5컷으로 읽지 못했습니다. 아래 원문을 복사해 브리지에 붙여넣어 보세요.', 'error');
        return;
      }
      state.aiDraft = cuts;
      var out = $('#ai-script-out');
      out.hidden = false;
      out.innerHTML = cuts.map(function (c, i) {
        return '<div class="out-cut"><b>' + (i + 1) + ' · ' + esc(C.stageById(c.stage || 'hook').label) + '</b>' +
          '<span>' + esc(c.headline) + '</span>' +
          (c.sub ? '<small>' + esc(c.sub) + '</small>' : '') +
          (c.direction ? '<small>연출 · ' + esc(c.direction) + '</small>' : '') + '</div>';
      }).join('');
      $('#btn-ai-apply').hidden = false;
      var toneCheck = C.checkAiTone(cuts.map(function (c) { return c.headline + ' ' + c.sub; }).join(' '));
      var mini = $('#ai-tone-mini');
      mini.hidden = false;
      mini.textContent = 'AI 티 점검: ' + toneCheck.score + '/100 · ' + toneCheck.label +
        (toneCheck.hits.length ? ' (' + toneCheck.hits.map(function (h) { return h.word; }).join(', ') + ')' : '');
      setStatus('#ai-script-status', '5컷 대본을 받았습니다. 적용하면 스토리보드가 바뀝니다.', 'ok');
    }).catch(function (err) {
      setStatus('#ai-script-status', err.message || '대본 생성에 실패했습니다.', 'error');
    }).then(function () {
      btn.disabled = false;
    });
  }

  function applyAiDraft() {
    if (!state.aiDraft) return;
    state.project.cuts = C.mergeAiCuts(activeCuts(), state.aiDraft);
    state.project.splits = {};
    state.project.subtitles = [];
    if ($('#ai-topic').value.trim()) state.project.topic = $('#ai-topic').value.trim();
    $('#f-topic').value = state.project.topic;
    renderStoryboard();
    refreshPreview(false);
    refreshBridgePrompt();
    updateAiCutSelect();
    queueSave();
    toast('AI 대본을 스토리보드에 적용했습니다');
  }

  function updateAiCutSelect() {
    var sel = $('#ai-image-cut');
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = activeCuts().map(function (c, i) {
      return '<option value="' + i + '">' + (i + 1) + '컷 · ' + esc(C.stageById(c.stage).label) + ' — ' + esc(C.clean(c.headline, 18)) + '</option>';
    }).join('');
    if (cur && Number(cur) < activeCuts().length) sel.value = cur;
    updateImagePromptPreview();
  }

  function updateImagePromptPreview() {
    var el = $('#image-prompt-preview');
    if (!el) return;
    var i = Number($('#ai-image-cut').value || 0);
    var cut = activeCuts()[i];
    if (!cut) { el.textContent = '대본을 만들면 장면 프롬프트가 여기에 표시됩니다.'; return; }
    el.textContent = C.buildImagePrompt(cut, state.project);
  }

  function updateVoicePreview() {
    var el = $('#voice-text-preview');
    if (!el) return;
    var cuts = activeCuts();
    if (!cuts.length) { el.textContent = '스토리보드의 5컷 문장을 컷마다 읽어 줍니다.'; return; }
    el.textContent = cuts.map(function (c, i) { return (i + 1) + ') ' + C.narrationText(c); }).join('\n');
  }

  function aiImage() {
    if (!requirePro('#ai-image-status')) return;
    var i = Number($('#ai-image-cut').value || 0);
    var cut = activeCuts()[i];
    if (!cut) { setStatus('#ai-image-status', '컷이 없습니다. 스토리보드를 먼저 만드세요.', 'error'); return; }
    var prompt = C.buildImagePrompt(cut, state.project);
    var size = $('#ai-image-size').value;
    var btn = $('#btn-ai-image');
    btn.disabled = true;
    setStatus('#ai-image-status', '이미지를 만드는 중… (15~60초)', 'busy');
    $('#ai-image-result').hidden = true;
    P.image(state.pro, prompt, size).then(function (res) {
      if (res.dataUrl) return res.dataUrl;
      if (res.url) {
        return fetch(res.url).then(function (r) {
          if (!r.ok) throw new Error('이미지 주소를 불러오지 못했습니다(' + r.status + ').');
          return r.blob();
        }).then(function (blob) {
          return new Promise(function (resolve, reject) {
            var fr = new FileReader();
            fr.onload = function () { resolve(String(fr.result)); };
            fr.onerror = function () { reject(new Error('이미지를 읽지 못했습니다.')); };
            fr.readAsDataURL(blob);
          });
        });
      }
      throw new Error('이미지 데이터가 없습니다.');
    }).then(function (dataUrl) {
      state.aiImageData = dataUrl;
      $('#ai-image-preview').src = dataUrl;
      $('#ai-image-result').hidden = false;
      setStatus('#ai-image-status', '이미지를 받았습니다. “이 컷에 넣기”를 누르면 적용됩니다.', 'ok');
    }).catch(function (err) {
      setStatus('#ai-image-status', err.message || '이미지 생성에 실패했습니다.', 'error');
    }).then(function () {
      btn.disabled = false;
    });
  }

  function applyAiImage() {
    if (!state.aiImageData) return;
    var i = Number($('#ai-image-cut').value || 0);
    var cut = activeCuts()[i];
    if (!cut) return;
    cut.image = state.aiImageData;
    cut.aiImage = true;
    cut.imageName = 'AI 생성 이미지';
    R.dataUrlToImage(cut.image).then(function (img) {
      state.images[cut.id] = img;
      refreshPreview(true);
    }).catch(function () {});
    renderStoryboard();
    queueSave();
    toast((i + 1) + '번 컷에 AI 이미지를 넣었습니다');
    state.aiImageData = null;
    $('#ai-image-result').hidden = true;
    setStatus('#ai-image-status', '적용했습니다. 마음에 안 들면 다시 생성하세요.', 'ok');
  }

  function aiVoice() {
    if (!requirePro('#ai-voice-status')) return;
    var cuts = activeCuts();
    if (!cuts.length) { setStatus('#ai-voice-status', '컷이 없습니다.', 'error'); return; }
    var voice = $('#ai-voice').value;
    var btn = $('#btn-ai-voice');
    btn.disabled = true;
    $('#voice-list').innerHTML = '';
    $('#voice-list').hidden = true;
    state.voices = [];
    var tl = C.timeline(cuts);
    var done = 0;
    var chain = Promise.resolve();
    cuts.forEach(function (cut, i) {
      chain = chain.then(function () {
        setStatus('#ai-voice-status', '성우 음성 ' + (i + 1) + '/' + cuts.length + ' 만드는 중…', 'busy');
        return P.tts(state.pro, C.narrationText(cut), voice).then(function (res) {
          return P.decodeAudio(res.blob).then(function (buffer) {
            state.voices.push({
              cutId: cut.id, index: i, buffer: buffer,
              blobUrl: URL.createObjectURL(res.blob)
            });
            done++;
            var li = document.createElement('li');
            li.className = 'voice-item';
            li.innerHTML = '<b>' + (i + 1) + '컷</b><audio controls preload="metadata" src="' + state.voices[state.voices.length - 1].blobUrl + '"></audio><span class="ok-mark">완료</span>';
            $('#voice-list').hidden = false;
            $('#voice-list').appendChild(li);
          });
        });
      });
    });
    chain.then(function () {
      state.voices.forEach(function (v) {
        var seg = tl[v.index];
        v.startMs = seg ? seg.start : 0;
        v.durationMs = Math.round(v.buffer.duration * 1000);
      });
      state.useVoice = true;
      $('#f-use-voice').checked = true;
      setStatus('#ai-voice-status', done + '개 컷 성우 음성을 만들었습니다. 영상 녹화에 합성됩니다.', 'ok');
      toast('성우 음성 ' + done + '개 완성');
    }).catch(function (err) {
      setStatus('#ai-voice-status', err.message || '음성 생성에 실패했습니다.', 'error');
    }).then(function () {
      btn.disabled = false;
    });
  }

  /* ── 무료 브리지 ──────────────────────────────────────── */
  function bridgePromptText() {
    var cuts = activeCuts();
    var base = C.buildScriptPrompt({
      topic: state.project.topic || $('#f-topic').value || '주제 미정',
      tone: state.project.tone,
      platform: state.project.platform,
      extra: '아래 현재 스토리보드를 더 자연스럽고 구체적으로 다시 써 주세요.'
    });
    if (!cuts.length) return base;
    var current = cuts.map(function (c, i) {
      return (i + 1) + ') ' + c.headline + (c.sub ? ' / ' + c.sub : '');
    }).join('\n');
    return base + '\n\n현재 스토리보드(참고):\n' + current + '\n\n출력은 위와 같은 JSON 배열만.';
  }

  function refreshBridgePrompt() {
    var el = $('#bridge-prompt');
    if (el) el.value = bridgePromptText();
  }

  function importFromPaste() {
    var raw = $('#ai-paste').value.trim();
    if (!raw) { setStatus('#import-status', '붙여넣은 내용이 없습니다.', 'error'); return; }
    var cuts = C.parseAiCuts(raw);
    if (!cuts.length) { setStatus('#import-status', '5컷으로 읽지 못했습니다. “1) 훅: …” 또는 JSON 배열 형태로 붙여넣어 주세요.', 'error'); return; }
    state.project.cuts = C.mergeAiCuts(activeCuts(), cuts);
    state.project.splits = {};
    state.project.subtitles = [];
    renderStoryboard();
    refreshPreview(false);
    refreshBridgePrompt();
    updateAiCutSelect();
    queueSave();
    setStatus('#import-status', cuts.length + '컷을 가져왔습니다. 스토리보드를 확인하세요.', 'ok');
    toast('받은 대본을 스토리보드에 넣었습니다');
  }

  /* ── 탭 ───────────────────────────────────────────────── */
  function go(tab) {
    if (!tab) return;
    var known = ['board', 'studio', 'pro', 'guide'];
    if (known.indexOf(tab) < 0) tab = 'board';
    $$('.tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    known.forEach(function (name) {
      var view = $('#view-' + name);
      if (!view) return;
      var on = name === tab;
      view.hidden = !on;
      view.classList.toggle('is-active', on);
    });
    if (state.preview && state.preview.playing && tab !== 'studio') {
      state.preview.pause();
      stopPreviewAudio();
      $('#btn-play').textContent = '▶ 재생';
      $('#btn-play-big').setAttribute('data-playing', 'false');
    }
    if (tab === 'studio') {
      ensureNLE();
      refreshPreview(true);
      updateStudioFacts();
      if (window.ShortsNLE) window.ShortsNLE.refresh();
    }
    if (tab === 'pro') {
      renderProviderCards();
      fillProFields();
      refreshProState();
      refreshCapChips();
      updateAiCutSelect();
      refreshBridgePrompt();
      updateVoicePreview();
    }
    if (tab === 'board') {
      refreshPreview(true);
    }
    if (tab === 'guide' && !state.guideBuilt) {
      state.guideBuilt = true;
      buildGuide();
      applyDesignReference();
    }
    try {
      if (history && history.replaceState) history.replaceState(null, '', '#' + tab);
    } catch (e) { /* noop */ }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── 이벤트 연결 ──────────────────────────────────────── */
  function bind() {
    $$('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () { go(tab.getAttribute('data-tab')); });
    });
    $$('[data-goto]').forEach(function (el) {
      el.addEventListener('click', function () { go(el.getAttribute('data-goto')); });
    });
    $$('[data-tab-link]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        go(el.getAttribute('data-tab-link'));
      });
    });

    $('#btn-theme').addEventListener('click', function () {
      var now = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(now);
    });

    $('#btn-pro-badge').addEventListener('click', openModal);
    $('#btn-modal-close').addEventListener('click', closeModal);
    $('#btn-free-continue').addEventListener('click', closeModal);
    $('#btn-modal-connect').addEventListener('click', function () { connectPro('modal'); });
    $('#pro-modal').addEventListener('click', function (e) {
      if (e.target === $('#pro-modal')) closeModal();
    });

    $('#btn-build').addEventListener('click', function (e) { e.preventDefault(); buildStoryboard(); });
    $('#board-form').addEventListener('submit', function (e) { e.preventDefault(); buildStoryboard(); });
    $('#btn-rebuild').addEventListener('click', function () {
      buildStoryboard();
      refreshPreview(false);
    });
    $('#btn-to-studio').addEventListener('click', function () { go('studio'); });
    $('#btn-studio-cta').addEventListener('click', function () { go('studio'); });
    $('#btn-free-studio').addEventListener('click', function () { go('studio'); });

    $('#btn-random-topic').addEventListener('click', function () {
      state.sampleIndex = (state.sampleIndex + 1) % D.SAMPLES.length;
      loadSample(D.SAMPLES[state.sampleIndex], true);
    });
    $('#btn-clear-script').addEventListener('click', function () {
      $('#f-script').value = '';
      updateScriptCount();
      queueSave();
      toast('대본을 비웠습니다. 주제로 다시 만들 수 있습니다.');
    });
    $('#f-script').addEventListener('input', updateScriptCount);

    $('#f-topic').addEventListener('input', function () {
      state.project.topic = $('#f-topic').value.trim();
      updateStats();
      refreshBridgePrompt();
      queueSave();
    });
    $('#f-platform').addEventListener('change', function () {
      state.project.platform = $('#f-platform').value;
      updateStats();
      refreshBridgePrompt();
      queueSave();
    });
    $('#f-transition').addEventListener('change', function () {
      state.project.transition = $('#f-transition').value;
      $('#x-transition').value = state.project.transition;
      refreshPreview(true);
      queueSave();
    });
    $('#f-music').addEventListener('change', function () {
      state.project.music = $('#f-music').value;
      $('#x-music').value = state.project.music;
      updateStudioFacts();
      queueSave();
    });
    $('#f-handle').addEventListener('input', function () {
      state.project.handle = $('#f-handle').value.trim();
      $('#x-handle').value = state.project.handle;
      refreshPreview(true);
      queueSave();
    });
    $('#f-progress').addEventListener('change', function () {
      state.project.showProgress = $('#f-progress').checked;
      $('#x-progress').checked = state.project.showProgress;
      refreshPreview(true);
      queueSave();
    });
    $('#f-caption').addEventListener('change', function () {
      state.project.showCaption = $('#f-caption').checked;
      $('#x-caption').checked = state.project.showCaption;
      refreshPreview(true);
      queueSave();
    });

    // 스토리보드 편집(위임)
    $('#cut-list').addEventListener('input', function (e) {
      var el = e.target;
      var idx = Number(el.getAttribute('data-index'));
      if (isNaN(idx)) return;
      var cut = state.project.cuts[idx];
      if (!cut) return;
      if (el.getAttribute('data-field') === 'headline') {
        cut.headline = el.value;
        autoGrow(el);
        state.project.subtitles = [];
      } else if (el.getAttribute('data-field') === 'sub') {
        cut.sub = el.value;
        state.project.subtitles = [];
      } else if (el.classList.contains('cut-duration')) {
        cut.duration = Number(el.value);
        var card = el.closest('.cut-card');
        if (card) {
          var dur = card.querySelector('[data-role="dur"]');
          if (dur) dur.textContent = cut.duration.toFixed(1) + 's';
          var sec = card.querySelector('[data-role="sec"]');
          if (sec) sec.textContent = cut.duration.toFixed(1) + 's';
        }
      } else {
        return;
      }
      updateStats();
      if (state.buildTimer) clearTimeout(state.buildTimer);
      state.buildTimer = setTimeout(function () {
        refreshPreview(true);
        refreshBridgePrompt();
        updateVoicePreview();
      }, 180);
      queueSave();
    });

    $('#cut-list').addEventListener('change', function (e) {
      var el = e.target;
      if (el.classList.contains('cut-file')) {
        var idx = Number(el.getAttribute('data-index'));
        attachImage(idx, el.files && el.files[0]);
        el.value = '';
      }
    });

    $('#cut-list').addEventListener('click', function (e) {
      var t = e.target;
      var regen = t.closest('[data-regen]');
      if (regen) { regenCut(Number(regen.getAttribute('data-regen'))); return; }
      var ai = t.closest('[data-ai-image]');
      if (ai) {
        var i = Number(ai.getAttribute('data-ai-image'));
        go('pro');
        $('#ai-image-cut').value = String(i);
        updateImagePromptPreview();
        if (!P.hasAccess(state.pro)) {
          setStatus('#ai-image-status', 'Pro 연결이 필요합니다. 아래 브리지로도 대본을 받을 수 있습니다.', 'error');
          openModal();
        } else {
          $('#btn-ai-image').focus();
        }
        return;
      }
      var clear = t.closest('[data-clear-img]');
      if (clear) {
        var ci = Number(clear.getAttribute('data-clear-img'));
        var cut = state.project.cuts[ci];
        if (cut) {
          cut.image = null;
          cut.imageName = '';
          cut.aiImage = false;
          delete state.images[cut.id];
          renderStoryboard();
          refreshPreview(true);
          queueSave();
          toast((ci + 1) + '번 컷 이미지를 뺐습니다');
        }
      }
    });

    // 스튜디오
    $('#btn-play').addEventListener('click', togglePlay);
    $('#btn-play-big').addEventListener('click', togglePlay);
    $('#btn-restart').addEventListener('click', function () {
      if (!state.preview) return;
      state.preview.pause();
      stopPreviewAudio();
      state.preview.seek(0);
      $('#btn-play').textContent = '▶ 재생';
      $('#btn-play-big').setAttribute('data-playing', 'false');
    });
    $('#f-loop').addEventListener('change', function () {
      if (state.preview) state.preview.loop = $('#f-loop').checked;
    });
    $('#f-preview-sound').addEventListener('change', function () {
      if (!state.preview || !state.preview.playing) return;
      if ($('#f-preview-sound').checked) {
        state.preview.pause();
        state.preview.seek(0);
        togglePlay();
      } else {
        stopPreviewAudio();
      }
    });
    $('#f-safe').addEventListener('change', function () {
      $('#safe-overlay').hidden = !$('#f-safe').checked;
    });

    $('#x-resolution').addEventListener('change', function () {
      state.project.resolution = $('#x-resolution').value;
      updateStudioFacts();
      queueSave();
    });
    $('#x-fps').addEventListener('change', function () {
      state.project.fps = Number($('#x-fps').value) === 24 ? 24 : 30;
      queueSave();
    });
    $('#x-music').addEventListener('change', function () {
      state.project.music = $('#x-music').value;
      $('#f-music').value = state.project.music;
      updateStudioFacts();
      queueSave();
    });
    $('#x-transition').addEventListener('change', function () {
      state.project.transition = $('#x-transition').value;
      $('#f-transition').value = state.project.transition;
      refreshPreview(true);
      queueSave();
    });
    $('#x-progress').addEventListener('change', function () {
      state.project.showProgress = $('#x-progress').checked;
      $('#f-progress').checked = state.project.showProgress;
      refreshPreview(true);
      queueSave();
    });
    $('#x-caption').addEventListener('change', function () {
      state.project.showCaption = $('#x-caption').checked;
      $('#f-caption').checked = state.project.showCaption;
      queueSave();
    });
    $('#x-handle').addEventListener('input', function () {
      state.project.handle = $('#x-handle').value.trim();
      $('#f-handle').value = state.project.handle;
      refreshPreview(true);
      queueSave();
    });

    $('#btn-export').addEventListener('click', doExport);
    $('#btn-srt').addEventListener('click', function () {
      downloadText(srtText(), baseName() + '-9x16.srt', 'application/x-subrip');
      toast('자막 .srt를 저장했습니다');
    });
    $('#btn-vtt').addEventListener('click', function () {
      downloadText(vttText(), baseName() + '-9x16.vtt', 'text/vtt');
      toast('자막 .vtt를 저장했습니다');
    });
    $('#btn-txt').addEventListener('click', function () {
      var txt = activeCuts().map(function (c, i) {
        return '[' + (i + 1) + '컷 · ' + C.stageById(c.stage).label + ' · ' + c.duration.toFixed(1) + '초]\n' +
          '제목: ' + c.headline + '\n' +
          (c.sub ? '보조: ' + c.sub + '\n' : '') +
          (c.direction ? '연출: ' + c.direction + '\n' : '');
      }).join('\n');
      downloadText((state.project.topic || '숏폼') + ' 대본\n\n' + txt, baseName() + '-script.txt');
      toast('대본 .txt를 저장했습니다');
    });
    $('#btn-caption').addEventListener('click', function () {
      var text = C.buildCaption(state.project);
      copyText(text).then(function () { toast('캡션을 복사했습니다'); }).catch(function () { toast('복사하지 못했습니다. 직접 선택해 주세요.', 'error'); });
    });
    $('#btn-png').addEventListener('click', exportPngs);
    $('#btn-poster').addEventListener('click', function () {
      if (!activeCuts().length) return;
      var tl = C.timeline(activeCuts());
      R.stillFrame({
        cuts: activeCuts(), project: state.project, ms: tl[0].start + tl[0].duration * 0.5,
        images: state.images, width: 1080, height: 1920
      }).then(function (blob) {
        downloadBlob(blob, baseName() + '-poster.png');
        toast('썸네일 PNG를 저장했습니다');
      }).catch(function () { toast('썸네일을 만들지 못했습니다.', 'error'); });
    });

    // Pro
    $('#btn-connect').addEventListener('click', function () { connectPro('main'); });
    $('#btn-disconnect').addEventListener('click', disconnectPro);
    $('#btn-ai-script').addEventListener('click', aiScript);
    $('#btn-ai-apply').addEventListener('click', applyAiDraft);
    $('#btn-ai-image').addEventListener('click', aiImage);
    $('#btn-ai-image-apply').addEventListener('click', applyAiImage);
    $('#btn-ai-voice').addEventListener('click', aiVoice);
    $('#ai-image-cut').addEventListener('change', updateImagePromptPreview);
    $('#f-use-voice').addEventListener('change', function () {
      state.useVoice = $('#f-use-voice').checked;
    });
    $('#btn-bridge-copy').addEventListener('click', function () {
      copyText($('#bridge-prompt').value).then(function () { toast('프롬프트를 복사했습니다'); }).catch(function () { toast('복사하지 못했습니다.', 'error'); });
    });
    $$('[data-open-ai]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var urls = { chatgpt: 'https://chatgpt.com/', claude: 'https://claude.ai/new', gemini: 'https://gemini.google.com/app' };
        var url = urls[btn.getAttribute('data-open-ai')];
        if (url) window.open(url, '_blank', 'noopener');
      });
    });
    $('#btn-ai-import').addEventListener('click', importFromPaste);

    // 붙여넣기로 이미지 넣기 (마지막으로 만진 컷)
    $('#cut-list').addEventListener('focusin', function (e) {
      var card = e.target.closest('.cut-card');
      if (card) state.activeCut = Number(card.getAttribute('data-cut-index'));
    });
    document.addEventListener('paste', function (e) {
      if (!$('#view-board') || $('#view-board').hidden) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') === 0) {
          var file = items[i].getAsFile();
          if (file) {
            attachImage(state.activeCut || 0, file);
            e.preventDefault();
          }
          return;
        }
      }
    });

    window.addEventListener('resize', function () {
      if (state.preview) state.preview.render();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('#pro-modal').open) closeModal();
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  function exportPngs() {
    var cuts = activeCuts();
    if (!cuts.length) return;
    var tl = C.timeline(cuts);
    var btn = $('#btn-png');
    btn.disabled = true;
    var seq = Promise.resolve();
    cuts.forEach(function (cut, i) {
      seq = seq.then(function () {
        return R.stillFrame({
          cuts: cuts, project: state.project,
          ms: tl[i].start + tl[i].duration * 0.55,
          images: state.images, width: 1080, height: 1920
        }).then(function (blob) {
          downloadBlob(blob, baseName() + '-cut' + (i + 1) + '.png');
          return new Promise(function (r) { setTimeout(r, 260); });
        });
      });
    });
    seq.then(function () {
      toast('컷 PNG 5장을 저장했습니다');
    }).catch(function () {
      toast('PNG를 만들지 못했습니다. 잠시 뒤 다시 시도하세요.', 'error');
    }).then(function () { btn.disabled = false; });
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function loadSaved() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_PROJECT); } catch (e) { raw = null; }
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.cuts)) return null;
      var p = C.serializeProject(data);
      if (!p.cuts.length) return null;
      return p;
    } catch (e) { return null; }
  }

  function loadScriptTextFromCut(cuts) {
    return cuts.map(function (c) {
      return [C.stripMarks(c.headline), C.stripMarks(c.sub)].filter(Boolean).join(' ');
    }).join('\n');
  }

  function init() {
    var theme = 'dark';
    try { theme = localStorage.getItem(STORE_THEME) || 'dark'; } catch (e) { theme = 'dark'; }
    applyTheme(theme);

    buildSelects();
    buildToneCards();
    buildThemeCards();
    buildSamples();
    applyDesignReference();
    bind();
    initPreview();

    var saved = loadSaved();
    if (saved) {
      state.project = saved;
      $('#f-script').value = loadScriptTextFromCut(saved.cuts);
      state.sampleIndex = 0;
    } else {
      loadSample(D.SAMPLES[0], false);
      state.project.cuts = [];
      buildStoryboard(true);
    }
    if (!$('#f-script').value) {
      $('#f-script').value = loadScriptTextFromCut(state.project.cuts);
    }
    updateScriptCount();
    syncFormFromProject();
    renderStoryboard();
    refreshPreview(false);
    updateAiCutSelect();
    refreshBridgePrompt();
    updateVoicePreview();
    $('#f-use-voice').checked = false;
    $('#voice-list').hidden = true;
    refreshProState();

    var hash = (location.hash || '').replace('#', '');
    if (hash && ['board', 'studio', 'pro', 'guide'].indexOf(hash) >= 0) go(hash);

    R.loadFonts().then(function () {
      state.fontsReady = true;
      refreshPreview(true);
    });

    // 첫 방문 안내
    if (!saved) {
      setTimeout(function () {
        toast('예시 대본으로 5컷을 만들어 두었습니다. 그대로 눌러 영상을 확인해 보세요.');
      }, 900);
    }

    window.addEventListener('beforeunload', function (e) {
      if (state.recording) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /* ── NLE 워크스페이스 연결 ────────────────── */
  var nleReady = false;

  /** 스튜디오 탭을 처음 열 때만 NLE를 조립한다(첫 화면 로딩을 가볍게). */
  function ensureNLE() {
    if (nleReady) return;
    nleReady = true;
    initNLE();
  }

  function initNLE() {
    if (!window.ShortsNLE) return;
    window.ShortsNLE.init({
      state: state,
      toast: toast,
      saveSoon: queueSave,
      seek: function (ms) {
        if (!state.preview) return;
        state.preview.pause();
        stopPreviewAudio();
        $('#btn-play').textContent = '▶ 재생';
        $('#btn-play-big').setAttribute('data-playing', 'false');
        state.preview.seek(ms);
      },
      playFrom: function (ms) {
        if (!state.preview) return;
        state.preview.pause();
        state.preview.seek(ms);
        togglePlay();
      },
      onGrade: function (commit) {
        refreshPreview(true);
        updateStudioFacts();
        if (commit) queueSave();
      },
      onClipEdit: function () {
        renderStoryboard();
        refreshPreview(true);
        updateStats();
        updateVoicePreview();
        queueSave();
      },
      onSwarmChange: function (action) {
        renderStoryboard();
        refreshPreview(action !== 'split');
        updateStats();
        updateStudioFacts();
        updateVoicePreview();
        queueSave();
      }
    });
  }

  // 바깥에서 검증할 수 있는 최소 핸들 (테스트·디버그용)
  window.ShortsApp = {
    state: state,
    go: go,
    build: buildStoryboard,
    exportVideo: doExport,
    loadSample: loadSample,
    nle: function () { ensureNLE(); return window.ShortsNLE; },
    version: C.VERSION
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
