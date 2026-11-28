import { RotateCcw, Search } from "lucide-react";
import { useState } from "react";

import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import Kbd from "@/components/common/Kbd";
import { SettingPanel } from "@/pages/setting/SettingPanel";
import { replaceShortcutOverrides, useChangedShortcutCount } from "@/shortcut/shortcut";
import { ShortcutList } from "@/shortcut/ShortcutHelp";

// キーボードショートカットの一覧（FN0701）。どの画面でも ? で同じ一覧を開ける。ここではキーを変えられる（FN0701-BR16）
export default function ShortcutSetting() {
  const { showMessage, showConfirm } = useApp();
  const [query, setQuery] = useState("");
  // キーを変えたら「すべて元に戻す」を押せるかを描き直す
  const changedCount = useChangedShortcutCount();

  // 変えたキーをすべて元（既定）のキーに戻す。1 つずつは行の右の ↺
  const resetAll = async () => {
    if (!(await showConfirm(`変えたキー（${changedCount} 件）を元のキーに戻しますか？`))) {
      return;
    }
    replaceShortcutOverrides({});
    showMessage("info", "ショートカットのキーを元に戻しました");
  };
  return (
    <SettingPanel
      title="ショートカット"
      description={
        <>
          マウスを使わずに操作できるキーの一覧です。どの画面でも <Kbd>?</Kbd> を押すと開けます。行の右のキーを押すと、新しいキーに変えられます（この PC の ari-docs に保存し、どの場所でも同じキーで使います）
        </>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="操作やキーで探す（例: コピー、F2）"
            aria-label="ショートカットを探す"
            className="w-full pl-8"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={changedCount === 0}
          title={changedCount === 0 ? "変えたキーはありません" : undefined}
          onClick={() => void resetAll()}
        >
          <RotateCcw size={14} />
          すべて元に戻す
        </Button>
      </div>
      <ShortcutList query={query} editable />
    </SettingPanel>
  );
}
