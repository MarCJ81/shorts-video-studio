# 원탭 숏폼 스튜디오 (One-Tap Shorts Studio)

대본 한 줄(또는 주제 하나)로 **9:16 세로 숏폼 스토리보드 5컷**을 만들고,
브라우저에서 **실제 영상 파일(.webm)** 로 녹화해 내려받는 웹앱입니다.

- 무료 모드: API 키·서버 없이 100% 동작. 대본 분배, 테마 6종, 자막, 배경음 합성, 영상 녹화가 모두 브라우저 안에서 끝납니다.
- Pro 모드(선택): OpenAI · Google Gemini · Anthropic Claude · 자체 API 서버를 연결하면 **AI 대본 · AI 컷 이미지 · AI 성우**까지 자동으로 채웁니다.

정적 파일만으로 돌아가며, GitHub Pages 같은 곳에 그대로 올릴 수 있습니다.

---

## 1. 무엇이 나오나

| 결과물 | 설명 |
|---|---|
| `.webm` 영상 | 1080×1920 / 720×1280 / 540×960, 30·24fps, VP9(+Opus 배경음). 브라우저 MediaRecorder로 실제 녹화 |
| `.srt` / `.vtt` 자막 | 컷 시간에 맞춘 자막. 17자 단위로 끊어 세로 화면에 맞춤 |
| 컷 PNG 5장 | 컷별 대표 프레임(1080×1920). 썸네일·카드뉴스용 |
| 썸네일 PNG | 첫 컷 중간 프레임 |
| 대본 `.txt` | 제목·보조 문장·연출 지시 |
| 캡션 | 첫 컷 훅 + CTA + 해시태그. 클립보드 복사 |

영상은 서버로 가지 않습니다. 녹화·인코딩·저장이 모두 사용자의 브라우저에서 일어납니다.

## 2. 5컷 구조

| 컷 | 역할 | 기본 길이 | 핵심 |
|---|---|---|---|
| 01 훅 | 3초 안에 멈추게 | 3.8초 | 인사말 금지, 숫자·반전·손실로 시작 |
| 02 문제 | 겪는 불편을 짚기 | 4.6초 | 해결책은 아직 말하지 않기 |
| 03 해결 | 방법·제품 한 문장 | 5.2초 | 과정은 3단계 이내 |
| 04 증거 | 숫자·후기·비교 | 5.0초 | `[숫자]`는 실제 값으로 교체 |
| 05 행동 | 저장·팔로우·클릭 하나 | 3.6초 | 행동은 하나만 |

컷 길이는 0.8~15초 사이에서 직접 조절합니다. 합계 20초 안팎이 완주율에 가장 좋습니다.

## 3. 테마 6종

| id | 이름 | 특징 |
|---|---|---|
| `editorial` | 크림 에디토리얼 | 종이 질감, 잉크 라인, 테라코타 포인트 |
| `midnight` | 미드나잇 시네마 | 레터박스, 앰버 조명, 필름 그레인 |
| `neon` | 네온 스튜디오 | 블랙 캔버스, 라임 글로우, 그리드 |
| `sunset` | 선셋 그라디언트 | 주황-자주 흐름, 노란 포인트 |
| `clinic` | 클린 민트 | 밝은 민트, 얇은 선, 정보형 |
| `pop` | 볼드 옐로 | 노랑 바탕, 검정 프레임, 큰 활자 |

테마는 배경·활자·강조 처리(마커/박스/칩)·장식이 함께 바뀌며, 1080×1920 캔버스에 그려집니다.
사진·영상 캡처를 넣으면 배경으로 깔리고 어두운 스크림 위에 흰 자막이 올라갑니다.

## 4. 파일 구조

