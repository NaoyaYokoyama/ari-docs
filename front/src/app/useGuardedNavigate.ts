import { useCallback } from "react";
import { type NavigateOptions, useLocation, useNavigate } from "react-router-dom";

import { useApp } from "@/app/AppContext";

// 未保存の変更があれば確認してから画面を移動する（FN0001-BR05。ヘッダーとショートカットで使う）
export function useGuardedNavigate() {
  const { isDirty, setIsDirty, showConfirm } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    async (path: string, options?: NavigateOptions) => {
      if (location.pathname === path && !options?.state) {
        return;
      }
      if (isDirty) {
        const confirmed = await showConfirm(
          "未保存の変更があります。破棄して移動しますか？",
        );
        if (!confirmed) {
          return;
        }
        setIsDirty(false);
      }
      navigate(path, options);
    },
    [isDirty, location.pathname, navigate, setIsDirty, showConfirm],
  );
}
