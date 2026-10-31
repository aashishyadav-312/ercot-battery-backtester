export const usd = (v: number | null | undefined, d = 1) =>
  v == null || Number.isNaN(v) ? '–' : `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
export const pct = (v: number | null | undefined, d = 0) =>
  v == null || Number.isNaN(v) ? '–' : `${(v * 100).toFixed(d)}%`;
export const num = (v: number | null | undefined, d = 0) =>
  v == null || Number.isNaN(v) ? '–' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function yearLabel(y: number) {
  return y === 2026 ? '2026 YTD' : String(y);
}

export const durLabel = (h: number) => `${h}h`;
export const degLabel = (d: number) => (d === 0 ? '$0/MWh' : `$${d}/MWh`);

/** Download a table as CSV (RFC 4180 quoting). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n';
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
