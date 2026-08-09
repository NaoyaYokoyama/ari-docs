import { Route,Routes } from "react-router-dom";

import Folder from "@/pages/Folder";
import Home from "@/pages/Home";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/folder" element={<Folder />} />
    </Routes>
  );
}

export default AppRoutes;
