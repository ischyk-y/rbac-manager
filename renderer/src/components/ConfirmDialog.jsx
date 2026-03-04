import React, { useState } from 'react';

export default function ConfirmDialog({ config, onClose }) {
  const [busy, setBusy] = useState(false);
  if (!config) return null;

  const runConfirm = async () => {
    if (!config.onConfirm) return onClose();
    try {
      setBusy(true);
      await config.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="confirm-overlay">
      <div className="confirm-card">
        <h4>{config.title || 'Підтвердження'}</h4>
        {config.message ? <p>{config.message}</p> : null}
        <div className="form-actions">
          <button className="btn ghost" onClick={onClose} disabled={busy}>Скасувати</button>
          <button className="btn" onClick={runConfirm} disabled={busy}>{busy ? 'Застосування…' : 'Підтвердити'}</button>
        </div>
      </div>
    </div>
  );
}
