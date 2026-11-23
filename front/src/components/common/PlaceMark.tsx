import { twMerge } from "tailwind-merge";

import { PLACE_COLOR_CLASS } from "@/app/places";
import type { PlaceColor } from "@/types/setup";

// 場所の色の印（FN0002-BR20）
export default function PlaceMark({ color, className }: { color: PlaceColor; className?: string }) {
  return (
    <span aria-hidden className={twMerge("inline-block size-2.5 shrink-0 rounded-full", PLACE_COLOR_CLASS[color], className)} />
  );
}
