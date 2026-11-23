import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { createExclusion, deleteExclusion, getExclusions } from "@/api/search";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import IconButton from "@/components/common/IconButton";
import Input from "@/components/common/Input";
import Spinner from "@/components/common/Spinner";
import { errorMessage, formatDateTime } from "@/lib/format";
import { SettingPanel } from "@/pages/setting/SettingPanel";
import type { Exclusion, ExclusionKind, ExclusionsResponse } from "@/types/search";

const KIND_LABELS: Record<ExclusionKind, string> = {
  path: "パス",
  name: "名前の型",
};

const PLACEHOLDERS: Record<ExclusionKind, string> = {
  path: "例: 共有/古い資料",
  name: "例: backup*、*_old、*.bak",
};

// 検索の対象外（FN0202-BR16・BR17）。誰かが作ったバックアップ・古い版などを検索・最近の更新・探して開くに出さない。
// 共有モードは、全員の対象外（管理者が変える。中身の取り込みもしない）と、本人だけの対象外の 2 つ
export default function SearchExclusions() {
  const { showMessage } = useApp();
  const [data, setData] = useState<ExclusionsResponse | null>(null);

  const load = useCallback(() => {
    getExclusions()
      .then(setData)
      .catch((error) => {
        console.error(error);
        showMessage("error", errorMessage(error, "検索の対象外の取得に失敗しました"));
      });
  }, [showMessage]);

  useEffect(load, [load]);

  if (!data) {
    return <Spinner />;
  }

  const help =
    "パスはそのフォルダ（ファイル）と中のもの、名前の型はどこにあっても名前が一致するフォルダ・ファイルとその中のものを外します。" +
    "* は 0 文字以上、? は 1 文字に一致し、大文字と小文字は区別しません。Folder の右クリックからも外せます";

  return (
    <div className="space-y-8">
      <SettingPanel
        title={data.personal ? "検索の対象外（全員）" : "検索の対象外"}
        description={
          <>
            ここに入れたフォルダ・ファイルは、ホームの検索・最近の更新と探して開く（Ctrl+P）に出さず、中身も取り込みません。Folder
            の画面ではふつうに見えます。{help}
          </>
        }
      >
        <ExclusionList
          items={data.all}
          editable={data.canEditAll}
          forAll
          readonlyNote="全員の対象外は管理者が変更します。外してほしいフォルダは管理者に伝えるか、下の「自分だけ」に入れてください。"
          onChanged={load}
        />
      </SettingPanel>

      {data.personal && (
        <SettingPanel
          title="検索の対象外（自分だけ）"
          description="自分の検索・最近の更新・探して開くの結果からだけ外します。ほかの人の検索と、中身の取り込みには関わりません"
        >
          <ExclusionList items={data.mine} editable forAll={false} onChanged={load} />
        </SettingPanel>
      )}
    </div>
  );
}

function ExclusionList({
  items,
  editable,
  forAll,
  readonlyNote,
  onChanged,
}: {
  items: Exclusion[];
  editable: boolean;
  forAll: boolean;
  readonlyNote?: string;
  onChanged: () => void;
}) {
  const { showMessage } = useApp();
  const [kind, setKind] = useState<ExclusionKind>("name");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const trimmed = value.trim();

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmed) {
      return;
    }
    setSaving(true);
    try {
      const response = await createExclusion(forAll, kind, trimmed);
      showMessage("info", response.message);
      setValue("");
      onChanged();
    } catch (error) {
      showMessage("error", errorMessage(error, "検索の対象外の登録に失敗しました"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (target: Exclusion) => {
    try {
      const response = await deleteExclusion(target.exclusionId);
      showMessage("info", response.message);
      onChanged();
    } catch (error) {
      showMessage("error", errorMessage(error, "検索の対象外の削除に失敗しました"));
    }
  };

  return (
    <>
      {editable ? (
        <form onSubmit={add} className="mb-4 flex flex-wrap gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ExclusionKind)}
            aria-label="指定の仕方"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          >
            <option value="name">{KIND_LABELS.name}</option>
            <option value="path">{KIND_LABELS.path}</option>
          </select>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={PLACEHOLDERS[kind]}
            aria-label="対象外にするもの"
            className="min-w-48 flex-1"
          />
          <Button type="submit" disabled={saving || !trimmed}>
            <Plus size={16} />
            追加
          </Button>
        </form>
      ) : (
        readonlyNote && <p className="mb-4 text-sm text-muted-foreground">{readonlyNote}</p>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">対象外にしたものはありません</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.exclusionId} className="flex items-center gap-3 py-2">
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {KIND_LABELS[item.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-sm" title={item.value}>
                {item.value}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {item.createdBy}・{formatDateTime(item.createdAt)}
              </span>
              {editable && (
                <IconButton label="検索の対象に戻す" onClick={() => void remove(item)}>
                  <Trash2 size={16} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
