import { useEffect, useState } from 'react';
import API from '../api/axios';
import BackupCodes from './BackupCodes';

const ShieldIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" />
    <path d="M8.8 12.2l2.2 2.2 4.3-4.6" />
  </svg>
);

const errorText = (err, fallback) => err.response?.data?.message || fallback;

export default function MfaSettings() {
  const [status, setStatus] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // idle | password | scan | disable | regenerate | codes
  const [step, setStep] = useState('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState(null);
  const [backupCodes, setBackupCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadStatus = () => API.get('/auth/mfa')
    .then((res) => {
      setStatus(res.data);
      setLoadFailed(false);
    })
    .catch(() => setLoadFailed(true));

  useEffect(() => {
    loadStatus();
  }, []);

  const goTo = (nextStep) => {
    setStep(nextStep);
    setPassword('');
    setCode('');
    setError('');
    if (nextStep !== 'scan') setSetup(null);
  };

  const run = async (request, fallback) => {
    setBusy(true);
    setError('');
    try {
      await request();
    } catch (err) {
      setError(errorText(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const showBackupCodes = (codes) => {
    setBackupCodes(codes);
    goTo('codes');
  };

  const handleStart = (event) => {
    event.preventDefault();
    run(async () => {
      const res = await API.post('/auth/mfa/setup', { password });
      setSetup(res.data);
      setPassword('');
      setCode('');
      setStep('scan');
    }, 'Could not start the setup.');
  };

  const handleConfirm = (event) => {
    event.preventDefault();
    run(async () => {
      const res = await API.post('/auth/mfa/enable', { code });
      await loadStatus();
      showBackupCodes(res.data.backupCodes);
    }, 'Could not turn on MFA.');
  };

  const handleDisable = (event) => {
    event.preventDefault();
    run(async () => {
      await API.post('/auth/mfa/disable', { password, code });
      await loadStatus();
      goTo('idle');
    }, 'Could not turn off MFA.');
  };

  const handleRegenerate = (event) => {
    event.preventDefault();
    run(async () => {
      const res = await API.post('/auth/mfa/backup-codes', { password, code });
      await loadStatus();
      showBackupCodes(res.data.backupCodes);
    }, 'Could not create new backup codes.');
  };

  const finishCodes = () => {
    setBackupCodes([]);
    goTo('idle');
  };

  const enabled = Boolean(status?.enabled);
  const lowOnCodes = enabled && status.backupCodesRemaining <= 2;

  const passwordField = (
    <div>
      <label className="pf-label" htmlFor="pf-mfa-password">Current password</label>
      <input id="pf-mfa-password" type="password" className="pf-input" value={password} autoComplete="current-password"
        onChange={(event) => setPassword(event.target.value)} required />
    </div>
  );

  const errorAlert = error && <div className="pf-alert is-error mt-4" role="alert">{error}</div>;

  return (
    <div className="pf-card p-5 sm:p-6">
      <div className="pf-mfa-head">
        <span className={`pf-mfa-icon ${enabled ? 'is-on' : ''}`}><ShieldIcon /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="pf-card-title">Two-step sign-in (MFA)</h3>
            {status && <span className={`pf-mfa-state ${enabled ? 'is-on' : ''}`}>{enabled ? 'On' : 'Off'}</span>}
          </div>
          <p className="pf-card-sub">
            {enabled
              ? 'You sign in with your password and a code from your authenticator app.'
              : 'Add a code from an authenticator app, so a stolen password alone cannot open your account.'}
          </p>
        </div>
      </div>

      {loadFailed && <div className="pf-alert is-error mt-4" role="alert">Could not load your MFA status. Please refresh the page.</div>}

      {step === 'idle' && status && (
        <>
          {enabled && (
            <dl className="pf-mfa-facts">
              <div><dt>Turned on</dt><dd>{status.enabledAt ? new Date(status.enabledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</dd></div>
              <div><dt>Backup codes left</dt><dd className={lowOnCodes ? 'is-low' : ''}>{status.backupCodesRemaining} of 10</dd></div>
            </dl>
          )}
          {lowOnCodes && (
            <div className="pf-alert is-error mt-3">You are running out of backup codes. Create new ones so you don't get locked out.</div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {enabled ? (
              <>
                <button type="button" className="pf-btn-outline" onClick={() => goTo('regenerate')}>New backup codes</button>
                <button type="button" className="pf-btn-outline pf-btn-danger" onClick={() => goTo('disable')}>Turn off</button>
              </>
            ) : (
              <button type="button" className="pf-btn" onClick={() => goTo('password')}>Turn on</button>
            )}
          </div>
        </>
      )}

      {step === 'password' && (
        <form onSubmit={handleStart} className="pf-mfa-form">
          <p className="pf-mfa-note">Confirm your password to begin. You will need an app such as Google Authenticator or Microsoft Authenticator.</p>
          {passwordField}
          {errorAlert}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" className="pf-btn" disabled={busy || !password}>{busy ? 'Checking...' : 'Continue'}</button>
            <button type="button" className="pf-btn-outline" onClick={() => goTo('idle')}>Cancel</button>
          </div>
        </form>
      )}

      {step === 'scan' && setup && (
        <form onSubmit={handleConfirm} className="pf-mfa-scan">
          <img src={setup.qrCode} alt="QR code to scan with your authenticator app" className="pf-mfa-qr" width="180" height="180" />
          <div className="min-w-0 flex-1">
            <p className="pf-mfa-step"><b>1.</b> Scan this QR code in your authenticator app.</p>
            <p className="pf-hint">Can't scan it? Enter this key by hand:</p>
            <code className="pf-mfa-key">{setup.secret}</code>
            <p className="pf-mfa-step mt-4"><b>2.</b> Enter the 6-digit code the app shows.</p>
            <input aria-label="6-digit code" className="pf-input pf-mfa-code" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              placeholder="000000" onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} required />
            {errorAlert}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="submit" className="pf-btn" disabled={busy || code.length !== 6}>{busy ? 'Checking...' : 'Turn on MFA'}</button>
              <button type="button" className="pf-btn-outline" onClick={() => goTo('idle')}>Cancel</button>
            </div>
          </div>
        </form>
      )}

      {(step === 'disable' || step === 'regenerate') && (
        <form onSubmit={step === 'disable' ? handleDisable : handleRegenerate} className="pf-mfa-form">
          <p className="pf-mfa-note">
            {step === 'disable'
              ? 'Your account will be protected by your password alone, and you will not be asked to set this up again.'
              : 'Your old backup codes will stop working.'}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {passwordField}
            <div>
              <label className="pf-label" htmlFor="pf-mfa-confirm-code">Authenticator or backup code</label>
              <input id="pf-mfa-confirm-code" className="pf-input" value={code} autoComplete="one-time-code"
                onChange={(event) => setCode(event.target.value)} required />
            </div>
          </div>
          {errorAlert}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" className={step === 'disable' ? 'pf-btn-outline pf-btn-danger' : 'pf-btn'} disabled={busy || !password || !code}>
              {busy ? 'Checking...' : step === 'disable' ? 'Turn off MFA' : 'Create new codes'}
            </button>
            <button type="button" className="pf-btn-outline" onClick={() => goTo('idle')}>Cancel</button>
          </div>
        </form>
      )}

      {step === 'codes' && (
        <div className="pf-mfa-form">
          <BackupCodes codes={backupCodes} onDone={finishCodes} />
        </div>
      )}
    </div>
  );
}
