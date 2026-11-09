import {
  BookA,
  DatabaseBackup,
  FileCheck,
  FolderCog,
  Info,
  Keyboard,
  KeyRound,
  Laptop,
  type LucideIcon,
  MousePointerClick,
  Palette,
  ScrollText,
  Server,
  SlidersHorizontal,
  SquareTerminal,
  UserRound,
  Users,
} from "lucide-react";

import type { LoginUser } from "@/app/AppContext";
import type { SetupStatus } from "@/types/setup";

type Section = {
  id: string;
  label: string;
  icon: LucideIcon;
  group: SettingGroup;
  // 設定の検索で一致させる言葉（画面に出ている言葉と、探すときに使いそうな言葉）
  keywords: string;
  // ローカルモードではログインしないため、共有モードのときだけ表示する
  sharedOnly?: boolean;
  // 共有モードでは使えない（Docs の初期フォルダはサーバーのフォルダを指すため）
  localOnly?: boolean;
  // 共有モードの管理者だけ
  adminOnly?: boolean;
  // ローカルモード、または共有モードの管理者だけ（全員のデータに効く管理の操作）
  manageOnly?: boolean;
  // Docs を使う設定（サーバーの設定）のときだけ
  docsOnly?: boolean;
  // デスクトップアプリだけのもの
  desktopOnly?: boolean;
  // デスクトップアプリの個人用だけ（作業フォルダ。FN0002）
  desktopLocalOnly?: boolean;
};

// メニューのまとまり（この順に表示する）
export const settingGroups = ["アカウント", "表示と操作", "検索", "管理", "このアプリ", "その他"] as const;
export type SettingGroup = (typeof settingGroups)[number];

export const settingSections = [
  { id: "username", label: "ユーザー名", icon: UserRound, group: "アカウント", keywords: "名前 表示名 プロフィール" },
  {
    id: "password",
    label: "パスワードとログイン",
    icon: KeyRound,
    group: "アカウント",
    keywords: "パスワード 変更 ログイン 端末 PC ログアウト セッション セキュリティ",
    sharedOnly: true,
  },
  {
    id: "appearance",
    label: "表示",
    icon: Palette,
    group: "表示と操作",
    keywords: "配色 テーマ ダーク ライト 色 文字 大きさ フォント 拡大 アニメーション 動き 見やすく",
  },
  {
    id: "behavior",
    label: "操作",
    icon: MousePointerClick,
    group: "表示と操作",
    keywords: "起動 最初 開く 画面 前回 エディタ 編集 プレビュー 分割 削除 確認 ゴミ箱 隠しファイル ドット プレビュー 右 中身 ボタン 説明 ヒント ツールチップ",
  },
  {
    id: "shortcuts",
    label: "ショートカット",
    icon: Keyboard,
    group: "表示と操作",
    keywords: "キーボード キー 操作 早く",
  },
  {
    id: "vim",
    label: "Vim モード",
    icon: SquareTerminal,
    group: "表示と操作",
    keywords: "vim vimium vi hjkl キー 割り当て カスタマイズ スクロール ヒント エディタ vimrc ノーマル 挿入",
  },
  {
    id: "dictionary",
    label: "検索の辞書",
    icon: BookA,
    group: "検索",
    keywords: "辞書 単語 用語 業界 中身 検索 取り込み",
  },
  {
    id: "formats",
    label: "対応するファイル",
    icon: FileCheck,
    group: "検索",
    keywords: "ファイル 形式 拡張子 対応 Excel Word PowerPoint PDF テキスト 画像 プレビュー 中身 検索",
  },
  {
    id: "users",
    label: "ユーザー管理",
    icon: Users,
    group: "管理",
    keywords: "ユーザー 登録 追加 削除 パスワード 再設定 管理者 権限",
    adminOnly: true,
  },
  {
    id: "server",
    label: "サーバーの設定",
    icon: Server,
    group: "管理",
    keywords: "ログイン ロック 失敗 セッション 期限 日数 履歴 版 保存 セキュリティ Docs Markdown 機能 表示 非表示",
    manageOnly: true,
  },
  {
    id: "backup",
    label: "バックアップ",
    icon: DatabaseBackup,
    group: "管理",
    keywords: "バックアップ 復元 定期 保存 ゴミ箱 期間",
    manageOnly: true,
  },
  {
    id: "mode",
    label: "使い方",
    icon: Laptop,
    group: "このアプリ",
    keywords: "個人用 共有 サーバー 接続 URL モード",
    desktopOnly: true,
  },
  {
    id: "workspace",
    label: "作業フォルダ",
    icon: FolderCog,
    group: "このアプリ",
    keywords: "フォルダ 場所 データ 保存先",
    desktopLocalOnly: true,
  },
  {
    id: "docs",
    label: "Docs の初期フォルダ",
    icon: ScrollText,
    group: "このアプリ",
    keywords: "Docs Markdown フォルダ 設計書",
    localOnly: true,
    docsOnly: true,
  },
  {
    id: "transfer",
    label: "設定の書き出し・初期化",
    icon: SlidersHorizontal,
    group: "その他",
    keywords: "書き出し 読み込み エクスポート インポート 移す 引っ越し 初期化 リセット 戻す",
  },
  {
    id: "about",
    label: "情報",
    icon: Info,
    group: "その他",
    keywords: "バージョン 情報 問い合わせ 容量 DB 件数 場所",
  },
] as const satisfies readonly Section[];

export type SettingSection = (typeof settingSections)[number]["id"];

// 動作モード・権限・デスクトップアプリの使い方に応じて表示するメニュー
export function visibleSettingSections(
  user: LoginUser | null,
  desktop: SetupStatus | null,
) {
  const shared = user?.mode === "shared";
  return settingSections.filter(
    (section: Section) =>
      (!section.sharedOnly || shared) &&
      (!section.localOnly || !shared) &&
      (!section.adminOnly || (shared && user?.isAdmin)) &&
      (!section.manageOnly || !shared || user?.isAdmin) &&
      (!section.docsOnly || user?.docsEnabled) &&
      (!section.desktopOnly || desktop) &&
      (!section.desktopLocalOnly || desktop?.mode === "local"),
  );
}

export function isVisibleSection(
  id: string,
  user: LoginUser | null,
  desktop: SetupStatus | null,
): id is SettingSection {
  return visibleSettingSections(user, desktop).some((section) => section.id === id);
}

// 設定の検索。空白で区切った語をすべて、名前・まとまり・言葉のどれかに含むもの
export function matchSection(section: (typeof settingSections)[number], query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${section.label} ${section.group} ${section.keywords}`.toLowerCase();
  return words.every((word) => text.includes(word));
}
