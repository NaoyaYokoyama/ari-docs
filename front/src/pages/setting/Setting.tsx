import { useState } from "react";
import { updateDisplayName, updatePassword } from "@/api/setting"
import Sidebar from "@/pages/setting/Sidebar";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input"
import type { SettingSection } from "@/pages/setting/settingSection";

export default function Setting() {
  const [section, setSection] = useState<SettingSection>("username");
  return (
    <div className="flex h-full">
      <Sidebar
        section={section}
        setSection={setSection}
      />

      <main>
        {section === "username" && <UsernameSetting />}
        {section === "password" && <PasswordSetting />}
      </main>
    </div>
  );
}

export function UsernameSetting() {
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRe, setPasswordRe] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  return (
    <div className="p-3">
      <h2>ユーザー名変更</h2>
      <div>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="新しいユーザ名" />
      </div>
      <div className="mt-4 flex justify-end">

        <Button
          onClick={async () => {
            const response = await updateDisplayName(displayName);
            sessionStorage.setItem(
              "message",
              response.message,
            );
            window.location.reload();
          }}
        >
          送信
        </Button>
      </div>
    </div>
  );
}

export function PasswordSetting() {
  const [displayName, setDisplayName] = useState("");
  return (
    <div className="p-3">
      <h2>パスワード変更</h2>
      <div>
        <Input
          value={displayName}
          type="password"
          placeholder="現在のパスワード" />
      </div>
      <div>
        <Input
          value={displayName}
          type="password"
          placeholder="新しいパスワード" />
      </div>
      <div>
        <Input
          type="password"
          value={displayName}
          placeholder="新しいパスワード(確認用)" />
      </div>
    </div>
  );
}
