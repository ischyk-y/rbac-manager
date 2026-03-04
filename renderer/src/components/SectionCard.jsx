import React from 'react';

export default function SectionCard({ title, subtitle, actions, children }) {
  return (
    <section className="card reveal">
      <div className="card-header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="card-actions">{actions}</div>
      </div>
      <div>{children}</div>
    </section>
  );
}
