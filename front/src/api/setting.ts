import { get, post } from "@/api/client";

export function updateDisplayName(
  displayName: string,
) {
  return post("/api/setting/update/display-name", {
    displayName,
  });
}

export function updatePassword(
  oldPassword: string,
  newPassword: string,
  newPasswordRe: string,
) {
  return post("/api/setting/update/password", {
    oldPassword,
    newPassword,
    newPasswordRe,
  });
}

