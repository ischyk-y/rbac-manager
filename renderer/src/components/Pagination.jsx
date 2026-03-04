import React from 'react';

export default function Pagination({ page, totalPages, onChange }) {
  return (
    <div className="pagination-row">
      <button className="btn ghost" onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}>
        Назад
      </button>
      <span className="page-caption">Сторінка {page} / {Math.max(1, totalPages)}</span>
      <button
        className="btn ghost"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
      >
        Далі
      </button>
    </div>
  );
}
