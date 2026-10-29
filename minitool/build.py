# -*- coding: utf-8 -*-
"""Build the Xiaohongshu minitool package from the single-file game sources.

Usage: python minitool/build.py
Output: minitool/dist (unzipped artifact) and minitool/P0-Murder-Mystery-minitool.zip
"""
import base64
import io
import os
import re
import shutil
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "src")
OVERLAY = os.path.join(HERE, "overlay")
DIST = os.path.join(HERE, "dist")
ZIP_PATH = os.path.join(HERE, "P0-Murder-Mystery-minitool.zip")
PORTRAITS = os.path.join(ROOT, "assets", "portraits")

KEYS = ["deepseek", "chatgpt", "claude", "gemini", "grok", "kimi", "qwen", "doubao", "glm"]


def read(path):
    with io.open(path, "r", encoding="utf-8") as f:
        return f.read()


def write(path, text):
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit("expected 1 occurrence of %s, got %d" % (label, count))
    return text.replace(old, new, 1)


# ---------------------------------------------------------------- CSS compat

def parse_css(text):
    items = []
    i = 0
    n = len(text)
    while i < n:
        j = text.find("{", i)
        if j < 0:
            break
        prelude = text[i:j].strip()
        depth = 1
        k = j + 1
        while k < n and depth:
            if text[k] == "{":
                depth += 1
            elif text[k] == "}":
                depth -= 1
            k += 1
        items.append((prelude, text[j + 1:k - 1]))
        i = k
    return items


def parse_decls(body):
    decls = []
    for chunk in body.split(";"):
        if ":" not in chunk:
            continue
        prop, value = chunk.split(":", 1)
        decls.append((prop.strip(), value.strip()))
    return decls


def split_top(value):
    args = []
    depth = 0
    start = 0
    for i, ch in enumerate(value):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "," and depth == 0:
            args.append(value[start:i].strip())
            start = i + 1
    args.append(value[start:].strip())
    return args


FUNC_RE = re.compile(r"(?<![\w-])(clamp|min|max)\(")


def fallback_value(value):
    match = FUNC_RE.search(value)
    if not match:
        return value
    name = match.group(1)
    open_idx = match.end() - 1
    depth = 0
    j = open_idx
    while j < len(value):
        if value[j] == "(":
            depth += 1
        elif value[j] == ")":
            depth -= 1
            if depth == 0:
                break
        j += 1
    args = [fallback_value(a) for a in split_top(value[open_idx + 1:j])]
    if name == "clamp":
        chosen = args[0]
    elif name == "min":
        relative = [a for a in args if re.search(r"\d(vw|vh|vmin|vmax|%)", a) or "calc(" in a]
        chosen = relative[0] if relative else args[0]
    else:
        chosen = args[0]
    return fallback_value(value[:match.start()] + chosen + value[j + 1:])


def inset_sides(value):
    parts = value.split()
    if len(parts) == 1:
        top = right = bottom = left = parts[0]
    elif len(parts) == 2:
        top, bottom = parts[0], parts[0]
        right, left = parts[1], parts[1]
    elif len(parts) == 3:
        top, right, bottom = parts[0], parts[1], parts[2]
        left = parts[1]
    elif len(parts) == 4:
        top, right, bottom, left = parts
    else:
        return None
    return [("top", top), ("right", right), ("bottom", bottom), ("left", left)]


def prefix_selector(selector, prefix):
    parts = [p.strip() for p in selector.split(",") if p.strip()]
    return ", ".join(prefix + " " + p for p in parts)


