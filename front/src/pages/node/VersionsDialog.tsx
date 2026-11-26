import { Download, History, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { downloadVersion, getVersions, restoreVersion } from "@/api/node";
import { useApp } from "@/app/AppContext";
import Dialog from "@/components/common/Dialog";
import EmptyState from "@/components/common/EmptyState";
import IconButton from "@/components/common/IconButton";
import Spinner from "@/components/common/Spinner";
import { saveBlob } from "@/lib/download";
import { formatSize } from "@/lib/fileType";
import { errorMessage } from "@/lib/format";
import type { Node, NodeVersionItem } from "@/types/node";

type Props = {
  // 以前の版を見るファイル（null なら閉じている）
  node: Node | null;
  onClose: () => void;
  // 戻したとき（一覧を読み直す）
  onRestored: () => void;
};

// ダウンロードする名前。その版の更新日時を付けて、今のファイルと見分けられるようにする（名前_YYYYMMDD-HHMM.拡張子）
function versionName(name: string, modifiedAt: string) {
  const stamp = modifiedAt.replace(/\//g, "").replace(" ", "-").replace(":", "");
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)}_${stamp}${name.slice(dot)}` : `${name}_${stamp}`;
}

// ファイルの以前の版（FN0301-BR39）。ari-docs で上書きする前の中身を、ダウンロード・その版に戻す
export default function VersionsDialog({ node, onClose, onRestored }: Props) {
  const { showMessage, showConfirm } = useApp();
  const [versions, setVersions] = useState<NodeVersionItem[] | null>(null);

  useEffect(() => {
    if (!node) {
      return;
    }
    setVersions(null);
    getVersions(node.path)
      .then(setVersions)
      .catch((error) => {
        console.error(error);
        setVersions([]);
        showMessage("error", errorMessage(error, "以前の版を読み込めませんでした"));
      });
  }, [node, showMessage]);

  const download = async (item: NodeVersionItem) => {
    if (!node) {
      return;
    }
    const name = versionName(node.name, item.modifiedAt);
    try {
      if (await saveBlob(name, await downloadVersion(node.path, item.versionId))) {
        showMessage("info", `「${name}」をダウンロードしました`);
      }
    } catch (error) {
      showMessage("error", errorMessage(error, "ダウンロードに失敗しました"));
    }
  };

  const restore = async (item: NodeVersionItem) => {
    if (
      !node ||
      !(await showConfirm(
        `「${node.name}」を ${item.modifiedAt} の版に戻しますか？今の中身も以前の版として残るので、あとで戻せます`,
      ))
    ) {
      return;
    }
    try {
      await restoreVersion(node.path, item.versionId);
      showMessage("info", `「${node.name}」を ${item.modifiedAt} の版に戻しました`);
      onRestored();
    } catch (error) {
      showMessage("error", errorMessage(error, "戻せませんでした"));
    }
  };

  return (
    <Dialog
      open={node !== null}
      title="以前の版"
      description={node?.name}
      onClose={onClose}
      className="max-w-xl"
    >
      <p className="mb-3 text-xs text-muted-foreground">
        ari-docs で上書きした（アップロード・開いて保存した・版を戻した）ときの、前の中身です。数はサーバーの設定で決めます
      </p>
      {!versions ? (
        <Spinner />
      ) : versions.length === 0 ? (
        <EmptyState icon={History} title="以前の版はありません" description="上書きすると、前の中身がここに残ります" />
      ) : (
        <ul className="max-h-96 divide-y divide-border overflow-y-auto">
          {versions.map((item) => (
            <li key={item.versionId} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm tabular-nums">
                  {item.modifiedAt} の版
                  <span className="ml-2 text-xs text-muted-foreground">{formatSize(item.size)}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.replacedAt} に{item.replacedBy ? ` ${item.replacedBy}さんが` : ""}上書き
                </p>
              </div>
              <IconButton label="ダウンロード" onClick={() => void download(item)}>
                <Download size={16} />
              </IconButton>
              <IconButton label="この版に戻す" onClick={() => void restore(item)}>
                <RotateCcw size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
