#!/usr/bin/env python3
"""
Obsidian 노트 → Jekyll 아티클 변환기 (takealook@data 블로그용)

Obsidian vault의 마크다운 노트를 블로그 아티클로 변환합니다.
  1) Obsidian 전용 문법 처리: [[위키링크]] 해제, ![[이미지]] → images/ 복사 + 경로 치환,
     인라인 #태그, 기존 front matter, 콜아웃 정리
  2) 첫 번째 H1을 front matter의 title로 승격 (본문 H1 중복 제거)
  3) Jekyll front matter 생성 — `_drafts/_TEMPLATE.md` 컨벤션 준수
     - posts: title/date/permalink/excerpt/categories/tags/header.teaser
     - essays·reading·portfolio: title/excerpt/tags/header.teaser (date·permalink·categories 없음)
  4) 컬렉션 폴더에 `YYYY-MM-DD-slug.md` 규칙으로 저장 → 폴더가 곧 홈 화면의 탭

컬렉션(탭) 매핑:
  posts     → "블로그"     (_posts/)
  essays    → "생각"       (_essays/)
  reading   → "독서"       (_reading/)
  portfolio → "포트폴리오" (_portfolio/)

사용 예:
  python3 markdown_generator/obsidian_to_article.py \
      --source "/path/to/Obsidian/3. Resource/AI/google-ai-agent-trends-2026.md" \
      --collection posts \
      --date 2026-06-07 \
      --categories ai-automation \
      --tags ai-agent,trends

옵션 없이 누락된 값은 합리적 기본값으로 채웁니다(제목=H1/파일명, 날짜=파일명 날짜접두사→수정일, slug=파일명).
--dry-run 으로 저장 없이 결과만 미리 봅니다(이미지 복사도 하지 않음).
"""

from __future__ import annotations

import argparse
import datetime as _dt
import os
import re
import shutil
import sys

# 블로그 저장소 루트 (이 스크립트는 markdown_generator/ 안에 있음)
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

COLLECTION_DIRS = {
    "posts": "_posts",
    "essays": "_essays",
    "reading": "_reading",
    "portfolio": "_portfolio",
}
COLLECTION_LABEL = {
    "posts": "블로그",
    "essays": "생각",
    "reading": "독서",
    "portfolio": "포트폴리오",
}

# 이미지 임베드 탐색 대상 vault (--vault로 재지정 가능)
# 경로 하드코딩 금지(PUBLIC 레포) — $OBSIDIAN_VAULT_PATH → Google Drive glob 순으로 탐색
def _default_vault():
    env = os.environ.get("OBSIDIAN_VAULT_PATH", "")
    if env and os.path.isdir(env):
        return env
    import glob
    hits = glob.glob(os.path.expanduser(
        "~/Library/CloudStorage/GoogleDrive-*/내 드라이브/Obsidian"))
    return hits[0] if hits else ""


VAULT_IMAGE_DIRS = ("Attachment", "Images")
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
DEFAULT_TEASER = "og-default.png"


# ---------------------------------------------------------------------------
# 파싱 / 정리 헬퍼
# ---------------------------------------------------------------------------

def split_front_matter(text: str):
    """선행 YAML front matter를 (front_matter_dict_like_text, body)로 분리."""
    if text.startswith("---"):
        m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
        if m:
            return m.group(1), m.group(2)
    return "", text


def extract_h1_title(body: str):
    """본문 첫 H1(`# 제목`)을 찾아 (title, body_without_that_h1) 반환."""
    lines = body.splitlines()
    for i, line in enumerate(lines):
        m = re.match(r"^#\s+(.*\S)\s*$", line)
        if m:
            title = m.group(1).strip()
            del lines[i]
            # H1 바로 뒤 빈 줄 1개 정리
            if i < len(lines) and lines[i].strip() == "":
                del lines[i]
            return title, "\n".join(lines)
    return None, body


