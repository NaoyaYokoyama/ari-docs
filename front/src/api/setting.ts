import { get, post } from "@/api/client";

export function updateDisplayName(
  displayName: string,
) {
  return post("/api/setting/update/display-name", {
    displayName,
  });
}

export function updatePassword(
  currentPassword: string,
  newPassword: string,
  newPasswordConfirm: string,
) {
  return post("/api/setting/update/password", {
    currentPassword,
    newPassword,
    newPasswordConfirm,
  });
}

