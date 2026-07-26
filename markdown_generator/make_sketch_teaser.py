#!/usr/bin/env python3
"""아티클 2D 라이트모드 카드 썸네일 생성기 (takealook@data 전용).

사용: python3 markdown_generator/make_sketch_teaser.py --slug lean-analytics \
          [--tags metrics,lean] [--title "제목"] [--outdir images]
출력: images/sketch-<slug>.png (1200x630 PNG)

teaser는 og:image·JSON-LD 이미지로 쓰이므로 1200x630 PNG 래스터 형식입니다.
Pillow가 없으면 .venv-teaser/를 만들어 자동 설치 후 재실행합니다.
"""
import os, pathlib, subprocess, sys

def _bootstrap():
    try:
        import PIL  # noqa: F401
        return
    except ImportError:
        pass
    root = pathlib.Path(__file__).resolve().parent.parent
    venv = root / ".venv-teaser"
    py = venv / "bin" / "python"
    if not py.exists():
        print("[teaser] Pillow 없음 -> .venv-teaser 생성", file=sys.stderr)
        subprocess.run([sys.executable, "-m", "venv", str(venv)], check=True)
        subprocess.run([str(venv / "bin" / "pip"), "install", "-q", "Pillow"], check=True)
    os.execv(str(py), [str(py), os.path.abspath(__file__)] + sys.argv[1:])

_bootstrap()

import hashlib, math, random, re
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630

# Colors (Light Mode Palette)
BG_COLOR       = (248, 250, 252)   # #F8FAFC (Slate 50)
BORDER_COLOR   = (226, 232, 240)   # #E2E8F0 (Slate 200)
TITLE_COLOR    = (15, 23, 42)      # #0F172A (Slate 900)
SUBTITLE_COLOR = (100, 116, 139)   # #64748B (Slate 500)
ACCENT_PRIMARY = (14, 165, 233)    # #0EA5E9 (Sky 500)
ACCENT_SECONDARY=(99, 102, 241)    # #6366F1 (Indigo 500)
BADGE_BG       = (224, 242, 254)   # #E0F2FE (Sky 100)
BADGE_TEXT     = (3, 105, 161)     # #0369A1 (Sky 700)

def get_fonts():
    font_paths = [
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf"
    ]
    for path in font_paths:
        if os.path.exists(path):
            try:
                title_font = ImageFont.truetype(path, 42, index=4 if path.endswith(".ttc") else 0)
                badge_font = ImageFont.truetype(path, 22, index=5 if path.endswith(".ttc") else 0)
                brand_font = ImageFont.truetype(path, 24, index=3 if path.endswith(".ttc") else 0)
                return title_font, badge_font, brand_font
            except Exception:
                try:
                    title_font = ImageFont.truetype(path, 42)
                    badge_font = ImageFont.truetype(path, 22)
                    brand_font = ImageFont.truetype(path, 24)
                    return title_font, badge_font, brand_font
                except Exception:
                    continue
    def_font = ImageFont.load_default()
    return def_font, def_font, def_font

# ---- 2D Clean Vector Motifs ----
def draw_bars_2d(dr):
    cx, cy = 940, 315
    base_y = cy + 120
    widths = 44
    heights = [110, 170, 230]
    xs = [cx - 100, cx - 20, cx + 60]
    colors = [(186, 230, 253), (56, 189, 248), (14, 165, 233)]
    for x, h, col in zip(xs, heights, colors):
        dr.rounded_rectangle([x, base_y - h, x + widths, base_y], radius=6, fill=col)
    dr.line([(cx - 130, base_y), (cx + 130, base_y)], fill=(148, 163, 184), width=3)

def draw_funnel_2d(dr):
    cx, cy = 940, 315
    dr.polygon([(cx-120, cy-110), (cx+120, cy-110), (cx+80, cy-30), (cx-80, cy-30)], fill=(56, 189, 248))
    dr.polygon([(cx-76, cy-24), (cx+76, cy-24), (cx+44, cy+50), (cx-44, cy+50)], fill=(14, 165, 233))
    dr.polygon([(cx-40, cy+56), (cx+40, cy+56), (cx+40, cy+130), (cx-40, cy+130)], fill=(3, 105, 161))

def draw_venn_2d(dr):
    cx, cy = 940, 315
    r = 100
    dr.ellipse([cx - 120, cy - r, cx - 120 + 2*r, cy + r], outline=(14, 165, 233), width=8)
    dr.ellipse([cx + 120 - 2*r, cy - r, cx + 120, cy + r], outline=(99, 102, 241), width=8)

def draw_one_2d(dr):
    cx, cy = 940, 315
    dr.ellipse([cx - 110, cy - 110, cx + 110, cy + 110], outline=(186, 230, 253), width=6)
    dr.ellipse([cx - 70, cy - 70, cx + 70, cy + 70], outline=(56, 189, 248), width=8)
    dr.ellipse([cx - 30, cy - 30, cx + 30, cy + 30], fill=(14, 165, 233))

def draw_matrix_2d(dr):
    cx, cy = 940, 315
    size = 64
    gap = 12
    x0, y0 = cx - size - gap//2, cy - size - gap//2
    for r in range(2):
        for c in range(2):
            x = x0 + c * (size + gap)
            y = y0 + r * (size + gap)
            col = (14, 165, 233) if (r==0 and c==1) else (226, 232, 240)
            dr.rounded_rectangle([x, y, x + size, y + size], radius=8, fill=col)

