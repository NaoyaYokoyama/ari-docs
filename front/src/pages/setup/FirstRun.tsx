import { LibraryBig } from "lucide-react";

import ModeChooser from "@/pages/setup/ModeChooser";

// 初回起動の画面（インストーラーで使い方を選ばなかったとき。Linux の AppImage など）
export default function FirstRun() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar p-6">
      <div className="w-full max-w-xl rounded-lg border border-border bg-background p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <LibraryBig size={20} />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">ari-docs へようこそ</h1>
            <p className="text-xs text-muted-foreground">
              使い方を選んでください。あとから設定画面でも変えられます
            </p>
          </div>
        </div>
        <ModeChooser currentMode="" currentServerUrl="" />
      </div>
    </div>
  );
}
