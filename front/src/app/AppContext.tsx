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
};

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
