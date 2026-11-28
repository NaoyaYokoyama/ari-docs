import { isTauri } from "@tauri-apps/api/core";
import { type ReactNode, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useApp } from "@/app/AppContext";
import { useDesktop } from "@/app/DesktopContext";
import { rememberLastPage, startPath, stepZoom } from "@/app/preferences";
import { startTaskNotice } from "@/app/taskNotice";
import { hasPendingAriLink, useAriLinkPlace } from "@/app/useAriLink";
import { openCurrentInNewWindow } from "@/app/windows";
import { WHEEL_INTERVAL_MS, wheelZoomDirection, zoomDirection } from "@/app/zoomKeys";
import Header from "@/pages/common/Header";
import UpdateNotice from "@/pages/common/UpdateNotice";
import { isShortcut, SHORTCUT } from "@/shortcut/shortcut";
import VimLayer from "@/vim/VimLayer";

// 起動したときの画面へは 1 回だけ移る（あとで Home を開いたときは移らない）
let started = false;
// 管理者の PC でない旨は、起動したときに 1 回だけ知らせる
let adminNoticeShown = false;

type Props = {
  children: ReactNode;
  displayName: string;
  onLogout: () => void;
};

function MainLayout({
  children,
  displayName,
  onLogout,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, showMessage } = useApp();
  const desktop = useDesktop();
  const placeId = desktop?.place.id;

  // 今の画面を新しいウィンドウで開く（FN0301-BR36）。ヘッダーの右上のボタンと Ctrl+Shift+N
  const openNewWindow = useCallback(() => {
    openCurrentInNewWindow(placeId).catch((error: unknown) => {
      console.error(error);
      showMessage("error", "新しいウィンドウを開けませんでした");
    });
  }, [placeId, showMessage]);

  // キーは入力中でも効かせる
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (isShortcut(event, SHORTCUT.NEW_WINDOW) && !event.isComposing) {
        event.preventDefault();
        openNewWindow();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [openNewWindow]);
  // 画面の拡大・縮小（デスクトップアプリ。画面共有のときなどに。FN0701-BR17）。ブラウザではブラウザの拡大に任せる
  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    const step = (direction: 1 | -1 | 0) => {
      const zoom = stepZoom(direction);
      showMessage("info", zoom === 100 ? "表示の大きさを 100% に戻しました" : `表示の大きさ: ${zoom}%（Ctrl+0 で 100% に戻す）`);
    };
    const handleKey = (event: KeyboardEvent) => {
      const direction = zoomDirection(event);
      if (direction === null || event.isComposing) {
        return;
      }
      event.preventDefault();
      step(direction);
    };
    // Ctrl+ホイール（タッチパッドの広げ・つまみも同じに届く）
    let pending = 0;
    let last = 0;
    const handleWheel = (event: WheelEvent) => {
      const result = wheelZoomDirection(event, pending);
      if (!result) {
        pending = 0;
        return;
      }
      event.preventDefault();
      pending = result.pending;
      if (result.direction === 0 || event.timeStamp - last < WHEEL_INTERVAL_MS) {
        return;
      }
      last = event.timeStamp;
      step(result.direction);
    };
    window.addEventListener("keydown", handleKey);
    // preventDefault するため passive にしない
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("wheel", handleWheel);
    };
  }, [showMessage]);
  // タスクの期限の通知（デスクトップアプリ。FN0602-BR13）
  useEffect(() => startTaskNotice(), []);
  const docsEnabled = !!user?.docsEnabled;
  // リンクに入れる今の場所と、場所を切り替えて開くリンク（FN0004-BR07）
  useAriLinkPlace();

  // 起動したときに開く画面（設定の「操作」。FN0701）。URL で画面を指定して開いたときはそのまま
  useEffect(() => {
    if (started) {
      return;
    }
    started = true;
    // 場所を切り替えてリンクを開くときは、起動したときの画面へ移らない
    if (hasPendingAriLink()) {
      return;
    }
    const path = startPath(docsEnabled);
    if (location.pathname === "/" && !location.search && path !== "/") {
      void navigate(path, { replace: true });
    }
  }, [docsEnabled, location.pathname, location.search, navigate]);

  useEffect(() => {
    rememberLastPage(location.pathname, location.search);
  }, [location.pathname, location.search]);

  // 管理者だが、この PC を管理者の PC に登録していない（FN0102-BR12）
  useEffect(() => {
    if (user?.adminElsewhere && !adminNoticeShown) {
      adminNoticeShown = true;
      showMessage(
        "info",
        "この PC は管理者の PC ではないため、利用者として使っています。管理者の操作は、設定の「管理者の PC」でこの PC を登録するとできます",
      );
    }
  }, [user?.adminElsewhere, showMessage]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header
        displayName={displayName}
        onLogout={onLogout}
        onNewWindow={openNewWindow}
      />

      <UpdateNotice />

      <div className="min-h-0 flex-1">
        {children}
      </div>

      <VimLayer />
    </div>
  );
}

export default MainLayout;
