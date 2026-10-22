export function csvCell(value: string | number): string {
  let text = String(value);
  // Quoting alone does not prevent spreadsheet formula interpretation.
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text))
    text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function makeCsv(rows: (string | number)[][]): string {
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
