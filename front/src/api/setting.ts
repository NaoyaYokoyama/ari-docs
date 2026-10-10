import { post } from "@/api/client";
import type { MessageResponse } from "@/types/messageResponse";

export function updateDisplayName(
  displayName: string,
) {
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

