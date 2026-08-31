"""Generate the Fairplay app icon set from one vector definition.

The mark is a flagstick standing in the hole on a putting surface. It is drawn
once, at 512, and every output is the same geometry re-rendered rather than a
resample of a bitmap — which is what made the old set blurry: a small PNG had
been upscaled to 512.

Colours are the brand palette from src/theme.ts:
  ground   #14331f  greenDark
  surface  #2c6347  green
  hole     #0b2314  darker than the ground so it reads as depth, not a dot
  gold     #e0b95c  gold
"""

GROUND, SURFACE, HOLE, GOLD = "#14331f", "#2c6347", "#0b2314", "#e0b95c"


def mark(scale=1.0, cx=256.0, cy=268.0):
    """The flag + green, scaled about a centre. Returns SVG body elements.

    `cy` sits below the canvas centre because the flag is top-heavy: balancing
    on the bounding box would leave the mark looking like it had slipped down.
    """
    def x(v): return cx + (v - 256.0) * scale
    def y(v): return cy + (v - 268.0) * scale
    def s(v): return v * scale

    return f"""
  <ellipse cx="{x(256):.1f}" cy="{y(384):.1f}" rx="{s(174):.1f}" ry="{s(58):.1f}" fill="{SURFACE}"/>
  <ellipse cx="{x(256):.1f}" cy="{y(366):.1f}" rx="{s(30):.1f}" ry="{s(13):.1f}" fill="{HOLE}"/>
  <rect x="{x(249):.1f}" y="{y(112):.1f}" width="{s(14):.1f}" height="{s(258):.1f}" rx="{s(7):.1f}" fill="{GOLD}"/>
  <path d="M {x(263):.1f} {y(118):.1f} L {x(392):.1f} {y(158):.1f} L {x(263):.1f} {y(198):.1f} Z" fill="{GOLD}"/>"""


def rounded(scale=1.0):
    """Home-screen icon: brand-green squircle, mark at full size."""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="{GROUND}"/>{mark(scale)}
</svg>"""


def maskable():
    """Maskable icon: full-bleed ground, mark pulled into the safe circle.

    Android may crop this to a circle of 80% diameter, so the mark is scaled to
    0.70 and the ground runs corner to corner — anything the mask eats is
    background. Without this the squircle above gets its corners clipped and
    the flag can lose its tip.
    """
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="{GROUND}"/>{mark(0.70, 256.0, 262.0)}
</svg>"""


def badge():
    """Android notification badge: a flat white silhouette on transparent.

    Android tints the badge with the system colour and only reads the alpha
    channel, so anything with colour or interior detail comes out as a blob.
    Just the flag, no green.
    """
    return """<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
  <rect x="33" y="10" width="6" height="52" rx="3" fill="#ffffff"/>
  <path d="M 39 13 L 62 21 L 39 29 Z" fill="#ffffff"/>
</svg>"""


def favicon():
    """Browser tab: the same mark, but the green surface is dropped.

    At 16px an ellipse behind the pole is three grey pixels. The flag alone
    survives the size; the rest is noise.
    """
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="{GROUND}"/>
  <rect x="29" y="12" width="4" height="42" rx="2" fill="{GOLD}"/>
  <path d="M 33 14 L 54 21 L 33 28 Z" fill="{GOLD}"/>
</svg>"""


# ── Render ───────────────────────────────────────────────────────────────────
#
# Run from the frontend directory:  npm run icons
#
# Needs ImageMagick (`convert`) on PATH. Every PNG is rasterised from the SVG
# at its final size rather than resampled from a larger one, which is what the
# previous icon set got wrong.

import pathlib, subprocess, sys, tempfile

out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "public")
out.mkdir(parents=True, exist_ok=True)

(out / "favicon.svg").write_text(favicon())

renders = [
    (rounded(), "icon-512.png", 512),
    (rounded(), "icon-192.png", 192),
    (maskable(), "icon-maskable-512.png", 512),
    (badge(), "badge-72.png", 72),
]

with tempfile.TemporaryDirectory() as tmp:
    for svg, name, size in renders:
        src = pathlib.Path(tmp) / (name + ".svg")
        src.write_text(svg)
        subprocess.run(
            ["convert", "-background", "none", str(src), "-resize", f"{size}x{size}", str(out / name)],
            check=True,
        )
        print(f"wrote {out / name} ({size}px)")

print(f"wrote {out / 'favicon.svg'}")
