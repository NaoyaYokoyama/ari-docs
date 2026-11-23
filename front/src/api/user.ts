import { get, post } from "@/api/client";
import type { MessageResponse } from "@/types/messageResponse";
import type { UserItem } from "@/types/user";

// ユーザーの管理（共有モードの管理者だけ）

export function getUsers() {
  return get<UserItem[]>("/api/users");
}

export function createUser(
  userId: string,
  displayName: string,
  password: string,
  isAdmin: boolean,
) {
  return post<MessageResponse>("/api/users/create", {
    userId,
    displayName,
    password,
    isAdmin,
  });
}

export function deleteUser(userId: string) {
  return post<MessageResponse>("/api/users/delete", { userId });
}

// 管理者・利用者を切り替える（自分は変えられない。FN0102-BR10）
export function changeRole(userId: string, isAdmin: boolean) {
  return post<MessageResponse>("/api/users/role", { userId, isAdmin });
}

// 利用者に許可を付ける・外す（FN0102-BR11）
export function updatePermissions(userId: string, permissions: string[]) {
  return post<MessageResponse>("/api/users/permissions", { userId, permissions });
}

export function resetPassword(userId: string, password: string) {
  return post<MessageResponse>("/api/users/reset-password", {
    userId,
    password,
  });
}
