import { Route,Routes } from "react-router-dom";

import Folder from "@/pages/Folder";
import Note from "@/pages/Note";
import Wiki from "@/pages/Wiki";
import Setting from "@/pages/Setting";
import Home from "@/pages/Home";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/folder" element={<Folder />} />
      <Route path="/note" element={<Note />} />
      <Route path="/wiki" element={<Wiki />} />
      <Route path="/setting" element={<Setting />} />
    </Routes>
  );
}

export default AppRoutes;
