import { useState } from "react";

import { AppContext } from "@/app/AppContext";
import { useAuth } from "@/app/useAuth";
import { useConfirmDialog } from "@/app/useConfirmDialog";
import { useMessage } from "@/app/useMessage";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import Toast from "@/components/common/Toast";
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

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <ShortcutProvider>
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
        <MainLayout
          displayName={user.displayName}
          onLogout={logout}
        >
          <AppRoutes />
        </MainLayout>

        <Toast
          type={type}
          message={text}
          onClose={closeMessage}
        />

        <ConfirmDialog
          open={confirmOpen}
          message={confirmMessage}
          onConfirm={confirm}
          onCancel={cancel}
        />
      </AppContext.Provider>
    </ShortcutProvider>
  );
}
