import { get, post } from "@/api/client";
import type { MessageResponse } from "@/types/messageResponse";
import type {
  DocsRootResponse,
  SessionListResponse,
  UpdateDocsRootResponse,
} from "@/types/setting";

export function updateDisplayName(displayName: string) {
  return post<MessageResponse>("/api/setting/update/display-name", {
    displayName,
  });
}

export function updatePassword(
  currentPassword: string,
  newPassword: string,
  newPasswordConfirm: string,
) {
  return post<MessageResponse>("/api/setting/update/password", {
    currentPassword,
    newPassword,
    newPasswordConfirm,
  });
}

export function getDocsRoot() {
  return get<DocsRootResponse>("/api/setting/docs-root");
}

// 空文字を送ると解除する
export function updateDocsRoot(docsRoot: string) {
  return post<UpdateDocsRootResponse>("/api/setting/update/docs-root", {
    docsRoot,
  });
}

// ログイン中の端末（共有モード。FN0101-BR15）
export function getSessions() {
  return get<SessionListResponse>("/api/setting/sessions");
}

export function logoutSession(key: number) {
  return post<MessageResponse>("/api/setting/sessions/logout", { key });
}

export function logoutOtherSessions() {
  return post<MessageResponse>("/api/setting/sessions/logout", { others: true });
}
