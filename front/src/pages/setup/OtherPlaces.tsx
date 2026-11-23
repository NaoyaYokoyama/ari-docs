import { Laptop, Server } from "lucide-react";

import { type Place, switchPlace } from "@/app/places";
import PlaceMark from "@/components/common/PlaceMark";

type Props = {
  places: Place[];
  // 今の場所（出さない）
  currentId: string;
  // 自分の PC を出さない（自分の PC を起動できなかったとき）
  hideLocal?: boolean;
};

// ほかの場所へ切り替えるボタン（起動エラー・つながらないとき・ログイン画面。FN0002-BR20）
export default function OtherPlaces({ places, currentId, hideLocal = false }: Props) {
  const others = places.filter((place) => place.id !== currentId && !(hideLocal && place.local));
  if (others.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-foreground/80">ほかの場所に切り替える</p>
      <div className="flex flex-col gap-1.5">
        {others.map((place) => {
          const Icon = place.local ? Laptop : Server;
          return (
            <button
              key={place.id}
              type="button"
              onClick={() => switchPlace(place.id)}
              className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <PlaceMark color={place.color} />
              <Icon size={15} className="shrink-0 text-muted-foreground" />
              <span className="font-medium">{place.name}</span>
              {place.url && (
                <span className="ml-auto truncate font-mono text-xs text-muted-foreground">{place.url}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
