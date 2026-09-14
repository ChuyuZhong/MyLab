import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeUrl } from "./core";

export function MarkdownView({ text, images = false }: { text: string; images?: boolean }) {
  return (
    <div className="markdown-view">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={images ? [] : ["img"]}
        urlTransform={(url) => safeUrl(url)}
        components={{
          img: ({node, ...props}) => <img {...props} loading="lazy" referrerPolicy="no-referrer" alt={props.alt || "文章配图"}/>,
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
