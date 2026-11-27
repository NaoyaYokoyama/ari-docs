import MDEditor from "@uiw/react-md-editor";
import { Check, ImageIcon } from "lucide-react";
import { type ComponentProps, createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import remarkBreaks from "remark-breaks";

import { CONTENT_IMAGE_PREFIX, contentImageUrl } from "@/api/contentImage";
import { useOpenAriLink } from "@/app/useAriLink";
import ContextMenu from "@/components/common/ContextMenu";
import { MermaidPre } from "@/components/common/Mermaid";
import { ARI_LINK_PREFIX, parseAriLink } from "@/lib/ariLink";
import { safeRehypePlugins } from "@/lib/safeMarkdown";
import { IMAGE_SIZES } from "@/pages/content/markdown/imageSize";

// Note・Wiki の本文の表示。貼り付けた画像（/api/content-image/…）はログインして読み込む（FN0404）

type ImgProps = ComponentProps<"img"> & { node?: unknown };

// 編集している画面で、画像の右クリックから大きさを変える（FN0404-BR07）。src の画像を width 画素にする（null は元の大きさ）。
// 履歴など、読むだけの画面では渡さない
export const ImageResizeContext = createContext<((src: string, width: number | null) => void) | null>(null);

// 画像の幅の指定（FN0404-BR07）。`![名前|300](…)` は幅 300 画素（画面より広ければ画面の幅まで）
function parseImageAlt(alt: string | undefined): { alt: string; width?: number } {
  const match = alt?.match(/^(.*?)\s*\|\s*(\d{1,4})$/);
  if (!match) {
    return { alt: alt ?? "" };
  }
  const width = Number(match[2]);
  return width > 0 ? { alt: match[1], width } : { alt: match[1] };
}

function ContentImage({ src, alt: rawAlt, ...props }: ImgProps) {
  const { alt, width } = parseImageAlt(rawAlt);
  const resize = useContext(ImageResizeContext);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // react-markdown が渡す node は img に付けない
  const rest = { ...props };
  delete rest.node;
  const own = typeof src === "string" && src.startsWith(CONTENT_IMAGE_PREFIX);
  const [url, setUrl] = useState<string | undefined>(own ? undefined : src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!own) {
      setUrl(src);
      return;
    }
    let alive = true;
    setFailed(false);
    contentImageUrl(src)
      .then((loaded) => alive && setUrl(loaded))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [src, own]);

  if (failed) {
    return <span className="text-xs text-muted-foreground">［画像を表示できません{alt ? `: ${alt}` : ""}］</span>;
  }
  if (!url) {
    // 読み込むまでは場所だけ取る
    return <span className="inline-block h-24 w-40 animate-pulse rounded bg-muted align-middle" aria-label={alt} />;
  }
  const image = (
    <img
      {...rest}
      src={url}
      alt={alt}
      loading="lazy"
      style={width ? { ...rest.style, width: `${width}px`, maxWidth: "100%" } : rest.style}
      onContextMenu={
        resize && typeof src === "string"
          ? (event) => {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY });
            }
          : undefined
      }
    />
  );
  if (!resize || typeof src !== "string") {
    return image;
  }
  return (
    <>
      {image}
      {/* 本文の段落の中に div を置かないよう、メニューは body に出す */}
      {createPortal(
        <ContextMenu
          position={menu}
          onClose={() => setMenu(null)}
          items={[
            ...IMAGE_SIZES.map((size) => ({
              label: `${size.label}（幅 ${size.width} 画素）`,
              icon: width === size.width ? Check : ImageIcon,
              onSelect: () => resize(src, size.width),
            })),
            { label: "元の大きさ（画面の幅まで）", icon: width ? ImageIcon : Check, onSelect: () => resize(src, null) },
          ]}
        />,
        document.body,
      )}
    </>
  );
}

type AnchorProps = ComponentProps<"a"> & { node?: unknown };

// ari-docs の中のリンク（ari://…。FN0004）は、押すとこのアプリの中でそこへ移る。ほかのリンクはそのまま
function ContentLink({ href, children, ...props }: AnchorProps) {
  const openAriLink = useOpenAriLink();
  const rest = { ...props };
  delete rest.node;
  const link = typeof href === "string" ? parseAriLink(href) : null;
  if (!link) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <a
      {...rest}
      href={href}
      title="ari-docs の中で開く"
      onClick={(event) => {
        event.preventDefault();
        openAriLink(link);
      }}
    >
      {children}
    </a>
  );
}

const SAFE_PROTOCOL = /^(https?|ircs?|mailto|xmpp)$/i;

// 表示してよい URL（react-markdown の既定と同じ考え方に、ari:// を足す。javascript: などは消す）
function urlTransform(value: string) {
  if (value.toLowerCase().startsWith(ARI_LINK_PREFIX)) {
    return value;
  }
  const colon = value.indexOf(":");
  const firstOther = Math.min(
    ...["/", "?", "#"].map((char) => value.indexOf(char)).filter((index) => index !== -1),
  );
  return colon === -1 || colon > firstOther || SAFE_PROTOCOL.test(value.slice(0, colon)) ? value : "";
}

export const contentMarkdownOptions = {
  remarkPlugins: [remarkBreaks],
  // 本文に書いた HTML は安全なものだけにする（ほかの人が書いた Wiki を開いただけでプログラムが動かないように）
  rehypePlugins: [...safeRehypePlugins],
  components: { img: ContentImage, a: ContentLink, pre: MermaidPre },
  urlTransform,
};

export default function ContentMarkdown({ source }: { source: string }) {
  return <MDEditor.Markdown source={source} {...contentMarkdownOptions} />;
}
