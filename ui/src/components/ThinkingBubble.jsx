// ThinkingBubble.jsx - Cursor-style thinking display.
// Streams thinking chunks with typing animation. When new turn starts, previous
// bubbles fade out and are pushed to history list at the top.
import { useEffect, useRef, useState } from 'react';

export default function ThinkingBubble({ thinking, active, turn }) {
  const [displayed, setDisplayed] = useState('');
  const targetRef = useRef('');
  const queueRef = useRef([]);
  const rafRef = useRef(null);
  const lastCaretRef = useRef(0);
  const [caretVisible, setCaretVisible] = useState(true);

  // When active changes (new turn starts), reset
  useEffect(() => {
    if (!active) {
      // fade out animation handled by parent
      return;
    }
    setDisplayed('');
    targetRef.current = '';
    queueRef.current = [];
  }, [active, turn]);

  // Append incoming thinking chunks to the queue
  useEffect(() => {
    if (!active || !thinking) return;
    targetRef.current += thinking;
    // chunk into chars for smooth typing
    for (const ch of thinking) queueRef.current.push(ch);
    if (!rafRef.current) pump();
  }, [thinking, active]);

  function pump() {
    rafRef.current = requestAnimationFrame(pump);
    // Drain a few characters per frame for natural feel
    const charsPerFrame = active ? 2 : 4;
    let added = '';
    for (let i = 0; i < charsPerFrame && queueRef.current.length; i++) {
      added += queueRef.current.shift();
    }
    if (added) setDisplayed((d) => d + added);
    lastCaretRef.current = Date.now();
  }

  // Caret blink
  useEffect(() => {
    const id = setInterval(() => setCaretVisible((v) => !v), 530);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!active && !displayed) return null;

  return (
    <div
      className={
        'mb-2 transition-all duration-300 ' +
        (active ? 'opacity-100 translate-y-0' : 'opacity-30 -translate-y-1')
      }
    >
      <div className="flex items-start gap-2 text-xs text-slate-400">
        <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
        <div className="flex-1">
          <div className="text-violet-300/80 font-medium mb-0.5">
            {active ? `Đang suy nghĩ (lượt ${turn || '…'})…` : `Suy nghĩ lượt ${turn || 'trước'}`}
          </div>
          <div className="whitespace-pre-wrap break-words text-slate-500 italic leading-relaxed">
            {displayed}
            {active && caretVisible && (
              <span className="inline-block w-[2px] h-[1em] align-text-bottom bg-slate-500 ml-0.5" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
