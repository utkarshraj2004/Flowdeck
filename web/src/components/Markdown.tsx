import MarkdownIt from 'markdown-it';
import { useMemo } from 'react';

// Raw HTML is disabled; markdown-it's link validator rejects javascript:/vbscript:/data: URLs.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
const defaultLink = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer nofollow');
  return defaultLink(tokens, idx, options, env, self);
};

export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const html = useMemo(() => md.render(source), [source]);
  return <div className={`markdown ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
