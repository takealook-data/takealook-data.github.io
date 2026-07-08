# takealook@data

> **데이터를 톺아보는 CSM** — martech 데이터 · B2B SaaS 고객 성공 · AI 자동화를 기록하는 개인 포트폴리오 겸 블로그.

🔗 https://takealook-data.github.io

## 구성

| 섹션 | 소스 | 내용 |
|------|------|------|
| 홈 `/` | `index.html` | 히어로 + 탭형 피드 (hash 기반 SPA) |
| 블로그 | `_posts/` | martech-data · customer-success · ai-automation |
| 생각 `/essays/` | `_essays/` | 회고·에세이 |
| 독서 `/reading/` | `_reading/` | 서평·독서 노트 |
| 포트폴리오 `/portfolio/` | `_portfolio/` | 완결 프로젝트 (문제→접근→결과) |

## 글 쓰기

- front matter 컨벤션: `_drafts/_TEMPLATE.md` 참고
- Obsidian 노트 → 아티클 변환: `markdown_generator/obsidian_to_article.py`
- 초안은 `_drafts/`에 두면 빌드에서 제외됨

## 로컬 프리뷰

```bash
bundle install
bundle exec jekyll serve   # http://localhost:4000
```

Ruby 3.2+에서는 liquid 4.0.3의 `tainted?` 호출 이슈가 있음 — GitHub Pages 원격 빌드는 영향 없음.

## 기반

[academicpages](https://github.com/academicpages/academicpages.github.io) 템플릿을 토스 피드 스타일로 커스터마이징 (`_sass/_custom.scss`). 분석 도구 도입 계획은 `ANALYTICS_PLAN.md` 참고.
