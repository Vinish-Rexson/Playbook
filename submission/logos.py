"""Playbook logo concepts in the app's colours, rendered side by side on one sheet."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
NM = HERE.parent / "node_modules" / "@expo-google-fonts"
JAKARTA_BOLD = str(NM / "plus-jakarta-sans" / "700Bold" / "PlusJakartaSans_700Bold.ttf")
JAKARTA_SEMI = str(NM / "plus-jakarta-sans" / "600SemiBold" / "PlusJakartaSans_600SemiBold.ttf")
JAKARTA_XB = str(NM / "plus-jakarta-sans" / "800ExtraBold" / "PlusJakartaSans_800ExtraBold.ttf")
MONO = str(NM / "jetbrains-mono" / "500Medium" / "JetBrainsMono_500Medium.ttf")

INK = (17, 17, 19, 255)
LIME = (214, 243, 60, 255)
PAPER = (244, 244, 239, 255)
CLEAR = (0, 0, 0, 0)
SS = 4  # supersampling factor for smooth edges


def rr_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return m


def finish(img, size):
    return img.resize((size, size), Image.LANCZOS)


# ---- icon concepts: each returns an RGBA square icon of `size` px ----

def icon_split(size):
    """A · Split: ink page over a lime band (the original idea, refined proportions)."""
    S = size * SS
    im = Image.new("RGBA", (S, S), CLEAR)
    body = Image.new("RGBA", (S, S), INK)
    ImageDraw.Draw(body).rectangle((0, round(S * 0.72), S, S), fill=LIME)
    im.paste(body, (0, 0), rr_mask(S, round(S * 0.24)))
    return finish(im, size)


def icon_ticket(size):
    """B · Ticket: the split icon with ticket notches, like the app's ticket cards."""
    S = size * SS
    im = Image.new("RGBA", (S, S), CLEAR)
    body = Image.new("RGBA", (S, S), INK)
    d = ImageDraw.Draw(body)
    split = round(S * 0.68)
    d.rectangle((0, split, S, S), fill=LIME)
    mask = rr_mask(S, round(S * 0.24))
    md = ImageDraw.Draw(mask)
    r = round(S * 0.085)
    md.ellipse((-r, split - r, r, split + r), fill=0)
    md.ellipse((S - r, split - r, S + r, split + r), fill=0)
    # perforation dots along the tear line
    for i in range(1, 6):
        x = r + i * (S - 2 * r) / 6
        md.ellipse((x - S * 0.012, split - S * 0.012, x + S * 0.012, split + S * 0.012), fill=0)
    im.paste(body, (0, 0), mask)
    return finish(im, size)


