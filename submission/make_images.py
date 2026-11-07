"""Hackathon submission images: a 16:9 cover and 16:9 feature cards built from real app screenshots."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
FR = HERE / "frames"
OUT = HERE
FONTS = Path("C:/Windows/Fonts")
BOLD = str(FONTS / "segoeuib.ttf")
SEMI = str(FONTS / "seguisb.ttf")
REG = str(FONTS / "segoeui.ttf")
MONO = str(FONTS / "consolab.ttf")

INK = (17, 17, 19)
PAPER = (244, 244, 239)
LIME = (214, 243, 60)
GREY = (170, 170, 178)
BEZEL = (46, 46, 52)


def phone(name: str, height: int, radius_ratio=0.055) -> Image.Image:
    """App screenshot inside a dark bezel with rounded corners and a soft shadow (RGBA)."""
    shot = Image.open(FR / f"{name}.png").convert("RGB")
    w = round(shot.width * height / shot.height)
    shot = shot.resize((w, height), Image.LANCZOS)
    r = round(w * radius_ratio * 1.6)
    pad = max(10, round(height * 0.012))
    bw, bh = w + pad * 2, height + pad * 2
    shadow_pad = 40
    im = Image.new("RGBA", (bw + shadow_pad * 2, bh + shadow_pad * 2), (0, 0, 0, 0))
    sh = Image.new("L", im.size, 0)
    ImageDraw.Draw(sh).rounded_rectangle((shadow_pad, shadow_pad + 14, shadow_pad + bw, shadow_pad + bh + 14), radius=r + pad, fill=150)
    sh = sh.filter(ImageFilter.GaussianBlur(22))
    im.paste((0, 0, 0, 255), (0, 0), sh)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((shadow_pad, shadow_pad, shadow_pad + bw, shadow_pad + bh), radius=r + pad, fill=BEZEL)
    mask = Image.new("L", (w, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, height - 1), radius=r, fill=255)
    im.paste(shot, (shadow_pad + pad, shadow_pad + pad), mask)
    return im


def wrap(d: ImageDraw.ImageDraw, text: str, font, width: int):
    lines, line = [], ""
    for word in text.split():
        test = f"{line} {word}".strip()
        if d.textlength(test, font=font) <= width:
            line = test
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def wordmark(d, x, y, size, color=(245, 245, 245)):
    f = ImageFont.truetype(BOLD, size)
    d.text((x, y), "playbook", font=f, fill=color)
    # Lime dot after the wordmark, the app's single accent.
    tw = d.textlength("playbook", font=f)
    r = size * 0.13
    cy = y + size * 0.98
    d.ellipse((x + tw + size * 0.08, cy - r, x + tw + size * 0.08 + 2 * r, cy + r), fill=LIME)


def pill(d, x, y, text, font, fg, bg, outline=None):
    tw = d.textlength(text, font=font)
    h = font.size + 22
    d.rounded_rectangle((x, y, x + tw + 36, y + h), radius=h // 2, fill=bg, outline=outline, width=2 if outline else 0)
    d.text((x + 18, y + 9), text, font=font, fill=fg)
    return x + tw + 36


def cover():
    W, H = 1920, 1080
    im = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(im)
    # Big lime disc behind the phones (solid shape, no gradient).
    d.ellipse((1060, 120, 1900, 960), fill=(32, 34, 24))
    d.ellipse((1180, 240, 1780, 840), fill=(44, 50, 26))

    wordmark(d, 120, 150, 96)
    head = ImageFont.truetype(BOLD, 86)
    y = 330
    for line in ["Copy the plan,", "not the panic."]:
        d.text((120, y), line, font=head, fill=(245, 245, 245) if line.startswith("Copy") else LIME)
        y += 104
    body = ImageFont.truetype(SEMI, 34)
    for line in wrap(d, "Traders publish playbooks: entry, take-profit, stop-loss, DCA. Followers apply them in one tap from their own wallet. Definitive Flash executes every order onchain.", body, 760):
        d.text((120, y + 30), line, font=body, fill=GREY)
        y += 48
    chips = ImageFont.truetype(MONO, 26)
    x = 120
    for t in ["Definitive Flash", "Base + Solana", "Uniswap"]:
        x = pill(d, x, y + 90, t, chips, INK if t == "Definitive Flash" else (235, 235, 235), LIME if t == "Definitive Flash" else INK, None if t == "Definitive Flash" else (80, 80, 88)) + 14

    # Three phones, fanned.
    specs = [("discover_hot", 720, 7, (1000, 210)), ("position_live", 720, -7, (1470, 215)), ("build_chart", 820, 0, (1240, 130))]
    for name, h, angle, (x0, y0) in specs:
        p = phone(name, h)
        if angle:
            p = p.rotate(angle, resample=Image.BICUBIC, expand=True)
        im.paste(p, (x0, y0), p)
    im.save(OUT / "cover.png", optimize=True)
    im.resize((1280, 720), Image.LANCZOS).save(OUT / "cover_1280x720.png", optimize=True)


CARDS = [
    ("01", "TRADER", "Draw your strategy on the chart", "Drag Buy, Take-profit and Stop on live candles. Each level moves on its own. Pick Market, Limit or DCA (Flash TWAP), set your creator cut, publish with one signature.", "build_chart"),
    ("02", "FOLLOWER", "Discover playbooks like a feed", "Newest, Hot picks and Following tabs, up / down votes and one-tap follow. Every card shows the plan, the results and the creator's cut.", "discover_hot"),
    ("03", "FLASH", "Sign in plain English", "The built-in wallet decodes every Flash order on the phone before you sign: what it spends, the contract, the deadline. No blind signing.", "so_c"),
    ("04", "FLASH", "Entry + bracket in one apply", "One apply places the entry and an attached take-profit + stop-loss bracket through Flash. First-time approvals only once, then two free signatures.", "applied"),
    ("05", "ONCHAIN", "Protected from the first fill", "Positions go live onchain with the bracket already watching. See bought price, target, stop and P&L, and close early with one batch-cancel + market sell.", "position_live"),
    ("06", "SOCIAL", "A leaderboard for strategies", "Rank playbooks by realized return, win rate, applies and volume. Creators earn a Flash integrator fee every time someone applies their plan.", "lb_d"),
    ("07", "UNISWAP", "Short on USDC? Swap in one tap", "Uniswap API routing (v2 / v3 / v4) on Base buys exactly the USDC a playbook needs, with Permit2 and a router check before signing.", "swap_sign"),
    ("08", "FLASH", "Close early, all through Flash", "Changed your mind? Playbook cancels the take-profit and stop, then sells at market. Every step is a signature you can read.", "closing"),
]


def card(num, tag, title, body, shot):
    W, H = 1600, 900
    im = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(im)
    d.ellipse((930, 70, 1530, 670), fill=(32, 34, 24))
    d.text((100, 120), f"{num}  ·  {tag}", font=ImageFont.truetype(MONO, 30), fill=LIME)
    tf = ImageFont.truetype(BOLD, 66)
    y = 180
    for line in wrap(d, title, tf, 760):
        d.text((100, y), line, font=tf, fill=(245, 245, 245))
        y += 80
    bf = ImageFont.truetype(SEMI, 31)
    y += 26
    for line in wrap(d, body, bf, 740):
        d.text((100, y), line, font=bf, fill=GREY)
        y += 46
    wordmark(d, 100, 770, 40)
    d.text((100 + 210, 784), "built on Definitive Flash  ·  Base + Solana", font=ImageFont.truetype(SEMI, 24), fill=(130, 130, 140))
    p = phone(shot, 780)
    im.paste(p, (1260 - p.width // 2, 450 - p.height // 2 + 6), p)
    im.save(OUT / f"screen_{num}_{tag.lower()}.png", optimize=True)


if __name__ == "__main__":
    cover()
    for c in CARDS:
        card(*c)
    print("done")
