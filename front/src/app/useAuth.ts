import { useEffect, useState } from "react";

import { getMe, logout as logoutApi } from "@/api/auth";
import type { LoginUser } from "@/app/AppContext";

export function useAuth() {
  const [user, setUser] = useState<LoginUser | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = async () => {
    try {
      await logoutApi();
    } catch (error) {
      console.error("ログアウトに失敗しました", error);
    }
    setUser(null);
  };

  useEffect(() => {
    const checkLogin = async () => {
      try {
        setUser(await getMe());
      } catch (error) {
        // 未ログイン、またはサーバーに接続できない（ログイン画面で接続を確かめる）
        console.error("ログイン確認に失敗しました", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkLogin();
  }, []);

  return {
    user,
    setUser,
    loading,
    logout,
  };
}
