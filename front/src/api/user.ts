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

export function resetPassword(userId: string, password: string) {
  return post<MessageResponse>("/api/users/reset-password", {
    userId,
    password,
  });
}
