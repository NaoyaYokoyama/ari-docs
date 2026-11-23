import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";

import { AppContext } from "@/app/AppContext";
import { useAuth } from "@/app/useAuth";
import { useConfirmDialog } from "@/app/useConfirmDialog";
import { useMessage } from "@/app/useMessage";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import Spinner from "@/components/common/Spinner";
import Toast from "@/components/common/Toast";
import { hasOpenedFiles, startEditSync } from "@/lib/editSync";
import Login from "@/pages/common/Login";
import MainLayout from "@/pages/common/MainLayout";
import AppRoutes from "@/routes";
import ShortcutProvider from "@/shortcut/ShortcutProvider";

export default function App() {
  const {
    user,
    setUser,
    loading,
    logout,
  } = useAuth();

  const {
    text,
    type,
    id: messageId,
    showMessage,
    closeMessage,
  } = useMessage(loading, user);

  const {
    open: confirmOpen,
    message: confirmMessage,
    showConfirm,
    confirm,
    cancel,
  } = useConfirmDialog();


  const [isDirty, setIsDirty] = useState(false);

  // 共有サーバーから開いたファイルの変更を、保存されたら自動でサーバーに戻す（FN0301-BR28）
  const callbacks = useRef({ showMessage, showConfirm });
  callbacks.current = { showMessage, showConfirm };
  const shared = user?.mode === "shared";
  useEffect(() => {
    if (!shared) {
      return;
    }
    let stop: (() => void) | undefined;
    let cancelled = false;
    void startEditSync({
      showMessage: (type, text) => callbacks.current.showMessage(type, text),
      showConfirm: (message) => callbacks.current.showConfirm(message),
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        stop = unlisten;
      }
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [shared]);

  // アプリを閉じる前に、保存していない変更と、共有サーバーから開いたファイル（閉じると見張りが終わる）を確かめる（FN0001-BR11）
  const closeState = useRef({ isDirty, showConfirm });
  closeState.current = { isDirty, showConfirm };
  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    let stop: (() => void) | undefined;
    let cancelled = false;
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        const { isDirty, showConfirm } = closeState.current;
        const reasons = [
          ...(isDirty ? ["保存していない変更があります。"] : []),
          ...(hasOpenedFiles()
            ? ["共有サーバーから開いたファイルがあります。閉じたあとに保存しても、サーバーには戻りません。"]
            : []),
        ];
        if (reasons.length > 0 && !(await showConfirm(`${reasons.join("")}アプリを閉じますか？`))) {
          event.preventDefault();
        }
      })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
        } else {
          stop = unlisten;
        }
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  if (loading) {
    return <Spinner className="h-screen" />;
  }

  if (!user) {
    return <Login />;
  }

  // ShortcutProvider は未保存の確認（AppContext）を使うため、その内側に置く
  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        showMessage,
        showConfirm,
        isDirty,
        setIsDirty,
      }}
    >
      <ShortcutProvider>
        <MainLayout
          displayName={user.displayName}
          onLogout={logout}
        >
          <AppRoutes />
        </MainLayout>

        <Toast
          type={type}
          message={text}
          id={messageId}
          onClose={closeMessage}
        />

        <ConfirmDialog
          open={confirmOpen}
          message={confirmMessage}
          onConfirm={confirm}
          onCancel={cancel}
        />
      </ShortcutProvider>
    </AppContext.Provider>
  );
}
