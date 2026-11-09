import MDEditor from "@uiw/react-md-editor";
import { type ComponentProps, useEffect, useState } from "react";
import remarkBreaks from "remark-breaks";

import { CONTENT_IMAGE_PREFIX, contentImageUrl } from "@/api/contentImage";
import { useOpenAriLink } from "@/app/useAriLink";
import { ARI_LINK_PREFIX, parseAriLink } from "@/lib/ariLink";

// Note・Wiki の本文の表示。貼り付けた画像（/api/content-image/…）はログインして読み込む（FN0404）

type ImgProps = ComponentProps<"img"> & { node?: unknown };

function ContentImage({ src, alt, ...props }: ImgProps) {
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
  return <img {...rest} src={url} alt={alt} loading="lazy" />;
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
  components: { img: ContentImage, a: ContentLink },
  urlTransform,
};

export default function ContentMarkdown({ source }: { source: string }) {
  return <MDEditor.Markdown source={source} {...contentMarkdownOptions} />;
}