def draw_nodes_2d(dr):
    cx, cy = 940, 315
    R = 105
    sats = [(cx + R * math.cos(a), cy + R * math.sin(a)) for a in [0, math.pi*2/5, math.pi*4/5, math.pi*6/5, math.pi*8/5]]
    for sx, sy in sats:
        dr.line([(cx, cy), (sx, sy)], fill=(148, 163, 184), width=4)
        dr.ellipse([sx - 18, sy - 18, sx + 18, sy + 18], fill=(56, 189, 248))
    dr.ellipse([cx - 32, cy - 32, cx + 32, cy + 32], fill=(14, 165, 233))

MOTIFS = {
    "bars": draw_bars_2d,
    "funnel": draw_funnel_2d,
    "venn": draw_venn_2d,
    "one": draw_one_2d,
    "matrix": draw_matrix_2d,
    "nodes": draw_nodes_2d
}

KEYWORDS = {
    "bars":   ["metric", "지표", "analytics", "measure", "kpi", "lean", "ga4", "amplitude", "측정", "대시보드"],
    "funnel": ["funnel", "퍼널", "conversion", "전환", "retention", "리텐션", "유입", "온보딩"],
    "venn":   ["integration", "연동", "통합", "crm", "identity", "매핑"],
    "one":    ["omtm", "focus", "단 하나", "하나만", "원포인트"],
    "matrix": ["matrix", "매트릭스", "framework", "프레임워크", "단계", "stage", "체크리스트"],
    "nodes":  ["ai", "agent", "에이전트", "llm", "automation", "자동화", "workflow", "워크플로", "network",
               "seo", "geo", "검색엔진", "색인", "크롤러", "크롤링", "indexnow", "sitemap", "rss", "피드"],
}

def _hit(k, hay):
    if re.fullmatch(r"[a-z0-9]+", k):
        return re.search(r"(?<![a-z0-9])" + re.escape(k) + r"(?![a-z0-9])", hay) is not None
    return k in hay

def pick(slug, tags, title, text=""):
    strong = " ".join([slug, " ".join(tags or []), title or ""]).lower()
    weak = (text or "").lower()
    best, score = None, 0
    for m, kws in KEYWORDS.items():
        s = sum(2 for k in kws if _hit(k, strong)) + sum(1 for k in kws if _hit(k, weak))
        if s > score: best, score = m, s
    if best: return best
    h = int(hashlib.sha256(slug.encode()).hexdigest(), 16)
    return sorted(MOTIFS)[h % len(MOTIFS)]

def wrap_text(text, font, max_width, dr):
    lines = []
    paragraphs = text.split("\n")
    for para in paragraphs:
        words = para.split()
        if not words:
            continue
        curr = ""
        for w in words:
            test_str = (curr + " " + w).strip()
            bbox = dr.textbbox((0, 0), test_str, font=font)
            if bbox[2] - bbox[0] <= max_width:
                curr = test_str
            else:
                if curr:
                    lines.append(curr)
                curr = w
        if curr:
            lines.append(curr)
    return lines[:3]  # Max 3 lines

def generate(slug, out, tags=None, title="", motif=None, text=""):
    img = Image.new("RGB", (W, H), BG_COLOR)
    dr = ImageDraw.Draw(img)
    
    # Outer Border
    dr.rectangle([0, 0, W-1, H-1], outline=BORDER_COLOR, width=1)
    
    # Left Accent Bar
    dr.rectangle([0, 0, 10, H], fill=ACCENT_PRIMARY)
    
    # Fonts
    title_font, badge_font, brand_font = get_fonts()
    
    # Badge (Category / Tag)
    badge_str = (tags[0].upper() if tags else "DATA & TECH").replace("-", " ")
    bbox = dr.textbbox((0, 0), badge_str, font=badge_font)
    bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    px, py = 80, 90
    dr.rounded_rectangle([px, py, px + bw + 24, py + bh + 16], radius=6, fill=BADGE_BG)
    dr.text((px + 12, py + 8), badge_str, fill=BADGE_TEXT, font=badge_font)
    
    # Title
    disp_title = title or slug.replace("-", " ").title()
    title_lines = wrap_text(disp_title, title_font, 660, dr)
    
    ty = 185
    for line in title_lines:
        dr.text((80, ty), line, fill=TITLE_COLOR, font=title_font)
        ty += 58
        
    # Brand Footnote
    dr.text((80, 525), "takealook@data  ·  cs & marketing analytics", fill=SUBTITLE_COLOR, font=brand_font)
    
    # Vertical Divider Line
    dr.line([(780, 100), (780, 530)], fill=BORDER_COLOR, width=2)
    
    # Draw Motif Graphic
    name = motif or pick(slug, tags, title, text)
    MOTIFS[name](dr)
    
    img.save(out, "PNG", optimize=True)
    return name

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    ap.add_argument("--tags", default="")
    ap.add_argument("--title", default="")
    ap.add_argument("--text", default="", help="excerpt·본문 등 추가 매칭 텍스트")
    ap.add_argument("--outdir", default="images")
    ap.add_argument("--motif", choices=sorted(MOTIFS), help="자동 선택 대신 강제 지정")
    a = ap.parse_args()
    out = pathlib.Path(a.outdir) / ("sketch-" + a.slug + ".png")
    out.parent.mkdir(parents=True, exist_ok=True)
    name = generate(a.slug, str(out), tags=[t for t in a.tags.split(",") if t],
                    title=a.title, motif=a.motif, text=a.text)
    print(str(out) + "\t" + name)
