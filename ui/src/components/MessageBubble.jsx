// MessageBubble.jsx - Renders a chat message with light markdown.
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Tiny markdown -> HTML (bold, italic, code, lists, headings, links)
function md(text) {
  if (!text) return '';
  let s = escapeHtml(text);
  // code blocks
  s = s.replace(/```([\s\S]*?)```/g, (_, code) => '<pre><code>' + code + '</code></pre>');
  // inline code
  s = s.replace(/`([^`\n]+)`/g, (_, code) => '<code>' + code + '</code>');
  // bold
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  // italic
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
  // headings
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // unordered list
  s = s.replace(/(?:^|\n)((?:- .+(?:\n|$))+)/g, (m, block) => {
    const items = block.trim().split('\n').map((l) => '<li>' + l.replace(/^- /, '') + '</li>').join('');
    return '\n<ul>' + items + '</ul>';
  });
  // links
  s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  // paragraphs (double newline)
  s = s.split(/\n{2,}/).map((p) => {
    if (/^\s*<(pre|ul|h[1-3])/.test(p)) return p;
    return '<p>' + p.replace(/\n/g, '<br/>') + '</p>';
  }).join('\n');
  return s;
}

export default function MessageBubble({ role, content, images, toolEvents, thinking, isStreaming }) {
  const isUser = role === 'user';
  return (
    <div className={'flex w-full mb-3 animate-slide-up ' + (isUser ? 'justify-end' : 'justify-start')}>
      <div className={'flex flex-col gap-2 max-w-[85%] ' + (isUser ? 'items-end' : 'items-start')}>
        {!isUser && thinking && (
          <div className="text-[11px] text-violet-300/70 italic max-w-full whitespace-pre-wrap break-words pl-1 border-l-2 border-violet-500/40 pl-2">
            {thinking}
          </div>
        )}
        {toolEvents && toolEvents.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {toolEvents.map((ev, i) => (
              <span
                key={i}
                className={
                  'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ' +
                  (ev.result?.ok
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                    : ev.result?.blocked
                      ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                      : 'bg-slate-700/40 text-slate-300 border border-slate-600/40')
                }
                title={JSON.stringify(ev.params || {}, null, 2)}
              >
                <span className="font-mono">{ev.name}</span>
                {ev.result && (ev.result.ok ? '✓' : ev.result.blocked ? '⛔' : '✗')}
              </span>
            ))}
          </div>
        )}
        {content && (
          <div
            className={
              'rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm markdown ' +
              (isUser
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : 'bg-slate-800/80 text-slate-100 rounded-bl-sm border border-slate-700/50')
            }
            dangerouslySetInnerHTML={{ __html: md(content) }}
          />
        )}
        {images && images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((img, i) => (
              <a
                key={i}
                href={img.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl overflow-hidden border border-slate-700/60 hover:border-violet-500/60 transition"
              >
                <img
                  src={img.url}
                  alt={img.prompt || 'generated'}
                  className="max-w-[320px] max-h-[320px] object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )}
        {isStreaming && !content && (
          <div className="rounded-2xl px-4 py-3 text-sm bg-slate-800/80 text-slate-400 border border-slate-700/50 rounded-bl-sm">
            <span className="inline-flex gap-1">
              <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
