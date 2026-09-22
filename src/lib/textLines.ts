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
