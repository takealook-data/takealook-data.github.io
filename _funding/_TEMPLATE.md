---
# ── 투자유치 사례 클리핑 템플릿 ────────────────────────────
# 파일명: _funding/<company-slug>-<round-slug>.md  (URL: /funding/<파일명>/)
#   같은 회사의 다음 라운드는 새 파일로 — 파일 하나 = 라운드 하나.
# 밑줄로 시작하는 이 파일은 Jekyll이 빌드하지 않는다 (템플릿 전용).
title: "회사명 — 시리즈 A 000억 원"   # 목록·OG 제목
company: "회사명"                     # 필수. 목록 표의 기업 열
company_en: "Company"                 # 선택
round: "시리즈 A"                     # 시드 | 프리 시리즈 A | 시리즈 A | 시리즈 B | ...
amount_eok: 0                         # 억 원 단위 숫자. 비공개면 이 줄을 지운다 (문자열 금지 — 합계 계산에 쓰임)
cumulative_eok: 0                     # 선택. 누적 투자액(억 원)
announced: 2026-01-01                 # 발표(보도)일. 목록 정렬 기준
sector: "AI·데이터 인프라"            # 화면 표시용 분야
founded: 2022                         # 선택
investors_lead:                       # 리드 투자사 (없으면 빈 리스트)
  - 리드투자사
investors:                            # 참여·후속 투자사
  - 투자사A
  - 투자사B
excerpt: "목록 카드와 OG description에 노출되는 1~2문장 요약. 필수."
tags:
  - ai
sources:                              # 필수 — 원문 출처. 최소 1개
  - publisher: "와우테일"
    title: "기사 제목"
    url: "https://example.com/article"
clipped: 2026-01-01                   # 클리핑한 날짜
---

## 한 줄

이 딜을 한 문장으로.

## 딜 구조

- **리드** —
- **참여** —
- **누적** —

## 회사·제품

-

## 메모

내 관점. 왜 이 사례를 아카이빙했는지.
