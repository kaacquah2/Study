"""
Generate PWA icons for Study AI:
- static/icon-192.png (192x192)
- static/icon-512.png (512x512)
- static/favicon.png (64x64)
"""
import os
from PIL import Image, ImageDraw

STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")

def draw_study_icon(size: int) -> Image.Image:
    # 4x supersampling for ultra smooth antialiasing
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Background rounded rectangle with sleek dark theme
    bg_color = (9, 13, 22, 255) # #090d16
    corner_radius = int(canvas_size * 0.22) # smooth squircle / maskable friendly
    margin = int(canvas_size * 0.04)
    draw.rounded_rectangle(
        [(margin, margin), (canvas_size - margin, canvas_size - margin)],
        radius=corner_radius,
        fill=bg_color
    )

    # 2. Subtle outer ring glow
    glow_color = (59, 130, 246, 70) # #3b82f6 at ~27% opacity
    draw.rounded_rectangle(
        [(margin, margin), (canvas_size - margin, canvas_size - margin)],
        radius=corner_radius,
        outline=glow_color,
        width=int(canvas_size * 0.018)
    )

    center_x = canvas_size / 2
    center_y = canvas_size / 2

    # 3. Stylized Graduation Cap / AI Spark Geometry
    # Cap Top diamond
    cap_top_y = center_y - canvas_size * 0.16
    diamond_w = canvas_size * 0.32
    diamond_h = canvas_size * 0.16
    cap_diamond = [
        (center_x, cap_top_y),
        (center_x + diamond_w, cap_top_y + diamond_h),
        (center_x, cap_top_y + diamond_h * 2),
        (center_x - diamond_w, cap_top_y + diamond_h),
    ]
    draw.polygon(cap_diamond, fill=(59, 130, 246, 255)) # #3b82f6
    draw.polygon(cap_diamond, outline=(96, 165, 250, 255), width=int(canvas_size * 0.015))

    # Cap skull cap / base underneath
    base_y = cap_top_y + diamond_h + canvas_size * 0.04
    base_w = canvas_size * 0.18
    base_h = canvas_size * 0.14
    draw.chord(
        [(center_x - base_w, base_y), (center_x + base_w, base_y + base_h * 2)],
        start=0,
        end=180,
        fill=(37, 99, 235, 255) # #2563eb
    )

    # Tassel ribbon & bead
    tassel_origin = (center_x + diamond_w * 0.5, cap_top_y + diamond_h * 1.25)
    tassel_end = (center_x + diamond_w * 0.75, center_y + canvas_size * 0.08)
    draw.line([tassel_origin, tassel_end], fill=(245, 158, 11, 255), width=int(canvas_size * 0.018)) # #f59e0b
    tassel_r = int(canvas_size * 0.02)
    draw.ellipse(
        [(tassel_end[0] - tassel_r, tassel_end[1] - tassel_r), (tassel_end[0] + tassel_r, tassel_end[1] + tassel_r)],
        fill=(251, 191, 36, 255)
    )

    # 4. Open Book / Spreading Knowledge Wings below
    book_center_y = center_y + canvas_size * 0.16
    book_span_w = canvas_size * 0.28
    book_h = canvas_size * 0.15

    # Left page
    left_page = [
        (center_x, book_center_y + canvas_size * 0.04),
        (center_x - book_span_w, book_center_y - canvas_size * 0.02),
        (center_x - book_span_w, book_center_y + book_h - canvas_size * 0.02),
        (center_x, book_center_y + book_h + canvas_size * 0.04),
    ]
    draw.polygon(left_page, fill=(241, 245, 249, 245)) # slate-100

    # Right page
    right_page = [
        (center_x, book_center_y + canvas_size * 0.04),
        (center_x + book_span_w, book_center_y - canvas_size * 0.02),
        (center_x + book_span_w, book_center_y + book_h - canvas_size * 0.02),
        (center_x, book_center_y + book_h + canvas_size * 0.04),
    ]
    draw.polygon(right_page, fill=(226, 232, 240, 245)) # slate-200

    # Center spine
    draw.line(
        [(center_x, book_center_y + canvas_size * 0.04), (center_x, book_center_y + book_h + canvas_size * 0.04)],
        fill=(59, 130, 246, 255),
        width=int(canvas_size * 0.02)
    )

    # 5. Glowing AI Sparkle Stars
    def draw_star(sx, sy, r, color):
        points = [
            (sx, sy - r),
            (sx + r * 0.28, sy - r * 0.28),
            (sx + r, sy),
            (sx + r * 0.28, sy + r * 0.28),
            (sx, sy + r),
            (sx - r * 0.28, sy + r * 0.28),
            (sx - r, sy),
            (sx - r * 0.28, sy - r * 0.28),
        ]
        draw.polygon(points, fill=color)

    draw_star(center_x - canvas_size * 0.26, center_y - canvas_size * 0.2, canvas_size * 0.045, (96, 165, 250, 255))
    draw_star(center_x + canvas_size * 0.28, center_y - canvas_size * 0.24, canvas_size * 0.035, (147, 197, 253, 255))

    # Downsample with high-quality Lanczos resampling
    return img.resize((size, size), Image.Resampling.LANCZOS)

def main():
    os.makedirs(STATIC_DIR, exist_ok=True)

    sizes = {
        "icon-192.png": 192,
        "icon-512.png": 512,
        "favicon.png": 64,
    }

    for filename, size in sizes.items():
        out_path = os.path.join(STATIC_DIR, filename)
        img = draw_study_icon(size)
        img.save(out_path, format="PNG", optimize=True)
        print(f"Generated {filename} ({size}x{size}) -> {out_path}")

if __name__ == "__main__":
    main()
