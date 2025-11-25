import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import 'highlight.js/styles/atom-one-dark.css';
import 'katex/dist/katex.min.css';
import './MarkdownContent.css';

/**
 * MarkdownContent Component
 *
 * Renders markdown with full support for:
 * - GitHub Flavored Markdown (tables, strikethrough, task lists)
 * - Code block syntax highlighting (190+ languages)
 * - LaTeX/Math equation rendering
 * - Custom components for code, links, images
 */
function MarkdownContent({ content = '' }) {
  if (!content) {
    return <div className="markdown-empty">No content</div>;
  }

  return (
    <div className="markdown-container">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : 'text';

            if (inline) {
              // Inline code (backticks)
              return (
                <code className="markdown-inline-code" {...props}>
                  {children}
                </code>
              );
            }

            // Code block (```...```)
            return (
              <pre className="markdown-code-block">
                <div className="markdown-code-header">
                  <span className="markdown-code-language">{language}</span>
                </div>
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            );
          },

          img({ node, src, alt, ...props }) {
            return (
              <div className="markdown-image-wrapper">
                <img src={src} alt={alt} className="markdown-image" {...props} />
                {alt && <span className="markdown-image-caption">{alt}</span>}
              </div>
            );
          },

          a({ node, href, children, ...props }) {
            return (
              <a href={href} className="markdown-link" target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },

          table({ node, children, ...props }) {
            return (
              <div className="markdown-table-wrapper">
                <table className="markdown-table" {...props}>
                  {children}
                </table>
              </div>
            );
          },

          blockquote({ node, children, ...props }) {
            return (
              <blockquote className="markdown-blockquote" {...props}>
                {children}
              </blockquote>
            );
          },

          h1({ node, children, ...props }) {
            return <h1 className="markdown-h1" {...props}>{children}</h1>;
          },
          h2({ node, children, ...props }) {
            return <h2 className="markdown-h2" {...props}>{children}</h2>;
          },
          h3({ node, children, ...props }) {
            return <h3 className="markdown-h3" {...props}>{children}</h3>;
          },

          ul({ node, children, ...props }) {
            return <ul className="markdown-ul" {...props}>{children}</ul>;
          },

          ol({ node, children, ...props }) {
            return <ol className="markdown-ol" {...props}>{children}</ol>;
          },

          li({ node, children, ...props }) {
            return <li className="markdown-li" {...props}>{children}</li>;
          },

          p({ node, children, ...props }) {
            return <p className="markdown-p" {...props}>{children}</p>;
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownContent;
