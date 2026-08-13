import { useEffect } from 'react';

export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const isError = toast.type === 'error';

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-in-up transition-all duration-300">
      <div
        className={`flex items-center gap-3.5 px-5 py-3.5 rounded-2xl shadow-2xl border text-white max-w-md text-left ${
          isError
            ? 'bg-red-600 border-red-500 shadow-red-900/30'
            : 'bg-emerald-600 border-emerald-500 shadow-emerald-900/30'
        }`}
      >
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 text-base font-bold">
          {isError ? '❌' : '✅'}
        </div>

        <div className="grow">
          <p className="text-xs font-bold uppercase tracking-wider opacity-90">
            {isError ? 'Action Failed' : 'Success Notification'}
          </p>
          <p className="text-xs font-semibold mt-0.5 leading-snug">
            {toast.message}
          </p>
        </div>

        <button
          onClick={onClose}
          className="text-white/70 hover:text-white text-base font-bold cursor-pointer shrink-0 px-1 py-0.5 hover:bg-white/10 rounded transition"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
