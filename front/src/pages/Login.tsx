import { useState } from "react";
import Input from "@/components/common/Input";

export default function Login() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");

    const response = await fetch("http://localhost:8080/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        userId,
        password,
      }),
    });

    if (!response.ok) {
      setError("ユーザーIDまたはパスワードが違います");
      return;
    }

    window.location.href = "/";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="mb-6 text-2xl font-semibold">
          ari-docs
        </h1>

        <div className="space-y-4">

          <label>ユーザーID</label>
          <Input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="ユーザーIDを入力"
          />

          <label>パスワード</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワードを入力"
          />


          {error && (
            <p className="text-sm text-red-500">
              {error}
            </p>
          )}

          <button
            onClick={handleLogin}
            className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground"
          >
            ログイン
          </button>
        </div>
      </div>
    </div>
  );
}
