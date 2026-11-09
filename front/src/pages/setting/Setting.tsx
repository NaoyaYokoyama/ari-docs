import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import {
  getDocsRoot,
  updateDisplayName,
  updateDocsRoot,
  updatePassword,
} from "@/api/setting";
import { getSetupStatus } from "@/api/setup";
import { useApp } from "@/app/AppContext";
import { useDesktopStatus } from "@/app/DesktopContext";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import Spinner from "@/components/common/Spinner";
import { errorMessage } from "@/lib/format";
import { AboutSetting, TransferSetting } from "@/pages/setting/AboutSetting";
import BackupSetting from "@/pages/setting/BackupSetting";
import { AppearanceSetting, BehaviorSetting } from "@/pages/setting/PreferenceSetting";
import SearchDictionary from "@/pages/setting/SearchDictionary";
import ServerSetting from "@/pages/setting/ServerSetting";
import SessionSetting from "@/pages/setting/SessionSetting";
import { Field, SettingPanel } from "@/pages/setting/SettingPanel";
import { isVisibleSection, type SettingSection } from "@/pages/setting/settingSection";
import ShortcutSetting from "@/pages/setting/ShortcutSetting";
import Sidebar from "@/pages/setting/Sidebar";
import SupportedFiles from "@/pages/setting/SupportedFiles";
import UserManagement from "@/pages/setting/UserManagement";
import VimSetting from "@/pages/setting/VimSetting";
import ModeChooser from "@/pages/setup/ModeChooser";
import WorkspacePicker from "@/pages/setup/WorkspacePicker";
import type { SetupStatus } from "@/types/setup";

export default function Setting() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { user } = useApp();
  const desktop = useDesktopStatus();
  // 開いているメニューは URL（?section=）に持つ（再読み込み・戻るでも同じメニューを出す）。
  // 他の画面から開くときは state でも指定できる（例: Docs 画面からの「初期フォルダを変更」）
  const requested = params.get("section") ?? location.state?.section ?? "username";
  // 今の動作モードで出さないメニューが指定されたら、先頭のメニューを出す
  const section: SettingSection = isVisibleSection(requested, user, desktop) ? requested : "username";
  const setSection = (next: SettingSection) => setParams({ section: next }, { replace: true });
  return (
    <div className="flex h-full">
      <Sidebar
        section={section}
        setSection={setSection}
      />

      <main className="min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="mx-auto max-w-2xl px-8 py-8">
          {section === "username" && <UsernameSetting />}
          {section === "password" && (
            <div className="space-y-10">
              <PasswordSetting />
              <SessionSetting />
            </div>
          )}
          {section === "appearance" && <AppearanceSetting />}
          {section === "behavior" && <BehaviorSetting />}
          {section === "shortcuts" && <ShortcutSetting />}
          {section === "vim" && <VimSetting />}
          {section === "docs" && <DocsRootSetting />}
          {section === "dictionary" && <SearchDictionary />}
          {section === "formats" && <SupportedFiles />}
          {section === "users" && <UserManagement />}
          {section === "server" && <ServerSetting />}
          {section === "backup" && <BackupSetting />}
          {section === "mode" && <ModeSetting />}
          {section === "workspace" && <WorkspaceSetting />}
          {section === "transfer" && <TransferSetting />}
          {section === "about" && <AboutSetting />}
        </div>
      </main>
    </div>
  );
}

export function UsernameSetting() {
  const { user } = useApp();
  const [displayName, setDisplayName] = useState("");
  const trimmed = displayName.trim();

  const { showMessage } = useApp();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmed) {
      return;
    }
    try {
      const response = await updateDisplayName(trimmed);
      sessionStorage.setItem("message", response.message);
      window.location.reload();
    } catch (error) {
      showMessage("error", errorMessage(error, "ユーザー名の変更に失敗しました"));
    }
  };

  return (
    <SettingPanel title="ユーザー名" description="画面に表示する名前です">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm">
          現在: <span className="font-medium">{user?.displayName}</span>
        </p>
        <Field label="新しいユーザー名" htmlFor="display-name">
          <Input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="新しいユーザー名"
            className="w-full"
          />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" disabled={!trimmed || trimmed === user?.displayName}>
            変更
          </Button>
        </div>
      </form>
    </SettingPanel>
  );
}

export function PasswordSetting() {
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const mismatch = newPasswordConfirm !== "" && newPassword !== newPasswordConfirm;

  const { showMessage } = useApp();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const response = await updatePassword(currentPassword, newPassword, newPasswordConfirm);
      sessionStorage.setItem("message", response.message);
      window.location.reload();
    } catch (error) {
      showMessage("error", errorMessage(error, "パスワードの変更に失敗しました"));
    }
  };

  return (
    <SettingPanel title="パスワード" description="ログインに使うパスワードを変更します">
      <form onSubmit={submit} className="space-y-4">
        <Field label="現在のパスワード" htmlFor="current-password">
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full"
          />
        </Field>
        <Field label="新しいパスワード" htmlFor="new-password">
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full"
          />
        </Field>
        <Field label="新しいパスワード（確認用）" htmlFor="new-password-confirm">
          <Input
            id="new-password-confirm"
            type="password"
            autoComplete="new-password"
            value={newPasswordConfirm}
            onChange={(e) => setNewPasswordConfirm(e.target.value)}
            className="w-full"
          />
          {mismatch && (
            <p className="mt-1.5 text-xs text-destructive">新しいパスワードが一致しません</p>
          )}
        </Field>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={!currentPassword || !newPassword || newPassword !== newPasswordConfirm}
          >
            変更
          </Button>
        </div>
      </form>
    </SettingPanel>
  );
}

