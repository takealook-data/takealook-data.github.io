#!/usr/bin/env python3
"""
투자유치 기사 클리핑 → _funding/ 사례 노트 변환기 (takealook@data 블로그용)

Obsidian Web Clipper로 저장한 투자 기사 노트를 `_funding/<company>-<round>.md`
사례 노트로 바꾼다. obsidian_to_article.py가 블로그 글을 담당한다면, 이 스크립트는
투자유치 아카이브(/funding/) 전용이다.

하는 일
  1) 클리퍼 front matter(title/source/published/author/description) 읽기
  2) 본문에서 구조화 필드 추출 — 기업명·라운드·투자금액·누적투자·투자사·설립연도
     (한국 투자 기사 표현을 정규식으로 훑는다. 100% 자동은 목표가 아니고,
      비어 있는 칸을 리포트로 알려주면 사람이 채운다)
  3) `_funding/` 컨벤션에 맞는 front matter + 클리핑 골격 본문 생성
  4) 원문은 옮기지 않는다 — 요약·메모만 남기고 sources에 링크를 건다

사용 예:
  python3 markdown_generator/funding_clip_to_note.py \
      --source "~/Obsidian/Clippings/그래파이, 170억원 시리즈A 투자 유치.md" \
      --company 그래파이 --round "시리즈 A" --sector "AI·데이터 인프라" --dry-run

옵션으로 준 값이 항상 이긴다. 안 준 값은 본문에서 추출하고, 그래도 못 찾으면
front matter에 TODO 주석으로 남겨 발행 전에 눈에 띄게 한다.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUNDING_DIR = os.path.join(REPO_ROOT, "_funding")

# 라운드 표기 정규화 — 기사마다 "시리즈A / 시리즈 A / Series A"가 섞인다
ROUND_PATTERNS = [
    (r"프리\s*시리즈\s*([A-Ea-e])", "프리 시리즈 {0}"),
    (r"프리\s*([A-Ea-e])\s*라운드", "프리 시리즈 {0}"),
    (r"시리즈\s*([A-Ea-e])", "시리즈 {0}"),
    (r"[Ss]eries\s*([A-Ea-e])", "시리즈 {0}"),
    (r"(브릿지|브리지)\s*라운드", "브릿지"),
    (r"프리\s*A", "프리 시리즈 A"),
    (r"시드\s*(?:라운드|투자)", "시드"),
    (r"[Ss]eed\s*(?:round|funding)", "시드"),
]

# 금액: "170억 원", "1,340억원", "1조 2000억" 앞뒤 표현을 모두 억 단위 정수로 환산
AMOUNT_RE = re.compile(r"(?:(\d+(?:[,.]\d+)?)\s*조\s*)?(\d{1,5}(?:,\d{3})*(?:\.\d+)?)\s*억\s*원?")
CUMULATIVE_RE = re.compile(r"누적[^.\n]{0,20}?" + AMOUNT_RE.pattern)
FOUNDED_RE = re.compile(r"(\d{4})년\s*(?:\d{1,2}월\s*)?(?:에\s*)?(?:설립|창업)")

# 투자사 이름은 꼬리표로 찾는다 — 한국 VC는 대부분 아래 단어로 끝난다.
# 문장 전체를 잡아 자르는 대신, 문장 안에서 "꼬리표를 가진 토큰"만 집어낸다.
INVESTOR_HINTS = (
    "벤처스", "벤처투자", "인베스트먼트", "인베스트", "파트너스", "캐피탈", "캐피털",
    "자산운용", "창업투자", "창투", "기술투자", "투자파트너스", "PE", "산업은행",
    "투자",  # '지유투자'처럼 꼬리표가 '투자'뿐인 이름 — 일반명사는 STOPWORDS로 걸러낸다
    "Ventures", "Capital", "Partners", "Investment",
)
NAME_RE = re.compile(
    r"[가-힣A-Za-z0-9]*(?:" + "|".join(INVESTOR_HINTS) + r")[가-힣A-Za-z0-9]*")
# 나열 구분자 — "A, B·C 및 D"
SPLIT_INVESTORS_RE = re.compile(r"[,·、]|\s및\s|\s그리고\s|\swith\s")
# '투자'로 시작하는 토큰(투자사·투자자·투자액…)은 이름이 아니라 일반명사다
STOPWORDS = {"투자", "투자사", "투자자", "투자액", "투자금", "투자유치", "투자자로"}
# 조사 꼬리 제거 ("케이투인베스트먼트파트너스가" → "케이투인베스트먼트파트너스").
# 받침 유무로 조사를 가린다 — 그래야 "퓨처플레이"의 '이'를 조사로 오인하지 않는다.
BATCHIM_PARTICLES = {"이": True, "은": True, "을": True, "과": True,   # 앞 글자에 받침 필요
                     "가": False, "는": False, "를": False, "와": False}  # 받침 없어야 함
AMBIGUOUS_PARTICLES = ("도", "의", "에", "로", "께서")


def _has_batchim(ch: str):
    code = ord(ch)
    if not 0xAC00 <= code <= 0xD7A3:
        return None                      # 한글 음절이 아니면 판단 불가
    return (code - 0xAC00) % 28 != 0


def strip_particle(name: str):
    for p in AMBIGUOUS_PARTICLES:
        if name.endswith(p) and len(name) - len(p) >= 3:
            return name[: -len(p)]
    tail = name[-1:]
    if tail in BATCHIM_PARTICLES and len(name) >= 4:
        batchim = _has_batchim(name[-2])
        if batchim is not None and batchim == BATCHIM_PARTICLES[tail]:
            return name[:-1]
    return name
# 투자 행위가 서술된 문장만 훑는다
LEAD_ACTION_RE = re.compile(r"리드|주도|이끌")
JOIN_ACTION_RE = re.compile(r"참여|합류|집행|나섰|투자했|출자")
SENTENCE_SPLIT_RE = re.compile(r"(?<=다\.)\s+|(?<=[.!?])\s+|\n+")

TITLE_NOISE_RE = re.compile(r"\[[^\]]*\]|\([^)]*\)|【[^】]*】")


def first_str(value):
    """클리퍼의 author는 리스트 + [[위키링크]]로 들어온다 — 첫 값만 평문으로."""
    if isinstance(value, list):
        value = value[0] if value else ""
    return re.sub(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", r"\1", str(value)).strip()


def split_front_matter(text: str):
    if text.startswith("---"):
        m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
        if m:
            return m.group(1), m.group(2)
    return "", text


def parse_front_matter(fm_text: str):
    """클리퍼가 쓰는 단순한 최상위 스칼라/리스트만 읽는다 (PyYAML 비의존)."""
    out = {}
    cur = None
    for line in fm_text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = re.match(r"^([A-Za-z_][\w.-]*):\s*(.*)$", line)
        if m:
            key, val = m.group(1), m.group(2).strip()
            if val:
                out[key] = val.strip("\"'")
                cur = None
            else:
                cur = key
                out.setdefault(key, [])
            continue
        m = re.match(r"^\s+-\s+(.+)$", line)
        if m and cur and isinstance(out.get(cur), list):
            out[cur].append(m.group(1).strip().strip("\"'"))
    return out


def to_eok(match: re.Match):
    """AMOUNT_RE 매치를 억 원 단위 정수로. '1조 2000억' → 12000."""
    jo, eok = match.group(1), match.group(2)
    total = 0.0
    if jo:
        total += float(jo.replace(",", "")) * 10000
    total += float(eok.replace(",", ""))
    return int(round(total))


def extract_amount(text: str):
    """본문 첫 금액(보통 이번 라운드 규모)을 억 단위로. 누적 표현은 건너뛴다."""
    for m in AMOUNT_RE.finditer(text):
        head = text[max(0, m.start() - 12):m.start()]
        if "누적" in head:
            continue
        return to_eok(m)
    return None


def extract_cumulative(text: str):
    m = CUMULATIVE_RE.search(text)
    if not m:
        return None
    inner = AMOUNT_RE.search(m.group(0))
    return to_eok(inner) if inner else None


def extract_round(*texts: str):
    """라운드 표기 추출. 제목→설명→본문 순으로 보고, 한 덩이 안에서는
    가장 앞에 나온 표기를 쓴다 (본문 뒤쪽의 '프리 시리즈 A(직전 라운드)'에 끌려가지 않도록)."""
    for text in texts:
        if not text:
            continue
        best = None
        for pattern, label in ROUND_PATTERNS:
            m = re.search(pattern, text)
            if not m:
                continue
            value = label.format(*[g.upper() for g in m.groups() if g]) if m.groups() else label
            if best is None or m.start() < best[0]:
                best = (m.start(), value)
        if best:
            return best[1]
    return None


def clean_investor(name: str):
    name = TITLE_NOISE_RE.sub("", name).strip()
    name = strip_particle(name)
    return name.strip(" ·,.\u2026\"'\u2019\u201d()")


def names_in(sentence: str):
    """문장에서 투자사로 보이는 토큰만 추출."""
    out = []
    for m in NAME_RE.finditer(sentence):
        name = clean_investor(m.group(0))
        if name in STOPWORDS or name.startswith("투자"):
            continue
        if 3 <= len(name) <= 30 and name not in out:
            out.append(name)
    return out


VERB_TAIL_RE = re.compile(r"(다|며|고|서|음|임|중|께)$")


def plausible_neighbor(segment: str):
    """꼬리표 없는 투자사 이름(스프링캠프·퓨처플레이…)을 나열 위치로 건진다.
    이름이 확인된 조각의 바로 옆 조각이면서, 서술어처럼 끝나지 않는 짧은 단일 토큰만 받는다."""
    name = clean_investor(segment.split()[-1] if segment.split() else "")
    if not name or " " in name:
        return None
    if name in STOPWORDS or name.startswith("투자") or VERB_TAIL_RE.search(name):
        return None
    if not (2 <= len(name) <= 14) or name.isdigit():
        return None
    return name


def sentences(text: str):
    return [s for s in SENTENCE_SPLIT_RE.split(text) if s.strip()]


def extract_lead(text: str):
    for sent in sentences(text):
        if LEAD_ACTION_RE.search(sent):
            names = names_in(sent)
            if names:
                return names[:1]
    return []


def extract_investors(text: str, exclude=()):
    found = []

    def add(name):
        if name and name not in found and name not in exclude:
            found.append(name)

    for sent in sentences(text):
        if not JOIN_ACTION_RE.search(sent):
            continue
        segments = SPLIT_INVESTORS_RE.split(sent)
        hits = [i for i, seg in enumerate(segments) if names_in(seg)]
        for i, seg in enumerate(segments):
            for name in names_in(seg):
                add(name)
            # 꼬리표 없는 이름(스프링캠프·퓨처플레이…)은 나열 위치로 건진다.
            # 이름이 확인된 조각 자신의 끝 토큰이거나, 그 옆 조각일 때만.
            if hits and (i in hits or any(abs(i - h) == 1 for h in hits)):
                add(plausible_neighbor(seg))
    return found


def extract_company(text: str, title: str):
    """제목에서 회사명 추정 — 한국 투자 기사 제목은 대개 '회사명, N억 …' 꼴이다."""
    t = TITLE_NOISE_RE.sub("", title).strip()
    m = re.match(r"^\s*['\"‘“]?([^,'\"’”]{2,40})['\"’”]?\s*,", t)
    if m:
        phrase = m.group(1).strip()
        # "푸드테크 기업 이그니스", "피트니스 스타트업 버핏서울" — 수식어가 앞에 붙는다.
        # 한국 기사 제목에서 사명은 마지막 토큰이므로 여러 토큰이면 뒤만 취한다.
        return phrase.split()[-1] if len(phrase.split()) > 1 else phrase
    m = re.search(r"['‘\"“]([^'’\"”]{2,25})['’\"”]\s*(?:은|는|이|가)", text)
    if m:
        return m.group(1).strip()
    return None


def slugify(value: str):
    value = (value or "").strip().lower()
    value = re.sub(r"[^\w가-힣]+", "-", value, flags=re.U)
    return re.sub(r"-{2,}", "-", value).strip("-")


def round_slug(round_label: str):
    if not round_label:
        return "round"
    s = round_label.replace("시리즈 ", "series-").replace("프리 series-", "pre-series-")
    s = s.replace("시드", "seed").replace("브릿지", "bridge")
    return slugify(s)


def yaml_str(s: str):
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


def yaml_list(name: str, values, todo: str = ""):
    if not values:
        return [f"{name}: []" + (f"   # TODO: {todo}" if todo else "")]
    return [f"{name}:"] + [f"  - {v}" for v in values]


def resolve_date(value: str):
    """클리퍼 published/created는 ISO·한국어 표기가 섞여 들어온다."""
    if not value:
        return None
    m = re.search(r"(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})", str(value))
    if m:
        y, mo, d = (int(g) for g in m.groups())
        try:
            return _dt.date(y, mo, d).isoformat()
        except ValueError:
            return None
    return None


def build_note(args, fields):
    fm = ["---", f"title: {yaml_str(fields['title'])}",
          f"company: {yaml_str(fields['company'])}"]
    if args.company_en:
        fm.append(f"company_en: {yaml_str(args.company_en)}")
    fm.append(f"round: {yaml_str(fields['round'])}" if fields["round"]
              else 'round: ""   # TODO: 시드 | 프리 시리즈 A | 시리즈 A | 시리즈 B …')
    if fields["amount_eok"]:
        fm.append(f"amount_eok: {fields['amount_eok']}")
    else:
        fm.append("# amount_eok:   # TODO: 억 원 단위 숫자. 비공개면 이 줄을 지운 채 둔다")
    if fields["cumulative_eok"]:
        fm.append(f"cumulative_eok: {fields['cumulative_eok']}")
    fm.append(f"announced: {fields['announced']}")
    fm.append(f"sector: {yaml_str(args.sector)}" if args.sector
              else 'sector: ""   # TODO: 화면에 그대로 보이는 분야 이름')
    if fields["founded"]:
        fm.append(f"founded: {fields['founded']}")
    fm += yaml_list("investors_lead", fields["investors_lead"], "리드 투자사")
    fm += yaml_list("investors", fields["investors"], "참여·후속 투자사")
    fm.append(f"excerpt: {yaml_str(fields['excerpt'])}" if fields["excerpt"]
              else 'excerpt: ""   # TODO: 목록 카드에 보일 1~2문장')
    fm += yaml_list("tags", [t.strip() for t in (args.tags or "").split(",") if t.strip()],
                    "영문 소문자 케밥")
    fm.append("sources:")
    fm.append(f"  - publisher: {yaml_str(fields['publisher'] or '')}")
    fm.append(f"    title: {yaml_str(fields['source_title'])}")
    fm.append(f"    url: {yaml_str(fields['source_url'])}")
    fm.append(f"clipped: {_dt.date.today().isoformat()}")
    fm.append("---")

    lead = ", ".join(fields["investors_lead"]) or "(확인 필요)"
    others = ", ".join(fields["investors"]) or "(확인 필요)"
    cumulative = f"{fields['cumulative_eok']}억 원" if fields["cumulative_eok"] else "(확인 필요)"
    body = f"""
