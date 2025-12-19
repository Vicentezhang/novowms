export const sanitizeCsv = (value: any): string => {
  const s = String(value ?? '')
  return s.replace(/\r|\n/g, ' ').replace(/,/g, ';')
}

export const escapeHtml = (value: any): string => {
  const s = String(value ?? '')
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
