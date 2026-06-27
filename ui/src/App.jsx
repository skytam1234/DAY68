// App.jsx - Main chat UI.
import { useEffect, useRef, useState, useCallback } from 'react';
import { Send, Trash2, Sparkles, Wifi, WifiOff, Bot, User } from 'lucide-react';
import { useAgentSocket } from './hooks/useAgentSocket';
import { useSpeechToText } from './hooks/useSpeechToText';
import ThinkingBubble from './components/ThinkingBubble';
import MessageBubble from './components/MessageBubble';
import MicrophoneButton from './components/MicrophoneButton';
import FileUpload from './components/FileUpload';

const SYSTEM_HINT = `Xin chào! Tôi là AI Agent với các khả năng:

- 🔎 **Tìm kiếm web** — hỏi tin tức, sự kiện thời sự, thông tin mới.
- 🎨 **Tạo ảnh AI** — yêu cầu vẽ tranh, minh họa.
- 📊 **Phân tích file** — upload Excel/CSV/PDF để tôi phân tích.
- 📁 **Đọc/Ghi file** — trong thư mục dự án.
- 💻 **Chạy lệnh shell** — các lệnh an toàn.
- 🎤 **Ra lệnh bằng giọng nói** — bấm micro để nói.

Bạn muốn tôi giúp gì?`;

export default function App() {
  const {
    clientId,
    connected,
    streaming,
    transcript,
    setTranscript,
    currentThinking,
    currentContent,
    toolEvents,
    images,
    error,
    turn,
    sendChat,
    uploadFile,
  } = useAgentSocket();

  const speech = useSpeechToText({ lang: 'vi-VN' });
  const [messages, setMessages] = useState([
    { role: 'assistant', content: SYSTEM_HINT, id: 'welcome' },
  ]);
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const [pendingAttachment, setPendingAttachment] = useState(null);

  // Auto-append speech transcript to input while listening
  useEffect(() => {
    if (speech.listening) setInput(speech.transcript);
  }, [speech.transcript, speech.listening]);

  // When agent finishes (stream ends), append final answer to messages list
  useEffect(() => {
    if (!streaming && transcript) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: transcript,
          thinking: currentThinking,
          tools: toolEvents,
          images,
          id: 'a-' + Date.now(),
        },
      ]);
      setTranscript('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, currentContent, currentThinking, toolEvents.length, images.length]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    speech.reset();

    const userMsg = { role: 'user', content: text, id: 'u-' + Date.now() };
    if (pendingAttachment) {
      userMsg.content += '\n\n[File đính kèm: ' + pendingAttachment.path + ']';
      setPendingAttachment(null);
    }
    setMessages((prev) => [...prev, userMsg]);

    // Build history for LLM (only role + content of past messages)
    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
    try {
      await sendChat(history);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Lỗi: ' + e.message, id: 'e-' + Date.now() },
      ]);
    }
  }, [input, streaming, messages, pendingAttachment, sendChat, speech]);

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: SYSTEM_HINT, id: 'welcome' }]);
    setInput('');
    speech.reset();
  };

  const handleUploaded = (data) => {
    setPendingAttachment(data);
  };

  return (
    <div className="h-full w-full flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <div className="font-semibold text-slate-100">AI Agent</div>
            <div className="text-[11px] text-slate-400 flex items-center gap-2">
              {connected ? (
                <span className="flex items-center gap-1 text-emerald-400">
                  <Wifi size={11} /> Đã kết nối
                </span>
              ) : (
                <span className="flex items-center gap-1 text-rose-400">
                  <WifiOff size={11} /> Mất kết nối
                </span>
              )}
              <span>·</span>
              <span className="font-mono text-slate-500">{clientId ? clientId.slice(0, 6) : '…'}</span>
            </div>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="text-slate-400 hover:text-rose-300 p-2 rounded-lg hover:bg-slate-800/60"
          title="Xóa cuộc trò chuyện"
        >
          <Trash2 size={16} />
        </button>
      </header>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        <div className="max-w-3xl mx-auto">
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              role={m.role}
              content={m.content}
              images={m.images}
              toolEvents={m.tools}
              thinking={m.thinking}
              isStreaming={false}
            />
          ))}

          {/* Active streaming: thinking + content + tools + images */}
          {streaming && (
            <>
              {currentThinking && (
                <ThinkingBubble thinking={currentThinking} active={true} turn={turn} />
              )}
              {toolEvents.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2 ml-6">
                  {toolEvents.map((ev, i) => (
                    <span
                      key={i}
                      className={
                        'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ' +
                        (ev.result?.ok
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                          : ev.result?.blocked
                            ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                            : 'bg-slate-700/40 text-slate-300 border border-slate-600/40 animate-pulse')
                      }
                    >
                      <span className="font-mono">{ev.name}</span>
                      {ev.result && (ev.result.ok ? '✓' : ev.result.blocked ? '⛔' : '✗')}
                    </span>
                  ))}
                </div>
              )}
              {(currentContent || (!currentThinking && toolEvents.length === 0)) && (
                <MessageBubble
                  role="assistant"
                  content={currentContent}
                  images={images}
                  toolEvents={toolEvents}
                  thinking=""
                  isStreaming={!currentContent}
                />
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <div className="mx-auto max-w-2xl mt-2 p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Footer / Input */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {pendingAttachment && (
            <div className="mb-2 inline-flex items-center gap-2 text-xs px-2 py-1 rounded-md bg-slate-800 border border-slate-700 text-emerald-300">
              📎 {pendingAttachment.name}
              <button onClick={() => setPendingAttachment(null)} className="text-slate-400 hover:text-white">
                ×
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <FileUpload disabled={streaming} onUploaded={handleUploaded} />
            <MicrophoneButton
              supported={speech.supported}
              listening={speech.listening}
              onStart={speech.start}
              onStop={speech.stop}
            />
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={
                streaming
                  ? 'Agent đang trả lời…'
                  : speech.listening
                    ? 'Đang nghe bạn nói…'
                    : 'Hỏi gì đó, hoặc /help để xem lệnh…'
              }
              rows={1}
              className="flex-1 resize-none bg-slate-800/60 border border-slate-700/60 rounded-2xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500/60 max-h-40"
              style={{ minHeight: '42px' }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || streaming}
              className="p-2.5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-xl transition"
              title="Gửi"
            >
              <Send size={18} />
            </button>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-3">
            <span className="flex items-center gap-1"><Bot size={11} /> Agent</span>
            <span>·</span>
            <span>/clear xóa chat</span>
            <span>·</span>
            <span>/help trợ giúp</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
