import { useCallback } from "react";

import { createTask, notifyTasksChanged } from "@/api/task";
import { useApp } from "@/app/AppContext";
import { type AriLink, toAriLink } from "@/lib/ariLink";
import { errorMessage } from "@/lib/format";

// ファイル・フォルダ・Note・Wiki から「タスクにする」（FN0602-BR12）。名前をタイトルに、ari:// のリンクをメモに入れて未着手の一番上に足す
export function useMakeTask() {
  const { showMessage } = useApp();
  return useCallback(
    async (link: AriLink, name: string) => {
      const title = `${name}`.trim().slice(0, 100) || "（名前なし）";
      try {
        await createTask({ title, description: toAriLink(link), priority: "medium", dueDate: "" });
        notifyTasksChanged();
        showMessage("info", `タスク「${title}」を足しました（メモのリンクから開けます）`);
      } catch (error) {
        showMessage("error", errorMessage(error, "タスクにできませんでした"));
      }
    },
    [showMessage],
  );
}
