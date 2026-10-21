#!/usr/bin/env python3
"""生成 tabBar 图标（线性风格，81x81 PNG，带 4x 超采样抗锯齿）。

小程序原生 tabBar 不支持 SVG，必须用 PNG。
运行：python3 tools/gen-tabbar-icons.py
"""

import os
from PIL import Image, ImageDraw

SIZE = 81          # 微信推荐尺寸
SS = 4             # 超采样倍数
W = SIZE * SS

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "miniprogram", "images", "tabbar")

NORMAL = (179, 168, 156)   # #B3A89C 暖灰
ACTIVE = (194, 96, 63)     # #C2603F 砖红

LW = int(3.2 * SS)         # 线宽
R = 6 * SS                 # 圆角


def canvas():
    return Image.new("RGBA", (W, W), (0, 0, 0, 0))


def draw_wall(d, c):
    """打卡墙：2x2 圆角方块"""
    m, gap, cell = 15 * SS, 6 * SS, 22 * SS
    for row in range(2):
        for col in range(2):
            x = m + col * (cell + gap)
            y = m + row * (cell + gap)
            d.rounded_rectangle([x, y, x + cell, y + cell], radius=R,
                                outline=c, width=LW)


def draw_chapters(d, c):
    """我们的章节：书签/册子轮廓"""
    left, right = 27 * SS, 54 * SS
    top, bottom = 16 * SS, 66 * SS
    notch = 50 * SS
    d.line([(left, top), (right, top), (right, bottom),
            (40.5 * SS, notch), (left, bottom), (left, top)],
           fill=c, width=LW, joint="curve")


def draw_mine(d, c):
    """我的：头像"""
    d.ellipse([29 * SS, 16 * SS, 52 * SS, 39 * SS], outline=c, width=LW)
    d.arc([16 * SS, 46 * SS, 65 * SS, 92 * SS], start=180, end=360,
          fill=c, width=LW)


ICONS = {
    "wall": draw_wall,
    "chapters": draw_chapters,
    "mine": draw_mine,
}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, fn in ICONS.items():
        for suffix, color in (("", NORMAL), ("-active", ACTIVE)):
            img = canvas()
            fn(ImageDraw.Draw(img), color)
            img = img.resize((SIZE, SIZE), Image.LANCZOS)
            path = os.path.join(OUT_DIR, f"{name}{suffix}.png")
            img.save(path, "PNG", optimize=True)
            print(f"{path}  {os.path.getsize(path)} B")


if __name__ == "__main__":
    main()
