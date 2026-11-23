import { useMemo } from "react";

import { useApp } from "@/app/AppContext";

import { navigationItems, useShortcutVersion } from "./shortcut";

// ヘッダーに出す画面と Alt+数字（Docs を使う設定かで変わる）
export function useNavigation() {
  const { user } = useApp();
  const docsEnabled = !!user?.docsEnabled;
  // キーを変えたら作り直す（FN0701-BR16）
  const version = useShortcutVersion();
  return useMemo(() => (version >= 0 ? navigationItems(docsEnabled) : []), [docsEnabled, version]);
}
