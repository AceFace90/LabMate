export interface PositionedToken {
  text: string
  x: number
}

export interface Line {
  y: number
  tokens: PositionedToken[]
  text: string
}

interface RawTextItem {
  str: string
  transform: number[]
  width: number
}

/** Groups pdf.js text items into visual lines (by y) with per-token x positions. */
export function groupItemsIntoLines(items: RawTextItem[]): Line[] {
  const buckets: { y: number; tokens: PositionedToken[] }[] = []

  for (const item of items) {
    if (!item.str || !item.str.trim()) continue
    const y = item.transform[5]
    const x = item.transform[4]
    const width = item.width || 0

    // Split multi-word items into sub-tokens, spreading x proportionally across the item's width.
    const subTokens = splitWithOffsets(item.str)
    for (const sub of subTokens) {
      const subX = subTokens.length > 1 ? x + (sub.offset / item.str.length) * width : x
      addToken(buckets, y, { text: sub.text, x: subX })
    }
  }

  const lines: Line[] = buckets.map((b) => {
    const tokens = [...b.tokens].sort((a, b2) => a.x - b2.x)
    return { y: b.y, tokens, text: tokens.map((t) => t.text).join(' ') }
  })

  // pdf.js text space has y growing upward (origin bottom-left) - read top-to-bottom means descending y.
  lines.sort((a, b) => b.y - a.y)
  return lines
}

// Approximate width of one character in PDF points, so pasted text's character columns land
// on a similar x scale to a real PDF's and the parser's column alignment still works.
const PASTED_CHAR_WIDTH = 5

/**
 * Turns pasted report text into the same Line shape as a PDF, so it can go through the
 * same parser. Token x is the character column (tabs, as copied from web tables, expanded
 * to the next 8-column stop), which keeps monospaced/tabbed table columns aligned.
 */
export function textToLines(text: string): Line[] {
  const lines: Line[] = []
  const rows = joinStackedCells(joinLabelledCells(text.replace(/\r\n?/g, '\n').split('\n')))
  rows.forEach((row, i) => {
    let expanded = ''
    for (const ch of row) expanded += ch === '\t' ? ' '.repeat(8 - (expanded.length % 8)) + ' ' : ch
    const tokens = splitWithOffsets(expanded)
      .filter((t) => t.text.trim())
      .map((t) => ({ text: t.text, x: t.offset * PASTED_CHAR_WIDTH }))
    if (tokens.length === 0) return
    // Descending y, matching PDF line order (top of the page has the highest y).
    lines.push({ y: (rows.length - i) * 12, tokens, text: tokens.map((t) => t.text).join(' ') })
  })
  return lines
}

const STACKED_VALUE_RE = /^[<>]?\s*-?\d+(\.\d+)?\*{0,2}$/
const STACKED_RANGE_RE = /^(-?\d+(\.\d+)?\s*-\s*-?\d+(\.\d+)?|[<>]=?\s*-?\d+(\.\d+)?)$/
const STACKED_UNIT_RE = /^\S*[A-Za-z%µμ]\S*$/
const STACKED_FLAG_RE = /^[A-Z*]{1,2}$/

/**
 * Text copied from a table by macOS Live Text, or from some PDF viewers and web pages,
 * puts each cell on its own line ("Cystatin C" / "0.81" / "mg/L" / "0.59-1.03" / "N" / "F").
 * Rejoins those into one row per result so the normal row parsing applies. A name line
 * directly followed by a lone value starts a row; the unit, range and flag/status cells
 * that follow are pulled in, stopping at anything else or at a line that's itself
 * followed by a value (which is the next result's name). Lines already holding a whole
 * row are left as they are.
 */
function joinStackedCells(rows: string[]): string[] {
  const cells = rows.map((r) => r.trim())
  const isValue = (i: number) => i < cells.length && STACKED_VALUE_RE.test(cells[i])
  const out: string[] = []
  let i = 0
  while (i < rows.length) {
    if (!/[A-Za-z]/.test(cells[i]) || /\t| {2,}/.test(rows[i]) || !isValue(i + 1)) {
      out.push(rows[i])
      i++
      continue
    }
    const row = [cells[i], cells[i + 1]]
    let j = i + 2
    const take = (re: RegExp) => {
      if (j < cells.length && re.test(cells[j]) && !isValue(j + 1)) {
        row.push(cells[j])
        j++
        return true
      }
      return false
    }
    take(STACKED_UNIT_RE)
    take(STACKED_RANGE_RE)
    if (take(STACKED_FLAG_RE)) take(STACKED_FLAG_RE)
    out.push(row.join('  '))
    i = j
  }
  return out
}

const CELL_LABEL_RE = /^(Test|Results?|Units?|Ref(erence)?\.?\s*range|Flag|Status)\s*:?$/i

/**
 * Single-result portal reports read with macOS Live Text can come out as label/value
 * pairs ("Test" / "Cystatin C" / "Result" / "0.81" / "Units mg/L" / "Ref range" /
 * "0.59-1.03"). Collects those into one "name value unit range" row.
 */
function joinLabelledCells(rows: string[]): string[] {
  const cells = rows.map((r) => r.trim())
  const out: string[] = []
  let i = 0
  while (i < rows.length) {
    const name = cells[i + 1]
    if (!/^Test:?$/i.test(cells[i]) || !name || CELL_LABEL_RE.test(name)) {
      out.push(rows[i])
      i++
      continue
    }
    const fields = { value: '', unit: '', range: '' }
    let j = i + 2
    // The other labels follow within a few lines; anything unrecognised in between
    // (e.g. a stray "Results" heading) is skipped.
    for (let end = Math.min(cells.length, i + 12); j < end; j++) {
      const cell = cells[j]
      const inline = cell.match(/^(Result|Units?|Ref(?:erence)?\.?\s*range)\s*:?\s+(.+)$/i)
      const label = inline ? inline[1] : CELL_LABEL_RE.test(cell) ? cell.replace(/:$/, '') : null
      if (!label) continue
      const key = /^result$/i.test(label) ? 'value' : /^unit/i.test(label) ? 'unit' : /^ref/i.test(label) ? 'range' : null
      if (!key) continue
      if (inline) fields[key] = inline[2]
      else if (j + 1 < cells.length && !CELL_LABEL_RE.test(cells[j + 1])) fields[key] = cells[++j]
      if (fields.value && fields.unit && fields.range) break
    }
    if (!fields.value) {
      out.push(rows[i])
      i++
      continue
    }
    out.push([name, fields.value, fields.unit, fields.range].filter(Boolean).join('  '))
    i = j + 1
  }
  return out
}

function addToken(buckets: { y: number; tokens: PositionedToken[] }[], y: number, token: PositionedToken) {
  const bucket = buckets.find((b) => Math.abs(b.y - y) <= 2)
  if (bucket) {
    bucket.tokens.push(token)
  } else {
    buckets.push({ y, tokens: [token] })
  }
}

function splitWithOffsets(str: string): { text: string; offset: number }[] {
  const matches = [...str.matchAll(/\S+/g)]
  return matches.length ? matches.map((m) => ({ text: m[0], offset: m.index ?? 0 })) : [{ text: str, offset: 0 }]
}
