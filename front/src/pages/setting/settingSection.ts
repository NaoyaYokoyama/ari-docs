export const settingSections = [
  {
    id: "username",
    label: "ユーザー名変更",
  },
  {
    id: "password",
    label: "パスワード変更",
  },
] as const;

export type SettingSection =
  (typeof settingSections)[number]["id"];
