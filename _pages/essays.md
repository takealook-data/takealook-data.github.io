---
layout: archive
permalink: /essays/
title: "생각"
# 독서 라벨을 생각으로 통합(2026-08-30). 기존 /reading/ 링크를 여기로 넘긴다.
redirect_from:
  - /reading/
author_profile: true
---

{% include base_path %}

{% assign essay_posts = site.posts | where_exp: "p", "p.categories contains 'essay'" %}
{% for post in essay_posts %}
  {% include archive-single.html %}
{% endfor %}
