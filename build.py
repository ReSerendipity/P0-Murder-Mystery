# -*- coding: utf-8 -*-
"""把模板、样式、剧本与立绘打包成单文件 HTML。

用法：python build.py
输出：index.html（GitHub Pages 入口）与 P0事故剧本杀.html（同内容，便于分享）
"""
import base64
import io
import os
import re
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
PORTRAITS = os.path.join(ROOT, "assets", "portraits")
OUT_MAIN = os.path.join(ROOT, "index.html")
OUT_COPY = os.path.join(ROOT, "P0事故剧本杀.html")

KEYS = ["deepseek", "chatgpt", "claude", "gemini", "grok", "kimi", "qwen", "doubao"]


def read(path):
    with io.open(path, "r", encoding="utf-8") as f:
        return f.read()


html = read(os.path.join(SRC, "shell.html"))
css = read(os.path.join(SRC, "styles.css"))
js = "\n\n".join([
    read(os.path.join(SRC, "data.js")),
    read(os.path.join(SRC, "scenes.js")),
    read(os.path.join(SRC, "engine.js")),
])

html = html.replace("/*__CSS__*/", css).replace("/*__JS__*/", js)

for name in KEYS:
    with open(os.path.join(PORTRAITS, name + ".webp"), "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    html = html.replace(f"%%IMG_{name}%%", "data:image/webp;base64," + b64)

left = re.findall(r"%%IMG_[a-z]+%%", html)
if left:
    raise SystemExit("未替换的图片占位符: %s" % left)

with io.open(OUT_MAIN, "w", encoding="utf-8", newline="\n") as f:
    f.write(html)
shutil.copyfile(OUT_MAIN, OUT_COPY)

print("built: %s (%.1f KB)" % (OUT_MAIN, os.path.getsize(OUT_MAIN) / 1024))
