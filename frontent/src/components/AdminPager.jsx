const Arrow = ({ d }) => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

// Footer for admin tables: "Showing x–y of z", rows-per-page and First / Prev / numbers / Next / Last
export default function AdminPager({ page, pageSize, total, noun, onPageChange, onPageSizeChange, pageSizes = [10, 20, 50, 100] }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = [];
  for (let p = start; p <= Math.min(totalPages, start + 4); p += 1) pages.push(p);

  return (
    <div className="ap-footer">
      <span>
        Showing <b>{total === 0 ? 0 : ((page - 1) * pageSize + 1).toLocaleString()}</b>–<b>{Math.min(page * pageSize, total).toLocaleString()}</b> of <b>{total.toLocaleString()}</b> {noun}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        {onPageSizeChange && (
          <label className="ap-field-inline">
            Per page
            <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="ap-select !h-8 !w-auto">
              {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        )}
        <div className="ap-pager">
          <button type="button" onClick={() => onPageChange(1)} disabled={page <= 1} aria-label="First page" title="First page"><Arrow d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></button>
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page" title="Previous page"><Arrow d="M15 18l-6-6 6-6" /></button>
          {pages.map((p) => (
            <button key={p} type="button" onClick={() => onPageChange(p)} className={p === page ? 'is-active' : ''} aria-current={p === page ? 'page' : undefined}>{p}</button>
          ))}
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Next page" title="Next page"><Arrow d="M9 18l6-6-6-6" /></button>
          <button type="button" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} aria-label="Last page" title="Last page"><Arrow d="M13 17l5-5-5-5M6 17l5-5-5-5" /></button>
        </div>
      </div>
    </div>
  );
}
