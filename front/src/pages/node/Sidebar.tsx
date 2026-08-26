import FolderTree from "@/pages/node/FolderTree";

type Props = {
  onNavigate: (path: string) => void;
};

function Sidebar({
  onNavigate,
}: Props) {
  return (
    <aside className="w-56 bg-slate-100 p-3">
      <FolderTree
        path=""
        onNavigate={onNavigate}
      />
    </aside>
  );
}

export default Sidebar;
