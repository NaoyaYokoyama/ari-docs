import SidebarItem from "@/components/common/SidebarItem";
import {
  settingSections,
  type SettingSection,
} from "@/pages/setting/settingSection";

type Props = {
  section: SettingSection;
  setSection: (section: SettingSection) => void;
};

export default function SettingSidebar({
  section,
  setSection,
}: Props) {
  return (
    <aside className="w-64 bg-slate-100 p-4">
      設定Sidebar

      <div className="flex flex-col gap-1 p-3">
        {settingSections.map((item) => (
          <SidebarItem
            key={item.id}
            label={item.label}
            selected={section === item.id}
            onClick={() => setSection(item.id)}
          />
        ))}
      </div>
    </aside>
  );
}
