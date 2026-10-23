// Lecture et écriture de fichiers CSV (tableur : Excel, LibreOffice, Google Sheets).
// Séparateur « ; » par défaut, comme l'attend Excel en français.

type Cell = string | number | boolean | undefined | null

/** Transforme un tableau de lignes en texte CSV. */
export function toCsv(rows: Cell[][], separator = ';'): string {
  const escape = (value: Cell) => {
    const s = value === undefined || value === null ? '' : String(value)
    return /["\n\r]/.test(s) || s.includes(separator) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(escape).join(separator)).join('\r\n')
}

/** Devine le séparateur d'après la première ligne (« ; », « , » ou tabulation). */
function detectSeparator(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const counts = [';', ',', '\t'].map((sep) => ({ sep, n: firstLine.split(sep).length }))
  return counts.sort((a, b) => b.n - a.n)[0].sep
}

/** Lit un texte CSV (gère les guillemets, les retours à la ligne dans les cellules, le BOM d'Excel). */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '')
  const sep = detectSeparator(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') inQuotes = false
      else cell += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}