def find_embed_file(name: str, source_dir: str, vault_root: str):
    """임베드 파일을 소스 노트 폴더 → vault Attachment/·Images/ 순으로 탐색."""
    direct = os.path.join(source_dir, name)
    if os.path.isfile(direct):
        return direct
    base = os.path.basename(name)
    for sub in VAULT_IMAGE_DIRS:
        root = os.path.join(vault_root, sub)
        if not os.path.isdir(root):
            continue
        for dirpath, _dirs, files in os.walk(root):
            if base in files:
                return os.path.join(dirpath, base)
    return None


def process_embeds(body: str, source_dir: str, vault_root: str):
    """![[파일]] / ![[파일|캡션]] 임베드 처리.
    이미지 → /images/ 경로 마크다운으로 치환하고 복사 목록에 등록,
    비이미지·미발견 → 본문에 [확인 필요] 마커 삽입.
    (본문, [(원본절대경로, 저장파일명)], [미발견 임베드]) 반환."""
    copied: list[tuple[str, str]] = []
    missing: list[str] = []

    def repl(m: re.Match):
        target = m.group(1).strip()
        caption = (m.group(2) or "").strip()
        name = target.split("#")[0].strip()  # ![[파일#헤딩]]의 헤딩 참조 제거
        ext = os.path.splitext(name)[1].lower()
        if ext not in IMAGE_EXTS:
            missing.append(target)
            return f"[임베드 확인 필요: {target}]"
        src = find_embed_file(name, source_dir, vault_root)
        if src is None:
            missing.append(target)
            return f"[이미지 확인 필요: {target}]"
        stem, real_ext = os.path.splitext(os.path.basename(src))
        dest_name = slugify(stem) + real_ext.lower()
        copied.append((src, dest_name))
        return f"![{caption}](/images/{dest_name})"

    body = re.sub(r"!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", repl, body)
    return body, copied, missing


def strip_obsidian_syntax(body: str):
    """Obsidian 전용 문법 정리 (임베드는 process_embeds가 먼저 처리)."""
    # 위키링크: [[Page|alias]] → alias, [[Page]] → Page
    body = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\2", body)
    body = re.sub(r"\[\[([^\]]+)\]\]", r"\1", body)

    # Obsidian 콜아웃 헤더 `> [!note] 제목` → 일반 blockquote `> 제목`
    body = re.sub(r"^(>\s*)\[![a-zA-Z]+\]\s*", r"\1", body, flags=re.M)

    # 인라인 #태그 제거 (헤딩 `# ` 은 보존: 헤딩은 # 뒤에 공백이 있음)
    #  - 줄 시작 또는 공백 뒤의 `#단어`만 매칭, `#` 바로 뒤 글자가 올 때만
    body = re.sub(r"(^|[\s(])#([A-Za-z0-9가-힣_][A-Za-z0-9가-힣_/-]*)", r"\1", body, flags=re.M)

    body = ensure_blank_line_before_tables(body)

    # 3개 이상 연속 빈 줄 → 2개로
    body = re.sub(r"\n{3,}", "\n\n", body)
    return body.strip() + "\n"


def ensure_blank_line_before_tables(body: str):
    """kramdown은 표(블록 요소) 앞에 빈 줄을 요구한다. Obsidian은 관대해서
    `### 제목` 바로 다음 줄에 표를 써도 되지만 Jekyll에선 표가 깨진다.
    표 블록 시작(`|`로 시작하는 줄) 앞이 비어있지 않으면 빈 줄을 삽입한다."""
    lines = body.splitlines()
    out = []
    for i, line in enumerate(lines):
        is_table_row = line.lstrip().startswith("|")
        prev = out[-1] if out else ""
        prev_is_table = prev.lstrip().startswith("|")
        if is_table_row and not prev_is_table and prev.strip() != "":
            out.append("")  # 표 앞 빈 줄 보정
        out.append(line)
    return "\n".join(out)


