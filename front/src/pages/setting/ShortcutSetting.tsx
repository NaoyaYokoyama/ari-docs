import { Search } from "lucide-react";
import { useState } from "react";

import Input from "@/components/common/Input";
import Kbd from "@/components/common/Kbd";
import { SettingPanel } from "@/pages/setting/SettingPanel";
import { ShortcutList } from "@/shortcut/ShortcutHelp";

// キーボードショートカットの一覧（FN0701）。どの画面でも ? で同じ一覧を開ける
export default function ShortcutSetting() {
  const [query, setQuery] = useState("");
  return (
    <SettingPanel
      title="ショートカット"
      description={
        <>
          マウスを使わずに操作できるキーの一覧です。どの画面でも <Kbd>?</Kbd> を押すと開けます
        </>
      }
    >
      <div className="relative mb-4">
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
      <ShortcutList query={query} />
    </SettingPanel>
  );
}
