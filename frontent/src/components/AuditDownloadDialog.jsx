import { useEffect, useId, useRef, useState } from 'react';
import API from '../api/axios';
import { toLocalDateInput } from '../utils/adminHelpers';
import { AUDIT_CATEGORIES, SENSITIVE_AUDIT_ACTIONS } from '../utils/auditCategories';
import {
  categoryBreakdown,
  downloadAuditCsv,
  downloadAuditPdf,
  formatReportMoment as formatMoment,
  reportSlug as slug,
} from '../utils/auditReport';

// A download holds at most this many records, newest first (the server allows the same)
const MAX_ROWS = 10000;

const RANGE_PRESETS = [
  { id: '1h', label: 'Last hour' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'all', label: 'All time' },
];

const pad = (n) => String(n).padStart(2, '0');
const toTimeInput = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const startOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

// Date and time boxes for a preset. "To" is now, or the end of yesterday.
const daysBack = (date, days) => {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() - days);
  return copy;
};
const rangeFor = (presetId) => {
  const now = new Date();
  const ranges = {
    '1h': () => [new Date(now.getTime() - 60 * 60 * 1000), now],
    today: () => [startOfDay(now), now],
    yesterday: () => [daysBack(now, 1), new Date(startOfDay(now).getTime() - 60 * 1000)],
    '7d': () => [daysBack(now, 6), now],
    '30d': () => [daysBack(now, 29), now],
  };
  if (!ranges[presetId]) return { fromDate: '', fromTime: '', toDate: '', toTime: '' };
  const [from, to] = ranges[presetId]();
  return { fromDate: toLocalDateInput(from), fromTime: toTimeInput(from), toDate: toLocalDateInput(to), toTime: toTimeInput(to) };
};

// A date with no time means the whole day: From starts at 00:00 and To runs to 23:59:59
const fromMomentOf = (date, time) => (date ? new Date(`${date}T${time || '00:00'}:00.000`) : null);
const toMomentOf = (date, time) => (date ? new Date(`${date}T${time || '23:59'}:59.999`) : null);


const initialForm = ({ userId = '', connectionId = '', activity = '', preset, startDate = '', endDate = '' }) => {
  if (preset && RANGE_PRESETS.some((item) => item.id === preset)) {
    return { userId, connectionId, activity, preset, ...rangeFor(preset) };
  }
  return { userId, connectionId, activity, preset: 'custom', fromDate: startDate, fromTime: '', toDate: endDate, toTime: '' };
};

/**
 * Download box for the Audit Logs page: pick a person, a connection, an activity type and a
 * time window down to the minute, see how many records match, then download a PDF or CSV.
 */
