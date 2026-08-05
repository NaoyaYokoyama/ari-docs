import { useState } from "react";

import FolderTable from "../components/FolderTable";
import { useNodes } from "../hooks/useNodes";

function Folder() {
  const [currentPath] = useState("/");

  const nodes = useNodes(currentPath);

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">
        Folder
      </h1>

      <FolderTable nodes={nodes} />
    </div>
  );
}

export default Folder;
