#!/usr/bin/env python3
"""아티클 스케치 썸네일 생성기 (크림 종이 + 목탄 선).

사용: python3 markdown_generator/make_sketch_teaser.py --slug lean-analytics \
          [--tags metrics,lean] [--title "제목"] [--outdir images]
출력: images/sketch-<slug>.png (1024x576 PNG)

teaser는 og:image·JSON-LD 이미지로도 쓰이므로 반드시 래스터(PNG)여야 한다.
Pillow가 없으면 .venv-teaser/를 만들어 자동 설치 후 재실행한다.
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

import pathlib
import hashlib, math, random, re
from PIL import Image, ImageDraw, ImageFilter

W, H = 1024, 576
PAPER = (243, 235, 217)
INK   = (46, 42, 38)

def paper(rnd):
    img = Image.new("RGB", (W, H), PAPER)
    px = img.load()
    for _ in range(W * H // 6):                     # 종이 결
        x, y = rnd.randrange(W), rnd.randrange(H)
        d = rnd.randint(-9, 9)
        r, g, b = px[x, y]
        px[x, y] = (max(0,min(255,r+d)), max(0,min(255,g+d)), max(0,min(255,b+d)))
    return img.filter(ImageFilter.SMOOTH)

def stroke(dr, pts, rnd, w=12, passes=6, jit=1.7):
    """목탄 느낌: 여러 번 겹쳐 긋고 가장자리에 가루를 뿌린다."""
    for p in range(passes):
        prev = None
        for (x, y) in pts:
            jx = x + rnd.uniform(-jit, jit) + p * rnd.uniform(-0.8, 0.8)
            jy = y + rnd.uniform(-jit, jit) + p * rnd.uniform(-0.8, 0.8)
            if prev:
                lw = max(2, int(w * rnd.uniform(0.62, 1.05)))
                a = rnd.randint(165, 255)
                dr.line([prev, (jx, jy)], fill=INK + (a,), width=lw)
            prev = (jx, jy)
    for (x, y) in pts[::3]:                          # 가루
        for _ in range(rnd.randint(1, 5)):
            dx, dy = rnd.uniform(-w, w), rnd.uniform(-w, w)
            dr.point((x+dx, y+dy), fill=INK + (rnd.randint(60, 150),))

def line(a, b, n=26):
    return [(a[0]+(b[0]-a[0])*i/n, a[1]+(b[1]-a[1])*i/n) for i in range(n+1)]

def rect(x, y, w, h):
    return line((x,y),(x+w,y)) + line((x+w,y),(x+w,y+h)) + line((x+w,y+h),(x,y+h)) + line((x,y+h),(x,y))

def circle(cx, cy, r, n=72, a0=0, a1=2*math.pi):
    return [(cx+r*math.cos(a0+(a1-a0)*i/n), cy+r*math.sin(a0+(a1-a0)*i/n)) for i in range(n+1)]

# ---- 모티프 ----
def m_bars(dr, rnd):
    base, hs = 470, [190, 300, 410]
    for i, bh in enumerate(hs):
        x = 300 + i*160
        stroke(dr, rect(x, base-bh, 118, bh), rnd, w=11)
    stroke(dr, line((250, base), (800, base)), rnd, w=13)

def m_funnel(dr, rnd):
    stroke(dr, line((300,150),(724,150)), rnd, w=7)
    stroke(dr, line((300,150),(560,330)), rnd, w=7)
    stroke(dr, line((724,150),(560,330)), rnd, w=7)
    stroke(dr, line((560,330),(560,440)), rnd, w=7)
    for i,(y,w) in enumerate([(215,300),(275,190)]):
        stroke(dr, line((512-w/2,y),(512+w/2,y)), rnd, w=4, passes=2)

def m_venn(dr, rnd):
    stroke(dr, circle(400, 288, 205), rnd, w=12)
    stroke(dr, circle(624, 288, 205), rnd, w=12)

def m_one(dr, rnd):
    stroke(dr, circle(512, 288, 165), rnd, w=13)
    for i in range(12):                              # 방사선
        a = i*math.pi/6
        stroke(dr, line((512+205*math.cos(a), 288+205*math.sin(a)),
                        (512+262*math.cos(a), 288+262*math.sin(a))), rnd, w=5, passes=2)

def m_matrix(dr, rnd):
    x0, y0, cw, ch = 272, 108, 120, 90
    for c in range(5): stroke(dr, line((x0+c*cw, y0),(x0+c*cw, y0+4*ch)), rnd, w=8, passes=4)
    for r in range(5): stroke(dr, line((x0, y0+r*ch),(x0+4*cw, y0+r*ch)), rnd, w=5, passes=2)
    stroke(dr, rect(x0+2*cw, y0+ch, cw, ch), rnd, w=14)   # 강조된 한 칸

def m_nodes(dr, rnd):
    """중앙 허브 + 위성 노드. AI 에이전트·자동화·워크플로 계열."""
    cx, cy, R = 512, 288, 196
    sats = [(cx + R * math.cos(a), cy + R * math.sin(a) * 0.82)
            for a in [math.pi * k / 3 + 0.28 for k in range(6)]]
    hub_r, sat_r = 74, 46
    for (sx, sy) in sats:                       # 원 가장자리 사이만 잇는다 (내부 관통 방지)
        dx, dy = sx - cx, sy - cy
        d = math.hypot(dx, dy)
        ux, uy = dx / d, dy / d
        a = (cx + ux * (hub_r + 6), cy + uy * (hub_r + 6))
        b = (cx + ux * (d - sat_r - 6), cy + uy * (d - sat_r - 6))
        stroke(dr, line(a, b, n=14), rnd, w=6, passes=3)
    for (sx, sy) in sats:
        stroke(dr, circle(sx, sy, sat_r), rnd, w=9)
    stroke(dr, circle(cx, cy, hub_r), rnd, w=13)


MOTIFS = {"bars": m_bars, "funnel": m_funnel, "venn": m_venn, "one": m_one, "matrix": m_matrix, "nodes": m_nodes}
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
    # 영문 키워드는 단어 경계 매칭 ("ai"가 "airbridge"에 걸리는 오매칭 방지)
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

def generate(slug, out, tags=None, title="", motif=None, text=""):
    rnd = random.Random(int(hashlib.sha256(slug.encode()).hexdigest()[:12], 16))
    img = paper(rnd)
    layer = Image.new("RGBA", (W, H), (0,0,0,0))
    dr = ImageDraw.Draw(layer)
    name = motif or pick(slug, tags, title, text)
    MOTIFS[name](dr, rnd)
    img = Image.alpha_composite(img.convert("RGBA"), layer.filter(ImageFilter.GaussianBlur(0.55))).convert("RGB")
    img.save(out, "PNG", optimize=True)
    return name


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    ap.add_argument("--tags", default="")
    ap.add_argument("--title", default="")
    ap.add_argument("--text", default="", help="excerpt·본문 등 추가 매칭 텍스트 (가중치 1)")
    ap.add_argument("--outdir", default="images")
    ap.add_argument("--motif", choices=sorted(MOTIFS), help="자동 선택 대신 강제 지정")
    a = ap.parse_args()
    out = pathlib.Path(a.outdir) / ("sketch-" + a.slug + ".png")
    out.parent.mkdir(parents=True, exist_ok=True)
    name = generate(a.slug, str(out), tags=[t for t in a.tags.split(",") if t],
                    title=a.title, motif=a.motif, text=a.text)
    print(str(out) + "\t" + name)
