import { useEffect, useRef, useState } from 'react';
import CopyButtonContent from './CopyButtonContent';
import { copyToClipboard } from '../utils/clipboard';
import './BackupCodes.css';

// Shows new backup codes once, and only moves on after the person confirms they saved them
export default function BackupCodes({ codes, doneLabel = 'Done', onDone }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(null);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const asText = () => `Allatone DMS backup codes\nEach code works once.\n\n${codes.join('\n')}\n`;

  const copyCodes = async () => {
    if (await copyToClipboard(asText())) {
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadCodes = () => {
    const url = URL.createObjectURL(new Blob([asText()], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'allatone-backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mfa-codes">
      <p className="mfa-codes-note">Save these backup codes now. They will not be shown again.</p>
      <p className="mfa-codes-help">If you lose your phone, each code lets you sign in once.</p>
      <ul className="mfa-codes-list">
        {codes.map((code) => <li key={code}>{code}</li>)}
      </ul>
      <div className="mfa-codes-actions">
        <button type="button" className="mfa-codes-btn" onClick={copyCodes}><CopyButtonContent copied={copied} /></button>
        <button type="button" className="mfa-codes-btn" onClick={downloadCodes}>Download</button>
      </div>
      <label className="mfa-codes-check">
        <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
        I have saved my backup codes
      </label>
      <button type="button" className="mfa-codes-done" disabled={!saved} onClick={onDone}>{doneLabel}</button>
    </div>
  );
}
