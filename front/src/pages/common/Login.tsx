import { LibraryBig } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import { getServerInfo, login, type ServerInfo, setupAdmin } from "@/api/auth";
import { getBaseUrl } from "@/api/client";
import { useDesktopStatus } from "@/app/DesktopContext";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import Spinner from "@/components/common/Spinner";
import { errorMessage } from "@/lib/format";
import ModeChooser from "@/pages/setup/ModeChooser";

// ログイン画面（共有モード）。サーバーにユーザーが 1 人もいなければ、最初の管理者を登録する
export default function Login() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [connectError, setConnectError] = useState(false);

  const load = useCallback(() => {
    setConnectError(false);
    setInfo(null);
    getServerInfo()
      .then(setInfo)
      .catch((error) => {
        console.error(error);
        setConnectError(true);
      });
  }, []);

  useEffect(load, [load]);

  if (connectError) {
    return <ConnectError onRetry={load} />;
  }
  if (!info) {
    return <Spinner className="h-screen" label="接続中..." />;
  }
  return info.needsAdmin ? <AdminSetupForm /> : <LoginForm />;
}

function Card({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-7 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <LibraryBig size={20} />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">ari-docs</h1>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function LoginForm() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(userId, password);
      window.location.href = "/";
    } catch (e) {
      setError(errorMessage(e, "ユーザーIDまたはパスワードが違います"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card subtitle="ログインしてください">
      <form onSubmit={handleLogin} className="space-y-4">
        <Field label="ユーザーID" htmlFor="login-user">
          <Input
            id="login-user"
            autoFocus
            autoComplete="username"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="ユーザーIDを入力"
            className="w-full"
          />
        </Field>

        <Field label="パスワード" htmlFor="login-password">
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワードを入力"
            className="w-full"
          />
        </Field>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={loading || !userId} className="w-full">
          {loading ? "ログイン中..." : "ログイン"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          ユーザーの登録とパスワードの再設定は、管理者に依頼してください
        </p>
      </form>
    </Card>
  );
}

// 最初の管理者の登録。登録するとそのままログインする
function AdminSetupForm() {
  const [userId, setUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const mismatch = passwordConfirm !== "" && password !== passwordConfirm;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await setupAdmin(userId.trim(), displayName.trim(), password);
      window.location.href = "/";
    } catch (e) {
      setError(errorMessage(e, "管理者の登録に失敗しました"));
      setLoading(false);
    }
  };

  return (
    <Card subtitle="最初に管理者を登録してください">
      <form onSubmit={submit} className="space-y-4">
        <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          このサーバーにはまだユーザーがいません。ここで登録した人が管理者になり、ほかのユーザーを登録できます。
        </p>
        <Field label="ユーザーID（半角英数字と _ . -）" htmlFor="admin-user">
          <Input
            id="admin-user"
            autoFocus
            autoComplete="username"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full"
          />
        </Field>
        <Field label="表示名" htmlFor="admin-name">
          <Input
            id="admin-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full"
          />
        </Field>
        <Field label="パスワード（8 文字以上）" htmlFor="admin-password">
          <Input
            id="admin-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full"
          />
        </Field>
        <Field label="パスワード（確認用）" htmlFor="admin-password-confirm">
          <Input
            id="admin-password-confirm"
            type="password"
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            className="w-full"
          />
          {mismatch && (
            <p className="mt-1.5 text-xs text-destructive">パスワードが一致しません</p>
          )}
        </Field>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="submit"
          disabled={
            loading || !userId.trim() || !displayName.trim() || !password || password !== passwordConfirm
          }
          className="w-full"
        >
          {loading ? "登録中..." : "管理者を登録してログイン"}
        </Button>
      </form>
    </Card>
  );
}

// サーバーに接続できないとき。デスクトップアプリでは接続先（使い方）を変えられる
function ConnectError({ onRetry }: { onRetry: () => void }) {
  const desktop = useDesktopStatus();
  return (
    <Card subtitle="サーバーに接続できません">
      <div className="space-y-4">
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <span className="font-mono text-[0.8125rem]">{getBaseUrl()}</span> に接続できません。
          サーバーが動いているか、ネットワークにつながっているかを確認してください。
        </p>
        <Button variant="secondary" onClick={onRetry} className="w-full">
          再接続
        </Button>
        {desktop?.canChangeMode && (
          <div className="border-t border-border pt-4">
            <p className="mb-3 text-sm text-foreground/80">接続先を変える</p>
            <ModeChooser currentMode={desktop.mode} currentServerUrl={desktop.serverUrl} />
          </div>
        )}
      </div>
    </Card>
  );
}
