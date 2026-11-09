import { RefreshCw, ServerOff } from "lucide-react";
import { useState } from "react";

import Button from "@/components/common/Button";
import ModeChooser from "@/pages/setup/ModeChooser";
import type { SetupStatus } from "@/types/setup";

type Props = {
  status: SetupStatus;
  // 確かめたときの理由
  error: string;
  // もう一度確かめる。つながれば画面が切り替わる
  onRetry: () => Promise<void>;
};

// 起動したときに共有サーバーにつながらない（FN0002-BR19）。もう一度試すか、接続先を直すか、個人用に切り替える
export default function ServerUnreachable({ status, error, onRetry }: Props) {
  const [retrying, setRetrying] = useState(false);
  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar p-6">
      <div className="w-full max-w-xl rounded-lg border border-border bg-background p-6 shadow-sm">
        <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold">
          <ServerOff size={22} className="text-destructive" />
          共有サーバーに接続できません
        </h1>
        <p className="mb-2 text-sm">
          接続先: <span className="font-mono">{status.serverUrl}</span>
        </p>
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
        <p className="mb-3 text-sm text-foreground/80">
          サーバーが止まっている・ネットワークにつながっていないときは、しばらくしてからもう一度試してください。
        </p>
        <Button
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            await onRetry();
            setRetrying(false);
          }}
        >
          <RefreshCw size={16} className={retrying ? "animate-spin" : undefined} />
          {retrying ? "確認中..." : "もう一度試す"}
        </Button>

        {status.canChangeMode && (
          <div className="mt-6 border-t border-border pt-5">
            <p className="mb-3 text-sm text-foreground/80">
              接続先の URL を直すか、個人用（この PC だけで使う）に切り替えられます。
            </p>
            <ModeChooser currentMode={status.mode} currentServerUrl={status.serverUrl} />
          </div>
        )}
      </div>
    </div>
  );
}
