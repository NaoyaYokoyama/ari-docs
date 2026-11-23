import { KeyRound, Plus, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { changeRole, createUser, deleteUser, getUsers, resetPassword, updatePermissions } from "@/api/user";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import IconButton from "@/components/common/IconButton";
import Input from "@/components/common/Input";
import Spinner from "@/components/common/Spinner";
import { errorMessage } from "@/lib/format";
import { Field, SettingPanel } from "@/pages/setting/SettingPanel";
import type { UserItem } from "@/types/user";

// 管理者が利用者に付けられる許可（FN0102-BR11）。既定はどれも無し
const PERMISSION_LABELS: { id: string; label: string; description: string }[] = [
  { id: "dictionary", label: "検索の辞書", description: "検索の辞書に単語を登録・削除できる" },
  { id: "exclusion", label: "全員の対象外", description: "全員の検索の対象外を変えられる" },
  {
    id: "backup",
    label: "バックアップ",
    description: "バックアップを取る・設定を変えられる（ダウンロード・復元・削除は管理者だけ）",
  },
];

// ユーザー管理（共有モードの管理者だけ）。登録・管理者と利用者の切り替え・許可・パスワードの再設定・削除を行う
export default function UserManagement() {
  const { user, showMessage, showConfirm } = useApp();
  const [users, setUsers] = useState<UserItem[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<UserItem | null>(null);

  const load = useCallback(() => {
    getUsers()
      .then(setUsers)
      .catch((error) => {
        console.error(error);
        showMessage("error", errorMessage(error, "ユーザー一覧の取得に失敗しました"));
        setUsers([]);
      });
  }, [showMessage]);

  useEffect(load, [load]);

  const toggleRole = async (target: UserItem) => {
    const next = !target.isAdmin;
    const confirmed = await showConfirm(
      next
        ? `「${target.displayName}（${target.userId}）」を管理者にしますか？ユーザーの管理・バックアップ・サーバーの設定ができるようになります。管理者の操作は、その人が「管理者の PC」で自分の PC を登録したあとにできます`
        : `「${target.displayName}（${target.userId}）」を利用者にしますか？管理者の操作ができなくなります`,
    );
    if (!confirmed) {
      return;
    }
    try {
      const response = await changeRole(target.userId, next);
      showMessage("info", response.message);
      load();
    } catch (error) {
      showMessage("error", errorMessage(error, "切り替えに失敗しました"));
    }
  };

  const togglePermission = async (target: UserItem, permission: string) => {
    const next = target.permissions.includes(permission)
      ? target.permissions.filter((p) => p !== permission)
      : [...target.permissions, permission];
    try {
      const response = await updatePermissions(target.userId, next);
      showMessage("info", response.message);
      load();
    } catch (error) {
      showMessage("error", errorMessage(error, "許可を変えられませんでした"));
    }
  };

  const remove = async (target: UserItem) => {
    const confirmed = await showConfirm(
      `ユーザー「${target.displayName}（${target.userId}）」を削除しますか？そのユーザーの Note とお気に入りも削除します（Wiki は残ります）`,
    );
    if (!confirmed) {
      return;
    }
    try {
      const response = await deleteUser(target.userId);
      showMessage("info", response.message);
      load();
    } catch (error) {
      showMessage("error", errorMessage(error, "ユーザーの削除に失敗しました"));
    }
  };

  return (
    <SettingPanel
      title="ユーザー管理"
      description="この共有サーバーを使うユーザーを登録します。登録したユーザー ID と初期パスワードを本人に伝えてください"
    >
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={16} />
          ユーザーを登録
        </Button>
      </div>

      {!users ? (
        <Spinner />
      ) : (
        <ul className="divide-y divide-border">
          {users.map((item) => (
            <li key={item.userId} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {item.displayName}
                  {item.isAdmin && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-brand/10 px-1.5 py-0.5 text-[0.6875rem] font-normal text-brand">
                      <ShieldCheck size={12} />
                      管理者
                    </span>
                  )}
                  {item.userId === user?.userId && (
                    <span className="text-xs font-normal text-muted-foreground">（自分）</span>
                  )}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">{item.userId}</p>
                {!item.isAdmin && (
                  <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="許可">
                    {PERMISSION_LABELS.map((permission) => {
                      const granted = item.permissions.includes(permission.id);
                      return (
                        <button
                          key={permission.id}
                          type="button"
                          aria-pressed={granted}
                          title={`${permission.description}（押すと${granted ? "外します" : "付けます"}）`}
                          onClick={() => void togglePermission(item, permission.id)}
                          className={`rounded border px-1.5 py-0.5 text-[0.6875rem] ${
                            granted
                              ? "border-brand bg-brand/10 text-brand"
                              : "border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {granted ? "✓ " : ""}
                          {permission.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <IconButton
                label={
                  item.userId === user?.userId
                    ? "自分の管理者・利用者は変えられません"
                    : item.isAdmin
                      ? "利用者にする"
                      : "管理者にする"
                }
                disabled={item.userId === user?.userId}
                onClick={() => void toggleRole(item)}
              >
                {item.isAdmin ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
              </IconButton>
              <IconButton label="パスワードを再設定" onClick={() => setResetting(item)}>
                <KeyRound size={16} />
              </IconButton>
              <IconButton
                label={item.userId === user?.userId ? "自分は削除できません" : "削除"}
                disabled={item.userId === user?.userId}
                onClick={() => void remove(item)}
              >
                <Trash2 size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <CreateUserDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(message) => {
          setCreating(false);
          showMessage("info", message);
          load();
        }}
      />
      <ResetPasswordDialog
        target={resetting}
        onClose={() => setResetting(null)}
        onDone={(message) => {
          setResetting(null);
          showMessage("info", message);
        }}
      />
    </SettingPanel>
  );
}

function CreateUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [userId, setUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setUserId("");
      setDisplayName("");
      setPassword("");
      setIsAdmin(false);
      setError("");
    }
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await createUser(userId.trim(), displayName.trim(), password, isAdmin);
      onCreated(response.message);
    } catch (e) {
      setError(errorMessage(e, "ユーザーの登録に失敗しました"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} title="ユーザーを登録" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="ユーザーID（半角英数字と _ . -、32 文字まで）" htmlFor="new-user-id">
          <Input
            id="new-user-id"
            autoFocus
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full"
          />
        </Field>
        <Field label="表示名（30 文字まで）" htmlFor="new-user-name">
          <Input
            id="new-user-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full"
          />
        </Field>
        <Field label="初期パスワード（8 文字以上）" htmlFor="new-user-password">
          <Input
            id="new-user-password"
            type="text"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full font-mono"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
          />
          管理者にする（ユーザーを管理できる）
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            type="submit"
            disabled={saving || !userId.trim() || !displayName.trim() || !password}
          >
            登録
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ResetPasswordDialog({
  target,
  onClose,
  onDone,
}: {
  target: UserItem | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPassword("");
    setError("");
  }, [target]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!target) {
      return;
    }
    setError("");
    setSaving(true);
    try {
      const response = await resetPassword(target.userId, password);
      onDone(response.message);
    } catch (e) {
      setError(errorMessage(e, "パスワードの再設定に失敗しました"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={target !== null}
      title="パスワードを再設定"
      description={
        target
          ? `${target.displayName}（${target.userId}）の新しいパスワードを決めて本人に伝えてください。そのユーザーはログアウトします`
          : undefined
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="新しいパスワード（8 文字以上）" htmlFor="reset-password">
          <Input
            id="reset-password"
            autoFocus
            type="text"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full font-mono"
          />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" disabled={saving || !password}>
            再設定
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
