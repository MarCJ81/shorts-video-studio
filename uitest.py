#!/usr/bin/env python3
"""
원탭 숏폼 스튜디오 · 실제 Chrome 브라우저 검증

    python3 uitest.py

- 앱 폴더를 127.0.0.1 HTTP로 띄우고(file:// 아님) 헤드리스 Chrome을 임시 프로필로 구동.
- 데스크톱 1440×900 · 모바일 390×844.
- 검사: 부팅 외부 요청 0건, 콘솔 에러 0, 4xx 0, 가로 넘침 0,
  5컷 생성·편집·테마 전환, 캔버스 프리뷰 재생, MediaRecorder 실제 .webm 녹화·다운로드,
  .srt/.vtt/PNG 5장/TXT/캡션, Pro 모달 연결·해제(모의 API), AI 대본·컷 이미지 적용,
  새로고침 유지, 다크 모드 대비, 개인정보 페이지 200.
- preview-desktop.png · preview-mobile.png · preview-pro.png 저장.
"""
import json
import os
import shutil
import socket
import sys
import tempfile
import threading
import time
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent

# Chrome 프로필·다운로드용 임시 공간. /tmp 가 작은 컨테이너(예: 128MB tmpfs)에서는
# 프로필이 차면서 렌더러가 죽으므로, 여유가 없으면 앱 폴더 바깥으로 옮긴다.
_tmpdir = Path(os.environ.get('TMPDIR') or '/tmp')
try:
    _free = shutil.disk_usage(str(_tmpdir)).free
except OSError:
    _free = 0
if _free < 512 * 1024 * 1024:
    _alt = HERE.parent / '.uitest-tmp'
    _alt.mkdir(exist_ok=True)
    os.environ['TMPDIR'] = str(_alt)

CHROME = Path('/workspace/scratch/calc/bin/chrome-linux64/chrome')
LIBS = next(p for p in [Path('/workspace/scratch/chromelibs'), Path('/workspace/scratch/calc/libs')] if p.exists())
BASE = None
passed, failed = [], []
START = time.time()


def check(label, cond, detail=''):
    if cond:
        passed.append(label)
        print(f'  PASS  {label}' + (f'  [{detail}]' if detail != '' else ''))
    else:
        failed.append(f'{label}  [{detail}]')
        print(f'  FAIL  {label}  [{detail}]')


def section(name):
    print(f'\n■ {name}  (+{time.time() - START:.1f}s)')


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


def wait_server(port):
    for _ in range(80):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=1) as r:
                if r.status == 200:
                    return True
        except Exception:  # noqa: BLE001
            time.sleep(0.25)
    return False


SAFE_FLAGS = [
    '--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none',
    '--no-proxy-server', '--proxy-bypass-list=*', '--disable-gpu',
    '--disable-software-rasterizer', '--renderer-process-limit=1',
    '--disable-background-networking', '--disable-extensions', '--disable-sync',
    '--no-first-run', '--disable-breakpad', '--metrics-recording-only', '--mute-audio',
]
LOW_PROC_FLAGS = ['--single-process', '--no-zygote', '--in-process-gpu', '--num-raster-threads=1']


def start_browser():
    """스레드/프로세스 한도가 낮은 환경에서도 뜨도록 두 가지 플래그로 재시도한다."""
    last = None
    for attempt in range(12):
        flag_sets = [SAFE_FLAGS, SAFE_FLAGS + LOW_PROC_FLAGS]
        for flags in flag_sets:
            pw = None
            try:
                pw = sync_playwright().start()
                browser = pw.chromium.launch(executable_path=str(CHROME), args=flags)
                page = browser.new_page()
                page.close()
                print(f'  (Chrome 기동: {attempt + 1}번째 시도, {"저부하" if len(flags) > len(SAFE_FLAGS) else "기본"} 모드)')
                return pw, browser
            except Exception as exc:  # noqa: BLE001
                last = exc
                if pw is not None:
                    try:
                        pw.stop()
                    except Exception:  # noqa: BLE001
                        pass
                time.sleep(2)
    raise last


def goto(page, url, attempts=5):
    last = None
    for i in range(attempts):
        try:
            return page.goto(url, wait_until='load', timeout=30000)
        except Exception as exc:  # noqa: BLE001
            last = exc
            print(f'  (탐색 재시도 {i + 1}/{attempts})')
            time.sleep(1.5)
    raise last


def overflow(page, ignore=('.tabs', '.timeline', '.toast-root', '.mono', '.ai-out', '.prompt-preview', '.cut-headline')):
    return page.evaluate("""(ignore) => {
        const w = document.documentElement.clientWidth;
        const bad = [];
        document.querySelectorAll('body *').forEach(el => {
            if (ignore.some(sel => el.closest(sel))) return;
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && (r.right > w + 1 || r.left < -1)) {
                bad.push((el.tagName + '.' + String(el.className || '')).slice(0, 60) + ' right=' + Math.round(r.right));
            }
        });
        return bad.slice(0, 6);
    }""", list(ignore))


def fetch_status(page, path, attempts=3):
    """동일 오리진 정적 파일 상태. 저사양 헤드리스에서 fetch가 이따금 중도 중단되므로 재시도한다."""
    last = 0
    for _ in range(attempts):
        last = page.evaluate("(p) => fetch(p, { cache: 'no-store' }).then(r => r.status).catch(() => 0)", path)
        if last:
            return last
        page.wait_for_timeout(180)
    return last


def page_overflow(page):
    return page.evaluate('() => document.documentElement.scrollWidth - document.documentElement.clientWidth')


def contrast(page, fg_sel, bg_sel=None):
    return page.evaluate("""([fg, bg]) => {
        function parse(c) {
            const m = c.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
            if (!m) return null;
            return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
        }
        function lum(rgb) {
            const c = rgb.map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
            return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        }
        const el = document.querySelector(fg);
        const a = parse(getComputedStyle(el).color);
        const b = bg ? parse(getComputedStyle(document.querySelector(bg)).backgroundColor)
                     : parse(getComputedStyle(document.body).backgroundColor);
        if (!a || !b) return 0;
        const l1 = lum(a), l2 = lum(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }""", [fg_sel, bg_sel])


def no_external(urls):
    return sorted({u for u in urls if not (u.startswith(BASE) or u.startswith('data:') or u.startswith('blob:'))})


def canvas_signature(page):
    return page.evaluate("""() => {
        const d = document.querySelector('#preview-canvas').toDataURL();
        let h = 2166136261;
        for (let i = 0; i < d.length; i += 3) { h ^= d.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }""")


def set_durations(page, value='0.8'):
    page.evaluate("""(v) => {
        document.querySelectorAll('.cut-duration').forEach(el => {
            el.value = v;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }""", value)


def shot(page, path, full=True):
    """헤드리스 환경에서 큰 full_page 캡처가 이따금 실패하므로 재시도·폴백한다."""
    for attempt in range(3):
        try:
            page.screenshot(path=str(path), full_page=full)
            return True
        except Exception as exc:  # noqa: BLE001
            print(f'  (스크린샷 재시도 {attempt + 1}/3: {type(exc).__name__})')
            page.wait_for_timeout(700)
    try:
        page.screenshot(path=str(path), full_page=False)
        return True
    except Exception:  # noqa: BLE001
        return False