## 한 줄

{fields['excerpt'] or '이 딜을 한 문장으로.'}

## 딜 구조

- **리드** — {lead}
- **참여** — {others}
- **누적** — {cumulative}

## 회사·제품

-

## 메모

왜 이 사례를 아카이빙했는지, 내 관점으로.
"""
    return "\n".join(fm) + "\n" + body


def main(argv=None):
    ap = argparse.ArgumentParser(description="투자 기사 클리핑 → _funding 사례 노트")
    ap.add_argument("--source", required=True, help="클리핑 노트(.md) 경로")
    ap.add_argument("--company", help="기업명 (기본: 제목에서 추출)")
    ap.add_argument("--company-en", help="영문 사명")
    ap.add_argument("--round", dest="round_label", help='라운드 (예: "시리즈 A")')
    ap.add_argument("--amount", type=int, help="투자금액(억 원 단위 정수)")
    ap.add_argument("--cumulative", type=int, help="누적 투자액(억 원 단위 정수)")
    ap.add_argument("--sector", help='분야 (예: "AI·데이터 인프라")')
    ap.add_argument("--announced", help="발표일 YYYY-MM-DD (기본: 클리퍼 published→파일 수정일)")
    ap.add_argument("--lead", help="쉼표 구분 리드 투자사")
    ap.add_argument("--investors", help="쉼표 구분 참여 투자사")
    ap.add_argument("--tags", help="쉼표 구분 태그")
    ap.add_argument("--slug", help="파일명/URL slug (기본: <기업>-<라운드>)")
    ap.add_argument("--dry-run", action="store_true", help="저장하지 않고 결과만 출력")
    ap.add_argument("--force", action="store_true", help="기존 파일 덮어쓰기")
    args = ap.parse_args(argv)

    source = os.path.expanduser(args.source)
    if not os.path.isfile(source):
        ap.error(f"노트를 찾을 수 없습니다: {source}")

    with open(source, encoding="utf-8") as f:
        raw = f.read()
    fm_text, body = split_front_matter(raw)
    clip = parse_front_matter(fm_text)

    haystack = f"{clip.get('title', '')}\n{clip.get('description', '')}\n{body}"

    company = args.company or extract_company(haystack, clip.get("title", "") or os.path.basename(source))
    round_label = args.round_label or extract_round(
        clip.get("title", ""), clip.get("description", ""), body)
    amount = args.amount or extract_amount(haystack)
    cumulative = args.cumulative or extract_cumulative(haystack)
    founded = None
    m = FOUNDED_RE.search(body)
    if m:
        founded = int(m.group(1))

    lead = [s.strip() for s in args.lead.split(",")] if args.lead else extract_lead(haystack)
    investors = ([s.strip() for s in args.investors.split(",")] if args.investors
                 else extract_investors(haystack, exclude=tuple(lead)))

    announced = (args.announced or resolve_date(clip.get("published"))
                 or resolve_date(clip.get("created"))
                 or _dt.date.fromtimestamp(os.path.getmtime(source)).isoformat())

    amount_label = f"{amount}억 원" if amount else "금액 비공개"
    fields = {
        "title": f"{company or '기업명'} — {round_label or '라운드'} {amount_label}",
        "company": company or "",
        "round": round_label or "",
        "amount_eok": amount,
        "cumulative_eok": cumulative,
        "announced": announced,
        "founded": founded,
        "investors_lead": lead,
        "investors": investors,
        "excerpt": first_str(clip.get("description") or ""),
        "publisher": first_str(clip.get("site") or clip.get("author") or ""),
        "source_title": clip.get("title") or os.path.splitext(os.path.basename(source))[0],
        "source_url": clip.get("source") or clip.get("url") or "",
    }

    note = build_note(args, fields)
    slug = args.slug or f"{slugify(args.company_en or company or 'company')}-{round_slug(round_label)}"
    out_path = os.path.join(FUNDING_DIR, f"{slug}.md")

    print(f"■ 클리핑    : {source}")
    print(f"■ 기업      : {fields['company'] or '(추출 실패)'}")
    print(f"■ 라운드    : {fields['round'] or '(추출 실패)'}")
    print(f"■ 금액      : {amount_label}")
    print(f"■ 누적      : {f'{cumulative}억 원' if cumulative else '(없음)'}")
    print(f"■ 리드      : {', '.join(lead) or '(추출 실패)'}")
    print(f"■ 참여      : {', '.join(investors) or '(추출 실패)'}")
    print(f"■ 발표일    : {announced}")
    print(f"■ 출처      : {fields['source_url'] or '(없음)'}")
    print(f"■ 저장 경로 : {os.path.relpath(out_path, REPO_ROOT)}")
    if not slug.isascii():
        print("⚠ slug에 한글이 들어갔습니다 — URL이 인코딩돼 지저분해집니다. "
              "--slug 또는 --company-en 으로 영문 slug를 지정하세요.")

    todos = [k for k, v in (("기업명", fields["company"]), ("라운드", fields["round"]),
                            ("분야", args.sector), ("출처 URL", fields["source_url"]),
                            ("excerpt", fields["excerpt"])) if not v]
    if todos:
        print(f"⚠ 비어 있는 필드: {', '.join(todos)} — front matter의 TODO를 채우고 발행하세요.")

    if args.dry_run:
        print("\n----- (dry-run) 생성될 노트 -----\n")
        print(note)
        return 0

    if os.path.exists(out_path) and not args.force:
        print(f"\n✗ 이미 존재합니다: {out_path}\n  덮어쓰려면 --force", file=sys.stderr)
        return 1

    os.makedirs(FUNDING_DIR, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(note)
    print(f"\n✓ 저장 완료: {os.path.relpath(out_path, REPO_ROOT)}")
    print("  → /funding/ 아카이브에 노출됩니다. (push 후 1~2분 내 라이브)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
