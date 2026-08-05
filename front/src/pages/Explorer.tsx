import { useState } from "react";

import NodeTable from "../components/NodeTable";
import { useNodes } from "../hooks/useNodes";

function Explorer() {
  const [currentPath] = useState("/");

  const nodes = useNodes(currentPath);

  return (
    <NodeTable
      nodes={nodes}
    />
  );
}

export default Explorer;
