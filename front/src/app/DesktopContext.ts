import { createContext, useContext } from "react";

import type { Place } from "@/app/places";
import type { PlacesConfig, SetupStatus } from "@/types/setup";

export type DesktopInfo = {
  // デスクトップアプリの起動の状態
  status: SetupStatus;
  // 今の場所と、登録した場所（自分の PC が先頭。FN0002-BR20）
  place: Place;
  places: Place[];
  // 場所を保存する（再起動しない）
  savePlaces: (places: PlacesConfig) => Promise<void>;
};

// DesktopGate が渡す。ブラウザでは null
export const DesktopContext = createContext<DesktopInfo | null>(null);

export function useDesktop() {
  return useContext(DesktopContext);
}
