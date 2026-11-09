// 貼り付ける画像を縮小する（FN0404-BR02。サーバーの容量を使いすぎないように）。
// 長い辺を 1920 画素までにし、WebP（作れない環境では JPEG）にする。元のほうが小さければ元のまま

const MAX_SIDE = 1920;
const QUALITY = 0.85;
// 縮小せずにそのまま送る形式（アニメーションを残すため）
const KEEP_AS_IS = ["image/gif"];
// 小さければそのまま送ってよい形式（サーバーが受け取る形式）
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

function toBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

export async function compressImage(file: Blob): Promise<Blob> {
  if (KEEP_AS_IS.includes(file.type)) {
    return file;
  }
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("画像を読み込めませんでした（PNG・JPEG・GIF・WebP・BMP を貼り付けられます）");
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
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
  let result = await toBlob(canvas, "image/webp");
  if (!result || result.type !== "image/webp") {
    result = await toBlob(canvas, "image/jpeg");
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
