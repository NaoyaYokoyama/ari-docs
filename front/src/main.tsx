import "@/styles/global.css";

import { restorePersonalSettings } from "@/app/personalSettings";

// 個人の設定（この PC の ari-docs に保存したもの。FN0701-BR15）を戻してから、画面を読み込んで描く
void restorePersonalSettings().finally(() => import("./start"));
