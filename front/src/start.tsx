// 画面を描く前に配色（ライト・ダーク）と文字の大きさなどを決める（個人の設定を戻したあとに読む。main.tsx）
import "@/app/theme";
import "@/app/preferences";

import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./app/App";
import DesktopGate from "./app/DesktopGate";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <DesktopGate>
      <App />
    </DesktopGate>
  </BrowserRouter>,
);
