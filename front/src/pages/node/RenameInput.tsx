import { useEffect, useRef, useState } from "react";

import { stemLength } from "@/lib/fileType";
import type { Node } from "@/types/node";
import { NodeType } from "@/types/nodeType";

// 一覧の行の中で名前を変える入力欄（FN0301-BR18）。Enter・ほかをクリックで決定、Esc で取り消し（null）
export default function RenameInput({ node, onEnd }: { node: Node; onEnd: (newName: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const [value, setValue] = useState(node.name);

  useEffect(() => {
    const input = ref.current;
    if (!input) {
      return;
    }
    input.focus();
    // 拡張子の前までを選ぶ（Windows のエクスプローラーと同じ）
    input.setSelectionRange(0, node.nodeType === NodeType.Folder ? node.name.length : stemLength(node.name));
  }, [node]);

  const finish = (newName: string | null) => {
    if (done.current) {
      return;
    }
    done.current = true;
    onEnd(newName);
  };

  return (
    <input
      ref={ref}
      value={value}
      aria-label="新しい名前"
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          finish(value.trim());
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(null);
        }
      }}
      onBlur={() => finish(value.trim())}
      className="h-7 min-w-0 flex-1 rounded border border-ring bg-background px-1.5 outline-none focus:ring-2 focus:ring-ring/30"
    />
  );
}
