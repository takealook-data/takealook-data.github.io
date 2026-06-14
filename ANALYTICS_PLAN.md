# 분석·수익화 도입 플랜 — GA4 / Amplitude / Google AdSense

> 작성일: 2026-06-15 · 대상: takealook-data.github.io (Jekyll + GitHub Pages)
> 이 문서는 **추후 적용**을 위한 실행 계획입니다. 실제 키/ID를 받은 시점에 단계대로 적용하세요.
> Jekyll 빌드에서는 제외(`exclude`)되어 사이트에 발행되지 않습니다.

---

## 0. 공통 선결 과제 (가장 먼저)

### 0-1. CSP(Content-Security-Policy) 수정 — **필수, 안 하면 전부 차단됨**
현재 `_includes/head/custom.html`의 CSP는 아래처럼 좁게 설정되어 있어,
GA4(`googletagmanager.com`)·Amplitude·AdSense 도메인이 **모두 차단**됩니다.

현재:
```
script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.google-analytics.com;
connect-src 'self' https://www.google-analytics.com;
```

세 도구를 모두 켤 때 교체할 CSP (한 줄, `content="..."`):
```
default-src 'self';
script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.google-analytics.com https://www.googletagmanager.com https://cdn.amplitude.com https://*.amplitude.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://adservice.google.com https://*.googleadservices.com;
style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
img-src 'self' data: https:;
font-src 'self' data: https://cdn.jsdelivr.net;
connect-src 'self' https://www.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.amplitude.com https://pagead2.googlesyndication.com https://*.googlesyndication.com;
frame-src https://googleads.g.doubleclick.net https://*.googlesyndication.com https://*.google.com;
frame-ancestors 'none';
```
> 각 도구를 단계적으로 켤 거라면, 해당 도구 도메인만 그때그때 추가해도 됩니다.

### 0-2. 동의(consent) 처리
- GA4/AdSense는 EU·한국 개인정보 규정상 **쿠키·맞춤광고 동의 배너**가 권장/필수.
- 세 도구를 한 배너로 게이팅하는 단일 consent 스크립트를 두고,
  동의 전에는 `analytics_storage`/`ad_storage`를 `denied`로 시작 → 동의 시 `granted`로 업데이트 (Google Consent Mode v2).
- 최소 구현: 동의 전에는 Amplitude·AdSense 스크립트를 로드하지 않음.

---

## 1. Google Analytics 4 (GA4)

테마에 **이미 provider가 존재**합니다 (`_includes/analytics-providers/google-analytics-4.html`,
`_includes/analytics.html`의 `case` 분기). 키만 넣고 켜면 됩니다.

### 적용 단계
1. GA4 속성 생성 → **측정 ID** 확보 (형식 `G-XXXXXXXXXX`).
2. `_config.yml`:
   ```yaml
   analytics:
     provider: "google-analytics-4"
     google:
       tracking_id: "G-XXXXXXXXXX"
       anonymize_ip: true
   ```
3. `_layouts/default.html`(또는 footer)에서 `{% include analytics.html %}`가 호출되는지 확인.
   - 없으면 `</body>` 직전에 추가. (Academic Pages 기본 default 레이아웃은 footer에서 호출함)
4. **CSP에 `https://www.googletagmanager.com` 추가** (0-1 참조). ← 이거 빠지면 GA4 안 뜸.
5. 검증: 브라우저 DevTools → Network에서 `gtag/js?id=G-...` 200, GA4 Realtime에 자기 방문 잡히는지.

### 참고
- `page.analytics: false` front-matter로 특정 페이지 추적 제외 가능 (테마 기본 지원).
- SPA가 아니므로 가상 페이지뷰 설정 불필요.

---

## 2. Amplitude

테마에 기본 지원이 **없으므로** 커스텀 include를 추가합니다.

### 적용 단계
1. Amplitude 프로젝트 생성 → **API Key** 확보.
2. 새 파일 `_includes/analytics-providers/amplitude.html`:
   ```html
   {% if site.analytics.amplitude.api_key %}
   <script src="https://cdn.amplitude.com/libs/analytics-browser-2.x-min.js.gz"></script>
   <script src="https://cdn.amplitude.com/libs/plugin-session-replay-browser-1.x-min.js.gz"></script>
   <script>
     window.amplitude.init('{{ site.analytics.amplitude.api_key }}', {
       autocapture: true,            // pageview, click 등 자동 수집
       defaultTracking: { sessions: true, pageViews: true }
     });
   </script>
   {% endif %}
   ```
3. `_includes/analytics.html`의 `case`에 분기 추가:
   ```liquid
   {% when "amplitude" %}
     {% include /analytics-providers/amplitude.html %}
   ```
   - GA4와 **동시 사용**하려면 provider 단일 분기로는 부족 → 아래 "동시 로딩" 참조.
4. `_config.yml`:
   ```yaml
   analytics:
     amplitude:
       api_key: "AMPLITUDE_API_KEY"
   ```
