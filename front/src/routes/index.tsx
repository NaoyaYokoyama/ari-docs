import { Navigate, Route, Routes } from "react-router-dom";

import { useApp } from "@/app/AppContext";
import Docs from "@/pages/docs/Docs";
import Home from "@/pages/home/Home";
import Folder from "@/pages/node/Node";
import Note from "@/pages/note/Note";
import Setting from "@/pages/setting/Setting";
import Wiki from "@/pages/wiki/Wiki";

function AppRoutes() {
  const { user } = useApp();
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/folder" element={<Folder />} />
      <Route path="/note" element={<Note />} />
      <Route path="/wiki" element={<Wiki />} />
      {/* Docs を使わない設定（既定）では開けないので Home へ */}
      <Route path="/docs" element={user?.docsEnabled ? <Docs /> : <Navigate to="/" replace />} />
      <Route path="/setting" element={<Setting />} />
    </Routes>
  );
}

export default AppRoutes;
