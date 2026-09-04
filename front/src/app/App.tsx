import { useEffect, useState } from "react";
import Login from "@/pages/common/Login";
import AppRoutes from "@/routes";
import MainLayout from "@/pages/common/MainLayout";
import ShortcutProvider from "@/shortcut/ShortcutProvider";
import Toast from "@/components/common/Toast";

import {
  AppContext,
  type LoginUser,
} from "@/app/AppContext";


export default function App() {
  const [user, setUser] = useState<LoginUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const showMessage = (message: string) => {
    setMessage(message);
  };


  const handleLogout = async () => {
    const response = await fetch("http://localhost:8080/api/logout", {
      method: "POST",
      credentials: "include",
    });

    if (response.ok) {
      setUser(null);
    }
  };


  useEffect(() => {
    const checkLogin = async () => {
      try {
        const response = await fetch("http://localhost:8080/api/me", {
          credentials: "include",
        });

        if (!response.ok) {
          setUser(null);
          return;
        }

        const loginUser: LoginUser = await response.json();
        setUser(loginUser);

      } catch (error) {
        console.error("ログイン確認に失敗しました", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkLogin();
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    const storedMessage = sessionStorage.getItem("message");

    if (storedMessage) {
      sessionStorage.removeItem("message");
      showMessage(storedMessage);
    }
  }, [loading, user]);


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
        }}>
        <MainLayout
          onLogout={handleLogout}
        >
          <AppRoutes
            onLogout={handleLogout}
          />
        </MainLayout>
        <Toast
          message={message}
          onClose={() => setMessage("")}
        />
      </AppContext.Provider>
    </ShortcutProvider>
  );
}
