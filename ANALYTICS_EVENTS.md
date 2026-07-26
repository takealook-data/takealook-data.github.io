# 이벤트 정의서 (Amplitude)

> 최초 작성: 2026-07-27 · 대상: takealook-data.github.io
> Amplitude project `takealook-data` (appId **841024**)
> Jekyll `exclude` 대상이라 사이트에 발행되지 않습니다.
>
> 도입 배경과 설치 절차는 `ANALYTICS_PLAN.md`(2026-06-15) 참조. 이 문서는 **무엇을 어떤 이름으로 보내는가**만 다룹니다.

---

## 설계 원칙

**autocapture가 이미 켜져 있다** — `pageViews`·`sessions`·`elementInteractions`·`formInteractions`·`networkTracking`·`webVitals`·`frustrationInteractions`·`fileDownloads`·`attribution` 전부. 클릭·폼·에러는 손대지 않아도 수집됩니다.

그래서 커스텀 이벤트는 두 경우로만 만듭니다.

1. **autocapture가 원리적으로 못 잡는 것** — 스크롤 뎁스, 활성 체류 시간, 검색 결과 수
2. **잡히긴 하지만 이름이 무의미해 차트를 만들 수 없는 것** — `Element Clicked` + DOM 셀렉터로는 "공유 버튼 클릭"을 집계할 수 없음

이 두 가지에 해당하지 않으면 **이벤트를 새로 만들지 않습니다.** autocapture 이벤트에 프로퍼티를 붙이는 쪽이 항상 낫습니다.

## 명명 규칙

- `snake_case`, `<객체>_<동사 과거형>` (`article_scroll_depth`, `post_action_clicked`)
- `[Amplitude]` 프리픽스는 autocapture 예약어이므로 사용 금지
- 프로퍼티도 `snake_case`. 단위가 있으면 이름에 포함 (`engaged_seconds`, `depth_pct`)

---

## 공통 프로퍼티 (모든 이벤트에 자동 부착)

`_includes/analytics-context.html`의 enrichment plugin이 **autocapture 이벤트를 포함한 모든 이벤트**에 아래를 병합합니다. 이벤트 고유 프로퍼티가 이름이 겹치면 그쪽이 우선합니다.

| 프로퍼티 | 타입 | 값 | 비고 |
|---|---|---|---|
| `page_type` | string | `post` / `home` / 레이아웃명 | `page.date`가 있으면 `post` |
| `page_path` | string | `page.url` | |
| `post_title` | string | 글 제목 | 글에서만 |
| `post_category` | string | `_data/categories.yml`의 slug | 글에서만. `martech-data`·`customer-success`·`ai-automation`·`essay`·`reading`·`portfolio` |
| `post_tags` | string[] | 태그 배열 | 글에서만 |
| `post_published_at` | string | `YYYY-MM-DD` | 글에서만 |
| `post_word_count` | number | 본문 어절 수 | 글에서만. Liquid `number_of_words` — 한글은 어절 기준이라 영문 단어 수와 직접 비교 불가 |
| `post_read_minutes` | number | 예상 읽기 분 | 글에서만. `word_count / 160 + 1` |

> ⚠ **plugin은 `amplitude.init()` 앞에서 등록해야 합니다.** `init()` 호출 시점에 autocapture pageView가 곧바로 발사되므로, 나중에 등록하면 가장 중요한 첫 이벤트에 컨텍스트가 빠집니다. `_includes/head/custom.html`의 include 순서를 바꾸지 마세요.

---

## 커스텀 이벤트

### `article_scroll_depth`
글 본문을 얼마나 내려 읽었는지. **파일**: `_includes/analytics-events.html`

- **트리거**: 본문(`.page__content`) 기준 25 / 50 / 75 / 100% 최초 도달 시 각 1회
- **프로퍼티**: `depth_pct` (number, 25·50·75·100)
- 페이지당 최대 4회. 뒤로 스크롤해도 재발생하지 않음

### `article_read_complete`
훑고 지나간 것이 아니라 실제로 읽었는지. **파일**: `_includes/analytics-events.html`

- **트리거**: 스크롤 90% 이상 **AND** 활성 체류가 예상 읽기시간의 50% 이상. 페이지당 1회
- **프로퍼티**: `engaged_seconds` (number), `scroll_pct` (number)
- 두 조건을 AND로 건 이유: 스크롤만으로는 "끝까지 튕겨 내린 것"과 구분되지 않음

### `article_engaged_time`
탭이 실제로 보인 시간만 누적. **파일**: `_includes/analytics-events.html`

- **트리거**: `visibilitychange`(hidden) 또는 `pagehide`
- **프로퍼티**: `engaged_seconds` (number, **직전 전송 이후의 델타**), `scroll_pct` (number)
- **페이지당 여러 번 발생하는 것이 정상입니다.** 탭을 전환할 때마다 델타가 나갑니다 → 총 체류시간은 Amplitude에서 **SUM**으로 집계하세요. AVG는 무의미합니다
- 1초 미만 델타는 보내지 않음

### `blog_search_performed`
사이드바 검색. **파일**: `_includes/blog-sidebar.html`

- **트리거**: 검색 입력 후 800ms 디바운스
- **프로퍼티**: `query_length` (number), `result_count` (number)
- **검색어 원문은 보내지 않습니다** — 개인정보가 섞일 수 있어 길이만 남깁니다. 이 방침을 바꾸지 마세요
- `result_count: 0`이 잦은 구간 = 콘텐츠 공백 신호

### `post_action_clicked`
좋아요 / 댓글 / 공유 버튼. **파일**: `_includes/post-actions.html`

- **프로퍼티**: `action` (string: `like` · `comment` · `share`), `share_method` (string: `webshare` · `clipboard`, share일 때만)
- autocapture로도 잡히지만 `Element Clicked` + 셀렉터라 집계 불가해서 이름을 붙임

### `theme_toggled`
다크/라이트 전환. **파일**: `assets/js/_main.js`

- **프로퍼티**: `to_theme` (string: `dark` · `light`)
- ⚠ **`_main.js`를 고치면 `npm run build:js`로 `assets/js/main.min.js`를 재생성해야 합니다.** 사이트가 로드하는 것은 min 파일입니다

---

## 코드 수정 시 제약

- **인라인 `<script>`에 `//` 줄 주석 금지.** `compress_html`이 production 빌드에서 한 줄로 압축해 이후 코드 전체가 주석 처리됩니다 — 라이브 전체 JS가 죽은 이력이 있습니다. `/* */`만 사용
- **`window.amplitude` 존재 확인 후 호출.** SDK 로더가 실패해도 사이트 JS가 죽으면 안 됩니다. 모든 호출은 `try/catch`로 감쌉니다
- **CSP 수정 불필요.** `connect-src`에 `https://*.amplitude.com`이 이미 있습니다
- **PII 금지.** 이 레포는 **PUBLIC**입니다. 검색어 원문·이메일·전화번호를 프로퍼티에 넣지 마세요

## 도입하지 않은 것

**Ampli CLI (`@amplitude/ampli`)** — 이 스택에 맞지 않습니다. `package.json`은 테마의 jQuery uglify 스크립트뿐이라 TypeScript도 번들러도 없고, Amplitude SDK도 npm이 아닌 CDN 로더(`cdn.amplitude.com/script/<key>.js`)입니다. Ampli가 생성하는 타입 안전 래퍼를 `import`할 방법이 없습니다. 이벤트 6종 규모에서는 이 문서로 충분합니다.
