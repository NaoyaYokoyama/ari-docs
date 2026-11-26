import { FolderSearch, Lock, LockOpen } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { twMerge } from "tailwind-merge";

import { getLocks, unlockNode } from "@/api/node";
import { useApp } from "@/app/AppContext";
import EmptyState from "@/components/common/EmptyState";
import IconButton from "@/components/common/IconButton";
import Spinner from "@/components/common/Spinner";
import { errorMessage } from "@/lib/format";
import { SettingPanel } from "@/pages/setting/SettingPanel";
import type { NodeLockItem } from "@/types/node";

// ロック中のファイル（FN0301-BR38・共有モード）。だれがいつまでロックしているかを見て、場所を開く・外す。
// 外せるのはロックした人と管理者
export default function LockSetting() {
  const { user, showMessage, showConfirm } = useApp();
  const navigate = useNavigate();
  const [locks, setLocks] = useState<NodeLockItem[] | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);

  const load = useCallback(() => {
    getLocks()
      .then(setLocks)
      .catch((error) => {
        console.error(error);
        showMessage("error", errorMessage(error, "ロック中のファイルを読み込めませんでした"));
      });
  }, [showMessage]);

  useEffect(load, [load]);

  const unlock = async (item: NodeLockItem) => {
    const name = item.path.split("/").pop() ?? item.path;
    if (!item.mine && !(await showConfirm(`${item.userName}さんの「${name}」のロックを外しますか？`))) {
      return;
    }
    try {
      await unlockNode(item.path);
      showMessage("info", `「${name}」のロックを外しました`);
    } catch (error) {
      showMessage("error", errorMessage(error, "ロックを外せませんでした"));
    }
    load();
  };

  const shown = locks?.filter((item) => !onlyMine || item.mine) ?? [];
  const mineCount = locks?.filter((item) => item.mine).length ?? 0;

  return (
    <SettingPanel
      title="ロック中のファイル"
      description="ロックしている間、ロックした人のほかは上書き・名前の変更・移動・削除ができません。期限が来ると自動で外れます。外せるのはロックした人と管理者です。ロックは Folder でファイルを右クリックしてかけます"
    >
      {!locks ? (
          <Spinner />
        ) : (
          <>
            <div role="radiogroup" aria-label="絞り込み" className="mb-3 flex gap-1">
              {(
                [
                  [false, "すべて", locks.length],
                  [true, "自分のロック", mineCount],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={onlyMine === value}
                  onClick={() => setOnlyMine(value)}
                  className={twMerge(
                    "rounded-full border px-3 py-1 text-xs",
                    onlyMine === value
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {label} {count}
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <EmptyState icon={Lock} title="ロック中のファイルはありません" />
            ) : (
              <ul className="divide-y divide-border">
                {shown.map((item) => {
                  const index = item.path.lastIndexOf("/");
                  const name = item.path.slice(index + 1);
                  const folder = index === -1 ? "" : item.path.slice(0, index);
                  return (
                    <li key={item.path} className="flex items-center gap-3 py-2.5">
                      <Lock size={16} className={twMerge("shrink-0", item.mine ? "text-brand" : "text-warning")} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" title={item.path}>
                          {name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.mine ? "自分" : `${item.userName}さん`}・{item.expiresAt} まで・folder/{folder}
                        </p>
                      </div>
                      <IconButton
                        label="Folder で場所を開く"
                        onClick={() =>
                          void navigate("/folder", { state: { nodePath: item.path, nodeAction: "select" } })
                        }
                      >
                        <FolderSearch size={16} />
                      </IconButton>
                      {(item.mine || user?.isAdmin) && (
                        <IconButton
                          label={item.mine ? "ロックを外す" : "ロックを外す（管理者）"}
                          onClick={() => void unlock(item)}
                        >
                          <LockOpen size={16} />
                        </IconButton>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
    </SettingPanel>
  );
}
