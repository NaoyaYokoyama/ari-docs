import { Laptop, LogOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { getSessions, logoutOtherSessions, logoutSession } from "@/api/setting";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import IconButton from "@/components/common/IconButton";
import Spinner from "@/components/common/Spinner";
import { displayClientName } from "@/lib/clientName";
import { errorMessage } from "@/lib/format";
import { SettingCard } from "@/pages/setting/SettingPanel";
import type { SessionListResponse } from "@/types/setting";

// ログイン中の端末（共有モード。FN0101-BR15）。PC を替えた・なくしたときに、ほかの端末をログアウトさせる
export default function SessionSetting() {
  const { showMessage, showConfirm } = useApp();
  const [list, setList] = useState<SessionListResponse | null>(null);

  const load = useCallback(() => {
    getSessions()
      .then(setList)
      .catch((error) => {
        console.error(error);
        showMessage("error", errorMessage(error, "ログイン中の端末を読み込めませんでした"));
      });
  }, [showMessage]);

  useEffect(load, [load]);

  const run = async (action: () => Promise<{ message: string }>) => {
    try {
      const response = await action();
      showMessage("info", response.message);
    } catch (error) {
      showMessage("error", errorMessage(error, "ログアウトさせられませんでした"));
    }
    load();
  };

  const others = list?.sessions.filter((session) => !session.current) ?? [];

  return (
    <SettingCard
      title="ログイン中の端末"
      description={
        list
          ? `このユーザーでログインしたままの PC です。最後に使ってから ${list.sessionDays} 日で自動でログアウトします（最後に使った日時は 1 時間ごとに更新します）`
          : undefined
      }
    >
      {!list ? (
        <Spinner />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {list.sessions.map((session) => (
              <li key={session.key} className="flex items-center gap-3 py-2.5 first:pt-0">
                <Laptop size={18} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {displayClientName(session.client)}
                    {session.current && (
                      <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-xs font-normal text-brand">
                        この端末
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    最後に使った日時: {session.lastUsedAt}（ログイン: {session.createdAt}）
                  </p>
                </div>
                {!session.current && (
                  <IconButton
                    label="この端末をログアウトさせる"
                    onClick={() => void run(() => logoutSession(session.key))}
                  >
                    <LogOut size={16} />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              disabled={others.length === 0}
              onClick={async () => {
                if (
                  await showConfirm(
                    `この端末以外の ${others.length} 台をログアウトさせますか？その端末では、もう一度ログインが必要になります`,
                  )
                ) {
                  await run(logoutOtherSessions);
                }
              }}
            >
              ほかの端末をすべてログアウト
            </Button>
          </div>
        </>
      )}
    </SettingCard>
  );
}
