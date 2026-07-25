---
layout: archive
permalink: /essays/
title: "생각"
author_profile: true
---

{% include base_path %}

{% assign essay_posts = site.posts | where_exp: "p", "p.categories contains 'essay'" %}
{% for post in essay_posts %}
  {% include archive-single.html %}
{% endfor %}
