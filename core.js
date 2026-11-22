/* ============================================================
   원탭 숏폼 스튜디오 · core.js  v2.0.0
   ------------------------------------------------------------
   의존성 없는 순수 로직(UMD). 브라우저는 window.ShortsCore,
   node 는 require('./core.js').

   Canvas·MediaRecorder 없이도 검증할 수 있도록
   · 5컷 스토리보드 분배 (훅-문제-해결-증거-CTA)
   · 시간축 계산 · SRT 자막 생성
   · 테마 6종 정의 · AI 결과 파싱 · AI 티 점검
   를 여기에 모았다. 그리기와 녹화는 render.js 담당.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShortsCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '2.0.0';
  var CANVAS = { w: 1080, h: 1920 };

  /* ==========================================================
     1. 기본값 · 테마 · 5컷 구조
     ========================================================== */

  var THEMES = [
    {
      id: 'editorial', name: '크림 에디토리얼', nameEn: 'CREAM EDITORIAL',
      tagline: '종이 질감 · 잉크 라인 · 테라코타 포인트',
      bg: '#F3EADD', bg2: '#E4D3BC', surface: '#FFFCF6', ink: '#33281E',
      sub: '#6A5B4A', accent: '#A8431F', accentInk: '#FFF8F0', line: '#D8C5AB',
      deco: 'paper', cap: 'soft', weight: 700, align: 'left', radius: 4, vignette: 0.10
    },
    {
      id: 'midnight', name: '미드나잇 시네마', nameEn: 'MIDNIGHT CINEMA',
      tagline: '레터박스 · 따뜻한 앰버 · 필름 그레인',
      bg: '#151110', bg2: '#2A2018', surface: '#211A15', ink: '#F7EDDE',
      sub: '#C3AE96', accent: '#E8A24A', accentInk: '#1A1310', line: '#4A3B2C',
      deco: 'cinema', cap: 'bar', weight: 700, align: 'left', radius: 2, vignette: 0.55
    },
    {
      id: 'neon', name: '네온 스튜디오', nameEn: 'NEON STUDIO',
      tagline: '블랙 캔버스 · 라임 글로우 · 그리드',
      bg: '#0A0A0F', bg2: '#171226', surface: '#111018', ink: '#F5F4FA',
      sub: '#A9A4C2', accent: '#C7FF3D', accentInk: '#0A0A0F', line: '#2B2740',
      deco: 'neon', cap: 'bar', weight: 800, align: 'left', radius: 8, vignette: 0.4
    },
    {
      id: 'sunset', name: '선셋 그라디언트', nameEn: 'SUNSET GRADIENT',
      tagline: '주황-자주 흐름 · 노란 포인트 · 부드러운 원',
      bg: '#B93E12', bg2: '#5E1440', surface: '#8A2450', ink: '#FFF7EE',
      sub: '#FFD9C2', accent: '#FFD166', accentInk: '#3A1420', line: '#FFB98F',
      deco: 'gradient', cap: 'chip', weight: 700, align: 'left', radius: 24, vignette: 0.22
    },
    {
      id: 'clinic', name: '클린 민트', nameEn: 'CLEAN MINT',
      tagline: '밝은 민트 · 얇은 선 · 정보형 레이아웃',
      bg: '#F1F7F4', bg2: '#DCEDE5', surface: '#FFFFFF', ink: '#13332A',
      sub: '#4C6B61', accent: '#0F8A6A', accentInk: '#FFFFFF', line: '#C7DFD5',
      deco: 'clean', cap: 'soft', weight: 700, align: 'left', radius: 6, vignette: 0.06
    },
    {
      id: 'pop', name: '볼드 옐로', nameEn: 'BOLD YELLOW',
      tagline: '노랑 바탕 · 검정 프레임 · 큰 활자',
      bg: '#FFD84D', bg2: '#F2C31B', surface: '#FFF3C4', ink: '#141414',
      sub: '#3A3427', accent: '#141414', accentInk: '#FFD84D', line: '#141414',
      deco: 'brutal', cap: 'solid', weight: 800, align: 'left', radius: 0, vignette: 0.05
    }
  ];

  var STAGES = [
    { id: 'hook', label: '훅', en: 'HOOK', goal: '3초 안에 스크롤을 멈추게', hint: '첫 문장은 짧게. 숫자나 반전으로 시작.', min: 2.4, base: 3.8 },
    { id: 'problem', label: '문제', en: 'PROBLEM', goal: '시청자가 겪는 불편을 짚기', hint: '공감되는 상황 한 가지만. 해결책은 아직 말하지 않기.', min: 2.8, base: 4.6 },
    { id: 'solution', label: '해결', en: 'SOLUTION', goal: '내 방법·제품을 한 문장으로', hint: '과정은 3단계 이내. 한 컷에 한 가지만.', min: 3.0, base: 5.2 },
    { id: 'proof', label: '증거', en: 'PROOF', goal: '숫자·후기·비교로 믿게', hint: '대괄호 수치는 실제 값으로 바꿔야 합니다.', min: 2.8, base: 5.0 },
    { id: 'cta', label: '행동', en: 'CTA', goal: '저장·팔로우·클릭 한 가지만', hint: '행동은 하나만. 두 개면 아무것도 안 합니다.', min: 2.4, base: 3.6 }
  ];

  var TONES = [
    { id: 'friendly', name: '친근한 반말', desc: '친구에게 말하듯 · 저장·공유 잘 되는 톤', sample: '이거 모르고 시작하면 손해임' },
    { id: 'calm', name: '차분한 존댓말', desc: '정보·교육·브랜드 계정', sample: '3초만 확인해 보세요' },
    { id: 'expert', name: '전문가·수치형', desc: 'B2B·금융·자기계발', sample: '결론부터 말하면, 기준 하나입니다' }
  ];

  var PLATFORMS = [
    { id: 'shorts', name: '유튜브 쇼츠', ratio: '9:16', max: 60, note: '첫 3초 이탈이 가장 큼. 훅 자막을 1.2초 안에.', tag: '#Shorts' },
    { id: 'reels', name: '인스타 릴스', ratio: '9:16', max: 90, note: '자막 없는 시청이 많음. 소리 없이도 읽히게.', tag: '#Reels' },
    { id: 'tiktok', name: '틱톡', ratio: '9:16', max: 60, note: '15~34초 구간 완주율이 높음. 컷을 더 짧게.', tag: '#틱톡' },
    { id: 'threads', name: '스레드·기타', ratio: '9:16', max: 90, note: '세로 영상 그대로 업로드. 첫 프레임이 썸네일.', tag: '#스레드' }
  ];

  var CAPTION_STYLES = [
    { id: 'auto', name: '테마에 맞춤', desc: '테마별 기본 자막 처리' },
    { id: 'marker', name: '형광 마커', desc: '핵심 단어에 색이 칠해짐' },
    { id: 'box', name: '검정 박스', desc: '숏폼 기본형 · 어떤 배경에서도 읽힘' }
  ];

  var LIMITS = { headline: 40, sub: 62, direction: 90, handle: 24, topic: 80, cuts: 5 };
  var DURATIONS = { min: 0.8, max: 15, default: 4.2 };

  /* ==========================================================
     2. 문자열 유틸
     ========================================================== */

  function str(v, fallback) {
    if (v === null || v === undefined) return fallback === undefined ? '' : fallback;
    return String(v);
  }
  function clamp(n, lo, hi) {
    n = Number(n);
    if (!isFinite(n)) n = lo;
    return Math.min(hi, Math.max(lo, n));
  }
  function round(n, d) { var p = Math.pow(10, d || 0); return Math.round(n * p) / p; }
  function hash(s) {
    var h = 2166136261, t = str(s);
    for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function pick(arr, seed) { return arr[hash(seed) % arr.length]; }
  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) { var k = str(v); if (!k || seen[k]) return; seen[k] = 1; out.push(k); });
    return out;
  }
  function stripTags(s) {
    return str(s).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
  }
  /** 화면에 그대로 그릴 수 있는 한 줄 텍스트로 정리한다. */
  function clean(s, max) {
    var t = stripTags(s).replace(/\s+/g, ' ').trim();
    if (max && t.length > max) t = t.slice(0, max - 1).replace(/[\s,;:·-]+$/, '') + '…';
    return t;
  }
  /** 마크다운 강조(**단어**)만 남기고 나머지 기호를 정리. */
  function stripMarks(s) { return str(s).replace(/\*\*/g, ''); }
  /** 마크다운 목록·번호·라벨을 걷어낸다. */
  function stripBullet(s) {
    return str(s)
      .replace(/^\s*(?:[-•*·▪◦]|\d{1,2}[).\]]|\[?\d{1,2}\s*컷\]?|#{1,6})\s*/, '')
      .replace(/^\s*(?:훅|문제|해결|증거|행동|CTA|hook|problem|solution|proof|cta|제목|자막|대사|내용|headline|sub)\s*[:：\-]\s*/i, '')
      .trim();
  }

  /** 화면 폭에 맞춰 줄바꿈(문자 수 기준, SRT·미리보기 공용). */
  function wrapText(text, maxChars) {
    var t = str(text).replace(/\s+/g, ' ').trim();
    var limit = Math.max(4, Number(maxChars) || 18);
    if (!t) return [];
    var words = t.split(' ');
    var lines = [], line = '';
    function pushLong(word) {
      var rest = word;
      while (rest.length > limit) {
        lines.push(rest.slice(0, limit));
        rest = rest.slice(limit);
      }
      return rest;
    }
    words.forEach(function (w) {
      if (!line) {
        if (w.length > limit) line = pushLong(w);
        else line = w;
        return;
      }
      if ((line + ' ' + w).length <= limit) line += ' ' + w;
      else { lines.push(line); line = w.length > limit ? pushLong(w) : w; }
    });
    if (line) lines.push(line);
    return lines.length ? lines : [t];
  }

  /** 시간(ms) → SRT 표기 00:00:03,400 */
  function formatTimecode(ms) {
    var total = Math.max(0, Math.round(Number(ms) || 0));
    var h = Math.floor(total / 3600000);
    var m = Math.floor(total % 3600000 / 60000);
    var s = Math.floor(total % 60000 / 1000);
    var r = total % 1000;
    function p2(n) { return n < 10 ? '0' + n : String(n); }
    function p3(n) { return n < 10 ? '00' + n : (n < 100 ? '0' + n : String(n)); }
    return p2(h) + ':' + p2(m) + ':' + p2(s) + ',' + p3(r);
  }
  /** 시간(ms) → 0:04 (사람이 읽는 표기) */
  function formatClock(ms) {
    var total = Math.max(0, Math.round(Number(ms) || 0));
    var m = Math.floor(total / 60000);
    var s = Math.floor(total % 60000 / 1000);
    return m + ':' + (s < 10 ? '0' + s : String(s));
  }

  /* ==========================================================
     3. 스토리보드 생성
     ========================================================== */

  var BANKS = {
    friendly: {
      hook: [
        { h: '{topic}, 아직 이렇게 하고 있음?', s: '3초만 보면 왜 그런지 바로 이해됨', d: '얼굴 클로즈업 또는 손동작. 첫 프레임에 큰 글씨.' },
        { h: '{topic} 하다가 시간 다 날린 이유', s: '대부분 첫 단계에서 갈림', d: '실패한 화면을 먼저 보여주고 시작.' },
        { h: '이거 모르고 {topic} 시작하면 손해임', s: '오늘 딱 하나만 가져가셈', d: '손가락으로 하나를 짚는 동작.' },
        { h: '{topic}, 3일 만에 달라진 사람들의 공통점', s: '비결은 도구가 아니라 순서였음', d: '전후 화면을 나란히 두고 시작.' }
      ],
      problem: [
        { h: '문제는 의지가 아님', s: '{topic}에서 뭐부터 해야 할지 모르는 것', d: '책상 앞에서 멍하니 있는 장면.' },
        { h: '정보는 넘치는데 내 상황에 맞는 게 없음', s: '그래서 매번 처음부터 다시 찾게 됨', d: '탭 수십 개 열린 화면.' },
        { h: '시작은 하는데 3일을 못 넘김', s: '{topic}은 습관보다 장치가 먼저임', d: '달력에 X 표시가 끊기는 장면.' }
      ],
      solution: [
        { h: '그래서 순서를 3개로 줄임', s: '① 오늘 할 것 ② 이번 주 ③ 다음 달', d: '손으로 1·2·3을 세며 말하기.' },
        { h: '방법은 단순함. 한 번에 하나만', s: '{topic}에 필요한 것만 남기고 다 뺐음', d: '물건을 치우는 컷으로 설명.' },
        { h: '내가 쓰는 건 이 한 가지', s: '매일 10분, 손이 먼저 움직이게', d: '실제 사용 장면을 클로즈업.' }
      ],
      proof: [
        { h: '직접 해보고 바뀐 건 이 부분', s: '[숫자]에서 [숫자]까지 [기간] 걸림', d: '수치는 실제 값으로 바꿀 것.' },
        { h: '댓글로 온 질문이 다 비슷했음', s: '결국 같은 지점에서 막힌다는 뜻', d: '댓글 캡처는 아이디를 가리고.' },
        { h: '3번 해보고 남은 것만 정리함', s: '안 되는 건 과감히 버림', d: '체크리스트 화면을 보여주기.' }
      ],
      cta: [
        { h: '저장해두고 하나씩 해보셈', s: '다음에 볼 때 순서대로 하면 됨', d: '저장 버튼을 가리키는 손.' },
        { h: '더 궁금하면 팔로우', s: '다음 편은 실제 후기로 이어감', d: '프로필 화면 1초 노출.' },
        { h: '오늘 딱 하나만 해보기', s: '댓글에 뭘 했는지 남겨주셈', d: '댓글 입력창 비추는 컷.' }
      ]
    },
    calm: {
      hook: [
        { h: '{topic}, 3초만 확인해 보세요', s: '대부분 이 부분을 놓치고 시작합니다', d: '차분한 배경음. 첫 자막은 1.2초 유지.' },
        { h: '{topic}에서 시간을 잃는 이유', s: '순서를 모르고 시작하기 때문입니다', d: '정리되지 않은 화면에서 시작.' },
        { h: '이 영상 하나로 {topic}을 정리합니다', s: '필요한 것만 남겨 두었습니다', d: '목차를 먼저 보여주기.' }
      ],
      problem: [
        { h: '정보는 많은데 적용이 안 됩니다', s: '내 상황에 맞는 기준이 없기 때문입니다', d: '검색 결과 화면을 천천히 비추기.' },
        { h: '시작보다 오래 가는 게 어렵습니다', s: '의지가 아니라 환경의 문제입니다', d: '환경을 바꾸는 장면.' }
      ],
      solution: [
        { h: '기준을 세 가지로 줄였습니다', s: '오늘·이번 주·다음 달로 나눕니다', d: '세 칸으로 나뉜 화면.' },
        { h: '매일 10분이면 됩니다', s: '한 번에 하나씩만 진행하세요', d: '타이머 10분을 보여주기.' }
      ],
      proof: [
        { h: '직접 적용해 본 결과입니다', s: '[숫자]에서 [숫자]까지 [기간] 걸렸습니다', d: '수치는 실제 값으로 바꿀 것.' },
        { h: '같은 질문이 반복되었습니다', s: '막히는 지점이 같다는 뜻입니다', d: '질문 목록을 정리해 보여주기.' }
      ],
      cta: [
        { h: '필요할 때 다시 보세요', s: '저장해 두시면 순서대로 따라 하실 수 있습니다', d: '저장 아이콘 강조.' },
        { h: '다음 편에서 이어집니다', s: '팔로우하시면 놓치지 않습니다', d: '다음 편 예고 1컷.' }
      ]
    },
    expert: {
      hook: [
        { h: '{topic}, 숫자로만 말하면', s: '[기준] 하나로 결과가 갈립니다', d: '첫 프레임에 수치 한 개. 실제 값으로.' },
        { h: '결론부터 말하면 {topic}은 순서입니다', s: '도구는 그다음 문제입니다', d: '칠판·노트에 3단계를 미리 적어두기.' },
        { h: '{topic} 실패 원인의 80%는 같은 곳', s: '진단 없이 도구부터 고르기 때문입니다', d: '실패 사례를 도표로.' }
      ],
      problem: [
        { h: '측정하지 않으면 개선도 없습니다', s: '지금 상태를 모른 채 시작하는 경우가 대부분', d: '측정 전후를 나란히.' },
        { h: '도구를 바꿔도 결과가 같다면', s: '문제는 도구가 아니라 절차입니다', d: '같은 결과가 반복되는 그래프.' }
      ],
      solution: [
        { h: '3단계로 고정했습니다', s: '진단 → 적용 → 측정, 이 순서만 지킵니다', d: '각 단계에 소요 시간 표기.' },
        { h: '기준은 두 개면 충분합니다', s: '비용과 시간, 이 두 축으로만 판단', d: '2축 표를 보여주기.' }
      ],
      proof: [
        { h: '동일 조건에서 차이를 확인했습니다', s: '[수치] 대비 [수치], [기간] 기준', d: '실제 측정값으로 교체할 것.' },
        { h: '재현성이 핵심입니다', s: '같은 조건에서 같은 결과가 나와야 합니다', d: '조건을 자막으로 명시.' }
      ],
      cta: [
        { h: '체크리스트로 저장해 두세요', s: '다음 판단 때 그대로 쓰시면 됩니다', d: '체크리스트 3줄 노출.' },
        { h: '사례가 더 필요하면 팔로우', s: '다음 편은 실제 적용 사례입니다', d: '사례 번호를 자막으로.' }
      ]
    }
  };

  var DIRECTIONS = {
    hook: '첫 0.8초에 결론 또는 숫자를 보여주세요. 인사말로 시작하지 않습니다.',
    problem: '공감되는 상황 한 장면만. 해결책은 다음 컷으로 넘깁니다.',
    solution: '행동을 하나로 좁혀 말하세요. 과정은 3단계를 넘기지 않습니다.',
    proof: '대괄호 수치는 실제 값으로 바꿔야 신뢰가 생깁니다.',
    cta: '행동은 하나만. 저장·팔로우·클릭 중 하나를 고르세요.'
  };

  function fill(tpl, ctx) {
    return str(tpl).replace(/\{topic\}/g, ctx.topic).replace(/\{product\}/g, ctx.product || ctx.topic);
  }

  function stageById(id) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].id === id) return STAGES[i];
    return STAGES[0];
  }
  function themeById(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return THEMES[0];
  }
  function toneById(id) {
    for (var i = 0; i < TONES.length; i++) if (TONES[i].id === id) return TONES[i];
    return TONES[0];
  }
  function platformById(id) {
    for (var i = 0; i < PLATFORMS.length; i++) if (PLATFORMS[i].id === id) return PLATFORMS[i];
    return PLATFORMS[0];
  }

  /** 붙여넣은 대본을 문장·줄 단위로 나눈다. */
  function splitScript(text) {
    var t = str(text).replace(/\r/g, '').trim();
    if (!t) return [];
    var blocks = t.split(/\n+/).map(function (b) { return stripBullet(b); }).filter(Boolean);
    if (blocks.length < 5) {
      var out = [];
      blocks.forEach(function (b) {
        var parts = b.replace(/([.!?。！？])\s+/g, '$1\n').split('\n');
        parts.forEach(function (p) { p = stripBullet(p); if (p) out.push(p); });
      });
      blocks = out;
    }
    return blocks
      .map(function (b) { return stripBullet(b).replace(/\s+/g, ' ').trim(); })
      .filter(function (b) { return b.length > 1; })
      .slice(0, 12);
  }

  /** 글 길이로 읽는 시간을 어림한다(한국어 숏폼 기준 초당 약 6자). */
  function estimateDuration(text) {
    var chars = stripMarks(str(text)).replace(/\s/g, '').length;
    if (!chars) return 2.4;
    return round(clamp(chars / 6 + 0.8, 1.2, 9.5), 1);
  }

  function makeCut(stage, data, index) {
    var s = stageById(stage);
    var headline = clean(data.headline, LIMITS.headline);
    var sub = clean(data.sub, LIMITS.sub);
    var duration = data.duration !== undefined
      ? round(clamp(data.duration, DURATIONS.min, DURATIONS.max), 1)
      : round(clamp(Math.max(s.min, estimateDuration(headline + ' ' + sub)), 1.4, 9.5), 1);
    return {
      id: 'cut-' + (index + 1),
      stage: s.id,
      label: s.label,
      goal: s.goal,
      headline: headline || s.label + ' 문장을 입력하세요',
      sub: sub,
      direction: clean(data.direction || DIRECTIONS[s.id], LIMITS.direction),
      duration: duration,
      highlight: data.highlight ? data.highlight.slice(0, 3) : findHighlights(headline, 2),
      image: typeof data.image === 'string' ? data.image : null,
      imageName: clean(data.imageName || '', 60),
      aiImage: !!data.aiImage,
      voice: null
    };
  }

  function emptyProject() {
    return {
      topic: '',
      tone: 'friendly',
      theme: 'editorial',
      platform: 'shorts',
      captionStyle: 'auto',
      transition: 'fade',
      handle: '',
      showProgress: true,
      showCaption: true,
      music: 'lofi',
      resolution: '1080',
      fps: 30,
      grade: { id: 'neutral', exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 },
      splits: {},
      subtitles: [],
      cuts: []
    };
  }

  /**
   * 주제 또는 대본 → 5컷 스토리보드.
   * @param {object} input {topic, script, tone, theme, ...}
   * @returns {{cuts: Array, topic: string, source: string, filled: number}}
   */
  function distributeCuts(input) {
    input = input || {};
    var project = typeof input === 'object' ? input : { topic: str(input) };
    var topic = clean(project.topic || '', LIMITS.topic);
    var segments = splitScript(project.script || '');
    if (!topic && segments.length) topic = clean(segments[0].replace(/[.!?。]$/, ''), 34);
    if (!topic) topic = '오늘의 주제';
    var tone = toneById(project.tone || 'friendly').id;
    var bank = BANKS[tone] || BANKS.friendly;
    var seedBase = topic + '|' + tone + '|' + (project.variant || 0);
    var filled = 0;

    var cuts = STAGES.map(function (stage, i) {
      var source = segments[i];
      if (source) {
        var head = clean(source, LIMITS.headline);
        var rest = clean(source.slice(head.length).replace(/^[\s,.:;-]+/, ''), LIMITS.sub);
        var words = head.split(' ');
        if (!rest && head.length > 30 && words.length > 5) {
          head = clean(words.slice(0, 5).join(' '), 26);
          rest = clean(words.slice(5).join(' '), LIMITS.sub);
        }
        return makeCut(stage.id, { headline: head, sub: rest, direction: DIRECTIONS[stage.id] }, i);
      }
      filled++;
      var pool = bank[stage.id] || BANKS.friendly[stage.id];
      var item = pool[hash(seedBase + '|' + stage.id + '|' + (project.variant || 0)) % pool.length];
      return makeCut(stage.id, {
        headline: fill(item.h, { topic: topic, product: project.product }),
        sub: fill(item.s, { topic: topic, product: project.product }),
        direction: fill(item.d, { topic: topic })
      }, i);
    });

    if (project.script && segments.length >= 5) filled = 0;
    return { cuts: cuts, topic: topic, source: segments.length ? 'script' : 'topic', filled: filled };
  }

  /** 컷 하나를 새 표현으로 바꾼다(같은 단계, 다른 문장). */
  function regenerateCut(cuts, index, opts) {
    opts = opts || {};
    var list = normalizeCuts(cuts);
    var cut = list[index];
    if (!cut) return list;
    var tone = toneById(opts.tone || 'friendly').id;
    var pool = (BANKS[tone] || BANKS.friendly)[cut.stage] || [];
    var topic = clean(opts.topic || '이 주제', 34);
    var previous = cut.headline;
    for (var attempt = 0; attempt < pool.length; attempt++) {
      var item = pool[(hash(previous + '|' + cut.stage) + attempt) % pool.length];
      var head = fill(item.h, { topic: topic });
      if (head !== previous || pool.length === 1) {
        cut.headline = clean(head, LIMITS.headline);
        cut.sub = clean(fill(item.s, { topic: topic }), LIMITS.sub);
        cut.direction = clean(fill(item.d, { topic: topic }), LIMITS.direction);
        break;
      }
    }
    list[index] = makeCut(cut.stage, cut, index);
    return list;
  }

  /** 어떤 형태의 컷 배열이든 5컷·정해진 단계로 맞춘다. */
  function normalizeCuts(raw) {
    var arr = Array.isArray(raw) ? raw : [];
    var out = [];
    for (var i = 0; i < STAGES.length; i++) {
      var stage = STAGES[i];
      var found = arr[i] || null;
      if (!found) {
        var byStage = arr.filter(function (c) { return c && (c.stage === stage.id); })[0];
        found = byStage || {};
      }
      out.push(makeCut(stage.id, {
        headline: found.headline !== undefined ? found.headline : found.text,
        sub: found.sub,
        direction: found.direction,
        duration: found.duration,
        highlight: found.highlight,
        image: found.image || null,
        imageName: found.imageName,
        aiImage: !!found.aiImage
      }, i));
    }
    return out;
  }

  /* ==========================================================
     4. 시간축 · 자막
     ========================================================== */

  /** 컷 배열 → 시작/끝/길이(ms) */
  function timeline(cuts) {
    var t = 0;
    return (cuts || []).map(function (c, i) {
      var dur = Math.round(clamp(c.duration, DURATIONS.min, DURATIONS.max) * 1000);
      var seg = { index: i, stage: c.stage, label: c.label, start: t, end: t + dur, duration: dur };
      t += dur;
      return seg;
    });
  }

  function totalMs(cuts) {
    var tl = timeline(cuts);
    return tl.length ? tl[tl.length - 1].end : 0;
  }

  /** 컷 배열 → SRT 문자열 */
  function buildSrt(cuts, opts) {
    opts = opts || {};
    var tl = timeline(cuts);
    var lines = [];
    (cuts || []).forEach(function (cut, i) {
      var seg = tl[i];
      var chars = opts.maxChars || 17;
      var textLines = [];
      if (opts.includeLabel) textLines.push('[' + cut.label + ']');
      wrapText(stripMarks(cut.headline), chars).forEach(function (l) { textLines.push(l); });
      if (cut.sub) wrapText(stripMarks(cut.sub), chars).forEach(function (l) { textLines.push(l); });
      lines.push(String(i + 1));
      lines.push(formatTimecode(seg.start) + ' --> ' + formatTimecode(seg.end));
      lines.push(textLines.join('\n'));
      lines.push('');
    });
    return lines.join('\n');
  }

  /** 같은 자막을 WebVTT로 (보너스 내보내기). */
  function buildVtt(cuts) {
    var srt = buildSrt(cuts);
    return 'WEBVTT\n\n' + srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  }

  /** T1 자막 트랙 → SRT. 편집한 자막 줄을 그대로 내보낸다. */
  function buildSrtFromSubtitles(subs) {
    var list = (Array.isArray(subs) ? subs : []).filter(function (s) {
      return s && s.text && Number(s.end) > Number(s.start);
    });
    if (!list.length) return '';
    return list.map(function (s, i) {
      return [String(i + 1), formatTimecode(s.start) + ' --> ' + formatTimecode(s.end), clean(s.text, 60), ''].join('\n');
    }).join('\n');
  }

  function buildVttFromSubtitles(subs) {
    var srt = buildSrtFromSubtitles(subs);
    return srt ? 'WEBVTT\n\n' + srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2') : '';
  }

  /** 전체 내레이션 텍스트(성우 TTS용) */
  function narrationText(cut) {
    return [stripMarks(cut.headline), stripMarks(cut.sub)].filter(Boolean).join('. ');
  }

  /* ==========================================================
     5. 강조 · AI 티 점검 · 캡션
     ========================================================== */

  var STOPWORDS = ['그리고', '하지만', '그래서', '이거', '저거', '것은', '것을', '하는', '있음', '없음', '정말', '진짜', '너무', '오늘', '이번'];

  /** 자동 강조 후보: **표시 > 숫자/% > 영문 > 짧은 핵심어 */
  function findHighlights(text, limit) {
    var t = str(text);
    var max = limit || 2;
    var found = [];
    var m, re = /\*\*([^*]{1,20})\*\*/g;
    while ((m = re.exec(t))) found.push(m[1].trim());
    if (found.length < max) {
      (t.match(/\d[\d,.]*\s?(?:%|배|초|분|원|개|명|일|주|달|년)?/g) || []).forEach(function (v) {
        if (found.length < max) found.push(v.trim());
      });
    }
    if (found.length < max) {
      (t.match(/[A-Za-z][A-Za-z0-9+.#-]{1,14}/g) || []).forEach(function (v) {
        if (found.length < max) found.push(v);
      });
    }
    if (found.length < max) {
      var words = stripMarks(t).replace(/[^\w가-힣\s]/g, ' ').split(/\s+/)
        .filter(function (w) { return w.length >= 2 && w.length <= 6 && STOPWORDS.indexOf(w) < 0; })
        .sort(function (a, b) { return b.length - a.length; });
      words.forEach(function (w) { if (found.length < max) found.push(w); });
    }
    return uniq(found).slice(0, max);
  }

  /** 한 줄을 강조 구간과 일반 구간으로 나눈다(그리기용). */
  function splitHighlight(line, tokens) {
    var text = str(line);
    var toks = (tokens || []).filter(Boolean).slice().sort(function (a, b) { return b.length - a.length; });
    var out = [];
    var i = 0;
    while (i < text.length) {
      var hit = null;
      for (var k = 0; k < toks.length; k++) {
        if (toks[k] && text.substr(i, toks[k].length) === toks[k]) { hit = toks[k]; break; }
      }
      if (hit) {
        out.push({ text: hit, hl: true });
        i += hit.length;
      } else {
        var next = i + 1;
        while (next < text.length) {
          var found = false;
          for (var j = 0; j < toks.length; j++) {
            if (toks[j] && text.substr(next, toks[j].length) === toks[j]) { found = true; break; }
          }
          if (found) break;
          next++;
        }
        out.push({ text: text.slice(i, next), hl: false });
        i = next;
      }
    }
    return out.filter(function (s) { return s.text; });
  }

  var AI_TICKS = [
    { word: '소중한', reason: '리뷰 답글·광고 문구에서 가장 흔한 AI 표현', alt: '고마운 / 남겨주신' },
    { word: '진심으로', reason: '강조 부사가 오히려 성의 없게 읽힘', alt: '정말 / 실제로' },
    { word: '앞으로도', reason: '끝맺음 상투구', alt: '다음에 / 다음 편에서' },
    { word: '여러분', reason: '1:1 숏폼에서는 거리감이 생김', alt: '여러분 대신 시청자 한 명에게 말하듯' },
    { word: '놀라운', reason: '근거 없는 수식어', alt: '구체적 수치' },
    { word: '완벽한', reason: '검증 불가한 단정', alt: '조건을 붙인 표현' },
    { word: '다양한', reason: '내용 없는 수식', alt: '구체적 항목' },
    { word: '많은 분들이', reason: '출처 없는 일반화', alt: '실제 수치나 사례' },
    { word: '지금 바로', reason: '광고 문구 상투어', alt: '오늘 / 이번 주' },
    { word: '놓치지 마세요', reason: '압박형 CTA는 저장률을 떨어뜨림', alt: '필요할 때 다시 보기' },
    { word: '새로운 시작', reason: '의미 없는 구호', alt: '구체적 행동' },
    { word: '함께해요', reason: '모호한 권유', alt: '한 가지 행동' },
    { word: '결론적으로', reason: 'AI 요약체 신호', alt: '그래서' },
    { word: '살펴보겠습니다', reason: '블로그 말투. 숏폼과 리듬이 다름', alt: '보여드릴게' },
    { word: '알아보겠습니다', reason: '블로그 말투', alt: '정리했습니다' },
    { word: '시사하는 바가', reason: '번역체', alt: '결론' }
  ];

  /** AI 티 점검: 100점에서 감점. */
  function checkAiTone(text) {
    var t = str(text);
    var hits = AI_TICKS.filter(function (x) { return t.indexOf(x.word) >= 0; })
      .map(function (x) { return { word: x.word, reason: x.reason, alt: x.alt }; });
    var score = clamp(100 - hits.length * 14, 0, 100);
    var label = score >= 86 ? '자연스러움' : (score >= 60 ? '조금 AI 티' : 'AI 티 남');
    return { score: score, hits: hits, label: label };
  }

  function buildHashtags(topic, platformId) {
    var p = platformById(platformId);
    var words = clean(topic, 30).replace(/[^\w가-힣\s]/g, ' ').split(/\s+/)
      .filter(function (w) { return w.length >= 2; }).slice(0, 3)
      .map(function (w) { return '#' + w; });
    return uniq(words.concat(['#숏폼', '#릴스', p.tag])).slice(0, 5).join(' ');
  }

  /** 게시용 캡션(첫 줄 훅 + 해시태그) */
  function buildCaption(project) {
    var cuts = normalizeCuts(project.cuts || []);
    var hook = stripMarks(cuts[0].headline);
    var cta = stripMarks(cuts[4].headline);
    return [hook, '', cta, '', buildHashtags(project.topic || hook, project.platform)].join('\n');
  }

  /* ==========================================================
     6. AI(Pro) 프롬프트 · 결과 파싱
     ========================================================== */

  function buildScriptPrompt(opts) {
    opts = opts || {};
    var tone = toneById(opts.tone || 'friendly');
    var topic = clean(opts.topic || '주제 미정', 80);
    var target = platformById(opts.platform || 'shorts');
    var extra = clean(opts.extra || '', 120);
    return [
      '너는 한국어 숏폼(9:16, 세로) 대본 작가다. 조회수가 나온 계정의 말투로, 광고 문구가 아니라 사람이 말하듯 쓴다.',
      '',
      '주제: ' + topic,
      '톤: ' + tone.name + ' — ' + tone.desc,
      '플랫폼: ' + target.name + ' (최대 ' + target.max + '초)',
      extra ? '추가 요청: ' + extra : null,
      '',
      '5컷 구조를 반드시 지켜라:',
      '1) 훅 — 3초 안에 멈추게. 인사말 금지. 숫자·반전·손실 중 하나로 시작.',
      '2) 문제 — 시청자가 겪는 구체적 장면 하나.',
      '3) 해결 — 방법이나 제품을 한 문장으로. 과정은 3단계 이내.',
      '4) 증거 — 수치·후기·비교. 확인되지 않은 값은 [숫자]처럼 대괄호로 남겨라.',
      '5) 행동 — 저장·팔로우·클릭 중 하나만.',
      '',
      '규칙:',
      '- headline은 24자 이내, sub는 36자 이내. 두 줄을 합쳐 45자를 넘기지 마라.',
      '- 다음 표현은 쓰지 마라: 소중한, 진심으로, 앞으로도, 여러분, 놀라운, 완벽한, 다양한, 많은 분들이, 지금 바로, 놓치지 마세요, 결론적으로, 살펴보겠습니다.',
      '- 이모지, 해시태그, 따옴표, 마크다운을 넣지 마라.',
      '- 지어낸 통계를 만들지 마라. 모르면 [숫자]로 둔다.',
      '- 각 컷에 direction(촬영·화면 지시 한 줄, 40자 이내)을 붙인다.',
      '',
      '출력은 아래 JSON 배열만. 설명·코드블록 없이 JSON만 출력한다.',
      '[{"stage":"hook","headline":"","sub":"","direction":""},',
      ' {"stage":"problem","headline":"","sub":"","direction":""},',
      ' {"stage":"solution","headline":"","sub":"","direction":""},',
      ' {"stage":"proof","headline":"","sub":"","direction":""},',
      ' {"stage":"cta","headline":"","sub":"","direction":""}]'
    ].filter(function (l) { return l !== null; }).join('\n');
  }

  function buildImagePrompt(cut, project) {
    var theme = themeById((project && project.theme) || 'editorial');
    var mood = {
      editorial: 'warm cream paper texture, editorial photography, soft natural window light, muted terracotta accents, film grain',
      midnight: 'cinematic low-key lighting, warm amber highlights, deep shadows, anamorphic film still',
      neon: 'dark studio, lime green neon rim light, magenta fill, high contrast, crisp modern product shot',
      sunset: 'sunset gradient orange to magenta, soft haze, backlit silhouette, dreamy warm tones',
      clinic: 'clean bright mint and white, soft diffused daylight, minimal medical-lifestyle photography',
      pop: 'bold yellow seamless background, hard direct light, high contrast, graphic studio still life'
    }[theme.id];
    var subject = clean(stripMarks(cut.headline) + ', ' + stripMarks(cut.sub || ''), 180);
    return [
      'Vertical 9:16 short-form video background image, 1080x1920.',
      'Scene idea (Korean): ' + subject,
      'Style: ' + (mood || mood.editorial) + '.',
      'Composition: keep the upper third and lower third visually calm for large Korean subtitles; main subject off-center.',
      'No text, no letters, no logos, no watermarks. Photorealistic, high detail.'
    ].join(' ');
  }

  /** 단계 이름 → 단계 id. 모르면 null. */
  function detectStage(v) {
    var s = str(v).toLowerCase().trim();
    if (!s) return null;
    if (/훅|hook|오프닝|intro|1\s*컷|첫/.test(s)) return 'hook';
    if (/문제|problem|pain|고민|2\s*컷/.test(s)) return 'problem';
    if (/해결|solution|방법|how|3\s*컷/.test(s)) return 'solution';
    if (/증거|proof|결과|사례|review|4\s*컷/.test(s)) return 'proof';
    if (/행동|cta|마무리|마지막|outro|5\s*컷/.test(s)) return 'cta';
    return null;
  }

  /** AI 응답 → 5컷 배열. 실패하면 빈 배열. */
  function parseAiCuts(raw) {
    var text = str(raw).replace(/```[a-zA-Z]*/g, '').replace(/```/g, '').trim();
    if (!text) return [];
    var parsed = null;
    var start = text.indexOf('[');
    var end = text.lastIndexOf(']');
    if (start >= 0 && end > start) {
      try { parsed = JSON.parse(text.slice(start, end + 1)); } catch (e) { parsed = null; }
    }
    if (!parsed) {
      var s2 = text.indexOf('{'), e2 = text.lastIndexOf('}');
      if (s2 >= 0 && e2 > s2) {
        try {
          var one = JSON.parse(text.slice(s2, e2 + 1));
          parsed = one.cuts || one.script || one.storyboard || null;
        } catch (e) { parsed = null; }
      }
    }
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map(function (item, i) {
        if (typeof item === 'string') {
          return { stage: null, headline: clean(item, LIMITS.headline), sub: '', direction: '' };
        }
        item = item || {};
        return {
          stage: detectStage(item.stage || item.role || item.part || item.slot || ''),
          headline: clean(item.headline || item.title || item.hook || item.text || item.line || '', LIMITS.headline),
          sub: clean(item.sub || item.subtitle || item.body || item.support || item.caption || '', LIMITS.sub),
          direction: clean(item.direction || item.visual || item.note || '', LIMITS.direction)
        };
      }).filter(function (c) { return c.headline; });
    }
    // "1. 훅 | 제목 | 부제" / "훅: 제목" 형태
    var lines = text.split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean)
      .filter(function (l) { return !/^[\{\}\[\],]+$/.test(l); });
    var rows = [];
    lines.forEach(function (line) {
      var cells = line.split(/\s*[|｜]\s*/).map(function (c) { return c.trim(); }).filter(Boolean);
      var headCell = (cells[0] || '').replace(/^\d{1,2}[).\]]?\s*/, '').trim();
      var labeled = detectStage(headCell);
      if (cells.length >= 2) {
        // "훅 | 제목 | 부제" 또는 "1 | 제목 | 부제"
        var isSlot = labeled || /^\d{1,2}$/.test(cells[0]);
        rows.push({
          stage: labeled,
          headline: isSlot ? cells[1] : stripBullet(cells[0]),
          sub: cells.slice(isSlot ? 2 : 1).join(' '),
          direction: ''
        });
        return;
      }
      var m = line.match(/^\s*(?:[-•*]\s*)?(?:\d{1,2}[).\]]?\s*)?(?:(훅|문제|해결|증거|행동|CTA|hook|problem|solution|proof|cta)\s*[:：\-]\s*)?(.+)$/i);
      if (m && m[2]) {
        rows.push({ stage: detectStage(m[1] || ''), headline: stripBullet(m[2]), sub: '', direction: '' });
      }
    });
    rows = rows.filter(function (r) { return r.headline && r.headline.length > 1; });
    // 제목/부제가 번갈아 나오는 형태면 짝지어 묶는다.
    if (rows.length >= 8 && !rows.some(function (r) { return r.stage; })) {
      var paired = [];
      for (var i = 0; i < rows.length; i += 2) {
        paired.push({
          stage: STAGES[Math.min(STAGES.length - 1, Math.floor(i / 2))].id,
          headline: rows[i].headline,
          sub: rows[i + 1] ? rows[i + 1].headline : '',
          direction: ''
        });
      }
      rows = paired;
    }
    return rows.slice(0, 8).map(function (r, i) {
      return {
        stage: r.stage || STAGES[Math.min(STAGES.length - 1, i)].id,
        headline: clean(r.headline, LIMITS.headline),
        sub: clean(r.sub, LIMITS.sub),
        direction: clean(r.direction, LIMITS.direction)
      };
    }).filter(function (c) { return c.headline; });
  }

  function normalizeStage(v) {
    return detectStage(v) || 'hook';
  }

  /** AI 응답을 기존 스토리보드에 반영하되, 빈 컷은 기존 문장 유지. */
  function mergeAiCuts(existing, aiCuts) {
    var base = normalizeCuts(existing || []);
    var parsed = Array.isArray(aiCuts) ? aiCuts : [];
    if (!parsed.length) return base;
    var byStage = {};
    parsed.forEach(function (c) { if (c && c.stage) byStage[c.stage] = c; });
    return base.map(function (cut, i) {
      var next = byStage[STAGES[i].id] || parsed[i] || null;
      if (!next || !next.headline) return cut;
      return makeCut(STAGES[i].id, {
        headline: next.headline,
        sub: next.sub || cut.sub,
        direction: next.direction || cut.direction,
        duration: cut.duration,
        image: cut.image,
        imageName: cut.imageName,
        aiImage: cut.aiImage
      }, i);
    });
  }

  /* ==========================================================
     7. 프로젝트 검사 · 저장 형태
     ========================================================== */

  function projectStats(project) {
    var cuts = normalizeCuts(project.cuts || []);
    var ms = totalMs(cuts);
    var chars = cuts.reduce(function (n, c) { return n + stripMarks(c.headline).length + stripMarks(c.sub).length; }, 0);
    var ai = checkAiTone(cuts.map(function (c) { return stripMarks(c.headline) + ' ' + stripMarks(c.sub); }).join(' '));
    var platform = platformById(project.platform);
    return {
      totalMs: ms,
      totalSec: round(ms / 1000, 1),
      chars: chars,
      aiTone: ai,
      overPlatformMax: ms / 1000 > platform.max,
      platform: platform
    };
  }

  /** 저장·불러오기용으로 안전한 필드만 남긴다. */
  function serializeProject(project) {
    var base = emptyProject();
    ['topic', 'tone', 'theme', 'platform', 'captionStyle', 'transition', 'handle', 'music', 'resolution'].forEach(function (k) {
      if (project[k] !== undefined) base[k] = project[k];
    });
    ['showProgress', 'showCaption'].forEach(function (k) {
      if (project[k] !== undefined) base[k] = !!project[k];
    });
    base.fps = Number(project.fps) === 24 ? 24 : 30;
    base.grade = normalizeGrade(project.grade);
    base.splits = {};
    if (project.splits && typeof project.splits === 'object') {
      Object.keys(project.splits).slice(0, 8).forEach(function (k) {
        var i = Number(k), n = Number(project.splits[k]);
        if (isFinite(i) && isFinite(n) && n > 0.15 && n < 0.86) base.splits[i] = round(n, 2);
      });
    }
    base.subtitles = (Array.isArray(project.subtitles) ? project.subtitles : []).slice(0, 30).map(function (s) {
      return {
        id: clean(s.id || '', 24), cutIndex: clamp(s.cutIndex || 0, 0, 4),
        stage: s.stage || 'hook', kind: s.kind === 'sub' ? 'sub' : 'headline',
        start: clamp(Math.round(s.start || 0), 0, 600000),
        end: clamp(Math.round(s.end || 0), 0, 600000),
        text: clean(s.text || '', 24)
      };
    }).filter(function (s) { return s.end > s.start && s.text; });
    if (project.swarm && project.swarm.mode) {
      base.swarm = { mode: clean(project.swarm.mode, 12), steps: [] };
    }
    base.cuts = normalizeCuts(project.cuts || []).map(function (c) {
      return {
        stage: c.stage, label: c.label,
        headline: c.headline, sub: c.sub, direction: c.direction, duration: c.duration,
        image: typeof c.image === 'string' && c.image.slice(0, 12) === 'data:image' && c.image.length < 700000 ? c.image : null,
        imageName: c.imageName || '', aiImage: !!c.aiImage
      };
    });
    return base;
  }

  function validateProject(project) {
    var issues = [];
    var cuts = project.cuts || [];
    var stats = projectStats(project);
    if (!project.topic) issues.push({ level: 'warn', field: 'topic', text: '주제가 비어 있습니다. 대본에는 영향이 없지만 파일 이름에 쓰입니다.' });
    if (cuts.length && cuts[0] && stripMarks(cuts[0].headline).length > 24) {
      issues.push({ level: 'warn', field: 'hook', text: '훅이 24자를 넘습니다. 3초 안에 읽히지 않을 수 있습니다.' });
    }
    var total = stats.totalSec;
    if (total > 60) issues.push({ level: 'warn', field: 'duration', text: '60초를 넘습니다. 쇼츠·틱톡 기준으로는 60초 이내를 권장합니다.' });
    if (total < 6) issues.push({ level: 'warn', field: 'duration', text: '6초 미만입니다. 컷당 1.5초 이상을 권장합니다.' });
    cuts.forEach(function (c, i) {
      if (!stripMarks(c.headline).trim()) issues.push({ level: 'error', field: 'cut-' + (i + 1), text: (i + 1) + '번 컷 제목이 비었습니다.' });
      if (/\[[^\]]+\]/.test(c.headline + c.sub)) {
        issues.push({ level: 'info', field: 'cut-' + (i + 1), text: (i + 1) + '번 컷에 [대괄호] 자리표시가 있습니다. 실제 값으로 바꾸세요.' });
      }
    });
    if (stats.aiTone.hits.length) {
      issues.push({ level: 'info', field: 'tone', text: 'AI 티 표현 ' + stats.aiTone.hits.length + '개: ' + stats.aiTone.hits.map(function (h) { return h.word; }).join(', ') });
    }
    return issues;
  }

  function safeFileName(name, fallback) {
    var base = clean(name || '', 40).replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, '').replace(/\s+/g, '-');
    return (base || fallback || 'shorts') + '';
  }

  /* ==========================================================
     8. NLE · 컬러 보정 / 멀티트랙 / AI 스웜
     ----------------------------------------------------------
     타임라인 편집기(NLE)가 쓰는 순수 로직. 화면·캔버스 없이
     node 에서 그대로 검증한다.
       · 컬러 그레이드(노출·대비·채도·온도·틴트) → CSS 필터 문자열
       · V1 영상 / T1 자막 / A1 오디오 / FX 효과 트랙 모델
       · 규칙 기반 AI 스웜 편집(컷 분할 → 자막 → 색보정 → 오디오)
       · Pro 응답(JSON) 파싱
     ========================================================== */

  var GRADES = [
    { id: 'neutral', name: '뉴트럴', nameEn: 'NEUTRAL', exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, note: '원본 그대로' },
    { id: 'cinematic', name: '시네마틱', nameEn: 'CINEMATIC', exposure: -3, contrast: 20, saturation: -8, temperature: -4, tint: 3, note: '낮은 채도 · 깊은 대비' },
    { id: 'warm', name: '웜 톤', nameEn: 'WARM', exposure: 4, contrast: 6, saturation: 10, temperature: 24, tint: 4, note: '따뜻한 살구빛' },
    { id: 'cool', name: '쿨 톤', nameEn: 'COOL', exposure: 1, contrast: 10, saturation: -4, temperature: -24, tint: -5, note: '푸른 그림자' },
    { id: 'punch', name: '펀치', nameEn: 'PUNCH', exposure: 3, contrast: 28, saturation: 22, temperature: 5, tint: 0, note: '숏폼용 고대비' },
    { id: 'fade', name: '필름 페이드', nameEn: 'FILM FADE', exposure: 7, contrast: -16, saturation: -14, temperature: 9, tint: 0, note: '들뜬 블랙' }
  ];

  var TRACKS = [
    { id: 'V1', name: '영상', nameEn: 'VIDEO', color: '#A78BFA' },
    { id: 'T1', name: '자막', nameEn: 'CAPTIONS', color: '#34E0C8' },
    { id: 'A1', name: '오디오', nameEn: 'AUDIO', color: '#60A5FA' },
    { id: 'FX', name: '효과', nameEn: 'EFFECTS', color: '#FBBF24' }
  ];

  var AGENTS = [
    { id: 'claude', name: 'Claude', role: '대본/자막', color: '#E8A24A' },
    { id: 'gemini', name: 'Gemini', role: '컷/리듬', color: '#5B9CFF' },
    { id: 'gpt', name: 'GPT', role: '색보정/사운드', color: '#34E0C8' }
  ];

  function gradeById(id) {
    for (var i = 0; i < GRADES.length; i++) if (GRADES[i].id === id) return GRADES[i];
    return GRADES[0];
  }
  function agentById(id) {
    for (var i = 0; i < AGENTS.length; i++) if (AGENTS[i].id === id) return AGENTS[i];
    return AGENTS[0];
  }
  function trackById(id) {
    for (var i = 0; i < TRACKS.length; i++) if (TRACKS[i].id === id) return TRACKS[i];
    return TRACKS[0];
  }

  /** 그레이드 값을 -50~50 정수로 고정한다. */
  function normalizeGrade(raw) {
    var out = {
      id: 'custom', exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0
    };
    if (!raw || typeof raw !== 'object') return out;
    ['exposure', 'contrast', 'saturation', 'temperature', 'tint'].forEach(function (k) {
      out[k] = Math.round(clamp(raw[k] || 0, -50, 50));
    });
    out.id = clean(raw.id || 'custom', 20) || 'custom';
    if (raw.preset) out.preset = clean(raw.preset, 20);
    var match = matchGradePreset(out);
    if (match) out.preset = match;
    return out;
  }

  /** 값이 프리셋과 같으면 프리셋 id를 돌려준다(다르면 ''). */
  function matchGradePreset(g) {
    var n = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 };
    ['exposure', 'contrast', 'saturation', 'temperature', 'tint'].forEach(function (k) { n[k] = Math.round(clamp(g[k] || 0, -50, 50)); });
    for (var i = 0; i < GRADES.length; i++) {
      var p = GRADES[i];
      if (p.exposure === n.exposure && p.contrast === n.contrast && p.saturation === n.saturation &&
          p.temperature === n.temperature && p.tint === n.tint) return p.id;
    }
    return '';
  }

  /** 그레이드가 실제로 화면을 바꾸는지. */
  function hasGrade(raw) {
    var g = normalizeGrade(raw);
    return !!(g.exposure || g.contrast || g.saturation || g.temperature || g.tint);
  }

  /** Canvas/WebM 공용 CSS 필터 문자열. */
  function gradeFilterString(raw) {
    var g = normalizeGrade(raw);
    if (!g.exposure && !g.contrast && !g.saturation) return 'none';
    var brightness = round(clamp(1 + g.exposure / 100, 0.4, 1.8), 3);
    var contrast = round(clamp(1 + g.contrast / 100, 0.3, 2), 3);
    var saturate = round(clamp(1 + g.saturation / 100, 0, 2.4), 3);
    return 'brightness(' + brightness + ') contrast(' + contrast + ') saturate(' + saturate + ')';
  }

  /** 온도·틴트를 색 피막으로. 없으면 null. */
  function gradeOverlay(raw) {
    var g = normalizeGrade(raw);
    if (!g.temperature && !g.tint) return null;
    var t = g.temperature / 50, n = g.tint / 50;
    var r = 128 + Math.round(112 * t) + Math.round(22 * n);
    var gg = 128 + Math.round(18 * Math.abs(t)) * (t > 0 ? 1 : 1) - Math.round(20 * n);
    var b = 128 - Math.round(104 * t) + Math.round(30 * n);
    r = clamp(r, 0, 255); gg = clamp(gg, 0, 255); b = clamp(b, 0, 255);
    return {
      r: Math.round(r), g: Math.round(gg), b: Math.round(b),
      alpha: round(0.06 + 0.2 * Math.max(Math.abs(t), Math.abs(n)), 3),
      blend: 'soft-light'
    };
  }

  /** 그레이드 사람이 읽는 요약 */
  function gradeLabel(raw) {
    var g = normalizeGrade(raw);
    if (g.preset) return gradeById(g.preset).name;
    if (!hasGrade(g)) return '뉴트럴';
    return '커스텀 · 노출 ' + (g.exposure > 0 ? '+' : '') + g.exposure + ' · 대비 ' + (g.contrast > 0 ? '+' : '') + g.contrast +
      ' · 채도 ' + (g.saturation > 0 ? '+' : '') + g.saturation + ' · 온도 ' + (g.temperature > 0 ? '+' : '') + g.temperature;
  }

  /** 테마에 맞는 자동 그레이드 */
  function autoGrade(themeId) {
    var map = { editorial: 'warm', midnight: 'cinematic', neon: 'punch', sunset: 'warm', clinic: 'cool', pop: 'punch' };
    return normalizeGrade(Object.assign({}, gradeById(map[themeId] || 'warm'), { id: map[themeId] || 'warm' }));
  }

  /* ── 프레임 타임코드 00:00:00:00 ───────────────────────── */
  function formatTimecodeFrames(ms, fps) {
    var f = Number(fps) === 24 ? 24 : 30;
    var total = Math.max(0, Math.round(Number(ms) || 0));
    var h = Math.floor(total / 3600000);
    var m = Math.floor(total % 3600000 / 60000);
    var s = Math.floor(total % 60000 / 1000);
    var frame = Math.min(f - 1, Math.floor((total % 1000) / 1000 * f));
    function p2(n) { return n < 10 ? '0' + n : String(n); }
    return p2(h) + ':' + p2(m) + ':' + p2(s) + ':' + p2(frame);
  }

  /* ── 자막 트랙(T1) 문장 나누기 ─────────────────────────── */
  function subtitlesFromCuts(cuts, maxChars) {
    var list = normalizeCuts(cuts || []);
    var tl = timeline(list);
    var out = [];
    var chars = Math.max(8, Number(maxChars) || 17);
    list.forEach(function (cut, i) {
      var seg = tl[i];
      var text = stripMarks(cut.headline);
      var lines = wrapText(text, chars);
      if (!lines.length) return;
      var sub = stripMarks(cut.sub || '');
      var subLines = sub ? wrapText(sub, chars + 4).slice(0, 2) : [];
      var all = lines.concat(subLines);
      var step = seg.duration / all.length;
      all.forEach(function (line, k) {
        out.push({
          id: 't' + (i + 1) + '-' + (k + 1),
          cutIndex: i, stage: cut.stage,
          start: Math.round(seg.start + step * k),
          end: Math.round(seg.start + step * (k + 1)),
          text: clean(line, 24),
          kind: k < lines.length ? 'headline' : 'sub'
        });
      });
    });
    return out;
  }

  /* ── 오디오(A1) 비트 · 파형 ───────────────────────────── */
  function audioBeats(project) {
    var p = project || {};
    var total = totalMs(normalizeCuts(p.cuts || []));
    var music = p.music || 'lofi';
    if (music === 'none' || total <= 0) return [];
    var bpm = music === 'upbeat' ? 118 : (music === 'lofi' ? 74 : 58);
    var beat = 60000 / bpm;
    var out = [];
    for (var t = 0; t < total; t += beat) out.push(Math.round(t));
    return out.slice(0, 400);
  }

  /** 파형 표본(0~1). 같은 프로젝트면 항상 같은 모양 — 그림 검증용. */
  function waveform(project, n, atMs) {
    var count = Math.max(8, Math.min(240, Number(n) || 96));
    var total = totalMs(normalizeCuts((project && project.cuts) || []));
    var seed = hash((project && project.music ? project.music : 'lofi') + '|' + total);
    var out = [];
    var beats = (project && project.beats && project.beats.length) ? project.beats : audioBeats(project);
    var pos = Number(atMs) || 0;
    for (var i = 0; i < count; i++) {
      var t = total ? (i / count) * total + pos : i / count;
      var base = 0.28 + 0.34 * Math.abs(Math.sin(i * 0.41 + (seed % 17)));
      var mod = 0.18 * Math.abs(Math.sin(i * 1.27 + (seed % 7)));
      var hit = 0;
      for (var b = 0; b < beats.length; b++) {
        var d = Math.abs(t - beats[b]);
        if (d < 90) hit = Math.max(hit, (1 - d / 90) * 0.4);
      }
      out.push(round(clamp(base + mod + hit, 0.05, 1), 3));
    }
    return out;
  }

  /* ── 멀티트랙 모델 ────────────────────────────────────── */
  function buildTracks(project, opts) {
    opts = opts || {};
    var p = project || {};
    var cuts = normalizeCuts(p.cuts || []);
    var tl = timeline(cuts);
    var total = tl.length ? tl[tl.length - 1].end : 0;
    var splits = (p.splits && typeof p.splits === 'object') ? p.splits : {};

    var v1 = [];
    cuts.forEach(function (cut, i) {
      var seg = tl[i];
      var ratio = Number(splits[i]);
      var label = cut.label || stageById(cut.stage).label;
      if (isFinite(ratio) && ratio > 0.15 && ratio < 0.86) {
        var mid = Math.round(seg.start + seg.duration * ratio);
        v1.push({
          id: 'v' + (i + 1) + 'a', cutIndex: i, stage: cut.stage, label: label,
          start: seg.start, end: mid, part: 'A', text: stripMarks(cut.headline)
        });
        v1.push({
          id: 'v' + (i + 1) + 'b', cutIndex: i, stage: cut.stage, label: label,
          start: mid, end: seg.end, part: 'B', text: stripMarks(cut.headline)
        });
      } else {
        v1.push({
          id: 'v' + (i + 1), cutIndex: i, stage: cut.stage, label: label,
          start: seg.start, end: seg.end, part: '', text: stripMarks(cut.headline)
        });
      }
    });

    var t1 = [];
    var subs = Array.isArray(p.subtitles) ? p.subtitles : [];
    if (subs.length) {
      t1 = subs.map(function (s, i) {
        return {
          id: clean(s.id || 'sub' + (i + 1), 24),
          cutIndex: Number(s.cutIndex) || 0, stage: s.stage || 'hook',
          start: Math.round(clamp(s.start, 0, Math.max(0, total))),
          end: Math.round(clamp(s.end, 0, Math.max(0, total))),
          text: clean(s.text, 24),
          kind: s.kind || 'headline'
        };
      }).filter(function (s) { return s.end > s.start && s.text; });
    } else {
      t1 = subtitlesFromCuts(cuts, opts.captionChars || 17);
    }

    var beats = (Array.isArray(p.beats) && p.beats.length) ? p.beats.slice(0, 400) : audioBeats(p);
    var a1 = {
      style: p.music || 'lofi',
      beats: beats,
      samples: waveform({ cuts: cuts, music: p.music, beats: beats }, opts.samples || 120),
      start: 0, end: total
    };

    var grade = normalizeGrade(p.grade);
    var fx = [];
    if ((p.transition || 'fade') !== 'none') {
      tl.forEach(function (seg, i) {
        if (i === 0) return;
        fx.push({
          id: 'fx-t' + i, type: 'transition', label: (p.transition || 'fade').toUpperCase(),
          start: Math.max(0, seg.start - 170), end: seg.start + 170
        });
      });
    }
    if (hasGrade(grade)) {
      fx.push({ id: 'fx-color', type: 'color', label: 'COLOR · ' + gradeLabel(grade), start: 0, end: total });
    }
    fx.push({ id: 'fx-grain', type: 'grain', label: 'GRAIN', start: 0, end: total });

    return {
      cuts: cuts, timeline: tl, total: total,
      v1: v1, t1: t1, a1: a1, fx: fx,
      counts: { V1: v1.length, T1: t1.length, A1: beats.length, FX: fx.length },
      splitCount: v1.length - cuts.length
    };
  }

  /* ── 규칙 기반 AI 스웜 편집 ───────────────────────────── */
  function planSwarm(project, opts) {
    opts = opts || {};
    var p = project || {};
    var cuts = normalizeCuts(p.cuts || []);
    var splits = {};
    var splitCount = 0;
    cuts.forEach(function (cut, i) {
      if (cut.duration >= 2.4) {
        var ratio = 0.4 + (hash(cut.headline + '|' + i) % 12) / 100;
        splits[i] = round(ratio, 2);
        splitCount++;}
    });
    var subs = subtitlesFromCuts(cuts, opts.captionChars || 17);
    var grade = autoGrade(p.theme);
    var beats = audioBeats(p);
    var steps = [
      { agent: 'gemini', action: 'split', label: '컷 분할', detail: splitCount + '컷을 리듬에 맞춰 나눔' },
      { agent: 'claude', action: 'subtitles', label: '자막 배치', detail: subs.length + '줄 자막을 T1에 배치' },
      { agent: 'gpt', action: 'grade', label: '색보정 적용', detail: gradeById(grade.preset || 'warm').name + ' 프리셋' },
      { agent: 'gpt', action: 'audio', label: '오디오 싱크', detail: beats.length + '개 비트에 파형 정렬' }
    ];
    return { mode: opts.mode || 'rules', splits: splits, subtitles: subs, grade: grade, beats: beats, steps: steps };
  }

  /** 스웜 계획을 프로젝트에 반영한 새 객체를 만든다. */
  function applySwarm(project, plan) {
    var base = {};
    var p = project || {};
    Object.keys(p).forEach(function (k) { base[k] = p[k]; });
    var pl = plan || {};
    if (pl.splits) base.splits = pl.splits;
    if (pl.subtitles) base.subtitles = pl.subtitles;
    if (pl.grade) base.grade = normalizeGrade(pl.grade);
    if (pl.beats) base.beats = pl.beats;
    if (pl.cuts) base.cuts = normalizeCuts(pl.cuts);
    base.swarm = {
      mode: pl.mode || 'rules',
      steps: (pl.steps || []).map(function (s) {
        return { agent: s.agent, action: s.action, label: s.label, detail: s.detail };
      })
    };
    return base;
  }

  /** Pro 응답용 프롬프트: 대본 + 리듬 + 색보정 프리셋. */
  function buildSwarmPrompt(project, opts) {
    opts = opts || {};
    var p = project || {};
    var cuts = normalizeCuts(p.cuts || []);
    var current = cuts.map(function (c, i) {
      return (i + 1) + ') [' + c.stage + '] ' + stripMarks(c.headline) + (c.sub ? ' / ' + stripMarks(c.sub) : '') + ' (' + c.duration + 's)';
    }).join('\n');
    return [
      '너는 숏폼(9:16) 편집 감독이다. 아래 스토리보드를 편집 가능한 타임라인 데이터로 바꿔라.',
      '',
      '주제: ' + clean(p.topic || '주제 미정', 80),
      '플랫폼: ' + platformById(p.platform).name + ' (최대 ' + platformById(p.platform).max + '초)',
      '현재 스토리보드:',
      current,
      '',
      '규칙:',
      '- 5컷 구조를 유지하고, headline은 24자 이내, sub는 36자 이내로 다시 쓴다.',
      '- 각 컷 duration은 1.2~6.0초. 훅은 2.5초 안쪽으로 짧게.',
      '- 금지 표현: 소중한, 진심으로, 앞으로도, 여러분, 놀라운, 완벽한, 다양한, 결국, 지금 바로.',
      '- 지어낸 통계 금지. 모르면 [숫자]로 둔다.',
      '- 색보정 프리셋은 neutral, cinematic, warm, cool, punch, fade 중 하나만 고른다.',
      '',
      '출력은 아래 JSON 객체 하나만. 설명·코드블록 금지.',
      '{"grade":"warm","cuts":[{"stage":"hook","headline":"","sub":"","duration":2.4}],"splits":[0.45,0.5,0.4,0.5,0],"notes":"한 줄 요약"}',
      'cuts는 반드시 5개, splits는 각 컷을 나눌 비율(0~1, 나누지 않으면 0)이다.'
    ].join('\n');
  }

  /** Pro 응답 → {cuts, grade, splits, notes} */
  function parseSwarmAi(raw) {
    var text = str(raw).replace(/```[a-zA-Z]*/g, '').replace(/```/g, '').trim();
    var out = { cuts: [], grade: null, splits: null, notes: '' };
    if (!text) return out;
    var obj = null;
    var s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s >= 0 && e > s) {
      try { obj = JSON.parse(text.slice(s, e + 1)); } catch (err) { obj = null; }
    }
    if (!obj) {
      var arr = parseAiCuts(text);
      out.cuts = arr;
      return out;
    }
    if (Array.isArray(obj.cuts)) out.cuts = parseAiCuts(JSON.stringify(obj.cuts));
    if (typeof obj.grade === 'string') {
      var gid = obj.grade.toLowerCase().trim();
      for (var i = 0; i < GRADES.length; i++) if (GRADES[i].id === gid) out.grade = normalizeGrade(GRADES[i]);
    } else if (obj.grade && typeof obj.grade === 'object') {
      out.grade = normalizeGrade(obj.grade);
    }
    if (Array.isArray(obj.splits)) {
      var splits = {};
      obj.splits.forEach(function (v, i) {
        var n = Number(v);
        if (isFinite(n) && n > 0.15 && n < 0.86) splits[i] = round(n, 2);
      });
      out.splits = splits;
    }
    out.notes = clean(obj.notes || obj.summary || '', 80);
    return out;
  }

  /* ==========================================================
     9. 내보내기
     ========================================================== */
  return {
    VERSION: VERSION,
    CANVAS: CANVAS,
    THEMES: THEMES,
    STAGES: STAGES,
    TONES: TONES,
    PLATFORMS: PLATFORMS,
    CAPTION_STYLES: CAPTION_STYLES,
    LIMITS: LIMITS,
    DURATIONS: DURATIONS,
    themeById: themeById,
    stageById: stageById,
    toneById: toneById,
    platformById: platformById,
    clean: clean,
    stripMarks: stripMarks,
    stripBullet: stripBullet,
    wrapText: wrapText,
    formatTimecode: formatTimecode,
    formatClock: formatClock,
    estimateDuration: estimateDuration,
    splitScript: splitScript,
    distributeCuts: distributeCuts,
    regenerateCut: regenerateCut,
    normalizeCuts: normalizeCuts,
    emptyProject: emptyProject,
    timeline: timeline,
    totalMs: totalMs,
    buildSrt: buildSrt,
    buildVtt: buildVtt,
    buildSrtFromSubtitles: buildSrtFromSubtitles,
    buildVttFromSubtitles: buildVttFromSubtitles,
    narrationText: narrationText,
    findHighlights: findHighlights,
    splitHighlight: splitHighlight,
    checkAiTone: checkAiTone,
    buildHashtags: buildHashtags,
    buildCaption: buildCaption,
    buildScriptPrompt: buildScriptPrompt,
    buildImagePrompt: buildImagePrompt,
    parseAiCuts: parseAiCuts,
    mergeAiCuts: mergeAiCuts,
    projectStats: projectStats,
    serializeProject: serializeProject,
    GRADES: GRADES,
    TRACKS: TRACKS,
    AGENTS: AGENTS,
    gradeById: gradeById,
    agentById: agentById,
    trackById: trackById,
    normalizeGrade: normalizeGrade,
    matchGradePreset: matchGradePreset,
    hasGrade: hasGrade,
    gradeFilterString: gradeFilterString,
    gradeOverlay: gradeOverlay,
    gradeLabel: gradeLabel,
    autoGrade: autoGrade,
    formatTimecodeFrames: formatTimecodeFrames,
    subtitlesFromCuts: subtitlesFromCuts,
    audioBeats: audioBeats,
    waveform: waveform,
    buildTracks: buildTracks,
    planSwarm: planSwarm,
    applySwarm: applySwarm,
    buildSwarmPrompt: buildSwarmPrompt,
    parseSwarmAi: parseSwarmAi,
    validateProject: validateProject,
    safeFileName: safeFileName,
    _internals: { hash: hash, BANKS: BANKS, AI_TICKS: AI_TICKS, normalizeStage: normalizeStage, detectStage: detectStage }
  };
});
