import type { DocEntry } from "@/types/docs";

// docs/00_概要/0090_ドキュメントルール.md に合わせたチェック
const REQUIRED_KEYS = ["id", "title", "type", "status", "updated"];
const STATUSES = ["草案", "レビュー中", "確定", "廃止"];
const ID_PATTERN =
  /\b(UT-(?:FN|SCR|API|TBL)\d{4}|FN\d{4}(?:-BR\d{2})?|SCR\d{4}|API\d{4}|TBL\d{4}|BAT\d{4}|IT\d{4}|OP\d{4}|TL\d{4})\b/g;

// ファイル名から期待される id（固定ファイルは拡張子を除いた名前、個別の文書は最初の "_" より前）
export function expectedId(name: string) {
  const stem = name.replace(/\.md$/, "");
  return /^\d/.test(stem) ? stem : stem.split("_")[0];
}

// "FN0301-BR02" -> "FN0301"
export function baseId(id: string) {
  return id.replace(/-BR\d{2}$/, "");
}

// "[A, B]" -> ["A", "B"]
export function parseList(value: string | undefined) {
  if (!value) {
    return [];
  }
  return value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

export function isTemplate(doc: DocEntry) {
  return doc.frontMatter.type === "テンプレート";
}

// id -> path。front matter が無い文書もファイル名から引けるようにする
export function buildIdIndex(docs: DocEntry[]) {
  const index = new Map<string, string>();
  for (const doc of docs) {
    const id = doc.frontMatter.id ?? expectedId(doc.name);
    if (!index.has(id)) {
      index.set(id, doc.path);
    }
  }
  return index;
}

export function checkDocs(docs: DocEntry[]) {
  const index = buildIdIndex(docs);
  const idCount = new Map<string, number>();
  for (const doc of docs) {
    const id = doc.frontMatter.id;
    if (id) {
      idCount.set(id, (idCount.get(id) ?? 0) + 1);
    }
  }

  const warnings = new Map<string, string[]>();
  for (const doc of docs) {
    const list: string[] = [];
    const fm = doc.frontMatter;

    if (!doc.hasFrontMatter) {
      list.push("先頭の YAML（front matter）がありません");
    } else {
      const missing = REQUIRED_KEYS.filter((key) => !fm[key]);
      if (missing.length > 0) {
        list.push(`必須項目がありません: ${missing.join(", ")}`);
      }
      if (fm.id && fm.id !== expectedId(doc.name)) {
        list.push(
          `id「${fm.id}」がファイル名と一致しません（期待値: ${expectedId(doc.name)}）`,
        );
      }
      if (fm.id && (idCount.get(fm.id) ?? 0) > 1) {
        list.push(`id「${fm.id}」が他の文書と重複しています`);
      }
      if (fm.status && !STATUSES.includes(fm.status)) {
        list.push(
          `status「${fm.status}」は使えません（${STATUSES.join(" / ")}）`,
        );
      }
      if (!isTemplate(doc)) {
        if (fm.updated && !/^\d{4}-\d{2}-\d{2}$/.test(fm.updated)) {
          list.push(`updated「${fm.updated}」は YYYY-MM-DD 形式にしてください`);
        }
        const unknown = parseList(fm.related).filter(
          (id) => !index.has(baseId(id)),
        );
        if (unknown.length > 0) {
          list.push(
            `related に存在しない ID があります: ${unknown.join(", ")}`,
          );
        }
      }
    }

    warnings.set(doc.path, list);
  }
  return warnings;
}

// 本文中の ID をリンクにする（コードブロック・インラインコード内は対象外）
export function linkifyIds(markdown: string, index: Map<string, string>) {
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) {
        return line;
      }
      return line
        .split(/(`[^`]*`)/)
        .map((part) =>
          part.startsWith("`")
            ? part
            : part.replace(ID_PATTERN, (id) =>
                index.has(baseId(id)) ? `[${id}](#doc:${id})` : id,
              ),
        )
        .join("");
    })
    .join("\n");
}

// "<!-- ガイド -->" を見える形にする
export function showGuides(markdown: string) {
  return markdown.replace(
    /<!--\s*([\s\S]*?)\s*-->/g,
    '<span style="color:#64748b;font-size:0.85em">📝 $1</span>',
  );
}

// 先頭の front matter を取り除く
export function stripFrontMatter(content: string) {
  const match = content.match(/^---\n[\s\S]*?\n---\n*/);
  return match ? content.slice(match[0].length) : content;
}

// 現在の文書から見た相対パスを docs/ からのパスにする
export function resolveRelativePath(currentPath: string, href: string) {
  const parts = currentPath.split("/").slice(0, -1);
  for (const segment of href.split("#")[0].split("/")) {
    if (segment === "..") {
      parts.pop();
    } else if (segment !== "." && segment !== "") {
      parts.push(decodeURIComponent(segment));
    }
  }
  return parts.join("/");
}
