import { Check, Copy, Radio, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { publishHost, setHostPort, setPublish } from "@/api/setup";
import { useApp } from "@/app/AppContext";
import { useDesktop } from "@/app/DesktopContext";
import Button from "@/components/common/Button";
import IconButton from "@/components/common/IconButton";
import Input from "@/components/common/Input";
import { errorMessage } from "@/lib/format";
import { Field, SettingCard, SettingPanel } from "@/pages/setting/SettingPanel";

// この PC を共有サーバーとして公開する（docs の FN0005）。共有 PC で設定し、ほかの PC の ari-docs から場所として登録してつなぐ。
// 公開すると共有モード（ログインあり）になり、今のデータ（ユーザー local）は登録した管理者に移る。デスクトップアプリの自分の PC だけ
export default function HostSetting() {
  const desktop = useDesktop();
  if (!desktop) {
    return null;
  }
  const { host } = desktop.status;
  return (
    <SettingPanel
      title="この PC の公開"
      description="この PC を共有サーバーにして、ほかの PC の ari-docs からつなげるようにします。社内などプライベートのネットワークだけで使ってください（通信は暗号化しません）。"
      plain
    >
      {!host.shared ? <PublishForm /> : <PublishedState published={host.published} urls={host.urls} port={host.port} />}
    </SettingPanel>
  );
}

const NOTICES = [
  "この PC の Folder の中身は、ログインしたほかの人にすべて見えます。個人用のファイルは置かないでください",
  "今の Note・お気に入り・設定は、ここで登録する管理者のものになります。このあとは、この PC でもログインして使います",
  "Windows のファイアウォールの確認が出たら「プライベート ネットワーク」だけを許可してください（公共の Wi-Fi では公開しないため）",
  "この PC が止まる・スリープすると、ほかの人は使えません。スリープしないように設定してください",
  "共有モードから個人用には戻せません（公開をやめて、この PC の中からだけ使うことはできます）",
];

// 公開のポート（FN0005-BR10）。1024 未満は管理者の権限が要るので使わない
const DEFAULT_PORT = 8080;
function validPort(port: string) {
  const value = Number(port);
  return Number.isInteger(value) && value >= 1024 && value <= 65535;
}

function PublishForm() {
  const { showMessage, showConfirm } = useApp();
  const [userId, setUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [port, setPort] = useState(String(DEFAULT_PORT));

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const ready =
    agreed &&
    userId.trim() !== "" &&
    displayName.trim() !== "" &&
    password.length >= 8 &&
    password === confirmPassword &&
    validPort(port);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || !(await showConfirm("この PC を共有サーバーとして公開します。アプリを再起動しますか？"))) {
      return;
    }
    setSaving(true);
    try {
      // 成功するとアプリが再起動する
      await publishHost(userId.trim(), displayName.trim(), password, Number(port));
    } catch (error) {
      showMessage("error", errorMessage(error, "公開できませんでした"));
      setSaving(false);
    }
  };

  return (
    <>
      <SettingCard title="公開する前に">
        <ul className="space-y-2 text-sm">
          {NOTICES.map((notice) => (
            <li key={notice} className="flex gap-2">
              <ShieldAlert size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
              <span>{notice}</span>
            </li>
          ))}
        </ul>
      </SettingCard>

      <SettingCard
        title="管理者のアカウント"
        description="公開したあと、この PC とほかの PC でログインするアカウントです。ユーザー管理でほかの人を登録します"
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="ユーザー ID" htmlFor="host-user-id">
            <Input
              id="host-user-id"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="半角英数字と _ . -（32 文字まで）"
              maxLength={32}
              autoComplete="off"
            />
          </Field>
          <Field label="表示名" htmlFor="host-display-name">
            <Input
              id="host-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例: 山田（30 文字まで）"
              maxLength={30}
            />
          </Field>
          <Field label="パスワード（8 文字以上）" htmlFor="host-password">
            <Input
              id="host-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
          <Field label="パスワード（確認）" htmlFor="host-password-confirm">
            <Input
              id="host-password-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
          {mismatch && <p className="text-xs text-destructive">パスワードが一致しません</p>}
          <Field label="ポート（ふつうは 8080 のまま）" htmlFor="host-port">
            <Input
              id="host-port"
              type="number"
              min={1024}
              max={65535}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="w-32"
            />
          </Field>
          {!validPort(port) && <p className="text-xs text-destructive">ポートは 1024〜65535 で指定してください</p>}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 accent-brand"
            />
            上の注意を読み、この PC の Folder の中身がほかの人に見えることを確かめました
          </label>
          <div className="flex justify-end">
            <Button type="submit" disabled={!ready || saving}>
              <Radio size={16} />
              {saving ? "公開しています..." : "公開する（再起動します）"}
            </Button>
          </div>
        </form>
      </SettingCard>
    </>
  );
}