```
apps/shorts-video-maker/
  index.html          화면 4개: 스토리보드 · 영상 스튜디오 · Pro 연결 · 가이드
  styles.css          디자인 시스템 Direction C — Dark Glass Studio (designref.v3)
  core.js             5컷 분배 · 시간축 · SRT · AI 프롬프트/파싱 (Node 테스트 대상)
  render.js           Canvas 그리기 · 미리보기 · MediaRecorder 녹화 · Web Audio 배경음
  pro.js              ProConnect 호환 슬롯 (OpenAI/Gemini/Claude/자체 서버)
  data.js             예시 대본 · 가이드 · 선택지
  app.js              상태·이벤트·내보내기·AI 연결 UI
  engines/            design-ref-engine.js, copy-psych-engine.js (팔레트·훅 진단)
  assets/fonts/       IBM Plex Sans KR woff2 3종 (로컬)
  favicon.svg · privacy.html · robots.txt · sitemap.xml · .nojekyll
  test.js             단위·보안 테스트 (node)
  uitest.py           실제 Chrome 검증 (playwright)
```

## 4-1. 디자인 시스템 (Direction C · Dark Glass Studio)

영상 도구를 “영상 만드는 사람의 방”처럼 보이게 하는 다크 캔버스 시스템입니다.

| 토큰 | 값 | 쓰는 곳 |
|---|---|---|
| canvas | `#06070B` (카드 바탕 `#111319`) | 화면 바탕·유리 카드의 불투명 폴백 |
| glass / edge | `rgba(255,255,255,.055)` / `rgba(255,255,255,.11)` | 유리 카드 배경과 1px 보더 |
| ink / sub / muted | `#F4F5F8` / `#ADB5C4` / `#949CAC` | 본문 / 보조 / 안내 |
| violet / teal | `#8B5CF6`(글자 `#B9A2FF`) / `#34E0C8` | 보라=상태·행동, 민트=성공·라이브 |
| radius / blur | 카드 20 · 입력 10 · 필 999 / blur 18~22px | 상단 바·히어로 모니터·스테이지 패널·모달에만 |

- **편집기 셸**: 9:16 프리뷰를 뷰어(PREVIEW 바 · 재생 HUD · 안전 영역)로 감싸고, 그 아래에 클립 번호·단계·길이를 가진 타임라인과 재생 헤드를 둡니다. 컷 목록은 단계별 색을 가진 클립 레일로 그립니다.
- **글로우는 화면당 2~3개**만(배경 라디얼 3개). 카드마다 글로우를 넣지 않습니다.
- **라이트 모드는 보조**: 토글은 있지만 정체성은 다크입니다. 라이트는 표·긴 글을 읽기 위한 고대비 인쇄 모드입니다.
- `prefers-reduced-motion` · `prefers-reduced-transparency` · `backdrop-filter` 미지원 브라우저에서는 blur·글로우를 끄고 불투명 바탕으로 떨어집니다.
- 대비는 `node test.js`의 ‘디자인 토큰 C안’ 그룹이 본문·보조·라벨·포인트 글자(다크/라이트 8쌍)를 WCAG 2.2 공식으로 검사합니다.


## 5. 실행

`file://`로 열면 폰트 로딩이 막히는 브라우저가 있어 로컬 서버를 권장합니다.

```bash
cd apps/shorts-video-maker
python3 -m http.server 8080
# http://localhost:8080
```

## 6. 테스트

```bash
node test.js          # 270여 개 단위·파일 위생·보안·디자인 토큰 검사
python3 uitest.py     # 헤드리스 Chrome: 실제 .webm 녹화·다운로드까지 검증
```

`uitest.py`는 앱 폴더를 127.0.0.1로 띄우고, 데스크톱 1440×900과 모바일 390×844에서
외부 요청 0건, 콘솔 에러 0, 가로 넘침 0, 캔버스 프리뷰 재생, 타임라인 재생 헤드,
MediaRecorder Blob 생성, `.webm` EBML 헤더·길이, `.srt` 5블록, PNG 5장, Pro 모달 순서·연결·해제,
AI 대본/이미지 적용, 새로고침 유지, 다크/라이트 대비, 개인정보 페이지를 확인하고 스크린샷 3장을 저장합니다.

## 7. Pro 연결 (선택)

