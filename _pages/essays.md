---
layout: archive
permalink: /essays/
title: "생각"
author_profile: true
---

{% include base_path %}

{% for post in site.publications reversed %}
  {% include archive-single.html %}
{% endfor %}
