#!/usr/bin/env node
/* ============================================================
   원탭 숏폼 스튜디오 · test.js
   core.js · pro.js 단위 테스트 + 파일 위생/보안 검사. DOM 없이 돈다.
     node test.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const C = require('./core.js');
const Pro = require('./pro.js').ShortsPro;

let pass = 0;
const failures = [];
let groupName = '';

function group(name) { groupName = name; }
function ok(cond, label, detail) {
  if (cond) { pass++; return; }
  failures.push(groupName + ' · ' + label + (detail === undefined ? '' : '  [' + String(detail) + ']'));
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(a === e, label, 'expected ' + e + ' got ' + a);
}
function no(cond, label, detail) { ok(!cond, label, detail); }
function includes(hay, needle, label) { ok(String(hay).indexOf(needle) >= 0, label, String(needle)); }
function excludes(hay, needle, label) { ok(String(hay).indexOf(needle) < 0, label, 'found'); }

function lum(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  const c = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ══════════════════════════════════════════════════════════
   1. 카탈로그
   ══════════════════════════════════════════════════════════ */
group('카탈로그');
eq(C.THEMES.length, 6, '테마 6종');
eq(C.STAGES.length, 5, '5컷 구조');
eq(C.TONES.length, 3, '말투 3종');
eq(C.PLATFORMS.length, 4, '플랫폼 4종');
eq(C.STAGES.map(s => s.id), ['hook', 'problem', 'solution', 'proof', 'cta'], '단계 순서');
eq(new Set(C.THEMES.map(t => t.id)).size, 6, '테마 id 중복 없음');
eq(new Set(C.THEMES.map(t => t.deco)).size, 6, '테마 데코 중복 없음');
ok(C.THEMES.every(t => /^#[0-9A-Fa-f]{6}$/.test(t.bg) && /^#[0-9A-Fa-f]{6}$/.test(t.ink) && /^#[0-9A-Fa-f]{6}$/.test(t.accent)), '테마 색상 형식');
ok(C.THEMES.every(t => contrast(t.bg, t.ink) >= 4.5), '테마 본문 대비 4.5:1', C.THEMES.map(t => t.id + ':' + contrast(t.bg, t.ink).toFixed(2)).join(','));
ok(C.THEMES.every(t => contrast(t.ink, t.accent) >= 2.8 || contrast(t.bg, t.accent) >= 2.8), '테마 강조색이 배경과 구분됨');
ok(C.THEMES.every(t => t.name && t.nameEn && t.tagline), '테마 이름·설명');
ok(C.STAGES.every(s => s.label && s.goal && s.hint && s.min > 0 && s.base > 0), '단계 필드');
ok(C.TONES.every(t => t.name && t.desc && t.sample), '말투 필드');
ok(C.PLATFORMS.every(p => p.ratio === '9:16' && p.max > 0 && p.note), '플랫폼 9:16 규격');
eq(C.themeById('nope').id, 'editorial', '알 수 없는 테마 기본값');
eq(C.platformById('nope').id, 'shorts', '알 수 없는 플랫폼 기본값');
eq(C.toneById('nope').id, 'friendly', '알 수 없는 말투 기본값');
eq(C.stageById('nope').id, 'hook', '알 수 없는 단계 기본값');

/* ══════════════════════════════════════════════════════════
   2. 대본 분배
   ══════════════════════════════════════════════════════════ */
group('스토리보드');
const onlyTopic = C.distributeCuts({ topic: '홈카페 라떼' });
eq(onlyTopic.cuts.length, 5, '주제만으로 5컷');
eq(onlyTopic.cuts.map(c => c.stage), ['hook', 'problem', 'solution', 'proof', 'cta'], '단계 순서 유지');
ok(onlyTopic.cuts.every(c => c.headline.length > 4 && c.headline.length <= C.LIMITS.headline), '제목 길이', onlyTopic.cuts.map(c => c.headline.length).join(','));
ok(onlyTopic.cuts.every(c => c.sub.length <= C.LIMITS.sub), '보조 문장 길이');
ok(onlyTopic.cuts.every(c => c.duration >= C.DURATIONS.min && c.duration <= C.DURATIONS.max), '길이 범위');
ok(onlyTopic.cuts[0].headline.indexOf('홈카페 라떼') >= 0, '훅에 주제 포함', onlyTopic.cuts[0].headline);
eq(onlyTopic.source, 'topic', 'source=topic');
eq(onlyTopic.filled, 5, '5컷 모두 생성');
ok(onlyTopic.cuts.every(c => c.direction && c.direction.length > 3), '연출 지시 포함');
ok(onlyTopic.cuts.every(c => Array.isArray(c.highlight)), '강조 단어 배열');
eq(C.distributeCuts({}).topic, '오늘의 주제', '빈 입력 기본 주제');
eq(C.distributeCuts({}).cuts.length, 5, '빈 입력도 5컷');

const script5 = ['첫 문장입니다', '둘째 문장입니다', '셋째 문장입니다', '넷째 문장입니다', '다섯째 문장입니다'].join('\n');
const fromScript = C.distributeCuts({ topic: '테스트', script: script5 });
eq(fromScript.cuts.map(c => c.headline), ['첫 문장입니다', '둘째 문장입니다', '셋째 문장입니다', '넷째 문장입니다', '다섯째 문장입니다'], '대본 5줄 그대로');
eq(fromScript.source, 'script', 'source=script');
eq(fromScript.filled, 0, '생성된 컷 0');

const script3 = ['첫 줄', '둘째 줄', '셋째 줄'].join('\n');
const partial = C.distributeCuts({ topic: '테스트', script: script3 });
eq(partial.cuts.length, 5, '대본 3줄도 5컷');
eq(partial.cuts.slice(0, 3).map(c => c.headline), ['첫 줄', '둘째 줄', '셋째 줄'], '앞 3컷은 대본');
eq(partial.filled, 2, '2컷 생성');

const numbered = C.distributeCuts({ topic: '테스트', script: '1. 첫 번째\n2) 두 번째\n- 세 번째\n• 네 번째\n⑤ 다섯 번째' });
eq(numbered.cuts.length, 5, '번호·불릿 제거 후 5컷');
eq(numbered.cuts[0].headline, '첫 번째', '번호 제거');
eq(numbered.cuts[2].headline, '세 번째', '불릿 제거');

const longLine = '아주 긴 대본 한 줄이 여기에 있습니다 그리고 계속 이어지면서 제목 제한을 넘어가는 경우를 확인합니다';
const longDist = C.distributeCuts({ topic: '테스트', script: longLine });
ok(longDist.cuts[0].headline.length <= C.LIMITS.headline, '긴 줄은 제목 제한 내로 분리', longDist.cuts[0].headline);
ok(longDist.cuts[0].sub.length > 0, '남은 문장은 보조 문장으로');

const friendly = C.distributeCuts({ topic: '같은 주제', tone: 'friendly' });
const calm = C.distributeCuts({ topic: '같은 주제', tone: 'calm' });
no(friendly.cuts[0].headline === calm.cuts[0].headline, '말투가 다르면 문장이 다름');
eq(C.distributeCuts({ topic: 'x', tone: 'calm', variant: 1 }).cuts[0].duration === undefined, false, 'variant 허용');

const plain = C.splitScript('한 문장. 두 문장. 세 문장. 네 문장. 다섯 문장.');
eq(plain.length, 5, '문장 단위 분리');
eq(C.splitScript('').length, 0, '빈 대본');
eq(C.splitScript('가나\n\n다라\n').length, 2, '빈 줄 제거');

/* ── 정규화 · 재생성 ─────────────────────────────────── */
group('컷 정규화');
const messy = C.normalizeCuts([
  { headline: '하나', duration: 99, image: 'data:image/png;base64,zzz' },
  { sub: '보조만 있음' },
  { stage: 'proof', headline: '증거만' }
]);
eq(messy.length, 5, '항상 5컷');
ok(messy.every(c => c.duration <= C.DURATIONS.max && c.duration >= C.DURATIONS.min), '길이 강제');
eq(messy[4].stage, 'cta', '마지막은 CTA');
ok(messy[0].image.indexOf('data:image') === 0, '이미지 유지');
const regenerated = C.regenerateCut(messy, 0, { topic: '주제', tone: 'friendly' });
eq(regenerated.length, 5, '재생성 후 5컷');
no(regenerated[0].headline === messy[0].headline, '재생성은 다른 문장');
eq(regenerated[0].image, messy[0].image, '재생성해도 이미지 유지');

/* ══════════════════════════════════════════════════════════
   3. 시간축 · 자막
   ══════════════════════════════════════════════════════════ */
group('시간축');
const cuts = C.distributeCuts({ topic: '시간 테스트' }).cuts;
const tl = C.timeline(cuts);
eq(tl.length, 5, '타임라인 5구간');
eq(tl[0].start, 0, '첫 시작 0');
ok(tl.every((seg, i) => i === 0 || seg.start === tl[i - 1].end), '구간이 끊기지 않음');
ok(tl.every(seg => seg.end > seg.start), '끝이 시작보다 큼');
eq(C.totalMs(cuts), tl[4].end, '총 길이 = 마지막 끝');
ok(C.totalMs(cuts) > 5000 && C.totalMs(cuts) < 60000, '총 길이 5~60초', C.totalMs(cuts));
const fixed = C.normalizeCuts([{ headline: 'a', duration: 1.5 }, { headline: 'b', duration: 2 }, { headline: 'c', duration: 0.8 }, { headline: 'd', duration: 1 }, { headline: 'e', duration: 1 }]);
eq(C.totalMs(fixed), 6300, '고정 길이 합산(ms)');
eq(C.timeline(fixed)[1].start, 1500, '누적 시작');

eq(C.formatTimecode(0), '00:00:00,000', 'SRT 0ms');
eq(C.formatTimecode(6300), '00:00:06,300', 'SRT 6.3s');
eq(C.formatTimecode(3723004), '01:02:03,004', 'SRT 1시간');
eq(C.formatClock(0), '0:00', '시계 0');
eq(C.formatClock(6300), '0:06', '시계 6초');
eq(C.formatClock(65400), '1:05', '시계 1분');

group('자막');
const srt = C.buildSrt(fixed);
const blocks = srt.trim().split(/\n\n/);
eq(blocks.length, 5, 'SRT 5개 블록');
ok(/^1\n00:00:00,000 --> 00:00:01,500\n/.test(blocks[0]), 'SRT 첫 블록 형식', blocks[0]);
eq(blocks[4].split('\n')[1], '00:00:05,300 --> 00:00:06,300', 'SRT 마지막 시간');
ok(srt.endsWith('\n'), 'SRT 끝줄바꿈');
const srtWrapped = C.buildSrt(cuts, { maxChars: 10 });
srtWrapped.split(/\n\n/).forEach(b => {
  const lines = b.split('\n').slice(2);
  ok(lines.every(l => l.length <= 22), '자막 줄 길이 제한', l => l);
});
const manyLines = C.buildSrt(cuts);
ok(manyLines.indexOf('[') < 0, '기본 SRT에는 라벨 없음');
ok(C.buildSrt(cuts, { includeLabel: true }).indexOf('[훅]') >= 0, '라벨 옵션');
const vtt = C.buildVtt(fixed);
ok(vtt.indexOf('WEBVTT') === 0, 'VTT 헤더');
ok(vtt.indexOf('00:00:01.500') >= 0, 'VTT 소수점 시간');
eq(C.narrationText({ headline: '제목', sub: '보조' }), '제목. 보조', '내레이션 문장');

group('줄바꿈');
const wrapped = C.wrapText('가나다라마바사아자차카타파하가나다라마바사', 8);
ok(wrapped.every(l => l.length <= 8), '문자 수 제한', wrapped.join('/'));
eq(wrapped.join(''), '가나다라마바사아자차카타파하가나다라마바사', '글자 손실 없음');
eq(C.wrapText('', 10).length, 0, '빈 문자열');
ok(C.wrapText('짧은 문장', 20).length === 1, '짧으면 한 줄');
ok(C.wrapText('아주긴단어가계속이어지는경우를확인합니다', 6).every(l => l.length <= 6), '공백 없는 긴 단어도 자름');

/* ══════════════════════════════════════════════════════════
   4. 강조 · AI 티 · 카피
   ══════════════════════════════════════════════════════════ */
group('강조');
eq(C.findHighlights('매출이 **3배** 늘었습니다', 2)[0], '3배', '**표시 우선');
ok(C.findHighlights('37% 줄었습니다', 2).some(t => t.indexOf('37') >= 0), '숫자 자동 강조');
const segs = C.splitHighlight('매출 3배 늘었습니다', ['3배']);
eq(segs.map(s => s.text).join(''), '매출 3배 늘었습니다', '강조 분할 후 원문 유지');
eq(segs.filter(s => s.hl).length, 1, '강조 1개');
eq(C.splitHighlight('없음', []).length, 1, '강조 없으면 한 덩어리');
eq(C.splitHighlight('', ['a']).length, 0, '빈 줄');

group('AI 티');
const clean = C.checkAiTone('우유 온도 하나만 바꿔도 맛이 달라짐');
eq(clean.score, 100, '상투어 없으면 100점');
eq(clean.hits.length, 0, '걸린 표현 0');
const aiText = C.checkAiTone('소중한 리뷰 진심으로 감사합니다. 앞으로도 다양한 콘텐츠로 찾아뵙겠습니다.');
ok(aiText.score < 60, 'AI 티 점수 하락', aiText.score);
eq(aiText.hits.length, 4, '4개 적발', aiText.hits.map(h => h.word).join(','));
ok(aiText.hits.every(h => h.reason && h.alt), '이유·대안 제공');
eq(aiText.label, 'AI 티 남', '라벨');
eq(C.checkAiTone('').score, 100, '빈 문장');

group('캡션');
const caption = C.buildCaption({ topic: '홈카페 라떼', cuts: cuts, platform: 'reels' });
ok(caption.indexOf('#') > 0, '해시태그 포함');
ok(caption.split('\n').filter(Boolean).length >= 3, '훅·CTA·태그');
ok(caption.indexOf('#릴스') >= 0, '플랫폼 태그', caption);
ok(C.buildHashtags('홈카페 라떼', 'shorts').indexOf('#홈카페') >= 0, '주제 태그');

/* ══════════════════════════════════════════════════════════
   5. AI 프롬프트 · 파싱 · 병합
   ══════════════════════════════════════════════════════════ */
group('AI 프롬프트');
const prompt = C.buildScriptPrompt({ topic: '홈카페 라떼', tone: 'friendly', platform: 'shorts', extra: '20대 직장인' });
includes(prompt, '홈카페 라떼', '주제 포함');
includes(prompt, '친근한 반말', '톤 포함');
includes(prompt, '20대 직장인', '추가 요청 포함');
includes(prompt, 'JSON', 'JSON 요청');
includes(prompt, '"stage":"hook"', '스키마 예시');
includes(prompt, '소중한', '금지어 목록');
includes(prompt, '[숫자]', '수치 자리표시 규칙');
ok(prompt.length > 500 && prompt.length < 3000, '프롬프트 길이', prompt.length);

const imgPrompt = C.buildImagePrompt({ headline: '우유 온도', sub: '60도' }, { theme: 'neon' });
includes(imgPrompt, '9:16', '세로 비율');
includes(imgPrompt, 'No text', '글자 금지');
includes(imgPrompt, 'neon', '테마 스타일');
includes(imgPrompt, '우유 온도', '장면 설명');

group('AI 응답 파싱');
const jsonCuts = C.parseAiCuts(JSON.stringify([
  { stage: 'hook', headline: '첫 훅', sub: '보조1' },
  { stage: 'problem', headline: '문제', sub: '보조2' },
  { stage: 'solution', headline: '해결', sub: '보조3' },
  { stage: 'proof', headline: '증거', sub: '보조4' },
  { stage: 'cta', headline: '행동', sub: '보조5' }
]));
eq(jsonCuts.length, 5, 'JSON 5컷');
eq(jsonCuts[2].stage, 'solution', '단계 매핑');
eq(jsonCuts[0].headline, '첫 훅', '제목');
const fenced = C.parseAiCuts('설명입니다.\n```json\n[{"headline":"코드블록 훅"},{"headline":"둘"}]\n```\n끝.');
eq(fenced.length, 2, '코드펜스 제거');
eq(fenced[0].headline, '코드블록 훅', '펜스 안 JSON');
const objectWrap = C.parseAiCuts('{"cuts":[{"title":"객체 훅","body":"설명"},{"title":"둘"}]}');
eq(objectWrap.length, 2, '객체 래퍼');
eq(objectWrap[0].headline, '객체 훅', 'title→headline');
eq(objectWrap[0].sub, '설명', 'body→sub');
const pipe = C.parseAiCuts('1. 훅 | 첫 문장 | 보조\n2 | 문제 문장 | 설명2\n3. 해결: 세 번째\n4. 증거 | 네 번째\n5. CTA | 다섯 번째');
eq(pipe.length, 5, '파이프 5컷', JSON.stringify(pipe));
eq(pipe[0].headline, '첫 문장', '파이프 첫 제목');
eq(pipe[0].sub, '보조', '파이프 보조');
eq(pipe[1].headline, '문제 문장', '숫자+파이프');
eq(pipe[2].headline, '세 번째', '라벨+콜론');
eq(pipe[4].stage, 'cta', 'CTA 인식');
const plain8 = C.parseAiCuts('첫 제목\n첫 보조\n둘 제목\n둘 보조\n셋 제목\n셋 보조\n넷 제목\n넷 보조');
eq(plain8.length, 4, '8줄 → 4쌍');
eq(plain8[0].sub, '첫 보조', '줄 짝짓기');
eq(C.parseAiCuts('').length, 0, '빈 응답');
eq(C.parseAiCuts('그냥 설명만 있고 대본은 없습니다').length, 1, '설명 1줄은 1컷으로');
eq(C.parseAiCuts('```\n```').length, 0, '빈 코드블록');

const merged = C.mergeAiCuts(cuts, [
  { stage: 'hook', headline: '새 훅', sub: '새 보조' },
  { stage: 'cta', headline: '새 행동' }
]);
eq(merged.length, 5, '병합 후 5컷');
eq(merged[0].headline, '새 훅', '훅 교체');
eq(merged[4].headline, '새 행동', '행동 교체');
eq(merged[2].headline, cuts[2].headline, '없는 단계는 유지');
eq(C.mergeAiCuts(cuts, []).length, 5, '빈 AI 결과는 그대로');

/* ══════════════════════════════════════════════════════════
   6. 프로젝트 · 저장 · 검사
   ══════════════════════════════════════════════════════════ */
group('프로젝트');
const project = Object.assign(C.emptyProject(), { topic: '홈카페 라떼', cuts: cuts, theme: 'neon', platform: 'tiktok' });
const stats = C.projectStats(project);
eq(stats.totalMs, C.totalMs(cuts), '통계 총 길이');
ok(stats.chars > 40, '글자 수 합산');
ok(stats.aiTone.score > 0, 'AI 티 점수 포함');
eq(stats.platform.id, 'tiktok', '플랫폼 연결');
eq(C.projectStats({ cuts: C.normalizeCuts(Array(5).fill({ headline: '문장', duration: 15 })), platform: 'shorts' }).overPlatformMax, true, '60초 초과 감지');

const issues = C.validateProject(project);
ok(Array.isArray(issues) && issues.length >= 0, '검사 결과 배열');
const longHook = C.normalizeCuts([{ headline: '아주 긴 훅 문장이 스물네 글자를 확실히 넘기도록 길게 작성된 문장입니다' }, {}, {}, {}, {}]);
ok(C.validateProject({ cuts: longHook, topic: 't', platform: 'shorts' }).some(i => i.field === 'hook'), '긴 훅 경고');
const placeholder = C.normalizeCuts([{ headline: '제목', sub: '[숫자]를 넣으세요' }, {}, {}, {}, {}]);
ok(C.validateProject({ cuts: placeholder, topic: 't' }).some(i => i.level === 'info' && i.text.indexOf('대괄호') >= 0), '대괄호 안내');
const slow = C.normalizeCuts(Array(5).fill({ headline: '문장', duration: 15 }));
ok(C.validateProject({ cuts: slow, topic: 't', platform: 'shorts' }).some(i => i.field === 'duration'), '60초 초과 경고');
const emptyHead = [{ headline: '', sub: '' }, {}, {}, {}, {}];
ok(C.validateProject({ cuts: emptyHead, topic: 't' }).some(i => i.level === 'error'), '빈 제목 오류');

const serialized = C.serializeProject(Object.assign({}, project, { evil: 'x', cuts: cuts.map(c => Object.assign({}, c, { image: 'data:image/png;base64,' + 'A'.repeat(800000) })) }));
no(Object.prototype.hasOwnProperty.call(serialized, 'evil'), '알 수 없는 키 제거');
eq(serialized.cuts.length, 5, '저장 5컷');
eq(serialized.cuts[0].image, null, '너무 큰 이미지는 저장 제외');
eq(serialized.theme, 'neon', '테마 저장');
eq(serialized.cuts.map(c => c.stage), ['hook', 'problem', 'solution', 'proof', 'cta'], '저장 후에도 단계 유지');
eq(serialized.fps, 30, 'fps 기본');
eq(C.serializeProject({ fps: 24 }).fps, 24, 'fps 24 허용');
eq(C.serializeProject({ fps: 99 }).fps, 30, '잘못된 fps 보정');
eq(C.safeFileName('홈카페/라떼: 최고!', 'x'), '홈카페라떼-최고', '파일 이름 정리');
eq(C.safeFileName('', 'shorts'), 'shorts', '빈 이름 대체');

/* ══════════════════════════════════════════════════════════
   7. Pro 카탈로그 (steering: 1·2·3 원클릭, 4번 커스텀)
   ══════════════════════════════════════════════════════════ */
group('Pro 제공자');
eq(Pro.PROVIDERS.map(p => p.id), ['openai', 'gemini', 'claude', 'custom'], '제공자 순서 1·2·3·4');
eq(Pro.PROVIDERS.map(p => p.rank).filter(Boolean), [1, 2, 3, 4], '순위 1·2·3·4 표시');
eq(Pro.PROVIDERS[0].caps, ['script', 'image', 'tts'], 'OpenAI 올인원');
eq(Pro.PROVIDERS[1].caps, ['script', 'image'], 'Gemini 대본+이미지');
eq(Pro.PROVIDERS[2].caps, ['script'], 'Claude 대본만');
ok(Pro.PROVIDERS[0].tag.indexOf('올인원') >= 0, 'OpenAI 올인원 표기');
ok(Pro.PROVIDERS[1].desc.indexOf('Imagen') >= 0, 'Gemini Imagen 표기');
ok(Pro.PROVIDERS[2].desc.indexOf('대본') >= 0, 'Claude 고퀄 대본 표기');
ok(Pro.PROVIDERS[3].needsBase === true, '커스텀은 서버 주소 필요');
eq(Pro.providerById('nope').id, 'openai', '알 수 없는 제공자 기본값');
eq(Pro.providerById('gemini').models.image, 'imagen-4.0-generate-001', 'Gemini 이미지 모델');
eq(Pro.maskKey('1234567890abcdef'), '123••••••••ef', '키 마스킹');
eq(Pro.maskKey('short'), '••••••••', '짧은 키 마스킹');
eq(Pro.maskKey(''), '', '빈 키');
eq(Pro.normalizeBase('my-proxy.example.com/'), 'https://my-proxy.example.com', '주소 정규화');
eq(Pro.normalizeBase('http://localhost:8787/api/'), 'http://localhost:8787/api', 'http 주소 유지');
eq(Pro.normalizeBase(''), '', '빈 주소');
const cfg = Pro.defaults();
eq(cfg.provider, 'openai', '기본 제공자');
eq(cfg.entries.openai.model, 'gpt-4.1-mini', '기본 대본 모델');
eq(cfg.entries.openai.imageModel, 'gpt-image-1', '기본 이미지 모델');
eq(cfg.entries.openai.ttsModel, 'tts-1', '기본 음성 모델');
eq(Pro.isConnected(Pro.defaults()), false, '키 없으면 무료 모드');
const withKey = Pro.defaults();
withKey.entries.openai.key = 'test';
eq(Pro.hasAccess(withKey), true, '키가 있으면 접근 가능');
eq(Pro.isConnected(withKey), false, '검증 전에는 연결 아님');
withKey.entries.custom.baseUrl = '';
eq(Pro.hasAccess(Object.assign({}, withKey, { provider: 'custom' })), false, '커스텀은 주소 없으면 불가');

/* ══════════════════════════════════════════════════════════
   8. 파일 위생 · 보안
   ══════════════════════════════════════════════════════════ */
group('파일');
const HERE = __dirname;
const required = ['.nojekyll', 'favicon.svg', 'privacy.html', 'robots.txt', 'sitemap.xml', 'README.md', 'index.html', 'styles.css', 'core.js', 'render.js', 'pro.js', 'nle.js', 'app.js', 'data.js', 'test.js', 'uitest.py', 'assets/fonts/plexkr-Regular.woff2', 'assets/fonts/plexkr-SemiBold.woff2', 'assets/fonts/plexkr-Bold.woff2'];
required.forEach(f => ok(fs.existsSync(path.join(HERE, f)), '필수 파일: ' + f));
eq(fs.readFileSync(path.join(HERE, '.nojekyll'), 'utf8'), '', '.nojekyll 비어 있음');
const robots = fs.readFileSync(path.join(HERE, 'robots.txt'), 'utf8');
includes(robots, 'Sitemap: https://marcj81.github.io/shorts-video-studio/sitemap.xml', 'robots 사이트맵');
const sitemap = fs.readFileSync(path.join(HERE, 'sitemap.xml'), 'utf8');
includes(sitemap, 'https://marcj81.github.io/shorts-video-studio/', 'sitemap URL');
const html = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
includes(html, '<html lang="ko"', '언어 속성');
includes(html, 'rel="canonical"', 'canonical');
includes(html, 'https://marcj81.github.io/shorts-video-studio/', 'canonical은 실제 배포 경로');
includes(html, 'data-theme="dark"', '다크 글래스가 기본 테마');
includes(html, 'privacy.html', '개인정보 링크');
includes(html, 'name="viewport"', '뷰포트');
ok((html.match(/<h1/g) || []).length >= 1, 'h1 존재');
eq((html.match(/ id="f-topic"/g) || []).length, 1, '중복 id 없음(주제)');
const ids = (html.match(/ id="([^"]+)"/g) || []).map(s => s.slice(5, -1));
eq(ids.length, new Set(ids).size, 'HTML id 중복 없음', ids.filter((v, i) => ids.indexOf(v) !== i).join(','));
ok(html.indexOf('src="http') < 0 && html.indexOf('<link rel="stylesheet" href="http') < 0, '외부 스크립트·스타일 없음');
const privacy = fs.readFileSync(path.join(HERE, 'privacy.html'), 'utf8');
includes(privacy, 'sessionStorage', '개인정보 페이지: 세션 저장');
includes(privacy, 'localStorage', '개인정보 페이지: 로컬 저장');
includes(privacy, 'OpenAI', '개인정보 페이지: 제공자');
includes(privacy, '서버로 보내지 않습니다', '개인정보 페이지: 무료 모드');

group('보안');
const files = fs.readdirSync(HERE).filter(f => /\.(js|html|css|md|txt|xml|svg)$/.test(f));
const internals = ['assets', 'engines'].reduce((acc, d) => {
  const dir = path.join(HERE, d);
  fs.readdirSync(dir).forEach(f => { if (/\.(js|css|svg)$/.test(f)) acc.push(path.join(d, f)); });
  return acc;
}, []);
const all = files.concat(internals.filter(f => fs.existsSync(path.join(HERE, f))));
const keyPatterns = [new RegExp('A' + 'Iza[0-9A-Za-z_-]{20,}'), new RegExp('s' + 'k-[A-Za-z0-9_-]{16,}'), new RegExp('g' + 'hp_[A-Za-z0-9]{20,}'), new RegExp('xox' + 'b-[0-9]{6,}')];
const privateTerms = ['전종' + '혁', 'hear' + 'ple', '히어' + '플', 'goodday' + '810202', '8383' + '-3042', 'jeonjong' + 'hyeog'];
let leaks = [];
all.forEach(f => {
  const body = fs.readFileSync(path.join(HERE, f), 'utf8');
  keyPatterns.forEach(p => { if (p.test(body)) leaks.push(f + ':' + p); });
  privateTerms.forEach(p => { if (body.indexOf(p) >= 0) leaks.push(f + ':' + p); });
});
eq(leaks, [], '개인정보·키 패턴 0건');
const app = fs.readFileSync(path.join(HERE, 'app.js'), 'utf8');
includes(app, 'data-design', '디자인 기준 표기');
includes(app, 'API 키 붙여넣기', 'placeholder 문구');
includes(fs.readFileSync(path.join(HERE, 'pro.js'), 'utf8'), 'sessionStorage', '세션 저장 사용');
ok(app.indexOf('localStorage.setItem') >= 0 && app.indexOf("STORE_PROJECT") >= 0, '프로젝트 로컬 저장');
no(/console\.log\(/.test(app), 'console.log 남기지 않음');
const render = fs.readFileSync(path.join(HERE, 'render.js'), 'utf8');
includes(render, 'captureStream', '캔버스 스트림');
includes(render, 'video/webm;codecs=vp9', 'VP9 우선');
includes(render, 'video/webm;codecs=vp8', 'VP8 폴백');
includes(render, 'video/mp4', 'MP4 최후 폴백');
includes(render, 'MediaRecorder', 'MediaRecorder 사용');
includes(render, 'AudioContext', '배경음 합성');
const core = fs.readFileSync(path.join(HERE, 'core.js'), 'utf8');
includes(core, 'formatTimecode', 'SRT 시간 형식');
includes(core, 'MediaRecorder', 'MediaRecorder 사용 안내');

/* ══════════════════════════════════════════════════════════
   8-b. 디자인 토큰 (Direction C · Dark Glass Studio)
   ══════════════════════════════════════════════════════════ */
group('디자인 토큰 C안');
const css = fs.readFileSync(path.join(HERE, 'styles.css'), 'utf8');
includes(css, '--canvas: #06070B', '캔버스 #06070B');
includes(css, '--accent: #8B5CF6', '포인트 보라 #8B5CF6');
includes(css, '--teal: #34E0C8', '포인트 민트 #34E0C8');
includes(css, 'backdrop-filter', '유리 카드 blur');
includes(css, 'prefers-reduced-transparency', '투명도 끔 대응');
includes(css, 'prefers-reduced-motion', '모션 끔 대응');
includes(css, 'html[data-theme="light"]', '고대비 라이트 모드');
includes(html, 'designref.v3/dark-glass', 'data-design 토큰 표기');
ok(contrast('#F4F5F8', '#06070B') >= 4.5, 'C 본문 대비 4.5:1', contrast('#F4F5F8', '#06070B').toFixed(2));
ok(contrast('#ADB5C4', '#111319') >= 4.5, 'C 보조 텍스트(카드 위) 4.5:1', contrast('#ADB5C4', '#111319').toFixed(2));
ok(contrast('#B9A2FF', '#06070B') >= 4.5, 'C 포인트 글자 4.5:1', contrast('#B9A2FF', '#06070B').toFixed(2));
ok(contrast('#57E6D2', '#06070B') >= 4.5, 'C 라벨 4.5:1', contrast('#57E6D2', '#06070B').toFixed(2));
ok(contrast('#101319', '#F2F4F8') >= 4.5, '라이트 본문 4.5:1', contrast('#101319', '#F2F4F8').toFixed(2));
ok(contrast('#4C5464', '#F2F4F8') >= 4.5, '라이트 보조 4.5:1', contrast('#4C5464', '#F2F4F8').toFixed(2));
ok(contrast('#0A6F63', '#F2F4F8') >= 4.5, '라이트 라벨 4.5:1', contrast('#0A6F63', '#F2F4F8').toFixed(2));
ok(contrast('#5B2ED6', '#F2F4F8') >= 4.5, '라이트 포인트 글자 4.5:1', contrast('#5B2ED6', '#F2F4F8').toFixed(2));
no(/url\(\s*['"]?https?:/i.test(css), 'CSS에 외부 URL 없음');
no(/@import/i.test(css), 'CSS @import 없음');

/* ══════════════════════════════════════════════════════════
   9. Pro 요청 분기 (네트워크는 모의 fetch로만)
   ══════════════════════════════════════════════════════════ */
group('Pro 요청');
let pending = 0;
let queue = Promise.resolve();
function asyncCheck(factory, fn) {
  pending++;
  queue = queue.then(function () { return factory(); })
    .then(function (r) { try { fn(null, r); } catch (e) { ok(false, 'async 검사 예외', e.message); } })
    .catch(function (e) { try { fn(e); } catch (e2) { ok(false, 'async 검사 예외', e2.message); } })
    .then(function () { pending--; });
}

const origFetch = global.fetch;
let calls = [];
global.fetch = function (url, init) {
  calls.push({ url: String(url), init: init || {} });
  const body = JSON.stringify({
    choices: [{ message: { content: '모의 대본' } }],
    data: [{ b64_json: 'AAAA' }],
    predictions: [{ bytesBase64Encoded: 'AAAA', mimeType: 'image/png' }],
    text: '모의 대본'
  });
  return Promise.resolve({
    ok: true, status: 200,
    text: function () { return Promise.resolve(body); },
    blob: function () { return Promise.resolve(new Blob([new Uint8Array([1, 2, 3])])); }
  });
};

const noKey = Pro.defaults();
asyncCheck(function () { return Pro.script(noKey, { prompt: 'x' }); }, function (err) {
  ok(!!err && /키를 먼저/.test(err.message), '키 없으면 대본 요청 거부', err && err.message);
});

const claudeCfg = Pro.defaults();
claudeCfg.provider = 'claude';
claudeCfg.entries.claude.key = 'test-key';
claudeCfg.entries.claude.connected = true;
asyncCheck(function () { return Pro.image(claudeCfg, 'prompt'); }, function (err) {
  ok(!!err && /이미지/.test(err.message), 'Claude는 이미지 미지원 안내', err && err.message);
});
asyncCheck(function () { return Pro.tts(claudeCfg, '문장'); }, function (err) {
  ok(!!err && /음성/.test(err.message), 'Claude는 음성 미지원 안내', err && err.message);
});

const openaiCfg = Pro.defaults();
openaiCfg.entries.openai.key = 'test-key';
openaiCfg.entries.openai.connected = true;

asyncCheck(function () {
  calls = [];
  return Pro.script(openaiCfg, { prompt: '프롬프트', topic: 't' });
}, function (err, res) {
  ok(!err, 'OpenAI 대본 성공', err && err.message);
  eq(res && res.text, '모의 대본', '대본 텍스트 반환');
  const c = calls.filter(function (x) { return x.url.indexOf('chat/completions') > 0; })[0] || { url: '', init: {} };
  includes(c.url, 'api.openai.com/v1/chat/completions', '대본 엔드포인트');
  eq(c.init.headers.Authorization, 'Bearer test-key', 'Bearer 키');
  const sent = c.init.body ? JSON.parse(c.init.body) : {};
  eq(sent.model, 'gpt-4.1-mini', '대본 모델');
  ok(sent.messages && sent.messages.length >= 2, '시스템+사용자 메시지');
});

asyncCheck(function () {
  calls = [];
  return Pro.image(openaiCfg, '장면', '1024x1536');
}, function (err, res) {
  ok(!err, 'OpenAI 이미지 성공', err && err.message);
  ok(res && res.dataUrl.indexOf('data:image/png;base64,') === 0, '이미지 dataURL');
  const ic = calls.filter(function (x) { return x.url.indexOf('images/generations') > 0; })[0] || { init: {} };
  const sent = ic.init.body ? JSON.parse(ic.init.body) : {};
  eq(sent.size, '1024x1536', '이미지 크기 전달');
  eq(sent.model, 'gpt-image-1', '이미지 모델');
});

asyncCheck(function () {
  calls = [];
  return Pro.tts(openaiCfg, '읽을 문장', 'nova');
}, function (err, res) {
  ok(!err, 'OpenAI 음성 성공', err && err.message);
  ok(res && res.blob && res.blob.size > 0, '음성 Blob');
  const tc = calls.filter(function (x) { return x.url.indexOf('audio/speech') > 0; })[0] || { init: {} };
  const sent = tc.init.body ? JSON.parse(tc.init.body) : {};
  eq(sent.voice, 'nova', '목소리 전달');
  eq(sent.model, 'tts-1', '음성 모델');
  eq(sent.input, '읽을 문장', '읽을 문장 전달');
});

const geminiCfg = Pro.defaults();
geminiCfg.provider = 'gemini';
geminiCfg.entries.gemini.key = 'test-key';
calls = [];
asyncCheck(function () { return Pro.image(geminiCfg, '장면'); }, function (err, res) {
  ok(!err, 'Gemini Imagen 이미지 성공', err && err.message);
  const gc = calls.filter(function (x) { return x.url.indexOf('imagen-4.0-generate-001:predict') > 0; })[0];
  ok(!!gc, 'Imagen predict 엔드포인트', calls.map(function (x) { return x.url; }).join(' | '));
});

const customCfg = Pro.defaults();
customCfg.provider = 'custom';
customCfg.entries.custom.baseUrl = 'https://proxy.example.com';
asyncCheck(function () {
  calls = [];
  return Pro.script(customCfg, { prompt: '프롬프트' });
}, function (err) {
  ok(!err, '자체 서버 대본 성공', err && err.message);
  const cc = calls.filter(function (x) { return x.url === 'https://proxy.example.com/script'; })[0];
  ok(!!cc, '자체 서버 /script', calls.map(function (x) { return x.url; }).join(' | '));
});

asyncCheck(function () { return Pro.test(openaiCfg); }, function (err) {
  ok(!err, 'OpenAI 연결 확인 성공', err && err.message);
});

function restoreFetch() { global.fetch = origFetch; }

/* ══════════════════════════════════════════════════════════
   10. NLE · 컬러 그레이드 / 타임코드 / 자막 트랙
   ══════════════════════════════════════════════════════════ */
group('NLE 그레이드');
eq(C.GRADES.map(g => g.id), ['neutral', 'cinematic', 'warm', 'cool', 'punch', 'fade'], '그레이드 프리셋 6종');
ok(C.GRADES.every(g => g.name && g.note && typeof g.exposure === 'number'), '프리셋 필드');
ok(C.GRADES.every(g => ['exposure', 'contrast', 'saturation', 'temperature', 'tint'].every(k => g[k] >= -50 && g[k] <= 50)), '프리셋 값 범위');
eq(C.normalizeGrade({ exposure: 999, contrast: -999, saturation: 12.6, temperature: -12.4, tint: 3 }).exposure, 50, '노출 상한');
eq(C.normalizeGrade({ exposure: 999, contrast: -999 }).contrast, -50, '대비 하한');
eq(C.normalizeGrade({ exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 }).id, 'custom', '빈 그레이드는 custom');
eq(C.normalizeGrade(null).exposure, 0, 'null 그레이드');
eq(C.hasGrade(C.GRADES[0]), false, '뉴트럴은 필터 없음');
eq(C.hasGrade(C.gradeById('warm')), true, '웜은 필터 있음');
eq(C.gradeFilterString(C.GRADES[0]), 'none', '뉴트럴 필터 none');
const punchFilter = C.gradeFilterString(C.gradeById('punch'));
includes(punchFilter, 'brightness(1.03)', '노출 → brightness');
includes(punchFilter, 'contrast(1.28)', '대비 → contrast');
includes(punchFilter, 'saturate(1.22)', '채도 → saturate');
eq(C.gradeOverlay(C.GRADES[0]), null, '뉴트럴은 색 피막 없음');
const warmOverlay = C.gradeOverlay(C.gradeById('warm'));
ok(warmOverlay && warmOverlay.r > warmOverlay.b, '웜 피막은 붉은 쪽', JSON.stringify(warmOverlay));
ok(warmOverlay.alpha > 0 && warmOverlay.alpha <= 0.3, '피막 알파 범위', warmOverlay.alpha);
const coolOverlay = C.gradeOverlay(C.gradeById('cool'));
ok(coolOverlay && coolOverlay.b > coolOverlay.r, '쿨 피막은 푸른 쪽');
eq(C.matchGradePreset(C.gradeById('cinematic')), 'cinematic', '프리셋 매칭');
eq(C.matchGradePreset({ exposure: 1, contrast: 2, saturation: 3, temperature: 4, tint: 5 }), '', '프리셋 아님');
eq(C.normalizeGrade(C.gradeById('warm')).preset, 'warm', '정규화가 프리셋을 채움');
eq(C.gradeLabel(C.gradeById('warm')), '웜 톤', '그레이드 이름');
includes(C.gradeLabel({ exposure: 10, contrast: 5, saturation: 0, temperature: 0, tint: 0 }), '노출 +10', '커스텀 요약');
eq(C.autoGrade('editorial').preset, 'warm', '에디토리얼 → 웜');
eq(C.autoGrade('midnight').preset, 'cinematic', '미드나잇 → 시네마틱');
eq(C.autoGrade('neon').preset, 'punch', '네온 → 펀치');
eq(C.autoGrade('clinic').preset, 'cool', '클린 → 쿨');
eq(C.autoGrade('없는테마').preset, 'warm', '알 수 없는 테마 기본');

group('NLE 타임코드');
eq(C.formatTimecodeFrames(0, 30), '00:00:00:00', '타임코드 0');
eq(C.formatTimecodeFrames(1000, 30), '00:00:01:00', '1초');
eq(C.formatTimecodeFrames(1234, 30), '00:00:01:07', '1.234초 30fps');
eq(C.formatTimecodeFrames(1500, 24), '00:00:01:12', '24fps 프레임');
eq(C.formatTimecodeFrames(3723456, 30), '01:02:03:13', '1시간대');
eq(C.formatTimecodeFrames(-50, 30), '00:00:00:00', '음수 보정');
eq(C.formatTimecodeFrames('x', 30), '00:00:00:00', '숫자 아닌 값');

group('NLE 자막 트랙');
const subCuts = C.distributeCuts({ topic: '자막 테스트' }).cuts;
const subs = C.subtitlesFromCuts(subCuts, 17);
ok(subs.length >= 5, '컷마다 자막 1줄 이상', subs.length);
ok(subs.every(s => s.text && s.text.length <= 24), '자막 길이');
ok(subs.every(s => s.end > s.start), '자막 시간 순서');
ok(subs.every(s => s.start >= 0 && s.end <= C.totalMs(subCuts)), '자막이 전체 길이 안');
ok(subs.every((s, i) => i === 0 || s.start >= subs[i - 1].start), '자막 시작 정렬');
eq(new Set(subs.map(s => s.id)).size, subs.length, '자막 id 중복 없음');
const subSrt = C.buildSrtFromSubtitles(subs);
ok(/^1\n00:00:00,000 --> /.test(subSrt), '자막 SRT 첫 블록', subSrt.slice(0, 40).replace(/\n/g, '|'));
eq(subSrt.trim().split(/\n\n/).length, subs.length, '자막 SRT 블록 수');
eq(C.buildSrtFromSubtitles([]), '', '빈 자막 SRT');
ok(C.buildVttFromSubtitles(subs).indexOf('WEBVTT') === 0, '자막 VTT 헤더');
const edited = subs.map((s, i) => i === 0 ? Object.assign({}, s, { text: '고친 자막' }) : s);
includes(C.buildSrtFromSubtitles(edited), '고친 자막', '고친 자막이 SRT에 반영');

group('NLE 오디오');
const beatProj = Object.assign(C.emptyProject(), { cuts: subCuts, music: 'lofi' });
const beats = C.audioBeats(beatProj);
ok(beats.length > 8, '비트 수', beats.length);
ok(beats.every((b, i) => i === 0 || b > beats[i - 1]), '비트 오름차순');
ok(beats[beats.length - 1] <= C.totalMs(subCuts), '비트가 길이 안');
eq(C.audioBeats(Object.assign({}, beatProj, { music: 'none' })).length, 0, '무음은 비트 없음');
const wave = C.waveform(beatProj, 64);
eq(wave.length, 64, '파형 표본 수');
ok(wave.every(v => v >= 0 && v <= 1), '파형 0~1');
eq(C.waveform(beatProj, 64), wave, '파형은 결정적');
no(C.waveform(beatProj, 64, 500).join(',') === wave.join(','), '재생 위치에 따라 파형이 흐름');

group('NLE 트랙 모델');
const baseProj = Object.assign(C.emptyProject(), { topic: '트랙', cuts: subCuts });
const tracks0 = C.buildTracks(baseProj);
eq(tracks0.v1.length, 5, '분할 전 V1 5클립');
eq(tracks0.splitCount, 0, '분할 0');
ok(tracks0.t1.length >= 5, 'T1 자막');
ok(tracks0.a1.samples.length > 10, 'A1 파형');
ok(tracks0.fx.some(f => f.type === 'grain'), 'FX 그레인');
no(tracks0.fx.some(f => f.type === 'color'), '그레이드 없으면 COLOR 블록 없음');
eq(tracks0.total, C.totalMs(subCuts), '트랙 총 길이');
ok(tracks0.v1.every(c => c.end > c.start), 'V1 클립 시간');
ok(tracks0.v1.every((c, i) => i === 0 || c.start >= tracks0.v1[i - 1].end - 1), 'V1 클립이 겹치지 않음');
const splitProj = Object.assign({}, baseProj, { splits: { 0: 0.5, 1: 0.4 }, grade: C.gradeById('punch') });
const tracks1 = C.buildTracks(splitProj);
eq(tracks1.v1.length, 7, '2컷 분할 시 7클립');
eq(tracks1.splitCount, 2, '분할 수');
ok(tracks1.v1.some(c => c.part === 'A') && tracks1.v1.some(c => c.part === 'B'), 'A/B 파트');
ok(tracks1.fx.some(f => f.type === 'color'), '그레이드 있으면 COLOR 블록');
eq(tracks1.counts.FX, tracks1.fx.length, 'FX 카운트');
ok(tracks1.t1.every(s => s.end <= tracks1.total), '자막이 트랙 안');

/* ══════════════════════════════════════════════════════════
   11. NLE · AI 스웜 규칙 엔진 · Pro 응답
   ══════════════════════════════════════════════════════════ */
group('AI 스웜');
eq(C.AGENTS.map(a => a.id), ['claude', 'gemini', 'gpt'], '에이전트 3개');
eq(C.AGENTS.map(a => a.role), ['대본/자막', '컷/리듬', '색보정/사운드'], '역할 표기');
ok(C.AGENTS.every(a => /^#[0-9A-Fa-f]{6}$/.test(a.color)), '에이전트 색');
eq(C.TRACKS.map(t => t.id), ['V1', 'T1', 'A1', 'FX'], '트랙 4개');
const swarmProj = Object.assign(C.emptyProject(), { topic: '스웜', cuts: subCuts, theme: 'editorial' });
const plan = C.planSwarm(swarmProj);
eq(plan.steps.map(s => s.action), ['split', 'subtitles', 'grade', 'audio'], '스웜 순서: 분할→자막→색보정→오디오');
eq(plan.steps.map(s => s.agent), ['gemini', 'claude', 'gpt', 'gpt'], '단계별 에이전트');
ok(plan.steps.every(s => s.label && s.detail), '단계 설명');
eq(plan.mode, 'rules', '무료 모드는 규칙 엔진');
ok(Object.keys(plan.splits).length >= 3, '분할 비율 생성', JSON.stringify(plan.splits));
ok(Object.keys(plan.splits).every(k => plan.splits[k] > 0.15 && plan.splits[k] < 0.86), '분할 비율 범위');
eq(plan.grade.preset, 'warm', '테마에 맞는 색보정');
ok(plan.subtitles.length >= 5, '자막 배치');
ok(plan.beats.length > 5, '오디오 비트');
const applied = C.applySwarm(swarmProj, plan);
no(applied === swarmProj, '원본을 바꾸지 않고 새 객체');
eq(Object.keys(swarmProj.splits).length, 0, '원본 splits 그대로');
eq(Object.keys(applied.splits).length, Object.keys(plan.splits).length, '분할 적용');
eq(applied.subtitles.length, plan.subtitles.length, '자막 적용');
eq(applied.grade.preset, 'warm', '그레이드 적용');
eq(applied.swarm.steps.length, 4, '스웜 기록');
const appliedTracks = C.buildTracks(applied);
ok(appliedTracks.v1.length > 5, '스웜 후 클립 증가', appliedTracks.v1.length);
ok(appliedTracks.fx.some(f => f.type === 'color'), '스웜 후 COLOR 블록');

eq(C.planSwarm(Object.assign({}, swarmProj, { theme: 'neon' })).grade.preset, 'punch', '테마별 색보정');

const swarmPrompt = C.buildSwarmPrompt(swarmProj);
includes(swarmPrompt, '9:16', '스웜 프롬프트 비율');
includes(swarmPrompt, 'grade', '색보정 프리셋 요청');
includes(swarmPrompt, 'splits', '분할 비율 요청');
includes(swarmPrompt, '소중한', '금지어 유지');
ok(swarmPrompt.length > 300, '프롬프트 길이', swarmPrompt.length);

const parsedSwarm = C.parseSwarmAi(JSON.stringify({
  grade: 'cool',
  cuts: [
    { stage: 'hook', headline: 'API 훅', sub: '보조', duration: 2.2 },
    { stage: 'problem', headline: 'API 문제' },
    { stage: 'solution', headline: 'API 해결' },
    { stage: 'proof', headline: 'API 증거' },
    { stage: 'cta', headline: 'API 행동' }
  ],
  splits: [0.5, 0.4, 0, 0.2, 0.9],
  notes: '리듬을 조였습니다'
}));
eq(parsedSwarm.cuts.length, 5, 'API 컷 5개');
eq(parsedSwarm.cuts[0].headline, 'API 훅', 'API 제목');
eq(parsedSwarm.grade.preset, 'cool', 'API 색보정');
eq(parsedSwarm.splits, { 0: 0.5, 1: 0.4, 3: 0.2 }, 'API 분할(범위 밖 제외)');
eq(parsedSwarm.notes, '리듬을 조였습니다', 'API 메모');
const fencedSwarm = C.parseSwarmAi('```json\n{"grade":"punch","cuts":[{"headline":"펜스 훅"}]}\n```');
eq(fencedSwarm.cuts[0].headline, '펜스 훅', '코드펜스 스웜');
eq(fencedSwarm.grade.preset, 'punch', '펜스 색보정');
eq(C.parseSwarmAi('').cuts.length, 0, '빈 스웜 응답');
eq(C.parseSwarmAi('그냥 문장').cuts.length, 1, 'JSON 없으면 문장 1컷');
eq(C.parseSwarmAi('{"grade":"이상한값"}').grade, null, '알 수 없는 프리셋 무시');

const swarmSerialized = C.serializeProject(applied);
eq(swarmSerialized.grade.preset, 'warm', '저장: 그레이드');
eq(Object.keys(swarmSerialized.splits).length, Object.keys(applied.splits).length, '저장: 분할');
ok(swarmSerialized.subtitles.length >= 5, '저장: 자막');
ok(swarmSerialized.subtitles.every(s => s.text.length <= 24), '저장: 자막 길이 제한');
eq(swarmSerialized.swarm.mode, 'rules', '저장: 스웜 모드');
const restored = C.buildTracks(C.serializeProject(applied));
ok(restored.v1.length > 5, '저장 후에도 분할 유지', restored.v1.length);

/* ══════════════════════════════════════════════════════════
   12. NLE 화면 · 색보정 반영 연결
   ══════════════════════════════════════════════════════════ */
group('NLE 화면');
const nleJs = fs.readFileSync(path.join(HERE, 'nle.js'), 'utf8');
includes(nleJs, 'runSwarm', '스웜 실행 함수');
includes(nleJs, 'data-swarm', '스웜 상태 속성');
includes(nleJs, 'swarm-cursor', '에이전트 커서');
includes(nleJs, 'buildTracks', '트랙 모델 사용');
includes(nleJs, 'normalizeGrade', '색보정 값 사용');
includes(nleJs, 'gradeLabel', '색보정 이름 표시');
no(/console\.log\(/.test(nleJs), 'nle.js 콘솔 로그 없음');
includes(html, '<script src="nle.js"></script>', 'nle.js 로드');
includes(html, 'id="btn-swarm"', '스웜 버튼');
includes(html, 'id="preview-canvas"', '프로그램 모니터');
['tl-v1', 'tl-t1', 'tl-a1-marks', 'tl-fx', 'sel-dur', 'sel-text', 'g-exposure', 'g-contrast', 'g-saturation', 'g-temperature', 'color-wheel', 'scope-canvas', 'swarm-log'].forEach(function (id) {
  includes(html, 'id="' + id + '"', 'NLE 요소: ' + id);
});
const renderJs = fs.readFileSync(path.join(HERE, 'render.js'), 'utf8');
includes(renderJs, 'gradeFilterString', 'render: 필터 적용');
includes(renderJs, 'gradeOverlay', 'render: 색 피막 적용');
includes(renderJs, 'paintFrame', 'render: 그레이드 전 후 분리');
ok(renderJs.indexOf('function drawFrame') < renderJs.indexOf('function paintFrame'), 'drawFrame이 그레이드를 감싼다');
includes(css, '#0B1120', 'NLE #0B1120 톤');
includes(css, '.swarm-cursor', '커서 스타일');
includes(css, '.tl-clip', '타임라인 클립 스타일');
includes(css, '.color-wheel', '컬러 휠 스타일');
includes(css, '@media (max-width: 860px)', 'NLE 모바일 대응');
const appJs = fs.readFileSync(path.join(HERE, 'app.js'), 'utf8');
includes(appJs, 'ShortsNLE', 'app: NLE 초기화 연결');
includes(appJs, 'onSwarmChange', 'app: 스웜 반영 콜백');

/* ══════════════════════════════════════════════════════════
   10. 내레이션 싱크 · 자동 비주얼
   ══════════════════════════════════════════════════════════ */
group('내레이션 싱크');
const nShort = C.estimateNarrationMs('물은 매일 갈아요');
const nLong = C.estimateNarrationMs('가습기 물은 매일 갈아 주고 주 1회 식초 물에 10분 담가 두세요');
ok(nShort >= C.SPEECH.minMs && nShort <= C.SPEECH.maxMs, '발화 길이 범위', nShort);
ok(nLong > nShort, '긴 문장이 더 길다', nShort + ' / ' + nLong);
const nSlow = C.estimateNarrationMs('가습기 물은 매일 갈아 주세요', 0.9);
const nFast = C.estimateNarrationMs('가습기 물은 매일 갈아 주세요', 1.1);
ok(nSlow > nFast, '느리게가 더 길다', nSlow + ' / ' + nFast);
const p1 = C.speechProfile('가습기, 물을 갈아요.');
ok(p1.syllables >= 8 && p1.commas === 1 && p1.stops === 1, '발화 단위 계산', JSON.stringify(p1));
ok(C.estimateNarrationMs('가습기, 물을 갈아요.') > C.estimateNarrationMs('가습기 물을 갈아요'), '쉼표·마침표 휴지', 'pause');

const syncCuts = C.distributeCuts({ topic: '가습기 관리' }).cuts;
const sync = C.syncCutsToNarration(syncCuts, [1600, 1600, 0, 300, 20000]);
eq(sync.changes.length, 4, '오디오가 있는 컷만 싱크');
eq(sync.cuts[0].duration, 1.9, '1.6초 음성 + 0.25 호흡 = 1.9초');
eq(sync.cuts[1].duration, 1.9, '둘째 컷도 1.9초');
eq(sync.cuts[2].duration, syncCuts[2].duration, '오디오 없는 컷은 유지');
eq(sync.cuts[3].duration, 0.8, '짧은 음성은 최소 0.8초');
eq(sync.cuts[4].duration, 15, '긴 음성은 최대 15초');
eq(sync.cuts[0].narrationMs, 1600, '음성 길이 보존');
eq(sync.totalMs, C.totalMs(sync.cuts), '총 길이 재계산');
eq(C.timeline(sync.cuts)[1].start, 1900, '타임라인이 새 길이를 따른다');
eq(C.timeline(sync.cuts)[2].start, 3800, '누적 시작도 재계산');
eq(C.buildSrt(sync.cuts).split(/\n\n/)[1].split('\n')[1], '00:00:01,900 --> 00:00:03,800', 'SRT가 음성 길이에 맞춰진다');

const reflowed = C.reflowSubtitles([
  { id: 's1', cutIndex: 0, start: 0, end: 1200, text: '가습기 물' },
  { id: 's2', cutIndex: 0, start: 1200, end: 3000, text: '매일 갈아야' },
  { id: 's3', cutIndex: 1, start: 3200, end: 5000, text: '통도 씻어야' }
], [
  { headline: '가습기', duration: 2.4 }, { headline: '통', duration: 2.4 },
  { headline: '식초', duration: 2 }, { headline: '증거', duration: 2 }, { headline: '행동', duration: 2 }
]);
eq(reflowed.length, 3, '자막 수 유지');
eq(reflowed.map(s => s.text), ['가습기 물', '매일 갈아야', '통도 씻어야'], '자막 문구 유지');
ok(reflowed.every(s => s.start >= 0 && s.end <= 8400 && s.end > s.start), '자막 시간이 전체 길이 안', JSON.stringify(reflowed.map(s => [s.start, s.end])));
eq(reflowed[1].end, 2400, '첫 컷 자막이 새 컷 끝에 맞춰짐');
eq(reflowed[2].start, 2400, '둘째 컷 자막이 새 시작에 맞춰짐');
eq(C.reflowSubtitles([], sync.cuts), [], '자막 없으면 빈 배열');

const noVisual = C.normalizeCuts([{ headline: '그냥 문장', visual: { id: 'money', label: '돈·절약', seed: 7, stat: { value: '3', unit: '주' } }, narrationMs: 1200 }, {}, {}, {}, {}]);
eq(noVisual[0].visual.id, 'money', '저장된 비주얼 유지');
eq(noVisual[0].narrationMs, 1200, '음성 길이 유지');
eq(noVisual[1].visual, null, '비주얼 없는 컷은 null');

/* ══════════════════════════════════════════════════════════ */
group('자동 비주얼');
ok(C.VISUALS.length >= 10, '비주얼 키워드 세트 10종 이상', C.VISUALS.length);
ok(C.VISUALS.every(v => v.id && v.label && v.keys.length >= 5), '비주얼 정의');
eq(C.detectVisualMotif('주방 가습기 물때 청소').id, 'clean', '청소 키워드');
eq(C.detectVisualMotif('월급 300만원 저축하는 법').id, 'money', '돈 키워드');
eq(C.detectVisualMotif('퇴근 후 홈트 운동 루틴').id, 'fitness', '운동 키워드');
eq(C.detectVisualMotif('첫 문장에 해당하는 키워드가 없으면').id, 'spark', '기본 그래픽');
const vCut = { id: 'cut-1', stage: 'proof', headline: '3주 만에 냄새가 사라졌어요', sub: '가습기 청소' };
const v1 = C.visualFor(vCut, { topic: '가습기' });
eq(v1.id, 'clean', '컷 문장으로 비주얼 종류');
eq(v1.stat, { value: '3', unit: '주' }, '숫자·단위 추출');
ok(typeof v1.seed === 'number' && v1.seed >= 0, '시드 숫자');
eq(C.visualFor(vCut, { topic: '가습기' }).seed, v1.seed, '같은 문장은 같은 그림');
const planned = C.planVisuals(C.distributeCuts({ topic: '원룸 청소 루틴' }).cuts, { topic: '원룸 청소 루틴' });
eq(planned.length, 5, '5컷 모두');
ok(planned.every(c => c.visual && c.visual.id && c.visual.source === 'auto'), '모든 컷에 자동 비주얼');
ok(planned.some(c => c.visual.id === 'clean'), '주제 키워드가 그림에 반영');
const savedVisual = C.serializeProject({ topic: 't', autoVisual: false, cuts: planned });
eq(savedVisual.autoVisual, false, '자동 비주얼 토글 저장');
eq(savedVisual.cuts[0].visual.id, planned[0].visual.id, '저장 후에도 비주얼');
eq(C.serializeProject({}).autoVisual, true, '기본값은 자동 비주얼 켬');
eq(C.emptyProject().autoVisual, true, '빈 프로젝트 기본값');

const voiceTracks = C.buildTracks({
  cuts: C.normalizeCuts(Array(5).fill({ headline: '문장', duration: 2 })),
  music: 'none', voiceSpans: [{ start: 0, end: 1800, label: 'VOICE 1', cutIndex: 0 }, { start: 2000, end: 99999, cutIndex: 1 }]
});
eq(voiceTracks.a1.voices.length, 2, 'A1 성우 스팬 2개');
eq(voiceTracks.voiceCount, 2, '성우 수');
ok(voiceTracks.a1.voices.every(v => v.end > v.start && v.end <= voiceTracks.total), '스팬이 전체 길이 안');
eq(voiceTracks.counts.A1, voiceTracks.a1.beats.length, 'A1 비트 수는 그대로');

/* ══════════════════════════════════════════════════════════ */
group('내레이션·비주얼 화면');
const html2 = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
['btn-one-click', 'btn-auto-visual', 'btn-ai-image-all', 'btn-ai-voice', 'btn-free-voice', 'btn-auto-timing', 'f-auto-visual', 'export-voice', 'free-voice-note', 'one-click-status'].forEach(function (id) {
  includes(html2, 'id="' + id + '"', '새 UI: ' + id);
});
includes(html2, '영상에 성우를 넣으려면', '무료 음성 녹음 불가 안내');
const render2 = fs.readFileSync(path.join(HERE, 'render.js'), 'utf8');
includes(render2, 'function drawAutoVisual', 'render: 자동 비주얼 그리기');
includes(render2, 'VISUAL_PAINTERS', 'render: 그림 세트');
includes(render2, "'none'", 'render: 음악 없는 오디오');
includes(render2, 'opts.voices', 'render: 성우 트랙 합성');
ok(render2.indexOf('drawAutoVisual') < render2.indexOf('function drawScene'), '비주얼 함수가 장면 그리기 앞에 정의');
const app2 = fs.readFileSync(path.join(HERE, 'app.js'), 'utf8');
['syncCutsToNarration', 'estimateNarrationMs', 'planVisuals', 'speechSynthesis', 'runOneClick', 'generateVoiceSync', 'generateAllImages', 'reflowSubtitles'].forEach(function (key) {
  includes(app2, key, 'app: ' + key);
});
includes(fs.readFileSync(path.join(HERE, 'pro.js'), 'utf8'), 'speed: rate', 'pro: 발화 속도 전달');
includes(fs.readFileSync(path.join(HERE, 'nle.js'), 'utf8'), 'tl-voice', 'nle: 성우 클립');
const css2 = fs.readFileSync(path.join(HERE, 'styles.css'), 'utf8');
['.cut-visual', '.one-click', '.free-voice-note', '.tl-voice'].forEach(function (sel) {
  includes(css2, sel, 'css: ' + sel);
});

/* ══════════════════════════════════════════════════════════ */
function finish() {
  if (pending > 0) { setTimeout(finish, 30); return; }
  restoreFetch();
  console.log('\n────────────────────────────────');
  console.log(pass + ' passed, ' + failures.length + ' failed');
  if (failures.length) {
    console.log('\n실패:');
    failures.forEach(f => console.log('  - ' + f));
  }
  process.exit(failures.length ? 1 : 0);
}
setTimeout(finish, 30);