키를 넣지 않아도 앱은 100% 동작합니다. 연결은 반복 작업을 줄이는 선택 기능입니다.

| 순위 | 제공자 | 대본 | 이미지 | 성우 | 기본 모델 |
|---|---|---|---|---|---|
| 1 | OpenAI | ✓ | ✓ | ✓ | `gpt-4.1-mini` / `gpt-image-1` / `tts-1` |
| 2 | Google Gemini | ✓ | ✓ (Imagen) | – | `gemini-2.5-flash` / `imagen-4.0-generate-001` |
| 3 | Anthropic Claude | ✓ | – | – | `claude-sonnet-4-5` |
| 4 | 자체 API 서버 | ✓ | ✓ | ✓ | 직접 지정 |

- 키는 이 탭의 `sessionStorage`에만 저장되고 탭을 닫으면 사라집니다. 앱의 서버는 없습니다.
- 연결 확인은 각 제공자의 모델 목록 엔드포인트를 한 번 호출합니다.
- 일부 제공자는 브라우저 직접 호출(CORS)을 제한합니다. 그때는 자체 프록시 서버(4번)를 쓰세요.
- Claude는 브라우저 직접 호출을 위해 `anthropic-dangerous-direct-browser-access` 헤더를 사용합니다.

### 자체 API 서버 규격

`서버 주소` 아래 세 엔드포인트를 두면 됩니다. 인증이 필요하면 `Authorization: Bearer <키>`가 함께 갑니다.

```
POST {base}/script
  { "prompt": "...", "topic": "...", "tone": "friendly", "platform": "shorts", "model": "..." }
  → { "text": "..." }  또는  { "cuts": [{ "stage": "hook", "headline": "...", "sub": "..." }, ...] }

POST {base}/image
  { "prompt": "...", "size": "1024x1536", "model": "..." }
  → { "imageUrl": "https://..." } 또는 { "b64": "..." } 또는 { "dataUrl": "data:image/png;base64,..." }

POST {base}/tts
  { "text": "...", "voice": "nova", "model": "..." }
  → audio/mpeg 바이너리

GET {base}/health
  → 200 (연결 확인용, 선택)
```

## 8. 보안·개인정보

- 무료 모드에서는 외부 요청이 0건입니다. 폰트·스킨·엔진까지 앱에 포함되어 있습니다.
- 업로드한 사진·영상은 브라우저 메모리와 localStorage에만 남습니다(영상에는 그대로 사용).
- Pro 키는 `sessionStorage`에만. localStorage·쿠키·서버로 보내지 않습니다.
- Pro 요청에는 대본 주제·톤·장면 설명·내레이션 문장만 들어갑니다.
- 자세한 내용은 `privacy.html`.

## 9. 알려진 제한

- **녹화는 실시간입니다.** 27초 영상은 27초 걸립니다. 테스트할 때는 540×960으로 낮추세요.
- MediaRecorder가 만드는 `.webm`은 길이 메타데이터가 비어 있을 수 있습니다(일부 플레이어에서 ∞로 표시). 업로드·재생에는 문제가 없고, 앱은 결과 미리보기에서 길이를 자동 보정합니다. mp4가 꼭 필요하면 편집 앱에서 변환하세요.
- Safari는 WebM 대신 MP4로 녹화될 수 있습니다(파일 확장자 자동 전환).
- 사진을 많이 넣으면 localStorage 용량(약 5MB) 때문에 자동 저장에서 이미지가 빠질 수 있습니다(영상에는 그대로 사용).
- AI가 만든 대본·이미지는 사실 확인과 권리 확인이 필요합니다. `[숫자]` 자리표시는 실제 값으로 바꾸세요.

## 10. 라이선스

- 폰트: IBM Plex Sans KR (SIL Open Font License 1.1)
- 디자인·카피 엔진: `packages/design-ref-engine.js`, `packages/copy-psych-engine.js` (저장소 내부 자산)
- 배경음: Web Audio API로 실시간 합성. 외부 음원을 쓰지 않습니다.
