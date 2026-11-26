// 画面を描く前に配色（ライト・ダーク）と文字の大きさなどを決める（個人の設定を戻したあとに読む。main.tsx）
import "@/app/theme";
import "@/app/preferences";

import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { applyWindowStart } from "@/app/windows";

import App from "./app/App";
import DesktopGate from "./app/DesktopGate";

// 新しいウィンドウで開いたときは、渡された場所と画面にする（FN0301-BR36）
applyWindowStart();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <DesktopGate>
      <App />
    </DesktopGate>
  </BrowserRouter>,
);
