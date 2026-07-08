---
# ── 새 글 front matter 컨벤션 ─────────────────────────────
# 파일 위치별 발행처:
#   _posts/YYYY-MM-DD-slug.md   → 블로그 (permalink 필수)
#   _essays/YYYY-MM-DD-slug.md  → 생각 (URL: /essays/파일명/)
#   _reading/YYYY-MM-DD-slug.md → 독서 (URL: /reading/파일명/)
#   _portfolio/YYYY-MM-DD-slug.md → 포트폴리오 (URL: /portfolio/파일명/)
title: "글 제목"
date: 2026-01-01                # _posts만 필요
permalink: /posts/2026/01/slug/ # _posts만. 앞 슬래시 포함, /posts/:year/:month/:slug/
excerpt: "홈 카드와 OG description에 노출되는 1~2문장 요약. 필수."
categories:                     # _posts만. 주제 축 4개 중 1개
  - martech-data                # martech-data | customer-success | ai-automation | essay
tags:                           # 영문 소문자 케밥케이스
  - example-tag
header:
  teaser: og-default.png        # /images/ 아래 파일명. 글별 이미지 권장
---

본문. layout·author_profile은 _config.yml defaults가 지정하므로 쓰지 않는다.
포트폴리오 글은 "문제 → 접근 → 결과(수치)" 구조를 따른다.
