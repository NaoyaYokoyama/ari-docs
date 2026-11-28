// 貼り付ける画像を縮小する（FN0404-BR02。サーバーの容量を使いすぎないように）。
// 長い辺を上限までにし、WebP（作れない環境では JPEG）にする。元のほうが小さければ元のまま。
// 画質・上限・縮めるかは、管理者がサーバーの設定で決める（FN0902-BR09。/api/me で受け取る）

export type CompressOptions = {
  // 縮める（オフなら、受け取れる形式はそのまま送る）
  compress: boolean;
  // 画質（10〜100 %）
  quality: number;
  // 長い辺の上限（画素）
  maxSide: number;
};

export const DEFAULT_COMPRESS: CompressOptions = { compress: true, quality: 85, maxSide: 1920 };
// 縮小せずにそのまま送る形式（アニメーションを残すため）
const KEEP_AS_IS = ["image/gif"];
// 小さければそのまま送ってよい形式（サーバーが受け取る形式）
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImage(file: Blob, options: CompressOptions = DEFAULT_COMPRESS): Promise<Blob> {
  if (KEEP_AS_IS.includes(file.type) || (!options.compress && ACCEPTED.includes(file.type))) {
    return file;
  }
  const quality = Math.min(Math.max(options.quality, 10), 100) / 100;
  // 縮めない設定でも、サーバーが受け取れない形式（BMP など）は形を変える（大きさはそのまま）
  const maxSide = options.compress ? options.maxSide : Number.POSITIVE_INFINITY;
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("画像を読み込めませんでした（PNG・JPEG・GIF・WebP・BMP を貼り付けられます）");
  });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  // JPEG は透明を持てないので、白い背景に描く
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  // WebP を作れない環境（Safari 系など）は PNG が返るので、JPEG にする
  let result = await toBlob(canvas, "image/webp", quality);
  if (!result || result.type !== "image/webp") {
    result = await toBlob(canvas, "image/jpeg", quality);
  }
  if (!result) {
    return file;
  }
  // 縮小していなくて元のほうが小さいなら元のまま（小さな PNG の図など）
  if (scale === 1 && ACCEPTED.includes(file.type) && file.size <= result.size) {
    return file;
  }
  return result;
}
