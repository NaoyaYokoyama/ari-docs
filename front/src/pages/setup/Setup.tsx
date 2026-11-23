import { LOCAL_PLACE_ID, type Place } from "@/app/places";
import OtherPlaces from "@/pages/setup/OtherPlaces";
import WorkspacePicker from "@/pages/setup/WorkspacePicker";
import type { SetupStatus } from "@/types/setup";

type Props = {
  status: SetupStatus;
  places: Place[];
};

// デスクトップアプリの起動エラーの画面（自分の PC）。作業フォルダで起動できなかった原因を出し、
// 変えられるときは作業フォルダを選び直せるようにする。共有サーバーを登録していれば、そちらに切り替えられる
export default function Setup({ status, places }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar p-6">
      <div className="w-full max-w-xl rounded-lg border border-border bg-background p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold">
          ari-docs を起動できませんでした
        </h1>

        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {status.error}
        </p>

        {status.workspace && (
          <p className="mb-4 text-sm">
            作業フォルダ:{" "}
            <span className="font-mono">{status.workspace}</span>
          </p>
        )}

        {status.canChangeWorkspace && (
          <>
            <p className="mb-3 text-sm text-foreground/80">
              別のフォルダを作業フォルダにする場合は、選んでから再起動してください。
            </p>
            <WorkspacePicker current={status.workspace} />
          </>
        )}

        {places.length > 1 && (
          <div className="mt-6 border-t border-border pt-5">
            <OtherPlaces places={places} currentId={LOCAL_PLACE_ID} hideLocal />
          </div>
        )}
      </div>
    </div>
  );
}
