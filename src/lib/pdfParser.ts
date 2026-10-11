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
const PAGE_RESET_RE =
  /^(Page\s+\d+\s+of\s+\d+|Laboratory:|Addressee:|Your Reference:|Phone:|Birthdate:|Fax:|Copy to:|CC DRS:|PANEL CODES:|(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}|All tests on this request)/i
// Column-label lines in single-result reports ("Collection Time 09:05", "Request 26-...",
// "Units Reference Range", the patient footer) - never data rows.
const HEADER_LABEL_LINE_RE = /^(PATIENT:|Collection Time\s|Request\s+\d|Units\s+(Reference\s+)?Range)/i
// A comment paragraph keyed by its lab number ("46441897 Normal ACR.") - ends the table above.
const LAB_NUMBER_COMMENT_RE = /^#?\d{7,}\s+[A-Za-z]/
const TIME_RE = /^(\d{1,2}:\d{2}(:\d{2})?|NS)$/
const LAB_NUMBER_RE = /^#?\d{6,}$/
// A sane upper bound on digit count for a numeric wide-table value - lab results are
// short (e.g. "149", "4.99"); phone/Medicare/reference numbers on letterhead are not.
const MAX_VALUE_DIGITS = 6

// Column-style single-panel table (e.g. INSULIN STUDIES): a "Date Time Request <Marker...>"
// header, one row per collection date with values under each marker column, then
// "Units" and "Reference Ranges" rows aligned to the same columns.
interface ColumnTableState {
  headerTokens: { text: string; x: number }[]
  columns: { x: number; name: string; unit: string; rangeText: string }[]
  rows: { date: string; values: { colIdx: number; text: string }[] }[]
  panel: string
}

