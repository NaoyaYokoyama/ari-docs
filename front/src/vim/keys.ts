// Vim モードのキーの書き方（FN0702）。Vim と同じく 1 文字はそのまま、それ以外は <...> で書く
// 例: "j"、"gg"、"G"、"<C-d>"、"<Space>"。1 つの操作に複数割り当てるときは "," で区切る（"d, <C-d>"）

const NAMED: Record<string, string> = {
  esc: "<Esc>",
  escape: "<Esc>",
  cr: "<CR>",
  enter: "<CR>",
  return: "<CR>",
  space: "<Space>",
  tab: "<Tab>",
  bs: "<BS>",
  backspace: "<BS>",
  up: "<Up>",
  down: "<Down>",
  left: "<Left>",
  right: "<Right>",
  home: "<Home>",
  end: "<End>",
  pageup: "<PageUp>",
  pagedown: "<PageDown>",
  lt: "<",
};

// KeyboardEvent.key → 名前の付いたキー
const EVENT_KEYS: Record<string, string> = {
  Escape: "<Esc>",
  Enter: "<CR>",
  " ": "<Space>",
  Tab: "<Tab>",
  Backspace: "<BS>",
  ArrowUp: "<Up>",
  ArrowDown: "<Down>",
  ArrowLeft: "<Left>",
  ArrowRight: "<Right>",
  Home: "<Home>",
  End: "<End>",
  PageUp: "<PageUp>",
  PageDown: "<PageDown>",
};

// <...> の 1 つを正しい形にする。読めなければ null
function normalizeSpecial(token: string): string | null {
  const body = token.slice(1, -1);
  const parts = body.split("-");
  const base = parts.pop() ?? "";
  const mods = new Set(parts.map((part) => part.toUpperCase()));
  if ([...mods].some((mod) => mod !== "C" && mod !== "A" && mod !== "S")) {
    return null;
  }
  const named = NAMED[base.toLowerCase()];
  if (mods.size === 0) {
    return named ?? null;
  }
  // Shift だけの文字は大文字で書く（<S-g> は G）
  if (mods.size === 1 && mods.has("S") && base.length === 1) {
    return base.toUpperCase();
  }
  const key = named ? named.slice(1, -1) : base.length === 1 ? base.toLowerCase() : null;
  if (!key) {
    return null;
  }
  const prefix = ["C", "A", "S"].filter((mod) => mods.has(mod)).map((mod) => `${mod}-`).join("");
  return `<${prefix}${key}>`;
}

// "gg" → ["g", "g"]、"<C-d>" → ["<C-d>"]。読めなければ null
export function tokenize(sequence: string): string[] | null {
  const tokens: string[] = [];
  const pattern = /<[^<>\s]+>|\S/g;
  const compact = sequence.trim();
  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = pattern.exec(compact)) !== null) {
    if (match.index !== consumed) {
      return null;
    }
    consumed = match.index + match[0].length;
    const token = match[0].length > 1 ? normalizeSpecial(match[0]) : match[0];
    if (!token) {
      return null;
    }
    tokens.push(token);
  }
  return consumed === compact.length && tokens.length > 0 ? tokens : null;
}

// "d, <C-d>" → [["d"], ["<C-d>"]]。読めない部分は errors に入れる
export function parseBinding(text: string): { sequences: string[][]; errors: string[] } {
  const sequences: string[][] = [];
  const errors: string[] = [];
  for (const part of text.split(",").map((item) => item.trim()).filter(Boolean)) {
    const tokens = tokenize(part);
    if (tokens) {
      sequences.push(tokens);
    } else {
      errors.push(part);
    }
  }
  return { sequences, errors };
}

// 押したキーを上の書き方にする。IME の変換中・修飾キーだけのときは null
export function eventToken(event: KeyboardEvent): string | null {
  if (event.isComposing || event.key === "Process" || event.key === "Unidentified" || event.key === "Dead") {
    return null;
  }
  if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) {
    return null;
  }
  const named = EVENT_KEYS[event.key];
  if (event.ctrlKey || event.altKey || event.metaKey) {
    const base = named ? named.slice(1, -1) : event.key.length === 1 ? event.key.toLowerCase() : null;
    if (!base) {
      return null;
    }
    // 記号は Shift を押した結果の文字なので、Shift を付けない（Ctrl+? は <C-?>）
    const shift = event.shiftKey && (!!named || /^[a-z]$/.test(base));
    const mods = [event.ctrlKey || event.metaKey ? "C-" : "", event.altKey ? "A-" : "", shift ? "S-" : ""].join("");
    return `<${mods}${base}>`;
  }
  if (named) {
    return named;
  }
  return event.key.length === 1 ? event.key : null;
}

// 画面に出すとき（"<C-d>" → "Ctrl+D"、"<Space>" → "Space"）
export function displayToken(token: string) {
  if (token.length === 1) {
    return token;
  }
  const body = token.slice(1, -1);
  const parts = body.split("-");
  const base = parts.pop() ?? "";
  const names: Record<string, string> = { C: "Ctrl", A: "Alt", S: "Shift" };
  const label = base.length === 1 ? base.toUpperCase() : base;
  return [...parts.map((part) => names[part] ?? part), label].join("+");
}
