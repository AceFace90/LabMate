import { findMarkerByAlias, findMarkerExact } from '../data/markerCatalog'
import { findDatesInText } from './dates'
import type { Line, PositionedToken } from './textLines'
import type { MarkerResult } from '../types'

/**
 * Marker-anchored parsing: instead of matching one fixed row layout, find known marker
 * names and read the value / unit / range that sit around them - on the same line, in
 * several side-by-side segments, or stacked on the lines below. Dates are found
 * separately, in any common format, and attached by label or column.
 *
 * Used when the layout-specific parsers in pdfParser.ts recognise nothing.
 */

const NUM = /^-?\d+(\.\d+)?$/
const OP = /^(<=|>=|<|>)$/
const RANGE_TOKEN = /^-?\d+(\.\d+)?-\d+(\.\d+)?$/
const FLAG = /^(H|L|HH|LL|\*{1,2})$/
const MAX_DIGITS = 6
const CHAR_W = 5

interface Tok {
  text: string
  x: number
}

export interface AnchoredOutcome {
  results: MarkerResult[]
  warnings: string[]
}

/** Splits glued pieces ("Phos(40-120)", "<5.0"), drops bullets, and normalises "x10*9" to "x10^9". */
function normaliseTokens(tokens: PositionedToken[]): Tok[] {
  const out: Tok[] = []
  for (const t of tokens) {
    let text = t.text.replace(/x10\*/gi, 'x10^')
    if (/^[•·●▪◦*]$/.test(text) && text !== '*') continue
    const paren = text.match(/^([^(]+)(\(.*)$/)
    if (paren) {
      out.push({ text: paren[1], x: t.x }, { text: paren[2], x: t.x + paren[1].length * CHAR_W })
      continue
    }
    const op = text.match(/^(<=|>=|<|>)(\d.*)$/)
    if (op) {
      out.push({ text: op[1], x: t.x }, { text: op[2], x: t.x + op[1].length * CHAR_W })
      continue
    }
    out.push({ text, x: t.x })
  }
  return out
}

function parseRange(text: string): { rangeLow: number | null; rangeHigh: number | null } {
  const between = text.match(/(-?\d+\.?\d*)\s*-\s*(-?\d+\.?\d*)/)
  if (between) return { rangeLow: Number(between[1]), rangeHigh: Number(between[2]) }
  const bound = text.match(/([<>])=?\s*(-?\d+\.?\d*)/)
  if (bound) return bound[1] === '>' ? { rangeLow: Number(bound[2]), rangeHigh: null } : { rangeLow: null, rangeHigh: Number(bound[2]) }
  return { rangeLow: null, rangeHigh: null }
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function make(
  fileName: string,
  name: string,
  markerKey: string,
  date: string,
  v: { value: number; display: string },
  unit: string,
  rangeText: string,
): MarkerResult {
  const range = parseRange(rangeText)
  return {
    id: crypto.randomUUID(),
    markerKey,
    rawName: name,
    date,
    value: v.value,
    displayValue: v.display,
    flag: '',
    rangeLow: range.rangeLow,
    rangeHigh: range.rangeHigh,
    rangeText: range.rangeLow !== null || range.rangeHigh !== null ? rangeText : '',
    unit,
    sourceFile: fileName,
    panel: '',
    addedManually: false,
    createdAt: new Date().toISOString(),
  }
}

interface DateColumn {
  iso: string
  x: number
}

/** "Date Collected 16 May 24 10 Sep 25 10 Nov 26" -> one column per date, with its x position. */
function readDateColumns(line: Line): DateColumn[] | null {
  if (!/^Date\s+Collected\b/i.test(line.text.trim())) return null
  const found = findDatesInText(line.text)
  if (found.length === 0) return null
  // Token character offsets within line.text, to locate each date's x span.
  const offsets: { start: number; end: number; tok: PositionedToken }[] = []
  let pos = 0
  for (const tok of line.tokens) {
    offsets.push({ start: pos, end: pos + tok.text.length, tok })
    pos += tok.text.length + 1
  }
  return found.map((f) => {
    const hit = offsets.filter((o) => o.start < f.index + f.length && f.index < o.end)
    const first = hit[0]?.tok
    const last = hit[hit.length - 1]?.tok
    const x = first && last ? (first.x + last.x + last.text.length * CHAR_W) / 2 : 0
    return { iso: f.iso, x }
  })
}

/** The report's collection date: a date on (or just after) a "collected / observation / test date" label. */
function findReportDate(lines: Line[]): string | null {
  const label = /(collect|observation|test date|date taken|specimen date)/i
  const reject = /(report|receiv|request|birth|dob)/i
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text
    if (!label.test(text)) continue
    // Only the part of the line from the label onwards, up to any rejected label.
    const from = text.search(label)
    let seg = text.slice(from)
    const cut = seg.search(reject)
    if (cut > 0) seg = seg.slice(0, cut)
    let d = findDatesInText(seg)[0]
    if (!d && i + 1 < lines.length && !reject.test(lines[i].text.slice(from).slice(0, 12))) d = findDatesInText(lines[i + 1].text)[0]
    if (d) return d.iso
  }
  return null
}

interface Segment {
  start: number
  nameLen: number
  name: string
  markerKey: string | null
}

function nameTokensOk(toks: Tok[]): boolean {
  return toks.every((t) => !NUM.test(t.text) && !OP.test(t.text) && !t.text.startsWith('(') && !FLAG.test(t.text))
}

function findSegments(tokens: Tok[]): Segment[] {
  const segs: Segment[] = []
  for (let i = 0; i < tokens.length; i++) {
    for (let n = 3; n >= 1; n--) {
      if (i + n >= tokens.length) continue
      const nameToks = tokens.slice(i, i + n)
      if (!nameTokensOk(nameToks)) continue
      const name = nameToks.map((t) => t.text).join(' ').replace(/:$/, '')
      const marker = findMarkerExact(name)
      const next = tokens[i + n].text
      const unitThenValue = /\//.test(next) && i + n + 1 < tokens.length && (NUM.test(tokens[i + n + 1].text) || OP.test(tokens[i + n + 1].text))
      if (marker && (NUM.test(next) || OP.test(next) || next.startsWith('(') || unitThenValue)) {
        segs.push({ start: i, nameLen: n, name, markerKey: marker.key })
        i += n - 1
        break
      }
    }
  }
  return segs
}

interface Parsed {
  vals: { value: number; display: string; x: number; op: string }[]
  unit: string
  rangeText: string
}

function readSegmentBody(body: Tok[]): Parsed {
  const vals: Parsed['vals'] = []
  const unitParts: string[] = []
  let rangeText = ''
  let pendingOp = ''
  let lastWasUnit = false
  for (let j = 0; j < body.length; j++) {
    const t = body[j].text
    if (t.startsWith('(')) {
      const parts = [t]
      while (!parts[parts.length - 1].endsWith(')') && j + 1 < body.length) parts.push(body[++j].text)
      rangeText = parts.join(' ').replace(/[()]/g, '').trim()
      lastWasUnit = false
      continue
    }
    if (OP.test(t)) {
      pendingOp = t
      lastWasUnit = false
      continue
    }
    if (RANGE_TOKEN.test(t) && vals.length > 0) {
      if (!rangeText) rangeText = t
      lastWasUnit = false
      continue
    }
    if (NUM.test(t)) {
      if (t.replace(/[.-]/g, '').length <= MAX_DIGITS) {
        vals.push({ value: Number(t), display: pendingOp ? `${pendingOp} ${t}` : t, x: body[j].x, op: pendingOp })
      }
      pendingOp = ''
      lastWasUnit = false
      continue
    }
    if (FLAG.test(t)) {
      lastWasUnit = false
      continue
    }
    if (unitParts.length === 0 || lastWasUnit) {
      unitParts.push(t)
      lastWasUnit = true
    } else {
      lastWasUnit = false
    }
  }
  return { vals, unit: unitParts.join(''), rangeText }
}

const VALUE_LINE = /^[<>]?=?\s*\d+(\.\d+)?(\s+[^\d\s-].*)?$/
const RANGE_LINE = /^(([<>]=?\s*)?-?\d+(\.\d+)?(\s*-\s*-?\d+(\.\d+)?)?)(\s+\S+)*$/

function cleanLineText(line: Line): string {
  return normaliseTokens(line.tokens).map((t) => t.text).join(' ')
}

export function anchoredParse(fileName: string, lines: Line[], defaultDate?: string): AnchoredOutcome {
  const results: MarkerResult[] = []
  const warnings: string[] = []
  const reportDate = findReportDate(lines) ?? defaultDate ?? null
  let columns: DateColumn[] | null = null
  let heading = ''
  let datelessRows = 0
  const unrecognised = new Set<string>()

  const emit = (name: string, markerKey: string | null, parsed: Parsed) => {
    const marker = markerKey ? findMarkerExact(name) : undefined
    const key = markerKey ?? `unmatched:${slugify(name)}`
    const unit = parsed.unit || marker?.defaultUnit || ''
    if (columns && columns.length > 1) {
      // Same count -> trust print order; sparse rows -> nearest column by x.
      const useOrder = parsed.vals.length === columns.length
      for (let k = 0; k < parsed.vals.length; k++) {
        const v = parsed.vals[k]
        const centre = v.x + (v.display.length * CHAR_W) / 2
        const col = useOrder
          ? columns[k]
          : columns.reduce((best, c) => (Math.abs(c.x - centre) < Math.abs(best.x - centre) ? c : best))
        results.push(make(fileName, name, key, col.iso, v, unit, parsed.rangeText))
      }
      return
    }
    const date = columns?.[0]?.iso ?? reportDate
    if (!date) {
      datelessRows++
      return
    }
    const first = parsed.vals[0]
    if (!first) return
    let rangeText = parsed.rangeText
    if (!rangeText) {
      const bound = parsed.vals.slice(1).find((v) => v.op)
      if (bound) rangeText = bound.display
    }
    results.push(make(fileName, name, key, date, first, unit, rangeText))
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const text = line.text.trim()
    if (!text) continue

    const cols = readDateColumns(line)
    if (cols) {
      columns = cols
      continue
    }
    if (/^[A-Z][A-Z\s/&-]{4,}$/.test(text)) heading = text

    const tokens = normaliseTokens(line.tokens)

    // Side-by-side segments: "Hb 155 g/L (130-180)   WBC 6.0 x10^9/L (4.0-11.0)" or "Na (135-145) mmol/L 139 140".
    const segs = findSegments(tokens)
    if (segs.length > 0) {
      segs.forEach((seg, si) => {
        const end = si + 1 < segs.length ? segs[si + 1].start : tokens.length
        let name = seg.name
        let key = seg.markerKey
        // "Serum" / "Plasma" rows take their test from the section heading ("SERUM/PLASMA GLUCOSE").
        emit(name, key, readSegmentBody(tokens.slice(seg.start + seg.nameLen, end)))
      })
      continue
    }

    // "Serum (3.4-5.4) mmol/L 3.3 5.3" under a heading that names the test.
    const firstWord = tokens[0]?.text.toLowerCase()
    if ((firstWord === 'serum' || firstWord === 'plasma') && heading) {
      const testName = heading.replace(/^SERUM\s*\/\s*PLASMA\s+/i, '').replace(/^(SERUM|PLASMA)\s+/i, '')
      const marker = findMarkerByAlias(testName)
      if (marker) {
        const parsed = readSegmentBody(tokens.slice(1))
        if (parsed.vals.length > 0) emit(marker.label, marker.key, parsed)
        continue
      }
    }

    // Stacked layout: name / "155 g/L" / "130-180 g/L" on successive lines.
    if (i + 1 < lines.length && tokens.length > 0 && tokens.length <= 5 && text.length <= 40 && /[A-Za-z]/.test(text) && !text.includes(':') && nameTokensOk(tokens)) {
      const nextText = cleanLineText(lines[i + 1])
      if (VALUE_LINE.test(nextText) && findDatesInText(nextText).length === 0) {
        const name = tokens.map((t) => t.text).join(' ')
        const marker = findMarkerExact(name) ?? findMarkerByAlias(name)
        const valueToks = normaliseTokens(lines[i + 1].tokens)
        const body = readSegmentBody(valueToks)
        // Collect the range lines that follow; prefer the one labelled "Normal".
        let j = i + 2
        const bands: string[] = []
        let normalBand = ''
        while (j < lines.length) {
          const raw = cleanLineText(lines[j])
          if (raw === '-' || raw === '') {
            j++
            break
          }
          if (!RANGE_LINE.test(raw) || VALUE_LINE.test(raw) === false && !/\d/.test(raw)) break
          const range = raw.match(/^(([<>]=?\s*)?-?\d+(\.\d+)?(\s*-\s*-?\d+(\.\d+)?)?\+?)/)
          if (!range) break
          bands.push(range[1])
          if (/\bNormal\b/i.test(raw)) normalBand = range[1]
          j++
        }
        const rangeText = body.rangeText || normalBand || bands[0] || ''
        if (body.vals.length > 0 && (marker || (/[\/%]/.test(body.unit) && rangeText))) {
          emit(marker?.label ?? name, marker?.key ?? null, { ...body, rangeText })
          if (!marker) unrecognised.add(name)
          i = j - 1
          continue
        }
      }
    }
  }

  if (datelessRows > 0) {
    warnings.push(
      `${datelessRows} result${datelessRows === 1 ? '' : 's'} skipped because no collection date was found - set the collection date, or include the "Collected" or "Date of Observation" line in what you paste.`,
    )
  }
  if (unrecognised.size > 0) {
    warnings.push(`Read but not matched to a known marker: ${[...unrecognised].join(', ')}.`)
  }
  return { results, warnings }
}
