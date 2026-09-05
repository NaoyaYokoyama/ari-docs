import { useEffect, useState } from "react";

import type { LoginUser } from "@/app/AppContext";

export function useAuth() {
  const [user, setUser] = useState<LoginUser | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = async () => {
    const response = await fetch(
      "http://localhost:8080/api/logout",
      {
        method: "POST",
        credentials: "include",
      },
    );

    if (response.ok) {
      setUser(null);
    }
  };

  useEffect(() => {
    const checkLogin = async () => {
      try {
        const response = await fetch(
          "http://localhost:8080/api/me",
          {
            credentials: "include",
          },
        );

        if (!response.ok) {
          setUser(null);
          return;
        }

        const loginUser: LoginUser =
          await response.json();

        setUser(loginUser);
      } catch (error) {
        console.error(
          "ログイン確認に失敗しました",
          error,
        );

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
