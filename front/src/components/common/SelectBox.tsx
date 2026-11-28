import { useEffect, useRef } from "react";

// 一覧の行を選ぶためのチェックボックス（Folder の FN0301-BR37・ゴミ箱の FN0302-BR02）。見出しのものは、一部だけ選んでいるとき「－」
export default function SelectBox({
  checked,
  indeterminate = false,
  label,
  onToggle,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onToggle: (event: React.MouseEvent<HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      title={label}
      checked={checked}
      // 選ぶのはクリックで行う（Shift の範囲選択のため。行のクリック・ダブルクリックには渡さない）
      onChange={() => {}}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(event);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className="size-4 cursor-pointer align-middle accent-brand"
    />
  );
}
