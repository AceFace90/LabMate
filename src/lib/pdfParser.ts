import { findMarkerByAlias } from '../data/markerCatalog'
import { ausDateToIso } from './dates'
import { groupItemsIntoLines, type Line } from './textLines'
import type { MarkerResult } from '../types'

export class PdfPasswordNeededError extends Error {}
export class PdfWrongPasswordError extends Error {}

export interface ParseOutcome {
  results: MarkerResult[]
  warnings: string[]
}

const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/
const FLAG_RE = /^\*{1,2}$/
const OP_RE = /^[<>]$/
const NUMBER_RE = /^-?\d+(\.\d+)?$/
const DASH_LINE_RE = /^-{5,}$/
const FOOTER_CODE_LINE_RE = /^([A-Z]{2,4}\d?-[A-Z0-9]\s*){3,}/
const SKIP_LINE_PREFIX_RE = /^(Date|Time|Coll\.\s*Time|Lab Number|Lab#|Request):/i
// Repeated page letterhead / patient-header lines. These reappear at the top of every
// page and must reset any in-progress table state, or ID numbers and addresses on them
// get misread as data rows (e.g. a Medicare number bucketed into a wide-table column).
const PAGE_RESET_RE = /^(Page\s+\d+\s+of\s+\d+|Laboratory:|Addressee:|Your Reference:|Phone:|Birthdate:|Fax:|Copy to:)/i
// A sane upper bound on digit count for a numeric wide-table value - lab results are
// short (e.g. "149", "4.99"); phone/Medicare/reference numbers on letterhead are not.
const MAX_VALUE_DIGITS = 6

interface LongTableState {
  markerKey: string | null
  rawName: string
  unit: string
  panel: string
  rows: { date: string; value: number; collectionType: string }[]
  ranges: Map<string, { low: number; high: number; unit: string }>
}

export async function parsePdf(
  fileName: string,
  data: ArrayBuffer,
  password?: string,
): Promise<ParseOutcome> {
  const pdfjsLib = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

  let doc
  try {
    doc = await pdfjsLib.getDocument({ data, password }).promise
  } catch (err: unknown) {
    const e = err as { name?: string; code?: number }
    if (e?.name === 'PasswordException') {
      if (e.code === 1) throw new PdfPasswordNeededError('This PDF is password protected.')
      throw new PdfWrongPasswordError('That password did not work.')
    }
    throw err
  }

  const lines: Line[] = []
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum)
    const content = await page.getTextContent()
    lines.push(...groupItemsIntoLines(content.items as never))
  }

  return runStateMachine(fileName, lines)
}

