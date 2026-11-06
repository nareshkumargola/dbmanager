// Page buttons for a connection list. Its styles are the .cx-row-pager rules in Connections.css.
export default function ConnectionPager({ page, pageCount, firstIndex, shownCount, total, onPageChange }) {
  return (
    <div className="cx-row-pager">
      <span>Showing {firstIndex + 1} to {firstIndex + shownCount} of {total} connections</span>
      <nav aria-label="Connection pages">
        <button type="button" disabled={page === 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </button>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
          <button
            key={number}
            type="button"
            className={number === page ? 'is-active' : ''}
            aria-current={number === page ? 'page' : undefined}
            onClick={() => onPageChange(number)}
          >
            {number}
          </button>
        ))}
        <button type="button" disabled={page === pageCount} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </nav>
    </div>
  );
}
