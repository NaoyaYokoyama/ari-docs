#!/usr/bin/env python3
# 配布物に同梱する第三者のソフトウェアのライセンス（THIRD_PARTY_NOTICES.txt）を作る（FN0903-BR05・OP0002）。
# 手で書いた部分（manual.txt。文字認識のモデル・ONNX Runtime・C++ のランタイムなど）の後に、
# アプリに組み込む Rust の crate（back・desktop/src-tauri の通常の依存。Windows・Linux）と
# 画面に組み込む npm のパッケージ（front の dependencies）の名前・版・ライセンス・著作権の表示・ライセンスの全文を足す。
# 依存を足したり上げたりしたら、リポジトリの直下で python3 back/licenses/generate.py を実行してコミットする
import hashlib
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "back", "licenses", "THIRD_PARTY_NOTICES.txt")
MANUAL = os.path.join(ROOT, "back", "licenses", "manual.txt")
TARGETS = ["x86_64-unknown-linux-gnu", "x86_64-pc-windows-msvc"]
LICENSE_FILE = re.compile(r"^(LICEN[CS]E|COPYING|COPYRIGHT|NOTICE|UNLICENSE)([-._].*)?$", re.I)
RULE = "=" * 72


def license_files(directory, extra=None):
    names = []
    if extra:
        names.append(extra)
    try:
        for name in sorted(os.listdir(directory)):
            if LICENSE_FILE.match(name) and os.path.isfile(os.path.join(directory, name)):
                names.append(name)
    except OSError:
        return []
    texts = []
    seen = set()
    for name in names:
        path = os.path.normpath(os.path.join(directory, name))
        if path in seen or not os.path.isfile(path):
            continue
        seen.add(path)
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read().replace("\r\n", "\n").strip()
        if text:
            texts.append(text)
    return texts


def crates(project):
    found = {}
    for target in TARGETS:
        meta = json.loads(
            subprocess.check_output(
                ["cargo", "metadata", "--format-version", "1", "--locked", "--filter-platform", target],
                cwd=os.path.join(ROOT, project),
            )
        )
        packages = {p["id"]: p for p in meta["packages"]}
        nodes = {n["id"]: n for n in meta["resolve"]["nodes"]}
        # 通常の依存だけをたどる（開発・ビルドのときだけ使うものは配布物に入らない）
        stack = list(meta["workspace_members"])
        seen = set(stack)
        while stack:
            node = nodes[stack.pop()]
            for dep in node["deps"]:
                if any(kind["kind"] is None for kind in dep["dep_kinds"]) and dep["pkg"] not in seen:
                    seen.add(dep["pkg"])
                    stack.append(dep["pkg"])
        for pid in seen:
            p = packages[pid]
            if p["source"] is None:
                continue
            directory = os.path.dirname(p["manifest_path"])
            found[(p["name"], p["version"])] = {
                "name": p["name"],
                "version": p["version"],
                "license": p.get("license") or "（license_file を参照）",
                "authors": ", ".join(p.get("authors") or []),
                "url": p.get("repository") or p.get("homepage") or "",
                "texts": license_files(directory, p.get("license_file")),
            }
    return found


def npm_packages():
    front = os.path.join(ROOT, "front")
    out = subprocess.run(
        ["npm", "ls", "--omit=dev", "--all", "--parseable"],
        cwd=front,
        capture_output=True,
        text=True,
        shell=os.name == "nt",
    ).stdout
    found = {}
    for path in sorted(set(line.strip() for line in out.splitlines() if line.strip())):
        if os.path.normpath(path) == os.path.normpath(front):
            continue
        manifest = os.path.join(path, "package.json")
        if not os.path.isfile(manifest):
            continue
        with open(manifest, encoding="utf-8") as f:
            p = json.load(f)
        license = p.get("license") or ""
        if isinstance(license, dict):
            license = license.get("type", "")
        author = p.get("author") or ""
        if isinstance(author, dict):
            author = author.get("name", "")
        repository = p.get("repository") or p.get("homepage") or ""
        if isinstance(repository, dict):
            repository = repository.get("url", "")
        found[(p["name"], p["version"])] = {
            "name": p["name"],
            "version": p["version"],
            "license": license or "（ライセンスのファイルを参照）",
            "authors": author,
            "url": repository,
            "texts": license_files(path),
        }
    return found


# 部品にライセンスのファイルが無いときは、標準の全文を指す（MIT・Apache-2.0 は上の手で書いた部分に全文がある）
def fallback(expression):
    ids = sorted(set(re.findall(r"[A-Za-z0-9.+-]+", expression)) - {"OR", "AND", "WITH"})
    places = []
    for spdx in ids:
        if spdx in ("MIT", "Apache-2.0"):
            places.append(f"{spdx}: 上の「{'MIT License' if spdx == 'MIT' else 'Apache License 2.0'}」")
        else:
            places.append(f"{spdx}: https://spdx.org/licenses/{spdx}.html")
    return "（部品にファイルなし）" + "・".join(places)


def main():
    rust = {}
    for project in ["back", os.path.join("desktop", "src-tauri")]:
        rust.update(crates(project))
    npm = npm_packages()

    # 同じ全文（Apache-2.0 など）は 1 回だけ載せ、番号で指す
    bodies = {}
    order = []

    def ref(text):
        key = hashlib.sha256(re.sub(r"\s+", " ", text).encode()).hexdigest()
        if key not in bodies:
            bodies[key] = (len(order) + 1, text)
            order.append(key)
        return bodies[key][0]

    lines = []

    def section(title, items):
        lines.append(RULE)
        lines.append(title)
        lines.append(RULE)
        for item in sorted(items.values(), key=lambda i: (i["name"].lower(), i["version"])):
            refs = [f"[L{ref(text)}]" for text in item["texts"]]
            lines.append(f"{item['name']} {item['version']}")
            lines.append(f"   License: {item['license']}")
            if item["authors"]:
                lines.append(f"   Authors: {item['authors']}")
            if item["url"]:
                lines.append(f"   {item['url']}")
            lines.append(f"   全文: {' '.join(refs) if refs else fallback(item['license'])}")
        lines.append("")

    section(f"アプリに組み込んでいる Rust の部品（crate。{len(rust)} 個）", rust)
    section(f"画面に組み込んでいる JavaScript の部品（npm。{len(npm)} 個）", npm)
    lines.append(RULE)
    lines.append("ライセンスの全文（上の [L番号] で指す）")
    lines.append(RULE)
    for key in order:
        number, text = bodies[key]
        lines.append(f"---- [L{number}] " + "-" * 40)
        lines.append(text)
        lines.append("")

    with open(MANUAL, encoding="utf-8") as f:
        manual = f.read().rstrip("\n")
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(manual + "\n\n" + "\n".join(lines).rstrip("\n") + "\n")
    sys.stdout.write(f"rust {len(rust)} / npm {len(npm)} / texts {len(order)}\n")


if __name__ == "__main__":
    main()
