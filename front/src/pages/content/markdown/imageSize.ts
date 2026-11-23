// 本文の画像の大きさを変える（FN0404-BR07）。`![名前](src)` の名前の後ろの `|幅` を書き換える。
// 同じ画像（src）がいくつあれば、すべて同じ幅にする。width が null なら幅の指定を消す（元の大きさ）

// 右クリックで選べる大きさ（画素）
export const IMAGE_SIZES = [
  { label: "小", width: 300 },
  { label: "中", width: 600 },
  { label: "大", width: 900 },
] as const;

const IMAGE = /!\[([^\]\n]*)\]\(([^)\s]+)((?:\s+"[^"\n]*")?)\)/g;

export function resizeImage(content: string, src: string, width: number | null): string {
  return content.replace(IMAGE, (whole, alt: string, url: string, title: string) => {
    if (url !== src) {
      return whole;
    }
    const name = alt.replace(/\s*\|\s*\d{1,4}$/, "");
    return `![${width ? `${name}|${width}` : name}](${url}${title})`;
  });
}