// Docs（Markdown ビューア）を開いたときに表示するフォルダ
export function DocsRootSetting() {
  const { showMessage } = useApp();
  const [docsRoot, setDocsRoot] = useState("");
  const [defaultRoot, setDefaultRoot] = useState("");
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getDocsRoot()
      .then((response) => {
        setDocsRoot(response.docsRoot);
        setDefaultRoot(response.defaultRoot);
        setInput(response.docsRoot);
      })
      .catch((error) => {
        console.error(error);
        showMessage("error", "Docs の初期フォルダの取得に失敗しました");
      })
      .finally(() => setLoaded(true));
  }, [showMessage]);

  const save = async (value: string) => {
    try {
      const response = await updateDocsRoot(value);
      setDocsRoot(response.data.docsRoot);
      setInput(response.data.docsRoot);
      showMessage("info", response.message);
    } catch (error) {
      showMessage("error", errorMessage(error, "Docs の初期フォルダの変更に失敗しました"));
    }
  };

  return (
    <SettingPanel
      title="Docs の初期フォルダ"
      description="Docs を開いたときに表示するフォルダです。絶対パスで指定します"
    >
      {!loaded ? (
        <Spinner />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim() && input.trim() !== docsRoot) {
              void save(input);
            }
          }}
        >
          <p className="text-sm">
            現在:{" "}
            {docsRoot ? (
              <span className="font-mono text-[0.8125rem]">{docsRoot}</span>
            ) : (
              <span className="text-muted-foreground">
                未設定（<span className="font-mono text-[0.8125rem]">{defaultRoot}</span> を表示）
              </span>
            )}
          </p>
          <Field label="フォルダ" htmlFor="docs-root">
            <Input
              id="docs-root"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="例: /home/user/project/docs"
              className="w-full font-mono text-[0.8125rem]"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={!docsRoot} onClick={() => void save("")}>
              解除
            </Button>
            <Button type="submit" disabled={!input.trim() || input.trim() === docsRoot}>
              保存
            </Button>
          </div>
        </form>
      )}
    </SettingPanel>
  );
}

// デスクトップアプリの使い方（個人用 / 共有サーバーに接続）。変えると再起動する
export function ModeSetting() {
  const desktop = useDesktopStatus();
  if (!desktop) {
    return null;
  }
  return (
    <SettingPanel
      title="使い方"
      description="個人用はこの PC だけで使います（ほかの PC からは接続できません）。共有サーバーに接続すると、複数人で同じファイル・Wiki を使えます。個人用のデータと共有サーバーのデータは別で、変えてもデータは移りません。"
    >
      {desktop.canChangeMode ? (
        <>
          <p className="mb-4 text-sm">
            現在:{" "}
            {desktop.mode === "server" ? (
              <>
                共有サーバーに接続（
                <span className="font-mono text-[0.8125rem]">{desktop.serverUrl}</span>）
              </>
            ) : (
              "個人用"
            )}
          </p>
          <ModeChooser currentMode={desktop.mode} currentServerUrl={desktop.serverUrl} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          開発用のビルドでは back/config.toml の設定（または環境変数 ARI_DOCS_SERVER_URL）で動くため、変えられません。
        </p>
      )}
    </SettingPanel>
  );
}

// デスクトップアプリの作業フォルダ。変えると再起動して、そのフォルダのデータに切り替わる
export function WorkspaceSetting() {
  const [status, setStatus] = useState<SetupStatus | null>(null);

  useEffect(() => {
    getSetupStatus().then(setStatus).catch(console.error);
  }, []);

  return (
    <SettingPanel
      title="作業フォルダ"
      description="ファイル（folder/）と ari-docs のデータ（.ari-docs/）を置くフォルダです。変えるとアプリを再起動し、選んだフォルダのファイル・Note・Wiki・お気に入りに切り替わります。今のフォルダのデータはそのまま残ります。"
    >
      {!status ? (
        <Spinner />
      ) : status.canChangeWorkspace ? (
        <>
          <p className="mb-4 text-sm">
            現在: <span className="font-mono text-[0.8125rem]">{status.workspace}</span>
          </p>
          <WorkspacePicker current={status.workspace} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          開発用のビルドでは back/config.toml の設定で動くため、変えられません。
        </p>
      )}
    </SettingPanel>
  );
}