export default function AuditDownloadDialog({ users, connections, initial, otherFilters = [], onClose, onDownloaded }) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  const [form, setForm] = useState(() => initialForm(initial || {}));
  const [format, setFormat] = useState('pdf');
  const [countState, setCountState] = useState({ key: null, count: null, error: '' });
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const update = (changes) => {
    setDownloadError('');
    setForm((current) => ({ ...current, ...changes }));
  };
  const updateTime = (changes) => update({ ...changes, preset: 'custom' });
  const choosePreset = (presetId) => update({ preset: presetId, ...rangeFor(presetId) });

  const fromMoment = fromMomentOf(form.fromDate, form.fromTime);
  const toMoment = toMomentOf(form.toDate, form.toTime);
  const rangeError = fromMoment && toMoment && fromMoment > toMoment ? 'From must be earlier than To.' : '';

  const activityActions = form.activity === 'sensitive'
    ? [...SENSITIVE_AUDIT_ACTIONS]
    : AUDIT_CATEGORIES.find((category) => category.id === form.activity)?.actions;
  const params = Object.fromEntries(Object.entries({
    userId: form.userId,
    connectionId: form.connectionId,
    actions: activityActions?.join(','),
    from: fromMoment?.toISOString(),
    to: toMoment?.toISOString(),
  }).filter(([, value]) => value));
  const paramsKey = JSON.stringify(params);

  // Count the matching records while the filters change
  useEffect(() => {
    if (rangeError) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      API.get('/audit-logs', { params: { ...JSON.parse(paramsKey), countOnly: 1 } })
        .then((res) => {
          if (!cancelled) setCountState({ key: paramsKey, count: res.data.count ?? 0, error: '' });
        })
        .catch((err) => {
          if (!cancelled) setCountState({ key: paramsKey, count: null, error: err.response?.data?.message || 'Could not count the records.' });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [paramsKey, rangeError]);
  const counting = !rangeError && countState.key !== paramsKey;
  const count = counting || rangeError ? null : countState.count;

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  // Escape closes the box, and Tab stays inside it
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!downloading) onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialogRef.current.querySelectorAll('button, select, input, [href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.disabled && element.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const person = users.find((user) => user._id === form.userId);
  const connection = connections.find((item) => item._id === form.connectionId);
  const personLabel = person ? `${person.name} (${person.email})` : 'All people';
  const connectionLabel = form.connectionId === 'global'
    ? 'Global system logs'
    : connection ? `${connection.name} (${String(connection.type).toUpperCase()})` : 'All connections';
  const activityLabel = form.activity === 'sensitive'
    ? 'Sensitive actions only'
    : AUDIT_CATEGORIES.find((category) => category.id === form.activity)?.label || 'All activity';
  const periodLabel = fromMoment && toMoment
    ? `${formatMoment(fromMoment)} to ${formatMoment(toMoment)}`
    : fromMoment ? `From ${formatMoment(fromMoment)}` : toMoment ? `Up to ${formatMoment(toMoment)}` : 'All time';

  const fileName = () => {
    const range = form.fromDate && form.toDate
      ? (form.fromDate === form.toDate ? form.fromDate : `${form.fromDate}_to_${form.toDate}`)
      : form.fromDate ? `from_${form.fromDate}` : form.toDate ? `to_${form.toDate}` : 'all-time';
    const who = person ? slug(person.name) : '';
    const where = form.connectionId === 'global' ? 'system' : connection ? slug(connection.name) : '';
    return `${['audit-report', who, where, range].filter(Boolean).join('_')}.${format}`;
  };

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      const res = await API.get('/audit-logs', { params: { ...params, limit: MAX_ROWS } });
      const logs = res.data.logs || [];
      if (logs.length === 0) {
        setDownloadError('Nothing matches these filters any more.');
        setDownloading(false);
        return;
      }
      const recordsLabel = count > logs.length
        ? `${logs.length.toLocaleString()} (newest of ${count.toLocaleString()})`
        : logs.length.toLocaleString();
      if (format === 'pdf') {
        await downloadAuditPdf({
          fileName: fileName(),
          logs,
          title: 'Audit Report',
          summary: [
            ['Person', personLabel],
            ['Connection', connectionLabel],
            ['Activity', activityLabel],
            ['Period', periodLabel],
            ['Records', recordsLabel],
            ['Generated', formatMoment(new Date())],
          ],
          // With every activity in the file, also show how it splits by category
          breakdown: form.activity ? undefined : categoryBreakdown(logs),
        });
      } else {
        downloadAuditCsv(fileName(), logs);
      }
      onDownloaded(`Exported ${logs.length.toLocaleString()} records as ${format === 'pdf' ? 'PDF' : 'CSV'}`);
    } catch (err) {
      console.error('Audit export failed:', err);
      setDownloadError(err.response?.data?.message || 'The export failed. Please try again.');
      setDownloading(false);
    }
  };

  const canDownload = !downloading && !rangeError && count !== null && count > 0;
  let status;
  if (rangeError) status = <span className="ap-dl-status is-bad">{rangeError}</span>;
  else if (countState.error && !counting) status = <span className="ap-dl-status is-bad">{countState.error}</span>;
  else if (counting) status = <span className="ap-dl-status">Counting records...</span>;
  else if (count === 0) status = <span className="ap-dl-status is-bad">No records match. Try a wider time or fewer filters.</span>;
  else {
    status = (
      <span className="ap-dl-status is-ok">
        <b>{count.toLocaleString()}</b> {count === 1 ? 'record matches' : 'records match'}
        {count > MAX_ROWS && `. The file will have the newest ${MAX_ROWS.toLocaleString()}.`}
      </span>
    );
  }

  return (
    <div className="ap-modal-back" onMouseDown={(event) => { if (event.target === event.currentTarget && !downloading) onClose(); }}>
      <div
        ref={dialogRef}
        className="ap-modal ap-dl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onKeyDown={handleKeyDown}
      >
        <div className="ap-dl-head">
          <span className="ap-stat-icon">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
          </span>
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="ap-dl-title">Export audit report</h3>
            <p id={descId} className="ap-sub">Pick the person, connection and time. The file has exactly the records that match.</p>
          </div>
          <button type="button" className="ap-icon-btn" onClick={onClose} disabled={downloading} aria-label="Close">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="ap-dl-grid">
          <div>
            <label className="ap-label" htmlFor="ap-dl-user">Person</label>
            <select ref={firstFieldRef} id="ap-dl-user" className="ap-select" value={form.userId} onChange={(e) => update({ userId: e.target.value })}>
              <option value="">All people ({users.length})</option>
              {users.map((user) => <option key={user._id} value={user._id}>{user.name} ({user.role || 'user'})</option>)}
            </select>
          </div>
          <div>
            <label className="ap-label" htmlFor="ap-dl-conn">Connection</label>
            <select id="ap-dl-conn" className="ap-select" value={form.connectionId} onChange={(e) => update({ connectionId: e.target.value })}>
              <option value="">All connections ({connections.length})</option>
              <option value="global">Global system logs</option>
              {connections.map((item) => <option key={item._id} value={item._id}>{item.name} ({String(item.type).toUpperCase()})</option>)}
            </select>
          </div>
          <div className="ap-dl-wide">
            <label className="ap-label" htmlFor="ap-dl-activity">Activity</label>
            <select id="ap-dl-activity" className="ap-select" value={form.activity} onChange={(e) => update({ activity: e.target.value })}>
              <option value="">All activity</option>
              {AUDIT_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
              <option value="sensitive">Sensitive actions only</option>
            </select>
          </div>
        </div>

        <fieldset className="ap-dl-time">
          <legend className="ap-label">Time</legend>
          <div className="ap-dl-chips">
            {RANGE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`ap-chip ${form.preset === preset.id ? 'is-active' : ''}`}
                aria-pressed={form.preset === preset.id}
                onClick={() => choosePreset(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="ap-dl-range">
            <div>
              <span className="ap-label" id="ap-dl-from-label">From</span>
              <div className="ap-dl-when" role="group" aria-labelledby="ap-dl-from-label">
                <input type="date" className="ap-input" aria-label="From date" value={form.fromDate} max={form.toDate || undefined} onChange={(e) => updateTime({ fromDate: e.target.value, ...(e.target.value ? {} : { fromTime: '' }) })} />
                <input type="time" className="ap-input" aria-label="From time" value={form.fromTime} disabled={!form.fromDate} onChange={(e) => updateTime({ fromTime: e.target.value })} />
              </div>
            </div>
            <div>
              <span className="ap-label" id="ap-dl-to-label">To</span>
              <div className="ap-dl-when" role="group" aria-labelledby="ap-dl-to-label">
                <input type="date" className="ap-input" aria-label="To date" value={form.toDate} min={form.fromDate || undefined} onChange={(e) => updateTime({ toDate: e.target.value, ...(e.target.value ? {} : { toTime: '' }) })} />
                <input type="time" className="ap-input" aria-label="To time" value={form.toTime} disabled={!form.toDate} onChange={(e) => updateTime({ toTime: e.target.value })} />
              </div>
            </div>
          </div>
          <p className="ap-dl-hint">Leave the time empty for the whole day. Leave a date empty for no limit on that side.</p>
        </fieldset>

        <div className="ap-dl-format">
          <span className="ap-label" id="ap-dl-format-label">Format</span>
          <div className="ap-seg" role="radiogroup" aria-labelledby="ap-dl-format-label">
            {[{ id: 'pdf', label: 'PDF report' }, { id: 'csv', label: 'CSV (Excel)' }].map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={format === option.id}
                className={format === option.id ? 'is-active' : ''}
                onClick={() => setFormat(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ap-dl-foot" aria-live="polite">
          {status}
          {otherFilters.length > 0 && (
            <span className="ap-dl-note">Not used here: {otherFilters.join(', ')} from the page.</span>
          )}
          {downloadError && <span className="ap-dl-status is-bad">{downloadError}</span>}
        </div>

        <div className="ap-dl-actions">
          <button type="button" className="ap-btn-outline" onClick={onClose} disabled={downloading}>Cancel</button>
          <button type="button" className="ap-btn" onClick={handleDownload} disabled={!canDownload}>
            {downloading ? (
              <span className="ap-dl-spin" aria-hidden="true" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
            )}
            {downloading ? 'Preparing...' : `Export ${format === 'pdf' ? 'PDF' : 'CSV'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
