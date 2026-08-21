type Props = {
  label: string;
  selected?: boolean;
  onClick: () => void;
};

export function SidebarItem({
  label,
  selected = false,
  onClick,
}: Props) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full
        rounded-md
        px-3
        py-2
        text-left
        text-sm
        transition-colors
        ${
          selected
            ? "bg-slate-200 font-medium text-slate-900"
            : "text-slate-700 hover:bg-slate-100"
        }
      `}
    >
      {label}
    </button>
  );
}

export default SidebarItem;
