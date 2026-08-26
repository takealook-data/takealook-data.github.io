# markdown_generator

블로그 원고·데이터를 마크다운으로 바꾸는 변환기 모음.

| 파일 | 하는 일 |
| --- | --- |
| `obsidian_to_article.py` | Obsidian 노트 → `_posts/` 블로그 아티클 (위키링크·임베드 정리, front matter 생성) |
| `make_sketch_teaser.py` | 글 내용으로 스케치 썸네일 생성 (`obsidian_to_article.py`가 자동 호출) |
| `funding_clip_to_note.py` | 투자 기사 클리핑 → `_funding/` 투자유치 사례 노트 ([문서](funding-archive.md)) |
| `clipper/funding-clipper.json` | Obsidian Web Clipper 템플릿 (투자유치 클리핑용) |

## (참고) 아카데믹페이지 원본 스크립트

These .ipynb files are Jupyter notebook files that convert a TSV containing structured data about talks (`talks.tsv`) or presentations (`presentations.tsv`) into individual markdown files that will be properly formatted for the academicpages template. The notebooks contain a lot of documentation about the process. The .py files are pure python that do the same things if they are executed in a terminal, they just don't have pretty documentation.




