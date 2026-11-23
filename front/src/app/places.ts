import { personalSettingsChanged } from "@/app/personalSettings";
import type { PlaceColor, PlacesConfig } from "@/types/setup";

// デスクトップアプリの場所（自分の PC と共有サーバー。FN0002-BR20）。
// 切り替えは画面を読み込み直すだけにする（アプリは再起動しない。データ・ログインは場所ごとに別）

export const LOCAL_PLACE_ID = "local";
export const DEFAULT_LOCAL_NAME = "自分の PC";

export type Place = {
  // 自分の PC は "local"、共有サーバーは URL
  id: string;
  name: string;
  // 共有サーバーの URL（自分の PC は空文字）
  url: string;
  color: PlaceColor;
  local: boolean;
};

export const PLACE_COLORS: { value: PlaceColor; label: string }[] = [
  { value: "", label: "既定" },
  { value: "gray", label: "灰" },
  { value: "blue", label: "青" },
  { value: "green", label: "緑" },
  { value: "amber", label: "黄" },
  { value: "red", label: "赤" },
  { value: "violet", label: "紫" },
];

// 色の印のクラス（global.css の --place-*）
export const PLACE_COLOR_CLASS: Record<PlaceColor, string> = {
  "": "bg-brand",
  gray: "bg-place-gray",
  blue: "bg-place-blue",
  green: "bg-place-green",
  amber: "bg-place-amber",
  red: "bg-place-red",
  violet: "bg-place-violet",
};

// 自分の PC を先頭に、登録した順に並べる
export function placeList(config: PlacesConfig): Place[] {
  return [
    {
      id: LOCAL_PLACE_ID,
      name: config.localName || DEFAULT_LOCAL_NAME,
      url: "",
      color: config.localColor,
      local: true,
    },
    ...config.servers.map((server) => ({
      id: server.url,
      name: server.name,
      url: server.url,
      color: server.color,
      local: false,
    })),
  ];
}

// 今の場所（この起動の間。読み込み直しても残る）と、前回の場所（次の起動で使う）
const CURRENT_KEY = "ari-docs-current-place";
const LAST_KEY = "ari-docs-last-place";

function read(storage: () => Storage, key: string) {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch {
    // 保存できなければ、次の起動では起動したときの場所の設定に従う
  }
}

// 起動したとき・読み込み直したときの場所。切り替えた場所 → 起動したときの場所の設定（前回なら前回の場所）→ 自分の PC
export function initialPlace(config: PlacesConfig): Place {
  const places = placeList(config);
  const find = (id: string | null) => places.find((place) => place.id === id);
  const start = config.startPlace === "last" ? read(() => localStorage, LAST_KEY) : config.startPlace;
  return find(read(() => sessionStorage, CURRENT_KEY)) ?? find(start) ?? places[0];
}

export function rememberPlace(id: string) {
  write(() => sessionStorage, CURRENT_KEY, id);
  write(() => localStorage, LAST_KEY, id);
  personalSettingsChanged();
}

// 場所を切り替える。ホームから読み込み直す（場所ごとにデータが違うため、今の画面は引き継がない）
export function switchPlace(id: string) {
  rememberPlace(id);
  window.location.assign("/");
}
