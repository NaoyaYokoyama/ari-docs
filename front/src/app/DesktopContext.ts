import { createContext, useContext } from "react";

import type { SetupStatus } from "@/types/setup";

// デスクトップアプリの起動の状態（DesktopGate が渡す）。ブラウザでは null
export const DesktopContext = createContext<SetupStatus | null>(null);

export function useDesktopStatus() {
  return useContext(DesktopContext);
}
