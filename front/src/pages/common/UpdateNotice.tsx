import { Download, Server } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getServerUpdate } from "@/api/serverUpdate";
import { useApp } from "@/app/AppContext";
import {
  checkUpdate,
  dismissUpdate,
  useInstallUpdate,
  useUpdateDismissed,
  useUpdateState,
} from "@/app/appUpdate";
import { useDesktop } from "@/app/DesktopContext";
import { setPreference, usePreferences } from "@/app/preferences";
import Button from "@/components/common/Button";

// 起動してから 1 回だけ調べる（場所を切り替えると画面を読み込み直すので、また調べる）
let checked = false;
let serverChecked = false;

function Bar({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-muted px-4 py-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      {children}
    </div>
  );
}

// 新しい版のお知らせ（FN0904-BR05）。ヘッダーの下に出す。
// 共有サーバーはログインした後に調べる（BR03）。自分の PC は、起動したときに調べるかを一度だけ聞き、
// 「知らせる」を選んだ PC だけ調べる（BR04）。管理者には、サーバーの新しい版も知らせる（BR14）。
// 「調べない」にした PC は、どの場所でも自分からは調べない（BR19）
export default function UpdateNotice() {
  const desktop = useDesktop();
  const { user } = useApp();
  const navigate = useNavigate();
  const { updateCheck } = usePreferences();
  const state = useUpdateState();
  const dismissed = useUpdateDismissed();
  const install = useInstallUpdate();
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const local = !!desktop?.place.local;
  const serverUrl = desktop && !local ? desktop.place.url : "";
  const admin = !!desktop && !local && !!user?.isAdmin;

  useEffect(() => {
    if (!desktop || checked || updateCheck === "off" || (local && updateCheck !== "on")) {
      return;
    }
    checked = true;
    void checkUpdate(serverUrl);
  }, [desktop, local, serverUrl, updateCheck]);

  useEffect(() => {
    if (!admin || serverChecked || updateCheck === "off") {
      return;
    }
    serverChecked = true;
    getServerUpdate()
      .then((status) => setServerVersion(status.latest?.version ?? null))
      .catch(console.error);
  }, [admin, updateCheck]);

  if (state.kind === "installing") {
    return (
      <Bar icon={<Download size={16} />}>
        新しい版を取ってきています{state.percent !== null ? `（${state.percent}%）` : ""}
      </Bar>
    );
  }
  if (state.kind === "available" && !dismissed) {
    return (
      <Bar icon={<Download size={16} />}>
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
      </Bar>
    );
  }
  if (serverVersion) {
    return (
      <Bar icon={<Server size={16} />}>
        <span className="min-w-0 flex-1">サーバーの新しい版（{serverVersion}）があります</span>
        <Button
          size="sm"
          onClick={() => {
            setServerVersion(null);
            void navigate("/setting?section=about");
          }}
        >
          更新の画面を開く
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setServerVersion(null)}>
          あとで
        </Button>
      </Bar>
    );
  }
  if (local && updateCheck === "ask") {
    return (
      <Bar icon={<Download size={16} />}>
        <span className="min-w-0 flex-1">
          新しい版が出たら知らせますか？
          <span className="ml-2 text-muted-foreground">
            起動したときに GitHub を調べます（設定の「情報」で変えられます）
          </span>
        </span>
        <Button size="sm" onClick={() => setPreference("updateCheck", "on")}>
          知らせる
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPreference("updateCheck", "off")}>
          知らせない
        </Button>
      </Bar>
    );
  }
  return null;
}
