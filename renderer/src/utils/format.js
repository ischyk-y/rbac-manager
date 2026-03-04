export function formatDate(value) {
  if (!value) return 'н/д';
  return new Date(value).toLocaleString();
}

export function jsonDiffSummary(before, after) {
  if (!before && !after) return 'Немає даних';
  const asText = (value) => {
    if (!value) return '{}';
    const text = JSON.stringify(value);
    return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  };
  return `${asText(before)} -> ${asText(after)}`;
}
