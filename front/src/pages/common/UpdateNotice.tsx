import { Download } from "lucide-react";
import { useEffect } from "react";

import {
  checkUpdate,
  dismissUpdate,
  useInstallUpdate,
  useUpdateDismissed,
  useUpdateState,
} from "@/app/appUpdate";
import { useDesktop } from "@/app/DesktopContext";
import Button from "@/components/common/Button";

// 共有サーバーにつないでいるときは、ログインした後に 1 回、新しい版を調べる（FN0904-BR03）。
// 自分の PC のときは調べない（設定の「情報」で押したときだけ。FN0904-BR04）
let checked = false;

// 新しい版のお知らせ（FN0904-BR05）。ヘッダーの下に出す
export default function UpdateNotice() {
  const desktop = useDesktop();
  const state = useUpdateState();
  const dismissed = useUpdateDismissed();
  const install = useInstallUpdate();
  const serverUrl = desktop && !desktop.place.local ? desktop.place.url : "";

  useEffect(() => {
    if (!serverUrl || checked) {
      return;
    }
    checked = true;
    void checkUpdate(serverUrl);
  }, [serverUrl]);

  if (state.kind === "installing") {
    return (
      <div className="flex items-center gap-3 border-b border-border bg-muted px-4 py-2 text-sm">
        <Download size={16} className="shrink-0 text-muted-foreground" />
        新しい版を取ってきています{state.percent !== null ? `（${state.percent}%）` : ""}
      </div>
    );
  }
  if (state.kind !== "available" || dismissed) {
    return null;
  }
  return (
    <div className="flex items-center gap-3 border-b border-border bg-muted px-4 py-2 text-sm">
      <Download size={16} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        新しい版（{state.version}）があります
        <span className="ml-2 text-muted-foreground">今の版: {state.currentVersion}</span>
      </span>
      <Button size="sm" onClick={() => void install()}>
        更新して再起動
      </Button>
      <Button variant="ghost" size="sm" onClick={dismissUpdate}>
        あとで
      </Button>
    </div>
  );
}
