import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

// Markdown の表示で、本文に書かれた HTML を安全なものだけにする（Note・Wiki・Folder の .md のプレビュー・Docs）。
// 表示の部品（@uiw/react-md-editor）は本文の HTML をそのまま出すので、ほかの人が書いた本文・置いたファイルを開いただけで
// プログラムが動いてしまう（埋め込みの画面・フォームなど）。GitHub と同じ許可の範囲に絞る。
// 表示の部品の rehypePlugins に渡す（部品が加える見出しのリンク・コピーのボタンの後、コードの色付けの前に動く）

// 付けてよい class（表示の部品・注意書きの枠・チェックの一覧が付けるもの）。
// 画面の class（fixed・inset-0 など）を書いて画面の上に別のものを重ねられないよう、ほかは消す
const SAFE_CLASS =
  /^(?:language-[\w-]+|markdown-alert(?:-[\w-]+)?|octicon(?:-[\w-]+)?|anchor|copied|task-list-item|contains-task-list)$/;

const schema = {
  ...defaultSchema,
  // 見出しのリンク（#見出し）が使えるよう、id の頭に user-content- を付けない（name だけ付ける）
  clobber: ["name"],
  protocols: {
    ...defaultSchema.protocols,
    // ari-docs のリンク（ari://…。FN0004）
    href: [...(defaultSchema.protocols?.href ?? []), "ari"],
  },
  tagNames: [...(defaultSchema.tagNames ?? []), "svg", "path"],
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      ["className", SAFE_CLASS],
      ["class", SAFE_CLASS],
      "style",
      "ariaHidden",
      "tabIndex",
      "dataCode",
      "data-code",
    ],
    // 表示の部品・注意書きの枠のアイコン
    svg: ["viewBox", "fill", "width", "height", "version"],
    path: ["d", "fillRule"],
  },
};

// style は文字の色・背景の色・太さなどだけを残す（位置・大きさ・画像の読み込みは消す）
const STYLE_KEEP = new Set(["color", "background-color", "font-weight", "font-style", "text-decoration", "text-align"]);

export function safeStyle(value: string) {
  return value
    .split(";")
    .map((declaration) => {
      const colon = declaration.indexOf(":");
      if (colon < 0) {
        return null;
      }
      const name = declaration.slice(0, colon).trim().toLowerCase();
      const body = declaration.slice(colon + 1).trim();
      if (!STYLE_KEEP.has(name) || !/^[#\w\s.,%()-]+$/.test(body) || /url|expression|var|attr|image/i.test(body)) {
        return null;
      }
      return `${name}: ${body}`;
    })
    .filter((declaration) => declaration !== null)
    .join("; ");
}

type HastNode = {
  type: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function rehypeSafeStyle() {
  const walk = (node: HastNode) => {
    const style = node.properties?.style;
    if (node.properties && typeof style === "string") {
      const kept = safeStyle(style);
      if (kept) {
        node.properties.style = kept;
      } else {
        delete node.properties.style;
      }
    }
    node.children?.forEach(walk);
  };
  return (tree: HastNode) => walk(tree);
}

export const safeRehypePlugins: [[typeof rehypeSanitize, typeof schema], typeof rehypeSafeStyle] = [
  [rehypeSanitize, schema],
  rehypeSafeStyle,
];
