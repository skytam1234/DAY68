// FileUpload.jsx - Upload file to server.
import { useRef, useState } from 'react';
import { Paperclip, UploadCloud, X } from 'lucide-react';

export default function FileUpload({ disabled, onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [last, setLast] = useState(null);
  const [error, setError] = useState(null);

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const fdWithCid = fd;
      const res = await fetch('/api/upload', { method: 'POST', body: fdWithCid });
      if (!res.ok) {
        const t = await res.text();
        throw new Error('Upload failed: ' + t);
      }
      const data = await res.json();
      setLast(data);
      onUploaded && onUploaded(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        title="Upload file (CSV, Excel, PDF, TXT)"
        className="p-2 rounded-full bg-slate-800/60 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
      >
        {uploading ? <UploadCloud size={18} className="animate-pulse" /> : <Paperclip size={18} />}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.xlsm,.pdf,.txt,.md,.json"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {last && (
        <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] bg-slate-800 border border-slate-700 text-emerald-300 px-2 py-1 rounded shadow flex items-center gap-1">
          Đã upload: {last.name}
          <button onClick={() => setLast(null)} className="ml-1 text-slate-400 hover:text-white">
            <X size={12} />
          </button>
        </span>
      )}
      {error && (
        <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] bg-rose-900/80 text-rose-200 px-2 py-1 rounded shadow">
          {error}
        </span>
      )}
    </div>
  );
}