5. **CSP에 `https://*.amplitude.com`, `https://cdn.amplitude.com` 추가** (script-src, connect-src).
6. 검증: Network에서 amplitude SDK 로드, Amplitude 대시보드 실시간 이벤트 확인.

### GA4 + Amplitude 동시 로딩
테마의 `analytics.provider`는 1개만 받습니다. 둘 다 켜려면:
- 방법 A(권장): `_includes/analytics.html`을 수정해 provider 분기와 별개로
  `{% if site.analytics.amplitude.api_key %}{% include .../amplitude.html %}{% endif %}`를 **항상** 호출.
- 방법 B: `footer/custom.html`에 Amplitude 스니펫을 직접 넣고, GA4는 provider로 처리.

---

## 3. Google AdSense

정적 사이트라 표준 절차를 따릅니다. **승인 심사**가 있어 GA4/Amplitude보다 리드타임이 깁니다.

### 사전 조건
- 도메인 소유·콘텐츠 충분(정책상 "가치 있는 콘텐츠" 필요). `github.io` 서브도메인도 승인 사례 있으나
  커스텀 도메인이 승인률·수익에 유리.
- 개인정보처리방침 페이지 필요(쿠키·맞춤광고 고지). `_pages/`에 `privacy.md` 추가 권장.

### 적용 단계
1. AdSense 가입 → **게시자 ID** 확보 (형식 `ca-pub-XXXXXXXXXXXXXXXX`).
2. **ads.txt** 사이트 루트에 추가 → `/ads.txt`로 서빙되어야 함:
   ```
   google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
   ```
   - Jekyll은 루트의 `ads.txt`를 그대로 복사. 루트에 파일 생성만 하면 됨.
3. AdSense 로더 스크립트를 `_includes/head/custom.html`에 추가(심사용 사이트 인증 포함):
   ```html
   {% if site.adsense.publisher_id %}
   <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={{ site.adsense.publisher_id }}" crossorigin="anonymous"></script>
   {% endif %}
   ```
4. `_config.yml`:
   ```yaml
   adsense:
     publisher_id: "ca-pub-XXXXXXXXXXXXXXXX"
   ```
5. 광고 단위 배치 — 재사용 가능한 include `_includes/adsense-unit.html`:
   ```html
   {% if site.adsense.publisher_id %}
   <ins class="adsbygoogle"
        style="display:block"
        data-ad-client="{{ site.adsense.publisher_id }}"
        data-ad-slot="{{ include.slot }}"
        data-ad-format="auto"
        data-full-width-responsive="true"></ins>
   <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
   {% endif %}
   ```
   - 사용: 포스트 레이아웃 본문 중간/하단에 `{% include adsense-unit.html slot="1234567890" %}`.
   - 반응형(`data-ad-format="auto"` + `full-width-responsive`)이라 모바일/데스크톱 자동 대응.
6. **CSP에 `pagead2.googlesyndication.com` 등 추가** + `frame-src`에 doubleclick/googlesyndication (0-1 참조).
   - AdSense는 iframe으로 광고를 띄우므로 `frame-src` 필수. `frame-ancestors 'none'`은 유지 가능.
7. 검증: 심사 승인 후 광고 노출. 승인 전에는 빈 영역/심사용 스크립트만.

### 주의
- `!important` 다수인 현재 `_custom.scss`가 `.adsbygoogle` 영역을 누르지 않도록, 광고 컨테이너는
  별도 클래스로 감싸고 글로벌 규칙 영향 최소화.
- 레이아웃 시프트(CLS) 방지를 위해 광고 슬롯에 `min-height` 지정 권장 → Core Web Vitals·SEO 보호.

---

## 4. 권장 적용 순서 & 일정

| 순서 | 작업 | 선행조건 | 예상 난이도 |
|------|------|----------|------------|
| 1 | CSP 확장(0-1) | — | 낮음 |
| 2 | GA4 켜기(§1) | 측정 ID | 낮음 (provider 존재) |
| 3 | Amplitude(§2) | API Key | 중 (include 신규) |
| 4 | privacy 페이지 + consent 배너(0-2) | — | 중 |
| 5 | AdSense(§3) | 게시자 ID + 심사 승인 | 높음 (리드타임) |

> GA4·Amplitude는 즉시 가능. AdSense는 콘텐츠가 더 쌓이고 privacy/consent가 갖춰진 뒤 신청 권장.

---

## 5. 성능·UX 가드레일
- 모든 분석/광고 스크립트는 `async`/`defer`로 로드 (현재 footer 패턴 유지).
- 외부 스크립트가 늘수록 LCP/INP에 영향 → GA4는 gtag 1개, Amplitude는 autocapture만, AdSense는 지연 로드 고려.
- `prefers-reduced-data` 또는 동의 거부 시 광고/리플레이 비활성화.
- GEO/SEO와 충돌 없음: 분석 스크립트는 `<body>` 끝, 구조화 데이터(JSON-LD)는 `<head>`에서 이미 분리되어 있음.
```
