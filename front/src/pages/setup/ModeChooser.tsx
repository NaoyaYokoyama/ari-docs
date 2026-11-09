import { Laptop, Server } from "lucide-react";
import { type ReactNode, useState } from "react";
import { twMerge } from "tailwind-merge";

import { changeMode } from "@/api/setup";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import { checkServer } from "@/pages/setup/serverCheck";

type Mode = "local" | "server";

type Props = {
  // 今の使い方と接続先（初回起動では空文字）
  currentMode: string;
  currentServerUrl: string;
};

// 使い方（個人用 / 共有サーバーに接続）を選ぶ。決めると config.toml に保存してアプリを再起動する
// （初回起動の画面・起動エラーの画面・設定画面・ログイン画面で使う）
export default function ModeChooser({ currentMode, currentServerUrl }: Props) {
  const [mode, setMode] = useState<Mode>(currentMode === "server" ? "server" : "local");
  const [url, setUrl] = useState(currentServerUrl || "http://");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const normalized = url.trim().replace(/\/+$/, "");
  const unchanged =
    mode === currentMode && (mode === "local" || normalized === currentServerUrl);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (mode === "server") {
        await checkServer(normalized);
      }
      await changeMode(mode, mode === "server" ? normalized : "");
      // 成功するとアプリが再起動する
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div role="radiogroup" aria-label="使い方" className="space-y-2">
        <ModeOption
          checked={mode === "local"}
          onSelect={() => setMode("local")}
          icon={<Laptop size={18} />}
          title="個人用"
          description="この PC だけで使います。ログインは不要です。ほかの PC からは接続できません"
        />
        <ModeOption
          checked={mode === "server"}
          onSelect={() => setMode("server")}
          icon={<Server size={18} />}
          title="共有サーバーに接続"
          description="複数人で使う ari-docs のサーバーに接続します。ユーザー ID とパスワードでログインします"
        />
      </div>

      {mode === "server" && (
        <div>
          <label htmlFor="server-url" className="mb-1.5 block text-sm font-medium">
            サーバーの URL
          </label>
          <Input
            id="server-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="例: http://ari-server:8080"
            className="w-full font-mono text-[0.8125rem]"
          />
        </div>
      )}

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving || unchanged || (mode === "server" && !normalized)}>
          {saving ? "確認中..." : "保存して再起動"}
        </Button>
      </div>
    </form>
  );
}

function ModeOption({
  checked,
  onSelect,
  icon,
  title,
  description,
}: {
  checked: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={twMerge(
        "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
        checked ? "border-brand bg-brand/5" : "border-border hover:bg-accent",
      )}
    >
      <span className={twMerge("mt-0.5", checked ? "text-brand" : "text-muted-foreground")}>
        {icon}
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}
