// SlashCommandPopup.jsx — Autocomplete popup for `/command` slash commands.
//
// Shown above the input when the user starts typing `/`. The list is filtered
// by the part after `/` (case-insensitive). Keyboard navigation:
//   ↑ / ↓       move selection
//   Enter       confirm selection (auto-fills the input with `/<cmd> `)
//   Tab         also confirms
//   Esc         dismiss popup
//   Click       confirm selection
import { useEffect, useRef } from 'react';
import { Image as ImageIcon, Search, FileText, FilePlus2, Terminal, HelpCircle } from 'lucide-react';

export const SLASH_COMMANDS = [
  {
    cmd: '/image',
    label: 'Tạo ảnh AI',
    hint: '/image <prompt> — sinh ảnh 1024×1024 từ mô tả',
    icon: ImageIcon,
    accent: 'from-pink-500/20 to-violet-500/20 text-pink-300 border-pink-500/30',
  },
  {
    cmd: '/search',
    label: 'Tìm kiếm web',
    hint: '/search <query> — DuckDuckGo, 5 kết quả',
    icon: Search,
    accent: 'from-sky-500/20 to-cyan-500/20 text-sky-300 border-sky-500/30',
  },
  {
    cmd: '/read',
    label: 'Đọc file',
    hint: '/read <path> [max_bytes] — đọc file trong workspace',
    icon: FileText,
    accent: 'from-amber-500/20 to-orange-500/20 text-amber-300 border-amber-500/30',
  },
  {
    cmd: '/write',
    label: 'Ghi file',
    hint: '/write <path> <content> — ghi nội dung vào file',
    icon: FilePlus2,
    accent: 'from-emerald-500/20 to-teal-500/20 text-emerald-300 border-emerald-500/30',
  },
  {
    cmd: '/exec',
    label: 'Chạy lệnh shell',
    hint: '/exec <cmd> — shell an toàn trong workspace',
    icon: Terminal,
    accent: 'from-slate-500/20 to-slate-600/20 text-slate-300 border-slate-500/30',
  },
  {
    cmd: '/help',
    label: 'Trợ giúp',
    hint: '/help — hiện danh sách lệnh',
    icon: HelpCircle,
    accent: 'from-indigo-500/20 to-violet-500/20 text-indigo-300 border-indigo-500/30',
  },
];

export function filterCommands(query) {
  const q = (query || '').toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => c.cmd.toLowerCase().includes(q) || c.label.toLowerCase().includes(q));
}

export default function SlashCommandPopup({
  open,
  query,
  activeIndex,
  onHover,
  onSelect,
  onClose,
  popupRef,
}) {
  const items = filterCommands(query);
  const listRef = useRef(null);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open || items.length === 0) return null;

  return (
    <div
      ref={popupRef}
      className="absolute bottom-full left-0 right-0 mb-2 z-30"
      role="listbox"
      aria-label="Lệnh khả dụng"
    >
      <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/70 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800/80 flex items-center justify-between">
          <span>Lệnh nhanh</span>
          <span className="flex items-center gap-2 text-slate-600 normal-case">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px]">↑↓</kbd>
            <span>chọn</span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px]">Enter</kbd>
            <span>xác nhận</span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px]">Esc</kbd>
            <span>đóng</span>
          </span>
        </div>
        <ul ref={listRef} className="max-h-72 overflow-y-auto py-1">
          {items.map((item, idx) => {
            const Icon = item.icon;
            const active = idx === activeIndex;
            return (
              <li
                key={item.cmd}
                data-active={active ? 'true' : 'false'}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => { e.preventDefault(); onSelect(item); }}
                onMouseEnter={() => onHover(idx)}
                className={
                  'flex items-center gap-3 px-3 py-2 cursor-pointer transition ' +
                  (active
                    ? 'bg-slate-800/80'
                    : 'hover:bg-slate-800/40')
                }
              >
                <span
                  className={
                    'flex items-center justify-center w-8 h-8 rounded-lg border bg-gradient-to-br ' +
                    item.accent
                  }
                >
                  <Icon size={15} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-100">{item.cmd}</span>
                    <span className="text-xs text-slate-400 truncate">{item.label}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{item.hint}</div>
                </div>
                {active && (
                  <span className="text-[10px] text-violet-300 font-mono">↵</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}