export function runStateMachine(fileName: string, lines: Line[]): ParseOutcome {
  const results: MarkerResult[] = []
  const warnings: string[] = []

  let currentPanel = ''
  let currentCollectedDate: string | null = null
  let wideTable: { dates: { iso: string; x: number }[] } | null = null
  let longTable: LongTableState | null = null
  // True while inside a trailing explanatory-note block (e.g. "Recommended targets
  // for high risk patients", B12 deficiency-risk guidance). These blocks have no
  // single closing marker, so every line is skipped outright - including single-value
  // fallback parsing - until a real panel/page boundary is hit.
  let inNoteBlock = false

  const flushLongTable = () => {
    if (!longTable) return
    for (const row of longTable.rows) {
      const range = longTable.ranges.get(row.collectionType.toLowerCase().trim())
      results.push(
        makeResult({
          markerKey: longTable.markerKey ?? `unmatched:${slugify(longTable.rawName)}`,
          rawName: longTable.rawName,
          date: row.date,
          value: row.value,
          displayValue: String(row.value),
          flag: '',
          rangeLow: range?.low ?? null,
          rangeHigh: range?.high ?? null,
          rangeText: range ? `${range.low} - ${range.high}` : '',
          unit: range?.unit || longTable.unit,
          sourceFile: fileName,
          panel: longTable.panel,
        }),
      )
    }
    longTable = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const text = line.text.trim()
    if (!text) continue

    const nameOfTest = text.match(/Name of Test:\s*(.+)/i)
    if (nameOfTest) {
      flushLongTable()
      currentPanel = nameOfTest[1].trim()
      wideTable = null
      inNoteBlock = false
      continue
    }

    if (FOOTER_CODE_LINE_RE.test(text) || /^This request has other tests/i.test(text) || PAGE_RESET_RE.test(text)) {
      wideTable = null
      inNoteBlock = false
      continue
    }

    // Explanatory prose blocks (e.g. "Recommended targets for high risk patients",
    // deficiency-risk notes) sometimes follow a real data table with no "Name of
    // Test:" line to mark the boundary, but their own short lines - and any trailing
    // "(...)" on them - can otherwise look enough like table rows to get parsed as
    // more (wrongly dated) data. Skip every line until the next real panel/page.
    if (/^Recommended targets?\b/i.test(text) || /deficiency risk/i.test(text)) {
      wideTable = null
      inNoteBlock = true
      continue
    }
    if (inNoteBlock) continue

    const collected = text.match(/Collected:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)
    if (collected) {
      const iso = ausDateToIso(collected[1])
      if (iso) currentCollectedDate = iso
    }

    // --- Long-format table (e.g. GLUCOSE: one row per date) ---
    if (/Lab#/i.test(text) && /Collection Type/i.test(text)) {
      flushLongTable()
      const marker = findMarkerByAlias(currentPanel)
      let unit = marker?.defaultUnit ?? ''
      const nextLine = lines[i + 1]?.text.trim()
      const unitMatch = nextLine?.match(/^\(([^)]+)\)$/)
      if (unitMatch) unit = unitMatch[1]
      longTable = {
        markerKey: marker?.key ?? null,
        rawName: currentPanel,
        unit,
        panel: currentPanel,
        rows: [],
        ranges: new Map(),
      }
      wideTable = null
      continue
    }
    if (longTable) {
      const rangeRow = text.match(/^(.+?)\s+(-?\d+\.?\d*)\s*-\s*(-?\d+\.?\d*)\s*(\S+)$/)
      const dateToken = line.tokens[0]?.text
      if (rangeRow && !DATE_RE.test(dateToken ?? '')) {
        longTable.ranges.set(rangeRow[1].toLowerCase().trim(), {
          low: Number(rangeRow[2]),
          high: Number(rangeRow[3]),
          unit: rangeRow[4],
        })
        continue
      }
      if (DATE_RE.test(dateToken ?? '')) {
        const row = parseLongTableRow(line)
        if (row) {
          longTable.rows.push(row)
          continue
        }
      }
      if (/^This request has other tests|^\s*$/.test(text)) {
        flushLongTable()
      }
    }

    // --- Wide table header: "Date:  dd/mm/yy  dd/mm/yy ..." ---
    if (/^Date:?$/i.test(line.tokens[0]?.text ?? '') || /^Date:/i.test(text)) {
      const dateTokens = line.tokens.filter((t) => DATE_RE.test(t.text))
      if (dateTokens.length > 0) {
        wideTable = {
          dates: dateTokens
            .map((t) => ({ iso: ausDateToIso(t.text), x: t.x }))
            .filter((d): d is { iso: string; x: number } => !!d.iso),
        }
        continue
      }
    }

    if (SKIP_LINE_PREFIX_RE.test(text) || DASH_LINE_RE.test(text.replace(/\s/g, ''))) {
      continue
    }

    // --- Wide table data row ---
    if (wideTable && wideTable.dates.length > 0) {
      const parsed = parseWideTableRow(line, wideTable.dates)
      if (parsed) {
        for (const v of parsed.values) {
          const marker = findMarkerByAlias(parsed.name)
          results.push(
            makeResult({
              markerKey: marker?.key ?? `unmatched:${slugify(parsed.name)}`,
              rawName: parsed.name,
              date: v.date,
              value: v.value,
              displayValue: v.displayValue,
              flag: v.flag,
              rangeLow: parsed.rangeLow,
              rangeHigh: parsed.rangeHigh,
              rangeText: parsed.rangeText,
              unit: parsed.unit || marker?.defaultUnit || '',
              sourceFile: fileName,
              panel: currentPanel,
            }),
          )
        }
        if (!parsed.values.length && parsed.name) {
          warnings.push(`Could not read a value for "${parsed.name}" in ${currentPanel} (${fileName})`)
        }
        continue
      }
    }

    // --- Single-value line fallback (e.g. ANDROGEN STUDIES: "Testosterone  15.7 nmol/L (6.0 - 28.0)") ---
    if (!wideTable && !longTable) {
      const single = parseSingleValueLine(text)
      if (single && currentCollectedDate) {
        const marker = findMarkerByAlias(single.name)
        results.push(
          makeResult({
            markerKey: marker?.key ?? `unmatched:${slugify(single.name)}`,
            rawName: single.name,
            date: currentCollectedDate,
            value: single.value,
            displayValue: single.displayValue,
            flag: '',
            rangeLow: single.rangeLow,
            rangeHigh: single.rangeHigh,
            rangeText: single.rangeText,
            unit: single.unit || marker?.defaultUnit || '',
            sourceFile: fileName,
            panel: currentPanel,
          }),
        )
      }
    }
  }
  flushLongTable()

  return { results, warnings }
}

