import { useAuth } from "@/app/useAuth";
import { useMessage } from "@/app/useMessage";
import { useConfirmDialog } from "@/app/useConfirmDialog";

import Login from "@/pages/common/Login";
import AppRoutes from "@/routes";
import MainLayout from "@/pages/common/MainLayout";
import ShortcutProvider from "@/shortcut/ShortcutProvider";
import Toast from "@/components/common/Toast";
import ConfirmDialog from "@/components/common/ConfirmDialog";

import { AppContext } from "@/app/AppContext";

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

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return (
    <ShortcutProvider>
      <AppContext.Provider
        value={{
          user,
          setUser,
          showMessage,
          showConfirm,
        }}
      >
        <MainLayout onLogout={logout}>
          <AppRoutes onLogout={logout} />
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
