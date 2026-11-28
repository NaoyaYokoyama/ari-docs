// 使い方の説明書（manual/ の Markdown）を PDF にする。
//   node manual/build.mjs            … すべて
//   node manual/build.mjs 01         … 番号が 01 で始まるものだけ
// 要るもの: pandoc（Markdown → HTML）と Chrome か Edge（HTML → PDF）。ほかの部品は入れない。
// Chrome の場所は環境変数 CHROME で指定できる（無ければよくある場所を探す）。
// 出来上がりは manual/pdf/<名前>.pdf。版はアプリの版（back/Cargo.toml）を表紙に入れる
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, "pdf");
const only = process.argv[2];

const version = /^version = "(.+)"/m.exec(fs.readFileSync(path.join(dir, "../back/Cargo.toml"), "utf8"))[1];
const now = new Date();
const date = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

function findChrome() {
  const candidates = [
    process.env.CHROME,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const found = candidates.find((file) => file && fs.existsSync(file));
  if (!found) {
    throw new Error("Chrome か Edge が見つかりません。環境変数 CHROME に場所を書いてください");
  }
  return found;
}

// Markdown → 1 つで完結する HTML（画像・見た目を中に入れる）
function toHtml(source, html) {
  execFileSync(
    "pandoc",
    [
      source,
      "--from=markdown-implicit_figures+raw_html",
      "--to=html5",
      "--standalone",
      "--template", path.join(dir, "assets/template.html"),
      "--css", path.join(dir, "assets/style.css"),
      "--toc",
      "--toc-depth=2",
      "--embed-resources",
      "--resource-path", dir,
      "--metadata", `version=${version}`,
      "--metadata", `date=${date}`,
      "--output", html,
    ],
    { stdio: "inherit" },
  );
}

// Chrome の DevTools の窓口で PDF を作る（ページ番号を下に入れるため。コマンドの --print-to-pdf では入れられない）
async function withChrome(run) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ari-manual-"));
  const chrome = spawn(findChrome(), [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ]);
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = pages.find((page) => page.type === "page");
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    let nextId = 1;
    const waiting = new Map();
    const events = new Map();
    socket.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.id && waiting.has(data.id)) {
        const { resolve, reject } = waiting.get(data.id);
        waiting.delete(data.id);
        if (data.error) {
          reject(new Error(data.error.message));
        } else {
          resolve(data.result);
        }
      } else if (data.method && events.has(data.method)) {
        events.get(data.method)();
        events.delete(data.method);
      }
    };
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        waiting.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    const once = (method) => new Promise((resolve) => events.set(method, resolve));
    await run({ send, once });
    socket.close();
  } finally {
    chrome.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

async function toPdf({ send, once }, html, pdf, title) {
  await send("Page.enable");
  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url: pathToFileURL(html).href });
  await loaded;
  await send("Runtime.evaluate", { expression: "document.fonts.ready.then(() => true)", awaitPromise: true });
  const small = "font-size:8px;color:#8a8f98;width:100%;padding:0 14mm;font-family:'Noto Sans CJK JP','Yu Gothic','Meiryo',sans-serif;";
  const result = await send("Page.printToPDF", {
    paperWidth: 8.27,
    paperHeight: 11.69,
    marginTop: 0.75,
    marginBottom: 0.75,
    marginLeft: 0.7,
    marginRight: 0.7,
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="${small}text-align:right;">ari-docs ${title}</div>`,
    footerTemplate: `<div style="${small}text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
  });
  fs.writeFileSync(pdf, Buffer.from(result.data, "base64"));
}

const sources = fs
  .readdirSync(dir)
  .filter((name) => /^\d\d_.+\.md$/.test(name) && (!only || name.startsWith(only)))
  .sort();
fs.mkdirSync(outDir, { recursive: true });
await withChrome(async (browser) => {
  for (const name of sources) {
    const base = name.replace(/\.md$/, "");
    const title = base.replace(/^\d\d_/, "");
    const html = path.join(os.tmpdir(), `ari-manual-${process.pid}-${base}.html`);
    toHtml(path.join(dir, name), html);
    const pdf = path.join(outDir, `ari-docs_${title}.pdf`);
    await toPdf(browser, html, pdf, title);
    fs.rmSync(html);
    console.log(`作りました: ${path.relative(process.cwd(), pdf)}`);
  }
});
