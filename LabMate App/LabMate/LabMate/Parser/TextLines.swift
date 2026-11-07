import Foundation

// Port of src/lib/textLines.ts.

nonisolated struct PositionedToken: Sendable, Equatable {
    var text: String
    /// Horizontal position in PDF points (left edge of the token).
    var x: Double
}

nonisolated struct Line: Sendable, Equatable {
    var y: Double
    var tokens: [PositionedToken]
    var text: String
}

/// The subset of a pdf.js text item the parser uses: the string, its origin
/// (`transform[4]`, `transform[5]`: x from the left, y from the bottom, PDF points) and width.
nonisolated struct RawTextItem: Sendable {
    var str: String
    var x: Double
    var y: Double
    var width: Double
    /// Glyph-box height in the same units (0 when unknown). Only the photo path uses it, to size the line tolerance.
    var height: Double = 0
}

nonisolated enum TextLines {
    // Approximate width of one character in PDF points, so pasted text's character columns land
    // on a similar x scale to a real PDF's and the parser's column alignment still works.
    static let pastedCharWidth = 5.0

    private static let stackedValue = Rx(#"^[<>]?\s*-?\d+(\.\d+)?\*{0,2}\z"#)
    private static let stackedRange = Rx(#"^(-?\d+(\.\d+)?\s*-\s*-?\d+(\.\d+)?|[<>]=?\s*-?\d+(\.\d+)?)\z"#)
    private static let stackedUnit = Rx(#"^\S*[A-Za-z%µμ]\S*\z"#)
    private static let stackedFlag = Rx(#"^[A-Z*]{1,2}\z"#)
    private static let hasLetter = Rx(#"[A-Za-z]"#)
    private static let tabOrWideGap = Rx(#"\t| {2,}"#)

    private static let cellLabel = Rx(#"^(Test|Results?|Units?|Ref(erence)?\.?\s*range|Flag|Status)\s*:?\z"#, ignoreCase: true)
    private static let testLabel = Rx(#"^Test:?\z"#, ignoreCase: true)
    private static let inlineLabel = Rx(#"^(Result|Units?|Ref(?:erence)?\.?\s*range)\s*:?\s+(.+)\z"#, ignoreCase: true)
    private static let resultKey = Rx(#"^result\z"#, ignoreCase: true)
    private static let unitKey = Rx(#"^unit"#, ignoreCase: true)
    private static let refKey = Rx(#"^ref"#, ignoreCase: true)
    private static let trailingColon = Rx(#":\z"#)

    /// Groups pdf.js text items into visual lines (by y) with per-token x positions.
    /// `yTolerance` is 2 PDF points in the original; the photo path passes a different value.
    static func groupItemsIntoLines(_ items: [RawTextItem], yTolerance: Double = 2) -> [Line] {
        struct Bucket { var y: Double; var tokens: [PositionedToken] }
        var buckets: [Bucket] = []

        for item in items {
            if item.str.isEmpty || JS.trim(item.str).isEmpty { continue }
            let y = item.y
            let x = item.x
            let width = item.width

            // Split multi-word items into sub-tokens, spreading x proportionally across the item's width.
            let subTokens = splitWithOffsets(item.str)
            let strLength = Double(item.str.utf16.count)
            for sub in subTokens {
                let subX = subTokens.count > 1 ? x + (Double(sub.offset) / strLength) * width : x
                let token = PositionedToken(text: sub.text, x: subX)
                if let bi = buckets.firstIndex(where: { abs($0.y - y) <= yTolerance }) {
                    buckets[bi].tokens.append(token)
                } else {
                    buckets.append(Bucket(y: y, tokens: [token]))
                }
            }
        }

        var lines: [Line] = buckets.map { b in
            // Stable sort by x (JS Array.prototype.sort is stable).
            let tokens = b.tokens.enumerated()
                .sorted { $0.element.x != $1.element.x ? $0.element.x < $1.element.x : $0.offset < $1.offset }
                .map(\.element)
            return Line(y: b.y, tokens: tokens, text: tokens.map(\.text).joined(separator: " "))
        }

        // pdf.js text space has y growing upward (origin bottom-left) - read top-to-bottom means descending y.
        lines = lines.enumerated()
            .sorted { $0.element.y != $1.element.y ? $0.element.y > $1.element.y : $0.offset < $1.offset }
            .map(\.element)
        return lines
    }

    /// Turns pasted report text into the same Line shape as a PDF, so it can go through the
    /// same parser. Token x is the character column (tabs, as copied from web tables, expanded
    /// to the next 8-column stop), which keeps monospaced/tabbed table columns aligned.
    static func textToLines(_ text: String) -> [Line] {
        var lines: [Line] = []
        let normalised = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let rows = joinStackedCells(joinLabelledCells(normalised.components(separatedBy: "\n")))
        for (i, row) in rows.enumerated() {
            var expanded = ""
            var expandedLength = 0 // UTF-16 length, as JS `expanded.length`
            for ch in row.unicodeScalars {
                if ch == "\t" {
                    let pad = String(repeating: " ", count: 8 - (expandedLength % 8)) + " "
                    expanded += pad
                    expandedLength += pad.utf16.count
                } else {
                    expanded.unicodeScalars.append(ch)
                    expandedLength += ch.utf16.count
                }
            }
            let tokens = splitWithOffsets(expanded)
                .filter { !JS.trim($0.text).isEmpty }
                .map { PositionedToken(text: $0.text, x: Double($0.offset) * pastedCharWidth) }
            if tokens.isEmpty { continue }
            // Descending y, matching PDF line order (top of the page has the highest y).
            lines.append(Line(y: Double((rows.count - i) * 12), tokens: tokens, text: tokens.map(\.text).joined(separator: " ")))
        }
        return lines
    }

    /// Text copied from a table by macOS Live Text, or from some PDF viewers and web pages,
    /// puts each cell on its own line ("Cystatin C" / "0.81" / "mg/L" / "0.59-1.03" / "N" / "F").
    /// Rejoins those into one row per result so the normal row parsing applies. A name line
    /// directly followed by a lone value starts a row; the unit, range and flag/status cells
    /// that follow are pulled in, stopping at anything else or at a line that's itself
    /// followed by a value (which is the next result's name). Lines already holding a whole
    /// row are left as they are.
    static func joinStackedCells(_ rows: [String]) -> [String] {
        let cells = rows.map(JS.trim)
        func isValue(_ i: Int) -> Bool { i < cells.count && stackedValue.test(cells[i]) }
        var out: [String] = []
        var i = 0
        while i < rows.count {
            if !hasLetter.test(cells[i]) || tabOrWideGap.test(rows[i]) || !isValue(i + 1) {
                out.append(rows[i])
                i += 1
                continue
            }
            var row = [cells[i], cells[i + 1]]
            var j = i + 2
            func take(_ re: Rx) -> Bool {
                if j < cells.count && re.test(cells[j]) && !isValue(j + 1) {
                    row.append(cells[j])
                    j += 1
                    return true
                }
                return false
            }
            _ = take(stackedUnit)
            _ = take(stackedRange)
            if take(stackedFlag) { _ = take(stackedFlag) }
            out.append(row.joined(separator: "  "))
            i = j
        }
        return out
    }

    /// Single-result portal reports read with macOS Live Text can come out as label/value
    /// pairs ("Test" / "Cystatin C" / "Result" / "0.81" / "Units mg/L" / "Ref range" /
    /// "0.59-1.03"). Collects those into one "name value unit range" row.
    static func joinLabelledCells(_ rows: [String]) -> [String] {
        let cells = rows.map(JS.trim)
        var out: [String] = []
        var i = 0
        while i < rows.count {
            let name: String? = i + 1 < cells.count ? cells[i + 1] : nil
            if !testLabel.test(cells[i]) || name == nil || name!.isEmpty || cellLabel.test(name!) {
                out.append(rows[i])
                i += 1
                continue
            }
            var value = "", unit = "", range = ""
            var j = i + 2
            // The other labels follow within a few lines; anything unrecognised in between
            // (e.g. a stray "Results" heading) is skipped.
            let end = min(cells.count, i + 12)
            while j < end {
                // (j is advanced by hand: a `break` below must leave it on the last label read.)
                let cell = cells[j]
                let inline = inlineLabel.first(cell)
                let label: String?
                if let inline {
                    label = inline[1]
                } else if cellLabel.test(cell) {
                    label = trailingColon.replacingFirst(in: cell, with: "")
                } else {
                    label = nil
                }
                guard let label else { j += 1; continue }
                let key: Int? = resultKey.test(label) ? 0 : unitKey.test(label) ? 1 : refKey.test(label) ? 2 : nil
                guard let key else { j += 1; continue }
                var text: String?
                if let inline {
                    text = inline[2]
                } else if j + 1 < cells.count && !cellLabel.test(cells[j + 1]) {
                    j += 1
                    text = cells[j]
                }
                if let text {
                    switch key {
                    case 0: value = text
                    case 1: unit = text
                    default: range = text
                    }
                }
                if !value.isEmpty && !unit.isEmpty && !range.isEmpty { break }
                j += 1
            }
            if value.isEmpty {
                out.append(rows[i])
                i += 1
                continue
            }
            out.append([name!, value, unit, range].filter { !$0.isEmpty }.joined(separator: "  "))
            i = j + 1
        }
        return out
    }

    /// `str.matchAll(/\S+/g)` with UTF-16 offsets; a string with no non-space run comes back whole.
    static func splitWithOffsets(_ str: String) -> [(text: String, offset: Int)] {
        let u = Array(str.utf16)
        var out: [(text: String, offset: Int)] = []
        var i = 0
        while i < u.count {
            if JS.isSpace(u[i]) { i += 1; continue }
            let start = i
            while i < u.count && !JS.isSpace(u[i]) { i += 1 }
            out.append((String(decoding: u[start..<i], as: UTF16.self), start))
        }
        return out.isEmpty ? [(str, 0)] : out
    }
}
