import { getBlob, postBinary } from "@/api/client";

// Note・Wiki の本文に貼り付けた画像（FN0404。API0413・API0414）

export const CONTENT_IMAGE_PREFIX = "/api/content-image/";

export type UploadedImage = { imageId: string; url: string };

export function uploadContentImage(kind: "note" | "wiki", image: Blob) {
  return postBinary<UploadedImage>(`${CONTENT_IMAGE_PREFIX}upload?kind=${kind}`, image);
}

// 画像はログインが要るので <img src> では読めない（トークンをヘッダーで送るため）。読み込んで画面の中の URL にする。
// 同じ画像は作り直さないので、一度読んだものは覚えておく（打つたびにプレビューを描き直しても読み直さないように）
const loaded = new Map<string, Promise<string>>();

export function contentImageUrl(src: string) {
  let url = loaded.get(src);
  if (!url) {
    url = getBlob(src).then((blob) => URL.createObjectURL(blob));
    // 失敗したものは覚えない（次に描くときに読み直す）
    url.catch(() => loaded.delete(src));
    loaded.set(src, url);
  }
  return url;
}
