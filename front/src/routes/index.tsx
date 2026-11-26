import { Navigate, Route, Routes } from "react-router-dom";

import { useApp } from "@/app/AppContext";
import ComparePage from "@/pages/compare/ComparePage";
import Docs from "@/pages/docs/Docs";
import Home from "@/pages/home/Home";
import Folder from "@/pages/node/Node";
import Note from "@/pages/note/Note";
import Setting from "@/pages/setting/Setting";
import Task from "@/pages/task/Task";
import Wiki from "@/pages/wiki/Wiki";

function AppRoutes() {
  const { user } = useApp();
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/folder" element={<Folder />} />
      <Route path="/note" element={<Note />} />
      <Route path="/wiki" element={<Wiki />} />
      {/* 個人のタスク（FN0602） */}
      <Route path="/task" element={<Task />} />
      {/* Docs を使わない設定（既定）では開けないので Home へ */}
      <Route path="/docs" element={user?.docsEnabled ? <Docs /> : <Navigate to="/" replace />} />
      <Route path="/setting" element={<Setting />} />
      {/* 比べる（FN0304）。Folder の右クリックから開く */}
      <Route path="/compare" element={<ComparePage />} />
      {/* 無い画面（古いブックマーク・打ち間違い）は何も出ないままにせず Home へ */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AppRoutes;