def build_compat_css(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    flat = []

    def walk(items, media):
        for prelude, body in items:
            if prelude.startswith("@"):
                if prelude.startswith("@media"):
                    walk(parse_css(body), (media + " and " if media else "") + prelude)
                # @supports / @keyframes / @font-face: leave untouched
                continue
            flat.append((media, prelude, parse_decls(body)))

    walk(parse_css(css), "")

    def gap_of(decls):
        row = col = None
        for prop, value in decls:
            if prop not in ("gap", "row-gap", "column-gap"):
                continue
            parts = value.split()
            if prop == "gap":
                if len(parts) == 1:
                    row = col = parts[0]
                elif len(parts) == 2:
                    row, col = parts[0], parts[1]
            elif prop == "row-gap":
                row = parts[0]
            else:
                col = parts[0]
        return row, col

    base = {}
    for media, selector, decls in flat:
        if media:
            continue
        info = base.setdefault(selector, {})
        for prop, value in decls:
            if prop == "display":
                info["display"] = value
            elif prop in ("flex-direction", "flex-flow"):
                info["direction"] = value
        row, col = gap_of(decls)
        if row is not None:
            info["gap_row"] = row
        if col is not None:
            info["gap_col"] = col

    rules = []
    for media, prelude, decls in flat:
        info = base.get(prelude, {})
        display = info.get("display", "")
        direction = info.get("direction", "")
        own_display = False
        for prop, value in decls:
            if prop == "display":
                display = value
                own_display = True
            elif prop in ("flex-direction", "flex-flow"):
                direction = value

        row, col = gap_of(decls)
        eff_row = row if row is not None else info.get("gap_row")
        eff_col = col if col is not None else info.get("gap_col")
        has_own_gap = row is not None or col is not None

        out = []
        for prop, value in decls:
            if prop == "inset":
                sides = inset_sides(value)
                if sides:
                    out.extend(sides)
            elif prop == "aspect-ratio":
                rules.append((media, prefix_selector(prelude, ".no-aspect-ratio"),
                              [("height", "0"), ("padding-top", "100%")]))
            elif prop in ("backdrop-filter", "-webkit-backdrop-filter"):
                continue
            elif "clamp(" in value or FUNC_RE.search(value):
                fb = fallback_value(value)
                if fb != value:
                    out.append((prop, fb))

        if "grid" in display and (own_display or has_own_gap):
            grid_row = eff_row or "0"
            grid_col = eff_col or "0"
            if grid_row != "0" or grid_col != "0":
                rules.append((media, prelude, [("grid-gap", grid_row if grid_row == grid_col
                                                else grid_row + " " + grid_col)]))
        if "flex" in display and (own_display or has_own_gap):
            margin = eff_row if direction.startswith("column") else eff_col
            if margin and margin != "0":
                side = "margin-top" if direction.startswith("column") else "margin-left"
                selector = prefix_selector(prelude, ".no-flex-gap") + " > * + *"
                rules.append((media, selector, [(side, margin)]))
        if out:
            rules.append((media, prelude, out))

    lines = ["/* Chrome 61 基线层：由 minitool/build.py 从 src/styles.css 生成 */"]
    for media, selector, decls in rules:
        body = " ".join("%s: %s;" % (prop, value) for prop, value in decls)
        rule = "%s { %s }" % (selector, body)
        if media:
            rule = "%s { %s }" % (media, rule)
        lines.append(rule)
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------- JS patches

AGENT_MAP_OLD = (
    'const AGENT_MAP = Object.fromEntries(AGENTS.map((a) => [a.id, a]));\n'
    'const CLUE_MAP = Object.fromEntries(CLUES.map((c) => [c.no, c]));'
)
AGENT_MAP_NEW = """function indexById(list, keyFn) {
  var map = {};
  for (var i = 0; i < list.length; i++) map[keyFn(list[i])] = list[i];
  return map;
}
const AGENT_MAP = indexById(AGENTS, function (a) { return a.id; });
const CLUE_MAP = indexById(CLUES, function (c) { return c.no; });"""

COPY_TEXT_NEW = """function copyText() {
  const e = ENDINGS[STATE.ending];
  const t = "【P0 事故剧本杀 · 谁动了档案库】\\n" +
    "结案评级：" + e.grade + "\\n" +
    "指认：" + (e.culprit ? e.culprit.replace("|", " / ") : "无") + "\\n" +
    "用时：" + fmt(1024 - STATE.secs) + " / 线索 " + STATE.clues.size + "/" + CLUES.length + "\\n" +
    "结论：" + e.sub + "\\n" +
    "#1024Builder #TRAE";
  const box = document.createElement("div");
  box.className = "overlay on";
  box.innerHTML = '<div class="panel copy-panel"><div class="panel-head"><h3>结案文案</h3>' +
    '<button class="x" id="copyClose">×</button></div><div class="panel-body">' +
    '<p class="copy-hint">长按下方文本，选择需要的部分复制。</p>' +
    '<textarea class="copy-text" readonly></textarea></div></div>';
  document.getElementById("stage").appendChild(box);
  box.querySelector(".copy-text").value = t;
  const close = function () { if (box.parentNode) box.parentNode.removeChild(box); };
  box.querySelector("#copyClose").onclick = close;
  box.addEventListener("click", function (ev) { if (ev.target === box) close(); });
  SFX.uiClick();
  toast("已展开结案文案");
}
"""

SAVE_CARD_FN = """function saveCardImage(dataUrl) {
  var mt = window.xhs && window.xhs.miniTool;
  if (!mt || typeof mt.writeTempFile !== "function" || typeof mt.saveImageToPhotosAlbum !== "function") {
    toast("当前环境不支持保存，请截图保存");
    return;
  }
  try {
    var pending = mt.writeTempFile({ data: dataUrl });
    if (!pending || typeof pending.then !== "function") {
      toast("保存失败，请截图保存");
      return;
    }
    pending.then(function (res) {
      return mt.saveImageToPhotosAlbum({ filePath: res.filePath });
    }).then(function () {
      toast("结案卡已保存到相册");
    }, function (err) {
      console.warn("保存结案卡失败", err);
      toast("保存失败，请截图保存");
    });
  } catch (e) {
    console.warn("保存结案卡失败", e);
    toast("保存失败，请截图保存");
  }
}
"""

CARD_OLD = """    const a = document.createElement("a");
    a.download = "P0结案卡-" + e.grade + ".png";
    a.href = c.toDataURL("image/png");
    a.click();
    SFX.cardDone();
    toast("结案卡已生成");"""
CARD_NEW = """    saveCardImage(c.toDataURL("image/png"));
    SFX.cardDone();"""

STORAGE_OLD = """const UNLOCK_KEY = "p0_endings_v1";
function unlockedEndings() {
  try { return new Set(JSON.parse(localStorage.getItem(UNLOCK_KEY) || "[]")); }
  catch (e) { return new Set(); }
}
function unlockEnding(id) {
  const s = unlockedEndings();
  s.add(id);
  try { localStorage.setItem(UNLOCK_KEY, JSON.stringify([...s])); } catch (e) {}
}"""
STORAGE_NEW = """const UNLOCK_KEY = "p0_endings_v1";
function readUnlockList() {
  var raw = null;
  try { raw = localStorage.getItem(UNLOCK_KEY); } catch (e) {}
  var arr = [];
  try { arr = JSON.parse(raw || "[]"); } catch (e) { arr = []; }
  return Array.isArray(arr) ? arr : [];
}
function unlockedEndings() { return new Set(readUnlockList()); }
function writeUnlockList(arr) {
  var json = JSON.stringify(arr);
  try { localStorage.setItem(UNLOCK_KEY, json); } catch (e) {}
  var mt = window.xhs && window.xhs.miniTool;
  if (mt && typeof mt.setStorage === "function") {
    try {
      var pending = mt.setStorage({ key: UNLOCK_KEY, data: json });
      if (pending && typeof pending.then === "function") pending.then(function () {}, function () {});
    } catch (e) {}
  }
}
function unlockEnding(id) {
  var s = unlockedEndings();
  s.add(id);
  writeUnlockList(Array.from(s));
}
function hydrateEndings() {
  var mt = window.xhs && window.xhs.miniTool;
  if (!mt || typeof mt.getStorage !== "function") return;
  var pending;
  try { pending = mt.getStorage({ key: UNLOCK_KEY }); } catch (e) { return; }
  if (!pending || typeof pending.then !== "function") return;
  pending.then(function (res) {
    var arr = [];
    try { arr = JSON.parse((res && res.data) || "[]"); } catch (e) { return; }
    if (!Array.isArray(arr) || !arr.length) return;
    var merged = new Set(readUnlockList());
    var before = merged.size;
    for (var i = 0; i < arr.length; i++) merged.add(arr[i]);
    if (merged.size !== before) {
      writeUnlockList(Array.from(merged));
      renderTitleUnlock();
    }
  }, function () {});
}"""


def patch_engine(text):
    text = replace_once(text, AGENT_MAP_OLD, AGENT_MAP_NEW, "Object.fromEntries")
    match = re.search(r"function copyText\(\) \{.*?\n\}\n", text, re.S)
    if not match:
        raise SystemExit("copyText() not found")
    text = text[:match.start()] + COPY_TEXT_NEW + text[match.end():]
    text = replace_once(text, "/* ---------- Canvas 结案卡 ---------- */",
                        SAVE_CARD_FN + "\n/* ---------- Canvas 结案卡 ---------- */", "card section")
    text = replace_once(text, CARD_OLD, CARD_NEW, "download block")
    text = replace_once(text, STORAGE_OLD, STORAGE_NEW, "unlock storage block")
    text = replace_once(text, "renderTimer();\nrenderTitleUnlock();\ninitCover();\ninitRail();",
                        "renderTimer();\nrenderTitleUnlock();\ninitCover();\ninitRail();\nhydrateEndings();",
                        "boot tail")
    return text


# ---------------------------------------------------------------- package

def main():
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(os.path.join(DIST, "js"))

    data = read(os.path.join(SRC, "data.js"))
    for name in KEYS:
        with open(os.path.join(PORTRAITS, name + ".webp"), "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        data = data.replace("%%IMG_" + name + "%%", "data:image/webp;base64," + b64)
    left = re.findall(r"%%IMG_[a-z]+%%", data)
    if left:
        raise SystemExit("unreplaced portraits: %s" % left)
    if re.search(r'px: "%data:|%"', data):
        raise SystemExit("portrait data URI is malformed")
    write(os.path.join(DIST, "js", "data.js"), data)

    shutil.copyfile(os.path.join(SRC, "scenes.js"), os.path.join(DIST, "js", "scenes.js"))

    engine = patch_engine(read(os.path.join(SRC, "engine.js")))
    for forbidden in ("navigator.clipboard", "a.download", "Object.fromEntries", "fetch(", "XMLHttpRequest"):
        if forbidden in engine:
            raise SystemExit("forbidden pattern remains in engine: %s" % forbidden)
    write(os.path.join(DIST, "js", "engine.js"), engine)

    styles = read(os.path.join(SRC, "styles.css"))
    write(os.path.join(DIST, "styles.css"), styles)
    write(os.path.join(DIST, "compat-base.css"), build_compat_css(styles))
    shutil.copyfile(os.path.join(OVERLAY, "minitool.css"), os.path.join(DIST, "minitool.css"))
    shutil.copyfile(os.path.join(OVERLAY, "compat.js"), os.path.join(DIST, "js", "compat.js"))

    shell = read(os.path.join(SRC, "shell.html"))
    shell = replace_once(
        shell,
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">',
        "viewport",
    )
    shell = re.sub(r'\s*<link rel="icon"[^>]*>', "", shell)
    shell = re.sub(
        r"<style>\s*/\*__CSS__\*/\s*</style>",
        '<link rel="stylesheet" href="./compat-base.css">\n'
        '<link rel="stylesheet" href="./styles.css">\n'
        '<link rel="stylesheet" href="./minitool.css">',
        shell,
    )
    shell = re.sub(
        r"<script>\s*/\*__JS__\*/\s*</script>",
        '<script src="./js/compat.js"></script>\n'
        '<script src="./js/data.js"></script>\n'
        '<script src="./js/scenes.js"></script>\n'
        '<script src="./js/engine.js"></script>',
        shell,
    )
    for marker in ("/*__CSS__*/", "/*__JS__*/", "<script>", "http://", "https://"):
        if marker in shell:
            raise SystemExit("unexpected marker in index.html: %s" % marker)
    write(os.path.join(DIST, "index.html"), shell)

    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as z:
        for base, _, files in os.walk(DIST):
            for name in files:
                full = os.path.join(base, name)
                rel = os.path.relpath(full, DIST).replace(os.sep, "/")
                z.write(full, rel)

    total = sum(os.path.getsize(os.path.join(base, name))
                for base, _, files in os.walk(DIST) for name in files)
    print("dist: %s (%.1f KB)" % (DIST, total / 1024.0))
    print("zip : %s (%.1f KB)" % (ZIP_PATH, os.path.getsize(ZIP_PATH) / 1024.0))


if __name__ == "__main__":
    main()
