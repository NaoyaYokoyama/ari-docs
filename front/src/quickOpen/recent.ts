// 最近開いたもの（探して開く。FN0003）。この PC（localStorage）に、利用者ごとに新しい順で残す。サーバーには送らない
export type RecentKind = "note" | "wiki" | "folder" | "file";

export type RecentEntry = {
  kind: RecentKind;
  // noteId / wikiId（ノードは空文字。ノードはパスで指す）
  id: string;
  name: string;
  // 入っているところ（Note・Wiki はフォルダの名前を "/" でつないだもの、ノードは親のパス）
  location: string;
  // ノードの folder/ からの相対パス
  path: string;
};

const MAX = 30;
const KINDS: RecentKind[] = ["note", "wiki", "folder", "file"];

function storageKey(userId: string) {
  return `recent-opened:${userId}`;
}

export function recentKey(entry: Pick<RecentEntry, "kind" | "id" | "path">) {
  return entry.kind === "note" || entry.kind === "wiki" ? `${entry.kind}:${entry.id}` : `node:${entry.path}`;
}

export function readRecent(userId: string): RecentEntry[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "[]");
    if (!Array.isArray(value)) {
      return [];
    }
    // 壊れた行は使わない（手で直した場合など）
    return value
      .filter(
        (entry): entry is RecentEntry =>
          entry &&
          KINDS.includes(entry.kind) &&
          ["id", "name", "location", "path"].every((key) => typeof entry[key] === "string"),
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function write(userId: string, entries: RecentEntry[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(entries.slice(0, MAX)));
  } catch {
    // 保存できなくても開くことはできる
  }
}

// 開いたものを先頭にする（同じものは 1 つにまとめる）
export function rememberOpened(userId: string | undefined, entry: RecentEntry) {
  if (!userId) {
    return;
  }
  const key = recentKey(entry);
  write(userId, [entry, ...readRecent(userId).filter((other) => recentKey(other) !== key)]);
}

// 消えたもの（開こうとして見つからなかったもの）を除く
export function forgetOpened(userId: string | undefined, entry: Pick<RecentEntry, "kind" | "id" | "path">) {
  if (!userId) {
    return;
  }
  const key = recentKey(entry);
  write(
    userId,
    readRecent(userId).filter((other) => recentKey(other) !== key),
  );
}

// Note・Wiki の一覧を読んだときに、消えたものを除き、名前・場所を今のものにする（順は変えない）
export function syncRecent(
  userId: string | undefined,
  kind: "note" | "wiki",
  current: Map<string, Pick<RecentEntry, "name" | "location">>,
) {
  if (!userId) {
    return;
  }
  const entries = readRecent(userId);
  const next = entries.flatMap((entry) => {
    if (entry.kind !== kind) {
      return [entry];
    }
    const found = current.get(entry.id);
    return found ? [{ ...entry, ...found }] : [];
  });
  if (JSON.stringify(next) !== JSON.stringify(entries)) {
    write(userId, next);
  }
}
