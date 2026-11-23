import { get, post, setToken } from "@/api/client";
import type { LoginUser } from "@/app/AppContext";
import { clientName } from "@/lib/clientName";

export type ServerInfo = {
  app: string;
  // local（ローカルモード）/ shared（共有モード）
  mode: string;
  // ユーザーが 1 人もいない（最初に管理者を登録する）
  needsAdmin: boolean;
  // 管理者の登録に登録用のコードが要る（ほかの PC からつないだとき。FN0102-BR02）
  setupCodeRequired: boolean;
  // このサーバーの ID（ari:// のリンクで場所を見分ける。FN0004-BR07）
  serverId: string;
};

type LoginResponse = LoginUser & { token?: string };

export function getServerInfo() {
  return get<ServerInfo>("/api/server-info");
}

export function getMe() {
  return get<LoginUser>("/api/me", false);
}

export async function login(userId: string, password: string) {
  const response = await post<LoginResponse>("/api/login", {
    userId,
    password,
    client: clientName(),
  });
  setToken(response.token ?? null);
  return response;
}

// 最初の管理者を登録して、そのままログインする
export async function setupAdmin(userId: string, displayName: string, password: string, setupCode: string) {
  const response = await post<LoginResponse>("/api/setup/admin", {
    userId,
    displayName,
    password,
    setupCode,
    client: clientName(),
  });
  setToken(response.token ?? null);
  return response;
}

export async function logout() {
  try {
    await post<void>("/api/logout", {});
  } finally {
    setToken(null);
  }
}
