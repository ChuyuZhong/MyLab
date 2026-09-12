import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeUrl } from "./core";

export function MarkdownView({ text }: { text: string }) {
  return (
    <div className="markdown-view">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={["img"]}
        urlTransform={(url) => safeUrl(url)}
        components={{
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
