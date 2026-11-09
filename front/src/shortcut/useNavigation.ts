import { useMemo } from "react";

import { useApp } from "@/app/AppContext";

import { navigationItems } from "./shortcut";

// ヘッダーに出す画面と Alt+数字（Docs を使う設定かで変わる）
export function useNavigation() {
  const { user } = useApp();
  const docsEnabled = !!user?.docsEnabled;
  return useMemo(() => navigationItems(docsEnabled), [docsEnabled]);
}
