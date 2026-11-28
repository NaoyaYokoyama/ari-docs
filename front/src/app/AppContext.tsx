import {
  createContext,
  useContext,
} from "react";

export type LoginUser = {
  userId: string;
  displayName: string;
  // local（ローカルモード）/ shared（共有モード）
  mode: string;
  // 共有モードでユーザーを管理できる
  isAdmin: boolean;
  // Docs（Markdown ビューア）を使う設定か（サーバーの設定。既定は使わない）
  docsEnabled: boolean;
  // 使える許可（dictionary・exclusion・backup。FN0102-BR11）。ローカルモード・管理者はすべて
  permissions: Permission[];
  // 管理者だが、この PC を管理者の PC に登録していない（利用者として使っている。FN0102-BR12）
  adminElsewhere: boolean;
  // ファイルのロックの期限の上限（日。サーバーの設定。FN0301-BR38）
  fileLockMaxDays?: number;
  // Note・Wiki に貼る画像の縮め方（サーバーの設定。FN0902-BR09）
  imageCompress?: boolean;
  imageQuality?: number;
  imageMaxSide?: number;
};

export type Permission = "dictionary" | "exclusion" | "backup";

// 許可の要る操作をしてよいか（FN0102-BR11）
export function hasPermission(user: LoginUser | null, permission: Permission) {
  return !!user?.permissions?.includes(permission);
}

type AppContextType = {
  user: LoginUser | null;

  setUser: React.Dispatch<
    React.SetStateAction<LoginUser | null>
  >;

  showMessage: (
    type: "info" | "error",
    text: string,
  ) => void;

  showConfirm: (
    message: string,
  ) => Promise<boolean>;

  isDirty: boolean;
  setIsDirty: React.Dispatch<
    React.SetStateAction<boolean>
  >;

};

export const AppContext =
  createContext<AppContextType | null>(null);

export function useApp() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error(
      "AppContext is not available",
    );
  }

  return context;
}
