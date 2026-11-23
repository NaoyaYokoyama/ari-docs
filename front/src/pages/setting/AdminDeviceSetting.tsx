import { MonitorCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  type AdminDevice,
  createPairingCode,
  deleteAdminDevice,
  getAdminDevices,
  registerAdminDevice,
} from "@/api/adminDevice";
import { getMe } from "@/api/auth";
import { getUsers } from "@/api/user";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import IconButton from "@/components/common/IconButton";
import Input from "@/components/common/Input";
import Spinner from "@/components/common/Spinner";
import { clientName } from "@/lib/clientName";
import { errorMessage, formatDateTime } from "@/lib/format";
import { Field, SettingCard, SettingPanel } from "@/pages/setting/SettingPanel";
import type { UserItem } from "@/types/user";

// 管理者の PC（FN0102-BR12）。管理者の操作は、ここに登録した PC のデスクトップアプリからだけできる
export default function AdminDeviceSetting() {
  const { user } = useApp();
  return (
    <SettingPanel
      title="管理者の PC"
      description="管理者の操作（ユーザーの管理・サーバーの設定・バックアップの復元など）は、登録した PC からだけできます。パスワードが漏れても、ほかの PC から管理者の操作はされません"
      plain
    >
      {user?.adminElsewhere ? <RegisterThisPc /> : <DeviceList />}
    </SettingPanel>
  );
}

// 登録していない PC で使っている管理者。コードを入れてこの PC を登録する
function RegisterThisPc() {
  const { setUser, showMessage } = useApp();
  const [code, setCode] = useState("");
  // 一覧でほかの PC と見分ける名前（例: 自席の PC・ノート PC）
  const [name, setName] = useState(clientName());
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await registerAdminDevice(code.trim(), name);
      showMessage("info", response.message);
      setUser(await getMe());
    } catch (error) {
      showMessage("error", errorMessage(error, "この PC を登録できませんでした"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingCard
      title="この PC を管理者の PC にする"
      description="この PC は管理者の PC に登録していないので、利用者として使っています。登録した PC の「管理者の PC」で発行したコード（10 分有効）を入れてください。登録した PC をすべて失ったときは、サーバーを起動した画面かデータのフォルダの setup-code.txt にある登録用のコードを使えます"
    >
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <Field label="コード" htmlFor="admin-device-code">
          <Input
            id="admin-device-code"
            autoComplete="off"
            placeholder="XXXX-XXXX"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-40 font-mono"
          />
        </Field>
        <Field label="この PC の名前（一覧で見分けるため）" htmlFor="admin-device-name">
          <Input
            id="admin-device-name"
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-56"
          />
        </Field>
        <Button type="submit" disabled={saving || !code.trim()}>
          {saving ? "登録中..." : "この PC を登録"}
        </Button>
      </form>
    </SettingCard>
  );
}

// 登録した PC の一覧と、ほかの PC を登録するコードの発行
function DeviceList() {
  const { user, showMessage, showConfirm } = useApp();
  const [devices, setDevices] = useState<AdminDevice[] | null>(null);
  const [admins, setAdmins] = useState<UserItem[]>([]);
  const [target, setTarget] = useState(user?.userId ?? "");
  const [pairing, setPairing] = useState<{ code: string; name: string } | null>(null);

  const load = useCallback(() => {
    getAdminDevices()
      .then(setDevices)
      .catch((error) => {
        console.error(error);
        showMessage("error", errorMessage(error, "管理者の PC を読み込めませんでした"));
        setDevices([]);
      });
    getUsers()
      .then((users) => setAdmins(users.filter((item) => item.isAdmin)))
      .catch(console.error);
  }, [showMessage]);

  useEffect(load, [load]);

  const issue = async () => {
    try {
      const response = await createPairingCode(target);
      const admin = admins.find((item) => item.userId === target);
      setPairing({ code: response.code, name: admin?.displayName ?? target });
    } catch (error) {
      showMessage("error", errorMessage(error, "コードを発行できませんでした"));
    }
  };

  const remove = async (device: AdminDevice) => {
    const confirmed = await showConfirm(
      device.current
        ? "この PC を管理者の PC から外しますか？外すと、この PC では管理者の操作ができなくなります"
        : `「${device.displayName}」の「${device.name || "PC"}」を管理者の PC から外しますか？`,
    );
    if (!confirmed) {
      return;
    }
    try {
      const response = await deleteAdminDevice(device.deviceId);
      showMessage("info", response.message);
      if (device.current) {
        window.location.reload();
        return;
      }
      load();
    } catch (error) {
      showMessage("error", errorMessage(error, "外せませんでした"));
    }
  };

  return (
    <>
      <SettingCard
        title="ほかの PC を登録する"
        description="コードを発行し、登録する PC の ari-docs でその管理者としてログインして、設定の「管理者の PC」に入れます。コードは 10 分間、1 回だけ使えます"
      >
        <div className="flex flex-wrap items-end gap-2">
          <Field label="登録する人" htmlFor="admin-device-target">
            <select
              id="admin-device-target"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setPairing(null);
              }}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              {admins.map((item) => (
                <option key={item.userId} value={item.userId}>
                  {item.displayName}（{item.userId}）
                </option>
              ))}
            </select>
          </Field>
          <Button onClick={() => void issue()} disabled={!target}>
            コードを発行
          </Button>
        </div>
        {pairing && (
          <p className="mt-3 rounded-md bg-muted p-3 text-sm">
            「{pairing.name}」の PC を登録するコード:{" "}
            <span className="font-mono text-base font-semibold tracking-wider">{pairing.code}</span>
            <span className="block text-xs text-muted-foreground">10 分間、1 回だけ使えます</span>
          </p>
        )}
      </SettingCard>

      <SettingCard title="登録した PC">
        {!devices ? (
          <Spinner />
        ) : devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">登録した PC はありません</p>
        ) : (
          <ul className="divide-y divide-border">
            {devices.map((device) => (
              <li key={device.deviceId} className="flex items-center gap-3 py-2.5">
                <MonitorCheck size={16} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {device.displayName}・{device.name || "PC"}
                    {device.current && (
                      <span className="ml-1.5 text-xs font-normal text-brand">（この PC）</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    登録 {formatDateTime(device.createdAt)}・最後に使った日時 {formatDateTime(device.lastUsedAt)}
                  </p>
                </div>
                <IconButton label="管理者の PC から外す" onClick={() => void remove(device)}>
                  <Trash2 size={16} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </SettingCard>
    </>
  );
}
