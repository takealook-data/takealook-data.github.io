---
layout: default
permalink: /insight/
title: "인사이트"
author_profile: true
---

<link rel="stylesheet" href="{{ '/assets/css/insight.css' | relative_url }}">
<script src="{{ '/assets/js/insight.js' | relative_url }}" defer></script>

<div class="insight-wrapper">
  <header class="insight-header">
    <h1 class="insight-title">인사이트 아카이브</h1>
    <p class="insight-subtitle">마케팅 테크(MMP-PA-CRM), 데이터 분석 칼럼, 그리고 실시간 대기업 마케터 채용 정보를 한곳에 집계합니다.</p>
  </header>

  <div class="insight-toolbar">
    <div class="insight-tabs">
      <button class="insight-tab-btn active" data-tab="all">전체</button>
      <button class="insight-tab-btn" data-tab="job">채용공고</button>
      <button class="insight-tab-btn" data-tab="article">아티클</button>
      <button class="insight-tab-btn" data-tab="report">보고서</button>
    </div>
    
    <div class="insight-search-wrapper">
      <svg class="insight-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <input type="text" id="insight-search" class="insight-search-input" placeholder="기업명, 직무, 키워드 검색...">
    </div>
  </div>

  <div class="insight-grid" id="insight-grid">
    <div class="insight-empty">
      <div class="insight-empty-icon">⏳</div>
      <div class="insight-empty-title">아카이브를 로드하고 있습니다</div>
      <p>잠시만 기다려 주세요...</p>
    </div>
  </div>

  <div class="insight-pagination" id="insight-pagination">
    <!-- Rendered dynamically by JS -->
  </div>
</div>
