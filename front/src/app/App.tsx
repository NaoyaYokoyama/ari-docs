import { useAuth } from "@/app/useAuth";
import { useMessage } from "@/app/useMessage";

import Login from "@/pages/common/Login";
import AppRoutes from "@/routes";
import MainLayout from "@/pages/common/MainLayout";
import ShortcutProvider from "@/shortcut/ShortcutProvider";
import Toast from "@/components/common/Toast";

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
      </AppContext.Provider>
    </ShortcutProvider>
  );
}