// Per-marker history table (e.g. CRP, HbA1c, Vitamin D): a "Date [Time] Lab No. <Marker...>"
// header, then one row per collection date: date, optional time, lab number, value(s),
// and - usually only on the latest row - the unit and "(range)".
interface HistoryTableState {
  header: { text: string; x: number }[]
  rangeTexts: string[]
  unit: string
  rows: { date: string; values: { value: number; displayValue: string; flag: '' | '*' | '**'; x: number }[]; unit: string; rangeText: string }[]
  panel: string
}

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
  let columnTable: ColumnTableState | null = null
  let historyTable: HistoryTableState | null = null
  // Specimen from the panel heading ("URINE ALBUMIN STUDIES  SPECIMEN: URINE") - a urine
  // "Albumin" or "Creatinine" is a different test from the blood marker of the same name.
  let currentSpecimen = ''
  // My Health Record exports append a "Start of Document ... End of Document" summary
  // after the lab's own pages - metadata only, no results.
  let inRecordSummary = false
  const lookupMarker = (name: string) =>
    /urine/i.test(currentSpecimen) ? findMarkerByAlias(`urine ${name}`) : findMarkerByAlias(name)
  // Results whose printed range was "See below" - filled from a following
  // "Fasting <low> - <high>" reference line in the comments, if one appears.
  let awaitingRange: MarkerResult[] = []
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

  const flushHistoryTable = () => {
    if (!historyTable) return
    const t = historyTable
    historyTable = null
    const columnCount = Math.max(0, ...t.rows.map((r) => r.values.length))
    if (columnCount === 0) return
    const columns = splitHeaderColumns(t.header, columnCount)
    const latestWithRange = [...t.rows].reverse().find((r) => r.rangeText)
    const latestWithUnit = [...t.rows].reverse().find((r) => r.unit)
    const built = columns.map((col, ci) => {
      const marker = lookupMarker(col.name)
      const rangeText = t.rangeTexts[ci] ?? (columnCount === 1 ? latestWithRange?.rangeText ?? '' : '')
      const unit = col.unit || (columnCount === 1 ? latestWithUnit?.unit || t.unit : '') || marker?.defaultUnit || ''
      return { ...col, marker, rangeText, unit }
    })
    // The same test reported in two units (HbA1c as mmol/mol and %): keep only the column
    // in the catalog's unit so one chart doesn't mix scales.
    const keep = built.filter((c) => {
      if (!c.marker) return true
      const twins = built.filter((o) => o.marker?.key === c.marker!.key)
      if (twins.length < 2) return true
      const preferred = twins.find((o) => o.unit.toLowerCase() === (c.marker!.defaultUnit ?? '').toLowerCase()) ?? twins[0]
      return preferred === c
    })
    for (const row of t.rows) {
      row.values.forEach((v, vi) => {
        const ci =
          row.values.length === columns.length
            ? vi
            : columns.reduce((best, c, i) => (Math.abs(c.x - v.x) < Math.abs(columns[best].x - v.x) ? i : best), 0)
        const col = built[ci]
        if (!keep.includes(col)) return
        const range = parseRangeText(col.rangeText)
        results.push(
          makeResult({
            markerKey: col.marker?.key ?? `unmatched:${slugify(col.name)}`,
            rawName: col.name,
            date: row.date,
            value: v.value,
            displayValue: v.displayValue,
            flag: v.flag,
            rangeLow: range.rangeLow,
            rangeHigh: range.rangeHigh,
            rangeText: col.rangeText,
            unit: col.unit,
            sourceFile: fileName,
            panel: t.panel,
          }),
        )
      })
    }
  }

  const flushColumnTable = () => {
    if (!columnTable) return
    for (const row of columnTable.rows) {
      for (const v of row.values) {
        const col = columnTable.columns[v.colIdx]
        const parsed = parseValueToken(v.text)
        if (!col?.name || !parsed) continue
        const marker = lookupMarker(col.name)
        const range = parseRangeText(col.rangeText)
        const result = makeResult({
          markerKey: marker?.key ?? `unmatched:${slugify(col.name)}`,
          rawName: col.name,
          date: row.date,
          value: parsed.value,
          displayValue: parsed.displayValue,
          flag: parsed.flag,
          rangeLow: range.rangeLow,
          rangeHigh: range.rangeHigh,
          rangeText: range.rangeLow !== null || range.rangeHigh !== null ? col.rangeText : '',
          unit: col.unit || marker?.defaultUnit || '',
          sourceFile: fileName,
          panel: columnTable.panel,
        })
        results.push(result)
        if (/see below/i.test(col.rangeText)) awaitingRange.push(result)
      }
    }
    columnTable = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const text = line.text.trim()
    if (!text) continue

    if (/^Start of Document$/i.test(text)) {
      flushHistoryTable()
      flushColumnTable()
      inRecordSummary = true
      continue
    }
    if (inRecordSummary) {
      if (/^End of Document$/i.test(text)) inRecordSummary = false
      continue
    }

    // Panel heading carrying its specimen ("C REACTIVE PROTEIN (CRP)  SPECIMEN: SERUM").
    const specimenHeading = text.match(/^(.*?)\s*SPECIMEN:\s*(.+)$/)
    if (specimenHeading) {
      flushHistoryTable()
      flushColumnTable()
      awaitingRange = []
      // Some layouts put the panel name on the line above ("GENERAL CHEMISTRY" / "SPECIMEN: Serum").
      const prevText = lines[i - 1]?.text.trim() ?? ''
      currentPanel = specimenHeading[1].trim() || (/^[A-Z0-9 /&()-]+$/.test(prevText) ? prevText : currentPanel)
      currentSpecimen = specimenHeading[2].trim()
      wideTable = null
      inNoteBlock = false
      continue
    }

    const nameOfTest = text.match(/Name of Test:\s*(.+)/i)
    if (nameOfTest) {
      flushLongTable()
      flushColumnTable()
      flushHistoryTable()
      currentSpecimen = ''
      awaitingRange = []
      currentPanel = nameOfTest[1].trim()
      wideTable = null
      inNoteBlock = false
      continue
    }

    if (FOOTER_CODE_LINE_RE.test(text) || /^This request has other tests/i.test(text) || PAGE_RESET_RE.test(text)) {
      flushColumnTable()
      flushHistoryTable()
      awaitingRange = []
      wideTable = null
      inNoteBlock = false
      continue
    }

    // Explanatory prose blocks (e.g. "Recommended targets for high risk patients",
    // deficiency-risk notes) sometimes follow a real data table with no "Name of
    // Test:" line to mark the boundary, but their own short lines - and any trailing
    // "(...)" on them - can otherwise look enough like table rows to get parsed as
    // more (wrongly dated) data. Skip every line until the next real panel/page.
    if (
      /^Recommended targets?\b/i.test(text) ||
      /deficiency risk/i.test(text) ||
      // (Long-format tables keep reading: their reference-range block follows the comment.)
      (LAB_NUMBER_COMMENT_RE.test(text) && !longTable)
    ) {
      flushHistoryTable()
      wideTable = null
      inNoteBlock = true
      continue
    }
    if (inNoteBlock) continue

    if (awaitingRange.length > 0) {
      const fasting = text.match(/^Fasting\s+(-?\d+\.?\d*)\s*-\s*(-?\d+\.?\d*)/i)
      if (fasting) {
        for (const r of awaitingRange) {
          r.rangeLow = Number(fasting[1])
          r.rangeHigh = Number(fasting[2])
          r.rangeText = `${fasting[1]} - ${fasting[2]} (fasting)`
        }
        awaitingRange = []
        continue
      }
    }

    // --- Per-marker history table (header "Date [Time] Lab No. <markers>") ---
    if (
      /^Date$/i.test(line.tokens[0]?.text ?? '') &&
      !line.tokens.some((t) => DATE_RE.test(t.text)) &&
      !/Collection Type/i.test(text)
    ) {
      const labNoEnd = line.tokens.findIndex(
        (t, idx) => /^Lab#$/i.test(t.text) || (/^No\.?$/i.test(t.text) && /^(Lab|Req\.?)$/i.test(line.tokens[idx - 1]?.text ?? '')),
      )
      if (labNoEnd !== -1) {
        flushHistoryTable()
        historyTable = {
          header: line.tokens.slice(labNoEnd + 1).filter((t) => !/^(Units|Ref\.?|Range|Reference)$/i.test(t.text)),
          rangeTexts: [],
          unit: '',
          rows: [],
          panel: currentPanel,
        }
        wideTable = null
        continue
      }
    }
    if (historyTable) {
      if (DASH_LINE_RE.test(text.replace(/\s/g, ''))) continue
      const unitOnly = text.match(/^\(([^)]+)\)$/)
      if (unitOnly && historyTable.rows.length === 0) {
        historyTable.unit = unitOnly[1]
        continue
      }
      if (/^Ref\.?\s*Range/i.test(text)) {
        historyTable.rangeTexts = [...text.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim())
        continue
      }
      const row = DATE_RE.test(line.tokens[0]?.text ?? '') ? parseHistoryRow(line) : null
      if (row) {
        historyTable.rows.push(row)
        continue
      }
      flushHistoryTable()
    }

    // --- Column-style table (header "Date Time Request <markers>") ---
    const headerWords = line.tokens.slice(0, 3).map((t) => t.text.toLowerCase())
    if (headerWords.join(' ') === 'date time request' && line.tokens.length > 3) {
      flushColumnTable()
      columnTable = { headerTokens: line.tokens.slice(3), columns: [], rows: [], panel: currentPanel }
      wideTable = null
      continue
    }
    if (columnTable) {
      const first = line.tokens[0]?.text ?? ''
      if (DATE_RE.test(first)) {
        const iso = ausDateToIso(first)
        // Values sit after the date, time and request-number columns.
        const valueTokens = line.tokens.slice(3)
        if (iso && valueTokens.length > 0) {
          if (columnTable.columns.length === 0) {
            // Anchor each column at its value's x; header words left of the next
            // anchor belong to the previous column (e.g. "Serum Insulin").
            columnTable.columns = valueTokens.map((t) => ({ x: t.x, name: '', unit: '', rangeText: '' }))
            for (const h of columnTable.headerTokens) {
              const idx = nearestColumnAtOrLeft(columnTable.columns, h.x)
              const col = columnTable.columns[idx]
              col.name = col.name ? `${col.name} ${h.text}` : h.text
            }
          }
          columnTable.rows.push({
            date: iso,
            values: valueTokens.map((t) => ({ colIdx: nearestColumnAtOrLeft(columnTable!.columns, t.x), text: t.text })),
          })
          continue
        }
      }
      const rowLabel = /^Units\b/i.test(text) ? 'unit' : /^Reference Ranges?\b/i.test(text) ? 'rangeText' : null
      if (rowLabel && columnTable.columns.length > 0) {
        const skip = rowLabel === 'unit' ? 1 : /^Reference Ranges?\s/i.test(text) ? 2 : 1
        for (const t of line.tokens.slice(skip)) {
          const col = columnTable.columns[nearestColumnAtOrLeft(columnTable.columns, t.x)]
          col[rowLabel] = col[rowLabel] ? `${col[rowLabel]} ${t.text}` : t.text
        }
        continue
      }
      flushColumnTable()
    }

    const collected = text.match(/Collected:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)
    if (collected) {
      const iso = ausDateToIso(collected[1])
      if (iso) currentCollectedDate = iso
    }

    // --- Long-format table (e.g. GLUCOSE: one row per date) ---
    if (/Lab#/i.test(text) && /Collection Type/i.test(text)) {
      flushLongTable()
      // The marker is the last header column ("... Specimen Glucose"); fall back to the panel name.
      const specimenIdx = line.tokens.findIndex((t) => /^Specimen$/i.test(t.text))
      const headerName = specimenIdx >= 0 ? line.tokens.slice(specimenIdx + 1).map((t) => t.text).join(' ') : ''
      const marker = lookupMarker(headerName) ?? lookupMarker(currentPanel)
      let unit = marker?.defaultUnit ?? ''
      const nextLine = lines[i + 1]?.text.trim()
      const unitMatch = nextLine?.match(/^\(([^)]+)\)$/)
      if (unitMatch) unit = unitMatch[1]
      longTable = {
        markerKey: marker?.key ?? null,
        rawName: headerName || currentPanel,
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

    // A free-text comments section ends the result table above it.
    if (/^Comments:/i.test(text)) {
      wideTable = null
      continue
    }

    if (SKIP_LINE_PREFIX_RE.test(text) || HEADER_LABEL_LINE_RE.test(text) || DASH_LINE_RE.test(text.replace(/\s/g, ''))) {
      continue
    }

    // --- Single-result row with an unbracketed range or "see below"
    // (e.g. "Magnesium 0.91 mmol/L 0.70 - 1.10", "hsCRP 7.7 mg/L see below") ---
    if (!longTable && (!wideTable || wideTable.dates.length === 1)) {
      const date = wideTable ? wideTable.dates[0].iso : currentCollectedDate
      const row = date ? parseUnbracketedRow(text) : null
      if (row && date) {
        const marker = lookupMarker(row.name)
        results.push(
          makeResult({
            markerKey: marker?.key ?? `unmatched:${slugify(row.name)}`,
            rawName: row.name,
            date,
            value: row.value,
            displayValue: row.displayValue,
            flag: row.flag,
            rangeLow: row.rangeLow,
            rangeHigh: row.rangeHigh,
            rangeText: row.rangeText,
            unit: row.unit || marker?.defaultUnit || '',
            sourceFile: fileName,
            panel: currentPanel,
          }),
        )
        continue
      }
    }

    // --- Wide table data row ---
    if (wideTable && wideTable.dates.length > 0) {
      const parsed = parseWideTableRow(line, wideTable.dates)
      if (parsed) {
        for (const v of parsed.values) {
          const marker = lookupMarker(parsed.name)
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
        // Single letters are the rotated department name printed down the page margin.
        // A digit-free row under a single-result header is a subheading ("Electrolytes / Renal Function").
        const isSubheading = wideTable.dates.length === 1 && !/\d/.test(text)
        if (!parsed.values.length && parsed.name.length > 1 && !isSubheading) {
          warnings.push(`Could not read a value for "${parsed.name}" in ${currentPanel} (${fileName})`)
        }
        continue
      }
    }

    // --- Single-value line fallback (e.g. ANDROGEN STUDIES: "Testosterone  15.7 nmol/L (6.0 - 28.0)") ---
    if (!wideTable && !longTable) {
      const single = parseSingleValueLine(text)
      if (single && currentCollectedDate) {
        const marker = lookupMarker(single.name)
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
  flushColumnTable()
  flushHistoryTable()

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

function parseHistoryRow(line: Line): HistoryTableState['rows'][number] | null {
  const date = ausDateToIso(line.tokens[0].text)
  if (!date) return null
  let idx = 1
  while (idx < line.tokens.length && (TIME_RE.test(line.tokens[idx].text) || LAB_NUMBER_RE.test(line.tokens[idx].text))) idx++
  const values: HistoryTableState['rows'][number]['values'] = []
  let pendingFlag: '' | '*' | '**' = ''
  let pendingOp = ''
  for (; idx < line.tokens.length; idx++) {
    const tok = line.tokens[idx]
    if (FLAG_RE.test(tok.text)) {
      pendingFlag = tok.text as '*' | '**'
      continue
    }
    if (OP_RE.test(tok.text)) {
      pendingOp = tok.text
      continue
    }
    const parsed = parseValueToken(pendingOp + tok.text)
    if (!parsed) break
    values.push({ ...parsed, flag: parsed.flag || pendingFlag, x: tok.x })
    pendingFlag = ''
    pendingOp = ''
  }
  if (values.length === 0) return null
  // Whatever follows the values is the unit and/or "(range)", in either order.
  const rest = line.tokens.slice(idx).map((t) => t.text).join(' ')
  const rangeMatch = rest.match(/\(([^)]*)\)/)
  const unit = rest.replace(/\([^)]*\)/, '').trim()
  return { date, values, unit, rangeText: rangeMatch ? rangeMatch[1].trim() : '' }
}

/**
 * Splits header tokens into `count` marker columns. A "(unit)" token closes a column
 * ("HbA1c (mmol/mol) HbA1c (%)"); otherwise split at the widest x gaps.
 */
function splitHeaderColumns(header: { text: string; x: number }[], count: number): { name: string; unit: string; x: number }[] {
  let groups: { text: string; x: number }[][] = []
  for (const t of header) {
    const prev = groups[groups.length - 1]
    if (!prev || (prev[prev.length - 1].text.startsWith('(') && !t.text.startsWith('('))) groups.push([t])
    else prev.push(t)
  }
  if (groups.length !== count) {
    const cuts = header
      .slice(1)
      .map((t, i) => ({ i: i + 1, gap: t.x - header[i].x }))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, count - 1)
      .map((c) => c.i)
      .sort((a, b) => a - b)
    groups = []
    let start = 0
    for (const cut of [...cuts, header.length]) {
      groups.push(header.slice(start, cut))
      start = cut
    }
  }
  return groups.map((g) => {
    const unitTok = g.find((t) => /^\(.*\)$/.test(t.text))
    return {
      name: g.filter((t) => t !== unitTok).map((t) => t.text).join(' '),
      unit: unitTok ? unitTok.text.slice(1, -1) : '',
      x: g[0]?.x ?? 0,
    }
  })
}

function nearestColumnAtOrLeft(columns: { x: number }[], x: number): number {
  // Small tolerance: text in the same column can start a few units left of its anchor.
  let idx = 0
  columns.forEach((c, i) => {
    if (c.x <= x + 8) idx = i
  })
  return idx
}

/** Parses a value token that may carry a leading "<"/">" or a glued abnormal flag (e.g. "23.3**"). */
function parseValueToken(text: string): { value: number; displayValue: string; flag: '' | '*' | '**' } | null {
  const m = text.match(/^([<>]?)(-?\d+(?:\.\d+)?)(\*{0,2})$/)
  if (!m) return null
  return { value: Number(m[2]), displayValue: m[1] ? `${m[1]} ${m[2]}` : m[2], flag: m[3] as '' | '*' | '**' }
}

function parseUnbracketedRow(text: string): {
  name: string
  value: number
  displayValue: string
  flag: '' | '*' | '**'
  unit: string
  rangeLow: number | null
  rangeHigh: number | null
  rangeText: string
} | null {
  // name, value (optional op / glued flag), unit (must contain a letter or %), then
  // either a bare "low - high" / "< n" range or the words "see below".
  const m = text.match(
    /^([A-Za-z][A-Za-z0-9 ./\-]*?)\s+([<>]?\s*-?\d+(?:\.\d+)?\*{0,2})\s+(\S*[A-Za-z%µμ]\S*)\s+(-?\d+(?:\.\d+)?\s*-\s*-?\d+(?:\.\d+)?|[<>]=?\s*-?\d+(?:\.\d+)?|see below)$/i,
  )
  if (!m) return null
  const [, name, rawValue, unit, rangePart] = m
  const parsed = parseValueToken(rawValue.replace(/\s+/g, ''))
  if (!parsed) return null
  const seeBelow = /see below/i.test(rangePart)
  const range = seeBelow ? { rangeLow: null, rangeHigh: null } : parseRangeText(rangePart)
  return { name: name.trim(), ...parsed, unit, ...range, rangeText: seeBelow ? '' : rangePart }
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
    // Some labs print the unit before the range ("Albumin 9 mg/L (< 15)").
    const lastMiddle = middleTokens[middleTokens.length - 1]
    if (!unit && lastMiddle && !NUMBER_RE.test(lastMiddle.text) && !FLAG_RE.test(lastMiddle.text) && !OP_RE.test(lastMiddle.text)) {
      unit = lastMiddle.text
      middleTokens = middleTokens.slice(0, -1)
    }
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