def make_excerpt(body: str, limit: int = 160):
    """첫 일반 문단(헤딩/blockquote/표/리스트 제외)에서 excerpt 생성."""
    for para in re.split(r"\n\s*\n", body):
        p = para.strip()
        if not p:
            continue
        # 헤딩/인용/표/리스트/구분선/코드블록은 본문 요약감이 아님 → 건너뜀
        if p.startswith(("#", ">", "|", "-", "*", "```")):
            continue
        if re.match(r"^\d+[.)]\s", p):  # 번호 목록 항목 (1. 2. 3) ...)
            continue
        p = re.sub(r"\s+", " ", p)
        p = re.sub(r"[*_`]", "", p)  # 강조 마크 제거
        if len(p) > limit:
            p = p[:limit].rstrip() + "…"
        return p
    return ""


def slugify(value: str):
    """제목/파일명을 URL slug로. 영문/숫자는 유지, 그 외는 하이픈."""
    value = value.strip().lower()
    value = re.sub(r"[^\w가-힣]+", "-", value, flags=re.U)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value or "article"


def resolve_date(args, source: str):
    """날짜 결정: --date > 파일명 날짜접두사 > 파일 수정일."""
    if args.date:
        return args.date
    base = os.path.basename(source)
    m = re.match(r"(\d{4}-\d{2}-\d{2})", base)
    if m:
        return m.group(1)
    mtime = os.path.getmtime(source)
    return _dt.date.fromtimestamp(mtime).isoformat()


def resolve_slug(args, source: str, title: str):
    """slug 결정: --slug > 파일명(날짜접두사 제거) > 제목."""
    if args.slug:
        return slugify(args.slug)
    base = os.path.splitext(os.path.basename(source))[0]
    base = re.sub(r"^\d{4}-\d{2}-\d{2}-?", "", base)  # 날짜 접두사 제거
    base = base.strip()
    if base and re.search(r"[A-Za-z0-9]", base):
        return slugify(base)
    return slugify(title or base)


def yaml_str(s: str):
    """YAML 안전 문자열(쌍따옴표 이스케이프)."""
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def build_front_matter(args, title, date, excerpt, collection, slug, teaser):
    """_drafts/_TEMPLATE.md 컨벤션: posts만 date·permalink·categories,
    나머지 컬렉션은 title/excerpt/tags/header.teaser만."""
    fm = ["---", f"title: {yaml_str(title)}"]
    if collection == "posts":
        fm.append(f"date: {date}")
        y, m, _d = date.split("-")
        fm.append(f"permalink: /posts/{y}/{m}/{slug}/")  # 앞 슬래시 필수
    if excerpt:
        fm.append(f"excerpt: {yaml_str(excerpt)}")
    if collection == "posts" and args.categories:
        cats = [c.strip() for c in args.categories.split(",") if c.strip()]
        fm.append("categories:")
        fm += [f"  - {c}" for c in cats[:1]]  # 4축 중 1개만
    if args.tags:
        tags = [t.strip() for t in args.tags.split(",") if t.strip()]
        fm.append("tags:")
        fm += [f"  - {t}" for t in tags]
    fm.append("header:")
    fm.append(f"  teaser: {teaser}")
    fm.append("---")
    return "\n".join(fm)


# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------