function parseLongTableRow(line: Line): { date: string; value: number; collectionType: string } | null {
  const tokens = line.tokens.map((t) => t.text)
  if (tokens.length < 5) return null
  const iso = ausDateToIso(tokens[0])
  const last = tokens[tokens.length - 1]
  if (!iso || !NUMBER_RE.test(last)) return null
  // Columns are: date, time, lab#, collection type (1+ words), specimen (1 word), value.
  // The printed "Glucose Reference Ranges" block below the table keys its rows by
  // collection type alone (e.g. "Random"), so the specimen word must be excluded here
  // or the backfill lookup ("Random serum") never matches ("Random").
  const collectionType = tokens.slice(3, tokens.length - 2).join(' ')
  return { date: iso, value: Number(last), collectionType }
}

function parseSingleValueLine(text: string): {
  name: string
  value: number
  displayValue: string
  unit: string
  rangeLow: number | null
  rangeHigh: number | null
  rangeText: string
} | null {
  const m = text.match(/^([A-Za-z][A-Za-z0-9 ./\-]*?)\s+([<>]?\s*-?\d+(?:\.\d+)?)\s*([A-Za-z%/^0-9.]*)\s*\(([^)]*)\)\s*$/)
  if (!m) return null
  const [, name, rawValue, unit, rangeText] = m
  const numeric = Number(rawValue.replace(/[<>]/g, '').trim())
  if (Number.isNaN(numeric)) return null
  const range = parseRangeText(rangeText)
  return { name: name.trim(), value: numeric, displayValue: rawValue.trim(), unit: unit.trim(), ...range, rangeText }
}