def main():
    global BASE
    tmp = Path(tempfile.mkdtemp(prefix='shorts-studio-'))
    port = free_port()
    BASE = f'http://127.0.0.1:{port}'
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(HERE), **kwargs)

        def log_message(self, *args):
            pass

    # 별도 프로세스 대신 스레드 서버를 쓴다(프로세스 한도가 낮은 환경에서도 안정적).
    srv = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    os.environ['LD_LIBRARY_PATH'] = str(LIBS) + ':' + os.environ.get('LD_LIBRARY_PATH', '')
    fontconf = Path('/workspace/scratch/fonts.conf')
    if fontconf.exists():
        os.environ['FONTCONFIG_FILE'] = str(fontconf)
        os.environ['FONTCONFIG_PATH'] = str(fontconf.parent)

    requests, failed_requests, console_errors, page_errors, bad_responses, responses = [], [], [], [], [], []
    pw = browser = None

    try:
        if not wait_server(port):
            raise RuntimeError('로컬 HTTP 서버가 응답하지 않습니다.')
        pw, browser = start_browser()
        context = browser.new_context(
            viewport={'width': 1440, 'height': 900}, device_scale_factor=1,
            accept_downloads=True, locale='ko-KR', timezone_id='Asia/Seoul', color_scheme='light',
        )
        context.grant_permissions(['clipboard-read', 'clipboard-write'], origin=BASE)
        page = context.new_page()
        page.set_default_timeout(30000)

        def wire(pg):
            pg.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
            pg.on('pageerror', lambda e: page_errors.append(str(e)))
            pg.on('request', lambda r: requests.append(r.url))
            pg.on('requestfailed', lambda r: failed_requests.append(r.url))
            pg.on('response', lambda r: (bad_responses.append(f'{r.status} {r.url}') if r.status >= 400 else None,
                                        responses.append((r.url, r.status))))
        wire(page)

        # ────────────────────────────────────────────── A
        section('A. 첫 화면 (데스크톱 1440×900)')
        goto(page, BASE + '/')
        page.wait_for_timeout(1200)
        page.evaluate('() => document.fonts.ready')
        page.wait_for_timeout(300)

        check('title에 원탭 숏폼 스튜디오', '원탭 숏폼 스튜디오' in page.title(), page.title())
        check('h1은 화면당 하나', page.evaluate("() => Array.from(document.querySelectorAll('h1')).filter(h => h.offsetParent).length") == 1)
        check('히어로가 9:16을 말한다', '9:16' in page.inner_text('h1'))
        check('핵심 사실 3개', len(page.query_selector_all('.hero-facts li')) == 3)
        check('서버 전송 0건 배지', '서버 전송 0건' in page.inner_text('.footer'))
        check('탭 4개', len(page.query_selector_all('.tab')) == 4)
        check('첫 탭 선택됨', page.get_attribute('#tab-board', 'aria-selected') == 'true')
        check('다른 화면 숨김', not page.is_visible('#view-studio') and not page.is_visible('#view-pro'))
        check('tablist 역할', page.get_attribute('.tabs', 'role') == 'tablist')
        check('예시로 만든 5컷', len(page.query_selector_all('.cut-card')) == 5)
        check('컷 단계 순서', [c.get_attribute('data-stage') for c in page.query_selector_all('.cut-card')] ==
              ['hook', 'problem', 'solution', 'proof', 'cta'])
        check('스토리보드 제목', '5컷' in page.inner_text('#board-title'), page.inner_text('#board-title'))
        check('통계에 길이·글자수', '초' in page.inner_text('#board-stats') and '자' in page.inner_text('#board-stats'))
        check('테마 6종', len(page.query_selector_all('#theme-grid .theme-card')) == 6)
        check('말투 3종', len(page.query_selector_all('#tone-cards .tone-card')) == 3)
        check('테마 미리보기 6색', len({page.evaluate("(el) => getComputedStyle(el).backgroundColor", c.query_selector('.theme-swatch'))
                                       for c in page.query_selector_all('#theme-grid .theme-card')}) >= 5)
        check('기본 테마 선택됨', len(page.query_selector_all('#theme-grid .theme-card[aria-checked="true"]')) == 1)
        check('AI 티 배지 표시', page.is_visible('#ai-tone'))
        check('카피 축 진단 표시', page.is_visible('#hook-score') and '카피 축' in page.inner_text('#hook-score'),
              page.inner_text('#hook-score')[:60])
        check('카피 축 숫자 표시', any(ch.isdigit() for ch in page.inner_text('#hook-score')))
        check('디자인 기준 표기', page.get_attribute('html', 'data-design') == 'designref.v3/dark-glass',
              page.get_attribute('html', 'data-design'))
        check('C안 캔버스 #06070B', page.evaluate("() => getComputedStyle(document.body).backgroundColor") == 'rgb(6, 7, 11)',
              page.evaluate("() => getComputedStyle(document.body).backgroundColor"))
        check('다크 글래스가 기본', page.get_attribute('html', 'data-theme') == 'dark', page.get_attribute('html', 'data-theme'))
        check('히어로 모니터 패널', page.is_visible('.hero-stage') and page.is_visible('.hero-frame'))
        glass = page.evaluate("() => { const s = getComputedStyle(document.querySelector('.hero-stage')); return (s.backdropFilter || s.webkitBackdropFilter || ''); }")
        check('유리 패널에 blur', 'blur' in (glass or ''), glass)
        check('상단 바도 유리', 'blur' in (page.evaluate("() => { const s = getComputedStyle(document.querySelector('.topbar')); return (s.backdropFilter || s.webkitBackdropFilter || ''); }") or ''))
        check('폰트 PlexKR 적용', page.evaluate("() => getComputedStyle(document.body).fontFamily.includes('PlexKR') && document.fonts.check('600 16px PlexKR')"))
        check('본문 가로 넘침 없음', page_overflow(page) == 0, str(page_overflow(page)))
        check('넘치는 요소 없음', not overflow(page), ', '.join(overflow(page)))
        check('푸터 개인정보 링크 대비 4.5:1', contrast(page, '#footer-privacy') >= 4.5, f'{contrast(page, "#footer-privacy"):.2f}')
        check('작은 안내문 대비 4.5:1', contrast(page, '.footer-brand p') >= 4.5, f'{contrast(page, ".footer-brand p"):.2f}')
        check('키커 라벨 대비 4.5:1', contrast(page, '.kicker') >= 4.5, f'{contrast(page, ".kicker"):.2f}')
        check('장식 그레인은 포인터를 막지 않음',
              page.evaluate("() => getComputedStyle(document.body, '::before').pointerEvents") == 'none')
        # NLE 워크스페이스가 붙은 뒤로도 이 컨테이너(2코어) 기준 1.4~2.2초대다. 총량 가드로 2.5초를 쓴다.
        timing = page.evaluate("() => performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd")
        check('DOMContentLoaded 2500ms 이하', timing < 2500, f'{timing:.0f} ms')

        # ────────────────────────────────────────────── B
        section('B. 대본 → 5컷 분배 · 편집')
        page.click('#btn-random-topic')
        page.wait_for_timeout(600)
        check('다른 예시로 교체', page.input_value('#f-topic') != '홈카페 라떼', page.input_value('#f-topic'))
        check('교체 후에도 5컷', len(page.query_selector_all('.cut-card')) == 5)

        page.fill('#f-topic', '겨울 가습기 관리')
        page.fill('#f-script', '가습기 물은 매일 갈아야 함\n대부분 물만 보충하고 통은 안 씻음\n주 1회 식초 물로 10분 담가두기\n3주 해보니 냄새가 사라졌음\n오늘 통부터 비워보세요')
        page.click('#btn-build')
        page.wait_for_timeout(700)
        check('대본 5줄이 그대로 5컷', len(page.query_selector_all('.cut-card')) == 5)
        heads = [el.input_value() for el in page.query_selector_all('.cut-headline')]
        check('첫 컷 = 첫 줄', heads[0] == '가습기 물은 매일 갈아야 함', heads[0])
        check('셋째 컷 = 셋째 줄', heads[2] == '주 1회 식초 물로 10분 담가두기', heads[2])
        check('주제가 스토리보드 제목에', '겨울 가습기 관리' in page.inner_text('#board-title'))

        before_stats = page.inner_text('#board-stats')
        page.fill('.cut-headline', '가습기 물, 하루만 그냥 두면')
        page.wait_for_timeout(400)
        check('제목 수정이 통계에 반영', page.inner_text('#board-stats') != before_stats)
        check('제목 수정 유지', page.query_selector('.cut-headline').input_value() == '가습기 물, 하루만 그냥 두면')

        page.evaluate("""() => { const el = document.querySelectorAll('.cut-duration')[0]; el.value = '1.2'; el.dispatchEvent(new Event('input', { bubbles: true })); }""")
        page.wait_for_timeout(300)
        check('길이 슬라이더 값 표시', '1.2s' in page.inner_text('.cut-card'))

        first_text = page.query_selector('.cut-headline').input_value()
        page.click('[data-regen="0"]')
        page.wait_for_timeout(500)
        check('문장 바꾸기', page.query_selector('.cut-headline').input_value() != first_text)

        sig_caption = canvas_signature(page)
        page.uncheck('#f-caption')
        page.wait_for_timeout(450)
        check('자막 끄면 캔버스 변화', canvas_signature(page) != sig_caption)
        page.check('#f-caption')
        page.wait_for_timeout(350)
        check('자막 다시 켜짐', canvas_signature(page) == sig_caption)

        sig = canvas_signature(page)
        page.click('[data-theme-id="midnight"]')
        page.wait_for_timeout(500)
        check('테마 전환 시 캔버스 변화', canvas_signature(page) != sig)
        check('테마 이름 표시', page.inner_text('#theme-name') == '미드나잇 시네마', page.inner_text('#theme-name'))
        page.click('[data-theme-id="editorial"]')
        page.wait_for_timeout(300)

        # 사진 업로드
        img_path = tmp / 'photo.png'
        from PIL import Image, ImageDraw
        im = Image.new('RGB', (900, 1600), '#243b55')
        d = ImageDraw.Draw(im)
        for y in range(1600):
            d.line([(0, y), (900, y)], fill=(36 + y // 20, 59 + y // 30, 85 + y // 12))
        im.save(img_path)
        page.set_input_files('.cut-file >> nth=1', str(img_path))
        page.wait_for_timeout(900)
        check('사진 업로드 후 썸네일', page.is_visible('.cut-card:nth-child(2) .cut-thumb'))
        check('업로드 파일명 표시', 'photo' in page.inner_text('.cut-card:nth-child(2) .cut-thumb'))
        sig2 = canvas_signature(page)
        check('사진이 컷 배경에 반영', sig2 != sig)

        # ────────────────────────────────────────────── C
        section('C. NLE 워크스페이스 · 멀티트랙 · 재생')
        page.click('#tab-studio')
        page.wait_for_timeout(700)
        check('스튜디오 화면 표시', page.is_visible('#view-studio'))
        check('NLE 워크스페이스 표시', page.is_visible('#nle-workspace'))
        check('프로그램 모니터 9:16', page.is_visible('#preview-canvas'))
        check('캔버스 720×1280', page.evaluate("() => { const c = document.querySelector('#preview-canvas'); return c.width + 'x' + c.height; }") == '720x1280')
        check('타임코드 00:00:00:00', page.inner_text('#tc-display') == '00:00:00:00', page.inner_text('#tc-display'))
        check('스웜 에이전트 3명', len(page.query_selector_all('.swarm-agent')) == 3)
        agents = page.eval_on_selector_all('.swarm-agent .agent-role', 'els => els.map(e => e.textContent)')
        check('에이전트 역할 표기', agents == ['대본/자막', '컷/리듬', '색보정/사운드'], ' / '.join(agents))
        check('미디어 소스 3종', len(page.query_selector_all('.media-item')) == 3)
        check('트랙 헤더 4개', len(page.query_selector_all('.tl-track-head')) == 4)
        tracks = page.eval_on_selector_all('.tl-track-head b', 'els => els.map(e => e.textContent)')
        check('V1·T1·A1·FX 순서', tracks == ['V1', 'T1', 'A1', 'FX'], ' / '.join(tracks))
        check('V1 클립 5개', len(page.query_selector_all('#tl-v1 .tl-clip')) == 5, str(len(page.query_selector_all('#tl-v1 .tl-clip'))))
        check('T1 자막 클립', len(page.query_selector_all('#tl-t1 .tl-clip')) >= 5)
        check('A1 비트 표시', len(page.query_selector_all('#tl-a1-marks .tl-beat')) >= 5)
        check('FX 효과 클립', len(page.query_selector_all('#tl-fx .tl-clip')) >= 2)
        check('재생 헤드 존재', page.is_visible('#tl-playhead'))
        check('타임라인 메타 표시', 'CLIPS' in page.inner_text('#tl-meta'), page.inner_text('#tl-meta'))
        check('총 길이 표시', page.inner_text('#time-total') != '0:00', page.inner_text('#time-total'))
        check('오디오 스코프 캔버스', page.evaluate("() => document.querySelector('#scope-canvas').width > 100"))
        check('컬러 휠 표시', page.is_visible('#color-wheel'))
        check('색보정 슬라이더 4개', len(page.query_selector_all('.g-slider input[type=range]')) == 4)
        check('그레이드 프리셋 6개', len(page.query_selector_all('.grade-chip')) == 6)
        check('스웜 실행 버튼', page.is_visible('#btn-swarm'))

        frame_a = canvas_signature(page)
        page.click('#btn-play')
        page.wait_for_timeout(900)
        frame_b = canvas_signature(page)
        check('재생 중 프레임 변화', frame_a != frame_b)
        check('재생 헤드 이동', page.evaluate("() => parseFloat(document.querySelector('#tl-playhead').style.left) > 0"),
              page.evaluate("() => document.querySelector('#tl-playhead').style.left"))
        check('타임코드가 흐름', page.inner_text('#tc-display') != '00:00:00:00', page.inner_text('#tc-display'))
        check('재생 버튼이 일시정지로', '일시정지' in page.inner_text('#btn-play'), page.inner_text('#btn-play'))
        page.click('#btn-play')
        page.wait_for_timeout(200)
        check('일시정지 동작', '재생' in page.inner_text('#btn-play'))

        page.check('#f-safe')
        page.wait_for_timeout(200)
        check('안전 영역 오버레이', page.is_visible('#safe-overlay'))
        page.uncheck('#f-safe')

        # 클립 선택 → 길이/문장 편집
        page.click('#tl-v1 .tl-clip >> nth=1')
        page.wait_for_timeout(300)
        check('클립 선택 표시', page.is_visible('.tl-clip.is-selected'))
        check('선택 라벨 V1', 'V1' in page.inner_text('#sel-label'), page.inner_text('#sel-label'))
        check('길이 입력 활성', not page.evaluate("() => document.querySelector('#sel-dur').disabled"))
        len_before = page.inner_text('#export-len')
        page.evaluate("""() => { const el = document.querySelector('#sel-dur'); el.value = '1.6'; el.dispatchEvent(new Event('input', { bubbles: true })); }""")
        page.wait_for_timeout(500)
        sel_idx = page.evaluate("() => (window.ShortsNLE.selected() || {}).cutIndex")
        check('길이 편집이 컷에 반영', page.evaluate("(i) => window.ShortsApp.state.project.cuts[i].duration", sel_idx) == 1.6,
              f"cut {sel_idx} = " + str(page.evaluate("(i) => window.ShortsApp.state.project.cuts[i].duration", sel_idx)))
        check('길이 편집이 전체 길이에 반영', page.inner_text('#export-len') != len_before,
              len_before + ' → ' + page.inner_text('#export-len'))

        page.click('#tl-t1 .tl-clip >> nth=0')
        page.wait_for_timeout(300)
        check('자막 클립 선택 라벨', 'T1' in page.inner_text('#sel-label'), page.inner_text('#sel-label'))
        check('자막 입력 활성', not page.evaluate("() => document.querySelector('#sel-text').disabled"))
        page.fill('#sel-text', '자막 편집 확인')
        page.wait_for_timeout(400)
        check('자막 편집이 데이터에 반영', page.evaluate("() => (window.ShortsApp.state.project.subtitles[0] || {}).text") == '자막 편집 확인',
              page.evaluate("() => (window.ShortsApp.state.project.subtitles[0] || {}).text"))
        check('자막 클립 글자 갱신', '자막 편집 확인' in page.inner_text('#tl-t1'), page.inner_text('#tl-t1')[:80])

        # 색보정 슬라이더 → 프리뷰 즉시 반영
        sig_neutral = canvas_signature(page)
        page.evaluate("""() => { const el = document.querySelector('#g-exposure'); el.value = '26'; el.dispatchEvent(new Event('input', { bubbles: true })); }""")
        page.wait_for_timeout(500)
        check('노출 슬라이더 값 표시', page.inner_text('#g-exposure-v') == '+26', page.inner_text('#g-exposure-v'))
        check('노출 값이 프로젝트에 저장', page.evaluate("() => window.ShortsApp.state.project.grade.exposure") == 26,
              str(page.evaluate("() => window.ShortsApp.state.project.grade.exposure")))
        check('슬라이더가 프리뷰에 반영', canvas_signature(page) != sig_neutral)
        page.click('[data-grade="cinematic"]')
        page.wait_for_timeout(500)
        check('프리셋 클릭 → 시네마틱', page.inner_text('#grade-name') == '시네마틱', page.inner_text('#grade-name'))
        check('프리셋이 프로젝트에 저장', page.evaluate("() => window.ShortsApp.state.project.grade.preset") == 'cinematic')
        check('프리셋이 내보내기 표기에 반영', page.inner_text('#export-grade') == '시네마틱', page.inner_text('#export-grade'))
        page.click('#btn-grade-reset')
        page.wait_for_timeout(400)
        check('색보정 초기화', page.inner_text('#grade-name') == '뉴트럴', page.inner_text('#grade-name'))

        # 장면 전환: 같은 경계 시점에서 페이드와 줌의 프레임이 달라야 한다.
        boundary = page.evaluate("() => ShortsCore.timeline(window.ShortsApp.state.project.cuts)[1].start + 90")
        page.select_option('#x-transition', 'fade')
        page.evaluate("(ms) => window.ShortsApp.state.preview.seek(ms)", boundary)
        page.wait_for_timeout(250)
        fade_sig = canvas_signature(page)
        page.select_option('#x-transition', 'zoom')
        page.evaluate("(ms) => window.ShortsApp.state.preview.seek(ms + 1)", boundary)
        page.wait_for_timeout(250)
        check('줌 전환이 페이드와 다름', canvas_signature(page) != fade_sig)
        page.select_option('#x-transition', 'fade')
        page.wait_for_timeout(200)

        # ────────────────────────────────────────────── D
        section('D. AI 스웜 자동 편집')
        v1_before = len(page.query_selector_all('#tl-v1 .tl-clip'))
        page.click('#btn-swarm')
        page.wait_for_timeout(180)
        check('스웜 실행 상태', page.get_attribute('#nle-workspace', 'data-swarm') == 'running',
              page.get_attribute('#nle-workspace', 'data-swarm'))
        check('에이전트 커서 3개', len(page.query_selector_all('.swarm-cursor')) == 3)
        page.wait_for_timeout(700)
        check('커서가 타임라인 위로 이동', page.evaluate(
            "() => Array.from(document.querySelectorAll('.swarm-cursor')).some(el => /translate3d\\([1-9]/.test(el.style.transform) && el.getAttribute('data-visible') === 'true')"),
            page.evaluate("() => Array.from(document.querySelectorAll('.swarm-cursor')).map(el => el.style.transform).join(' | ')"))
        page.wait_for_function("() => document.querySelector('#nle-workspace').getAttribute('data-swarm') === 'done'", timeout=60000)
        page.wait_for_timeout(500)
        v1_after = len(page.query_selector_all('#tl-v1 .tl-clip'))
        splits_n = page.evaluate("() => Object.keys(window.ShortsApp.state.project.splits || {}).length")
        check('컷 분할이 타임라인에 반영', v1_after > v1_before, f'{v1_before} → {v1_after}')
        check('분할 수만큼 V1 클립 증가', v1_after == v1_before + splits_n, f'{v1_before} + {splits_n} = {v1_after}')
        check('V1 클립 8개 이상', v1_after >= 8, str(v1_after))
        check('T1 자막 줄 배치', len(page.query_selector_all('#tl-t1 .tl-clip')) >= 8,
              str(len(page.query_selector_all('#tl-t1 .tl-clip'))))
        check('FX에 COLOR 블록', page.query_selector('#tl-fx .tl-clip[data-type="color"]') is not None)
        check('색보정 적용(테마 추천)', page.inner_text('#grade-name') == '웜 톤', page.inner_text('#grade-name'))
        check('슬라이더가 적용값으로', page.inner_text('#g-temperature-v') == '+24', page.inner_text('#g-temperature-v'))
        check('오디오 비트 동기화', len(page.query_selector_all('#tl-a1-marks .tl-beat')) >= 8)
        states = page.eval_on_selector_all('.swarm-agent', 'els => els.map(e => e.getAttribute("data-state"))')
        check('에이전트 모두 DONE', states == ['done', 'done', 'done'], ' / '.join(states))
        log_agents = page.eval_on_selector_all('#swarm-log li', 'els => els.map(e => e.getAttribute("data-agent"))')
        check('스웜 로그 4줄 이상', len(log_agents) >= 4, str(len(log_agents)))
        check('로그에 3개 에이전트', set(log_agents) >= {'claude', 'gemini', 'gpt'}, ' / '.join(log_agents))
        check('완료 상태 문구', '완료' in page.inner_text('#swarm-status'), page.inner_text('#swarm-status'))
        check('스웜 후 프리뷰 그려짐', page.evaluate("() => document.querySelector('#preview-canvas').toDataURL().length > 20000"))
        split_parts = page.eval_on_selector_all('#tl-v1 .tl-clip b', 'els => els.map(e => e.textContent)')
        check('A/B 파트로 분할됨', any(t.endswith('· B') for t in split_parts), ' / '.join(split_parts[:4]))

        # 자막 트랙 편집 → .srt로 이어지는지
        page.click('#tl-t1 .tl-clip >> nth=0')
        page.wait_for_timeout(250)
        page.fill('#sel-text', '스웜 자막 수정')
        page.wait_for_timeout(400)
        check('스웜 후 자막 편집', page.evaluate("() => (window.ShortsApp.state.project.subtitles[0] || {}).text") == '스웜 자막 수정',
              page.evaluate("() => (window.ShortsApp.state.project.subtitles[0] || {}).text"))

        # ────────────────────────────────────────────── E
        section('E. 실제 .webm 녹화 · 색보정 반영')
        set_durations(page, '0.8')
        page.evaluate("""() => {
            const r = document.querySelector('#x-resolution'); r.value = '540'; r.dispatchEvent(new Event('change', { bubbles: true }));
            const m = document.querySelector('#x-music'); m.value = 'lofi'; m.dispatchEvent(new Event('change', { bubbles: true }));
            const f = document.querySelector('#x-fps'); f.value = '30'; f.dispatchEvent(new Event('change', { bubbles: true }));
        }""")
        page.wait_for_timeout(500)
        check('짧아진 길이 표시', '4.0초' in page.inner_text('#export-len'), page.inner_text('#export-len'))
        check('내보내기 버튼 활성', not page.query_selector('#btn-export').is_disabled())
        check('내보내기에 색보정 표기', page.inner_text('#export-grade') == '웜 톤', page.inner_text('#export-grade'))

        neutral_stats = page.evaluate("""async () => {
            const S = window.ShortsApp.state;
            const blob = await ShortsRender.stillFrame({ cuts: S.project.cuts,
                project: Object.assign({}, S.project, { grade: ShortsCore.GRADES[0] }),
                ms: 500, images: S.images, width: 540, height: 960 });
            const bmp = await createImageBitmap(blob);
            const c = document.createElement('canvas'); c.width = 45; c.height = 80;
            const x = c.getContext('2d'); x.drawImage(bmp, 0, 0, 45, 80);
            const d = x.getImageData(0, 0, 45, 80).data;
            let r = 0, g = 0, b = 0, n = 0;
            for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
            return { r: r / n, g: g / n, b: b / n };
        }""")
        check('뉴트럴 기준 프레임 측정', neutral_stats['r'] > 0, f"{neutral_stats['r']:.1f},{neutral_stats['g']:.1f},{neutral_stats['b']:.1f}")

        t_export = time.time()
        page.click('#btn-export')
        page.wait_for_selector('#export-result:not([hidden])', timeout=120000)
        took = time.time() - t_export
        check('녹화 완료 (실시간)', took >= 2.5, f'{took:.1f}s')
        meta = page.inner_text('#result-meta')
        check('결과 메타 540×960', '540×960' in meta, meta)
        check('결과 메타 4.0초', '4.0초' in meta, meta)
        check('결과 메타 WEBM', 'WEBM' in meta, meta)

        blob_info = page.evaluate("""() => {
            const info = window.ShortsApp.state.exportInfo || {};
            return { size: info.size || 0, type: info.type || '' };
        }""")
        check('영상 Blob 생성', blob_info['size'] > 50000, f"{blob_info['size']} bytes")
        check('MIME video/webm', 'video/webm' in blob_info['type'], blob_info['type'])
        check('오디오 트랙 포함(opus)', 'opus' in blob_info['type'], blob_info['type'])
        check('배경음 표기가 실제 트랙과 일치', ('배경음 포함' in meta) == ('opus' in blob_info['type']),
              f"meta={meta} / type={blob_info['type']}")

        duration = page.evaluate("""async () => {
            const v = document.querySelector('#result-video');
            if (v.readyState < 1) await new Promise(r => { v.onloadedmetadata = r; setTimeout(r, 3000); });
            if (!isFinite(v.duration)) {
                v.currentTime = 1e6;
                await new Promise(r => setTimeout(r, 500));
            }
            return v.duration;
        }""")
        check('영상 길이 4초 근처', 3.3 <= float(duration) <= 4.9, str(duration))

        video_stats = page.evaluate("""async () => {
            const v = document.querySelector('#result-video');
            v.muted = true;
            try { await v.play(); } catch (e) { /* noop */ }
            await new Promise(r => setTimeout(r, 520));
            v.pause();
            const c = document.createElement('canvas'); c.width = 45; c.height = 80;
            const x = c.getContext('2d'); x.drawImage(v, 0, 0, 45, 80);
            const d = x.getImageData(0, 0, 45, 80).data;
            let r = 0, g = 0, b = 0, n = 0;
            for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
            return { r: r / n, g: g / n, b: b / n, t: v.currentTime };
        }""")
        check('결과 영상 재생(디코딩)', 0.15 <= float(video_stats['t']) <= 1.6, str(video_stats['t']))
        warm_rb = video_stats['r'] - video_stats['b']
        neutral_rb = neutral_stats['r'] - neutral_stats['b']
        check('내보낸 프레임에 색보정 적용됨', warm_rb > neutral_rb + 3,
              f"warm R-B {warm_rb:.1f} vs neutral {neutral_rb:.1f}")

        with page.expect_download() as dl:
            page.click('#btn-download')
        download = dl.value
        webm_path = tmp / 'out.webm'
        download.save_as(str(webm_path))
        head = webm_path.read_bytes()[:4]
        check('.webm 파일명', download.suggested_filename.endswith('.webm'), download.suggested_filename)
        check('.webm 크기 100KB 이상', webm_path.stat().st_size > 100000, f'{webm_path.stat().st_size} bytes')
        check('.webm EBML 헤더', head == b'\x1a\x45\xdf\xa3', head.hex())
        webm_bytes = webm_path.read_bytes()
        check('.webm에 Opus 오디오 트랙', b'A_OPUS' in webm_bytes, f'{len(webm_bytes)} bytes')

        with page.expect_download() as dl2:
            page.click('#btn-srt')
        srt_path = tmp / 'out.srt'
        dl2.value.save_as(str(srt_path))
        srt = srt_path.read_text(encoding='utf-8')
        check('.srt 파일명', dl2.value.suggested_filename.endswith('.srt'), dl2.value.suggested_filename)
        check('.srt 블록 여러 개', len([b for b in srt.strip().split('\n\n') if b.strip()]) >= 5, str(len(srt.split('\n\n'))))
        check('.srt 시간 형식', '00:00:00,000 --> ' in srt, srt[:40].replace('\n', '|'))
        check('.srt에 편집한 T1 자막', '스웜 자막 수정' in srt, srt[:120].replace('\n', '|'))

        with page.expect_download() as dl3:
            page.click('#btn-vtt')
        check('.vtt 확장자', dl3.value.suggested_filename.endswith('.vtt'), dl3.value.suggested_filename)

        with page.expect_download() as dl4:
            page.click('#btn-txt')
        txt_path = tmp / 'script.txt'
        dl4.value.save_as(str(txt_path))
        check('대본 TXT에 연출', '연출' in txt_path.read_text(encoding='utf-8'))

        page.click('#btn-caption')
        page.wait_for_timeout(500)
        caption = page.evaluate('() => navigator.clipboard.readText()')
        check('캡션 복사에 해시태그', '#' in caption, caption[:50].replace('\n', ' | '))

        pngs = []
        page.on('download', lambda d: pngs.append(d))
        page.click('#btn-png')
        page.wait_for_timeout(4000)
        for i, d in enumerate(pngs):
            d.save_as(str(tmp / f'cut{i + 1}.png'))
        check('컷 PNG 5장 다운로드', len(pngs) == 5, str(len(pngs)))
        check('PNG 파일 크기', all((tmp / f'cut{i + 1}.png').stat().st_size > 20000 for i in range(len(pngs))) if pngs else False)

        # 내가 만든 영상 파일을 컷 배경으로 넣기(영상 → 대표 프레임 추출)
        page.click('#tab-board')
        page.wait_for_timeout(400)
        page.set_input_files('.cut-file >> nth=2', str(webm_path))
        page.wait_for_timeout(1800)
        check('영상 파일에서 프레임 추출', page.evaluate("() => window.ShortsApp.state.project.cuts[2].imageName") == 'out.webm',
              page.evaluate("() => window.ShortsApp.state.project.cuts[2].imageName"))
        check('영상 프레임 썸네일', page.evaluate("() => !document.querySelectorAll('.cut-thumb')[2].hidden"))
        page.click('#tab-studio')
        page.wait_for_timeout(400)

        # ────────────────────────────────────────────── F
        section('F. Pro 모달 · 연결/해제')
        page.click('#btn-pro-badge')
        page.wait_for_timeout(400)
        check('Pro 모달 열림', page.evaluate("() => document.querySelector('#pro-modal').open"))
        order = page.eval_on_selector_all('#modal-providers .provider-card strong', 'els => els.map(e => e.textContent)')
        check('제공자 4개 순서', order == ['OpenAI', 'Google Gemini', 'Anthropic Claude', '자체 API 서버'], ' / '.join(order))
        check('1번 OpenAI', page.inner_text('#modal-providers .provider-card:nth-child(1) .p-tag') == '올인원')
        check('2번 Gemini', '이미지' in page.inner_text('#modal-providers .provider-card:nth-child(2) .p-tag'))
        check('3번 Claude', '대본' in page.inner_text('#modal-providers .provider-card:nth-child(3) .p-tag'))
        check('4번 자체 서버', '커스텀' in page.inner_text('#modal-providers .provider-card:nth-child(4) .p-tag'))
        page.click('#btn-modal-connect')
        page.wait_for_timeout(400)
        check('키 없이 연결 시 안내', '키' in page.inner_text('#modal-status'), page.inner_text('#modal-status'))
        page.click('#btn-free-continue')
        page.wait_for_timeout(300)
        check('무료 모드로 계속 닫힘', not page.evaluate("() => document.querySelector('#pro-modal').open"))
        check('여전히 무료 모드 배지', '무료 모드' in page.inner_text('#pro-badge-label'), page.inner_text('#pro-badge-label'))

        # 모의 API: 실제 키 없이 연결·생성 경로만 검증한다.
        page.route('https://api.openai.com/v1/models**', lambda r: r.fulfill(
            status=200, content_type='application/json', body=json.dumps({'data': [{'id': 'gpt-4.1-mini'}]})))
        ai_cuts = [
            {'stage': 'hook', 'headline': '가습기 냄새, 물 갈아도 안 잡힘', 'sub': '통을 안 씻어서임', 'direction': '통 클로즈업'},
            {'stage': 'problem', 'headline': '물만 보충하면 세균이 남음', 'sub': '바닥 물때가 원인'},
            {'stage': 'solution', 'headline': '주 1회 식초 물 10분', 'sub': '헹굼까지 해야 함'},
            {'stage': 'proof', 'headline': '3주 뒤 냄새가 사라짐', 'sub': '[숫자]일 만에 확인'},
            {'stage': 'cta', 'headline': '오늘 통부터 비우기', 'sub': '해보고 댓글 남겨줘'},
        ]
        swarm_cuts = [
            {'stage': 'hook', 'headline': 'API 스웜 훅', 'sub': 'API가 고른 첫 문장', 'duration': 2.2},
            {'stage': 'problem', 'headline': 'API 문제 인식', 'sub': '문제 설명'},
            {'stage': 'solution', 'headline': 'API 해결책', 'sub': '해결 설명'},
            {'stage': 'proof', 'headline': 'API 증거', 'sub': '증거 설명'},
            {'stage': 'cta', 'headline': 'API 행동', 'sub': '행동 설명'},
        ]
        swarm_payload = {'grade': 'cool', 'cuts': swarm_cuts, 'splits': [0.5, 0.45, 0.4, 0.5, 0], 'notes': 'API가 리듬을 조였습니다'}

        def chat_handler(route):
            body = route.request.post_data or ''
            content = swarm_payload if 'splits' in body else ai_cuts
            route.fulfill(status=200, content_type='application/json',
                          body=json.dumps({'choices': [{'message': {'content': json.dumps(content, ensure_ascii=False)}}]}))
        page.route('https://api.openai.com/v1/chat/completions', chat_handler)
        pixel_png = ('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
        image_body = json.dumps({'data': [{'b64_json': pixel_png}]})
        page.route('https://api.openai.com/v1/images/generations',
                   lambda r: r.fulfill(status=200, content_type='application/json', body=image_body))

        page.click('#tab-pro')
        page.wait_for_timeout(500)
        providers = page.eval_on_selector_all('#provider-cards .provider-card strong', 'els => els.map(e => e.textContent)')
        check('Pro 화면 제공자 순서', providers == ['OpenAI', 'Google Gemini', 'Anthropic Claude', '자체 API 서버'], ' / '.join(providers))
        check('1번 카드에 순위 표시', '1번' in page.inner_text('#provider-cards .provider-card:nth-child(1) .provider-rank'))
        page.click('#provider-cards .provider-card:nth-child(1)')
        page.fill('#p-key', 'test-key-not-real-1234')
        page.click('#btn-connect')
        page.wait_for_timeout(1200)
        check('연결 확인 성공', '연결' in page.inner_text('#pro-status') and '키가 올바르지' not in page.inner_text('#pro-status'),
              page.inner_text('#pro-status')[:70])
        check('배지가 Pro 연결됨', 'Pro 연결됨' in page.inner_text('#pro-badge-label'), page.inner_text('#pro-badge-label'))
        check('키 마스킹 표시', 'test' not in page.inner_text('#key-mask') and '••' in page.inner_text('#key-mask'), page.inner_text('#key-mask'))
        check('세션 저장 배지', 'sessionStorage' in page.inner_text('.key-state'))

        # Pro BYOK: 실제 API 응답(모의)으로 스웜이 타임라인을 채우는지
        page.click('#tab-studio')
        page.wait_for_timeout(600)
        check('Pro 모드 칩', 'Pro' in page.inner_text('#nle-mode-label'), page.inner_text('#nle-mode-label'))
        page.click('#btn-swarm')
        page.wait_for_function("() => document.querySelector('#nle-workspace').getAttribute('data-swarm') === 'done'", timeout=60000)
        page.wait_for_timeout(500)
        check('Pro 스웜 API 컷 적용', page.evaluate("() => window.ShortsApp.state.project.cuts[0].headline") == 'API 스웜 훅',
              page.evaluate("() => window.ShortsApp.state.project.cuts[0].headline"))
        check('Pro 스웜 API 색보정 적용', page.inner_text('#grade-name') == '쿨 톤', page.inner_text('#grade-name'))
        check('Pro 스웜 API 분할 적용', len(page.query_selector_all('#tl-v1 .tl-clip')) == 9,
              str(len(page.query_selector_all('#tl-v1 .tl-clip'))))
        check('Pro 스웜 로그에 API 표기', 'API' in page.inner_text('#swarm-log'), page.inner_text('#swarm-log')[-120:])
        page.click('#tab-pro')
        page.wait_for_timeout(400)

        page.fill('#ai-topic', '가습기 관리')
        page.click('#btn-ai-script')
        page.wait_for_timeout(1400)
        check('AI 대본 5컷 표시', page.is_visible('#btn-ai-apply') and len(page.query_selector_all('#ai-script-out .out-cut')) == 5)
        page.click('#btn-ai-apply')
        page.wait_for_timeout(600)
        check('AI 대본 적용', page.query_selector('.cut-headline').input_value() == '가습기 냄새, 물 갈아도 안 잡힘',
              page.query_selector('.cut-headline').input_value())
        check('AI 티 점검 표시', page.is_visible('#ai-tone-mini') and '/100' in page.inner_text('#ai-tone-mini'))

        page.select_option('#ai-image-cut', '0')
        page.wait_for_timeout(200)
        check('컷 이미지 프롬프트 표시', '9:16' in page.inner_text('#image-prompt-preview'))
        page.click('#btn-ai-image')
        page.wait_for_timeout(1200)
        check('AI 이미지 결과', page.is_visible('#ai-image-preview'))
        page.click('#btn-ai-image-apply')
        page.wait_for_timeout(700)
        check('AI 이미지 컷 적용', page.evaluate("() => window.ShortsApp.state.project.cuts[0].imageName") == 'AI 생성 이미지',
              page.evaluate("() => window.ShortsApp.state.project.cuts[0].imageName"))
        check('AI 이미지 썸네일 표시', page.evaluate("() => !document.querySelector('.cut-card .cut-thumb').hidden"))
        page.click('#tab-board')
        page.wait_for_timeout(400)
        check('보드에서 AI 이미지 확인', page.is_visible('.cut-card:nth-child(1) .cut-thumb'))
        page.click('#tab-pro')
        page.wait_for_timeout(400)

        page.click('#btn-disconnect')
        page.wait_for_timeout(400)
        check('연결 해제', '무료 모드' in page.inner_text('#pro-badge-label'), page.inner_text('#pro-badge-label'))
        check('연결 해제 안내', '해제' in page.inner_text('#pro-status'), page.inner_text('#pro-status'))
        page.fill('#ai-paste', '1. 훅 | 다섯 컷 테스트 | 보조\n2. 문제 | 문제 문장 | 설명\n3. 해결 | 해결 문장\n4. 증거 | 증거 문장\n5. CTA | 행동 문장')
        page.click('#btn-ai-import')
        page.wait_for_timeout(600)
        check('브리지 붙여넣기 적용', page.evaluate("() => window.ShortsApp.state.project.cuts[0].headline") == '다섯 컷 테스트',
              page.evaluate("() => window.ShortsApp.state.project.cuts[0].headline"))
        check('브리지 5컷 유지', len(page.query_selector_all('.cut-card')) == 5)

        page.unroute('https://api.openai.com/v1/models**')
        page.unroute('https://api.openai.com/v1/chat/completions')
        page.unroute('https://api.openai.com/v1/images/generations')

        # ────────────────────────────────────────────── G
        section('G. 저장 유지 · 다크 모드 · 개인정보 페이지')
        page.click('#tab-board')
        page.wait_for_timeout(400)
        page.fill('.cut-headline', '저장 확인 문장')
        page.wait_for_timeout(900)
        page.reload(wait_until='load')
        page.wait_for_timeout(1400)
        check('새로고침 후 5컷 유지', len(page.query_selector_all('.cut-card')) == 5)
        check('새로고침 후 문장 유지', page.query_selector('.cut-headline').input_value() == '저장 확인 문장',
              page.query_selector('.cut-headline').input_value())
        check('새로고침 후 색보정 유지', page.evaluate("() => (window.ShortsApp.state.project.grade || {}).preset") == 'cool',
              page.evaluate("() => JSON.stringify(window.ShortsApp.state.project.grade)"))
        page.click('#tab-studio')
        page.wait_for_timeout(500)
        check('새로고침 후 NLE 트랙 4개', len(page.query_selector_all('.tl-track-head')) == 4)
        check('새로고침 후 색보정 이름', page.inner_text('#grade-name') == '쿨 톤', page.inner_text('#grade-name'))
        page.click('#tab-board')
        page.wait_for_timeout(300)

        page.click('#btn-theme')
        page.wait_for_timeout(400)
        check('라이트(고대비) 테마 적용', page.get_attribute('html', 'data-theme') == 'light')
        light_contrast = page.evaluate("""() => {
            function parse(c) { const m = c.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/); return m ? [Number(m[1])/255, Number(m[2])/255, Number(m[3])/255] : null; }
            function lum(rgb) { const c = rgb.map(v => v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4)); return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; }
            const s = getComputedStyle(document.body);
            const a = parse(s.color), b = parse(s.backgroundColor);
            const l1 = lum(a), l2 = lum(b);
            return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
        }""")
        check('라이트 본문 대비 4.5:1', light_contrast >= 4.5, f'{light_contrast:.2f}')
        check('라이트 푸터 링크 대비 4.5:1', contrast(page, '#footer-privacy') >= 4.5, f'{contrast(page, "#footer-privacy"):.2f}')
        page.click('#btn-theme')
        page.wait_for_timeout(300)
        check('다크 복귀', page.get_attribute('html', 'data-theme') == 'dark')

        requests.clear(); failed_requests.clear(); console_errors.clear(); bad_responses.clear(); responses.clear()
        goto(page, BASE + '/')
        page.wait_for_timeout(1200)
        page.evaluate('() => document.fonts.ready')
        page.wait_for_timeout(200)
        ext = no_external(requests)
        check('외부 요청 0건 (로컬 자산만)', not ext, ', '.join(ext[:3]))
        fonts = sorted({u.rsplit('/', 1)[-1] for u, st in responses if u.endswith('.woff2') and st == 200})
        check('폰트 3종 200 응답', fonts == ['plexkr-Bold.woff2', 'plexkr-Regular.woff2', 'plexkr-SemiBold.woff2'], ', '.join(fonts))
        check('실패한 요청 없음', not failed_requests, ', '.join(failed_requests[:3]))
        check('4xx/5xx 응답 없음', not bad_responses, ', '.join(bad_responses[:3]))
        check('콘솔 에러 없음', not console_errors, ' | '.join(console_errors[:3]))
        check('페이지 예외 없음', not page_errors, ' | '.join(page_errors[:3]))

        unlabeled = page.evaluate("""() => Array.from(document.querySelectorAll('input,select,textarea'))
            .filter(el => el.type !== 'hidden' && el.type !== 'file' && el.offsetParent)
            .filter(el => {
                if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
                if (el.id && document.querySelector(`label[for="${el.id}"]`)) return false;
                if (el.closest('label')) return false;
                return true;
            }).map(el => el.id || el.name || el.type)""")
        check('보이는 입력에 레이블', not unlabeled, ', '.join(unlabeled[:4]))
        nameless = page.evaluate("""() => Array.from(document.querySelectorAll('button'))
            .filter(b => b.offsetParent && !b.textContent.trim() && !b.getAttribute('aria-label')).map(b => b.id || b.className)""")
        check('모든 버튼에 이름', not nameless, ', '.join(nameless[:3]))
        check('진행 안내 aria-live', page.get_attribute('#progress-text', 'aria-live') == 'polite')

        for path in ['/robots.txt', '/sitemap.xml', '/favicon.svg', '/privacy.html']:
            check(f'{path} 응답 200', fetch_status(page, path) == 200, str(fetch_status(page, path)))

        with page.expect_navigation(wait_until='load') as nav:
            page.click('#footer-privacy')
        check('푸터 개인정보 링크 이동 200', nav.value.status == 200, str(nav.value.status))
        check('개인정보 페이지 제목', '개인정보 처리방침' in page.inner_text('h1'))
        check('개인정보 페이지에 저장 위치', 'localStorage' in page.inner_text('body'))
        check('개인정보 페이지에 제공자', 'OpenAI' in page.inner_text('body'))
        check('개인정보 페이지 가로 넘침 없음', page_overflow(page) == 0)
        page.go_back(wait_until='load')
        page.wait_for_timeout(600)

        # 데스크톱 프리뷰 (C안은 다크 글래스가 정체성이다)
        if page.get_attribute('html', 'data-theme') == 'light':
            page.click('#btn-theme')
        page.click('#tab-board')
        page.wait_for_timeout(300)
        # 스크린샷은 기본 길이의 예시 대본으로 되돌려 찍는다.
        page.click('#topic-samples .topic-chip >> nth=0')
        page.wait_for_timeout(900)
        start_stage_labels = page.eval_on_selector_all('.cut-stage', 'els => els.map(e => e.textContent)')
        check('컷 단계 라벨 5종', start_stage_labels == ['훅', '문제', '해결', '증거', '행동'], ' / '.join(start_stage_labels))
        check('스크린샷용 기본 길이', page.inner_text('.cut-rail .cut-sec') != '0.8s',
              page.inner_text('.cut-rail .cut-sec'))
        page.evaluate("() => document.querySelectorAll('.toast').forEach(t => t.remove())")
        page.add_style_tag(content='.topbar{position:static !important}')
        page.mouse.move(4, 4)
        page.wait_for_timeout(300)
        shot(page, HERE / 'preview-desktop.png')
        check('preview-desktop.png 저장', (HERE / 'preview-desktop.png').exists())

        # Pro 프리뷰
        page.click('#tab-pro')
        page.wait_for_timeout(500)
        page.evaluate("() => document.querySelectorAll('.toast').forEach(t => t.remove())")
        shot(page, HERE / 'preview-pro.png')
        check('preview-pro.png 저장', (HERE / 'preview-pro.png').exists())
        context.close()

        # ────────────────────────────────────────────── H
        section('H. 모바일 390×844')
        mctx = browser.new_context(
            viewport={'width': 390, 'height': 844}, device_scale_factor=2,
            is_mobile=True, has_touch=True, accept_downloads=True,
            locale='ko-KR', timezone_id='Asia/Seoul', color_scheme='light',
        )
        mctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=BASE)
        mpage = mctx.new_page()
        merrors = []
        mpage.on('pageerror', lambda e: merrors.append(str(e)))
        mpage.on('console', lambda m: merrors.append(m.text) if m.type == 'error' else None)
        goto(mpage, BASE + '/')
        mpage.wait_for_timeout(1300)
        mpage.evaluate('() => document.fonts.ready')

        check('모바일 가로 넘침 없음', page_overflow(mpage) == 0, str(page_overflow(mpage)))
        check('모바일 넘치는 요소 없음', not overflow(mpage), ', '.join(overflow(mpage)))
        check('모바일 5컷 카드', len(mpage.query_selector_all('.cut-card')) == 5)
        check('모바일 탭 4개 접근', len(mpage.query_selector_all('.tab')) == 4)
        check('모바일 히어로 9:16', '9:16' in mpage.inner_text('h1'))
        check('모바일 제목 입력 폰트 16px 이상',
              mpage.evaluate("() => parseFloat(getComputedStyle(document.querySelector('.cut-headline')).fontSize) >= 15.5"),
              mpage.evaluate("() => getComputedStyle(document.querySelector('.cut-headline')).fontSize"))

        mpage.click('#tab-studio')
        mpage.wait_for_timeout(700)
        check('모바일 캔버스 표시', mpage.is_visible('#preview-canvas'))
        check('모바일 NLE 트랙 4개', len(mpage.query_selector_all('.tl-track-head')) == 4)
        check('모바일 V1 클립 5개', len(mpage.query_selector_all('#tl-v1 .tl-clip')) == 5)
        check('모바일 컬러 휠', mpage.is_visible('#color-wheel'))
        check('모바일 스웜 버튼', mpage.is_visible('#btn-swarm'))
        check('모바일 스튜디오 넘침 없음', page_overflow(mpage) == 0, str(page_overflow(mpage)))
        check('모바일 넘치는 요소 없음(스튜디오)', not overflow(mpage), ', '.join(overflow(mpage)))

        mpage.evaluate("() => { const el = document.querySelector('#g-contrast'); el.value = '22'; el.dispatchEvent(new Event('input', { bubbles: true })); }")
        mpage.wait_for_timeout(400)
        check('모바일 색보정 슬라이더', mpage.evaluate("() => window.ShortsApp.state.project.grade.contrast") == 22,
              str(mpage.evaluate("() => window.ShortsApp.state.project.grade.contrast")))

        mpage.click('#btn-swarm')
        mpage.wait_for_function("() => document.querySelector('#nle-workspace').getAttribute('data-swarm') === 'done'", timeout=60000)
        mpage.wait_for_timeout(600)
        check('모바일 스웜 편집 적용', len(mpage.query_selector_all('#tl-v1 .tl-clip')) >= 8,
              str(len(mpage.query_selector_all('#tl-v1 .tl-clip'))))
        check('모바일 스웜 후 넘침 없음', page_overflow(mpage) == 0, str(page_overflow(mpage)))
        mpage.evaluate("() => document.querySelectorAll('.toast').forEach(t => t.remove())")
        shot(mpage, HERE / 'preview-mobile.png')
        check('preview-mobile.png 저장', (HERE / 'preview-mobile.png').exists())

        for tab, view in [('#tab-board', '#view-board'), ('#tab-pro', '#view-pro'), ('#tab-guide', '#view-guide')]:
            mpage.click(tab)
            mpage.wait_for_timeout(450)
            check(f'모바일 {view} 표시', mpage.is_visible(view))
            check(f'모바일 {tab} 넘침 없음', page_overflow(mpage) == 0, str(page_overflow(mpage)))

        check('모바일 제공자 카드 4개', len(mpage.query_selector_all('#provider-cards .provider-card')) == 4)
        check('모바일 Pro 순서 1번 OpenAI', 'OpenAI' in mpage.inner_text('#provider-cards .provider-card:nth-child(1)'))
        check('모바일 콘솔 예외 없음', not merrors, ' | '.join(merrors[:2]))
        mctx.close()

        print('\n────────────────────────────────')
        print(f'{len(passed)} passed, {len(failed)} failed')
        if failed:
            print('\n실패:')
            for f in failed:
                print('  - ' + f)
    finally:
        try:
            if browser is not None:
                browser.close()
        finally:
            if pw is not None:
                try:
                    pw.stop()
                except Exception:  # noqa: BLE001
                    pass
            srv.shutdown()
            srv.server_close()
    return 0 if not failed else 1


if __name__ == '__main__':
    sys.exit(main())
