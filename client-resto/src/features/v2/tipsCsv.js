import { bakuStamp } from './dates'

// Client-side CSV of the loaded tip report (no extra request). Text cells that
// start with = + - @ are prefixed with ' so a spreadsheet never runs a staff
// name as a formula.

const FORMULA_START = /^[=+\-@\t\r]/
const money = n => ({ raw: (Number(n) || 0).toFixed(2) })

function cell(value) {
  if (value && typeof value === 'object') return value.raw
  let s = value == null ? '' : String(value)
  if (FORMULA_START.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * report: the TipReport view-model (api.js fetchTipReport).
 * labels: { waiter, role, tips, total, average, lastTip, unassigned, roleName(role) }, all translated.
 */
export function buildTipsCsv(report, labels) {
  const rows = [[labels.waiter, labels.role, labels.tips, labels.total, labels.average, labels.lastTip]]
  for (const w of report.waiters) {
    rows.push([w.name, labels.roleName(w.role), w.count, money(w.total), money(w.avg), bakuStamp(w.lastTipAt)])
  }
  const u = report.unassigned
  if (u.count > 0 || u.total > 0) {
    rows.push([labels.unassigned, '', u.count, money(u.total), money(u.count > 0 ? u.total / u.count : 0), ''])
  }
  return rows.map(r => r.map(cell).join(',')).join('\r\n')
}

/** Saves `text` as a UTF-8 CSV (with BOM, so Excel reads the Azerbaijani letters). */
export function downloadCsv(filename, text) {
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.className = 'v2-sr-only'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