def icon_levels(size):
    """C · Levels: take-profit, entry and stop as three lines: a playbook is a plan on a chart."""
    S = size * SS
    im = Image.new("RGBA", (S, S), CLEAR)
    body = Image.new("RGBA", (S, S), INK)
    d = ImageDraw.Draw(body)
    t = round(S * 0.085)
    x0 = round(S * 0.22)
    d.rounded_rectangle((x0, round(S * 0.27), round(S * 0.78), round(S * 0.27) + t), radius=t // 2, fill=LIME)  # TP
    d.rounded_rectangle((x0, round(S * 0.46), round(S * 0.62), round(S * 0.46) + t), radius=t // 2, fill=PAPER)  # entry
    cx, cy, cr = round(S * 0.73), round(S * 0.46) + t // 2, round(S * 0.075)
    d.ellipse((cx - cr, cy - cr, cx + cr, cy + cr), fill=PAPER)
    d.rounded_rectangle((x0, round(S * 0.65), round(S * 0.50), round(S * 0.65) + t), radius=t // 2, fill=(110, 110, 118, 255))  # SL
    im.paste(body, (0, 0), rr_mask(S, round(S * 0.24)))
    return finish(im, size)


def icon_rise(size):
    """D · Rise: three book spines that climb like a chart."""
    S = size * SS
    im = Image.new("RGBA", (S, S), CLEAR)
    body = Image.new("RGBA", (S, S), INK)
    d = ImageDraw.Draw(body)
    w = round(S * 0.15)
    gap = round(S * 0.06)
    base = round(S * 0.76)
    x = round(S * 0.215)
    for k, h in enumerate((0.26, 0.38, 0.52)):
        d.rounded_rectangle((x, base - round(S * h), x + w, base), radius=round(w * 0.32), fill=LIME if k == 2 else PAPER)
        x += w + gap
    im.paste(body, (0, 0), rr_mask(S, round(S * 0.24)))
    return finish(im, size)


def icon_bookmark(size):
    """E · Bookmark: lime tile with an ink bookmark, the saved plan."""
    S = size * SS
    im = Image.new("RGBA", (S, S), CLEAR)
    body = Image.new("RGBA", (S, S), LIME)
    d = ImageDraw.Draw(body)
    x0, x1 = round(S * 0.33), round(S * 0.67)
    y0, y1 = round(S * 0.0), round(S * 0.74)
    notch = round(S * 0.13)
    d.polygon([(x0, y0), (x1, y0), (x1, y1), ((x0 + x1) / 2, y1 - notch), (x0, y1)], fill=INK)
    im.paste(body, (0, 0), rr_mask(S, round(S * 0.24)))
    return finish(im, size)


def icon_play(size):
    """F · Play-book: a play triangle split into two pages."""
    S = size * SS
    im = Image.new("RGBA", (S, S), CLEAR)
    body = Image.new("RGBA", (S, S), INK)
    d = ImageDraw.Draw(body)
    lx, rx, ty, by = S * 0.32, S * 0.76, S * 0.24, S * 0.76
    cy = (ty + by) / 2
    d.polygon([(lx, ty), (rx, cy), (lx, by)], fill=LIME)
    # page gap: an ink sliver through the triangle
    gx = S * 0.47
    d.rectangle((gx - S * 0.022, 0, gx + S * 0.022, S), fill=INK)
    im.paste(body, (0, 0), rr_mask(S, round(S * 0.24)))
    return finish(im, size)


def icon_pdot(size):
    """G · p-dot: lowercase p with the lime full stop from the wordmark."""
    S = size * SS
    im = Image.new("RGBA", (S, S), CLEAR)
    body = Image.new("RGBA", (S, S), INK)
    d = ImageDraw.Draw(body)
    f = ImageFont.truetype(JAKARTA_XB, round(S * 0.78))
    bbox = d.textbbox((0, 0), "p", font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (S - tw) / 2 - bbox[0] - S * 0.07
    y = (S - th) / 2 - bbox[1] + S * 0.02
    d.text((x, y), "p", font=f, fill=PAPER)
    r = S * 0.075
    cx, cy = x + bbox[2] + S * 0.10, S * 0.62
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=LIME)
    im.paste(body, (0, 0), rr_mask(S, round(S * 0.24)))
    return finish(im, size)


def icon_stack(size):
    """H · Stack: a lime page behind the split ink page, a book of playbooks."""
    S = size * SS
    im = Image.new("RGBA", (S, S), CLEAR)
    d = ImageDraw.Draw(im)
    r = round(S * 0.17)
    d.rounded_rectangle((round(S * 0.22), round(S * 0.04), S - 1, round(S * 0.82)), radius=r, fill=LIME)
    front = Image.new("RGBA", (round(S * 0.78), round(S * 0.78)), INK)
    fd = ImageDraw.Draw(front)
    fd.rectangle((0, round(front.height * 0.74), front.width, front.height), fill=LIME)
    fd.rectangle((0, round(front.height * 0.70), front.width, round(front.height * 0.74)), fill=INK)
    m = Image.new("L", front.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, front.width - 1, front.height - 1), radius=r, fill=255)
    im.paste(front, (0, round(S * 0.22)), m)
    return finish(im, size)


CONCEPTS = [
    ("A", "Split", "Your original: ink page over a lime band", icon_split),
    ("B", "Ticket", "Ticket notches from the app's cards", icon_ticket),
    ("C", "Levels", "Take-profit, entry, stop: the plan on a chart", icon_levels),
    ("D", "Rise", "Book spines climbing like a chart", icon_rise),
    ("E", "Bookmark", "The saved plan, on lime", icon_bookmark),
    ("F", "Play-book", "Play button split into two pages", icon_play),
    ("G", "p-dot", "Monogram with the wordmark's lime dot", icon_pdot),
    ("H", "Stack", "Pages of playbooks, stacked", icon_stack),
]


def wordmark(draw, x, y, size, color, dot=True):
    f = ImageFont.truetype(JAKARTA_BOLD, size)
    draw.text((x, y), "playbook", font=f, fill=color)
    if dot:
        tw = draw.textlength("playbook", font=f)
        r = size * 0.11
        cy = y + size * 1.02
        draw.ellipse((x + tw + size * 0.06, cy - r, x + tw + size * 0.06 + 2 * r, cy + r), fill=LIME)


def tile(letter, name, note, fn, w=600, h=760):
    t = Image.new("RGBA", (w, h), PAPER)
    d = ImageDraw.Draw(t)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=36, outline=(222, 222, 214, 255), width=2)
    d.text((36, 30), f"{letter}", font=ImageFont.truetype(JAKARTA_XB, 44), fill=INK)
    d.text((82, 40), name.upper(), font=ImageFont.truetype(MONO, 24), fill=(90, 90, 98, 255))
    d.text((36, 92), note, font=ImageFont.truetype(JAKARTA_SEMI, 20), fill=(120, 120, 128, 255))
    big = fn(220)
    t.alpha_composite(big, ((w - 220) // 2, 150))
    # light lockup
    ico = fn(64)
    lock_w = 64 + 18 + 250
    lx = (w - lock_w) // 2
    t.alpha_composite(ico, (lx, 410))
    wordmark(d, lx + 82, 404, 50, INK)
    # dark strip: lockup on ink + app icon sizes
    d.rounded_rectangle((24, 510, w - 24, h - 24), radius=26, fill=INK)
    def on_dark(s, x, y):
        ring = round(max(2, s * 0.045))
        d.rounded_rectangle((x - ring, y - ring, x + s + ring, y + s + ring), radius=round((s + 2 * ring) * 0.26), fill=(58, 58, 66, 255))
        t.alpha_composite(fn(s), (x, y))
    on_dark(56, 56, 548)
    wordmark(d, 128, 541, 44, (245, 245, 245, 255))
    for k, sz in enumerate((88, 60, 36)):
        x = 56 + sum((88, 60, 36)[:k]) + 26 * k
        on_dark(sz, x, 632 + (88 - sz))
    d.text((w - 210, 700), "app icon sizes", font=ImageFont.truetype(MONO, 18), fill=(130, 130, 140, 255))
    return t


def sheet():
    cols, rows, tw, th, gap, pad = 4, 2, 600, 760, 36, 72
    W = pad * 2 + cols * tw + (cols - 1) * gap
    H = pad * 2 + 120 + rows * th + (rows - 1) * gap
    s = Image.new("RGBA", (W, H), (234, 234, 227, 255))
    d = ImageDraw.Draw(s)
    d.text((pad, pad - 6), "Playbook logo concepts", font=ImageFont.truetype(JAKARTA_BOLD, 56), fill=INK)
    d.text((pad, pad + 66), "ink #111113  ·  lime #D6F33C  ·  paper #F4F4EF  ·  Plus Jakarta Sans", font=ImageFont.truetype(MONO, 24), fill=(100, 100, 108, 255))
    for i, c in enumerate(CONCEPTS):
        x = pad + (i % cols) * (tw + gap)
        y = pad + 120 + (i // cols) * (th + gap)
        s.alpha_composite(tile(*c), (x, y))
    out = HERE / "logo_concepts.png"
    s.convert("RGB").save(out, optimize=True)
    print(out, s.size)


if __name__ == "__main__":
    sheet()
