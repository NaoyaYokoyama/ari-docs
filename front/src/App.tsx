import { useEffect, useState } from "react";
import Login from "@/pages/common/Login";
import AppRoutes from "@/routes";
import MainLayout from "@/pages/common/MainLayout";
import ShortcutProvider from "@/shortcut/ShortcutProvider";

import {
  AppContext,
  type LoginUser,
} from "@/AppContext";


export default function App() {
  const [user, setUser] = useState<LoginUser | null>(null);
  const [loading, setLoading] = useState(true);

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

  const message = sessionStorage.getItem("message");

  if (message) {
    sessionStorage.removeItem("message");
    setTimeout(() => {
      alert(message);
    }, 100);
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
      <AppContext.Provider value={{ user, setUser }}>
        <MainLayout
          onLogout={handleLogout}
        >
          <AppRoutes
            onLogout={handleLogout}
          />
        </MainLayout>
      </AppContext.Provider>
    </ShortcutProvider>
  );
}
