export function fmt(value, digits = 1) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
  if (abs < 1000) return value.toLocaleString('en-US', {maximumFractionDigits:abs < 10 ? 2 : digits});
  let index = Math.min(units.length - 1, Math.floor(Math.log10(abs) / 3));
  return `${(value / (1000 ** index)).toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')}${units[index]}`;
}
export function timeLabel(seconds) {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds)}s`;
}
