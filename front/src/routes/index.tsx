import { Routes, Route } from "react-router-dom";

import Home from "@/pages/Home";
import Folder from "@/pages/Folder";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/folder" element={<Folder />} />
    </Routes>
  );
}

export default AppRoutes;
