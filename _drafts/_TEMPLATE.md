---
# ── 새 글 front matter 컨벤션 ─────────────────────────────
# 글은 전부 _posts/YYYY-MM-DD-slug.md 한 곳에 둔다 (2026-07 컬렉션 통합).
# 홈 탭은 폴더가 아니라 categories가 정한다. _essays/·_reading/·_portfolio/ 폴더는
# 없으므로 거기에 두면 빌드에서 조용히 빠진다.
#
#   categories: martech-data | customer-success | ai-automation → 블로그
#   categories: essay      → 생각      (URL: /YYYY/MM/slug/)
#   categories: reading    → 독서      (URL: /YYYY/MM/slug/)
#   categories: portfolio  → 포트폴리오 (URL: /YYYY/MM/slug/)
#
# 블로그 글만 permalink를 명시해 /posts/ 접두사를 갖는다. 나머지는 _config.yml
# 기본값(/:year/:month/:title/)을 쓰고, 통합 전 URL은 redirect_from으로 살린다.
title: "글 제목"
date: 2026-01-01                # 블로그 글만. 나머지는 파일명 날짜가 대신한다
permalink: /posts/2026/01/slug/ # 블로그 글만. 앞 슬래시 포함, /posts/:year/:month/:slug/
# redirect_from:                # 블로그 외 컬렉션. 통합 전 URL 유지용
#   - /reading/slug/
#   - /reading/2026-01-01-slug/
excerpt: "홈 카드와 OG description에 노출되는 1~2문장 요약. 필수."
categories:                     # 필수, 1개만
  - martech-data                # martech-data | customer-success | ai-automation | essay | reading | portfolio
tags:                           # 영문 소문자 케밥케이스
  - example-tag
header:
  teaser: og-default.png        # /images/ 아래 파일명. 글별 이미지 권장
# math: true                    # 수식($$) 쓰는 글만 — MathJax 로드
# mermaid: true                 # mermaid 다이어그램 쓰는 글만 — Mermaid 로드
---

본문. layout·author_profile은 _config.yml defaults가 지정하므로 쓰지 않는다.
포트폴리오 글은 "문제 → 접근 → 결과(수치)" 구조를 따른다.
