// MicrophoneButton.jsx - Speech-to-text trigger button.
import { Mic, MicOff } from 'lucide-react';

export default function MicrophoneButton({ supported, listening, onStart, onStop }) {
  if (!supported) {
    return (
      <button
        type="button"
        disabled
        title="Trình duyệt không hỗ trợ Web Speech API"
        className="p-2 rounded-full bg-slate-800/60 text-slate-500 cursor-not-allowed"
      >
        <MicOff size={18} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={listening ? onStop : onStart}
      title={listening ? 'Dừng ghi âm' : 'Bắt đầu nói'}
      className={
        'relative p-2 rounded-full transition-all ' +
        (listening
          ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/40 animate-pulse'
          : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700')
      }
    >
      <Mic size={18} />
      {listening && (
        <span className="absolute inset-0 rounded-full ring-2 ring-rose-400/60 animate-ping" />
      )}
    </button>
  );
}