function parseWideTableRow(
  line: Line,
  dateColumns: { iso: string; x: number }[],
): {
  name: string
  values: { date: string; value: number; displayValue: string; flag: '' | '*' | '**' }[]
  unit: string
  rangeLow: number | null
  rangeHigh: number | null
  rangeText: string
} | null {
  const tokens = line.tokens
  if (tokens.length === 0) return null

  let idx = 0
  const nameTokens: string[] = []
  while (
    idx < tokens.length &&
    !DATE_RE.test(tokens[idx].text) &&
    !FLAG_RE.test(tokens[idx].text) &&
    !OP_RE.test(tokens[idx].text) &&
    !NUMBER_RE.test(tokens[idx].text) &&
    !tokens[idx].text.startsWith('(')
  ) {
    nameTokens.push(tokens[idx].text)
    idx++
  }
  const name = nameTokens.join(' ').trim()
  if (!name) return null
  // Real marker names in these reports are always short (1-4 words). A long run of
  // non-numeric tokens before any number/paren/flag means this line is prose (a
  // section note, not a data row) - bail out rather than risk a bogus match.
  if (nameTokens.length > 6) return null

  // Find the trailing "(range)" span, if any. The closing ")" is sometimes glued
  // directly to a unit with no space (e.g. "(4.50 - 6.50)x10 ^12 /L") - split that
  // token instead of requiring it to end exactly with ")".
  let rangeStart = -1
  let rangeEnd = -1
  let gluedUnitPrefix = ''
  for (let j = idx; j < tokens.length; j++) {
    if (tokens[j].text.startsWith('(')) {
      rangeStart = j
      for (let k = j; k < tokens.length; k++) {
        const closeAt = tokens[k].text.indexOf(')')
        if (closeAt !== -1) {
          rangeEnd = k
          gluedUnitPrefix = tokens[k].text.slice(closeAt + 1)
          break
        }
      }
      break
    }
  }

  const middleEnd = rangeStart === -1 ? tokens.length : rangeStart
  let middleTokens = tokens.slice(idx, middleEnd)
  let unit = ''
  if (rangeEnd !== -1) {
    const trailing = tokens
      .slice(rangeEnd + 1)
      .map((t) => t.text)
      .join(' ')
    unit = [gluedUnitPrefix, trailing].filter(Boolean).join(' ').trim()
  } else if (middleTokens.length > 0) {
    const lastMiddle = middleTokens[middleTokens.length - 1]
    if (!NUMBER_RE.test(lastMiddle.text) && !FLAG_RE.test(lastMiddle.text) && !OP_RE.test(lastMiddle.text)) {
      unit = lastMiddle.text
      middleTokens = middleTokens.slice(0, -1)
    }
  }

  const rangeText =
    rangeStart !== -1
      ? tokens
          .slice(rangeStart, (rangeEnd === -1 ? rangeStart : rangeEnd) + 1)
          .map((t, i, arr) => (i === arr.length - 1 ? t.text.slice(0, t.text.indexOf(')') + 1 || t.text.length) : t.text))
          .join(' ')
          .replace(/[()]/g, '')
      : ''
  const range = parseRangeText(rangeText)

  const rawValues: { value: number; displayValue: string; flag: '' | '*' | '**'; x: number }[] = []
  let pendingFlag: '' | '*' | '**' = ''
  let pendingOp = ''
  for (const tok of middleTokens) {
    if (FLAG_RE.test(tok.text)) {
      pendingFlag = tok.text as '*' | '**'
      continue
    }
    if (OP_RE.test(tok.text)) {
      pendingOp = tok.text
      continue
    }
    if (NUMBER_RE.test(tok.text)) {
      // Guard against letterhead ID numbers (phone/Medicare/reference) slipping through
      // if a table's end wasn't detected yet - real lab values are always short.
      if (tok.text.replace(/[.-]/g, '').length > MAX_VALUE_DIGITS) continue
      rawValues.push({
        value: Number(tok.text),
        displayValue: pendingOp ? `${pendingOp} ${tok.text}` : tok.text,
        flag: pendingFlag,
        x: tok.x,
      })
      pendingFlag = ''
      pendingOp = ''
    }
    // anything else (stray words like "Fasting", "Not", "Stated") is ignored - not a numeric result
  }

  // Numeric columns are right-aligned, so a value's x can sit closer to a neighbouring
  // date column than its own (e.g. a 2-digit MCV value drifts further right within its
  // column than a 3-digit Haemoglobin value does). When every date column has a value
  // - the common case - trust left-to-right print order over raw x-proximity. Only fall
  // back to nearest-x for sparse rows (a test not run at every collection), where order
  // alone can't say which date a lone value belongs to.
  const values: { date: string; value: number; displayValue: string; flag: '' | '*' | '**' }[] =
    rawValues.length === dateColumns.length
      ? rawValues.map((v, i) => ({ date: dateColumns[i].iso, value: v.value, displayValue: v.displayValue, flag: v.flag }))
      : rawValues.map((v) => {
          const nearest = dateColumns.reduce((best, col) => (Math.abs(col.x - v.x) < Math.abs(best.x - v.x) ? col : best))
          return { date: nearest.iso, value: v.value, displayValue: v.displayValue, flag: v.flag }
        })

  return { name, values, unit, ...range, rangeText }
}

function parseRangeText(rangeText: string): { rangeLow: number | null; rangeHigh: number | null } {
  const between = rangeText.match(/(-?\d+\.?\d*)\s*-\s*(-?\d+\.?\d*)/)
  if (between) return { rangeLow: Number(between[1]), rangeHigh: Number(between[2]) }
  const bounded = rangeText.match(/^[^\d]*([<>])\s*(-?\d+\.?\d*)/)
  if (bounded) {
    return bounded[1] === '>' ? { rangeLow: Number(bounded[2]), rangeHigh: null } : { rangeLow: null, rangeHigh: Number(bounded[2]) }
  }
  return { rangeLow: null, rangeHigh: null }
}

function makeResult(input: Omit<MarkerResult, 'id' | 'addedManually' | 'createdAt'>): MarkerResult {
  return {
    ...input,
    id: crypto.randomUUID(),
    addedManually: false,
    createdAt: new Date().toISOString(),
  }
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}
