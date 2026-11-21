/* ============================================================
   design-ref-engine.js  ·  핀터레스트 디자인 레퍼런스 엔진  v2.0.0
   ------------------------------------------------------------
   의존성 없는 순수 JS(UMD). 브라우저는 window.DesignRef,
   node 는 require('./design-ref-engine.js').

   핀터레스트·Behance에서 고전환으로 검증된 패턴을 8개 프리셋으로
   구조화했다. 각 프리셋은
   · 60-30-10 컬러 팔레트 + WCAG 2.2 대비 검증
   · 모듈러 타이포 스케일(제목/부제/본문/캡션 비율·행간·자간)
   · 8pt 그리드 레이아웃 규칙(여백·라운딩·카드 밀도·배지/CTA 위치)
   를 담고, CSS / HTML / Canvas 드로잉 명령으로 출력한다.

   v2: 고정 프리셋 8종을 넘어
   · 레퍼런스 사진 1장 → 해부 JSON → 무제한 커스텀 블루프린트
   · 한글 폰트 믹스(명조×고딕) · 필름/종이 그레인 · 글자 수 다이어트 경고
   · 브랜드 키트로 시안 톤 고정·재사용
   을 제공한다. v1 API는 그대로 유지된다.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DesignRef = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '2.0.0';

  /* ==========================================================
     0. 색 계산 (WCAG 2.2 상대 휘도 · 대비비)
     ========================================================== */

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function round(n, d) { var p = Math.pow(10, d || 0); return Math.round(n * p) / p; }

  /** 결정적 해시(커스텀 테마 id 생성용) */
  function hash(s) {
    var h = 2166136261, str = String(s);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }

  function isHex(v) { return typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim()); }

  /** #RGB / #RRGGBB → {r,g,b} (0~255) */
  function hexToRgb(hex) {
    if (!isHex(hex)) throw new Error('invalid hex: ' + hex);
    var h = hex.trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  function rgbToHex(rgb) {
    function p(v) { var s = clamp(Math.round(v), 0, 255).toString(16); return s.length === 1 ? '0' + s : s; }
    return ('#' + p(rgb.r) + p(rgb.g) + p(rgb.b)).toUpperCase();
  }

  /** WCAG 2.2 정의: 채널별 0~1 선형화 후 0.2126R + 0.7152G + 0.0722B */
  function relativeLuminance(hex) {
    var c = hexToRgb(hex);
    var ch = [c.r, c.g, c.b].map(function (v) {
      var s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  /** 대비비 = (L1 + 0.05) / (L2 + 0.05), L1 = 밝은 쪽 */
  function contrastRatio(a, b) {
    var la = relativeLuminance(a), lb = relativeLuminance(b);
    var light = Math.max(la, lb), dark = Math.min(la, lb);
    return round((light + 0.05) / (dark + 0.05), 2);
  }

  /** WCAG 2.2 SC 1.4.3 / 1.4.6 판정. 반올림 없이 임계값 비교. */
  function wcagLevel(ratio, large) {
    var r = Number(ratio);
    if (!isFinite(r)) return 'fail';
    if (r >= 7) return 'AAA';
    if (r >= 4.5) return 'AA';
    if (large && r >= 3) return 'AA-large';
    return 'fail';
  }

  function passesAA(ratio, large) {
    return Number(ratio) >= (large ? 3 : 4.5);
  }

  function mix(hexA, hexB, t) {
    var a = hexToRgb(hexA), b = hexToRgb(hexB);
    return rgbToHex({
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t
    });
  }

  function luminanceSafeText(bg, candidates) {
    // 배경 위에서 4.5:1을 넘는 첫 후보(없으면 가장 대비 높은 것)
    var best = null, bestRatio = 0;
    (candidates || ['#111111', '#FFFFFF']).forEach(function (c) {
      var r = contrastRatio(c, bg);
      if (r > bestRatio) { best = c; bestRatio = r; }
    });
    return { color: best, ratio: bestRatio };
  }

  /* ==========================================================
     1. 타이포 스케일 · 스페이싱
     ========================================================== */

  var ROLE_ORDER = ['micro', 'caption', 'body', 'lead', 'h2', 'h1', 'display'];
  var ROLE_OFFSET = { micro: -2, caption: -1, body: 0, lead: 1, h2: 3, h1: 4, display: 5 };

  /**
   * 모듈러 스케일. body = base, 각 단계는 ratio 배.
   * @param {number} base  본문 px
   * @param {number} ratio 1.125 ~ 1.5
   * @returns {{micro:number,caption:number,body:number,lead:number,h2:number,h1:number,display:number,ratio:number,base:number}}
   */
  function typeScale(base, ratio) {
    var b = Number(base) || 16;
    var r = Number(ratio) || 1.25;
    var out = { base: b, ratio: r };
    ROLE_ORDER.forEach(function (role) {
      var step = ROLE_OFFSET[role];
      out[role] = Math.round(b * Math.pow(r, step));
    });
    return out;
  }

  /** 8pt 그리드 스페이싱. unit 배수 + 4pt 하프스텝. */
  function spacingScale(unit) {
    var u = Number(unit) || 8;
    return [u / 2, u, u * 1.5, u * 2, u * 3, u * 4, u * 6, u * 8, u * 12].map(function (v) { return Math.round(v); });
  }

  /* ==========================================================
     2. 프리셋 8종
     ----------------------------------------------------------
     palette: bg(60) · surface(30) · ink/sub/line(텍스트·구조)
              accent(10) · accentInk(강조 위 글자) · accentSoft(강조 배경)
     type   : base, ratio, roles(무게·행간·자간·대소문자·폰트역할)
     layout : 8pt 기반 여백·라운딩·보더·그림자·밀도·배지/CTA 위치
     fit    : 업종 적합도 0~1, moods, purposes
     ========================================================== */

  var PRESETS = [
    {
      id: 'swiss-magazine',
      name: '스위스 타이포 매거진',
      nameEn: 'Swiss Typographic Magazine',
      tagline: '격자·큰 제목·한 점의 원색. 정보가 곧 디자인이다.',
      origin: 'International Typographic Style (1950s Basel/Zurich) → 핀터레스트 에디토리얼·B2B 제안서 상위 노출 패턴',
      keywords: ['격자', '좌측 정렬', '큰 제목', '무채색+원색 1', '라운딩 0'],
      palette: {
        bg: '#F5F4F0', surface: '#FFFFFF', ink: '#101010', sub: '#555555',
        line: '#D9D7D1', accent: '#D8232A', accentInk: '#FFFFFF', accentSoft: '#FBE9EA'
      },
      ratio: { bg: 60, surface: 30, accent: 10 },
      type: {
        base: 16, ratio: 1.333,
        family: { display: 'sans', body: 'sans', mono: 'mono' },
        roles: {
          display: { weight: 800, lineHeight: 1.02, tracking: '-0.035em', transform: 'none' },
          h1: { weight: 700, lineHeight: 1.1, tracking: '-0.025em', transform: 'none' },
          h2: { weight: 700, lineHeight: 1.25, tracking: '-0.01em', transform: 'none' },
          lead: { weight: 400, lineHeight: 1.55, tracking: '0em', transform: 'none' },
          body: { weight: 400, lineHeight: 1.65, tracking: '0em', transform: 'none' },
          caption: { weight: 500, lineHeight: 1.4, tracking: '0.01em', transform: 'none' },
          micro: { weight: 600, lineHeight: 1.3, tracking: '0.08em', transform: 'uppercase' }
        }
      },
      layout: {
        unit: 8, columns: 12, gutter: 24, margin: 48, radius: 0, border: 1,
        shadow: 'none', density: 'high', imageRatio: '4:5', sectionGap: 56,
        maxWidth: 1180, cta: { pos: 'inline-left', radius: 0, height: 48, minWidth: 200 },
        badge: { pos: 'top-left', style: 'rule' }, grid: 'editorial-12'
      },
      fit: { '뷰티·패션': 0.55, '테크·IT': 0.9, '푸드·리빙': 0.6, '금융·B2B': 0.92, '숏폼 바이럴': 0.4 },
      moods: ['정밀', '차분', '권위', '미니멀'],
      purposes: { cardnews: 0.78, detail: 0.6, saas: 0.9, proposal: 0.96 },
      rules: [
        '좌측 정렬 하나만 쓴다. 가운데 정렬은 표지 1장에만.',
        '제목 2줄 이내, 한 줄에 14자 이내. 넘치면 폰트를 줄이지 말고 문장을 자른다.',
        '원색(accent)은 화면당 1~2곳. 제목의 한 단어 또는 CTA에만.',
        '라운딩 0, 그림자 없음. 구분은 1px 괘선과 여백으로만.',
        '이미지는 4:5, 텍스트 블록과 같은 좌측 baseline에 맞춘다.'
      ],
      pin: { headlineChars: 28, bodyChars: 60, ctaLabel: '자세히 보기' },
      applies: {
        cardnews: '표지에 큰 제목 + 하단 1px 괘선. 각 장은 (번호 · 제목 · 3줄) 고정.',
        detail: '스펙 표와 인증 로고를 괘선 그리드로 정렬. 과장 카피 대신 수치 표.',
        saas: '히어로 좌측 텍스트 / 우측 제품 캡처. 기능은 3열 표 형태.',
        proposal: '표지-요약-근거-견적 순. 페이지마다 좌상단 섹션 번호.'
      }
    },
    {
      id: 'bento-saas',
      name: '벤토 그리드 SaaS',
      nameEn: 'Bento Grid SaaS',
      tagline: '크기가 다른 카드가 기능의 중요도를 말한다.',
      origin: 'Apple 하드웨어 페이지 → Linear·Vercel·Raycast 2023~2025 SaaS 랜딩 표준',
      keywords: ['벤토', '라운딩 20', '소프트 섀도', '대시보드', '앵커 카드'],
      palette: {
        bg: '#F4F5F7', surface: '#FFFFFF', ink: '#0B1020', sub: '#4E5568',
        line: '#E3E6EC', accent: '#4338CA', accentInk: '#FFFFFF', accentSoft: '#EDECFB'
      },
      ratio: { bg: 60, surface: 30, accent: 10 },
      type: {
        base: 16, ratio: 1.25,
        family: { display: 'sans', body: 'sans', mono: 'mono' },
        roles: {
          display: { weight: 800, lineHeight: 1.05, tracking: '-0.03em', transform: 'none' },
          h1: { weight: 700, lineHeight: 1.12, tracking: '-0.02em', transform: 'none' },
          h2: { weight: 600, lineHeight: 1.3, tracking: '-0.01em', transform: 'none' },
          lead: { weight: 400, lineHeight: 1.6, tracking: '0em', transform: 'none' },
          body: { weight: 400, lineHeight: 1.65, tracking: '0em', transform: 'none' },
          caption: { weight: 500, lineHeight: 1.45, tracking: '0em', transform: 'none' },
          micro: { weight: 600, lineHeight: 1.3, tracking: '0.06em', transform: 'uppercase' }
        }
      },
      layout: {
        unit: 8, columns: 12, gutter: 24, margin: 40, radius: 20, border: 1,
        shadow: '0 1px 2px rgba(11,16,32,.06), 0 12px 32px -12px rgba(11,16,32,.18)',
        density: 'medium', imageRatio: '16:10', sectionGap: 64,
        maxWidth: 1200, cta: { pos: 'top-right', radius: 12, height: 48, minWidth: 168 },
        badge: { pos: 'top-right', style: 'pill' }, grid: 'bento'
      },
      fit: { '뷰티·패션': 0.5, '테크·IT': 0.98, '푸드·리빙': 0.55, '금융·B2B': 0.85, '숏폼 바이럴': 0.45 },
      moods: ['혁신', '전문적', '정돈', '친근'],
      purposes: { cardnews: 0.6, detail: 0.62, saas: 0.99, proposal: 0.8 },
      rules: [
        '2×2 앵커 카드 1개 + 1×1 새틀라이트 4~6개. 모든 카드는 같은 거터(24px).',
        '카드 라운딩은 20px 하나만. 내부 요소는 12px까지만.',
        '카드 안 텍스트는 제목 1줄 + 설명 2줄. 그 이상은 카드 밖으로.',
        '모바일에서는 1열로 쌓고, 앵커 카드가 가장 먼저 온다.',
        'accent는 CTA 버튼과 1개 지표에만. 카드 테두리에는 쓰지 않는다.'
      ],
      pin: { headlineChars: 26, bodyChars: 54, ctaLabel: '무료로 시작' },
      applies: {
        cardnews: '각 장을 2~4개 카드로 분할, 숫자 카드 1개를 크게.',
        detail: '상단 히어로 카드 + 기능 카드 3개 + 후기 카드 1개.',
        saas: '히어로 아래 벤토 섹션. 제품 캡처를 2×2에 배치.',
        proposal: '요약-지표-방법-일정을 카드로. 견적은 표 카드.'
      }
    },
    {
      id: 'cream-editorial',
      name: '크림 에디토리얼',
      nameEn: 'Cream Editorial',
      tagline: '종이의 온도. 세리프 제목과 넉넉한 행간.',
      origin: '뷰티·라이프스타일 브랜드 저널 → 핀터레스트 뷰티/웰니스 저장 상위',
      keywords: ['크림', '세리프', '여백', '필름톤', '비대칭'],
      palette: {
        bg: '#F3EADD', surface: '#FFFCF6', ink: '#33281E', sub: '#6A5B4A',
        line: '#E0D2BE', accent: '#A8431F', accentInk: '#FFF8F0', accentSoft: '#F6E3D6'
      },
      ratio: { bg: 60, surface: 30, accent: 10 },
      type: {
        base: 17, ratio: 1.28,
        family: { display: 'serif', body: 'sans', mono: 'mono' },
        roles: {
          display: { weight: 700, lineHeight: 1.08, tracking: '-0.02em', transform: 'none' },
          h1: { weight: 700, lineHeight: 1.18, tracking: '-0.015em', transform: 'none' },
          h2: { weight: 600, lineHeight: 1.32, tracking: '0em', transform: 'none' },
          lead: { weight: 400, lineHeight: 1.7, tracking: '0em', transform: 'none' },
          body: { weight: 400, lineHeight: 1.8, tracking: '0.005em', transform: 'none' },
          caption: { weight: 500, lineHeight: 1.5, tracking: '0.02em', transform: 'none' },
          micro: { weight: 600, lineHeight: 1.35, tracking: '0.12em', transform: 'uppercase' }
        }
      },
      layout: {
        unit: 8, columns: 6, gutter: 32, margin: 56, radius: 4, border: 1,
        shadow: '0 2px 18px -8px rgba(51,40,30,.22)', density: 'low', imageRatio: '4:5',
        sectionGap: 72, maxWidth: 1080, cta: { pos: 'inline-left', radius: 999, height: 52, minWidth: 208 },
        badge: { pos: 'bottom-left', style: 'soft' }, grid: 'editorial-6'
      },
      fit: { '뷰티·패션': 0.97, '테크·IT': 0.45, '푸드·리빙': 0.9, '금융·B2B': 0.5, '숏폼 바이럴': 0.7 },
      moods: ['따뜻함', '고급', '차분', '감성'],
      purposes: { cardnews: 0.93, detail: 0.86, saas: 0.35, proposal: 0.6 },
      rules: [
        '제목은 세리프, 본문은 산세리프. 두 패밀리까지만.',
        '본문 행간 1.8, 한 줄 32~38자. 여백이 절반이다.',
        '사진은 필름톤(따뜻한 화이트밸런스). 보정은 대비 낮게.',
        'accent는 가격·기한·링크에만. 면으로 쓰지 않는다.',
        '좌우 비대칭 6열. 이미지는 4:5, 텍스트는 4열 폭.'
      ],
      pin: { headlineChars: 24, bodyChars: 66, ctaLabel: '더 알아보기' },
      applies: {
        cardnews: '표지 세리프 대제목 + 필름 사진 1장. 본문은 짧은 문단.',
        detail: '성분·원료 스토리 중심. 인증은 작은 캡션으로.',
        saas: '권장하지 않음. 감성 브랜드 페이지에만.',
        proposal: '브랜드 제안서 표지·컨셉 섹션에 부분 적용.'
      }
    },
    {
      id: 'dark-neon',
      name: '다크 네온 임팩트',
      nameEn: 'Dark Neon Impact',
      tagline: '어두운 화면 위 형광 한 점. 스크롤을 멈추는 대비.',
      origin: '게이밍·AI 툴·크립토 랜딩 → 핀터레스트 테크/숏폼 썸네일 고저장 패턴',
      keywords: ['다크', '네온', '글로우', '모노', '고대비'],
      palette: {
        bg: '#08080C', surface: '#14141C', ink: '#F4F5FA', sub: '#A7ADC4',
        line: '#2A2B38', accent: '#C8FF3D', accentInk: '#0A0A0A', accentSoft: '#1E2610'
      },
      ratio: { bg: 60, surface: 30, accent: 10 },
      type: {
        base: 16, ratio: 1.333,
        family: { display: 'sans', body: 'sans', mono: 'mono' },
        roles: {
          display: { weight: 900, lineHeight: 0.98, tracking: '-0.04em', transform: 'uppercase' },
          h1: { weight: 800, lineHeight: 1.05, tracking: '-0.03em', transform: 'none' },
          h2: { weight: 700, lineHeight: 1.2, tracking: '-0.02em', transform: 'none' },
          lead: { weight: 400, lineHeight: 1.55, tracking: '0em', transform: 'none' },
          body: { weight: 400, lineHeight: 1.6, tracking: '0em', transform: 'none' },
          caption: { weight: 500, lineHeight: 1.4, tracking: '0.02em', transform: 'none' },
          micro: { weight: 700, lineHeight: 1.3, tracking: '0.16em', transform: 'uppercase' }
        }
      },
      layout: {
        unit: 8, columns: 12, gutter: 20, margin: 32, radius: 12, border: 1,
        shadow: '0 0 0 1px #2A2B38, 0 24px 60px -20px rgba(200,255,61,.28)',
        density: 'high', imageRatio: '16:9', sectionGap: 72,
        maxWidth: 1240, cta: { pos: 'bottom-right', radius: 8, height: 52, minWidth: 200 },
        badge: { pos: 'top-left', style: 'neon' }, grid: 'modular-12'
      },
      fit: { '뷰티·패션': 0.5, '테크·IT': 0.95, '푸드·리빙': 0.35, '금융·B2B': 0.55, '숏폼 바이럴': 0.9 },
      moods: ['임팩트', '실험적', '혁신', '공격적'],
      purposes: { cardnews: 0.75, detail: 0.55, saas: 0.85, proposal: 0.45 },
      rules: [
        '배경은 순흑이 아니라 #08080C. 네온은 한 화면에 1색만.',
        '네온 위 글자는 반드시 검정. 흰 글자는 대비가 무너진다.',
        '글로우는 CTA와 핵심 수치에만. 텍스트 전체에 번지게 하지 않는다.',
        '본문은 #A7ADC4로 낮춰 눈의 피로를 줄인다.',
        '모노 폰트는 라벨·수치에만. 제목에는 쓰지 않는다.'
      ],
      pin: { headlineChars: 22, bodyChars: 48, ctaLabel: '지금 확인' },
      applies: {
        cardnews: '검정 배경 + 형광 수치 1개. 각 장 하단에 진행 바.',
        detail: '제품 컷은 어두운 배경 연출. 스펙은 모노 표.',
        saas: '히어로에 네온 글로우 1개, 나머지는 무채색.',
        proposal: '표지·마무리 장에만 제한 적용.'
      }
    },
    {
      id: 'commerce-clean',
      name: '커머스 클린 화이트',
      nameEn: 'Commerce Clean White',
      tagline: '상품이 주인공. 배경은 비우고 혜택만 남긴다.',
      origin: '쿠팡·스마트스토어·Shopify 상위 상세페이지 → 핀터레스트 쇼핑 핀 표준',
      keywords: ['화이트', '상품 중심', '오렌지 CTA', '가격 강조', '모바일 우선'],
      palette: {
        bg: '#FFFFFF', surface: '#F6F7F8', ink: '#111214', sub: '#5A5F66',
        line: '#E5E7EB', accent: '#FF5A1F', accentInk: '#111214', accentSoft: '#FFF0E9'
      },
      ratio: { bg: 60, surface: 30, accent: 10 },
      type: {
        base: 16, ratio: 1.25,
        family: { display: 'sans', body: 'sans', mono: 'mono' },
        roles: {
          display: { weight: 800, lineHeight: 1.12, tracking: '-0.025em', transform: 'none' },
          h1: { weight: 800, lineHeight: 1.2, tracking: '-0.02em', transform: 'none' },
          h2: { weight: 700, lineHeight: 1.3, tracking: '-0.01em', transform: 'none' },
          lead: { weight: 500, lineHeight: 1.55, tracking: '0em', transform: 'none' },
          body: { weight: 400, lineHeight: 1.7, tracking: '0em', transform: 'none' },
          caption: { weight: 500, lineHeight: 1.45, tracking: '0em', transform: 'none' },
          micro: { weight: 700, lineHeight: 1.3, tracking: '0.05em', transform: 'none' }
        }
      },
      layout: {
        unit: 8, columns: 12, gutter: 16, margin: 24, radius: 8, border: 1,
        shadow: '0 1px 3px rgba(17,18,20,.08)', density: 'medium', imageRatio: '1:1',
        sectionGap: 48, maxWidth: 860, cta: { pos: 'bottom-fixed', radius: 8, height: 56, minWidth: 0 },
        badge: { pos: 'top-left', style: 'solid' }, grid: 'mobile-12'
      },
      fit: { '뷰티·패션': 0.92, '테크·IT': 0.68, '푸드·리빙': 0.95, '금융·B2B': 0.4, '숏폼 바이럴': 0.6 },
      moods: ['친근', '명확', '실용', '신뢰'],
      purposes: { cardnews: 0.7, detail: 0.99, saas: 0.5, proposal: 0.35 },
      rules: [
        '첫 화면 3초: 상품 1개 + 혜택 1줄 + 가격. 그 외는 넣지 않는다.',
        '모바일 폭 860px 기준. 본문 16px 이상, 버튼 56px 높이.',
        '가격은 정가 취소선 → 판매가 → 할인율 순서. 폰트 크기 1.6배.',
        '혜택·후기·인증은 스크롤 2~3회마다 한 블록씩.',
        'CTA는 하단 고정. 문구는 “구매하기” 대신 혜택형(“오늘 받기”).'
      ],
      pin: { headlineChars: 24, bodyChars: 46, ctaLabel: '오늘 받기' },
      applies: {
        cardnews: '상품 컷 + 가격 + 혜택 1줄. 6~8장이면 충분.',
        detail: '3초 히어로 → 혜택 → 인증 → 사용장면 → 후기 → 정책.',
        saas: '가격 페이지에만 부분 적용.',
        proposal: '상품 제안서의 견적·사양 표에 적용.'
      }
    },
    {
      id: 'neo-brutalism',
      name: '네오 브루탈리즘',
      nameEn: 'Neo-Brutalism',
      tagline: '3px 검정 테두리, 6px 하드 섀도. 숨기지 않는 레이아웃.',
      origin: 'Gumroad·Figma 커뮤니티 → 2023~2025 인디·크리에이터 툴 트렌드 (NN/g 2025)',
      keywords: ['하드 섀도', '굵은 테두리', '형광 라임', '모노 라벨', '비대칭'],
      palette: {
        bg: '#FFFDF2', surface: '#FFFFFF', ink: '#000000', sub: '#4A4A4A',
        line: '#000000', accent: '#C6F432', accentInk: '#000000', accentSoft: '#EEFBC0'
      },
      ratio: { bg: 60, surface: 30, accent: 10 },
      type: {
        base: 16, ratio: 1.333,
        family: { display: 'sans', body: 'sans', mono: 'mono' },
        roles: {
          display: { weight: 900, lineHeight: 0.95, tracking: '-0.04em', transform: 'uppercase' },
          h1: { weight: 800, lineHeight: 1.02, tracking: '-0.03em', transform: 'none' },
          h2: { weight: 800, lineHeight: 1.2, tracking: '-0.02em', transform: 'none' },
          lead: { weight: 500, lineHeight: 1.5, tracking: '0em', transform: 'none' },
          body: { weight: 400, lineHeight: 1.6, tracking: '0em', transform: 'none' },
          caption: { weight: 500, lineHeight: 1.4, tracking: '0.01em', transform: 'none' },
          micro: { weight: 700, lineHeight: 1.3, tracking: '0.18em', transform: 'uppercase' }
        }
      },
      layout: {
        unit: 8, columns: 8, gutter: 16, margin: 24, radius: 0, border: 3,
        shadow: '6px 6px 0 #000000', density: 'high', imageRatio: '1:1',
        sectionGap: 64, maxWidth: 1160, cta: { pos: 'bottom-left', radius: 0, height: 52, minWidth: 196 },
        badge: { pos: 'top-right', style: 'sticker' }, grid: 'visible-8'
      },
      fit: { '뷰티·패션': 0.62, '테크·IT': 0.8, '푸드·리빙': 0.55, '금융·B2B': 0.25, '숏폼 바이럴': 0.88 },
      moods: ['발랄', '실험적', '임팩트', '친근'],
      purposes: { cardnews: 0.85, detail: 0.55, saas: 0.7, proposal: 0.3 },
      rules: [
        '테두리 3px 검정, 하드 섀도 6px 6px 0 — 블러 금지.',
        '형광 라임은 버튼·배지에만. 본문 배경으로 쓰지 않는다.',
        '모든 요소를 정확히 정렬해 “일부러 거친” 느낌을 만든다.',
        '모노 폰트는 라벨·번호·태그에만. 제목은 굵은 산세리프.',
        'B2B·금융·의료에는 쓰지 않는다(신뢰도 손실).'
      ],
      pin: { headlineChars: 20, bodyChars: 40, ctaLabel: '바로 보기' },
      applies: {
        cardnews: '번호 라벨 + 형광 강조 박스. 각 장 테두리 유지.',
        detail: '인디 브랜드에만. 스펙 표는 검정 괘선.',
        saas: '인디 툴·커뮤니티 제품에 적합.',
        proposal: '권장하지 않음(공공·B2B 제안서).'
      }
    },
    {
      id: 'minimal-luxury',
      name: '미니멀 럭셔리 세리프',
      nameEn: 'Minimal Luxury Serif',
      tagline: '큰 여백, 얇은 세리프, 금속빛 한 줄.',
      origin: '하이엔드 뷰티·호텔·주얼리 브랜드 룩북 → 핀터레스트 럭셔리 저장 상위',
      keywords: ['여백 60%', '세리프', '브론즈', '얇은 선', '중앙 정렬'],
      palette: {
        bg: '#FAF8F3', surface: '#FFFFFF', ink: '#1A1815', sub: '#6E675C',
        line: '#E3DCCE', accent: '#6B5330', accentInk: '#FFF9EC', accentSoft: '#F3ECDD'
      },
      ratio: { bg: 60, surface: 30, accent: 10 },
      type: {
        base: 16, ratio: 1.414,
        family: { display: 'serif', body: 'sans', mono: 'mono' },
        roles: {
          display: { weight: 400, lineHeight: 1.12, tracking: '-0.01em', transform: 'none' },
          h1: { weight: 400, lineHeight: 1.2, tracking: '-0.005em', transform: 'none' },
          h2: { weight: 500, lineHeight: 1.35, tracking: '0.01em', transform: 'none' },
          lead: { weight: 300, lineHeight: 1.8, tracking: '0.01em', transform: 'none' },
          body: { weight: 300, lineHeight: 1.85, tracking: '0.01em', transform: 'none' },
          caption: { weight: 400, lineHeight: 1.5, tracking: '0.04em', transform: 'none' },
          micro: { weight: 500, lineHeight: 1.4, tracking: '0.22em', transform: 'uppercase' }
        }
      },
      layout: {
        unit: 8, columns: 4, gutter: 48, margin: 72, radius: 0, border: 1,
        shadow: 'none', density: 'very-low', imageRatio: '3:4', sectionGap: 96,
        maxWidth: 960, cta: { pos: 'inline-center', radius: 0, height: 52, minWidth: 220 },
        badge: { pos: 'bottom-center', style: 'minimal' }, grid: 'editorial-4'
      },
      fit: { '뷰티·패션': 0.98, '테크·IT': 0.35, '푸드·리빙': 0.8, '금융·B2B': 0.7, '숏폼 바이럴': 0.45 },
      moods: ['고급', '차분', '감성', '권위'],
      purposes: { cardnews: 0.86, detail: 0.92, saas: 0.3, proposal: 0.72 },
      rules: [
        '여백이 면적의 60% 이상. 요소를 늘리지 말고 줄인다.',
        '제목은 세리프 400 무게. 굵게 만들지 않는다.',
        '금속빛(bronze)은 1px 선, 1개 버튼, 작은 라벨에만.',
        '사진은 3:4, 배경은 같은 크림톤으로 통일.',
        '가격·스펙은 작은 캡션으로. 큰 글씨는 제목 하나뿐.'
      ],
      pin: { headlineChars: 20, bodyChars: 44, ctaLabel: '컬렉션 보기' },
      applies: {
        cardnews: '한 장에 한 문장. 5~6장 룩북형.',
        detail: '소재·공정 스토리 + 큰 제품 컷.',
        saas: '권장하지 않음.',
        proposal: '럭셔리·호텔·뷰티 제안서 표지에 적합.'
      }
    },
    {
      id: 'vivid-pop',
      name: '비비드 팝 카드',
      nameEn: 'Vivid Pop Card',
      tagline: '큰 숫자, 둥근 모서리, 장난스러운 강조.',
      origin: '인스타·핀터레스트 카드뉴스 상위 → 숏폼·이벤트·앱 프로모션 패턴',
      keywords: ['비비드', '라운딩 24', '큰 숫자', '이모지 없이', '배지'],
      palette: {
        bg: '#FFF9F2', surface: '#FFFFFF', ink: '#1B1B1F', sub: '#5F5B66',
        line: '#F0E3D6', accent: '#E0145A', accentInk: '#FFFFFF', accentSoft: '#FFE3EC'
      },
      ratio: { bg: 60, surface: 30, accent: 10 },
      type: {
        base: 17, ratio: 1.3,
        family: { display: 'rounded', body: 'sans', mono: 'mono' },
        roles: {
          display: { weight: 900, lineHeight: 1.0, tracking: '-0.03em', transform: 'none' },
          h1: { weight: 800, lineHeight: 1.12, tracking: '-0.025em', transform: 'none' },
          h2: { weight: 700, lineHeight: 1.28, tracking: '-0.01em', transform: 'none' },
          lead: { weight: 500, lineHeight: 1.55, tracking: '0em', transform: 'none' },
          body: { weight: 400, lineHeight: 1.65, tracking: '0em', transform: 'none' },
          caption: { weight: 500, lineHeight: 1.4, tracking: '0.01em', transform: 'none' },
          micro: { weight: 800, lineHeight: 1.25, tracking: '0.04em', transform: 'none' }
        }
      },
      layout: {
        unit: 8, columns: 6, gutter: 20, margin: 28, radius: 24, border: 0,
        shadow: '0 10px 30px -10px rgba(224,20,90,.25)', density: 'low',
        imageRatio: '4:5', sectionGap: 56, maxWidth: 1080,
        cta: { pos: 'bottom-right', radius: 999, height: 56, minWidth: 196 },
        badge: { pos: 'top-right', style: 'pill-solid' }, grid: 'cards-6'
      },
      fit: { '뷰티·패션': 0.9, '테크·IT': 0.55, '푸드·리빙': 0.8, '금융·B2B': 0.3, '숏폼 바이럴': 0.98 },
      moods: ['발랄', '친근', '임팩트', '젊은'],
      purposes: { cardnews: 0.98, detail: 0.62, saas: 0.5, proposal: 0.28 },
      rules: [
        '한 장에 숫자 1개를 크게(display). 나머지는 작게.',
        '라운딩 24px 하나만. 카드 안 버튼은 알약(999px).',
        'accent는 숫자·배지·CTA에만. 배경 전체를 칠하지 않는다.',
        '이모지는 쓰지 않는다. 아이콘보다 큰 숫자와 짧은 문장.',
        '3장마다 배지(“3일 남음”)를 넣어 리듬을 만든다.'
      ],
      pin: { headlineChars: 22, bodyChars: 44, ctaLabel: '확인하기' },
      applies: {
        cardnews: '표지 숫자 1개 + 3~7장 카드. 장마다 배지.',
        detail: '혜택·이벤트 상단에만. 스펙 구간은 화이트로.',
        saas: '온보딩·프로모션 배너에 제한 적용.',
        proposal: '권장하지 않음.'
      }
    }
  ];

  var PRESET_INDEX = (function () {
    var m = {};
    PRESETS.forEach(function (p) { m[p.id] = p; });
    return m;
  })();

  /* ==========================================================
     3. 폰트 스택 · 타이포 계산
     ========================================================== */

  var FONT_STACKS = {
    sans: '"Pretendard", "Pretendard Variable", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Helvetica Neue", Arial, sans-serif',
    serif: '"Nanum Myeongjo", "Noto Serif KR", "Apple SD Gothic Neo", Georgia, "Times New Roman", serif',
    mono: '"JetBrains Mono", "D2Coding", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
    rounded: '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Trebuchet MS", system-ui, sans-serif'
  };

  function fontStack(role) {
    return FONT_STACKS[role] || FONT_STACKS.sans;
  }

  /** 프리셋의 완성된 타이포 위계(px·행간 px·자간 em) */
  function typography(preset) {
    var p = get(preset);
    var scale = typeScale(p.type.base, p.type.ratio);
    var roles = {};
    ROLE_ORDER.forEach(function (role) {
      var conf = p.type.roles[role];
      var size = scale[role];
      roles[role] = {
        size: size,
        lineHeight: Math.round(size * conf.lineHeight),
        lineHeightRatio: conf.lineHeight,
        tracking: conf.tracking,
        weight: conf.weight,
        transform: conf.transform,
        family: fontStack(
          role === 'micro' || role === 'caption'
            ? p.type.family.body
            : (role === 'display' || role === 'h1' || role === 'h2' ? p.type.family.display : p.type.family.body)
        )
      };
    });
    return {
      base: scale.base,
      ratio: scale.ratio,
      sizes: scale,
      roles: roles,
      hierarchy: {
        displayToBody: round(roles.display.size / roles.body.size, 2),
        h1ToBody: round(roles.h1.size / roles.body.size, 2),
        bodyToCaption: round(roles.body.size / roles.caption.size, 2)
      }
    };
  }

  /* ==========================================================
     4. 대비 검증
     ========================================================== */

  var CONTRAST_PAIRS = [
    { id: 'ink-bg', fg: 'ink', bg: 'bg', kind: 'text', label: '본문/제목 · 배경' },
    { id: 'ink-surface', fg: 'ink', bg: 'surface', kind: 'text', label: '본문/제목 · 카드' },
    { id: 'sub-bg', fg: 'sub', bg: 'bg', kind: 'text', label: '보조텍스트 · 배경' },
    { id: 'sub-surface', fg: 'sub', bg: 'surface', kind: 'text', label: '보조텍스트 · 카드' },
    { id: 'accentInk-accent', fg: 'accentInk', bg: 'accent', kind: 'text', label: 'CTA 글자 · CTA 배경' },
    { id: 'sub-accentSoft', fg: 'sub', bg: 'accentSoft', kind: 'text', label: '보조텍스트 · 강조 틴트' },
    { id: 'accent-bg', fg: 'accent', bg: 'bg', kind: 'ui', label: 'CTA 면 · 배경' },
    { id: 'ink-accentSoft', fg: 'ink', bg: 'accentSoft', kind: 'text', label: '본문 · 강조 틴트' }
  ];

  /**
   * 대비 리포트.
   * accent-bg(면 vs 배경)는 WCAG 1.4.11 비텍스트 대비 3:1을 요구하되,
   * 테두리가 2px 이상이고 테두리색이 배경·면 양쪽에서 3:1을 넘으면
   * 경계를 테두리가 만들므로 통과로 본다(네오 브루탈리즘 등).
   */
  function contrastReport(preset) {
    var p = get(preset);
    var borderBoundary = p.layout.border >= 2 &&
      contrastRatio(p.palette.ink, p.palette.bg) >= 4.5 &&
      contrastRatio(p.palette.ink, p.palette.accent) >= 3;

    return CONTRAST_PAIRS.map(function (pair) {
      var fg = p.palette[pair.fg];
      var bg = p.palette[pair.bg];
      var ratio = contrastRatio(fg, bg);
      var required = pair.kind === 'text' ? 4.5 : 3;
      var byBorder = pair.id === 'accent-bg' && borderBoundary && ratio < required;
      var pass = ratio >= required || byBorder;
      return {
        id: pair.id,
        label: pair.label,
        kind: pair.kind,
        fg: fg,
        bg: bg,
        ratio: ratio,
        required: required,
        level: pass && byBorder ? 'AA-border' : wcagLevel(ratio, pair.kind === 'ui'),
        pass: pass,
        boundary: byBorder ? 'border' : 'color',
        grade: byBorder ? 'AA-border' : (ratio >= 7 ? 'AAA' : (ratio >= 4.5 ? 'AA' : (ratio >= required ? 'AA-' + pair.kind : 'fail')))
      };
    });
  }

  function allContrastPass(preset) {
    return contrastReport(preset).every(function (r) { return r.pass; });
  }

  /* ==========================================================
     5. 조회 · 추천
     ========================================================== */

  function get(preset) {
    if (typeof preset === 'string') {
      if (!PRESET_INDEX[preset]) throw new Error('unknown preset: ' + preset);
      return PRESET_INDEX[preset];
    }
    if (preset && preset.id && PRESET_INDEX[preset.id]) return PRESET_INDEX[preset.id];
    if (preset && preset.palette && preset.type) return preset;
    throw new Error('invalid preset');
  }

  function list() {
    return PRESETS.map(function (p) {
      return {
        id: p.id, name: p.name, nameEn: p.nameEn, tagline: p.tagline,
        structure: p.dna ? p.dna.layout.structure : null,
        imageRatio: p.dna ? p.dna.image.ratio : null,
        displayFamily: p.dna ? p.dna.type.displayFamily : null,
        defaultRisk: p.defaultRisk ? p.defaultRisk.risk : null,
        keywords: p.keywords.slice(), moods: p.moods.slice(),
        fit: Object.assign({}, p.fit), purposes: Object.assign({}, p.purposes),
        accent: p.palette.accent, bg: p.palette.bg
      };
    });
  }

  var INDUSTRIES = ['뷰티·패션', '테크·IT', '푸드·리빙', '금융·B2B', '숏폼 바이럴'];
  var PURPOSE_KEYS = { '카드뉴스': 'cardnews', '상세페이지': 'detail', 'SaaS UI': 'saas', 'saas': 'saas', '제안서': 'proposal' };

  function normalizeIndustry(v) {
    var s = String(v || '').replace(/\s/g, '');
    if (/뷰티|패션|beauty|fashion|화장|코스메/.test(s)) return '뷰티·패션';
    if (/테크|IT|it|개발|saas|SaaS|소프트웨어|앱/.test(s)) return '테크·IT';
    if (/푸드|리빙|food|living|식품|요리|인테리어|생활/.test(s)) return '푸드·리빙';
    if (/금융|B2B|b2b|핀테크|보험|은행|제안|공공/.test(s)) return '금융·B2B';
    if (/숏폼|바이럴|viral|쇼츠|릴스|틱톡|인스타/.test(s)) return '숏폼 바이럴';
    return null;
  }

  /**
   * 업종·목적·무드로 프리셋 추천.
   * @returns {Array<{id,name,score,reasons}>} 점수 내림차순
   */
  function recommend(industry, mood, purpose) {
    var ind = normalizeIndustry(industry) || '테크·IT';
    var pkey = PURPOSE_KEYS[String(purpose || '').trim()] || null;
    var moodStr = String(mood || '');
    var results = PRESETS.map(function (p) {
      var reasons = [];
      var score = (p.fit[ind] || 0.4) * 1.0;
      reasons.push(ind + ' 적합도 ' + Math.round((p.fit[ind] || 0) * 100) + '%');

      if (pkey) {
        score += (p.purposes[pkey] || 0.4) * 0.7;
        reasons.push(purpose + ' 적합도 ' + Math.round((p.purposes[pkey] || 0) * 100) + '%');
      }
      if (moodStr) {
        var hit = p.moods.some(function (m) { return moodStr.indexOf(m) >= 0 || m.indexOf(moodStr) >= 0; });
        var partial = p.moods.some(function (m) { return moodStr.indexOf(m.slice(0, 1)) >= 0; });
        if (hit) { score += 0.3; reasons.push('무드 “' + moodStr + '” 일치'); }
        else if (partial) { score += 0.08; }
      }
      if (allContrastPass(p)) { score += 0.05; reasons.push('WCAG AA 전 항목 통과'); }
      return { id: p.id, name: p.name, score: round(score, 3), reasons: reasons };
    });
    results.sort(function (a, b) { return b.score - a.score || a.id.localeCompare(b.id); });
    return results;
  }

  /** 추천 1순위 */
  function pick(industry, mood, purpose) {
    return recommend(industry, mood, purpose)[0];
  }

/* ============================================================
   design-context-extension.js  (temporary build block)
   ============================================================ */
  /* ==========================================================
     5-B. 스타일 DNA 확장 데이터
     ----------------------------------------------------------
     프리셋 정의는 팔레트·타이포·레이아웃까지 담고 있다.
     여기서는 "추천"과 "적용"에 필요한 축(밀도 적합도·신뢰도·
     장식 DNA·계열·AI 기본값 위험)을 덧붙인다.
     ========================================================== */

  var PRESET_EXTRA = {
    'swiss-magazine': {
      family: 'grid',
      densityFit: { low: 0.72, medium: 0.9, high: 1.0 },
      trust: 0.95, warmth: 0.35, energy: 0.45,
      decoration: {
        type: 'hairline-grid', radius: 0, shadow: 'none', border: 1,
        motifs: ['1px 괘선', '좌상단 섹션 번호', '원색 1점'],
        accentUse: '제목 한 단어 또는 CTA 1곳'
      }
    },
    'bento-saas': {
      family: 'bento',
      densityFit: { low: 0.7, medium: 0.95, high: 0.62 },
      trust: 0.8, warmth: 0.5, energy: 0.6,
      decoration: {
        type: 'bento-cards', radius: 20, shadow: 'soft', border: 1,
        motifs: ['2×2 앵커 카드', '1×1 새틀라이트', '24px 거터'],
        accentUse: 'CTA 버튼과 지표 1개'
      }
    },
    'cream-editorial': {
      family: 'editorial',
      densityFit: { low: 1.0, medium: 0.6, high: 0.32 },
      trust: 0.55, warmth: 0.95, energy: 0.4,
      decoration: {
        type: 'paper', radius: 4, shadow: 'soft', border: 1,
        motifs: ['필름톤 사진', '세리프 제목', '넓은 행간'],
        accentUse: '가격·기한·링크'
      }
    },
    'dark-neon': {
      family: 'dark',
      densityFit: { low: 0.8, medium: 0.9, high: 0.6 },
      trust: 0.45, warmth: 0.2, energy: 0.95,
      decoration: {
        type: 'glow', radius: 12, shadow: 'glow', border: 1,
        motifs: ['네온 1색', '모노 라벨', '상단 2px 룬'],
        accentUse: '핵심 수치와 CTA에만'
      }
    },
    'commerce-clean': {
      family: 'commerce',
      densityFit: { low: 0.82, medium: 0.95, high: 0.55 },
      trust: 0.85, warmth: 0.6, energy: 0.55,
      decoration: {
        type: 'clean', radius: 8, shadow: 'hairline', border: 1,
        motifs: ['상품 1컷', '가격 3단', '하단 고정 CTA'],
        accentUse: '가격·배지·구매 버튼'
      }
    },
    'neo-brutalism': {
      family: 'brutal',
      densityFit: { low: 0.75, medium: 0.85, high: 0.7 },
      trust: 0.3, warmth: 0.55, energy: 0.9,
      decoration: {
        type: 'hard-shadow', radius: 0, shadow: 'hard', border: 3,
        motifs: ['3px 검정 테두리', '6px 하드 섀도', '모노 번호'],
        accentUse: '강조 박스와 버튼'
      }
    },
    'minimal-luxury': {
      family: 'editorial',
      densityFit: { low: 1.0, medium: 0.45, high: 0.2 },
      trust: 0.88, warmth: 0.55, energy: 0.25,
      decoration: {
        type: 'space', radius: 0, shadow: 'none', border: 1,
        motifs: ['여백 60%', '세리프 400', '금속빛 1px'],
        accentUse: '버튼 1개와 라벨'
      }
    },
    'vivid-pop': {
      family: 'pop',
      densityFit: { low: 0.95, medium: 0.7, high: 0.35 },
      trust: 0.35, warmth: 0.75, energy: 0.9,
      decoration: {
        type: 'sticker', radius: 24, shadow: 'soft', border: 0,
        motifs: ['큰 숫자 1개', '알약 CTA', '배지 리듬'],
        accentUse: '숫자·배지·CTA'
      }
    }
  };

  /** 계열별 대표(다양성 확보용) */
  var FAMILY_LABEL = {
    grid: '격자·타이포', bento: '카드 모자이크', editorial: '에디토리얼',
    dark: '다크·네온', commerce: '커머스', brutal: '브루탈', pop: '팝'
  };

  /** AI 기본값(보라/파랑 + 둥근 카드 + 소프트 섀도) 위험도 */
  function computeDefaultRisk(p) {
    var reasons = [];
    var risk = 0;
    var c = hexToRgb(p.palette.accent);
    var hsl = rgbToHsl(c);
    if (hsl.h >= 210 && hsl.h <= 285 && hsl.s > 0.35) {
      risk += 0.5;
      reasons.push('포인트 색이 파랑·보라 계열(hue ' + Math.round(hsl.h) + '°)');
    }
    if (p.layout.radius >= 16) { risk += 0.2; reasons.push('라운딩 ' + p.layout.radius + 'px'); }
    if (/rgba|soft|glow/.test(String(p.layout.shadow)) && !/0 [0-9]+px 0/.test(String(p.layout.shadow))) {
      risk += 0.15; reasons.push('소프트 섀도');
    }
    if (/^#F[0-9A-F]{5}$/i.test(p.palette.bg) && /^#FFFFFF$/i.test(p.palette.surface)) {
      risk += 0.1; reasons.push('밝은 회색 배경 + 흰 카드');
    }
    return { risk: Math.min(1, round(risk, 2)), reasons: reasons.slice(0, 3) };
  }

  PRESETS.forEach(function (p) {
    var extra = PRESET_EXTRA[p.id] || {};
    Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
    p.defaultRisk = computeDefaultRisk(p);
    p.ratio = { bg: 60, surface: 30, accent: 10 };
  });

  /* ==========================================================
     5-C. HSL 유틸 · 팔레트 추출
     ========================================================== */

  function rgbToHsl(rgb) {
    var r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    var d = max - min;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: s, l: l };
  }

  function hslToRgb(hsl) {
    var h = ((hsl.h % 360) + 360) % 360 / 360;
    var s = clamp(hsl.s, 0, 1), l = clamp(hsl.l, 0, 1);
    if (s === 0) {
      var v = Math.round(l * 255);
      return { r: v, g: v, b: v };
    }
    function hue2rgb(p, q, t) {
      var tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return {
      r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      g: Math.round(hue2rgb(p, q, h) * 255),
      b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
    };
  }

  function withLightness(hex, l) {
    var hsl = rgbToHsl(hexToRgb(hex));
    hsl.l = clamp(l, 0, 1);
    return rgbToHex(hslToRgb(hsl));
  }

  function shiftLightness(hex, delta) {
    var hsl = rgbToHsl(hexToRgb(hex));
    return withLightness(hex, hsl.l + delta);
  }

  function colorDistance(a, b) {
    var ca = hexToRgb(a), cb = hexToRgb(b);
    var dr = (ca.r - cb.r) / 255, dg = (ca.g - cb.g) / 255, db = (ca.b - cb.b) / 255;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  /** 대비가 4.5:1이 될 때까지 밝기를 조금씩 민다. */
  function ensureContrast(fg, bg, min, prefer) {
    var target = min || 4.5;
    if (contrastRatio(fg, bg) >= target) return fg;
    var first = prefer || (relativeLuminance(bg) > 0.4 ? '#000000' : '#FFFFFF');
    var second = first === '#000000' ? '#FFFFFF' : '#000000';
    var dirs = [first, second];
    for (var d = 0; d < dirs.length; d++) {
      for (var i = 1; i <= 20; i++) {
        var mixed = mix(fg, dirs[d], i / 20);
        if (contrastRatio(mixed, bg) >= target) return mixed;
      }
    }
    // 어떤 방향으로도 도달할 수 없으면 더 나은 극단을 돌려준다.
    return contrastRatio(dirs[0], bg) >= contrastRatio(dirs[1], bg) ? dirs[0] : dirs[1];
  }

  /** 팔레트의 모든 텍스트 조합을 WCAG에 맞춰 보정한다. */
  function hardenPalette(pal) {
    var bgL = relativeLuminance(pal.bg);
    var surfL = relativeLuminance(pal.surface);
    pal.ink = ensureContrast(pal.ink, pal.bg, 7, bgL > 0.5 ? '#000000' : '#FFFFFF');
    pal.ink = ensureContrast(pal.ink, pal.surface, 7, surfL > 0.5 ? '#000000' : '#FFFFFF');
    pal.sub = ensureContrast(pal.sub, pal.bg, 4.5, bgL > 0.5 ? '#000000' : '#FFFFFF');
    pal.sub = ensureContrast(pal.sub, pal.surface, 4.5, surfL > 0.5 ? '#000000' : '#FFFFFF');
    pal.ink = ensureContrast(pal.ink, pal.accentSoft, 4.5, relativeLuminance(pal.accentSoft) > 0.5 ? '#000000' : '#FFFFFF');
    pal.sub = ensureContrast(pal.sub, pal.accentSoft, 4.5, relativeLuminance(pal.accentSoft) > 0.5 ? '#000000' : '#FFFFFF');
    pal.accentInk = ensureContrast(pal.accentInk, pal.accent, 4.5,
      contrastRatio('#FFFFFF', pal.accent) >= contrastRatio('#000000', pal.accent) ? '#FFFFFF' : '#000000');
    if (contrastRatio(pal.accent, pal.bg) < 3) {
      pal.accent = ensureContrast(pal.accent, pal.bg, 3, bgL > 0.5 ? '#000000' : '#FFFFFF');
    }
    return pal;
  }

  /**
   * RGBA 픽셀 배열에서 대표 컬러를 뽑아 테마 팔레트로 변환한다.
   * 브라우저에서는 ctx.getImageData(...).data 를 그대로 넣으면 된다.
   *
   * @param {ArrayLike<number>} pixels [r,g,b,a, ...]
   * @param {object} [opts]
   *   alphaMin=128, step(자동), maxColors=8, name
   * @returns {{ok:boolean, reason?:string, palette?, raw?, contrast?, confidence?, isDefaultLook?}}
   */
  function extractPaletteFromPixels(pixels, opts) {
    opts = opts || {};
    if (!pixels || typeof pixels.length !== 'number') {
      throw new TypeError('pixels must be an array-like RGBA buffer');
    }
    var len = pixels.length;
    if (len % 4 !== 0) throw new Error('RGBA buffer length must be a multiple of 4 (got ' + len + ')');

    var alphaMin = opts.alphaMin === undefined ? 128 : opts.alphaMin;
    var pixelCount = len / 4;
    var step = opts.step || Math.max(1, Math.floor(pixelCount / 200000));

    var buckets = Object.create(null);
    var used = 0, sampled = 0;
    for (var i = 0; i < len; i += 4 * step) {
      sampled++;
      var a = pixels[i + 3];
      if (a < alphaMin) continue;
      var r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      var key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      var bk = buckets[key];
      if (!bk) bk = buckets[key] = { n: 0, r: 0, g: 0, b: 0 };
      bk.n++; bk.r += r; bk.g += g; bk.b += b;
      used++;
    }
    if (!used) {
      return { ok: false, reason: 'no-opaque-pixels', sampled: sampled, pixels: pixelCount };
    }

    var raw = Object.keys(buckets).map(function (k) {
      var b = buckets[k];
      var rgb = { r: b.r / b.n, g: b.g / b.n, b: b.b / b.n };
      var hex = rgbToHex(rgb);
      var hsl = rgbToHsl(rgb);
      return { hex: hex, count: b.n, share: round(b.n / used, 4), hsl: { h: round(hsl.h, 1), s: round(hsl.s, 3), l: round(hsl.l, 3) } };
    }).sort(function (x, y) {
      return y.count - x.count || (x.hex < y.hex ? -1 : x.hex > y.hex ? 1 : 0);
    });

    var maxColors = opts.maxColors || 8;
    var top = raw.slice(0, maxColors);

    var bgEntry = raw[0];
    var bg = bgEntry.hex;
    var bgLum = relativeLuminance(bg);

    // 서피스: 배경 다음으로 면적이 넓고, 배경과 살짝 구분되는 색
    var surface = null;
    for (var s = 1; s < raw.length && s < 10; s++) {
      var cand = raw[s];
      if (cand.share < 0.03) break;
      if (colorDistance(cand.hex, bg) > 0.02) { surface = cand.hex; break; }
    }
    if (!surface) surface = bgLum > 0.5 ? mix(bg, '#FFFFFF', 0.65) : mix(bg, '#FFFFFF', 0.08);

    // 포인트: 채도가 있고 배경과 떨어진 색 중 면적이 있는 것
    var accent = null, accentScore = 0;
    raw.slice(0, 14).forEach(function (c) {
      if (c.hex === bg || c.share < 0.004) return;
      if (c.hsl.s < 0.18) return;
      var dist = colorDistance(c.hex, bg);
      if (dist < 0.08) return;
      var score = c.hsl.s * (0.5 + Math.min(1, dist)) * (0.6 + Math.min(1, c.share * 8));
      if (score > accentScore) { accentScore = score; accent = c.hex; }
    });
    var accentFound = !!accent;
    if (!accent) {
      // 단색 이미지: 배경에서 파생
      accent = bgLum > 0.5 ? withLightness(bg, Math.max(0.18, rgbToHsl(hexToRgb(bg)).l - 0.45)) : withLightness(bg, 0.7);
      if (colorDistance(accent, bg) < 0.1) accent = bgLum > 0.5 ? '#1F2937' : '#F5F5F5';
    }

    // 포인트가 배경과 3:1 미만이면(단색 이미지 등) 경계가 보이도록 보정
    if (contrastRatio(accent, bg) < 3) {
      accent = ensureContrast(accent, bg, 3, bgLum > 0.5 ? '#000000' : '#FFFFFF');
    }

    // 잉크: 대비가 크되 채도가 낮은 색(사진 속 포인트색이 글자색이 되지 않게)
    var ink = null, inkScore = -1;
    raw.slice(0, 20).forEach(function (c) {
      if (c.share < 0.002) return;
      if (c.hex === bg) return;
      var ratio = contrastRatio(c.hex, bg);
      var score = ratio - c.hsl.s * 4;
      if (score > inkScore) { inkScore = score; ink = c.hex; }
    });
    if (!ink || contrastRatio(ink, bg) < 4.5) {
      ink = contrastRatio('#111111', bg) >= contrastRatio('#FFFFFF', bg) ? '#111111' : '#FFFFFF';
    }
    ink = ensureContrast(ink, bg, 7, bgLum > 0.5 ? '#000000' : '#FFFFFF');

    // 보조 텍스트: 잉크와 배경 사이 톤, 없으면 잉크를 배경 쪽으로
    var sub = null;
    var targetL = (relativeLuminance(ink) * 0.35 + bgLum * 0.65);
    var bestGap = 1;
    raw.slice(0, 16).forEach(function (c) {
      if (c.hex === bg || c.hex === ink) return;
      if (c.hsl.s > 0.5) return; // 형광 보조 텍스트는 피한다
      var gap = Math.abs(relativeLuminance(c.hex) - targetL);
      if (gap < bestGap && c.share >= 0.003) { bestGap = gap; sub = c.hex; }
    });
    if (!sub) sub = mix(ink, bg, 0.45);
    sub = ensureContrast(sub, bg, 4.5, bgLum > 0.5 ? '#000000' : '#FFFFFF');

    var line = mix(bg, ink, 0.14);
    var accentInk = contrastRatio('#FFFFFF', accent) >= contrastRatio('#111111', accent) ? '#FFFFFF' : '#111111';
    accentInk = ensureContrast(accentInk, accent, 4.5, contrastRatio('#FFFFFF', accent) > contrastRatio('#111111', accent) ? '#FFFFFF' : '#000000');
    var accentSoft = mix(accent, bg, 0.88);

    var palette = hardenPalette({
      bg: bg, surface: surface, ink: ink, sub: sub, line: line,
      accent: accent, accentInk: accentInk, accentSoft: accentSoft
    });

    var checks = {
      inkBg: contrastRatio(ink, bg),
      subBg: contrastRatio(sub, bg),
      accentInkAccent: contrastRatio(accentInk, accent),
      accentBg: contrastRatio(accent, bg)
    };
    var allPass = checks.inkBg >= 4.5 && checks.subBg >= 4.5 && checks.accentInkAccent >= 4.5;

    var coverage = raw.slice(0, 3).reduce(function (sum, c) { return sum + c.share; }, 0);
    var confidence = clamp(coverage * 0.7 + (raw.length > 1 ? 0.15 : 0) + (accentFound ? 0.15 : 0), 0, 1);
    if (!accentFound) confidence *= 0.6;
    confidence = round(confidence, 2);

    return {
      ok: true,
      method: 'quantize-5bit',
      pixels: pixelCount,
      sampled: sampled,
      used: used,
      step: step,
      palette: palette,
      raw: top,
      colors: top.map(function (c) { return c.hex; }),
      contrast: checks,
      allPass: allPass,
      confidence: confidence,
      isDefaultLook: detectDefaultLook({ palette: palette }),
      notes: [
        '배경은 가장 넓은 면적 색, 포인트는 채도×면적×거리 점수가 가장 높은 색을 골랐습니다.',
        '잉크·보조 텍스트는 WCAG 4.5:1을 넘도록 자동 보정했습니다.'
      ]
    };
  }

  /** 브라우저 ImageData 를 바로 받는 헬퍼 */
  function paletteFromImageData(imageData, opts) {
    if (!imageData || !imageData.data) throw new TypeError('ImageData with .data required');
    return extractPaletteFromPixels(imageData.data, opts);
  }

  /** 팔레트 또는 프리셋을 받아 "AI 기본값" 위험도 계산 */
  function detectDefaultLook(input) {
    var palette, layout;
    if (input && input.palette) { palette = input.palette; layout = input.layout || {}; }
    else if (input && input.accent) { palette = input; layout = {}; }
    else throw new Error('palette or preset required');

    var reasons = [];
    var risk = 0;
    var hsl = rgbToHsl(hexToRgb(palette.accent));
    if (hsl.h >= 210 && hsl.h <= 285 && hsl.s > 0.35) {
      risk += 0.5; reasons.push('포인트 색이 보라·파랑 계열(hue ' + Math.round(hsl.h) + '°)');
    }
    if ((layout.radius || 0) >= 16) { risk += 0.2; reasons.push('큰 라운딩(' + layout.radius + 'px)'); }
    if (/rgba|soft|glow/.test(String(layout.shadow || ''))) { risk += 0.15; reasons.push('소프트 섀도'); }
    if (/^#F[0-9A-F]{5}$/i.test(palette.bg || '') && /^#FFFFFF$/i.test(palette.surface || '')) {
      risk += 0.1; reasons.push('회색 배경 + 흰 카드');
    }
    risk = Math.min(1, round(risk, 2));
    return {
      risk: risk,
      flagged: risk >= 0.6,
      label: risk >= 0.8 ? '전형적인 AI 기본 디자인' : (risk >= 0.6 ? 'AI 기본값에 가까움' : '개성 있음'),
      reasons: reasons
    };
  }

  /* ==========================================================
     5-D. 콘텐츠 맥락 분석
     ========================================================== */

  var INDUSTRY_HINTS = [
    { key: '뷰티·패션', re: /피부|세럼|화장|크림|향수|뷰티|헤어|네일|옷|코디|스타일|가방|신발|에센스|선크림/g },
    { key: '테크·IT', re: /앱|SaaS|saas|API|자동화|대시보드|개발|서버|AI|구독|플랫폼|프로그램|노코드|데이터베이스/g },
    { key: '푸드·리빙', re: /맛|식감|원산지|레시피|요리|식품|카페|디저트|수납|청소|인테리어|가구|주방|생활용품|호텔|리조트|숙소|여행/g },
    { key: '금융·B2B', re: /대출|보험|금융|투자|세금|계약|견적|제안서|B2B|b2b|공공|법인|보고서|정책|예산/g },
    { key: '숏폼 바이럴', re: /챌린지|밈|숏폼|릴스|틱톡|이벤트|giveaway|바이럴|떡상|조회수/g }
  ];

  var MOOD_HINTS = [
    { key: '고급', re: /프리미엄|고급|럭셔리|한정|호텔|명품|오브제|금속/g },
    { key: '따뜻함', re: /따뜻|포근|가족|일상|감성|아침|주말|손편지/g },
    { key: '정밀', re: /데이터|실측|인증|기준|분석|측정|연구|임상|정확/g },
    { key: '임팩트', re: /충격|반전|경고|마감|지금|폭발|역대|단독/g },
    { key: '발랄', re: /재미|웃음|선물|이벤트|발랄|신나는|놀이|팝/g }
  ];

  function countHint(text, re) {
    var m = String(text).match(new RegExp(re.source, 'g'));
    return m ? m.length : 0;
  }

  function analyzeDensity(text) {
    var t = String(text || '');
    var chars = Array.from ? Array.from(t).length : t.length;
    var sentences = t.split(/[.!?。！？\n]+/).filter(function (s) { return s.trim(); }).length;
    var bullets = (t.match(/(^|\n)\s*([-•*]|\d+[.)])\s/g) || []).length;
    var numbers = (t.match(/\d[\d,.]*/g) || []).length;
    var score = chars / 520 + bullets / 6 + numbers / 12 + sentences / 14;
    var level = score >= 1.15 ? 'high' : (score >= 0.5 ? 'medium' : 'low');
    return {
      level: level, score: round(score, 2), chars: chars, sentences: sentences,
      bullets: bullets, numbers: numbers,
      note: level === 'high' ? '텍스트가 많아 정보형 레이아웃이 필요합니다.'
        : level === 'low' ? '한 문장 중심이라 임팩트형 레이아웃이 어울립니다.'
          : '텍스트와 여백의 균형이 필요한 분량입니다.'
    };
  }

  /**
   * 콘텐츠 맥락 분석. 넘긴 값이 있으면 그 값을 우선한다.
   * @param {object|string} ctx { text,title,body,industry,purpose,mood,density }
   */
  function analyzeContentContext(ctx) {
    if (typeof ctx === 'string') ctx = { text: ctx };
    ctx = ctx || {};
    var text = [ctx.title, ctx.body, ctx.text, ctx.product, ctx.problem, ctx.solution, ctx.keywords]
      .filter(Boolean).join(' ');
    if (!text && ctx.industry) text = ctx.industry;

    var industry = normalizeIndustry(ctx.industry) || null;
    var industryScores = {};
    if (!industry && text) {
      INDUSTRY_HINTS.forEach(function (h) {
        industryScores[h.key] = countHint(text, h.re);
      });
      var best = Object.keys(industryScores).sort(function (a, b) {
        return industryScores[b] - industryScores[a] || a.localeCompare(b);
      })[0];
      if (best && industryScores[best] > 0) industry = best;
    }
    if (!industry) industry = '테크·IT';

    var mood = ctx.mood || ctx.emotion || null;
    var moodScores = {};
    if (!mood && text) {
      MOOD_HINTS.forEach(function (h) { moodScores[h.key] = countHint(text, h.re); });
      var bestMood = Object.keys(moodScores).sort(function (a, b) {
        return moodScores[b] - moodScores[a] || a.localeCompare(b);
      })[0];
      if (bestMood && moodScores[bestMood] > 0) mood = bestMood;
    }
    if (!mood) mood = '정돈';

    var density = analyzeDensity(ctx.density === 'string' ? text : (ctx.body || ctx.text || text));
    if (ctx.density === 'low' || ctx.density === 'medium' || ctx.density === 'high') density.level = ctx.density;

    var commerceSignals = countHint(text, /가격|원|할인|구매|배송|재구매|쿠팡|스마트스토어|장바구니|세일|특가/g);
    var trustSignals = countHint(text, /인증|데이터|실측|계약|견적|보고서|보험|의료|금융|공공|연구|임상/g);
    var urgencySignals = countHint(text, /마감|한정|선착순|오늘|D-\d|품절/g);
    var proofNumbers = (text.match(/\d[\d,.]*\s*(%|명|건|원|배|분|초|개|위)/g) || []).length;

    var commerceIntent = clamp(commerceSignals / 4 + (industry === '뷰티·패션' || industry === '푸드·리빙' ? 0.2 : 0), 0, 1);
    var trustNeed = clamp(trustSignals / 3 + (industry === '금융·B2B' ? 0.45 : 0) + (industry === '테크·IT' ? 0.1 : 0), 0, 1);
    var energy = clamp(urgencySignals / 3 + (/발랄|임팩트/.test(mood) ? 0.3 : 0) + (industry === '숏폼 바이럴' ? 0.4 : 0), 0, 1);
    var premiumSignals = countHint(text, /프리미엄|럭셔리|고급|명품|한정판|호텔|리조트|스위트/g);
    var premium = clamp(premiumSignals / 2 + (/고급|럭셔리|프리미엄/.test(mood) ? 0.4 : 0) +
      (industry === '뷰티·패션' ? 0.15 : 0), 0, 1);

    var purpose = ctx.purpose || null;
    var purposeKey = PURPOSE_KEYS[String(purpose || '').trim()] || null;
    if (!purposeKey) {
      if (/카드|핀|썸네일/.test(text)) purposeKey = 'cardnews';
      else if (/상세|구매|배송/.test(text) || commerceSignals >= 2) purposeKey = 'detail';
      else if (/SaaS|대시보드|기능|요금제/.test(text)) purposeKey = 'saas';
      else if (/제안|견적|보고|정책|예산/.test(text)) purposeKey = 'proposal';
      else purposeKey = 'cardnews';
    }

    return {
      industry: industry,
      industryScores: industryScores,
      mood: mood,
      moodScores: moodScores,
      purpose: purposeKey,
      purposeLabel: Object.keys(PURPOSE_KEYS).filter(function (k) { return PURPOSE_KEYS[k] === purposeKey; })[0] || purposeKey,
      density: density,
      signals: {
        commerceIntent: round(commerceIntent, 2),
        trustNeed: round(trustNeed, 2),
        energy: round(energy, 2),
        premium: round(premium, 2),
        proofNumbers: proofNumbers,
        urgency: urgencySignals
      },
      keywords: (text.match(/[가-힣A-Za-z]{2,}/g) || []).filter(function (w, i, a) { return a.indexOf(w) === i; }).slice(0, 12)
    };
  }

  /* ==========================================================
     5-E. 맥락 기반 레퍼런스 추천 (3~4안)
     ========================================================== */

  var RECOMMEND_WEIGHTS = { industry: 0.3, purpose: 0.18, mood: 0.14, density: 0.12, trust: 0.1, distinct: 0.1, a11y: 0.06 };

  function scorePresetForContext(p, ctx) {
    var reasons = [];
    var axes = {};

    axes.industry = p.fit[ctx.industry] === undefined ? 0.45 : p.fit[ctx.industry];
    if (axes.industry >= 0.8) reasons.push({ axis: 'industry', text: ctx.industry + ' 적합도 ' + Math.round(axes.industry * 100) + '%' });

    axes.purpose = p.purposes[ctx.purpose] === undefined ? 0.45 : p.purposes[ctx.purpose];
    if (axes.purpose >= 0.85) reasons.push({ axis: 'purpose', text: '목적 적합도 ' + Math.round(axes.purpose * 100) + '% (' + ctx.purposeLabel + ')' });

    var moodHit = p.moods.some(function (m) { return ctx.mood.indexOf(m) >= 0 || m.indexOf(ctx.mood) >= 0; });
    axes.mood = moodHit ? 1 : 0.35;
    if (moodHit) reasons.push({ axis: 'mood', text: '무드 “' + ctx.mood + '” 일치' });

    axes.density = (p.densityFit && p.densityFit[ctx.density.level]) || 0.5;
    if (axes.density >= 0.85) reasons.push({ axis: 'density', text: '텍스트 밀도 ' + ctx.density.level + '에 적합' });

    axes.trust = p.trust === undefined ? 0.5 : p.trust;
    if (ctx.signals.trustNeed >= 0.6 && axes.trust >= 0.85) reasons.push({ axis: 'trust', text: '신뢰·근거 중심 콘텐츠에 강함' });
    if (ctx.signals.commerceIntent >= 0.6 && p.id === 'commerce-clean') reasons.push({ axis: 'trust', text: '가격·구매 신호가 많아 커머스 구조가 맞음' });

    axes.distinct = 1 - p.defaultRisk.risk;
    if (p.defaultRisk.risk >= 0.6) reasons.push({ axis: 'distinct', text: '주의: ' + p.defaultRisk.reasons[0] + ' — AI 기본값처럼 보일 수 있음' });
    else if (p.defaultRisk.risk <= 0.2) reasons.push({ axis: 'distinct', text: '흔한 AI 템플릿과 겹치지 않는 조합' });

    axes.a11y = allContrastPass(p) ? 1 : 0.5;

    var score = 0;
    Object.keys(RECOMMEND_WEIGHTS).forEach(function (k) {
      score += axes[k] * RECOMMEND_WEIGHTS[k];
    });

    // AI 기본값 감점: SaaS·테크 맥락이 아닌데 보라/파랑 카드가 1순위로 오는 것을 막는다.
    var techContext = ctx.industry === '테크·IT' || ctx.purpose === 'saas';
    if (p.defaultRisk.risk >= 0.6 && !techContext) {
      score -= 0.18;
      reasons.push({ axis: 'penalty', text: 'SaaS 맥락이 아닌데 AI 기본값 위험 ' + p.defaultRisk.risk + ' → 감점' });
    }
    // 콘텐츠 신호 가산: 프리미엄·에너지·구매 의도가 스타일 선택을 실제로 바꾼다.
    if (ctx.signals.premium >= 0.6 && (p.id === 'minimal-luxury' || p.id === 'cream-editorial')) {
      score += 0.06;
      reasons.push({ axis: 'premium', text: '프리미엄 신호 → 여백·세리프 스타일이 가격을 지지' });
    }
    if (ctx.signals.energy >= 0.6 && (p.id === 'dark-neon' || p.id === 'vivid-pop' || p.id === 'neo-brutalism')) {
      score += 0.05;
      reasons.push({ axis: 'energy', text: '긴급·후킹 신호 → 고대비·강한 타이포가 유리' });
    }
    if (ctx.signals.commerceIntent >= 0.7 && p.id === 'commerce-clean') {
      score += 0.04;
      reasons.push({ axis: 'commerce', text: '가격·구매 신호가 많아 커머스 구조가 맞음' });
    }
    if (ctx.signals.premium >= 0.6 && p.id === 'bento-saas') score -= 0.12;
    if (ctx.density.level === 'high' && p.densityFit.high < 0.4) score -= 0.08;

    return {
      id: p.id,
      name: p.name,
      family: p.family,
      familyLabel: FAMILY_LABEL[p.family] || p.family,
      score: round(clamp(score, 0, 1), 3),
      axes: axes,
      reasons: reasons.slice(0, 4),
      defaultRisk: p.defaultRisk,
      dna: {
        palette: Object.assign({}, p.palette),
        ratio: p.ratio,
        layout: { structure: p.dna.layout.structure, columns: p.dna.layout.columns, gridLines: p.dna.layout.gridLines, note: p.dna.layout.note },
        image: { ratio: p.dna.image.ratio, fill: p.dna.image.fill, crop: p.dna.image.crop, focal: p.dna.image.focal, overlay: p.dna.image.overlay, textOnImage: p.dna.image.textOnImage },
        graphics: p.dna.graphics,
        type: p.dna.type,
        space: { unit: p.layout.unit, gutter: p.layout.gutter, margin: p.layout.margin },
        grid: p.layout.grid,
        decoration: p.decoration
      }
    };
  }

  function recommendRefs(ctx, opts) {
    opts = opts || {};
    var context = (ctx && ctx.industry !== undefined && ctx.signals) ? ctx : analyzeContentContext(ctx);
    var count = clamp(opts.count || ctx.count || 4, 3, 4);

    var all = PRESETS.map(function (p) { return scorePresetForContext(p, context); })
      .sort(function (a, b) { return b.score - a.score || a.id.localeCompare(b.id); });

    // 다양성: 같은 계열은 1개만
    var chosen = [], usedFamily = {};
    all.forEach(function (r) {
      if (chosen.length >= count) return;
      if (usedFamily[r.family]) return;
      usedFamily[r.family] = 1;
      chosen.push(r);
    });
    if (chosen.length < 3) {
      all.forEach(function (r) {
        if (chosen.length >= 3) return;
        if (chosen.indexOf(r) < 0) chosen.push(r);
      });
    }
    chosen = chosen.slice(0, count);
    chosen.forEach(function (r, i) { r.rank = i + 1; });

    var rejected = all.filter(function (r) { return chosen.indexOf(r) < 0; }).slice(0, 3).map(function (r) {
      var weakest = Object.keys(r.axes).sort(function (a, b) { return r.axes[a] - r.axes[b]; })[0];
      var label = { industry: '업종 적합도', purpose: '목적 적합도', mood: '무드 일치', density: '텍스트 밀도', trust: '신뢰 축', distinct: '차별성', a11y: '접근성' }[weakest];
      return { id: r.id, name: r.name, score: r.score, reason: label + '가 ' + Math.round(r.axes[weakest] * 100) + '%로 낮음' };
    });

    var flagged = chosen.filter(function (r) { return r.defaultRisk.risk >= 0.6; });

    return {
      context: context,
      refs: chosen,
      rejected: rejected,
      note: flagged.length === chosen.length
        ? '추천안 대부분이 AI 기본값 위험 구간입니다. 마지막 단계에서 액센트 색을 1개만 바꾸는 것을 권합니다.'
        : '같은 계열이 겹치지 않도록 3~4안을 골랐습니다. 1순위가 마음에 들지 않으면 2순위의 색만 가져오는 방식도 됩니다.',
      defaultLookFlagged: flagged.map(function (r) { return r.id; })
    };
  }

  /** 편의: 1순위만 */
  function pickRef(ctx) { return recommendRefs(ctx).refs[0]; }

  /* ==========================================================
     5-F. 선택한 레퍼런스 DNA 즉시 적용
     ========================================================== */

  /**
   * @param {string|object} refId  프리셋 id 또는 buildCustomTheme 결과
   * @param {object} [content] { kicker,title,body,cta,badge,brand,width,height }
   * @param {object} [opts] { canvas:{...}, css:{...}, html:{...}, context }
   */
  function applyDesignRef(refId, content, opts) {
    opts = opts || {};
    var p = get(refId);
    var c = content || {};
    var warnings = [];

    if (p.defaultRisk && p.defaultRisk.risk >= 0.6) {
      var ctx = opts.context ? analyzeContentContext(opts.context) : null;
      var tech = !ctx || ctx.industry === '테크·IT' || ctx.purpose === 'saas';
      if (!tech) {
        warnings.push('이 스타일은 보라·파랑 + 둥근 카드 조합이라 SaaS 맥락이 아니면 AI 기본 디자인으로 보일 수 있습니다.');
      }
    }
    if (p.id === 'neo-brutalism') warnings.push('금융·B2B·의료에는 신뢰도 손실이 큽니다.');
    if (p.id === 'dark-neon') warnings.push('본문을 흰색으로 두면 눈이 아프므로 보조 텍스트 톤을 유지하세요.');
    if (p.id === 'minimal-luxury') warnings.push('정보가 많은 콘텐츠에는 부적합합니다. 한 장에 한 문장만.');

    var tk = tokens(p);
    var canvasOpts = Object.assign({}, c, opts.canvas || {});
    var plan = toCanvas(p, canvasOpts);
    var dna = dnaOf(p);
    var safety = c.image ? imageTextSafety(p, {
      overlayOpacity: (c.image && c.image.overlayOpacity) !== undefined ? c.image.overlayOpacity : undefined
    }) : null;
    if (safety && !safety.pass) warnings.push(safety.note);

    return {
      refId: p.id,
      name: p.name,
      applied: true,
      tokens: tk,
      dna: {
        layout: dna.layout,
        image: dna.image,
        graphics: dna.graphics,
        type: dna.type,
        palette: p.palette,
        ratio: p.ratio,
        typography: {
          base: p.type.base, ratio: p.type.ratio,
          display: tk.type.roles.display, body: tk.type.roles.body, caption: tk.type.roles.caption
        },
        decoration: p.decoration || null
      },
      imageRules: {
        ratio: dna.image.ratio,
        fill: dna.image.fill,
        crop: dna.image.crop,
        focal: dna.image.focal,
        treatment: dna.image.treatment,
        overlay: dna.image.overlay,
        safeArea: dna.image.safeArea,
        legibility: dna.image.legibility,
        safety: safety
      },
      css: toCSS(p, opts.css || {}),
      html: toHTML(p, c, opts.html || {}),
      canvas: plan,
      checklist: (p.rules || []).slice(),
      warnings: warnings,
      meta: {
        structure: dna.layout.structure,
        contrast: tk.a11y.contrast,
        allPass: tk.a11y.allPass,
        accentAreaRatio: plan.meta.accentAreaRatio,
        overflow: plan.meta.overflow,
        withImage: !!c.image,
        imageSafety: safety
      }
    };
  }

  /* ==========================================================
     5-G. 추출 팔레트 → 커스텀 테마
     ========================================================== */

  /**
   * 추출한 팔레트로 프리셋과 동일한 인터페이스의 커스텀 테마를 만든다.
   * @param {object} spec { name, palette, base:'commerce-clean', rules? }
   */
  function buildCustomTheme(spec, opts) {
    opts = opts || {};
    spec = spec || {};
    if (!spec.palette) throw new Error('spec.palette required');
    var base = get(spec.base || opts.base || 'commerce-clean');
    var p = JSON.parse(JSON.stringify(base));

    var palette = Object.assign({}, p.palette, spec.palette);
    ['bg', 'surface', 'ink', 'sub', 'line', 'accent', 'accentInk', 'accentSoft'].forEach(function (k) {
      if (!isHex(palette[k])) throw new Error('invalid palette.' + k + ': ' + palette[k]);
    });

    // 파생 색을 먼저 만든 뒤 모든 텍스트 조합을 보정
    palette.line = palette.line || mix(palette.bg, palette.ink, 0.14);
    palette.accentSoft = palette.accentSoft || mix(palette.accent, palette.bg, 0.88);
    palette = hardenPalette(palette);

    p.id = spec.id || ('custom-' + hash(JSON.stringify(palette)).toString(16));
    p.name = spec.name || '추출 테마';
    p.nameEn = 'Extracted Theme';
    p.tagline = '업로드한 레퍼런스에서 뽑은 색으로 만든 테마';
    p.origin = '사용자 레퍼런스 픽셀 분석';
    p.palette = palette;
    p.ratio = { bg: 60, surface: 30, accent: 10 };
    p.family = 'custom';
    p.densityFit = p.densityFit || { low: 0.8, medium: 0.8, high: 0.6 };
    p.trust = p.trust || 0.6;
    p.decoration = Object.assign({}, p.decoration || {}, {
      type: 'extracted', motifs: ['추출 배경', '추출 포인트', '자동 대비 보정']
    });
    p.rules = (spec.rules || [
      '추출한 배경색을 60%, 카드/서피스를 30%, 포인트를 10%로 재배분했습니다.',
      '포인트 색은 채도와 면적을 함께 보고 골랐습니다. 텍스트에는 쓰지 마세요.',
      '원본 레퍼런스의 여백 비율을 유지하되, 라운딩은 기본 프리셋 값을 따릅니다.'
    ]).slice();
    p.defaultRisk = detectDefaultLook(p);
    p.purposes = p.purposes || { cardnews: 0.7, detail: 0.7, saas: 0.5, proposal: 0.5 };
    p.fit = p.fit || { '뷰티·패션': 0.6, '테크·IT': 0.6, '푸드·리빙': 0.6, '금융·B2B': 0.5, '숏폼 바이럴': 0.6 };
    p.moods = spec.moods || ['맞춤'];
    p.applies = p.applies || { cardnews: '추출 톤 그대로 카드에 적용', detail: '상품 컷 배경과 톤을 맞춤', saas: '대시보드 강조색으로', proposal: '표지 포인트로' };
    p.pin = p.pin || { headlineChars: 24, bodyChars: 48, ctaLabel: '확인하기' };
    p.isCustom = true;
    return p;
  }

  /** 픽셀 → 팔레트 → 테마 → CSS/캔버스까지 한 번에 */
  function themeFromPixels(pixels, opts) {
    opts = opts || {};
    var extraction = extractPaletteFromPixels(pixels, opts);
    if (!extraction.ok) return { ok: false, reason: extraction.reason, extraction: extraction, theme: null };
    var theme = buildCustomTheme({
      name: opts.name || '추출 테마',
      palette: extraction.palette,
      base: opts.base,
      id: opts.id
    }, opts);
    return {
      ok: true,
      theme: theme,
      extraction: extraction,
      css: toCSS(theme, opts.css || {}),
      canvas: toCanvas(theme, Object.assign({ title: '추출 테마 미리보기', cta: '확인하기' }, opts.content || {}, opts.canvas || {}))
    };
  }

/* DNA block: 4축 디자인 DNA + 이미지 합성 */
  /* ==========================================================
     5-H. 4축 디자인 DNA
     ----------------------------------------------------------
     ① layout : 그리드 구조 + 존(zone) 좌표(0~1)
     ② image  : 비율·크롭·포커스·오버레이·텍스트 안전영역
     ③ graphics: 라인/프레임/배지/질감/그림자
     ④ type   : 세리프 vs 산세리프, 굵기 대비, 자간·행간
     레퍼런스 하나를 고르면 이 네 축이 동시에 적용된다.
     ========================================================== */

  var PRESET_DNA = {
    'swiss-magazine': {
      layout: {
        structure: 'swiss-grid', columns: 12, gridLines: true, textAlign: 'left',
        zones: {
          text: { x: 0.06, y: 0.1, w: 0.46, h: 0.72 },
          image: { x: 0.56, y: 0.26, w: 0.38, h: 0.44 },
          cta: { x: 0.06, y: 0.87, w: 0.34, h: 0.07 },
          badge: { x: 0.06, y: 0.025, w: 0.24, h: 0.05 }
        },
        flow: ['kicker', 'title', 'body', 'cta'],
        note: '12열 격자. 텍스트 좌측 4열, 이미지 우하단. 제목은 항상 좌상단.'
      },
      image: {
        ratio: '4:5', fill: false, crop: 'cover', focal: 'upper-third', treatment: 'high-contrast',
        overlay: { type: 'none', color: '#000000', opacity: 0, height: 0, direction: 'bottom' },
        textOnImage: false, textColor: '#101010', secondaryTextColor: '#555555',
        safeArea: { top: 0.06, right: 0.04, bottom: 0.14, left: 0.06 },
        captionRule: '이미지 하단 1px 괘선 + 8pt 캡션',
        legibility: ['이미지 위에 본문을 얹지 않는다.', '제목과 이미지는 좌/우로 분리한다.']
      },
      graphics: { elements: ['section-number', 'hairline', 'accent-bar', 'caption-rule'], texture: 'none', badgeStyle: 'rule', accentShape: 'square' },
      type: { displayFamily: 'sans', bodyFamily: 'sans', contrastAxis: 'weight', hierarchyNote: '굵기 대비(800 vs 400)와 좌측 정렬로 위계. 세리프를 쓰지 않는다.' }
    },
    'bento-saas': {
      layout: {
        structure: 'bento-modular', columns: 12, gridLines: false, textAlign: 'left',
        zones: {
          text: { x: 0.05, y: 0.5, w: 0.9, h: 0.28 },
          image: { x: 0.05, y: 0.06, w: 0.9, h: 0.38 },
          cta: { x: 0.64, y: 0.86, w: 0.31, h: 0.07 },
          badge: { x: 0.07, y: 0.08, w: 0.24, h: 0.05 }
        },
        flow: ['badge', 'title', 'body', 'cta'],
        note: '2×2 앵커 카드 + 1×1 새틀라이트. 카드 거터 24px 고정.'
      },
      image: {
        ratio: '16:10', fill: true, crop: 'cover', focal: 'center', treatment: 'none',
        overlay: { type: 'none', color: '#000000', opacity: 0, height: 0, direction: 'bottom' },
        textOnImage: false, textColor: '#0B1020', secondaryTextColor: '#4E5568',
        safeArea: { top: 0.14, right: 0.06, bottom: 0.06, left: 0.06 },
        captionRule: '카드 안 캡션 13px, 라운딩 안쪽 16px 여백',
        legibility: ['이미지는 별도 카드, 텍스트와 겹치지 않는다.', '카드 안 텍스트는 최대 2줄.']
      },
      graphics: { elements: ['card', 'pill-badge', 'metric-chip', 'soft-shadow'], texture: 'none', badgeStyle: 'pill', accentShape: 'rounded-rect' },
      type: { displayFamily: 'sans', bodyFamily: 'sans', contrastAxis: 'weight', hierarchyNote: '800/600/400 세 단계 굵기와 카드 크기로 위계.' }
    },
    'cream-editorial': {
      layout: {
        structure: 'split-editorial', columns: 6, gridLines: false, textAlign: 'left',
        zones: {
          text: { x: 0.6, y: 0.12, w: 0.33, h: 0.7 },
          image: { x: 0, y: 0, w: 0.55, h: 1 },
          cta: { x: 0.6, y: 0.84, w: 0.33, h: 0.06 },
          badge: { x: 0.04, y: 0.06, w: 0.2, h: 0.045 }
        },
        flow: ['badge', 'kicker', 'title', 'body', 'cta'],
        note: '좌 55% 풀블리드 사진, 우 33% 텍스트. 다음 장은 좌우를 뒤집는다.'
      },
      image: {
        ratio: '4:5', fill: true, crop: 'cover', focal: 'center', treatment: 'warm-film',
        overlay: { type: 'none', color: '#000000', opacity: 0, height: 0, direction: 'bottom' },
        textOnImage: false, textColor: '#33281E', secondaryTextColor: '#6A5B4A',
        safeArea: { top: 0.08, right: 0.04, bottom: 0.1, left: 0.04 },
        captionRule: '사진 하단 좌측 8pt 캡션, 세리프 이탤릭',
        legibility: ['텍스트는 사진 위가 아니라 우측 컬럼에만.', '배지가 사진 위일 때는 상단 8% 안쪽.']
      },
      graphics: { elements: ['paper-grain', 'thin-rule', 'soft-frame', 'monogram'], texture: 'paper-grain', badgeStyle: 'soft', accentShape: 'thin-rule' },
      type: { displayFamily: 'serif', bodyFamily: 'sans', contrastAxis: 'family', hierarchyNote: '세리프 제목 + 산세리프 본문. 패밀리 대비, 행간 1.8.' }
    },
    'dark-neon': {
      layout: {
        structure: 'full-bleed-photo', columns: 12, gridLines: false, textAlign: 'left',
        zones: {
          text: { x: 0.07, y: 0.5, w: 0.72, h: 0.34 },
          image: { x: 0, y: 0, w: 1, h: 1 },
          cta: { x: 0.07, y: 0.87, w: 0.4, h: 0.065 },
          badge: { x: 0.7, y: 0.06, w: 0.24, h: 0.05 }
        },
        flow: ['badge', 'kicker', 'title', 'body', 'cta'],
        note: '풀블리드 이미지 위 하단 62% 스크림, 그 위에 텍스트.'
      },
      image: {
        ratio: '2:3', fill: true, crop: 'cover', focal: 'center', treatment: 'duotone-dark',
        overlay: { type: 'scrim', color: '#000000', opacity: 0.66, height: 0.62, direction: 'bottom' },
        textOnImage: true, textColor: '#F4F5FA', secondaryTextColor: '#C9CEDA',
        safeArea: { top: 0.14, right: 0.07, bottom: 0.06, left: 0.07 },
        captionRule: '이미지 상단 좌측 모노 라벨',
        legibility: ['텍스트는 반드시 스크림 위에만.', '스크림 최소 0.6(흰 이미지 기준 4.5:1).']
      },
      graphics: { elements: ['glow', 'neon-rule', 'mono-label', 'progress-bar'], texture: 'noise', badgeStyle: 'neon', accentShape: 'glow-line' },
      type: { displayFamily: 'sans', bodyFamily: 'sans', contrastAxis: 'weight', hierarchyNote: '900 대문자 제목 + 모노 라벨. 제목 압축(0.98), 본문은 편하게.' }
    },
    'commerce-clean': {
      layout: {
        structure: 'product-stack', columns: 12, gridLines: false, textAlign: 'left',
        zones: {
          text: { x: 0.08, y: 0.57, w: 0.84, h: 0.24 },
          image: { x: 0.08, y: 0.06, w: 0.84, h: 0.47 },
          cta: { x: 0.08, y: 0.86, w: 0.84, h: 0.08 },
          badge: { x: 0.1, y: 0.07, w: 0.26, h: 0.05 }
        },
        flow: ['badge', 'image', 'title', 'price', 'body', 'cta'],
        note: '상품 1컷 → 제목·가격 → 혜택 → 하단 고정 CTA. 첫 3초에 상품·혜택·가격만.'
      },
      image: {
        ratio: '1:1', fill: true, crop: 'cover', focal: 'center', treatment: 'clean',
        overlay: { type: 'none', color: '#FFFFFF', opacity: 0, height: 0, direction: 'bottom' },
        textOnImage: false, textColor: '#111214', secondaryTextColor: '#5A5F66',
        safeArea: { top: 0.12, right: 0.06, bottom: 0.06, left: 0.06 },
        captionRule: '가격은 이미지 아래 1.6배, 정가 취소선',
        legibility: ['이미지 위에 텍스트를 얹지 않는다.', '배지는 상품 이미지 좌상단 8% 안쪽.']
      },
      graphics: { elements: ['price-strike', 'benefit-chip', 'review-star', 'thumb-dots'], texture: 'none', badgeStyle: 'solid', accentShape: 'pill' },
      type: { displayFamily: 'sans', bodyFamily: 'sans', contrastAxis: 'size-weight', hierarchyNote: '제목 800, 가격 800·1.6배, 본문 400. 숫자를 가장 크게.' }
    },
    'neo-brutalism': {
      layout: {
        structure: 'brutal-block', columns: 8, gridLines: true, textAlign: 'left',
        zones: {
          text: { x: 0.06, y: 0.56, w: 0.88, h: 0.22 },
          image: { x: 0.06, y: 0.13, w: 0.88, h: 0.38 },
          cta: { x: 0.06, y: 0.84, w: 0.5, h: 0.07 },
          badge: { x: 0.64, y: 0.07, w: 0.26, h: 0.05 }
        },
        flow: ['badge', 'kicker', 'image', 'title', 'body', 'cta'],
        note: '보이는 8열 격자. 모든 블록에 3px 검정 테두리 + 6px 하드 섀도.'
      },
      image: {
        ratio: '1:1', fill: true, crop: 'cover', focal: 'center', treatment: 'mono-contrast',
        overlay: { type: 'none', color: '#000000', opacity: 0, height: 0, direction: 'bottom' },
        textOnImage: false, textColor: '#000000', secondaryTextColor: '#4A4A4A',
        safeArea: { top: 0.1, right: 0.05, bottom: 0.06, left: 0.05 },
        captionRule: '이미지 3px 테두리, 캡션은 모노 대문자',
        legibility: ['이미지와 텍스트 블록을 물리적으로 분리.', '겹칠 때는 형광 박스 위 검정 글자만.']
      },
      graphics: { elements: ['hard-shadow', 'thick-border', 'mono-number', 'sticker'], texture: 'none', badgeStyle: 'sticker', accentShape: 'block' },
      type: { displayFamily: 'sans', bodyFamily: 'sans', contrastAxis: 'weight-case', hierarchyNote: '900 대문자 제목 + 모노 라벨. 굵기 차 최대.' }
    },
    'minimal-luxury': {
      layout: {
        structure: 'minimal-poster', columns: 4, gridLines: false, textAlign: 'center',
        zones: {
          text: { x: 0.12, y: 0.56, w: 0.76, h: 0.2 },
          image: { x: 0.16, y: 0.1, w: 0.68, h: 0.42 },
          cta: { x: 0.32, y: 0.82, w: 0.36, h: 0.06 },
          badge: { x: 0.4, y: 0.03, w: 0.2, h: 0.04 }
        },
        flow: ['badge', 'image', 'title', 'body', 'cta'],
        note: '중앙 정렬 포스터. 이미지 3:4, 사방 여백 12% 이상. 한 장에 한 문장.'
      },
      image: {
        ratio: '3:4', fill: false, crop: 'cover', focal: 'center', treatment: 'none',
        overlay: { type: 'none', color: '#000000', opacity: 0, height: 0, direction: 'bottom' },
        textOnImage: false, textColor: '#1A1815', secondaryTextColor: '#6E675C',
        safeArea: { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 },
        captionRule: '이미지 아래 1px 금속빛 선 + 넓은 자간 라벨',
        legibility: ['이미지 위에 글자를 얹지 않는다.', '제목은 이미지 아래 중앙 정렬.']
      },
      graphics: { elements: ['hairline', 'monogram', 'wide-tracking-label', 'thin-frame'], texture: 'none', badgeStyle: 'minimal', accentShape: 'hairline' },
      type: { displayFamily: 'serif', bodyFamily: 'sans', contrastAxis: 'family-size', hierarchyNote: '세리프 400 제목 + 산세리프 300 본문. 크기·여백으로 위계.' }
    },
    'vivid-pop': {
      layout: {
        structure: 'pop-stack', columns: 6, gridLines: false, textAlign: 'left',
        zones: {
          text: { x: 0.06, y: 0.48, w: 0.72, h: 0.26 },
          image: { x: 0.06, y: 0.05, w: 0.88, h: 0.4 },
          cta: { x: 0.56, y: 0.86, w: 0.38, h: 0.07 },
          badge: { x: 0.6, y: 0.03, w: 0.32, h: 0.05 }
        },
        flow: ['badge', 'image', 'title', 'body', 'cta'],
        note: '둥근 카드 스택. 이미지 → 큰 숫자 제목 → CTA. 3장마다 배지.'
      },
      image: {
        ratio: '4:5', fill: true, crop: 'cover', focal: 'center', treatment: 'none',
        overlay: { type: 'none', color: '#000000', opacity: 0, height: 0, direction: 'bottom' },
        textOnImage: false, textColor: '#1B1B1F', secondaryTextColor: '#5F5B66',
        safeArea: { top: 0.1, right: 0.06, bottom: 0.06, left: 0.06 },
        captionRule: '이미지 라운딩 24px, 배지는 이미지 상단에 걸치기',
        legibility: ['이미지 위 텍스트 금지. 숫자·배지만 겹친다.', '배지는 이미지 위 6% 안쪽.']
      },
      graphics: { elements: ['big-number', 'pill', 'sticker-badge', 'rounded-card'], texture: 'none', badgeStyle: 'pill-solid', accentShape: 'pill' },
      type: { displayFamily: 'rounded', bodyFamily: 'sans', contrastAxis: 'size-color', hierarchyNote: '숫자 하나를 900으로 크게, 나머지는 작게. 색·크기로 위계.' }
    }
  };

  /** 숫자·무게 등 중복 값을 프리셋 정의에서 채워 넣는다. */
  function materializeDna(p) {
    var raw = PRESET_DNA[p.id];
    if (!raw) return null;
    var d = deepClone(raw);
    d.graphics.radius = p.layout.radius;
    d.graphics.border = p.layout.border;
    d.graphics.shadow = p.layout.shadow;
    d.graphics.shadowType = (p.decoration && p.decoration.shadow) || 'none';
    d.type.displayWeight = p.type.roles.display.weight;
    d.type.bodyWeight = p.type.roles.body.weight;
    d.type.displayTracking = p.type.roles.display.tracking;
    d.type.bodyTracking = p.type.roles.body.tracking;
    d.type.displayLineHeight = p.type.roles.display.lineHeight;
    d.type.bodyLineHeight = p.type.roles.body.lineHeight;
    d.type.scaleRatio = p.type.ratio;
    d.type.displayTransform = p.type.roles.display.transform;
    return d;
  }

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  PRESETS.forEach(function (p) { p.dna = materializeDna(p); });

  /** 프리셋의 4축 DNA(복사본) */
  function dnaOf(preset) {
    var p = get(preset);
    if (!p.dna) throw new Error('preset has no DNA: ' + p.id);
    return deepClone(p.dna);
  }

  function parseRatio(r) {
    var m = String(r || '1:1').split(':');
    return (Number(m[0]) || 1) / (Number(m[1]) || 1);
  }

  /** 존 안에서 비율을 유지한 이미지 사각형(px) */
  function fitImageRect(zone, ratioStr, W, H, focal) {
    var zx = zone.x * W, zy = zone.y * H, zw = zone.w * W, zh = zone.h * H;
    var target = parseRatio(ratioStr);
    var w = zw, h = zw / target;
    if (h > zh) { h = zh; w = zh * target; }
    var alignX = focal === 'left' ? 0 : (focal === 'right' ? 1 : 0.5);
    var alignY = focal === 'upper-third' ? 0.12 : (focal === 'lower-third' ? 0.88 : 0.5);
    return {
      x: Math.round(zx + (zw - w) * alignX),
      y: Math.round(zy + (zh - h) * alignY),
      w: Math.round(w), h: Math.round(h)
    };
  }

  /**
   * 레이아웃 계획: 정규화 존 → 픽셀 존.
   * @param {string|object} preset
   * @param {object} [opts] { width=1080, height=1350 }
   */
  function layoutPlan(preset, opts) {
    opts = opts || {};
    var p = get(preset);
    var dna = p.dna || dnaOf(p);
    var W = opts.width || 1080, H = opts.height || 1350;
    var zones = {};
    ['text', 'image', 'cta', 'badge'].forEach(function (k) {
      var z = dna.layout.zones[k];
      zones[k] = { x: Math.round(z.x * W), y: Math.round(z.y * H), w: Math.round(z.w * W), h: Math.round(z.h * H) };
    });

    var img = dna.image;
    var imgRect = img.fill ? zones.image : fitImageRect(dna.layout.zones.image, img.ratio, W, H, img.focal);

    var overlayRect = null;
    if (img.overlay.type !== 'none') {
      var oh = img.overlay.height || 1;
      overlayRect = {
        x: imgRect.x, y: Math.round(imgRect.y + imgRect.h * (1 - oh)),
        w: imgRect.w, h: Math.round(imgRect.h * oh)
      };
    }

    var safe = {
      x: Math.round(imgRect.x + imgRect.w * img.safeArea.left),
      y: Math.round(imgRect.y + imgRect.h * img.safeArea.top),
      w: Math.round(imgRect.w * (1 - img.safeArea.left - img.safeArea.right)),
      h: Math.round(imgRect.h * (1 - img.safeArea.top - img.safeArea.bottom))
    };

    return {
      preset: p.id,
      structure: dna.layout.structure,
      columns: dna.layout.columns,
      gridLines: dna.layout.gridLines,
      width: W, height: H,
      zones: zones,
      image: Object.assign({}, imgRect, {
        ratio: img.ratio, fill: img.fill, crop: img.crop, focal: img.focal,
        treatment: img.treatment, overlay: img.overlay, overlayRect: overlayRect
      }),
      safeArea: safe,
      textAlign: dna.layout.textAlign,
      flow: dna.layout.flow,
      note: dna.layout.note
    };
  }

  /**
   * 이미지 위 텍스트 가독성 검사.
   * 흰 이미지(최악)에 오버레이를 합성했을 때의 대비를 계산한다.
   */
  function imageTextSafety(preset, opts) {
    opts = opts || {};
    var p = get(preset);
    var img = (p.dna || dnaOf(p)).image;
    var overlayColor = opts.overlayColor || img.overlay.color || '#000000';
    var opacity = opts.overlayOpacity === undefined ? (img.overlay.opacity || 0) : opts.overlayOpacity;
    var textColor = opts.textColor || img.textColor || p.palette.ink;
    var secondary = opts.secondaryTextColor || img.secondaryTextColor || p.palette.sub;

    if (!img.textOnImage && opts.force !== true) {
      return {
        applies: false, textOnImage: false, overlay: img.overlay,
        textColor: textColor, secondaryTextColor: secondary,
        worstBg: p.palette.bg,
        ratio: contrastRatio(textColor, p.palette.bg),
        secondaryRatio: contrastRatio(secondary, p.palette.bg),
        pass: contrastRatio(textColor, p.palette.bg) >= 4.5 && contrastRatio(secondary, p.palette.bg) >= 4.5,
        minOpacity: 0,
        note: '이 프리셋은 이미지 위에 텍스트를 얹지 않습니다. 안전영역이 분리되어 있습니다.'
      };
    }

    var worstBg = mix('#FFFFFF', overlayColor, opacity);
    var worstRatio = contrastRatio(textColor, worstBg);
    var worstSecondary = contrastRatio(secondary, worstBg);
    var required = 4.5;
    var minOpacity = 0;
    while (minOpacity < 0.95 && contrastRatio(textColor, mix('#FFFFFF', overlayColor, minOpacity)) < required) {
      minOpacity = round(minOpacity + 0.01, 2);
    }
    return {
      applies: true, textOnImage: true,
      overlay: Object.assign({}, img.overlay, { color: overlayColor, opacity: opacity }),
      textColor: textColor, secondaryTextColor: secondary,
      worstBg: worstBg, ratio: worstRatio, secondaryRatio: worstSecondary,
      pass: worstRatio >= required && worstSecondary >= 4.5,
      minOpacity: minOpacity,
      recommendedOpacity: Math.max(opacity, minOpacity),
      note: worstRatio >= required
        ? '흰 이미지 기준 최악의 경우에도 ' + worstRatio + ':1로 통과합니다.'
        : '흰 이미지 위 대비가 ' + worstRatio + ':1입니다. 오버레이를 ' + minOpacity + ' 이상으로 올리세요.'
    };
  }

  /** 이미지가 있는 카드의 Canvas 명령 (toCanvas가 opts.image일 때 호출) */
  function composeWithImage(p, opts) {
    var t = tokens(p);
    var dna = p.dna;
    var W = opts.width || 1080, H = opts.height || 1350;
    var plan = layoutPlan(p, { width: W, height: H });
    var cmds = [];
    var img = dna.image;
    var imgOpt = (typeof opts.image === 'object' && opts.image) ? opts.image : {};
    var src = typeof opts.image === 'string' ? opts.image : (imgOpt.src || '');
    var overlay = Object.assign({}, img.overlay, imgOpt.overlay || {});
    var overlayOpacity = imgOpt.overlayOpacity !== undefined ? imgOpt.overlayOpacity : overlay.opacity;
    function px(v) { return Math.round(v * (W / 540)); }

    cmds.push({ type: 'rect', x: 0, y: 0, w: W, h: H, fill: t.color.bg, role: 'bg' });
    cmds.push({
      type: 'image', x: plan.image.x, y: plan.image.y, w: plan.image.w, h: plan.image.h,
      src: src, fit: plan.image.crop || 'cover', focal: plan.image.focal,
      treatment: plan.image.treatment, role: 'image'
    });
    if (overlay.type !== 'none' && overlayOpacity > 0) {
      cmds.push({
        type: overlay.type === 'scrim' ? 'scrim' : 'rect',
        x: plan.image.x, y: plan.image.y, w: plan.image.w, h: plan.image.h,
        color: overlay.color, opacity: overlayOpacity, direction: overlay.direction || 'bottom',
        height: overlay.height || 1, role: 'overlay'
      });
    }

    var textColor = img.textOnImage ? img.textColor : t.color.ink;
    var subColor = img.textOnImage ? img.secondaryTextColor : t.color.sub;
    var textZone = plan.zones.text;
    var align = plan.textAlign === 'center' ? 'center' : 'left';
    var x = align === 'center' ? textZone.x + textZone.w / 2 : textZone.x;
    var y = textZone.y, maxW = textZone.w;

    if (opts.kicker) {
      var ks = px(t.type.roles.micro.size);
      cmds.push({
        type: 'text', x: x, y: y + ks, text: String(opts.kicker).toUpperCase(), size: ks,
        weight: 700, color: t.color.accent, tracking: '0.08em', align: align, role: 'kicker'
      });
      y += ks + px(10);
    }

    var title = String(opts.title || '제목을 입력하세요');
    var maxSize = px(t.type.roles.display.size);
    var minSize = Math.max(px(t.type.roles.h2.size), Math.round(maxSize * 0.5));
    var size = maxSize, lines = [];
    for (; size >= minSize; size -= Math.max(1, Math.round(W / 540))) {
      lines = wrapText(title, Math.max(4, Math.floor(maxW / (size * 0.9))));
      var lh0 = Math.round(size * t.type.roles.display.lineHeightRatio);
      if (lines.length <= 3 && lines.length * lh0 <= textZone.h * 0.7) break;
    }
    if (lines.length > 3) lines = lines.slice(0, 3);
    var lh = Math.round(size * t.type.roles.display.lineHeightRatio);
    lines.forEach(function (line, i) {
      cmds.push({
        type: 'text', x: x, y: y + size + i * lh, text: line, size: size,
        weight: dna.type.displayWeight, color: textColor, tracking: dna.type.displayTracking,
        align: align, role: 'title', line: i
      });
    });
    y += lines.length * lh + px(12);

    if (opts.body) {
      var bs = px(t.type.roles.body.size);
      var blh = Math.round(bs * t.type.roles.body.lineHeightRatio);
      var room = textZone.y + textZone.h - y;
      var maxLines = Math.max(0, Math.min(3, Math.floor(room / blh)));
      var bLines = wrapText(opts.body, Math.max(6, Math.floor(maxW / (bs * 0.92))));
      if (bLines.length > maxLines) bLines = bLines.slice(0, maxLines);
      bLines.forEach(function (line, i) {
        cmds.push({
          type: 'text', x: x, y: y + bs + i * blh, text: line, size: bs, weight: dna.type.bodyWeight,
          color: subColor, tracking: dna.type.bodyTracking, align: align, role: 'body', line: i
        });
      });
    }

    var cz = plan.zones.cta;
    var ctaSize = Math.min(px(t.type.roles.body.size), Math.round(cz.h * 0.42));
    var ctaW = Math.max(px(t.cta.minWidth || 160), Math.round(String(opts.cta || p.pin.ctaLabel).length * ctaSize * 1.05 + px(40)));
    ctaW = Math.min(ctaW, cz.w);
    var ctaX = plan.textAlign === 'center' ? cz.x + (cz.w - ctaW) / 2 : cz.x;
    cmds.push({
      type: 'rect', x: ctaX, y: cz.y, w: ctaW, h: cz.h,
      fill: t.color.accent, radius: Math.min(cz.h / 2, px(t.cta.radius)), role: 'accent', part: 'cta'
    });
    cmds.push({
      type: 'text', x: ctaX + ctaW / 2, y: cz.y + cz.h / 2 + ctaSize * 0.35,
      text: String(opts.cta || p.pin.ctaLabel), size: ctaSize, weight: 700,
      color: t.color.accentInk, tracking: '0em', align: 'center', role: 'cta'
    });

    if (opts.badge) {
      var bz = plan.zones.badge;
      var bs2 = px(t.type.roles.micro.size);
      var textW = Math.round(String(opts.badge).length * bs2 * 1.0 + px(22));
      var bw = Math.min(textW, W - px(20));
      var bh = bs2 + px(12);
      var bx = bz.x;
      if (bx + bw > W - px(10)) bx = W - px(10) - bw;
      if (bx < px(10)) bx = px(10);
      var by = bz.y;
      if (by + bh > H - px(10)) by = H - px(10) - bh;
      cmds.push({
        type: 'rect', x: bx, y: by, w: bw, h: bh, fill: t.color.accent,
        radius: /pill/.test(dna.graphics.badgeStyle) ? bh / 2 : (dna.graphics.radius > 0 ? px(4) : 0),
        role: 'accent', part: 'badge'
      });
      cmds.push({
        type: 'text', x: bx + px(10), y: by + bh / 2 + bs2 * 0.35, text: String(opts.badge),
        size: bs2, weight: 700, color: t.color.accentInk, tracking: '0em', align: 'left', role: 'badge'
      });
    }

    var overflow = cmds.some(function (c) {
      if (c.type === 'rect' || c.type === 'image' || c.type === 'scrim') {
        return c.x < 0 || c.y < 0 || c.x + c.w > W + 0.5 || c.y + c.h > H + 0.5;
      }
      return c.x < 0 || c.x > W || c.y < 0 || c.y > H;
    });
    var accentArea = 0;
    cmds.forEach(function (c) { if (c.type === 'rect' && c.role === 'accent') accentArea += c.w * c.h; });

    return {
      width: W, height: H, scale: W / (opts.baseWidth || 540), preset: p.id,
      withImage: true, commands: cmds, layout: plan,
      meta: {
        structure: plan.structure,
        accentAreaRatio: round(accentArea / (W * H), 4),
        targetRatio: 0.1,
        titleLines: lines.length,
        titleSize: size,
        overflow: overflow,
        image: { src: src, fit: plan.image.crop, focal: plan.image.focal, treatment: plan.image.treatment, overlay: overlay },
        safety: imageTextSafety(p, { overlayColor: overlay.color, overlayOpacity: overlayOpacity }),
        contrast: {
          title: contrastRatio(textColor, img.textOnImage ? mix('#FFFFFF', overlay.color, overlayOpacity) : t.color.bg),
          body: contrastRatio(subColor, img.textOnImage ? mix('#FFFFFF', overlay.color, overlayOpacity) : t.color.bg),
          cta: contrastRatio(t.color.accentInk, t.color.accent)
        },
        canvas: { width: W, height: H, ratio: round(W / H, 3) }
      }
    };
  }

  /* ==========================================================
     6. 토큰 출력
     ========================================================== */

  function tokens(preset, opts) {
    opts = opts || {};
    var p = get(preset);
    var ty = typography(p);
    var space = spacingScale(p.layout.unit);
    var report = contrastReport(p);
    return {
      id: p.id,
      name: p.name,
      color: {
        bg: p.palette.bg,
        surface: p.palette.surface,
        ink: p.palette.ink,
        sub: p.palette.sub,
        line: p.palette.line,
        accent: p.palette.accent,
        accentInk: p.palette.accentInk,
        accentSoft: p.palette.accentSoft,
        ratio: p.ratio
      },
      type: {
        family: p.type.family,
        familyStack: (function () {
          var m = {};
          Object.keys(FONT_STACKS).forEach(function (k) { m[k] = FONT_STACKS[k]; });
          return m;
        })(),
        base: ty.base,
        ratio: ty.ratio,
        sizes: ty.sizes,
        roles: ty.roles,
        hierarchy: ty.hierarchy
      },
      space: {
        unit: p.layout.unit,
        scale: space,
        gutter: p.layout.gutter,
        margin: p.layout.margin,
        sectionGap: p.layout.sectionGap,
        maxWidth: p.layout.maxWidth
      },
      shape: {
        radius: p.layout.radius,
        border: p.layout.border,
        shadow: p.layout.shadow,
        density: p.layout.density,
        columns: p.layout.columns,
        grid: p.layout.grid,
        imageRatio: p.layout.imageRatio
      },
      cta: Object.assign({}, p.layout.cta, { textOnAccent: p.palette.accentInk }),
      badge: Object.assign({}, p.layout.badge),
      a11y: {
        contrast: report,
        allPass: report.every(function (r) { return r.pass; }),
        minText: Math.min.apply(null, report.filter(function (r) { return r.kind === 'text'; }).map(function (r) { return r.ratio; })),
        note: 'WCAG 2.2 SC 1.4.3 — 본문 4.5:1, 큰 글자 3:1. 계산값은 반올림하지 않고 비교한다.'
      },
      version: VERSION
    };
  }

  function cssVarName(prefix, path) { return '--' + prefix + '-' + path; }

  /**
   * CSS custom properties + 기본 클래스 출력.
   * @param {string|object} preset
   * @param {object} [opts] { selector, prefix }
   */
  function toCSS(preset, opts) {
    opts = opts || {};
    var p = get(preset);
    var t = tokens(p);
    var prefix = opts.prefix || 'pm';
    var selector = opts.selector || ':root';
    var ty = t.type;
    var lines = [];

    lines.push('/* ' + p.name + ' · ' + p.nameEn + ' — generated by design-ref-engine v' + VERSION + ' */');
    lines.push(selector + ' {');
    lines.push('  /* color · 60-30-10 */');
    lines.push('  ' + cssVarName(prefix, 'bg') + ': ' + t.color.bg + ';   /* 60% */');
    lines.push('  ' + cssVarName(prefix, 'surface') + ': ' + t.color.surface + ';   /* 30% */');
    lines.push('  ' + cssVarName(prefix, 'ink') + ': ' + t.color.ink + ';');
    lines.push('  ' + cssVarName(prefix, 'sub') + ': ' + t.color.sub + ';');
    lines.push('  ' + cssVarName(prefix, 'line') + ': ' + t.color.line + ';');
    lines.push('  ' + cssVarName(prefix, 'accent') + ': ' + t.color.accent + ';   /* 10% */');
    lines.push('  ' + cssVarName(prefix, 'accent-ink') + ': ' + t.color.accentInk + ';');
    lines.push('  ' + cssVarName(prefix, 'accent-soft') + ': ' + t.color.accentSoft + ';');
    lines.push('');
    lines.push('  /* type · modular scale ' + ty.base + 'px × ' + ty.ratio + ' */');
    lines.push('  ' + cssVarName(prefix, 'font-display') + ': ' + ty.familyStack[p.type.family.display] + ';');
    lines.push('  ' + cssVarName(prefix, 'font-body') + ': ' + ty.familyStack[p.type.family.body] + ';');
    lines.push('  ' + cssVarName(prefix, 'font-mono') + ': ' + ty.familyStack.mono + ';');
    ROLE_ORDER.forEach(function (role) {
      var r = ty.roles[role];
      lines.push('  ' + cssVarName(prefix, 'text-' + role) + ': ' + r.size + 'px;');
      lines.push('  ' + cssVarName(prefix, 'leading-' + role) + ': ' + r.lineHeight + 'px;');
      lines.push('  ' + cssVarName(prefix, 'tracking-' + role) + ': ' + r.tracking + ';');
    });
    lines.push('');
    lines.push('  /* space · 8pt */');
    t.space.scale.forEach(function (v, i) {
      lines.push('  ' + cssVarName(prefix, 'space-' + i) + ': ' + v + 'px;');
    });
    lines.push('  ' + cssVarName(prefix, 'gutter') + ': ' + t.space.gutter + 'px;');
    lines.push('  ' + cssVarName(prefix, 'margin') + ': ' + t.space.margin + 'px;');
    lines.push('  ' + cssVarName(prefix, 'section-gap') + ': ' + t.space.sectionGap + 'px;');
    lines.push('  ' + cssVarName(prefix, 'max-width') + ': ' + t.space.maxWidth + 'px;');
    lines.push('');
    lines.push('  /* shape */');
    lines.push('  ' + cssVarName(prefix, 'radius') + ': ' + t.shape.radius + 'px;');
    lines.push('  ' + cssVarName(prefix, 'border') + ': ' + t.shape.border + 'px solid ' + t.color.line + ';');
    lines.push('  ' + cssVarName(prefix, 'shadow') + ': ' + t.shape.shadow + ';');
    lines.push('  ' + cssVarName(prefix, 'cta-radius') + ': ' + t.cta.radius + 'px;');
    lines.push('  ' + cssVarName(prefix, 'cta-height') + ': ' + t.cta.height + 'px;');
    lines.push('}');
    lines.push('');
    lines.push('.' + prefix + '-canvas { background: var(' + cssVarName(prefix, 'bg') + '); color: var(' + cssVarName(prefix, 'ink') + '); }');
    lines.push('.' + prefix + '-card { background: var(' + cssVarName(prefix, 'surface') + '); border-radius: var(' + cssVarName(prefix, 'radius') + '); border: var(' + cssVarName(prefix, 'border') + '); box-shadow: var(' + cssVarName(prefix, 'shadow') + '); padding: var(' + cssVarName(prefix, 'space-5') + '); }');
    lines.push('.' + prefix + '-display { font-family: var(' + cssVarName(prefix, 'font-display') + '); font-size: var(' + cssVarName(prefix, 'text-display') + '); line-height: var(' + cssVarName(prefix, 'leading-display') + '); letter-spacing: var(' + cssVarName(prefix, 'tracking-display') + '); font-weight: ' + ty.roles.display.weight + '; }');
    lines.push('.' + prefix + '-h2 { font-family: var(' + cssVarName(prefix, 'font-display') + '); font-size: var(' + cssVarName(prefix, 'text-h2') + '); line-height: var(' + cssVarName(prefix, 'leading-h2') + '); font-weight: ' + ty.roles.h2.weight + '; }');
    lines.push('.' + prefix + '-body { font-family: var(' + cssVarName(prefix, 'font-body') + '); font-size: var(' + cssVarName(prefix, 'text-body') + '); line-height: var(' + cssVarName(prefix, 'leading-body') + '); color: var(' + cssVarName(prefix, 'ink') + '); }');
    lines.push('.' + prefix + '-capa { font-family: var(' + cssVarName(prefix, 'font-body') + '); font-size: var(' + cssVarName(prefix, 'text-caption') + '); line-height: var(' + cssVarName(prefix, 'leading-caption') + '); color: var(' + cssVarName(prefix, 'sub') + '); }');
    lines.push('.' + prefix + '-cta { background: var(' + cssVarName(prefix, 'accent') + '); color: var(' + cssVarName(prefix, 'accent-ink') + '); border-radius: var(' + cssVarName(prefix, 'cta-radius') + '); height: var(' + cssVarName(prefix, 'cta-height') + '); font-weight: 700; }');
    lines.push('.' + prefix + '-badge { background: var(' + cssVarName(prefix, 'accent') + '); color: var(' + cssVarName(prefix, 'accent-ink') + '); }');
    return lines.join('\n');
  }

  /* ==========================================================
     7. HTML 출력 (자기완결 카드)
     ========================================================== */

  /** 인라인 style 속성(쌍따옴표) 안에서 폰트 스택의 쌍따옴표가 속성을 끊지 않게 바꾼다. */
  function inlineFont(stack) { return String(stack || '').replace(/"/g, "'"); }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * 카드 1장 HTML. CSS 변수 없이 인라인 스타일만 사용해 어디에 붙여도 동일하게 보인다.
   * @param {string|object} preset
   * @param {object} content { kicker, title, body, cta, badge, brand }
   * @param {object} [opts] { width, height, scale }
   */
  /** 안전한 이미지 URL만 통과 (스크립트 실행 차단) */
  function safeSrc(src) {
    var s = String(src || '').trim();
    if (/^(https?:\/\/|data:image\/|\.\/|\/)/i.test(s)) return s;
    return '';
  }

  var IMAGE_FILTERS = {
    none: 'none',
    'high-contrast': 'contrast(1.12) saturate(0.96)',
    'warm-film': 'sepia(0.14) saturate(0.92) contrast(0.96) brightness(1.02)',
    'duotone-dark': 'grayscale(0.35) contrast(1.12) brightness(0.82)',
    'mono-contrast': 'grayscale(1) contrast(1.18)',
    clean: 'none'
  };

  /**
   * 이미지가 있는 카드 HTML. 4축 DNA의 존 비율을 그대로 %로 옮긴다.
   */
  function htmlWithImage(p, c, opts) {
    opts = opts || {};
    var t = tokens(p);
    var dna = p.dna;
    var ty = t.type;
    var width = opts.width || 540;
    var k = width / 540;
    var height = opts.height || Math.round(width * 1.25);
    var img = dna.image;
    var src = safeSrc(c.image);
    var plan = layoutPlan(p, { width: 1000, height: Math.round(1000 * height / width) });
    var zone = function (z) {
      return 'left:' + round(z.x / plan.width * 100, 3) + '%;top:' + round(z.y / plan.height * 100, 3) + '%;' +
        'width:' + round(z.w / plan.width * 100, 3) + '%;height:' + round(z.h / plan.height * 100, 3) + '%;';
    };
    var textColor = img.textOnImage ? img.textColor : t.color.ink;
    var subColor = img.textOnImage ? img.secondaryTextColor : t.color.sub;
    var align = dna.layout.textAlign;
    var radius = Math.round(dna.graphics.radius * k);
    var borderCss = dna.graphics.border
      ? dna.graphics.border * Math.max(1, Math.round(k)) + 'px solid ' + (p.id === 'neo-brutalism' ? t.color.ink : t.color.line)
      : 'none';
    var shadowCss = dna.graphics.shadow === 'hard' ? (6 * Math.max(1, Math.round(k)) + 'px ' + 6 * Math.max(1, Math.round(k)) + 'px 0 ' + t.color.ink)
      : (dna.graphics.shadow === 'none' ? 'none' : dna.graphics.shadow);
    var imgRectStyle = img.fill
      ? zone(plan.zones.image)
      : (function () {
        var r = plan.image;
        return 'left:' + round(r.x / plan.width * 100, 3) + '%;top:' + round(r.y / plan.height * 100, 3) + '%;' +
          'width:' + round(r.w / plan.width * 100, 3) + '%;height:' + round(r.h / plan.height * 100, 3) + '%;';
      })();
    var overlayHtml = '';
    if (img.overlay.type === 'scrim') {
      overlayHtml = '<div style="position:absolute;inset:0;background:linear-gradient(to top,' +
        'rgba(0,0,0,' + img.overlay.opacity + ') 0%,rgba(0,0,0,' + round(img.overlay.opacity * 0.55, 2) + ') ' +
        Math.round((img.overlay.height || 0.6) * 100) + '%,rgba(0,0,0,0) 100%);"></div>';
    } else if (img.overlay.type === 'solid-band') {
      overlayHtml = '<div style="position:absolute;left:0;right:0;bottom:0;height:' +
        Math.round((img.overlay.height || 0.5) * 100) + '%;background:' + img.overlay.color + ';opacity:' + img.overlay.opacity + ';"></div>';
    }
    var objectPos = img.focal === 'upper-third' ? '50% 30%' : (img.focal === 'left' ? '0% 50%' : (img.focal === 'right' ? '100% 50%' : '50% 50%'));

    var badgeHtml = '';
    if (c.badge) {
      var bz = plan.zones.badge;
      var rightAnchor = (bz.x + bz.w / 2) > plan.width / 2;
      var anchorCss = rightAnchor
        ? 'right:' + round((plan.width - bz.x - bz.w) / plan.width * 100, 3) + '%;'
        : 'left:' + round(bz.x / plan.width * 100, 3) + '%;';
      badgeHtml = '<div style="position:absolute;' + anchorCss + 'top:' + round(bz.y / plan.height * 100, 3) + '%;' +
        'display:inline-flex;align-items:center;justify-content:center;background:' + t.color.accent + ';color:' + t.color.accentInk + ';' +
        'border-radius:' + (/pill/.test(dna.graphics.badgeStyle) ? '999px' : radius + 'px') + ';' +
        'font:700 ' + Math.round(ty.roles.micro.size * k) + 'px/' + Math.round(ty.roles.micro.lineHeight * k) + 'px ' + inlineFont(ty.roles.micro.family) + ';' +
        'letter-spacing:' + ty.roles.micro.tracking + ';padding:' + Math.round(4 * k) + 'px ' + Math.round(9 * k) + 'px;' +
        'white-space:nowrap;max-width:70%;overflow:hidden;text-overflow:ellipsis;">' + esc(c.badge) + '</div>';
    }

    var ctaLabel = c.cta || p.pin.ctaLabel;
    var ctaHtml = '<div style="position:absolute;' + zone(plan.zones.cta) +
      'display:flex;align-items:center;justify-content:' + (align === 'center' ? 'center' : 'center') + ';' +
      'background:' + t.color.accent + ';color:' + t.color.accentInk + ';border-radius:' + Math.round(t.cta.radius * k) + 'px;' +
      'font:700 ' + Math.round(ty.roles.body.size * k) + 'px/' + Math.round(ty.roles.body.lineHeight * k) + 'px ' + inlineFont(ty.roles.body.family) + ';' +
      'text-align:center;">' + esc(ctaLabel) + '</div>';

    return '<figure class="pm-card pm-has-image" data-structure="' + dna.layout.structure + '" ' +
      'style="position:relative;margin:0;box-sizing:border-box;overflow:hidden;width:' + width + 'px;height:' + height + 'px;' +
      'background:' + t.color.bg + ';color:' + textColor + ';border:' + borderCss + ';border-radius:' + radius + 'px;box-shadow:' + shadowCss + ';' +
      'font-family:' + inlineFont(ty.familyStack[p.type.family.body]) + ';">' +
      (src ? '<img src="' + esc(src) + '" alt="' + esc(c.imageAlt || '') + '" style="position:absolute;' + imgRectStyle +
        'object-fit:' + (img.crop || 'cover') + ';object-position:' + objectPos + ';filter:' + (IMAGE_FILTERS[img.treatment] || 'none') + ';">'
        : '<div style="position:absolute;' + imgRectStyle + 'background:' + t.color.accentSoft + ';display:flex;align-items:center;justify-content:center;color:' + t.color.sub + ';font-size:' + Math.round(12 * k) + 'px;">이미지 영역</div>') +
      overlayHtml +
      badgeHtml +
      '<div style="position:absolute;' + zone(plan.zones.text) + 'display:flex;flex-direction:column;' +
      'justify-content:flex-start;text-align:' + align + ';">' +
      (c.kicker ? '<div style="font:700 ' + Math.round(ty.roles.micro.size * k) + 'px/' + Math.round(ty.roles.micro.lineHeight * k) + 'px ' + inlineFont(ty.roles.micro.family) + ';' +
        'color:' + (img.textOnImage ? t.color.accent : t.color.accent) + ';letter-spacing:' + ty.roles.micro.tracking + ';margin-bottom:' + Math.round(8 * k) + 'px;">' + esc(c.kicker) + '</div>' : '') +
      '<div style="font-family:' + (dna.type.displayFamily === 'serif' ? inlineFont(ty.familyStack.serif) : (dna.type.displayFamily === 'rounded' ? inlineFont(ty.familyStack.rounded) : inlineFont(ty.familyStack.sans))) + ';' +
      'font-size:' + Math.round(ty.roles.display.size * k) + 'px;line-height:' + Math.round(ty.roles.display.lineHeight * k) + 'px;' +
      'font-weight:' + dna.type.displayWeight + ';letter-spacing:' + dna.type.displayTracking + ';' +
      'text-transform:' + ty.roles.display.transform + ';word-break:keep-all;overflow-wrap:break-word;">' + esc(c.title || '제목을 입력하세요') + '</div>' +
      (c.body ? '<div style="margin-top:' + Math.round(10 * k) + 'px;font-family:' + inlineFont(ty.familyStack[p.type.family.body]) + ';' +
        'font-size:' + Math.round(ty.roles.body.size * k) + 'px;line-height:' + Math.round(ty.roles.body.lineHeight * k) + 'px;' +
        'font-weight:' + dna.type.bodyWeight + ';letter-spacing:' + dna.type.bodyTracking + ';color:' + subColor + ';word-break:keep-all;overflow-wrap:break-word;">' + esc(c.body) + '</div>' : '') +
      '</div>' +
      ctaHtml +
      (c.brand ? '<div style="position:absolute;left:' + Math.round(4 / 100 * 100) + '%;bottom:2%;font-size:' + Math.round(ty.roles.caption.size * k) + 'px;color:' + subColor + ';">' + esc(c.brand) + '</div>' : '') +
      '</figure>';
  }

  function toHTML(preset, content, opts) {
    opts = opts || {};
    var p = get(preset);
    var t = tokens(p);
    var ty = t.type;
    var c = content || {};
    var width = opts.width || 540;
    var scale = opts.scale || 1;
    var pad = t.space.margin;
    var title = c.title || '제목을 입력하세요';
    var body = c.body || '';
    var cta = c.cta || p.pin.ctaLabel;
    var badge = c.badge || '';
    var kicker = c.kicker || '';
    var brand = c.brand || '';

    if (c.image) return htmlWithImage(p, c, opts);

    var badgeH = badge ? Math.round(ty.roles.micro.size * 1.4 + 12) : 0;
    var badgeTop = badge && /top/.test((p.layout.badge && p.layout.badge.pos) || 'top-right');
    var padTop = pad + (badgeTop ? badgeH + 12 : 0);

    var badgeHtml = badge ? '<div style="position:absolute;top:' + pad + 'px;right:' + pad + 'px;padding:6px 12px;' +
      'background:' + t.color.accent + ';color:' + t.color.accentInk + ';border-radius:' +
      (t.badge.style === 'pill' ? '999px' : (t.badge.style === 'sticker' ? '0' : '4px')) + ';' +
      'font:700 ' + ty.roles.micro.size + 'px/' + ty.roles.micro.lineHeight + 'px ' + inlineFont(ty.roles.micro.family) + ';' +
      'letter-spacing:' + ty.roles.micro.tracking + ';">' + esc(badge) + '</div>' : '';

    return [
      '<figure class="pm-card" style="position:relative;margin:0;box-sizing:border-box;',
      'width:' + width + 'px;min-height:' + Math.round(width * 1.35) + 'px;',
      'padding:' + padTop + 'px ' + pad + 'px ' + pad + 'px;background:' + t.color.bg + ';color:' + t.color.ink + ';',
      'font-family:' + inlineFont(ty.familyStack[p.type.family.body]) + ';',
      'border:' + (p.layout.border ? p.layout.border + 'px solid ' + (p.id === 'neo-brutalism' ? t.color.ink : t.color.line) : 'none') + ';',
      'border-radius:' + t.shape.radius + 'px;box-shadow:' + t.shape.shadow + ';',
      'display:flex;flex-direction:column;justify-content:' + (p.id === 'minimal-luxury' ? 'center' : 'flex-start') + ';',
      'gap:' + t.space.scale[4] + 'px;overflow:hidden;">',
      badgeHtml,
      kicker ? '<div style="font:600 ' + ty.roles.micro.size + 'px/' + ty.roles.micro.lineHeight + 'px ' + inlineFont(ty.roles.micro.family) + ';letter-spacing:' + ty.roles.micro.tracking + ';color:' + t.color.accent + ';text-transform:' + ty.roles.micro.transform + ';">' + esc(kicker) + '</div>' : '',
      '<h2 style="margin:0;word-break:keep-all;overflow-wrap:break-word;font-family:' + inlineFont(ty.roles.display.family) + ';font-size:' + ty.roles.display.size + 'px;line-height:' + ty.roles.display.lineHeight + 'px;',
      'letter-spacing:' + ty.roles.display.tracking + ';font-weight:' + ty.roles.display.weight + ';text-transform:' + ty.roles.display.transform + ';">' + esc(title) + '</h2>',
      body ? '<p style="margin:0;word-break:keep-all;overflow-wrap:break-word;font-size:' + ty.roles.body.size + 'px;line-height:' + ty.roles.body.lineHeight + 'px;color:' + t.color.sub + ';max-width:34em;">' + esc(body) + '</p>' : '',
      '<div style="margin-top:auto;display:flex;align-items:center;gap:' + t.space.scale[2] + 'px;justify-content:' + (p.layout.cta.pos === 'bottom-right' ? 'flex-end' : (p.layout.cta.pos === 'inline-center' ? 'center' : 'flex-start')) + ';">',
      '<span style="display:inline-flex;align-items:center;justify-content:center;height:' + t.cta.height + 'px;padding:0 ' + t.space.scale[4] + 'px;',
      'background:' + t.color.accent + ';color:' + t.color.accentInk + ';border-radius:' + t.cta.radius + 'px;font-weight:700;',
      'font-size:' + ty.roles.body.size + 'px;">' + esc(cta) + '</span>',
      brand ? '<span style="font-size:' + ty.roles.caption.size + 'px;color:' + t.color.sub + ';">' + esc(brand) + '</span>' : '',
      '</div>',
      '</figure>'
    ].join('\n');
  }

  /* ==========================================================
     8. Canvas 드로잉 명령 출력
     ----------------------------------------------------------
     node에는 canvas API가 없으므로, 좌표·색·텍스트가 담긴
     명령 배열을 돌려준다. 브라우저 앱이 2D 컨텍스트에 그대로 실행한다.
     ========================================================== */

  function wrapText(text, maxChars) {
    var src = String(text || '').replace(/\s+/g, ' ').trim();
    if (!src) return [];
    var words = src.split(' ');
    var lines = [], line = '';
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!line) { line = w; continue; }
      if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
      else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    return lines;
  }

  function estimateMaxChars(width, fontSize) {
    // 한글 기준 글자 폭 ≈ fontSize * 0.98, 영문 혼용 여유 0.92
    return Math.max(6, Math.floor(width / (fontSize * 0.95)));
  }

  /**
   * 핀터레스트/카드뉴스 1장을 Canvas 명령 배열로 출력.
   * 좌표는 픽셀, 텍스트는 (x, baselineY). 브라우저 2D 컨텍스트에 순서대로 실행한다.
   *
   * @param {string|object} preset
   * @param {object} [opts]
   *   width=1080, height=1350, baseWidth=540 (배율 기준),
   *   kicker/title/body/cta/badge/brand,
   *   maxTitleLines=3, maxBodyLines=4
   * @returns {{width,height,scale,preset,commands,meta}}
   */
  function toCanvas(preset, opts) {
    opts = opts || {};
    var p = get(preset);
    if (opts.image) return composeWithImage(p, opts);
    var t = tokens(p);
    var W = opts.width || 1080;
    var H = opts.height || 1350;
    var scale = W / (opts.baseWidth || 540);
    var pad = Math.round(t.space.margin * scale);
    var innerW = W - pad * 2;
    var cmds = [];

    function px(v) { return Math.round(v * scale); }
    function estChars(width, size) { return Math.max(4, Math.floor(width / (size * 0.9))); }

    cmds.push({ type: 'rect', x: 0, y: 0, w: W, h: H, fill: t.color.bg, role: 'bg' });

    var badgeText = opts.badge ? String(opts.badge) : '';
    var bs = px(t.type.roles.micro.size);
    var badgeW = badgeText ? Math.round(badgeText.length * bs * 0.98 + px(28)) : 0;
    var badgeH = badgeText ? bs + px(16) : 0;
    var badgePos = (p.layout.badge && p.layout.badge.pos) || 'top-right';
    var badgeStyle = (p.layout.badge && p.layout.badge.style) || 'solid';
    var badgeRadius = /pill/.test(badgeStyle) ? badgeH / 2 : px(/sticker|rule/.test(badgeStyle) ? 0 : 4);

    // CTA 좌표(하단 고정)
    var ctaSize = px(t.type.roles.body.size);
    var ctaLabel = String(opts.cta || p.pin.ctaLabel);
    var ctaH = px(t.cta.height);
    var ctaW = Math.max(px(t.cta.minWidth || 160), Math.round(ctaLabel.length * ctaSize * 1.05 + px(48)));
    var ctaX = p.layout.cta.pos === 'bottom-right' ? W - pad - ctaW
      : (p.layout.cta.pos === 'inline-center' ? Math.round((W - ctaW) / 2) : pad);
    var brandH = opts.brand ? px(28) : 0;
    var ctaY = H - pad - ctaH - brandH;

    // 배지가 하단이면 CTA 위에, 상단이면 최상단에 놓는다.
    var badgeAtBottom = /bottom/.test(badgePos);
    var badgeY = badgeAtBottom ? ctaY - badgeH - px(16) : pad;
    var badgeX = /right/.test(badgePos) ? W - pad - badgeW
      : (/center/.test(badgePos) ? Math.round((W - badgeW) / 2) : pad);

    var y = pad;
    if (!badgeAtBottom && badgeText) {
      cmds.push({ type: 'rect', x: badgeX, y: badgeY, w: badgeW, h: badgeH, fill: t.color.accent, radius: badgeRadius, role: 'accent', part: 'badge' });
      cmds.push({
        type: 'text', x: badgeX + px(14), y: badgeY + badgeH / 2 + bs * 0.35, text: badgeText,
        size: bs, weight: 700, color: t.color.accentInk, tracking: '0em', align: 'left', role: 'badge'
      });
      if (badgePos === 'top-left') y = badgeY + badgeH + px(16);
    }

    // 상단 액센트 규칙(프리셋별 시그니처)
    if (p.id === 'swiss-magazine') {
      cmds.push({ type: 'rect', x: pad, y: y, w: px(48), h: px(4), fill: t.color.accent, role: 'accent', part: 'rule' });
      y += px(24);
    } else if (p.id === 'neo-brutalism') {
      cmds.push({ type: 'rect', x: pad, y: y, w: innerW, h: px(8), fill: t.color.ink, role: 'ink', part: 'rule' });
      y += px(28);
    } else if (p.id === 'dark-neon') {
      cmds.push({ type: 'rect', x: pad, y: y, w: innerW, h: px(2), fill: t.color.accent, role: 'accent', part: 'rule' });
      y += px(24);
    }

    if (opts.kicker) {
      var ks = px(t.type.roles.micro.size);
      cmds.push({
        type: 'text', x: pad, y: y + ks, text: String(opts.kicker).toUpperCase(),
        size: ks, weight: t.type.roles.micro.weight, color: t.color.accent,
        tracking: t.type.roles.micro.tracking, align: 'left', role: 'kicker'
      });
      y += ks + px(12);
    }

    // 본문·CTA가 들어갈 하단 경계
    var bottomLimit = badgeAtBottom ? badgeY - px(16) : ctaY - px(24);
    var brandLine = opts.brand ? 1 : 0;

    // ── 제목: 최대 줄 수에 맞춰 폰트를 줄여가며 맞춘다 ──
    var title = String(opts.title || '제목을 입력하세요');
    var maxTitleLines = opts.maxTitleLines || 3;
    var titleMax = px(t.type.roles.display.size);
    var titleMin = Math.max(px(t.type.roles.h2.size), Math.round(titleMax * 0.45));
    var titleSize = titleMax, titleLines = [];
    for (var size = titleMax; size >= titleMin; size -= Math.max(1, Math.round(scale))) {
      var lines = wrapText(title, estChars(innerW, size));
      var height = lines.length * Math.round(size * t.type.roles.display.lineHeightRatio);
      if (lines.length <= maxTitleLines && (y + height) <= bottomLimit - px(40)) {
        titleSize = size; titleLines = lines; break;
      }
      titleSize = size; titleLines = lines;
    }
    if (titleLines.length > maxTitleLines) {
      titleLines = titleLines.slice(0, maxTitleLines);
      var last = titleLines[titleLines.length - 1];
      titleLines[titleLines.length - 1] = last.length > 1 ? last.slice(0, -1) + '…' : last + '…';
    }

    var titleLH = Math.round(titleSize * t.type.roles.display.lineHeightRatio);
    titleLines.forEach(function (line, i) {
      cmds.push({
        type: 'text', x: pad, y: y + titleSize + i * titleLH, text: line,
        size: titleSize, weight: t.type.roles.display.weight, color: t.color.ink,
        tracking: t.type.roles.display.tracking,
        align: p.id === 'minimal-luxury' ? 'center' : 'left',
        role: 'title', line: i
      });
    });
    y += titleLines.length * titleLH + px(20);

    // ── 본문: 남는 공간에 맞춰 줄 수 제한 ──
    var bodyLines = [];
    var bodySize = px(t.type.roles.body.size);
    var bodyLH = Math.round(bodySize * t.type.roles.body.lineHeightRatio);
    if (opts.body) {
      var room = bottomLimit - y;
      var maxBodyLines = Math.min(opts.maxBodyLines || 4, Math.max(0, Math.floor(room / bodyLH)));
      bodyLines = wrapText(opts.body, estChars(innerW, bodySize));
      if (bodyLines.length > maxBodyLines) {
        bodyLines = bodyLines.slice(0, maxBodyLines);
        if (bodyLines.length) {
          var bl = bodyLines[bodyLines.length - 1];
          bodyLines[bodyLines.length - 1] = bl.length > 1 ? bl.slice(0, -1) + '…' : bl + '…';
        }
      }
      bodyLines.forEach(function (line, i) {
        cmds.push({
          type: 'text', x: pad, y: y + bodySize + i * bodyLH, text: line,
          size: bodySize, weight: t.type.roles.body.weight, color: t.color.sub,
          tracking: t.type.roles.body.tracking,
          align: p.id === 'minimal-luxury' ? 'center' : 'left',
          role: 'body', line: i
        });
      });
    }

    if (badgeAtBottom && badgeText) {
      cmds.push({ type: 'rect', x: badgeX, y: badgeY, w: badgeW, h: badgeH, fill: t.color.accent, radius: badgeRadius, role: 'accent', part: 'badge' });
      cmds.push({
        type: 'text', x: badgeX + px(14), y: badgeY + badgeH / 2 + bs * 0.35, text: badgeText,
        size: bs, weight: 700, color: t.color.accentInk, tracking: '0em', align: 'left', role: 'badge'
      });
    }

    var ctaRadius = Math.min(ctaH / 2, px(t.cta.radius));
    cmds.push({
      type: 'rect', x: ctaX, y: ctaY, w: ctaW, h: ctaH, fill: t.color.accent,
      radius: ctaRadius, role: 'accent', part: 'cta'
    });
    cmds.push({
      type: 'text', x: ctaX + ctaW / 2, y: ctaY + ctaH / 2 + ctaSize * 0.35,
      text: ctaLabel, size: ctaSize, weight: 700,
      color: t.color.accentInk, tracking: '0em', align: 'center', role: 'cta'
    });

    if (opts.brand) {
      cmds.push({
        type: 'text', x: pad, y: H - pad, text: String(opts.brand),
        size: px(t.type.roles.caption.size), weight: 500, color: t.color.sub,
        tracking: '0em', align: 'left', role: 'brand'
      });
    }

    var accentArea = 0;
    cmds.forEach(function (c) { if (c.type === 'rect' && c.role === 'accent') accentArea += c.w * c.h; });

    var overflow = cmds.some(function (c) {
      if (c.type === 'rect') return c.x < 0 || c.y < 0 || c.x + c.w > W + 0.5 || c.y + c.h > H + 0.5;
      return c.x < 0 || c.x > W || c.y < 0 || c.y > H;
    });

    return {
      width: W,
      height: H,
      scale: scale,
      preset: p.id,
      commands: cmds,
      meta: {
        accentAreaRatio: round(accentArea / (W * H), 4),
        targetRatio: 0.1,
        titleSize: titleSize,
        titleLines: titleLines.length,
        bodyLines: bodyLines.length,
        overflow: overflow,
        badge: { pos: badgePos, style: badgeStyle },
        contrast: {
          title: contrastRatio(t.color.ink, t.color.bg),
          body: contrastRatio(t.color.sub, t.color.bg),
          cta: contrastRatio(t.color.accentInk, t.color.accent)
        },
        canvas: { width: W, height: H, ratio: round(W / H, 3) },
        pin: { ratio: '2:3 권장', recommended: '1000×1500', current: W + '×' + H }
      }
    };
  }

  /** Canvas 명령을 2D 컨텍스트에 실행하는 브라우저 헬퍼 소스(문자열).
   *  plan.images = { 'url': HTMLImageElement } 를 주면 실사 이미지가 들어간다.
   */
  function canvasRunnerSource() {
    return [
      'function hexToRgba(hex, a) {',
      '  var h = String(hex || "#000000").replace("#", "");',
      '  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];',
      '  var r = parseInt(h.slice(0,2),16) || 0, g = parseInt(h.slice(2,4),16) || 0, b = parseInt(h.slice(4,6),16) || 0;',
      '  return "rgba(" + r + "," + g + "," + b + "," + a + ")";',
      '}',
      'function roundRect(ctx, x, y, w, h, r) {',
      '  var rr = Math.min(r, w/2, h/2);',
      '  ctx.beginPath();',
      '  ctx.moveTo(x+rr, y);',
      '  ctx.arcTo(x+w, y, x+w, y+h, rr);',
      '  ctx.arcTo(x+w, y+h, x, y+h, rr);',
      '  ctx.arcTo(x, y+h, x, y, rr);',
      '  ctx.arcTo(x, y, x+w, y, rr);',
      '  ctx.closePath();',
      '}',
      'function applyGrain(ctx, x, y, w, h, amount, seed) {',
      '  if (!amount || amount <= 0) return;',
      '  try {',
      '    var cw = ctx.canvas ? ctx.canvas.width : Math.round(w);',
      '    var ch = ctx.canvas ? ctx.canvas.height : Math.round(h);',
      '    var data = ctx.getImageData(0, 0, cw, ch);',
      '    var d = data.data;',
      '    var rnd = (seed || 1) >>> 0;',
      '    var span = amount * 255 * 2;',
      '    for (var i = 0; i < d.length; i += 4) {',
      '      rnd = (Math.imul(rnd, 1664525) + 1013904223) >>> 0;',
      '      var n = ((rnd >>> 16) / 65535 - 0.5) * span;',
      '      d[i] = d[i] + n; d[i + 1] = d[i + 1] + n; d[i + 2] = d[i + 2] + n;',
      '    }',
      '    ctx.putImageData(data, 0, 0);',
      '  } catch (err) { /* 픽셀을 읽을 수 없는 캔버스(교차 출처)면 질감만 생략 */ }',
      '}',
      'function drawDesign(ctx, plan) {',
      '  plan.commands.forEach(function (c) {',
      '    if (c.type === "rect") {',
      '      if (c.stroke) {',
      '        ctx.strokeStyle = c.stroke;',
      '        ctx.lineWidth = c.lineWidth || 1;',
      '        if (c.radius) { roundRect(ctx, c.x, c.y, c.w, c.h, c.radius); ctx.stroke(); }',
      '        else { ctx.strokeRect(c.x, c.y, c.w, c.h); }',
      '      }',
      '      if (c.fill && c.fill !== "rgba(0,0,0,0)") {',
      '        ctx.fillStyle = c.fill;',
      '        if (c.radius) { roundRect(ctx, c.x, c.y, c.w, c.h, c.radius); ctx.fill(); }',
      '        else { ctx.fillRect(c.x, c.y, c.w, c.h); }',
      '      }',
      '    } else if (c.type === "image") {',
      '      var img = plan.images && plan.images[c.src];',
      '      if (img && img.width) {',
      '        var target = c.w / c.h;',
      '        var sw = img.width, sh = img.height, sx = 0, sy = 0;',
      '        if (sw / sh > target) { sw = sh * target; sx = (img.width - sw) / 2; }',
      '        else { sh = sw / target; sy = (img.height - sh) / 2; }',
      '        if (c.focal === "upper-third") sy = Math.min(sy, (img.height - sh) * 0.3);',
      '        if (c.focal === "left") sx = 0;',
      '        ctx.save(); ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); ctx.clip();',
      '        ctx.drawImage(img, sx, sy, sw, sh, c.x, c.y, c.w, c.h);',
      '        ctx.restore();',
      '      } else {',
      '        ctx.fillStyle = plan.placeholderColor || "#E6E8EE";',
      '        ctx.fillRect(c.x, c.y, c.w, c.h);',
      '        ctx.fillStyle = plan.placeholderInk || "#8A90A0";',
      '        ctx.textAlign = "center";',
      '        ctx.font = Math.round(Math.min(c.w, c.h) * 0.05) + "px sans-serif";',
      '        ctx.fillText("이미지 영역", c.x + c.w / 2, c.y + c.h / 2);',
      '      }',
      '    } else if (c.type === "scrim") {',
      '      var band = c.height || 1;',
      '      var y0 = c.y + c.h * (1 - band);',
      '      var g = ctx.createLinearGradient(0, y0, 0, c.y + c.h);',
      '      g.addColorStop(0, hexToRgba(c.color, 0));',
      '      g.addColorStop(1, hexToRgba(c.color, c.opacity));',
      '      ctx.fillStyle = g;',
      '      ctx.fillRect(c.x, y0, c.w, c.h * band);',
      '    } else if (c.type === "grain") {',
      '      applyGrain(ctx, c.x, c.y, c.w, c.h, c.amount, c.seed);',
      '    } else if (c.type === "text") {',
      '      ctx.fillStyle = c.color;',
      '      ctx.textAlign = c.align === "center" ? "center" : (c.align === "right" ? "right" : "left");',
      '      ctx.textBaseline = "alphabetic";',
      '      ctx.font = c.weight + " " + c.size + "px " + (c.fontFamily || plan.fontFamily || "Pretendard, sans-serif");',
      '      if (c.tracking) {',
      '        var sp = parseFloat(c.tracking) * c.size;',
      '        if (isFinite(sp) && Math.abs(sp) > 0.05) { ctx.letterSpacing = sp + "px"; } else { ctx.letterSpacing = "0px"; }',
      '      }',
      '      ctx.fillText(c.text, c.x, c.y);',
      '    }',
      '  });',
      '}'
    ].join('\n');
  }

  /* ==========================================================
     9. v2 · 무한 레퍼런스 · AI 티 0% · 브랜드 고정
     ----------------------------------------------------------
     8개 고정 프리셋의 한계를 넘는다.
       9-A 폰트 믹스(한글 세리프×산세리프) + 그레인 질감
       9-B 시각 밀도(글자 수) 다이어트 경고
       9-C 핀터레스트·비핸스 1클릭 레퍼런스 검색 URL
       9-D 레퍼런스 사진 해부 프롬프트 → 블루프린트 JSON
       9-E 블루프린트 → HTML·CSS·Canvas 즉시 렌더 (무제한 레이아웃)
       9-F 브랜드 키트 고정·저장·불러오기
     ========================================================== */

  var V2 = {
    schema: 'designref.v2',
    blueprintSchema: 'designref.blueprint/2',
    brandKitSchema: 'designref.brandkit/2',
    densityLimit: 25
  };

  /* ── 9-A. 한글 폰트 믹스 ─────────────────────────────── */

  /* v2 폰트 스택. 기존 4종은 그대로 두고 필요한 것만 덧붙인다. */
  FONT_STACKS['serif-heading'] = '"Noto Serif KR", "Noto Serif CJK KR", "Nanum Myeongjo", "Apple SD Gothic Neo", Georgia, "Times New Roman", serif';
  FONT_STACKS['plex'] = '"IBM Plex Sans KR", "Pretendard", "Noto Sans CJK KR", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

  var FONT_MIXES = [
    {
      id: 'myeongjo-title',
      name: '명조 제목 · 고딕 본문',
      title: { family: 'serif-heading', style: 'serif', weight: 700, tracking: '-0.02em', lineHeight: 1.29, transform: 'none' },
      body: { family: 'sans', style: 'sans', weight: 400, tracking: '0em', lineHeight: 1.72 },
      note: '한국 신문·잡지의 표준 조합. 세리프 제목이 정보를 권위 있게 만들고, 고딕 본문이 읽기를 편하게 한다.'
    },
    {
      id: 'gothic-title',
      name: '고딕 제목 · 명조 본문',
      title: { family: 'sans', style: 'sans', weight: 800, tracking: '-0.03em', lineHeight: 1.14, transform: 'none' },
      body: { family: 'serif-heading', style: 'serif', weight: 400, tracking: '0em', lineHeight: 1.75 },
      note: '표지에서는 강하고, 본문에서 차분해지는 잡지 조합. 인용·에세이에 어울린다.'
    },
    {
      id: 'plex-editorial',
      name: 'IBM Plex 제목 · Pretendard 본문',
      title: { family: 'plex', style: 'plex', weight: 600, tracking: '-0.015em', lineHeight: 1.24, transform: 'none' },
      body: { family: 'sans', style: 'sans', weight: 400, tracking: '0em', lineHeight: 1.7 },
      note: '국제 에디토리얼 느낌. 숫자·영문이 섞인 B2B 제안서에서 특히 깔끔하다.'
    },
    {
      id: 'pretendard-only',
      name: 'Pretendard 단일',
      title: { family: 'sans', style: 'sans', weight: 800, tracking: '-0.03em', lineHeight: 1.16, transform: 'none' },
      body: { family: 'sans', style: 'sans', weight: 400, tracking: '0em', lineHeight: 1.68 },
      note: '가장 안전한 단일 패밀리. 웹·앱 화면과 카드뉴스 기본값.'
    },
    {
      id: 'rounded-pop',
      name: '라운드 제목 · 산세리프 본문',
      title: { family: 'rounded', style: 'rounded', weight: 900, tracking: '-0.035em', lineHeight: 1.12, transform: 'none' },
      body: { family: 'sans', style: 'sans', weight: 500, tracking: '0em', lineHeight: 1.62 },
      note: '숫자·이모지가 많은 이벤트 카드에 맞는 부드러운 조합.'
    },
    {
      id: 'serif-all',
      name: '명조 올 세리프',
      title: { family: 'serif-heading', style: 'serif', weight: 600, tracking: '-0.01em', lineHeight: 1.34, transform: 'none' },
      body: { family: 'serif-heading', style: 'serif', weight: 400, tracking: '0.005em', lineHeight: 1.82 },
      note: '시·에세이·브랜드 스토리. 글자 수가 적을 때만 쓴다.'
    }
  ];

  var FONT_MIX_INDEX = (function () {
    var m = {};
    FONT_MIXES.forEach(function (f) { m[f.id] = f; });
    return m;
  })();

  /** 명조/고딕/라운드/플렉스 별칭을 스택 키로 통일 */
  var FONT_STYLE_ALIASES = {
    serif: 'serif-heading', 'serif-title': 'serif-heading', myeongjo: 'serif-heading', '명조': 'serif-heading',
    sans: 'sans', gothic: 'sans', '고딕': 'sans', pretendard: 'sans',
    rounded: 'rounded', round: 'rounded', '라운드': 'rounded',
    plex: 'plex', 'ibm-plex': 'plex', ibm: 'plex',
    mono: 'mono', code: 'mono'
  };

  function resolveFontFamily(v, fallback) {
    var s = String(v === undefined || v === null ? '' : v).toLowerCase().trim();
    if (!s) return fallback || 'sans';
    if (FONT_STYLE_ALIASES[s]) return FONT_STYLE_ALIASES[s];
    if (FONT_STACKS[s]) return s;
    if (/serif|명조|myeongjo|바탕/.test(s)) return 'serif-heading';
    if (/rounded|round|둥근|라운드/.test(s)) return 'rounded';
    if (/plex|ibm/.test(s)) return 'plex';
    if (/mono|고정폭|코드/.test(s)) return 'mono';
    if (/sans|고딕|gothic|pretendard|돋움/.test(s)) return 'sans';
    return fallback || 'sans';
  }

  function listFontMixes() {
    return FONT_MIXES.map(function (f) {
      return {
        id: f.id, name: f.name, note: f.note,
        title: { family: f.title.family, weight: f.title.weight },
        body: { family: f.body.family, weight: f.body.weight }
      };
    });
  }

  /** 폰트 믹스 조회. id가 없으면 기본(명조 제목·고딕 본문). */
  function fontMix(id) {
    if (id === undefined || id === null || id === '') return FONT_MIX_INDEX['myeongjo-title'];
    var found = FONT_MIX_INDEX[String(id)];
    if (!found) throw new Error('unknown font mix: ' + id);
    return found;
  }

  /** { title: 스택, body: 스택 } */
  function fontMixStacks(id) {
    var m = fontMix(id);
    return { title: fontStack(m.title.family), body: fontStack(m.body.family) };
  }

  /** 폰트 믹스를 CSS 변수 3줄로. */
  function fontMixCSS(id, prefix) {
    var m = fontMix(id);
    var px = prefix || 'pm';
    return [
      '--' + px + '-font-title: ' + m.title.family + ';',
      '--' + px + '-font-body: ' + m.body.family + ';',
      '--' + px + '-title-weight: ' + m.title.weight + ';'
    ].join('\n');
  }

  /* ── 9-A-2. 종이·필름 그레인 ─────────────────────────── */

  var GRAIN_PRESETS = [
    { id: 'none', name: '없음', amount: 0, freq: 0, note: '디지털 그대로. 사진이 이미 질감을 갖고 있을 때.' },
    { id: 'film-2', name: '필름 그레인 2%', amount: 0.02, freq: 0.9, note: '가장 안전한 2%. AI가 만든 매끈한 면을 0.5초 만에 아날로그로 바꾼다.' },
    { id: 'paper-3', name: '종이 질감 3%', amount: 0.03, freq: 0.7, note: '크림·베이지 배경과 세리프 제목에 맞는 인쇄물 질감.' },
    { id: 'newsprint-45', name: '신문지 4.5%', amount: 0.045, freq: 0.55, note: '거친 인쇄. 강한 브루탈·빈티지 톤에만. 본문 가독성은 확인할 것.' }
  ];

  var GRAIN_INDEX = (function () {
    var m = {};
    GRAIN_PRESETS.forEach(function (g) { m[g.id] = g; });
    return m;
  })();

  function listGrains() {
    return GRAIN_PRESETS.map(function (g) {
      return { id: g.id, name: g.name, amount: g.amount, note: g.note };
    });
  }

  function grainPreset(id) {
    if (id === undefined || id === null || id === '') return GRAIN_INDEX.none;
    if (typeof id === 'number') {
      return { id: 'custom', name: '커스텀 ' + Math.round(clamp(id, 0, 0.06) * 100) + '%', amount: clamp(id, 0, 0.06), freq: 0.75, note: '직접 지정한 그레인.' };
    }
    var found = GRAIN_INDEX[String(id)];
    if (!found) throw new Error('unknown grain: ' + id);
    return found;
  }

  /** 그레인 입력(불리언·숫자·id·{amount})을 {id, amount}로 정규화 */
  function normalizeGrain(input) {
    if (input === true) return { id: 'paper-3', amount: 0.03 };
    if (input === false || input === undefined || input === null || input === '') return { id: 'none', amount: 0 };
    if (typeof input === 'number') {
      var g = grainPreset(clamp(input, 0, 0.06));
      return { id: g.id, amount: g.amount };
    }
    if (typeof input === 'object') {
      var amt = input.amount !== undefined ? Number(input.amount) : null;
      if (amt !== null && isFinite(amt)) {
        var idr = input.id && GRAIN_INDEX[input.id] ? input.id : 'custom';
        return { id: idr, amount: round(clamp(amt, 0, 0.06), 3) };
      }
      return normalizeGrain(input.id);
    }
    var byId = grainPreset(String(input));
    return { id: byId.id, amount: byId.amount };
  }

  function grainAmount(input) { return normalizeGrain(input).amount; }

  /** SVG feTurbulence 노이즈 타일 (HTML/CSS 오버레이용, 결정적) */
  function grainSVGDataUri(opts) {
    opts = opts || {};
    var freq = opts.freq === undefined ? 0.8 : clamp(Number(opts.freq) || 0.8, 0.2, 1.4);
    var size = Math.round(clamp(Number(opts.size) || 120, 40, 240));
    var seed = Math.round(Number(opts.seed) || 7);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '">' +
      '<filter id="n" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq + '" numOctaves="3" seed="' + seed + '" stitchTiles="stitch"/>' +
      '<feColorMatrix type="saturate" values="0"/>' +
      '</filter>' +
      '<rect width="100%" height="100%" filter="url(#n)" opacity="0.6"/>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /** position:absolute 오버레이에 바로 넣는 CSS 선언 */
  function grainCSS(opts) {
    opts = opts || {};
    var g = normalizeGrain(opts.grain !== undefined ? opts.grain : opts);
    if (g.amount <= 0) return 'display:none;';
    var opacity = opts.opacity === undefined ? round(clamp(g.amount * 2.4, 0.02, 0.16), 3) : clamp(Number(opts.opacity) || 0, 0, 1);
    /* 인라인 style="…" 안에 들어가므로 홑따옴표를 쓴다. 쌍따옴표는 속성을 끊어 질감이 사라진다. */
    return "background-image:url('" + grainSVGDataUri({ freq: opts.freq, seed: opts.seed }) + "');" +
      'background-repeat:repeat;opacity:' + opacity + ';mix-blend-mode:multiply;';
  }

  /** 카드 위에 얹는 그레인 div (장식이므로 aria-hidden) */
  function grainOverlayHTML(opts) {
    opts = opts || {};
    var g = normalizeGrain(opts.grain !== undefined ? opts.grain : opts);
    if (g.amount <= 0) return '';
    return '<div class="bp-grain" aria-hidden="true" style="position:absolute;inset:0;pointer-events:none;z-index:9;' +
      grainCSS({ grain: g, opacity: opts.opacity, seed: opts.seed }) + '"></div>';
  }

  /** Canvas용 그레인 명령 */
  function grainCanvasCommands(opts) {
    opts = opts || {};
    var g = normalizeGrain(opts.grain !== undefined ? opts.grain : opts);
    if (g.amount <= 0) return [];
    var W = opts.width || 1080, H = opts.height || 1350;
    return [{
      type: 'grain', x: 0, y: 0, w: W, h: H,
      amount: g.amount, seed: Math.round(Number(opts.seed) || 11), role: 'grain'
    }];
  }

  /* ── 9-B. 시각 밀도(글자 수) 다이어트 ─────────────────── */

  function textChars(s) {
    var t = String(s === null || s === undefined ? '' : s);
    var arr = Array.from ? Array.from(t) : t.split('');
    var n = 0;
    for (var i = 0; i < arr.length; i++) if (!/\s/.test(arr[i])) n++;
    return n;
  }

  var DENSITY_FIELDS = [
    { key: 'title', label: '제목', weight: 1 },
    { key: 'kicker', label: '키커', weight: 0.6 },
    { key: 'body', label: '본문', weight: 1 },
    { key: 'badge', label: '배지', weight: 0.6 },
    { key: 'cta', label: 'CTA', weight: 0.4 }
  ];

  /**
   * 한 슬라이드/카드의 글자 수를 재고 AI 요약본 느낌을 경고한다.
   * @param {string|object|Array} content  문자열 또는 {title,body,cta,badge,kicker}
   * @param {object} [opts] { limit=25 }
   */
  function checkVisualDensity(content, opts) {
    opts = opts || {};
    var limit = Math.round(clamp(Number(opts.limit) || V2.densityLimit, 8, 200));

    if (Array.isArray(content)) {
      var items = content.map(function (item, i) {
        var r = checkVisualDensity(item, opts);
        return { index: i, title: (item && item.title) || '', level: r.level, over: r.over, counts: r.counts, suggestions: r.suggestions, message: r.message };
      });
      var overCount = items.filter(function (x) { return x.over; }).length;
      var worst = items.slice().sort(function (a, b) { return b.counts.total - a.counts.total; })[0] || null;
      return {
        ok: overCount === 0,
        limit: limit,
        cards: items.length,
        overCards: overCount,
        worst: worst,
        items: items,
        message: overCount === 0
          ? items.length + '장 모두 ' + limit + '자 이하입니다. AI 요약본 느낌이 나지 않습니다.'
          : items.length + '장 중 ' + overCount + '장이 ' + limit + '자를 넘습니다. 가장 긴 장은 ' + worst.counts.total + '자입니다.'
      };
    }

    var src = (typeof content === 'string') ? { title: content } : (content || {});
    var counts = {}, items2 = [], total = 0;
    DENSITY_FIELDS.forEach(function (f) {
      var n = textChars(src[f.key]);
      counts[f.key] = n;
      total += Math.round(n * f.weight);
      items2.push({ field: f.key, label: f.label, chars: n, over: n > limit });
    });
    counts.total = total;

    var ratio = total / limit;
    var level = ratio <= 1 ? 'lean' : (ratio <= 1.6 ? 'dense' : 'summary');
    var suggestions = [];

    if (counts.title > 18) suggestions.push('제목 ' + counts.title + '자 → 18자 이하. 수식어·조사를 먼저 지우세요.');
    if (counts.body > 14) suggestions.push('본문 ' + counts.body + '자 → 14자 한 문장. 나머지는 다음 장으로 넘기세요.');
    if (counts.badge > 8) suggestions.push('배지 ' + counts.badge + '자 → 8자 이하(예: “37세트 남음”).');
    if (counts.kicker > 10) suggestions.push('키커 ' + counts.kicker + '자 → 10자 이하 짧은 라벨.');
    if (level === 'lean' && suggestions.length === 0) suggestions.push('지금 밀도가 좋습니다. 여백을 늘려도 됩니다.');
    if (level !== 'lean' && suggestions.length === 0) suggestions.push('본문을 한 문장 덜어내면 AI 요약본 느낌이 사라집니다.');

    var message = level === 'lean'
      ? '한 장에 ' + total + '자. 한 문장 원칙을 지켰습니다.'
      : level === 'dense'
        ? '한 장에 ' + total + '자 — 조금 빽빽합니다. ' + limit + '자 이하로 줄이면 훨씬 선명합니다.'
        : '한 장에 ' + total + '자 — AI가 요약한 문서처럼 보입니다. 제목만 남기고 본문은 다음 장으로 넘기세요.';

    return {
      ok: level === 'lean',
      limit: limit,
      level: level,
      label: level === 'lean' ? '적정' : (level === 'dense' ? '빽빽함' : 'AI 요약본 위험'),
      over: total > limit,
      counts: counts,
      fields: items2,
      suggestions: suggestions.slice(0, 4),
      message: message
    };
  }

  /* ── 9-C. 핀터레스트·비핸스 1클릭 레퍼런스 검색 ───────── */

  var REFERENCE_QUERY_MAP = {
    industry: {
      '뷰티·패션': { en: ['beauty editorial poster', 'skincare product photography layout'], ko: ['뷰티 카드뉴스 디자인', '화장품 상세페이지 디자인'] },
      '테크·IT': { en: ['saas landing page design', 'tech product card layout'], ko: ['SaaS 랜딩페이지 디자인', '앱 소개 카드뉴스'] },
      '푸드·리빙': { en: ['food packaging editorial', 'interior living brand design'], ko: ['푸드 카드뉴스 디자인', '리빙 브랜드 디자인'] },
      '금융·B2B': { en: ['b2b proposal deck layout', 'finance report editorial'], ko: ['제안서 표지 디자인', 'B2B 리포트 디자인'] },
      '숏폼 바이럴': { en: ['viral instagram carousel', 'bold typography poster'], ko: ['숏폼 썸네일 디자인', '임팩트 포스터'] }
    },
    purpose: {
      cardnews: { en: ['card news design', 'instagram carousel layout'], ko: ['카드뉴스 디자인', '인스타 캐러셀 디자인'] },
      detail: { en: ['product detail page', 'ecommerce product layout'], ko: ['상세페이지 디자인', '상품 상세 레이아웃'] },
      saas: { en: ['saas dashboard ui', 'app screen design'], ko: ['앱 화면 디자인', '대시보드 UI'] },
      proposal: { en: ['proposal deck design', 'editorial report layout'], ko: ['제안서 디자인', '보고서 레이아웃'] }
    },
    mood: {
      '고급': { en: ['luxury minimal editorial', 'quiet luxury layout'], ko: ['고급스러운 디자인', '럭셔리 브랜딩'] },
      '정밀': { en: ['swiss typography grid', 'information design poster'], ko: ['스위스 타이포그래피', '정보 디자인'] },
      '따뜻함': { en: ['warm analog editorial', 'cream paper texture design'], ko: ['따뜻한 감성 디자인', '크림색 배경 디자인'] },
      '임팩트': { en: ['bold impact poster', 'high contrast typography'], ko: ['강렬한 포스터', '임팩트 타이포'] },
      '발랄': { en: ['vivid pop design', 'playful sticker layout'], ko: ['팝 카드뉴스', '발랄한 디자인'] },
      '정돈': { en: ['clean minimal layout', 'calm editorial design'], ko: ['깔끔한 디자인', '미니멀 레이아웃'] }
    }
  };

  var REFERENCE_SITES = {
    pinterest: { id: 'pinterest', label: 'Pinterest', build: function (q) { return 'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(q); } },
    behance: { id: 'behance', label: 'Behance', build: function (q) { return 'https://www.behance.net/search/projects?search=' + encodeURIComponent(q); } }
  };

  var DENSITY_QUERY = {
    high: { en: 'information dense layout', ko: '정보 많은 레이아웃' },
    low: { en: 'minimal one sentence poster', ko: '한 문장 포스터' },
    medium: { en: 'balanced editorial layout', ko: '균형 잡힌 레이아웃' }
  };

  /**
   * 콘텐츠 맥락에 맞는 핀터레스트·비핸스 검색 URL을 만든다.
   * @param {object|string} ctx {title,body,text,industry,mood,purpose}
   * @param {object} [opts] { lang:'both'|'en'|'ko', sites:['pinterest','behance'], maxQueries=5 }
   */
  function buildReferenceSearchUrls(ctx, opts) {
    opts = opts || {};
    var context = (ctx && ctx.industry !== undefined && ctx.signals) ? ctx : analyzeContentContext(ctx);
    var lang = opts.lang || 'both';
    var sites = opts.sites || ['pinterest', 'behance'];
    var maxQueries = Math.round(clamp(Number(opts.maxQueries) || 5, 2, 8));

    var ind = REFERENCE_QUERY_MAP.industry[context.industry] || REFERENCE_QUERY_MAP.industry['테크·IT'];
    var pur = REFERENCE_QUERY_MAP.purpose[context.purpose] || REFERENCE_QUERY_MAP.purpose.cardnews;
    var moodKey = Object.keys(REFERENCE_QUERY_MAP.mood).filter(function (k) { return context.mood.indexOf(k) >= 0 || k.indexOf(context.mood) >= 0; })[0] || '정돈';
    var moo = REFERENCE_QUERY_MAP.mood[moodKey];
    var den = DENSITY_QUERY[context.density.level] || DENSITY_QUERY.medium;

    var candidates = [
      { lang: 'en', q: moo.en[0] + ' ' + pur.en[0], why: '무드(' + moodKey + ') + 목적(' + context.purposeLabel + ')을 함께 건 첫 검색' },
      { lang: 'en', q: ind.en[0] + ' ' + moo.en[0], why: context.industry + ' 업종의 무드 레퍼런스' },
      { lang: 'ko', q: ind.ko[0] + ' ' + pur.ko[0], why: '한국어 카드·상세 디자인 실사례' },
      { lang: 'en', q: den.en + ' ' + pur.en[1], why: '글자 밀도 ' + context.density.level + '에 맞는 구도' },
      { lang: 'ko', q: moo.ko[0], why: '무드 단독 검색으로 색·질감만 훑기' },
      { lang: 'en', q: ind.en[1], why: context.industry + ' 업종의 두 번째 시선' }
    ];

    if (lang === 'en' || lang === 'ko') {
      candidates = candidates.filter(function (c) { return c.lang === lang; });
    }

    var seen = {}, queries = [];
    candidates.forEach(function (c) {
      var key = c.lang + '|' + c.q.toLowerCase();
      if (seen[key] || queries.length >= maxQueries) return;
      seen[key] = 1;
      queries.push({ lang: c.lang, q: c.q, why: c.why });
    });

    var links = [];
    queries.forEach(function (q) {
      sites.forEach(function (siteId) {
        var site = REFERENCE_SITES[siteId];
        if (!site) return;
        links.push({ site: site.id, siteLabel: site.label, lang: q.lang, q: q.q, label: site.label + ' · ' + q.q, url: site.build(q.q) });
      });
    });

    return {
      context: context,
      queries: queries,
      links: links,
      primary: links[0] || null,
      count: links.length,
      note: '핀터레스트는 저장 수가 많은 핀을, 비핸스는 프로젝트 단위를 보여줍니다. 같은 검색어라도 두 곳의 결과를 비교해 구도만 가져오세요.'
    };
  }

  /* ── 9-D. 레퍼런스 사진 해부 프롬프트 + 블루프린트 JSON ── */

  var BLUEPRINT_SCHEMA = {
    canvas: { ratio: '4:5' },
    margin: 0.06,
    title: { x: 0.56, y: 0.14, w: 0.38, h: 0.26, size: 0.058, align: 'left' },
    body: { x: 0.56, y: 0.44, w: 0.38, h: 0.22, size: 0.026 },
    image: { x: 0, y: 0, w: 0.5, h: 1, ratio: '4:5', fill: true, focal: 'center' },
    cta: { x: 0.56, y: 0.86, w: 0.34, h: 0.07 },
    badge: { x: 0.05, y: 0.06, style: 'rule' },
    colors: { bg: '#F3EDE3', surface: '#FFFFFF', ink: '#221E1A', sub: '#6B6156', accent: '#B4462A' },
    font: { title: 'serif', body: 'sans', titleWeight: 700, bodyWeight: 400 },
    decor: { border: 0, hardShadow: false, paperTexture: true, grain: 'paper-3', rule: true, numbering: '01/05' }
  };

  var BLUEPRINT_EXAMPLE = {
    canvas: { ratio: '4:5' },
    margin: 0.06,
    title: { x: 0.56, y: 0.16, w: 0.38, h: 0.24, size: 0.058, align: 'left' },
    body: { x: 0.56, y: 0.42, w: 0.38, h: 0.2, size: 0.026 },
    image: { x: 0, y: 0, w: 0.52, h: 1, ratio: '4:5', fill: true, focal: 'center' },
    cta: { x: 0.56, y: 0.85, w: 0.34, h: 0.075 },
    badge: { x: 0.05, y: 0.05, style: 'rule' },
    colors: { bg: '#F3EDE3', surface: '#FFFFFF', ink: '#221E1A', sub: '#6B6156', accent: '#B4462A', accentInk: '#FFFFFF' },
    font: { title: 'serif', body: 'sans', titleWeight: 700, bodyWeight: 400 },
    decor: { border: 0, hardShadow: false, paperTexture: true, grain: 'paper-3', rule: true, numbering: '01/05' }
  };

  /**
   * ChatGPT/Claude/Gemini에 레퍼런스 사진 1장과 함께 붙여넣을 해부 프롬프트.
   * @param {object} [opts] { title,body,industry,mood,purpose,brand,ratio,extra,example }
   */
  function buildVisionBlueprintPrompt(opts) {
    opts = opts || {};
    var ctx = (opts.text || opts.title || opts.body || opts.industry)
      ? analyzeContentContext({ title: opts.title, body: opts.body, text: opts.text, industry: opts.industry, mood: opts.mood, purpose: opts.purpose })
      : null;
    var ratio = opts.ratio || '4:5';
    var extra = String(opts.extra || '').trim();

    var lines = [
      '너는 20년 경력의 편집 디자이너다. 내가 첨부한 레퍼런스 이미지 1장을 해부해서, 같은 구도를 코드로 다시 그릴 수 있는 설계도(JSON)로 바꿔라.',
      '',
      '[목표]',
      '- 결과물은 원본과 90% 같은 인상이어야 한다: 제목 위치·크기, 사진 영역, 여백 비율, 색, 폰트 인상, 장식.',
      '- 감상이나 설명은 쓰지 말고 JSON 하나만 출력한다. 코드블록(```)도 쓰지 않는다.',
      '',
      '[측정 규칙]',
      '- 모든 좌표·크기는 이미지 기준 0~1 비율이다. 좌상단이 (0,0), 우하단이 (1,1). 소수 셋째 자리까지.',
      '- x,y는 각 영역의 좌상단, w,h는 너비·높이다. 영역은 실제로 글자/사진이 차지한 범위를 잰다(여백 포함 금지).',
      '- margin은 카드 테두리에서 내용까지의 가장 작은 여백 비율이다.',
      '- size는 그 영역 글자의 대략적인 크기를 이미지 너비 대비 비율로 적는다(예: 0.058).',
      '- 색은 반드시 #RRGGBB hex로, 이미지에서 실제로 샘플링한 값만 적는다. 이름(예: beige) 금지.',
      '- font.title, font.body는 serif | sans | rounded 중 하나. 명조 계열이면 serif, 고딕이면 sans.',
      '- decor.border는 테두리 두께 px(0~12), hardShadow는 딱딱한 오프셋 그림자 여부(true/false),',
      '  paperTexture는 종이·필름 질감 여부, grain은 none | film-2 | paper-3 | newsprint-45, rule은 1px 괘선 여부.',
      '- badge.style는 solid | pill | sticker | rule | minimal | none 중 하나.',
      '- 비율은 ' + ratio + ' 기준이다. 잘린 부분은 상상해서 채우지 말고 보이는 비율 그대로 적는다.'
    ];

    if (ctx) {
      lines.push('');
      lines.push('[내 콘텐츠]');
      lines.push('- 업종: ' + ctx.industry + ' / 목적: ' + ctx.purposeLabel + ' / 무드: ' + ctx.mood);
      if (opts.title) lines.push('- 제목: ' + String(opts.title).slice(0, 60));
      if (opts.body) lines.push('- 본문: ' + String(opts.body).slice(0, 120));
      lines.push('- 제목은 ' + V2.densityLimit + '자 이하로 들어갈 자리만 확보하면 된다. 글자가 넘칠 것 같으면 size를 줄이지 말고 h를 넓게 잡아라.');
    }
    if (extra) {
      lines.push('');
      lines.push('[추가 요청]');
      lines.push(extra);
    }

    lines.push('');
    lines.push('[출력 JSON 스키마]');
    lines.push(JSON.stringify(BLUEPRINT_SCHEMA, null, 2));
    lines.push('');
    lines.push('[출력 예시] — 값은 반드시 내 사진을 재서 바꿔라.');
    lines.push(JSON.stringify(BLUEPRINT_EXAMPLE, null, 2));
    lines.push('');
    lines.push('이제 JSON만 출력하라.');

    return {
      prompt: lines.join('\n'),
      schema: deepClone(BLUEPRINT_SCHEMA),
      example: deepClone(BLUEPRINT_EXAMPLE),
      jsonOnly: true,
      ratio: ratio,
      chars: lines.join('\n').length,
      tips: [
        '사진과 함께 붙여넣고, 받은 JSON을 그대로 “블루프린트 JSON” 칸에 넣으세요.',
        'AI가 설명을 섞어 보내도 코드블록·앞뒤 문장은 자동으로 걷어냅니다.',
        '색이 마음과 다르면 colors만 바꿔 다시 렌더하면 됩니다.'
      ]
    };
  }

  /** AI 응답에서 JSON 본문만 뽑아 파싱 */
  function parseBlueprintJSON(input) {
    if (input && typeof input === 'object') return { ok: true, json: input, warnings: [] };
    var text = String(input === null || input === undefined ? '' : input).trim();
    if (!text) return { ok: false, error: 'empty', warnings: [], json: null };
    var warnings = [];

    var fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) { text = fenced[1].trim(); }

    var start = text.indexOf('{');
    var end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return { ok: false, error: 'no-json-object', warnings: warnings, json: null };
    var body = text.slice(start, end + 1);
    body = body.replace(/^\uFEFF/, '').replace(/,\s*([}\]])/g, '$1');
    body = body.replace(/\/\/[^\n]*/g, '');

    try {
      var parsed = JSON.parse(body);
      if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'not-object', warnings: warnings, json: null };
      return { ok: true, json: parsed, warnings: warnings };
    } catch (e) {
      // 흔한 실패: 작은따옴표, 키의 따옴표 누락
      try {
        var relaxed = body
          .replace(/'/g, '"')
          .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
        var parsed2 = JSON.parse(relaxed);
        warnings.push('JSON 따옴표를 자동 보정했습니다.');
        return { ok: true, json: parsed2, warnings: warnings };
      } catch (e2) {
        return { ok: false, error: 'parse-error: ' + e.message, warnings: warnings, json: null };
      }
    }
  }

  /* ── 9-E. 블루프린트 정규화 ─────────────────────────── */

  function truthy(v) {
    if (v === true || v === 1) return true;
    if (typeof v === 'string') return /^(true|yes|y|1|on|예|네)$/i.test(v.trim());
    return false;
  }

  /** 0~1 비율 또는 %·px 문자열을 0~1로. basis는 px 변환 기준. */
  function parseFrac(v, fallback, basis) {
    if (v === undefined || v === null || v === '') return fallback;
    if (typeof v === 'number') {
      if (!isFinite(v)) return fallback;
      if (v > 1.5) return clamp(v / 100, 0, 1);
      if (v < 0) return fallback;
      return clamp(v, 0, 1);
    }
    var m = String(v).trim().match(/^(-?[\d.]+)\s*(%|px)?$/i);
    if (!m) return fallback;
    var n = parseFloat(m[1]);
    if (!isFinite(n)) return fallback;
    if (m[2] === '%') return clamp(n / 100, 0, 1);
    if (m[2] === 'px') return basis ? clamp(n / basis, 0, 1) : fallback;
    if (n > 1.5) return clamp(n / 100, 0, 1);
    return clamp(n, 0, 1);
  }

  function pickKey(obj, keys) {
    if (!obj || typeof obj !== 'object') return undefined;
    for (var i = 0; i < keys.length; i++) {
      var v = obj[keys[i]];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  }

  function normalizeHex(v, fallback, fixes, name) {
    if (v === undefined || v === null || v === '') return fallback;
    if (isHex(v)) return rgbToHex(hexToRgb(v));
    var m = String(v).match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})/);
    if (m) { fixes.push(name + ' 색 형식 보정: ' + v + ' → #' + m[1]); return rgbToHex(hexToRgb('#' + m[1])); }
    if (/^#?[0-9a-fA-F]{6}$/.test(String(v).trim())) { fixes.push(name + ' # 누락 보정'); return rgbToHex(hexToRgb('#' + String(v).trim())); }
    fixes.push(name + ' 색을 읽지 못해 기본값 사용: ' + v);
    return fallback;
  }

  function rectFrom(raw, dflt, W, H, fixes, name) {
    var out = { x: dflt.x, y: dflt.y, w: dflt.w, h: dflt.h };
    if (raw === undefined || raw === null || raw === '') return out;
    if (Array.isArray(raw)) raw = { x: raw[0], y: raw[1], w: raw[2], h: raw[3] };
    if (typeof raw !== 'object') { fixes.push(name + ': 사각형이 아니어서 기본값 사용'); return out; }

    var left = pickKey(raw, ['x', 'left']);
    var top = pickKey(raw, ['y', 'top']);
    var width = pickKey(raw, ['w', 'width']);
    var height = pickKey(raw, ['h', 'height']);

    out.x = parseFrac(left, out.x, W);
    out.y = parseFrac(top, out.y, H);

    if (width === undefined && pickKey(raw, ['right']) !== undefined) {
      out.w = clamp(parseFrac(pickKey(raw, ['right']), out.x + out.w, W) - out.x, 0.02, 1);
    } else {
      out.w = parseFrac(width, out.w, W);
    }
    if (height === undefined && pickKey(raw, ['bottom']) !== undefined) {
      out.h = clamp(parseFrac(pickKey(raw, ['bottom']), out.y + out.h, H) - out.y, 0.02, 1);
    } else {
      out.h = parseFrac(height, out.h, H);
    }

    out.w = clamp(out.w, 0.02, 1);
    out.h = clamp(out.h, 0.01, 1);
    if (out.x + out.w > 1) out.w = round(1 - out.x, 3);
    if (out.y + out.h > 1) out.h = round(1 - out.y, 3);
    if (out.w < 0.02) out.w = 0.02;
    if (out.h < 0.01) out.h = 0.01;
    return out;
  }

  function parseCanvas(raw, fallbackRatio) {
    var ratioStr = '4:5';
    if (typeof raw === 'string') ratioStr = raw;
    else if (raw && typeof raw === 'object') ratioStr = raw.ratio || raw.aspect || (raw.width && raw.height ? raw.width + 'x' + raw.height : '') || fallbackRatio || '4:5';
    else if (fallbackRatio) ratioStr = fallbackRatio;

    var s = String(ratioStr).trim().toLowerCase().replace(/\s/g, '');
    var dim = s.match(/^(\d+)[x×](\d+)$/);
    if (dim) {
      var w = clamp(parseInt(dim[1], 10) || 1080, 200, 4000);
      var h = clamp(parseInt(dim[2], 10) || 1350, 200, 4000);
      return { width: w, height: h, ratio: w + ':' + h };
    }
    var m = s.match(/^([\d.]+):([\d.]+)$/);
    if (m) {
      var a = parseFloat(m[1]) || 4, b = parseFloat(m[2]) || 5;
      var width = 1080;
      return { width: width, height: Math.round(width * b / a), ratio: a + ':' + b };
    }
    return { width: 1080, height: 1350, ratio: '4:5' };
  }

  function unionRect(a, b) {
    if (!a) return b;
    if (!b) return a;
    var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return {
      x: round(x, 3), y: round(y, 3),
      w: round(Math.min(1, Math.max(a.x + a.w, b.x + b.w)) - x, 3),
      h: round(Math.min(1, Math.max(a.y + a.h, b.y + b.h)) - y, 3)
    };
  }

  function overlapRatio(a, b) {
    if (!a || !b) return 0;
    var x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    var y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    var inter = x * y;
    var area = Math.min(a.w * a.h, b.w * b.h);
    return area <= 0 ? 0 : round(clamp(inter / area, 0, 1), 3);
  }

  var BADGE_STYLES = ['solid', 'pill', 'sticker', 'rule', 'minimal', 'none'];

  /**
   * 어떤 모양의 JSON이 와도 렌더 가능한 블루프린트로 바꾼다.
   * 누락·오류는 기본값으로 채우고 fixes/warnings에 근거를 남긴다.
   */
  function normalizeBlueprint(input, opts) {
    opts = opts || {};
    var src = input;
    if (typeof src === 'string') {
      var parsed = parseBlueprintJSON(src);
      if (!parsed.ok) {
        return { ok: false, error: parsed.error, warnings: parsed.warnings, fixes: [], blueprint: null };
      }
      src = parsed.json;
    }
    if (!src || typeof src !== 'object') {
      return { ok: false, error: 'blueprint-not-object', warnings: [], fixes: [], blueprint: null };
    }
    if (src.blueprint && src.blueprint.zones) return normalizeBlueprint(src.blueprint, opts);
    // 이미 정규화된 블루프린트는 그대로 돌려준다(재해석하면 존 정보가 사라진다).
    if (src.schema === V2.blueprintSchema && src.zones && src.type && src.decor && src.palette) {
      return {
        ok: true, blueprint: deepClone(src),
        fixes: (src.fixes || []).slice(), warnings: (src.warnings || []).slice(), canvas: deepClone(src.canvas)
      };
    }

    var fixes = [], warnings = [];
    var canvas = parseCanvas(pickKey(src, ['canvas', 'size', 'frame', 'format']), pickKey(src, ['ratio']));
    var W = canvas.width, H = canvas.height;

    var margin = parseFrac(pickKey(src, ['margin', 'margins', 'padding', 'outerMargin']), 0.06, W);
    margin = clamp(margin, 0, 0.25);

    var dTitle = { x: margin, y: margin, w: round(1 - margin * 2, 3), h: 0.24 };
    var dBody = { x: margin, y: round(margin + 0.265, 3), w: round(Math.min(0.62, 1 - margin * 2), 3), h: 0.28 };
    var dCta = { x: margin, y: round(1 - margin - 0.075, 3), w: 0.34, h: 0.075 };
    var dBadge = { x: margin, y: round(Math.max(0.015, margin * 0.6), 3), w: 0.2, h: 0.05 };
    var dImage = { x: round(1 - margin - 0.42, 3), y: margin, w: 0.42, h: 0.5 };

    var zones = {
      title: rectFrom(pickKey(src, ['title', 'titleZone', 'title_zone', 'titleBox', 'headline']), dTitle, W, H, fixes, 'title'),
      body: rectFrom(pickKey(src, ['body', 'bodyZone', 'body_zone', 'copy', 'subtitle']), dBody, W, H, fixes, 'body'),
      cta: rectFrom(pickKey(src, ['cta', 'button', 'ctaZone']), dCta, W, H, fixes, 'cta'),
      badge: rectFrom(pickKey(src, ['badge', 'tag', 'label']), dBadge, W, H, fixes, 'badge')
    };

    var imageRaw = pickKey(src, ['image', 'photo', 'visual', 'imageZone']);
    var hasImage = imageRaw !== undefined || opts.assumeImage === true;
    zones.image = hasImage ? rectFrom(imageRaw, dImage, W, H, fixes, 'image') : null;

    if (!pickKey(src, ['body', 'bodyZone', 'body_zone', 'copy', 'subtitle'])) {
      zones.body = {
        x: zones.title.x,
        y: round(Math.min(1 - 0.02, zones.title.y + Math.min(zones.title.h, 0.26)), 3),
        w: round(Math.min(zones.title.w, 0.72), 3),
        h: round(Math.max(0.06, Math.min(0.3, 1 - margin - (zones.title.y + Math.min(zones.title.h, 0.26)))), 3)
      };
      fixes.push('body 영역이 없어 제목 아래로 배치했습니다.');
    }

    // 색
    var cRaw = pickKey(src, ['colors', 'palette', 'colour', 'color']) || {};
    var palette = {
      bg: normalizeHex(pickKey(cRaw, ['bg', 'background', 'base']), '#F3EDE3', fixes, 'bg'),
      surface: normalizeHex(pickKey(cRaw, ['surface', 'card']), '#FFFFFF', fixes, 'surface'),
      ink: normalizeHex(pickKey(cRaw, ['ink', 'text', 'titleColor']), '#221E1A', fixes, 'ink'),
      sub: normalizeHex(pickKey(cRaw, ['sub', 'muted', 'bodyColor']), '#6B6156', fixes, 'sub'),
      accent: normalizeHex(pickKey(cRaw, ['accent', 'point', 'primary', 'highlight']), '#B4462A', fixes, 'accent'),
      accentInk: normalizeHex(pickKey(cRaw, ['accentInk', 'onAccent']), null, fixes, 'accentInk'),
      line: normalizeHex(pickKey(cRaw, ['line', 'border', 'rule']), null, fixes, 'line'),
      accentSoft: normalizeHex(pickKey(cRaw, ['accentSoft', 'tint']), null, fixes, 'accentSoft')
    };
    if (!palette.line) palette.line = mix(palette.bg, palette.ink, 0.14);
    if (!palette.accentSoft) palette.accentSoft = mix(palette.accent, palette.bg, 0.88);
    if (!palette.accentInk) {
      palette.accentInk = contrastRatio('#FFFFFF', palette.accent) >= contrastRatio('#000000', palette.accent) ? '#FFFFFF' : '#000000';
    }
    palette = hardenPalette(palette);

    // 폰트
    var fRaw = pickKey(src, ['font', 'fonts', 'typography', 'type']) || {};
    var titleFontRaw = pickKey(fRaw, ['title', 'heading', 'display']);
    var bodyFontRaw = pickKey(fRaw, ['body', 'text', 'copy']);
    var titleStyleRaw = typeof titleFontRaw === 'string' ? titleFontRaw : (titleFontRaw && (titleFontRaw.style || titleFontRaw.family));
    var bodyStyleRaw = typeof bodyFontRaw === 'string' ? bodyFontRaw : (bodyFontRaw && (bodyFontRaw.style || bodyFontRaw.family));
    var titleFamily = resolveFontFamily(titleStyleRaw, null);
    var bodyFamily = resolveFontFamily(bodyStyleRaw, null);

    var mixId = pickKey(fRaw, ['mix', 'mixId']) || pickKey(src, ['fontMix']);
    var fmix = null;
    if (mixId) {
      try { fmix = fontMix(mixId); }
      catch (e) { fixes.push('알 수 없는 폰트 믹스 “' + mixId + '” → 기본 조합'); }
    }
    if (!fmix) {
      var derived = titleFamily === 'serif-heading' ? 'myeongjo-title'
        : titleFamily === 'rounded' ? 'rounded-pop'
          : titleFamily === 'plex' ? 'plex-editorial' : 'pretendard-only';
      fmix = fontMix(derived);
      if (!titleStyleRaw) fixes.push('font.title 정보가 없어 “' + fmix.name + '”을 기본으로 썼습니다.');
    }
    if (!titleFamily) titleFamily = fmix.title.family;
    if (!bodyFamily) bodyFamily = fmix.body.family;

    var titleWeight = Math.round(clamp(Number(pickKey(fRaw, ['titleWeight']) || (titleFontRaw && titleFontRaw.weight) || fmix.title.weight) || fmix.title.weight, 300, 900));
    var bodyWeight = Math.round(clamp(Number(pickKey(fRaw, ['bodyWeight']) || (bodyFontRaw && bodyFontRaw.weight) || fmix.body.weight) || fmix.body.weight, 300, 900));
    var titleTracking = String(pickKey(fRaw, ['titleTracking']) || (titleFontRaw && titleFontRaw.tracking) || fmix.title.tracking);
    var bodyTracking = String(pickKey(fRaw, ['bodyTracking']) || (bodyFontRaw && bodyFontRaw.tracking) || fmix.body.tracking);
    var titleLineHeight = clamp(Number(pickKey(fRaw, ['titleLineHeight']) || (titleFontRaw && titleFontRaw.lineHeight) || fmix.title.lineHeight) || fmix.title.lineHeight, 0.9, 2.2);
    var bodyLineHeight = clamp(Number(pickKey(fRaw, ['bodyLineHeight']) || (bodyFontRaw && bodyFontRaw.lineHeight) || fmix.body.lineHeight) || fmix.body.lineHeight, 1, 2.4);
    var titleTransform = /upper/i.test(String(pickKey(fRaw, ['titleTransform']) || fmix.title.transform || 'none')) ? 'uppercase' : 'none';

    var titleRawForSize = pickKey(src, ['title', 'titleZone', 'title_zone', 'titleBox', 'headline']);
    var bodyRawForSize = pickKey(src, ['body', 'bodyZone', 'body_zone', 'copy', 'subtitle']);
    var titleSizeFrac = parseFrac(
      pickKey(src, ['titleSize']) ||
      (titleRawForSize && typeof titleRawForSize === 'object' ? pickKey(titleRawForSize, ['size', 'fontSize', 'fontSizeRatio']) : undefined) ||
      pickKey(fRaw, ['titleSize', 'size']), 0.082, W);
    var bodySizeFrac = parseFrac(
      pickKey(src, ['bodySize']) ||
      (bodyRawForSize && typeof bodyRawForSize === 'object' ? pickKey(bodyRawForSize, ['size', 'fontSize', 'fontSizeRatio']) : undefined) ||
      pickKey(fRaw, ['bodySize']), 0.026, W);
    if (titleSizeFrac > 0.2) { fixes.push('titleSize가 너무 커서 0.2로 줄였습니다.'); titleSizeFrac = 0.2; }
    if (titleSizeFrac < 0.02) titleSizeFrac = 0.02;
    if (bodySizeFrac > 0.06) bodySizeFrac = 0.06;
    if (bodySizeFrac < 0.012) bodySizeFrac = 0.012;

    // 장식
    var dRaw = pickKey(src, ['decor', 'decoration', 'details', 'style']) || {};
    var borderRaw = pickKey(dRaw, ['border', 'borderWidth']);
    var border = borderRaw === true ? 1 : (borderRaw === false ? 0 : Math.round(clamp(Number(borderRaw) || 0, 0, 12)));
    var hardShadow = truthy(pickKey(dRaw, ['hardShadow', 'hard-shadow'])) || String(pickKey(dRaw, ['shadow']) || '').toLowerCase() === 'hard';
    var paper = truthy(pickKey(dRaw, ['paperTexture', 'paper', 'texture']));
    var grainInput = pickKey(dRaw, ['grain', 'grainAmount']);
    if (grainInput === undefined && paper) grainInput = 'paper-3';
    if (grainInput === undefined && pickKey(dRaw, ['film']) !== undefined) grainInput = truthy(pickKey(dRaw, ['film'])) ? 'film-2' : undefined;
    var grain = normalizeGrain(grainInput);
    var rule = truthy(pickKey(dRaw, ['rule', 'hairline']));
    var numberingRaw = pickKey(dRaw, ['numbering', 'pageNumber']);
    var numbering = numberingRaw === true ? '01/05' : (typeof numberingRaw === 'string' ? numberingRaw : null);
    var radius = Math.round(clamp(Number(pickKey(dRaw, ['radius', 'rounding'])) || 0, 0, 48));

    // 배지 스타일
    var badgeRaw = pickKey(src, ['badge', 'tag', 'label']);
    var badgeStyleRaw = String(
      (badgeRaw && typeof badgeRaw === 'object' && pickKey(badgeRaw, ['style', 'type'])) ||
      pickKey(dRaw, ['badge', 'badgeStyle']) || 'none'
    ).toLowerCase();
    var badgeStyle = BADGE_STYLES.indexOf(badgeStyleRaw) >= 0 ? badgeStyleRaw : 'solid';
    zones.badge.style = badgeStyle;
    zones.badge.pos = zones.badge.y < 0.2 ? 'top-left' : 'bottom-left';

    // 겹침 → 이미지 위 텍스트 여부
    var overlap = 0;
    if (zones.image) {
      overlap = Math.max(overlapRatio(zones.title, zones.image), overlapRatio(zones.body, zones.image));
    }
    var explicitTextOnImage = pickKey(src, ['textOnImage']) !== undefined ? truthy(pickKey(src, ['textOnImage'])) : undefined;
    var imgRaw = (imageRaw && typeof imageRaw === 'object') ? imageRaw : {};
    if (explicitTextOnImage === undefined && pickKey(imgRaw, ['textOnImage']) !== undefined) explicitTextOnImage = truthy(pickKey(imgRaw, ['textOnImage']));
    var textOnImage = explicitTextOnImage !== undefined ? explicitTextOnImage : overlap > 0.12;
    if (textOnImage && overlap < 0.02) warnings.push('이미지 위 텍스트로 표시됐지만 실제 겹침이 없습니다. 오버레이만 깔립니다.');

    var overlayRaw = pickKey(imgRaw, ['overlay']) || pickKey(src, ['overlay']) || null;
    var overlay;
    if (typeof overlayRaw === 'number') {
      overlay = { type: 'scrim', color: '#000000', opacity: clamp(overlayRaw, 0, 0.95), height: 0.62, direction: 'bottom' };
    } else if (overlayRaw && typeof overlayRaw === 'object') {
      overlay = {
        type: String(overlayRaw.type || 'scrim') === 'none' ? 'none' : 'scrim',
        color: normalizeHex(overlayRaw.color, '#000000', fixes, 'overlay'),
        opacity: clamp(Number(overlayRaw.opacity) || 0, 0, 0.95),
        height: clamp(Number(overlayRaw.height) || 0.62, 0.1, 1),
        direction: String(overlayRaw.direction || 'bottom')
      };
    } else if (textOnImage) {
      overlay = { type: 'scrim', color: '#000000', opacity: 0.58, height: 0.62, direction: 'bottom' };
    } else {
      overlay = { type: 'none', color: '#000000', opacity: 0, height: 0.6, direction: 'bottom' };
    }

    var textColor = palette.ink, subColor = palette.sub;
    if (textOnImage && overlay.type !== 'none') {
      var worstBg = mix('#FFFFFF', overlay.color, overlay.opacity);
      textColor = ensureContrast(palette.ink, worstBg, 4.5, '#FFFFFF');
      subColor = ensureContrast(palette.sub, worstBg, 4.5, '#FFFFFF');
      if (overlay.opacity < 0.45) warnings.push('이미지 위 글자인데 오버레이가 옅습니다(' + overlay.opacity + '). 흰 사진에서는 읽기 어려울 수 있습니다.');
    }

    var name = String(opts.name || src.name || '레퍼런스 블루프린트');
    var bp = {
      schema: V2.blueprintSchema,
      source: opts.source || 'vision-json',
      name: name,
      canvas: canvas,
      margin: round(margin, 3),
      palette: palette,
      type: {
        titleStyle: titleFamily === 'serif-heading' ? 'serif' : (titleFamily === 'plex' ? 'plex' : titleFamily),
        bodyStyle: bodyFamily === 'serif-heading' ? 'serif' : (bodyFamily === 'plex' ? 'plex' : bodyFamily),
        titleFamily: titleFamily,
        bodyFamily: bodyFamily,
        titleWeight: titleWeight,
        bodyWeight: bodyWeight,
        titleTracking: titleTracking,
        bodyTracking: bodyTracking,
        titleLineHeight: round(titleLineHeight, 2),
        bodyLineHeight: round(bodyLineHeight, 2),
        titleTransform: titleTransform,
        titleAlign: (pickKey(src.title || {}, ['align']) || 'left') === 'center' ? 'center' : 'left',
        titleSizeFrac: round(titleSizeFrac, 4),
        bodySizeFrac: round(bodySizeFrac, 4),
        fontMix: fmix.id
      },
      zones: zones,
      decor: {
        border: border,
        hardShadow: hardShadow,
        paperTexture: paper,
        grain: grain,
        rule: rule,
        numbering: numbering,
        radius: radius,
        badgeStyle: badgeStyle
      },
      flags: {
        hasImage: !!zones.image,
        textOnImage: textOnImage,
        overlap: overlap,
        overlay: overlay,
        textColor: textColor,
        subTextColor: subColor,
        imageRatio: (imgRaw && String(pickKey(imgRaw, ['ratio']) || '')) || ratioFromRect(zones.image, canvas),
        imageFill: pickKey(imgRaw, ['fill']) === undefined ? true : truthy(pickKey(imgRaw, ['fill'])),
        imageCrop: String(pickKey(imgRaw, ['crop', 'fit']) || 'cover'),
        imageFocal: String(pickKey(imgRaw, ['focal', 'focus']) || 'center')
      },
      fixes: fixes,
      warnings: warnings
    };
    if (bp.flags.imageCrop !== 'contain') bp.flags.imageCrop = 'cover';

    if (!zones.image && (opts.expectImage !== false) && opts.assumeImage === true) {
      warnings.push('이미지 영역이 없어 텍스트형 카드로 렌더합니다.');
    }
    if (overlap > 0.02 && overlap <= 0.12) warnings.push('제목과 이미지가 ' + Math.round(overlap * 100) + '% 겹칩니다. 사진이 텍스트를 가리지 않는지 확인하세요.');

    bp.id = 'bp-' + hash(blueprintFingerprint(bp)).toString(16);
    return { ok: true, blueprint: bp, fixes: fixes, warnings: warnings, canvas: canvas };
  }

  /** 사각형의 실제 가로:세로를 가까운 표준 비율 라벨로 */
  function ratioFromRect(z, canvas) {
    if (!z || !canvas) return '4:5';
    var aspect = (z.w * canvas.width) / (z.h * canvas.height);
    var known = [
      { l: '1:1', v: 1 }, { l: '4:5', v: 0.8 }, { l: '3:4', v: 0.75 }, { l: '2:3', v: 0.667 },
      { l: '9:16', v: 0.5625 }, { l: '4:3', v: 1.333 }, { l: '3:2', v: 1.5 },
      { l: '16:10', v: 1.6 }, { l: '16:9', v: 1.778 }
    ];
    var best = known[0], dist = 99;
    known.forEach(function (k) {
      var d = Math.abs(k.v - aspect);
      if (d < dist) { dist = d; best = k; }
    });
    return best.l;
  }

  /** 블루프린트의 지문(기하·색·폰트·장식). 브랜드 고정 검증용. */
  function blueprintFingerprint(bp) {
    var core = {
      canvas: bp.canvas && bp.canvas.ratio,
      zones: bp.zones,
      palette: bp.palette,
      type: [bp.type.titleFamily, bp.type.bodyFamily, bp.type.titleWeight, bp.type.bodyWeight, bp.type.titleSizeFrac, bp.type.bodySizeFrac],
      decor: [bp.decor.border, bp.decor.hardShadow, bp.decor.grain && bp.decor.grain.id, bp.decor.rule, bp.decor.radius, bp.decor.badgeStyle]
    };
    return 'bp1-' + hash(JSON.stringify(core)).toString(16);
  }

  /** 블루프린트 → 프리셋 호환 객체 (토큰·CSS·검증 재사용) */
  function blueprintToPreset(bp) {
    var bodyPx540 = clamp(bp.type.bodySizeFrac * 540, 11, 22);
    var titlePx540 = bp.type.titleSizeFrac * 540;
    var scaleRatio = clamp(Math.pow(Math.max(1.05, titlePx540 / bodyPx540), 1 / 5), 1.05, 1.7);
    var union = unionRect(bp.zones.title, bp.zones.body);
    var radius = bp.decor.radius;

    var p = {
      id: bp.id || ('bp-' + hash(blueprintFingerprint(bp)).toString(16)),
      name: bp.name,
      nameEn: 'Custom Blueprint',
      tagline: '레퍼런스 사진에서 해부한 구도·색·폰트를 그대로 옮긴 커스텀 레이아웃',
      origin: 'vision blueprint (reference photo dissection)',
      keywords: ['커스텀 블루프린트', '90% 복제', bp.type.titleStyle + ' 제목'],
      palette: deepClone(bp.palette),
      ratio: { bg: 60, surface: 30, accent: 10 },
      type: {
        base: Math.round(bodyPx540),
        ratio: round(scaleRatio, 3),
        family: { display: bp.type.titleFamily, body: bp.type.bodyFamily, mono: 'mono' },
        roles: {
          display: { weight: bp.type.titleWeight, lineHeight: bp.type.titleLineHeight, tracking: bp.type.titleTracking, transform: bp.type.titleTransform },
          h1: { weight: bp.type.titleWeight, lineHeight: 1.18, tracking: '-0.02em', transform: 'none' },
          h2: { weight: bp.type.titleWeight, lineHeight: 1.26, tracking: '-0.01em', transform: 'none' },
          lead: { weight: bp.type.bodyWeight, lineHeight: bp.type.bodyLineHeight, tracking: '0em', transform: 'none' },
          body: { weight: bp.type.bodyWeight, lineHeight: bp.type.bodyLineHeight, tracking: bp.type.bodyTracking, transform: 'none' },
          caption: { weight: 500, lineHeight: 1.4, tracking: '0.01em', transform: 'none' },
          micro: { weight: 600, lineHeight: 1.3, tracking: '0.08em', transform: 'uppercase' }
        }
      },
      layout: {
        unit: 8, columns: 12, gutter: Math.round(clamp(bp.margin * 540, 8, 96)),
        margin: Math.round(clamp(bp.margin * 540, 8, 120)),
        radius: radius,
        border: bp.decor.border,
        shadow: bp.decor.hardShadow ? '6px 6px 0 ' + bp.palette.ink : 'none',
        density: 'medium',
        imageRatio: bp.flags.imageRatio,
        sectionGap: 48,
        maxWidth: 1180,
        cta: { pos: 'inline-left', radius: radius, height: Math.round(clamp(bp.zones.cta.h * 540, 28, 76)), minWidth: Math.round(clamp(bp.zones.cta.w * 540, 120, 520)) },
        badge: { pos: bp.zones.badge.pos, style: bp.decor.badgeStyle === 'pill' ? 'pill' : (bp.decor.badgeStyle === 'sticker' ? 'sticker' : 'solid') },
        grid: 'custom-blueprint'
      },
      fit: { '뷰티·패션': 0.62, '테크·IT': 0.62, '푸드·리빙': 0.62, '금융·B2B': 0.6, '숏폼 바이럴': 0.62 },
      moods: ['맞춤', '레퍼런스'],
      purposes: { cardnews: 0.72, detail: 0.68, saas: 0.55, proposal: 0.62 },
      rules: [
        '좌표는 레퍼런스 사진을 잰 값이다. 시안마다 존을 다시 그리지 말고 그대로 쓴다.',
        '제목 ' + (bp.type.titleStyle === 'serif' ? '명조' : '고딕') + ' · 본문 ' + (bp.type.bodyStyle === 'serif' ? '명조' : '고딕') + ' 조합을 유지한다.',
        '배경 ' + bp.palette.bg + ' / 포인트 ' + bp.palette.accent + ' — 포인트 면적은 10%를 넘기지 않는다.',
        '그레인 ' + (bp.decor.grain.id === 'none' ? '없음' : bp.decor.grain.id + ' ' + Math.round(bp.decor.grain.amount * 100) + '%') + '은 모든 출력에 동일하게 얹는다.'
      ],
      pin: {
        headlineChars: Math.max(8, Math.round((bp.zones.title.w * 1080) / (bp.type.titleSizeFrac * 1080 * 0.95)) * 2),
        bodyChars: 40,
        ctaLabel: '자세히 보기'
      },
      applies: {
        cardnews: '블루프린트 존 그대로 카드 1장. 글자만 바꾼다.',
        detail: '상세 첫 컷에 같은 구도, 아래 섹션은 같은 여백 리듬으로.',
        saas: '화면 캡처를 이미지 존 비율에 맞춰 자른다.',
        proposal: '표지는 이 구도, 내지는 텍스트 존만 남긴다.'
      },
      decoration: {
        type: 'blueprint', radius: radius,
        shadow: bp.decor.hardShadow ? 'hard' : 'none',
        border: bp.decor.border,
        motifs: ['레퍼런스 존', bp.decor.rule ? '1px 괘선' : '괘선 없음', bp.decor.numbering ? '넘버링 ' + bp.decor.numbering : '넘버링 없음'],
        accentUse: 'CTA·배지에만'
      },
      dna: {
        layout: {
          structure: 'custom-blueprint', columns: 12, gridLines: bp.decor.rule, textAlign: bp.type.titleAlign,
          zones: {
            text: union,
            image: bp.zones.image || union,
            cta: bp.zones.cta,
            badge: bp.zones.badge,
            title: bp.zones.title,
            body: bp.zones.body
          },
          flow: ['kicker', 'title', 'body', 'cta'],
          note: '사진에서 잰 존. 제목 ' + pct(bp.zones.title.x) + '/' + pct(bp.zones.title.y) + ', 이미지 ' + (bp.zones.image ? pct(bp.zones.image.x) + '/' + pct(bp.zones.image.y) : '없음')
        },
        image: {
          ratio: bp.flags.imageRatio, fill: bp.flags.imageFill, crop: bp.flags.imageCrop, focal: bp.flags.imageFocal,
          treatment: 'none',
          overlay: deepClone(bp.flags.overlay),
          textOnImage: bp.flags.textOnImage,
          textColor: bp.flags.textColor,
          secondaryTextColor: bp.flags.subTextColor,
          safeArea: { top: 0.06, right: 0.04, bottom: 0.06, left: 0.04 },
          captionRule: bp.decor.rule ? '이미지 하단 1px 괘선' : '캡션 없음',
          legibility: bp.flags.textOnImage
            ? ['이미지 위 글자는 오버레이 위에만.', '오버레이 불투명도 ' + bp.flags.overlay.opacity + ' 유지.']
            : ['이미지와 텍스트 존을 겹치지 않게 유지.']
        },
        graphics: {
          elements: ['blueprint-zone', bp.decor.rule ? 'custom-rule' : 'no-rule', bp.decor.grain.id === 'none' ? 'clean-surface' : 'grain'],
          texture: bp.decor.grain.id,
          badgeStyle: bp.decor.badgeStyle,
          accentShape: 'rect',
          radius: radius,
          border: bp.decor.border,
          shadow: bp.decor.hardShadow ? 'hard' : 'none'
        },
        type: {
          displayFamily: bp.type.titleStyle, bodyFamily: bp.type.bodyStyle,
          displayWeight: bp.type.titleWeight, bodyWeight: bp.type.bodyWeight,
          displayTracking: bp.type.titleTracking, bodyTracking: bp.type.bodyTracking,
          displayLineHeight: bp.type.titleLineHeight, bodyLineHeight: bp.type.bodyLineHeight,
          scaleRatio: round(scaleRatio, 3),
          displayTransform: bp.type.titleTransform,
          contrastAxis: 'family',
          hierarchyNote: bp.type.titleStyle === bp.type.bodyStyle
            ? '같은 패밀리 안에서 굵기·크기로만 위계.'
            : '제목 ' + bp.type.titleStyle + ' / 본문 ' + bp.type.bodyStyle + ' — 패밀리 대비로 위계.'
        }
      },
      isCustom: true,
      isBlueprint: true,
      blueprintId: bp.id
    };
    p.defaultRisk = detectDefaultLook(p);
    return p;
  }

  function pct(v) { return Math.round(clamp(Number(v) || 0, 0, 1) * 100) + '%'; }

  /* ── 9-E-2. 블루프린트 레이아웃 계산 ───────────────── */

  /** 한글·영문 혼용 줄바꿈. 공백이 없어도 글자 수로 끊는다. */
  function wrapCJK(text, maxChars) {
    var src = String(text === null || text === undefined ? '' : text).replace(/\s+/g, ' ').trim();
    if (!src) return [];
    var chars = Array.from ? Array.from(src) : src.split('');
    var limit = Math.max(2, Math.round(maxChars));
    var lines = [], line = '';
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      if (ch === ' ' && line.length === 0) continue;
      line += ch;
      if (line.length >= limit) {
        var sp = line.lastIndexOf(' ');
        if (sp > limit * 0.5) { lines.push(line.slice(0, sp).trim()); line = line.slice(sp + 1); }
        else { lines.push(line.trim()); line = ''; }
      }
    }
    if (line.trim()) lines.push(line.trim());
    return lines;
  }

  function bpZonePx(z, W, H) {
    return {
      x: Math.round(z.x * W), y: Math.round(z.y * H),
      w: Math.round(z.w * W), h: Math.round(z.h * H)
    };
  }

  function fitBpTitle(text, zonePx, maxSize, lineHeightRatio, maxLines) {
    var size = Math.max(8, Math.round(maxSize));
    var floor = Math.max(8, Math.round(maxSize * 0.45));
    var lines = [];
    for (; size >= floor; size -= Math.max(1, Math.round(size * 0.04))) {
      var perLine = Math.max(2, Math.floor(zonePx.w / (size * 0.95)));
      lines = wrapCJK(text, perLine);
      if (lines.length <= maxLines && lines.length * size * lineHeightRatio <= zonePx.h) break;
    }
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var last = lines[lines.length - 1];
      lines[lines.length - 1] = (last.length > 1 ? last.slice(0, last.length - 1) : last) + '…';
    }
    return { size: size, lines: lines };
  }

  /**
   * 블루프린트 + 콘텐츠 → 픽셀 레이아웃(HTML·Canvas 공통).
   */
  function blueprintLayout(bp, content, W, H) {
    var c = content || {};
    var zones = {
      title: bpZonePx(bp.zones.title, W, H),
      body: bpZonePx(bp.zones.body, W, H),
      cta: bpZonePx(bp.zones.cta, W, H),
      badge: bpZonePx(bp.zones.badge, W, H)
    };
    if (bp.zones.image) zones.image = bpZonePx(bp.zones.image, W, H);

    var kickerSize = Math.max(9, Math.round(bp.type.bodySizeFrac * W * 0.82));
    var kickerText = String(c.kicker || '');
    var kickerH = kickerText ? Math.round(kickerSize * 1.4 + 6) : 0;

    var titleMax = Math.round(bp.type.titleSizeFrac * W);
    var titleText = String(c.title || '제목을 입력하세요');
    var titleZone = { x: zones.title.x, y: zones.title.y + kickerH, w: zones.title.w, h: Math.max(8, zones.title.h - kickerH) };
    var titleFit = fitBpTitle(titleText, titleZone, titleMax, bp.type.titleLineHeight, 3);

    var bodySize = Math.max(9, Math.round(bp.type.bodySizeFrac * W));
    var bodyLineH = bodySize * bp.type.bodyLineHeight;
    var bodyText = String(c.body || '');
    var bodyLines = [];
    if (bodyText) {
      var perLine = Math.max(4, Math.floor(zones.body.w / (bodySize * 0.95)));
      bodyLines = wrapCJK(bodyText, perLine);
      var maxLines = Math.max(0, Math.min(6, Math.floor(zones.body.h / bodyLineH)));
      if (bodyLines.length > maxLines) {
        bodyLines = bodyLines.slice(0, maxLines);
        if (bodyLines.length) {
          var bl = bodyLines[bodyLines.length - 1];
          bodyLines[bodyLines.length - 1] = (bl.length > 1 ? bl.slice(0, bl.length - 1) : bl) + '…';
        }
      }
    }

    var ctaLabel = String(c.cta || '자세히 보기');
    var ctaSize = Math.max(9, Math.round(zones.cta.h * 0.36));

    var badgeText = String(c.badge || '');
    var badgeSize = Math.max(8, Math.round(bp.type.bodySizeFrac * W * 0.72));

    var numberingText = bp.decor.numbering ? String(c.numbering || bp.decor.numbering) : '';

    var badgeOnImage = zones.image ? overlapRatio(bp.zones.badge, bp.zones.image) : 0;

    return {
      width: W, height: H,
      badgeOnImage: badgeOnImage > 0.5,
      zones: zones,
      titleZone: titleZone,
      kicker: { text: kickerText, size: kickerSize, h: kickerH },
      title: {
        text: titleText, size: titleFit.size, lines: titleFit.lines,
        lineHeight: titleFit.size * bp.type.titleLineHeight,
        weight: bp.type.titleWeight, tracking: bp.type.titleTracking,
        family: bp.type.titleFamily, transform: bp.type.titleTransform,
        align: bp.type.titleAlign,
        color: bp.flags.textOnImage ? bp.flags.textColor : bp.palette.ink
      },
      body: {
        text: bodyText, size: bodySize, lines: bodyLines, lineHeight: bodyLineH,
        weight: bp.type.bodyWeight, tracking: bp.type.bodyTracking,
        family: bp.type.bodyFamily,
        color: bp.flags.textOnImage ? bp.flags.subTextColor : bp.palette.sub
      },
      cta: { text: ctaLabel, size: ctaSize, radius: Math.min(zones.cta.h / 2, Math.round(bp.decor.radius * W / 1080)) },
      badge: { text: badgeText, size: badgeSize, style: bp.decor.badgeStyle, onImage: badgeOnImage > 0.5 },
      numbering: { text: numberingText, size: Math.max(8, Math.round(bp.type.bodySizeFrac * W * 0.6)) },
      brand: { text: String(c.brand || ''), size: Math.max(8, Math.round(bp.type.bodySizeFrac * W * 0.62)) },
      overflow: false,
      scale: W / 1080
    };
  }

  /* ── 9-E-3. 블루프린트 HTML ─────────────────────────── */

  function bpFamily(key) { return inlineFont(fontStack(key)); }

  function blueprintHTML(bp, content, opts) {
    opts = opts || {};
    var width = Math.round(opts.width || 540);
    var height = Math.round(opts.height || width * bp.canvas.height / bp.canvas.width);
    var L = blueprintLayout(bp, content, width, height);
    var c = content || {};
    var k = width / 1080;
    var p = bp.palette;
    var z = L.zones;

    var box = function (zz) {
      return 'position:absolute;left:' + round(zz.x / width * 100, 3) + '%;top:' + round(zz.y / height * 100, 3) + '%;' +
        'width:' + round(zz.w / width * 100, 3) + '%;height:' + round(zz.h / height * 100, 3) + '%;';
    };

    var borderCss = bp.decor.border ? 'border:' + Math.max(1, Math.round(bp.decor.border * k)) + 'px solid ' + p.line + ';' : 'border:none;';
    var shadowCss = bp.decor.hardShadow
      ? 'box-shadow:' + Math.max(2, Math.round(8 * k)) + 'px ' + Math.max(2, Math.round(8 * k)) + 'px 0 ' + p.ink + ';'
      : 'box-shadow:none;';

    var src = safeSrc(c.image);
    var imgStyle = bp.flags.imageFill ? 'object-fit:' + bp.flags.imageCrop + ';' : 'object-fit:contain;';
    var focal = bp.flags.imageFocal === 'upper-third' ? '50% 30%' : (bp.flags.imageFocal === 'left' ? '0% 50%' : (bp.flags.imageFocal === 'right' ? '100% 50%' : '50% 50%'));
    var imageHtml = '';
    if (z.image) {
      imageHtml = src
        ? '<img src="' + esc(src) + '" alt="' + esc(c.imageAlt || '') + '" style="position:absolute;' + box(z.image) + imgStyle + 'object-position:' + focal + ';display:block;">'
        : '<div style="' + box(z.image) + 'background:' + p.accentSoft + ';display:flex;align-items:center;justify-content:center;color:' + p.sub + ';font-size:' + Math.max(9, Math.round(12 * k)) + 'px;">이미지 영역</div>';
    }

    var overlayHtml = '';
    if (bp.flags.textOnImage && bp.flags.overlay.type !== 'none' && z.image && bp.flags.overlay.opacity > 0) {
      var o = bp.flags.overlay;
      overlayHtml = '<div style="position:absolute;' + box(z.image) +
        'background:linear-gradient(to ' + (o.direction === 'top' ? 'bottom' : 'top') + ',rgba(0,0,0,0) 0%,' +
        'rgba(0,0,0,' + o.opacity + ') ' + Math.round((1 - o.height) * 100) + '%,rgba(0,0,0,' + o.opacity + ') 100%);"></div>';
    }

    var numberingHtml = L.numbering.text
      ? '<div style="position:absolute;left:' + round(bp.margin * 100, 3) + '%;top:' + round(bp.margin * 0.35 / (bp.canvas.height / bp.canvas.width) * 100, 3) + '%;' +
        'font:' + L.numbering.size + 'px/' + Math.round(L.numbering.size * 1.4) + 'px ' + bpFamily('mono') + ';letter-spacing:0.1em;color:' + (bp.flags.textOnImage ? L.title.color : p.sub) + ';opacity:0.9;">' +
        esc(L.numbering.text) + '</div>'
      : '';

    var kickerHtml = L.kicker.text
      ? '<div style="position:absolute;left:' + round(z.title.x / width * 100, 3) + '%;top:' + round(z.title.y / height * 100, 3) + '%;' +
        'font:700 ' + L.kicker.size + 'px/' + Math.round(L.kicker.size * 1.4) + 'px ' + bpFamily(bp.type.bodyFamily) + ';letter-spacing:0.1em;text-transform:uppercase;color:' + p.accent + ';">' +
        esc(L.kicker.text) + '</div>'
      : '';

    var titleStyle = 'position:absolute;left:' + round(L.titleZone.x / width * 100, 3) + '%;top:' + round(L.titleZone.y / height * 100, 3) + '%;' +
      'width:' + round(L.titleZone.w / width * 100, 3) + '%;height:' + round(L.titleZone.h / height * 100, 3) + '%;' +
      'font-family:' + bpFamily(L.title.family) + ';font-size:' + L.title.size + 'px;' +
      'line-height:' + round(bp.type.titleLineHeight, 3) + ';font-weight:' + L.title.weight + ';' +
      'letter-spacing:' + L.title.tracking + ';text-transform:' + L.title.transform + ';' +
      'color:' + L.title.color + ';text-align:' + L.title.align + ';white-space:pre-line;overflow:hidden;word-break:keep-all;overflow-wrap:break-word;';
    var titleHtml = '<div class="bp-title" style="' + titleStyle + '">' + esc(L.title.lines.join('\n')) + '</div>';

    var ruleHtml = '';
    if (bp.decor.rule) {
      var ry = Math.min(height - Math.round(4 * k), L.titleZone.y + L.title.lineHeight * L.title.lines.length + Math.round(20 * k));
      ruleHtml = '<div style="position:absolute;left:' + round(L.titleZone.x / width * 100, 3) + '%;top:' + round(ry / height * 100, 3) + '%;' +
        'width:' + round(Math.min(L.titleZone.w, Math.round(64 * k)) / width * 100, 3) + '%;height:' + Math.max(1, Math.round(k)) + 'px;background:' + p.accent + ';"></div>';
    }

    var bodyHtml = '';
    if (L.body.lines.length) {
      bodyHtml = '<div class="bp-body" style="position:absolute;left:' + round(z.body.x / width * 100, 3) + '%;top:' + round(z.body.y / height * 100, 3) + '%;' +
        'width:' + round(z.body.w / width * 100, 3) + '%;height:' + round(z.body.h / height * 100, 3) + '%;' +
        'font-family:' + bpFamily(L.body.family) + ';font-size:' + L.body.size + 'px;line-height:' + round(bp.type.bodyLineHeight, 3) + ';' +
        'font-weight:' + L.body.weight + ';letter-spacing:' + L.body.tracking + ';color:' + L.body.color + ';' +
        'white-space:pre-line;overflow:hidden;word-break:keep-all;overflow-wrap:break-word;">' + esc(L.body.lines.join('\n')) + '</div>';
    }

    var ctaStyle = 'position:absolute;' + box(z.cta) +
      'display:flex;align-items:center;justify-content:' + (bp.type.titleAlign === 'center' ? 'center' : 'center') + ';' +
      'background:' + p.accent + ';color:' + p.accentInk + ';border-radius:' + L.cta.radius + 'px;' +
      'font-family:' + bpFamily(bp.type.bodyFamily) + ';font-size:' + L.cta.size + 'px;font-weight:700;letter-spacing:0.01em;' +
      (bp.decor.hardShadow ? 'box-shadow:' + Math.max(2, Math.round(5 * k)) + 'px ' + Math.max(2, Math.round(5 * k)) + 'px 0 ' + p.ink + ';' : '');
    var ctaHtml = '<div class="bp-cta" style="' + ctaStyle + '">' + esc(L.cta.text) + '</div>';

    var badgeHtml = '';
    if (L.badge.text && L.badge.style !== 'none') {
      var badgeStyle = '';
      var badgeStyleEff = L.badge.onImage ? 'solid' : L.badge.style;
      if (badgeStyleEff === 'pill') badgeStyle = 'background:' + p.accent + ';color:' + p.accentInk + ';border-radius:999px;';
      else if (badgeStyleEff === 'sticker') badgeStyle = 'background:' + p.accent + ';color:' + p.accentInk + ';border-radius:0;border:' + Math.max(1, Math.round(2 * k)) + 'px solid ' + p.ink + ';';
      else if (badgeStyleEff === 'rule') badgeStyle = 'background:transparent;color:' + p.accent + ';border:0;border-bottom:' + Math.max(1, Math.round(2 * k)) + 'px solid ' + p.accent + ';border-radius:0;';
      else if (badgeStyleEff === 'minimal') badgeStyle = 'background:transparent;color:' + p.sub + ';border:' + Math.max(1, Math.round(k)) + 'px solid ' + p.line + ';border-radius:2px;';
      else badgeStyle = 'background:' + p.accent + ';color:' + p.accentInk + ';border-radius:' + Math.max(0, Math.round(4 * k)) + 'px;';
      badgeHtml = '<div class="bp-badge" style="' + box(z.badge) + 'display:inline-flex;align-items:center;justify-content:center;' +
        badgeStyle + 'font-family:' + bpFamily(bp.type.bodyFamily) + ';font-size:' + L.badge.size + 'px;font-weight:700;letter-spacing:0.06em;' +
        'padding:0 ' + Math.max(4, Math.round(10 * k)) + 'px;white-space:nowrap;overflow:hidden;">' + esc(L.badge.text) + '</div>';
    }

    var brandHtml = L.brand.text
      ? '<div style="position:absolute;left:' + round(bp.margin * 100, 3) + '%;bottom:2.5%;font-family:' + bpFamily(bp.type.bodyFamily) + ';font-size:' + L.brand.size + 'px;color:' + L.body.color + ';opacity:0.85;">' + esc(L.brand.text) + '</div>'
      : '';

    return '<figure class="pm-card bp-card" data-structure="custom-blueprint" data-blueprint="' + esc(bp.id) + '" ' +
      'style="position:relative;margin:0;box-sizing:border-box;overflow:hidden;width:' + width + 'px;height:' + height + 'px;' +
      'background:' + p.bg + ';color:' + p.ink + ';' + borderCss + 'border-radius:' + Math.round(bp.decor.radius * k) + 'px;' + shadowCss +
      'font-family:' + bpFamily(bp.type.bodyFamily) + ';">' +
      imageHtml + overlayHtml + numberingHtml + kickerHtml + titleHtml + ruleHtml + bodyHtml + badgeHtml + ctaHtml + brandHtml +
      grainOverlayHTML({ grain: bp.decor.grain, opacity: bp.decor.grain.amount > 0 ? round(clamp(bp.decor.grain.amount * 2.4, 0.02, 0.16), 3) : 0 }) +
      '</figure>';
  }

  /* ── 9-E-4. 블루프린트 CSS ──────────────────────────── */

  function blueprintCSS(bp, opts) {
    opts = opts || {};
    var prefix = opts.prefix || 'bp';
    var selector = opts.selector || ':root';
    var preset = blueprintToPreset(bp);
    var base = toCSS(preset, { prefix: prefix, selector: selector });
    var p = bp.palette;
    var lines = [
      '',
      '/* blueprint zones — reference dissection */',
      '.' + prefix + '-card { position: relative; overflow: hidden; background: ' + p.bg + '; color: ' + p.ink + '; }',
      '.' + prefix + '-title { font-family: var(--' + prefix + '-font-display); font-weight: ' + bp.type.titleWeight + '; letter-spacing: ' + bp.type.titleTracking + '; line-height: ' + bp.type.titleLineHeight + '; }',
      '.' + prefix + '-body { font-family: var(--' + prefix + '-font-body); font-weight: ' + bp.type.bodyWeight + '; line-height: ' + bp.type.bodyLineHeight + '; color: ' + p.sub + '; }',
      '.' + prefix + '-cta { background: ' + p.accent + '; color: ' + p.accentInk + '; border-radius: ' + bp.decor.radius + 'px; font-weight: 700; }',
      '.' + prefix + '-grain { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: multiply; opacity: ' + round(clamp(bp.decor.grain.amount * 2.4, 0.02, 0.16), 3) + '; }'
    ];
    return base + '\n' + lines.join('\n');
  }

  /* ── 9-E-5. 블루프린트 Canvas ───────────────────────── */

  function blueprintCanvas(bp, content, opts) {
    opts = opts || {};
    var W = Math.round(opts.width || bp.canvas.width || 1080);
    var H = Math.round(opts.height || W * bp.canvas.height / bp.canvas.width);
    var L = blueprintLayout(bp, content, W, H);
    var c = content || {};
    var p = bp.palette;
    var k = W / 1080;
    var z = L.zones;
    var cmds = [];

    cmds.push({ type: 'rect', x: 0, y: 0, w: W, h: H, fill: p.bg, role: 'bg' });

    if (z.image) {
      cmds.push({
        type: 'image', x: z.image.x, y: z.image.y, w: z.image.w, h: z.image.h,
        src: safeSrc(c.image), fit: bp.flags.imageCrop, focal: bp.flags.imageFocal, treatment: 'none', role: 'image'
      });
      var o = bp.flags.overlay;
      if (bp.flags.textOnImage && o.type !== 'none' && o.opacity > 0) {
        cmds.push({
          type: o.type === 'scrim' ? 'scrim' : 'rect',
          x: z.image.x, y: z.image.y, w: z.image.w, h: z.image.h,
          color: o.color, opacity: o.opacity, height: o.height, direction: o.direction, role: 'overlay'
        });
      }
    }

    if (bp.decor.hardShadow && z.image) {
      cmds.push({ type: 'rect', x: z.image.x + Math.round(8 * k), y: z.image.y + Math.round(8 * k), w: z.image.w, h: z.image.h, fill: p.ink, role: 'shadow' });
      // 이미지를 다시 그려 그림자 위로 올린다.
      cmds.push({
        type: 'image', x: z.image.x, y: z.image.y, w: z.image.w, h: z.image.h,
        src: safeSrc(c.image), fit: bp.flags.imageCrop, focal: bp.flags.imageFocal, treatment: 'none', role: 'image'
      });
    }

    if (bp.decor.border) {
      cmds.push({ type: 'rect', x: 0, y: 0, w: W, h: H, fill: 'rgba(0,0,0,0)', stroke: p.line, lineWidth: Math.max(1, Math.round(bp.decor.border * k)), role: 'border' });
    }

    if (L.numbering.text) {
      cmds.push({
        type: 'text', x: Math.round(bp.margin * W), y: Math.round(bp.margin * H * 0.6) + L.numbering.size,
        text: L.numbering.text, size: L.numbering.size, weight: 600, color: bp.flags.textOnImage ? L.title.color : p.sub,
        tracking: '0.1em', align: 'left', role: 'numbering', fontFamily: fontStack('mono')
      });
    }

    if (L.kicker.text) {
      cmds.push({
        type: 'text', x: z.title.x, y: z.title.y + L.kicker.size, text: L.kicker.text.toUpperCase(),
        size: L.kicker.size, weight: 700, color: p.accent, tracking: '0.1em', align: 'left', role: 'kicker',
        fontFamily: fontStack(bp.type.bodyFamily)
      });
    }

    L.title.lines.forEach(function (line, i) {
      cmds.push({
        type: 'text', x: L.titleZone.x, y: L.titleZone.y + L.title.size + i * L.title.lineHeight,
        text: line, size: L.title.size, weight: L.title.weight, color: L.title.color,
        tracking: L.title.tracking, align: L.title.align === 'center' ? 'center' : 'left', role: 'title', line: i,
        fontFamily: fontStack(L.title.family)
      });
      if (L.title.align === 'center') cmds[cmds.length - 1].x = L.titleZone.x + L.titleZone.w / 2;
    });

    if (bp.decor.rule) {
      var ry = Math.min(H - 4, L.titleZone.y + Math.round(L.title.lineHeight * L.title.lines.length) + Math.round(12 * k));
      cmds.push({ type: 'rect', x: L.titleZone.x, y: ry, w: Math.min(L.titleZone.w, Math.round(64 * k)), h: Math.max(1, Math.round(k)), fill: p.accent, role: 'accent', part: 'rule' });
    }

    L.body.lines.forEach(function (line, i) {
      cmds.push({
        type: 'text', x: z.body.x, y: z.body.y + L.body.size + i * L.body.lineHeight,
        text: line, size: L.body.size, weight: L.body.weight, color: L.body.color,
        tracking: L.body.tracking, align: 'left', role: 'body', line: i,
        fontFamily: fontStack(L.body.family)
      });
    });

    if (z.badge && L.badge.text && L.badge.style !== 'none') {
      var bw = Math.min(z.badge.w, Math.round(L.badge.text.length * L.badge.size * 0.95 + 20 * k));
      var bh = Math.max(L.badge.size + Math.round(10 * k), Math.round(z.badge.h * 0.9));
      var bx = z.badge.x, by = z.badge.y;
      var badgeStyleEff = L.badge.onImage ? 'solid' : L.badge.style;
      var radius = badgeStyleEff === 'pill' ? bh / 2 : (badgeStyleEff === 'sticker' || badgeStyleEff === 'rule' ? 0 : Math.round(4 * k));
      if (badgeStyleEff === 'rule' || badgeStyleEff === 'minimal') {
        cmds.push({ type: 'rect', x: bx, y: by + bh - Math.max(1, Math.round(2 * k)), w: bw, h: Math.max(1, Math.round(2 * k)), fill: badgeStyleEff === 'rule' ? p.accent : p.line, role: 'accent', part: 'badge-rule' });
      } else {
        cmds.push({ type: 'rect', x: bx, y: by, w: bw, h: bh, fill: p.accent, radius: radius, role: 'accent', part: 'badge' });
      }
      cmds.push({
        type: 'text', x: bx + (badgeStyleEff === 'rule' || badgeStyleEff === 'minimal' ? 0 : Math.round(10 * k)), y: by + bh / 2 + L.badge.size * 0.35,
        text: L.badge.text, size: L.badge.size, weight: 700,
        color: (badgeStyleEff === 'rule' || badgeStyleEff === 'minimal') ? (badgeStyleEff === 'rule' ? p.accent : p.sub) : p.accentInk,
        tracking: '0.06em', align: 'left', role: 'badge', fontFamily: fontStack(bp.type.bodyFamily)
      });
    }

    if (bp.decor.hardShadow) {
      cmds.push({ type: 'rect', x: z.cta.x + Math.round(5 * k), y: z.cta.y + Math.round(5 * k), w: z.cta.w, h: z.cta.h, fill: p.ink, radius: L.cta.radius, role: 'shadow' });
    }
    cmds.push({ type: 'rect', x: z.cta.x, y: z.cta.y, w: z.cta.w, h: z.cta.h, fill: p.accent, radius: L.cta.radius, role: 'accent', part: 'cta' });
    cmds.push({
      type: 'text', x: z.cta.x + z.cta.w / 2, y: z.cta.y + z.cta.h / 2 + L.cta.size * 0.35,
      text: L.cta.text, size: L.cta.size, weight: 700, color: p.accentInk, tracking: '0.01em',
      align: 'center', role: 'cta', fontFamily: fontStack(bp.type.bodyFamily)
    });

    if (L.brand.text) {
      cmds.push({
        type: 'text', x: Math.round(bp.margin * W), y: H - Math.round(H * 0.025),
        text: L.brand.text, size: L.brand.size, weight: 500, color: L.body.color, tracking: '0em',
        align: 'left', role: 'brand', fontFamily: fontStack(bp.type.bodyFamily)
      });
    }

    grainCanvasCommands({ grain: bp.decor.grain, width: W, height: H }).forEach(function (g) { cmds.push(g); });

    var overflow = cmds.some(function (cmd) {
      if (cmd.type === 'rect' || cmd.type === 'image' || cmd.type === 'scrim' || cmd.type === 'grain') {
        return cmd.x < -0.5 || cmd.y < -0.5 || cmd.x + cmd.w > W + 0.5 || cmd.y + cmd.h > H + 0.5;
      }
      return cmd.x < 0 || cmd.x > W || cmd.y < 0 || cmd.y > H;
    });

    var accentArea = 0;
    cmds.forEach(function (cmd) { if (cmd.type === 'rect' && cmd.role === 'accent') accentArea += cmd.w * cmd.h; });

    var bgForText = bp.flags.textOnImage ? mix('#FFFFFF', bp.flags.overlay.color, bp.flags.overlay.opacity) : p.bg;

    return {
      width: W, height: H, scale: k, preset: bp.id, blueprint: bp.id,
      withImage: !!z.image, commands: cmds,
      layout: { zones: z, titleZone: L.titleZone, structure: 'custom-blueprint' },
      meta: {
        structure: 'custom-blueprint',
        blueprint: bp.id,
        titleSize: L.title.size,
        titleLines: L.title.lines.length,
        bodyLines: L.body.lines.length,
        accentAreaRatio: round(accentArea / (W * H), 4),
        targetRatio: 0.1,
        overflow: overflow,
        titleOverflow: L.title.lines.join('').length < L.title.text.replace(/\s/g, '').length,
        grain: deepClone(bp.decor.grain),
        fontMix: bp.type.fontMix,
        textOnImage: bp.flags.textOnImage,
        contrast: {
          title: contrastRatio(L.title.color, bgForText),
          body: contrastRatio(L.body.color, bgForText),
          cta: contrastRatio(p.accentInk, p.accent)
        },
        canvas: { width: W, height: H, ratio: round(W / H, 3) },
        pin: { ratio: bp.canvas.ratio.replace(':', ':'), recommended: bp.canvas.width + '×' + bp.canvas.height, current: W + '×' + H }
      }
    };
  }

  /** 블루프린트 렌더 한 번에 (applyBlueprintJSON·applyBrandKit 공용) */
  function renderBlueprint(bp, content, opts) {
    opts = opts || {};
    var c = content || {};
    var preset = blueprintToPreset(bp);
    var tk = tokens(preset);
    var density = checkVisualDensity(c);
    var htmlOpts = Object.assign({}, opts.html || {});
    if (htmlOpts.width === undefined && opts.width) htmlOpts.width = opts.width;
    if (htmlOpts.height === undefined && opts.height) htmlOpts.height = opts.height;
    var canvasOpts = Object.assign({}, opts.canvas || {});
    if (canvasOpts.width === undefined && opts.canvasWidth) canvasOpts.width = opts.canvasWidth;
    var canvas = blueprintCanvas(bp, c, canvasOpts);
    var warnings = bp.warnings.slice();

    if (canvas.meta.overflow) warnings.push('일부 요소가 카드 밖으로 나갑니다. 존 좌표를 확인하세요.');
    if (canvas.meta.titleOverflow) warnings.push('제목이 존 안에서 잘렸습니다. 글자를 줄이거나 title.h를 넓히세요.');
    if (canvas.meta.contrast.title < 4.5) warnings.push('제목 대비 ' + canvas.meta.contrast.title + ':1 — 글자색을 더 진하게.');
    if (canvas.meta.contrast.body < 4.5) warnings.push('본문 대비 ' + canvas.meta.contrast.body + ':1 — sub 색을 조정하세요.');
    if (!density.ok) warnings.push(density.message);

    return {
      ok: true,
      schema: V2.blueprintSchema,
      source: bp.source,
      blueprint: bp,
      preset: preset,
      tokens: tk,
      css: blueprintCSS(bp, opts.css || {}),
      html: blueprintHTML(bp, c, htmlOpts),
      canvas: canvas,
      density: density,
      warnings: warnings,
      fixes: bp.fixes.slice(),
      meta: {
        structure: 'custom-blueprint',
        blueprintId: bp.id,
        fingerprint: blueprintFingerprint(bp),
        zones: bp.zones,
        titleSize: canvas.meta.titleSize,
        titleLines: canvas.meta.titleLines,
        overflow: canvas.meta.overflow,
        contrast: canvas.meta.contrast,
        withImage: canvas.withImage,
        textOnImage: bp.flags.textOnImage,
        grain: bp.decor.grain,
        fontMix: bp.type.fontMix,
        density: { level: density.level, total: density.counts.total, limit: density.limit },
        canvas: { width: canvas.width, height: canvas.height }
      }
    };
  }

  /**
   * AI가 뽑아온 블루프린트 JSON을 즉시 HTML·CSS·Canvas로 렌더.
   * @param {object|string} json
   * @param {object} [content] { kicker,title,body,cta,badge,brand,image,numbering }
   * @param {object} [opts] { width, canvas:{width,height}, css, html, name }
   */
  function applyBlueprintJSON(json, content, opts) {
    opts = opts || {};
    var parsed = typeof json === 'string' ? parseBlueprintJSON(json) : { ok: true, json: json, warnings: [] };
    if (!parsed.ok) {
      return {
        ok: false, error: parsed.error, warnings: (parsed.warnings || []).concat(['JSON을 읽지 못했습니다. AI에게 “JSON만 다시”라고 요청하세요.']),
        blueprint: null, html: '', css: '', canvas: null, tokens: null, fixes: []
      };
    }
    var norm = normalizeBlueprint(parsed.json, { name: opts.name, source: 'vision-json' });
    if (!norm.ok) {
      return {
        ok: false, error: norm.error, warnings: norm.warnings.concat(['블루프린트 구조를 해석하지 못했습니다.']),
        blueprint: null, html: '', css: '', canvas: null, tokens: null, fixes: norm.fixes || []
      };
    }
    var out = renderBlueprint(norm.blueprint, content || {}, opts);
    out.warnings = norm.warnings.concat(parsed.warnings || []).concat(out.warnings);
    out.fixes = norm.fixes.concat(out.fixes);
    return out;
  }

  /* ── 9-F. 브랜드 키트 고정·저장 ─────────────────────── */

  function slimBlueprint(bp) {
    return {
      canvas: deepClone(bp.canvas),
      margin: bp.margin,
      title: deepClone(bp.zones.title),
      body: deepClone(bp.zones.body),
      image: bp.zones.image ? deepClone(bp.zones.image) : undefined,
      cta: deepClone(bp.zones.cta),
      badge: { x: bp.zones.badge.x, y: bp.zones.badge.y, w: bp.zones.badge.w, h: bp.zones.badge.h, style: bp.decor.badgeStyle },
      colors: deepClone(bp.palette),
      font: {
        title: bp.type.titleStyle, body: bp.type.bodyStyle,
        titleWeight: bp.type.titleWeight, bodyWeight: bp.type.bodyWeight,
        titleTracking: bp.type.titleTracking, bodyTracking: bp.type.bodyTracking,
        titleLineHeight: bp.type.titleLineHeight, bodyLineHeight: bp.type.bodyLineHeight
      },
      decor: {
        border: bp.decor.border, hardShadow: bp.decor.hardShadow, paperTexture: bp.decor.paperTexture,
        grain: bp.decor.grain.id, rule: bp.decor.rule, numbering: bp.decor.numbering, radius: bp.decor.radius
      }
    };
  }

  function brandKitFingerprint(kit) {
    var core = {
      base: kit.base && kit.base.kind === 'blueprint'
        ? { kind: 'blueprint', zones: kit.base.blueprint && kit.base.blueprint.zones, canvas: kit.base.blueprint && kit.base.blueprint.canvas }
        : { kind: 'preset', presetId: kit.base && kit.base.presetId },
      palette: kit.palette,
      type: kit.type,
      shape: kit.shape,
      grain: kit.grain
    };
    return 'bk1-' + hash(JSON.stringify(core)).toString(16);
  }

  function kitRules(kit) {
    var rules = [
      '배경 ' + kit.palette.bg + ' · 잉크 ' + kit.palette.ink + ' · 포인트 ' + kit.palette.accent + ' — 시안마다 이 세 색을 바꾸지 않는다.',
      '제목 ' + kit.type.titleStyle + ' ' + kit.type.titleWeight + ' / 본문 ' + kit.type.bodyStyle + ' ' + kit.type.bodyWeight + ' — 폰트 믹스는 ' + kit.type.fontMix + '.',
      '라운딩 ' + kit.shape.radius + 'px · 테두리 ' + kit.shape.border + 'px' + (kit.shape.hardShadow ? ' · 하드 섀도' : ''),
      '질감 ' + (kit.grain.amount > 0 ? kit.grain.id + ' ' + Math.round(kit.grain.amount * 100) + '%' : '없음') + ' — 모든 출력에 같은 강도로.'
    ];
    if (kit.base.kind === 'blueprint') rules.push('블루프린트 존(제목·이미지·CTA 좌표)을 그대로 쓴다. 위치를 새로 잡지 않는다.');
    else rules.push('구조는 ' + kit.base.presetId + ' 프리셋. 색·폰트만 브랜드 값으로 고정한다.');
    return rules;
  }

  /**
   * 마음에 든 시안을 브랜드 키트(JSON)로 고정한다.
   * @param {string|object} source  프리셋 id · applyBlueprintJSON 결과 · 블루프린트 · 커스텀 테마 · 브랜드 키트
   * @param {object} [opts] { name, palette, grain, base }
   */
  function serializeBrandKit(source, opts) {
    opts = opts || {};
    var kit = null;

    if (typeof source === 'string') {
      var p0 = get(source);
      kit = kitFromPreset(p0, opts);
    } else if (source && source.schema === V2.brandKitSchema) {
      var parsedSelf = parseBrandKit(source);
      if (!parsedSelf.ok) throw new Error('invalid brand kit: ' + parsedSelf.errors.join(' / '));
      kit = parsedSelf.kit;
      if (opts.name) kit.name = String(opts.name);
    } else if (source && source.blueprint) {
      var nb1 = normalizeBlueprint(source.blueprint, { source: 'brandkit' });
      if (!nb1.ok) throw new Error('invalid blueprint: ' + nb1.error);
      kit = kitFromBlueprint(nb1.blueprint, opts);
    } else if (source && source.zones && source.palette) {
      var nb2 = normalizeBlueprint(source, { source: 'brandkit' });
      if (!nb2.ok) throw new Error('invalid blueprint: ' + nb2.error);
      kit = kitFromBlueprint(nb2.blueprint, opts);
    } else if (source && (source.presetId || source.preset)) {
      kit = kitFromPreset(get(source.presetId || source.preset), opts);
    } else if (source && source.palette) {
      kit = kitFromPreset(source, opts);
    } else {
      throw new Error('serializeBrandKit: preset id, blueprint or palette required');
    }

    kit.name = String(opts.name || kit.name || '내 브랜드');
    kit.id = 'bk-' + hash(JSON.stringify([kit.name, kit.base, kit.palette, kit.type, kit.grain])).toString(16);
    kit.fingerprint = brandKitFingerprint(kit);
    kit.rules = kitRules(kit);
    kit.createdAt = opts.createdAt || null;
    return kit;
  }

  /** 색 패치에서 잘못된 값은 버리고, '#' 누락은 보정한다. */
  function palettePatch(patch) {
    var out = {};
    if (!patch || typeof patch !== 'object') return out;
    Object.keys(patch).forEach(function (k) {
      var v = patch[k];
      if (isHex(v)) { out[k] = rgbToHex(hexToRgb(v)); return; }
      var t = String(v === null || v === undefined ? '' : v).trim();
      if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(t)) out[k] = rgbToHex(hexToRgb('#' + t));
    });
    return out;
  }

  function kitFromPreset(p, opts) {
    var palette = hardenPalette(Object.assign({}, deepClone(p.palette), palettePatch(opts.palette)));
    var displayFamily = p.type.family.display;
    var bodyFamily = p.type.family.body;
    return {
      schema: V2.brandKitSchema,
      version: VERSION,
      id: null,
      name: opts.name || (p.name + ' 고정'),
      locked: true,
      base: { kind: 'preset', presetId: (PRESET_INDEX[p.id] ? p.id : (opts.base || 'commerce-clean')) },
      palette: palette,
      type: {
        titleFamily: displayFamily,
        bodyFamily: bodyFamily,
        titleStyle: displayFamily === 'serif' ? 'serif' : (displayFamily === 'rounded' ? 'rounded' : (displayFamily === 'mono' ? 'mono' : 'sans')),
        bodyStyle: bodyFamily === 'serif' ? 'serif' : (bodyFamily === 'rounded' ? 'rounded' : 'sans'),
        base: p.type.base,
        ratio: p.type.ratio,
        titleWeight: p.type.roles.display.weight,
        bodyWeight: p.type.roles.body.weight,
        titleTracking: p.type.roles.display.tracking,
        bodyTracking: p.type.roles.body.tracking,
        titleLineHeight: p.type.roles.display.lineHeight,
        bodyLineHeight: p.type.roles.body.lineHeight,
        titleTransform: p.type.roles.display.transform || 'none',
        fontMix: opts.fontMix || (displayFamily === 'serif' ? 'myeongjo-title' : 'pretendard-only')
      },
      shape: {
        radius: opts.radius === undefined ? p.layout.radius : Math.max(0, Math.round(opts.radius)),
        border: opts.border === undefined ? p.layout.border : Math.max(0, Math.round(opts.border)),
        hardShadow: opts.hardShadow === undefined ? false : truthy(opts.hardShadow)
      },
      grain: normalizeGrain(opts.grain !== undefined ? opts.grain : 'none'),
      fingerprint: null,
      rules: []
    };
  }

  function kitFromBlueprint(bp, opts) {
    var palette = opts.palette ? hardenPalette(Object.assign({}, deepClone(bp.palette), palettePatch(opts.palette))) : deepClone(bp.palette);
    return {
      schema: V2.brandKitSchema,
      version: VERSION,
      id: null,
      name: opts.name || (bp.name + ' 고정'),
      locked: true,
      base: { kind: 'blueprint', blueprint: slimBlueprint(bp) },
      palette: palette,
      type: {
        titleFamily: bp.type.titleFamily,
        bodyFamily: bp.type.bodyFamily,
        titleStyle: bp.type.titleStyle,
        bodyStyle: bp.type.bodyStyle,
        base: Math.round(clamp(bp.type.bodySizeFrac * 540, 11, 22)),
        ratio: clamp(round(Math.pow(Math.max(1.05, (bp.type.titleSizeFrac * 540) / clamp(bp.type.bodySizeFrac * 540, 11, 22)), 1 / 5), 3), 1.05, 1.7),
        titleWeight: bp.type.titleWeight,
        bodyWeight: bp.type.bodyWeight,
        titleTracking: bp.type.titleTracking,
        bodyTracking: bp.type.bodyTracking,
        titleLineHeight: bp.type.titleLineHeight,
        bodyLineHeight: bp.type.bodyLineHeight,
        titleTransform: bp.type.titleTransform,
        titleSizeFrac: bp.type.titleSizeFrac,
        bodySizeFrac: bp.type.bodySizeFrac,
        fontMix: bp.type.fontMix
      },
      shape: {
        radius: opts.radius === undefined ? bp.decor.radius : Math.max(0, Math.round(opts.radius)),
        border: opts.border === undefined ? bp.decor.border : Math.max(0, Math.round(opts.border)),
        hardShadow: opts.hardShadow === undefined ? bp.decor.hardShadow : truthy(opts.hardShadow)
      },
      grain: normalizeGrain(opts.grain !== undefined ? opts.grain : bp.decor.grain),
      fingerprint: null,
      rules: []
    };
  }

  /** 브랜드 키트 JSON 검증 */
  function parseBrandKit(input) {
    var errors = [];
    var raw = input;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); }
      catch (e) { return { ok: false, kit: null, errors: ['JSON 문법 오류: ' + e.message] }; }
    }
    if (!raw || typeof raw !== 'object') return { ok: false, kit: null, errors: ['브랜드 키트가 객체가 아닙니다.'] };
    if (raw.schema !== V2.brandKitSchema) errors.push('schema가 ' + V2.brandKitSchema + '가 아닙니다: ' + raw.schema);

    var palette = raw.palette || {};
    ['bg', 'surface', 'ink', 'sub', 'line', 'accent', 'accentInk', 'accentSoft'].forEach(function (k) {
      if (!isHex(palette[k])) errors.push('palette.' + k + ' 색 형식 오류: ' + palette[k]);
    });
    var type = raw.type || {};
    if (!type.titleFamily || !type.bodyFamily) errors.push('type.titleFamily / bodyFamily가 없습니다.');
    if (!type.titleWeight || !type.bodyWeight) errors.push('type 굵기가 없습니다.');
    var base = raw.base || {};
    if (base.kind === 'preset') {
      if (!base.presetId) errors.push('base.presetId가 없습니다.');
      else { try { get(base.presetId); } catch (e) { errors.push('알 수 없는 프리셋: ' + base.presetId); } }
    } else if (base.kind === 'blueprint') {
      if (!base.blueprint) errors.push('base.blueprint가 없습니다.');
    } else {
      errors.push('base.kind는 preset 또는 blueprint여야 합니다: ' + base.kind);
    }

    if (errors.length) return { ok: false, kit: null, errors: errors };

    var kit = {
      schema: V2.brandKitSchema,
      version: raw.version || VERSION,
      id: raw.id || 'bk-' + hash(JSON.stringify(raw)).toString(16),
      name: String(raw.name || '내 브랜드'),
      locked: raw.locked === undefined ? true : truthy(raw.locked),
      base: base.kind === 'blueprint' ? { kind: 'blueprint', blueprint: deepClone(base.blueprint) } : { kind: 'preset', presetId: base.presetId },
      palette: deepClone(palette),
      type: deepClone(type),
      shape: {
        radius: Math.max(0, Math.round(Number(raw.shape && raw.shape.radius) || 0)),
        border: Math.max(0, Math.round(Number(raw.shape && raw.shape.border) || 0)),
        hardShadow: truthy(raw.shape && raw.shape.hardShadow)
      },
      grain: normalizeGrain(raw.grain),
      createdAt: raw.createdAt || null,
      rules: Array.isArray(raw.rules) && raw.rules.length ? raw.rules.slice() : []
    };
    var stated = raw.fingerprint || null;
    kit.fingerprint = brandKitFingerprint(kit);
    kit.statedFingerprint = stated;
    if (!kit.rules.length) kit.rules = kitRules(kit);
    return { ok: true, kit: kit, errors: [], drift: !!(stated && stated !== kit.fingerprint) };
  }

  function brandKitJSON(kit, pretty) {
    var parsed = parseBrandKit(kit);
    if (!parsed.ok) throw new Error('invalid brand kit: ' + parsed.errors.join(' / '));
    return JSON.stringify(parsed.kit, null, pretty === false ? 0 : 2);
  }

  /** 키트의 팔레트를 적용한 프리셋 사본 (get() 인덱스를 피하려고 id를 바꾼다) */
  function kitPreset(kit) {
    var base = get(kit.base.presetId || 'commerce-clean');
    var p = deepClone(base);
    p.id = 'kit-' + hash(kit.fingerprint || kit.id).toString(16);
    p.name = kit.name;
    p.nameEn = 'Brand Kit';
    p.palette = deepClone(kit.palette);
    p.type.base = Number(kit.type.base) || p.type.base;
    p.type.ratio = Number(kit.type.ratio) || p.type.ratio;
    p.type.family = { display: kit.type.titleFamily, body: kit.type.bodyFamily, mono: 'mono' };
    p.type.roles.display = { weight: kit.type.titleWeight, lineHeight: kit.type.titleLineHeight, tracking: kit.type.titleTracking, transform: kit.type.titleTransform || 'none' };
    p.type.roles.h1 = { weight: kit.type.titleWeight, lineHeight: 1.18, tracking: '-0.02em', transform: 'none' };
    p.type.roles.h2 = { weight: kit.type.titleWeight, lineHeight: 1.26, tracking: '-0.01em', transform: 'none' };
    p.type.roles.lead = { weight: kit.type.bodyWeight, lineHeight: kit.type.bodyLineHeight, tracking: '0em', transform: 'none' };
    p.type.roles.body = { weight: kit.type.bodyWeight, lineHeight: kit.type.bodyLineHeight, tracking: kit.type.bodyTracking, transform: 'none' };
    p.layout.radius = kit.shape.radius;
    p.layout.border = kit.shape.border;
    p.layout.shadow = kit.shape.hardShadow ? '6px 6px 0 ' + kit.palette.ink : 'none';
    if (p.dna) {
      p.dna.type.displayFamily = kit.type.titleStyle || (kit.type.titleFamily === 'serif' ? 'serif' : 'sans');
      p.dna.type.bodyFamily = kit.type.bodyStyle || (kit.type.bodyFamily === 'serif' ? 'serif' : 'sans');
      p.dna.type.displayWeight = kit.type.titleWeight;
      p.dna.type.bodyWeight = kit.type.bodyWeight;
      p.dna.type.displayTracking = kit.type.titleTracking;
      p.dna.type.bodyTracking = kit.type.bodyTracking;
      p.dna.type.displayLineHeight = kit.type.titleLineHeight;
      p.dna.type.bodyLineHeight = kit.type.bodyLineHeight;
      p.dna.type.scaleRatio = p.type.ratio;
      p.dna.graphics.radius = kit.shape.radius;
      p.dna.graphics.border = kit.shape.border;
      p.dna.graphics.shadow = kit.shape.hardShadow ? 'hard' : 'none';
      p.dna.graphics.texture = kit.grain.id;
    }
    p.isCustom = true;
    p.isBrandKit = true;
    p.defaultRisk = detectDefaultLook(p);
    return p;
  }

  /** 키트 팔레트 변경 뒤 이미지 위 글자색을 다시 계산 */
  function kitBlueprint(kit) {
    var nb = normalizeBlueprint(kit.base.blueprint, { source: 'brandkit', name: kit.name });
    if (!nb.ok) return null;
    var bp = nb.blueprint;
    bp.palette = deepClone(kit.palette);
    bp.type.titleFamily = kit.type.titleFamily;
    bp.type.bodyFamily = kit.type.bodyFamily;
    bp.type.titleWeight = kit.type.titleWeight;
    bp.type.bodyWeight = kit.type.bodyWeight;
    bp.type.titleTracking = kit.type.titleTracking;
    bp.type.bodyTracking = kit.type.bodyTracking;
    bp.type.titleLineHeight = kit.type.titleLineHeight;
    bp.type.bodyLineHeight = kit.type.bodyLineHeight;
    if (kit.type.titleSizeFrac) bp.type.titleSizeFrac = kit.type.titleSizeFrac;
    if (kit.type.bodySizeFrac) bp.type.bodySizeFrac = kit.type.bodySizeFrac;
    bp.decor.radius = kit.shape.radius;
    bp.decor.border = kit.shape.border;
    bp.decor.hardShadow = kit.shape.hardShadow;
    bp.decor.grain = normalizeGrain(kit.grain);
    if (bp.flags.textOnImage && bp.flags.overlay.type !== 'none') {
      var worstBg = mix('#FFFFFF', bp.flags.overlay.color, bp.flags.overlay.opacity);
      bp.flags.textColor = ensureContrast(bp.palette.ink, worstBg, 4.5, '#FFFFFF');
      bp.flags.subTextColor = ensureContrast(bp.palette.sub, worstBg, 4.5, '#FFFFFF');
    } else {
      bp.flags.textColor = bp.palette.ink;
      bp.flags.subTextColor = bp.palette.sub;
    }
    bp.name = kit.name;
    bp.id = 'bp-' + hash(blueprintFingerprint(bp)).toString(16);
    return bp;
  }

  /**
   * 브랜드 키트로 렌더. 키트에 고정된 색·폰트·질감·구도를 그대로 적용한다.
   * @param {object|string} kitInput
   * @param {object} [content]
   * @param {object} [opts]
   */
  function applyBrandKit(kitInput, content, opts) {
    opts = opts || {};
    var parsed = parseBrandKit(kitInput);
    if (!parsed.ok) {
      return { ok: false, errors: parsed.errors, kit: null, drift: false, html: '', css: '', canvas: null, warnings: parsed.errors.slice() };
    }
    var kit = parsed.kit;
    var c = content || {};
    var density = checkVisualDensity(c);
    var warnings = [], drift = false;

    if (kit.base.kind === 'blueprint') {
      var bp = kitBlueprint(kit);
      if (!bp) {
        return { ok: false, errors: ['블루프린트를 해석하지 못했습니다.'], kit: kit, drift: false, html: '', css: '', canvas: null, warnings: ['블루프린트를 해석하지 못했습니다.'] };
      }
      var rendered = renderBlueprint(bp, c, opts);
      drift = !!(kit.statedFingerprint && kit.statedFingerprint !== kit.fingerprint);
      warnings = rendered.warnings.slice();
      if (drift) warnings.push('브랜드 키트의 지문이 내용과 다릅니다(색·폰트·질감 중 하나가 바뀜).');
      return {
        ok: true, kit: kit, kitId: kit.id, locked: kit.locked, drift: drift,
        preset: rendered.preset, tokens: rendered.tokens, html: rendered.html, css: rendered.css,
        canvas: rendered.canvas, density: density, warnings: warnings, fixes: rendered.fixes,
        meta: Object.assign({}, rendered.meta, { kitFingerprint: kit.fingerprint, density: { level: density.level, total: density.counts.total, limit: density.limit } })
      };
    }

    var p = kitPreset(kit);
    var kitHtmlOpts = Object.assign({}, opts.html || {});
    if (kitHtmlOpts.width === undefined && opts.width) kitHtmlOpts.width = opts.width;
    var html = toHTML(p, c, kitHtmlOpts);
    html = insertGrain(html, kit.grain);
    var canvas = toCanvas(p, Object.assign({}, c, opts.canvas || {}));
    grainCanvasCommands({ grain: kit.grain, width: canvas.width, height: canvas.height }).forEach(function (g) { canvas.commands.push(g); });
    canvas.meta.grain = deepClone(kit.grain);
    var css = toCSS(p, opts.css || {}) + '\n' +
      '.kit-grain { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: multiply; opacity: ' + round(clamp(kit.grain.amount * 2.4, 0.02, 0.16), 3) + '; }\n';
    var tk = tokens(p);

    if (!density.ok) warnings.push(density.message);
    if (kit.grain.amount >= 0.045) warnings.push('그레인 4.5%는 인쇄 질감이 강합니다. 작은 글자 가독성을 확인하세요.');
    if (!tk.a11y.allPass) warnings.push('브랜드 팔레트에 WCAG AA 미달 조합이 있습니다.');
    if (kit.base.presetId) warnings.push('구조는 ' + kit.base.presetId + ' 프리셋으로 고정됩니다.');

    drift = !!(kit.statedFingerprint && kit.statedFingerprint !== kit.fingerprint);
    if (drift) warnings.push('브랜드 키트의 지문이 내용과 다릅니다(색·폰트·질감 중 하나가 바뀜).');

    return {
      ok: true, kit: kit, kitId: kit.id, locked: kit.locked, drift: drift,
      preset: p, tokens: tk, html: html, css: css, canvas: canvas, density: density,
      warnings: warnings, fixes: [],
      meta: {
        structure: p.dna ? p.dna.layout.structure : null,
        kitFingerprint: kit.fingerprint,
        grain: deepClone(kit.grain),
        fontMix: kit.type.fontMix,
        overflow: canvas.meta.overflow,
        contrast: canvas.meta.contrast,
        density: { level: density.level, total: density.counts.total, limit: density.limit },
        canvas: { width: canvas.width, height: canvas.height }
      }
    };
  }

  function insertGrain(html, grain) {
    var overlay = grainOverlayHTML({ grain: grain });
    if (!overlay) return html;
    var idx = String(html).lastIndexOf('</figure>');
    return idx >= 0 ? html.slice(0, idx) + overlay + html.slice(idx) : html + overlay;
  }

  /* ==========================================================
     10. 검증
     ========================================================== */

  function validate(preset) {
    var p = get(preset);
    var errors = [];
    var warns = [];

    var hexOk = true;
    ['bg', 'surface', 'ink', 'sub', 'line', 'accent', 'accentInk', 'accentSoft'].forEach(function (k) {
      if (!isHex(p.palette[k])) { errors.push('palette.' + k + ' 형식 오류: ' + p.palette[k]); hexOk = false; }
    });
    if (p.ratio.bg + p.ratio.surface + p.ratio.accent !== 100) {
      errors.push('60-30-10 비율 합이 100이 아닙니다: ' + (p.ratio.bg + p.ratio.surface + p.ratio.accent));
    }
    if (hexOk) {
      contrastReport(p).forEach(function (r) {
        if (!r.pass) errors.push(r.label + ' 대비 ' + r.ratio + ':1 (필요 ' + r.required + ':1)');
      });
    }
    if (p.layout.unit % 4 !== 0) errors.push('8pt 그리드 단위가 4의 배수가 아닙니다: ' + p.layout.unit);
    [p.layout.gutter, p.layout.margin, p.layout.sectionGap].forEach(function (v) {
      if (v % 4 !== 0) warns.push('여백이 4pt 배수가 아닙니다: ' + v);
    });
    if (p.layout.radius < 0 || p.layout.border < 0) errors.push('음수 라운딩/보더');
    var ty = typography(p);
    if (ty.roles.body.size < 12) errors.push('본문 폰트가 12px 미만: ' + ty.roles.body.size);
    if (ty.roles.display.size <= ty.roles.h1.size && ty.roles.h1.size <= ty.roles.body.size) {
      errors.push('타이포 위계가 역전되었습니다');
    }
    if (p.type.ratio < 1.05 || p.type.ratio > 1.7) warns.push('모듈러 비율 ' + p.type.ratio + '은 일반 범위(1.125~1.5) 밖입니다.');

    return { ok: errors.length === 0, errors: errors, warnings: warns, preset: p.id };
  }

  /* ==========================================================
     11. 내보내기
     ========================================================== */

  return {
    VERSION: VERSION,
    PRESETS: PRESETS,
    FONT_STACKS: FONT_STACKS,
    INDUSTRIES: INDUSTRIES,

    list: list,
    get: get,
    recommend: recommend,
    pick: pick,
    normalizeIndustry: normalizeIndustry,

    /* 맥락 기반 추천 → 선택 → 적용 */
    analyzeContentContext: analyzeContentContext,
    analyzeDensity: analyzeDensity,
    recommendDesignRefs: recommendRefs,
    pickRef: pickRef,
    applyDesignRef: applyDesignRef,
    detectDefaultLook: detectDefaultLook,

    /* 레퍼런스 이미지 → 팔레트 → 테마 */
    extractPaletteFromPixels: extractPaletteFromPixels,
    paletteFromImageData: paletteFromImageData,
    buildCustomTheme: buildCustomTheme,
    themeFromPixels: themeFromPixels,

    /* 4축 디자인 DNA + 이미지 합성 */
    dnaOf: dnaOf,
    layoutPlan: layoutPlan,
    imageTextSafety: imageTextSafety,
    composeWithImage: composeWithImage,

    tokens: tokens,
    typography: typography,
    typeScale: typeScale,
    spacingScale: spacingScale,
    contrastReport: contrastReport,
    allContrastPass: allContrastPass,

    toCSS: toCSS,
    toHTML: toHTML,
    toCanvas: toCanvas,
    canvasRunnerSource: canvasRunnerSource,

    validate: validate,

    /* ── v2: 무한 레퍼런스 · AI 티 0% · 브랜드 고정 ── */
    V2: { schema: V2.schema, blueprintSchema: V2.blueprintSchema, brandKitSchema: V2.brandKitSchema, densityLimit: V2.densityLimit },

    /* 1클릭 레퍼런스 검색 */
    buildReferenceSearchUrls: buildReferenceSearchUrls,
    REFERENCE_QUERY_MAP: REFERENCE_QUERY_MAP,

    /* 레퍼런스 사진 → 해부 JSON → 무제한 블루프린트 */
    buildVisionBlueprintPrompt: buildVisionBlueprintPrompt,
    parseBlueprintJSON: parseBlueprintJSON,
    normalizeBlueprint: normalizeBlueprint,
    blueprintToPreset: blueprintToPreset,
    blueprintFingerprint: blueprintFingerprint,
    blueprintLayout: blueprintLayout,
    applyBlueprintJSON: applyBlueprintJSON,
    blueprintHTML: blueprintHTML,
    blueprintCSS: blueprintCSS,
    blueprintCanvas: blueprintCanvas,
    BLUEPRINT_SCHEMA: BLUEPRINT_SCHEMA,
    BLUEPRINT_EXAMPLE: BLUEPRINT_EXAMPLE,

    /* 한글 폰트 믹스 */
    listFontMixes: listFontMixes,
    fontMix: fontMix,
    fontMixStacks: fontMixStacks,
    fontMixCSS: fontMixCSS,
    resolveFontFamily: resolveFontFamily,
    FONT_MIXES: FONT_MIXES,

    /* 그레인 질감 */
    listGrains: listGrains,
    grainPreset: grainPreset,
    grainAmount: grainAmount,
    normalizeGrain: normalizeGrain,
    grainSVGDataUri: grainSVGDataUri,
    grainCSS: grainCSS,
    grainOverlayHTML: grainOverlayHTML,
    grainCanvasCommands: grainCanvasCommands,
    GRAIN_PRESETS: GRAIN_PRESETS,

    /* 글자 수 다이어트 */
    checkVisualDensity: checkVisualDensity,
    textChars: textChars,

    /* 브랜드 키트 고정 */
    serializeBrandKit: serializeBrandKit,
    parseBrandKit: parseBrandKit,
    applyBrandKit: applyBrandKit,
    brandKitJSON: brandKitJSON,
    brandKitFingerprint: brandKitFingerprint,

    /* 색 유틸 (앱에서 커스텀 팔레트 검사용) */
    color: {
      hexToRgb: hexToRgb,
      rgbToHex: rgbToHex,
      relativeLuminance: relativeLuminance,
      contrastRatio: contrastRatio,
      wcagLevel: wcagLevel,
      passesAA: passesAA,
      mix: mix,
      luminanceSafeText: luminanceSafeText
    },

    _util: { clamp: clamp, round: round, wrapText: wrapText, estimateMaxChars: estimateMaxChars }
  };
});
