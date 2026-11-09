import { Search } from "lucide-react";
import { useState } from "react";

import { useApp } from "@/app/AppContext";
import { useDesktopStatus } from "@/app/DesktopContext";
import Input from "@/components/common/Input";
import PageSidebar from "@/components/common/PageSidebar";
import SidebarItem from "@/components/common/SidebarItem";
import {
  matchSection,
  settingGroups,
  type SettingSection,
  visibleSettingSections,
} from "@/pages/setting/settingSection";

type Props = {
  section: SettingSection;
  setSection: (section: SettingSection) => void;
};

// 設定のメニュー。まとまりごとに並べ、上の欄で探せる（例:「ロック」「文字」）
export default function SettingSidebar({
  section,
  setSection,
}: Props) {
  const { user } = useApp();
  const desktop = useDesktopStatus();
  const [query, setQuery] = useState("");

  const sections = visibleSettingSections(user, desktop).filter((item) => matchSection(item, query));

  return (
    <PageSidebar
      title="設定"
      toolbar={
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter で最初に一致したものを開く。Esc で消す
              if (e.key === "Enter" && sections[0]) {
                setSection(sections[0].id);
              } else if (e.key === "Escape") {
                setQuery("");
              }
            }}
            // Vim モードの / で移る（FN0702）
            data-vim-filter
            placeholder="設定を探す"
            aria-label="設定を探す"
            className="h-8 w-full pl-8"
          />
        </div>
      }
    >
      <nav className="flex flex-col gap-3 pt-2">
        {settingGroups.map((group) => {
          const items = sections.filter((item) => item.group === group);
          if (items.length === 0) {
            return null;
          }
          return (
            <div key={group} className="flex flex-col gap-0.5">
              <p className="px-3 pt-1 pb-1 text-xs font-medium text-muted-foreground">{group}</p>
              {items.map((item) => (
                <SidebarItem
                  key={item.id}
                  label={item.label}
                  icon={item.icon}
                  selected={section === item.id}
                  onClick={() => setSection(item.id)}
                />
              ))}
            </div>
          );
        })}
        {sections.length === 0 && (
          <p className="px-3 text-sm text-muted-foreground">「{query}」に一致する設定はありません</p>
        )}
      </nav>
    </PageSidebar>
  );
}
