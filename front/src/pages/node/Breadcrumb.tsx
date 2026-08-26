import { ChevronRight } from "lucide-react";

type Props = {
  path: string;
  onNavigate: (path: string) => void;
};

function Breadcrumb({ path, onNavigate }: Props) {
  const items = path.split("/").filter(Boolean);

  return (
    <nav className="mb-4 flex items-center gap-2 text-sm text-slate-600">
      <button
        type="button"
        onClick={() => onNavigate("")}
        className="hover:underline"
      >
        Home
      </button>

      {items.map((item, index) => {
        const target = items.slice(0, index + 1).join("/");

        return (
          <div key={target} className="flex items-center gap-2">
            <ChevronRight size={14} />

            <button
              type="button"
              onClick={() => onNavigate(target)}
              className="hover:underline"
            >
              {item}
            </button>
          </div>
        );
      })}
    </nav>
  );
}

export default Breadcrumb;
