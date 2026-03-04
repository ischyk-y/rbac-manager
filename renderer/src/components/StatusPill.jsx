import React from 'react';

export default function StatusPill({ value }) {
  const label = value === 'active'
    ? 'активний'
    : value === 'suspended'
      ? 'призупинений'
      : value;
  return <span className={`pill ${value === 'active' ? 'ok' : 'warn'}`}>{label}</span>;
}
