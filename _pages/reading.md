---
layout: archive
title: "독서"
permalink: /reading/
author_profile: true
---

{% include base_path %}

{% assign reading_posts = site.posts | where_exp: "p", "p.categories contains 'reading'" %}
{% for post in reading_posts %}
  {% include archive-single.html %}
{% endfor %}
