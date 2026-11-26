// 閉じると途中で切れる作業（アップロード・サーバーへの保存・アプリの更新のダウンロード）。
// ウィンドウを閉じるときは、これがあるときだけ確かめる（何も無ければ確かめずに閉じる）
const tasks = new Map<number, string>();
let nextId = 1;

// 作業を始める。終わったら戻り値を呼ぶ
export function beginTask(label: string): () => void {
  const id = nextId++;
  tasks.set(id, label);
  return () => {
    tasks.delete(id);
  };
}

// 途中の作業（同じものは 1 つにまとめる）
export function runningTasks(): string[] {
  return [...new Set(tasks.values())];
}
