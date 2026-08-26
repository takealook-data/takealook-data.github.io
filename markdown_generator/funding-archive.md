# 투자유치 아카이브 파이프라인

스타트업 투자유치 사례를 Obsidian으로 클리핑하고, 구조화 노트로 바꿔 `/funding/`에 쌓는 절차.
(데모데이 [Funding Insights](https://demoday.co.kr/funding/insights) 같은 목록을 내 손으로 만드는 것이 목표다.)

```
기사 → [Obsidian Web Clipper] → Clippings/Funding/*.md
     → [funding_clip_to_note.py] → _funding/<company>-<round>.md
     → 사람이 TODO 확인 → git push → /funding/ 라이브
```

## 왜 _posts가 아니라 _funding인가

홈 통합 피드·RSS·앱 푸시 워크플로우는 전부 `site.posts`만 본다.
클리핑을 `_posts`에 넣으면 블로그 피드가 남의 뉴스 요약으로 덮인다.
그래서 `_config.yml`에 `funding` 컬렉션을 따로 두고, 목록은 `/funding/` 한 곳에서만 모은다.

- 컬렉션 폴더: `_funding/`
- URL: `/funding/<파일명>/` (`_config.yml`의 `permalink: /funding/:name/`)
- 목록·필터 페이지: `_pages/funding.html`
- 단일 사례 레이아웃: `_layouts/funding.html`
- 스타일: `_sass/layout/_funding.scss`

## 1. 클리핑 (Obsidian Web Clipper)

`clipper/funding-clipper.json`을 Web Clipper 설정 → Templates → Import 로 불러온다.
투자 기사 사이트(플래텀·와우테일·벤처스퀘어·비석세스 등)에서 자동으로 이 템플릿이 잡히도록
트리거 URL이 들어 있다. 클리핑하면 `Clippings/Funding/`에 이런 노트가 생긴다.

```yaml
---
title: "그래파이, 170억원 시리즈A 투자 유치…누적 투자액 206억원"
source: "https://wowtale.net/2026/08/14/262993/"
site: "와우테일"
published: 2026-08-14
description: "AI 데이터 인프라 기업 그래파이가 170억원 규모의 시리즈A 투자를 유치했다."
company:            # 비워둬도 된다 — 변환기가 채운다
round:
amount_eok:
sector:
---
```

`company`·`round`·`amount_eok`·`sector`는 클리핑할 때 손으로 채워도 되고, 비워두면 변환기가 본문에서 추출한다.

## 2. 변환

```bash
python3 markdown_generator/funding_clip_to_note.py \
    --source "~/Obsidian/Clippings/Funding/2026-08-14 그래파이, 170억원 시리즈A 투자 유치.md" \
    --company-en Graphi \
    --sector "AI·데이터 인프라" \
    --tags ai,data-infra \
    --dry-run
```

`--dry-run`으로 추출 결과를 먼저 확인하고, 맞으면 빼고 다시 실행해 저장한다.

| 옵션 | 없으면 어떻게 되나 |
| --- | --- |
| `--company` | 기사 제목에서 추출 (`"푸드테크 기업 이그니스, …"` → `이그니스`) |
| `--round` | 제목→설명→본문 순으로 첫 라운드 표기를 찾는다 |
| `--amount` | 본문 첫 금액을 억 원 단위로 환산 ('누적' 뒤 금액은 건너뜀) |
| `--cumulative` | `누적 … 000억` 표현을 찾는다 |
| `--lead` / `--investors` | 문장에서 투자사 이름을 추출 (아래 한계 참고) |
| `--announced` | 클리퍼 `published` → `created` → 파일 수정일 |
| `--sector` | 비워둔 채 front matter에 `TODO` 주석을 남긴다 |
| `--slug` | `<영문사명 또는 기업명>-<라운드>`. 한글이 섞이면 경고한다 |

## 3. 사람이 확인할 것

변환기는 **비는 칸을 알려주는 것까지가 일**이다. 저장 전에 리포트에 뜨는 `⚠`를 보고 채운다.

- **투자사 이름** — "벤처스·인베스트먼트·파트너스·캐피탈" 같은 꼬리표로 찾는다.
  꼬리표가 없는 이름(스프링캠프, 퓨처플레이)은 쉼표 나열 위치로만 건지므로 누락될 수 있다.
  기사와 대조해 `investors_lead` / `investors`를 손으로 맞추는 것을 기본으로 여긴다.
- **금액** — "1조 2000억"까지는 환산하지만, 라운드 금액과 밸류에이션이 섞인 기사는 잘못 잡을 수 있다.
- **분야(sector)** — 목록 필터의 값이 된다. 새로 만들기보다 기존 사례의 표기를 재사용한다.
- **본문** — 원문을 옮기지 않는다. `한 줄` / `딜 구조` / `회사·제품` / `메모`만 채우고,
  전문은 `sources`의 링크로 보낸다. 아카이브의 값은 요약과 메모지 복사본이 아니다.

## 4. front matter 필드

`_funding/_TEMPLATE.md`가 항상 최신 기준이다. 요약하면:

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `title` | ✓ | `회사명 — 시리즈 A 000억 원` |
| `company` | ✓ | 목록 표의 기업 열 |
| `company_en` | | 영문 사명 (slug에도 쓰인다) |
| `round` | ✓ | `시드` / `프리 시리즈 A` / `시리즈 A` … 필터 값이 되므로 표기를 통일한다 |
| `amount_eok` | | **억 원 단위 숫자**. 비공개면 필드를 지운다 (문자열을 넣으면 합계가 깨진다) |
| `cumulative_eok` | | 누적 투자액 |
| `announced` | ✓ | 발표(보도)일. 목록 정렬 기준 |
| `sector` | ✓ | 분야. 필터 값 |
| `founded` | | 설립 연도 |
| `investors_lead` / `investors` | | 리드 / 참여·후속 |
| `excerpt` | ✓ | 목록 카드·OG description |
| `tags` | | 영문 소문자 케밥 |
| `sources` | ✓ | `publisher` / `title` / `url`. 최소 1개 — 출처 없는 사례는 올리지 않는다 |
| `clipped` | | 클리핑한 날짜 |

## 5. 확인 후 발행

```bash
bundle exec jekyll build            # 빌드 통과 확인
git add _funding/<새 노트>.md
git commit -m "funding: <회사> <라운드> <금액>"
git push
```

`/funding/`은 검색(기업·투자사·분야)·라운드/분야 필터·최신순/금액순 정렬을 클라이언트에서 처리한다.
새 노트를 추가하면 필터 선택지와 합계 숫자는 자동으로 따라간다.