function PublishedState({ published, urls, port }: { published: boolean; urls: string[]; port: number }) {
  const { showMessage, showConfirm } = useApp();
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState("");
  const [newPort, setNewPort] = useState(String(port));

  const changePort = async () => {
    if (
      !(await showConfirm(
        `ポートを ${newPort} に変えます。ほかの PC では、設定の「場所」の URL を直す必要があります。アプリを再起動しますか？`,
      ))
    ) {
      return;
    }
    setSaving(true);
    try {
      // 成功するとアプリが再起動する
      await setHostPort(Number(newPort));
    } catch (error) {
      showMessage("error", errorMessage(error, "ポートを変えられませんでした"));
      setSaving(false);
    }
  };

  const toggle = async () => {
    const message = published
      ? "公開をやめます。ほかの PC からはつなげなくなります（アカウントと Wiki などはそのまま残ります）。アプリを再起動しますか？"
      : "また公開します。アプリを再起動しますか？";
    if (!(await showConfirm(message))) {
      return;
    }
    setSaving(true);
    try {
      // 成功するとアプリが再起動する
      await setPublish(!published);
    } catch (error) {
      showMessage("error", errorMessage(error, "切り替えられませんでした"));
      setSaving(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
    } catch (error) {
      showMessage("error", errorMessage(error, "コピーできませんでした"));
    }
  };

  return (
    <>
      <SettingCard>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className={published ? "size-2.5 rounded-full bg-place-green" : "size-2.5 rounded-full bg-place-gray"} />
          {published ? "公開しています" : "公開をやめています（この PC の中からだけ使えます）"}
        </p>
        {published && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-muted-foreground">
              ほかの PC では、設定の「場所」で次の URL を共有サーバーとして追加してください（PC の名前の方は IP
              アドレスが変わっても使えます）
            </p>
            {urls.length === 0 ? (
              <p className="text-sm">
                この PC の名前か IP アドレスに <span className="font-mono">:{port}</span> を付けた URL です（例:{" "}
                <span className="font-mono">http://PC の名前:{port}</span>）
              </p>
            ) : (
              <ul className="space-y-1">
                {urls.map((url) => (
                  <li key={url} className="flex items-center gap-2">
                    <span className="font-mono text-[0.8125rem]">{url}</span>
                    <IconButton label="コピー" onClick={() => void copy(url)}>
                      {copied === url ? <Check size={15} /> : <Copy size={15} />}
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </SettingCard>
      <SettingCard title="ポート" description="ほかのアプリと重なって起動できないときに変えます。変えたら、ほかの PC の「場所」の URL も直してください">
        <div className="flex items-end gap-2">
          <Field label="ポート" htmlFor="host-port-change">
            <Input
              id="host-port-change"
              type="number"
              min={1024}
              max={65535}
              value={newPort}
              onChange={(e) => setNewPort(e.target.value)}
              className="w-32"
            />
          </Field>
          <Button
            variant="secondary"
            disabled={saving || !validPort(newPort) || Number(newPort) === port}
            onClick={() => void changePort()}
          >
            変える（再起動します）
          </Button>
        </div>
      </SettingCard>
      <ul className="space-y-1 text-xs text-muted-foreground">
        <li>・この PC が止まる・スリープすると、ほかの人は使えません</li>
        <li>・ファイアウォールでは「プライベート ネットワーク」だけを許可してください</li>
        <li>・ほかの人のアカウントは、設定の「ユーザー管理」で登録します</li>
      </ul>
      <div className="flex justify-end">
        <Button variant={published ? "secondary" : "primary"} disabled={saving} onClick={() => void toggle()}>
          {saving ? "切り替えています..." : published ? "公開をやめる（再起動します）" : "また公開する（再起動します）"}
        </Button>
      </div>
    </>
  );
}
