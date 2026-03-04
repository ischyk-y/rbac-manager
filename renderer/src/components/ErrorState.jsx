import React from 'react';

export default function ErrorState({ text, onRetry }) {
  return (
    <div className="state error">
      <div>{text}</div>
      <button className="btn" onClick={onRetry}>Спробувати ще раз</button>
    </div>
  );
}