def main(argv=None):
    ap = argparse.ArgumentParser(description="Obsidian 노트 → Jekyll 아티클 변환기")
    ap.add_argument("--source", required=True, help="Obsidian 노트(.md) 경로")
    ap.add_argument("--collection", default="posts", choices=list(COLLECTION_DIRS),
                    help="대상 컬렉션(탭). 기본 posts(블로그)")
    ap.add_argument("--title", help="제목 직접 지정 (기본: 본문 H1 또는 파일명)")
    ap.add_argument("--date", help="발행일 YYYY-MM-DD (기본: 파일명 날짜→수정일)")
    ap.add_argument("--slug", help="URL slug (기본: 파일명→제목)")
    ap.add_argument("--excerpt", help="카드/목록에 보일 요약 직접 지정 (기본: 첫 문단 자동 추출)")
    ap.add_argument("--teaser", help="카드 썸네일 이미지 파일명 (/images/ 기준, 기본: 첫 임베드 이미지→og-default.png)")
    ap.add_argument("--categories", help="쉼표 구분 카테고리 (posts만, 첫 1개만 사용 — 4축: martech-data|customer-success|ai-automation|essay)")
    ap.add_argument("--tags", help="쉼표 구분 태그 (영문 소문자 케밥)")
    ap.add_argument("--vault", default=_default_vault(),
                    help="이미지 임베드를 탐색할 Obsidian vault 루트 (기본: $OBSIDIAN_VAULT_PATH)")
    ap.add_argument("--dry-run", action="store_true", help="저장하지 않고 결과만 출력 (이미지 복사 안 함)")
    ap.add_argument("--force", action="store_true", help="기존 파일 덮어쓰기 허용")
    args = ap.parse_args(argv)

    if not os.path.isfile(args.source):
        ap.error(f"노트를 찾을 수 없습니다: {args.source}")

    with open(args.source, encoding="utf-8") as f:
        raw = f.read()

    _fm, body = split_front_matter(raw)
    h1_title, body = extract_h1_title(body)
    source_dir = os.path.dirname(os.path.abspath(args.source))
    body, copied, missing = process_embeds(body, source_dir, args.vault)
    body = strip_obsidian_syntax(body)

    title = args.title or h1_title or \
        re.sub(r"^\d{4}-\d{2}-\d{2}-?", "", os.path.splitext(os.path.basename(args.source))[0])
    date = resolve_date(args, args.source)
    slug = resolve_slug(args, args.source, title)
    excerpt = args.excerpt or make_excerpt(body)
    teaser = args.teaser or (copied[0][1] if copied else DEFAULT_TEASER)

    front_matter = build_front_matter(args, title, date, excerpt, args.collection, slug, teaser)
    article = front_matter + "\n\n" + body

    out_dir = os.path.join(REPO_ROOT, COLLECTION_DIRS[args.collection])
    out_name = f"{date}-{slug}.md"
    out_path = os.path.join(out_dir, out_name)

    # 리포트 출력
    print(f"■ 대상 노트 : {args.source}")
    print(f"■ 컬렉션(탭): {args.collection} ({COLLECTION_LABEL[args.collection]})")
    print(f"■ 제목      : {title}")
    print(f"■ 날짜      : {date}")
    print(f"■ slug      : {slug}")
    print(f"■ excerpt   : {excerpt}")
    print(f"■ teaser    : {teaser}")
    print(f"■ 저장 경로 : {os.path.relpath(out_path, REPO_ROOT)}")
    if not excerpt:
        print("⚠ excerpt가 비어 있습니다 — 홈 카드·meta description에 필수. --excerpt로 지정하세요.")
    if args.collection == "posts" and not args.categories:
        print("⚠ categories 미지정 — posts는 4축 중 1개 지정 권장 (martech-data|customer-success|ai-automation|essay)")
    for src, dest in copied:
        print(f"■ 이미지 복사 예정: {src} → images/{dest}")
    for e in missing:
        print(f"⚠ 임베드를 찾지 못해 본문에 [확인 필요] 마커를 넣었습니다: ![[{e}]]")

    if args.dry_run:
        print("\n----- (dry-run) 생성될 아티클 미리보기 -----\n")
        print(article)
        return 0

    if os.path.exists(out_path) and not args.force:
        print(f"\n✗ 이미 존재합니다: {out_path}\n  덮어쓰려면 --force", file=sys.stderr)
        return 1

    images_dir = os.path.join(REPO_ROOT, "images")
    for src, dest in copied:
        dest_path = os.path.join(images_dir, dest)
        if os.path.exists(dest_path):
            print(f"  이미 존재해 재사용: images/{dest}")
            continue
        shutil.copy2(src, dest_path)
        print(f"✓ 이미지 복사: images/{dest}")

    os.makedirs(out_dir, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(article)
    print(f"\n✓ 저장 완료: {os.path.relpath(out_path, REPO_ROOT)}")
    print(f"  → 홈 화면 '{COLLECTION_LABEL[args.collection]}' 탭에 노출됩니다. (push 후 1~2분 내 라이브)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
