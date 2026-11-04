// Copy button content: copy icon, swapped for a tick while `copied` is true
export default function CopyButtonContent({ copied }) {
  return copied ? (
    <>
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" />
      </svg>
      <span>Copied</span>
    </>
  ) : (
    <>
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="12" height="12" rx="2" />
        <path d="M5 15V5a2 2 0 012-2h10" />
      </svg>
      <span>Copy</span>
    </>
  );
}
