import { Route,Routes } from "react-router-dom";

import Home from "@/pages/home/Home";
import Folder from "@/pages/node/Node";
import Note from "@/pages/note/Note";
import Setting from "@/pages/setting/Setting";
import Wiki from "@/pages/wiki/Wiki";

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
