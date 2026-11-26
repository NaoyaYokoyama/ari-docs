import { getContentFolders } from "@/api/contentFolder";
import type { ContentKind } from "@/pages/content/contentKinds";

// Note・Wiki のひな形（FN0401-BR16）。作るときに選ぶと、タイトルと本文を入れて作る
export type ContentTemplate = {
  id: string;
  name: string;
  // 作るときのタイトル（{{日付}} などを置き換える。空なら自分で入れる）
  title: string;
  body: string;
  // 自分で足したもの（「ひな形」フォルダの Note・Wiki）
  custom?: boolean;
};

// このフォルダ（一番上）に入れた Note・Wiki をひな形として出す
export const TEMPLATE_FOLDER = "ひな形";
// 「ひな形」フォルダにこのタイトルの Note があれば、今日の Note をそれで作る（FN0401-BR15）
export const TODAY_TEMPLATE = "今日の Note";

const DAILY = `## 今日やったこと


## 明日やること


## 困っていること・相談

`;

const MINUTES = `- 日時: {{日付}}（{{曜日}}） {{時刻}}〜
- 場所:
- 出席者:

## 議題


## 決まったこと


## 宿題（だれが・何を・いつまでに）

`;

const WEEKLY = `## 今週やったこと


## 来週やること


## 気づき・共有したいこと

`;

const PROCEDURE = `## 目的


## 準備するもの


## 手順


## うまくいかないとき


---

最後に確かめた日: {{日付}}
`;

const BUILTIN: Record<ContentKind["kind"], ContentTemplate[]> = {
  note: [
    { id: "daily", name: "日報", title: "日報 {{日付}}", body: DAILY },
    { id: "minutes", name: "議事録", title: "議事録 {{日付}}", body: MINUTES },
    { id: "weekly", name: "週報", title: "週報 {{今週}}", body: WEEKLY },
  ],
  wiki: [
    { id: "procedure", name: "手順書", title: "", body: PROCEDURE },
    { id: "minutes", name: "議事録", title: "議事録 {{日付}}", body: MINUTES },
  ],
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function ymd(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// {{日付}}・{{曜日}}・{{時刻}}・{{今週}}（月曜〜金曜）を置き換える
export function fillTemplate(text: string, now = new Date()) {
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const short = (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`;
  return text
    .replaceAll("{{日付}}", ymd(now))
    .replaceAll("{{曜日}}", WEEKDAYS[now.getDay()])
    .replaceAll("{{時刻}}", `${pad(now.getHours())}:${pad(now.getMinutes())}`)
    .replaceAll("{{今週}}", `${short(monday)}〜${short(friday)}`);
}

// 自分で足したひな形（一番上の「ひな形」フォルダの中の Note・Wiki）。タイトルがひな形の名前
export async function customTemplates(kind: ContentKind): Promise<ContentTemplate[]> {
  const { folders, items } = await getContentFolders(kind.kind);
  const folder = folders.find((item) => item.parentId === "" && item.name === TEMPLATE_FOLDER);
  if (!folder) {
    return [];
  }
  const ids = items.filter((item) => item.folderId === folder.folderId).map((item) => item.itemId);
  const details = await Promise.all(ids.map((id) => kind.get(id)));
  return details
    .map((detail) => ({
      id: `custom:${detail.id}`,
      // 名前には {{日付}} などを出さない
      name: detail.title.replace(/\{\{[^}]*\}\}/g, "").trim() || detail.title,
      // タイトルに {{日付}} などがあれば、それをもとにする
      title: detail.title.includes("{{") ? detail.title : "",
      body: detail.content,
      custom: true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export function builtinTemplates(kind: ContentKind) {
  return BUILTIN[kind.kind];
}
