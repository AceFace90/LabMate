import Foundation

// Port of src/lib/anchoredParser.ts - KEEP IN SYNC (see PARSER_SYNC.md at the repo root).
//
// Marker-anchored parsing: instead of matching one fixed row layout, find known marker names
// and read the value / unit / range that sit around them - on the same line, in several
// side-by-side segments, or stacked on the lines below. Dates are found separately, in any
// common format, and attached by label or column. Used when the layout-specific parsers in
// LabReportParser recognise nothing.

nonisolated enum AnchoredParser {
    private static let numRx = Rx(#"^-?\d+(\.\d+)?\z"#)
    private static let opRx = Rx(#"^(<=|>=|<|>)\z"#)
    private static let rangeTokenRx = Rx(#"^-?\d+(\.\d+)?-\d+(\.\d+)?\z"#)
    private static let flagRx = Rx(#"^(H|L|HH|LL|\*{1,2})\z"#)
    private static let bulletRx = Rx(#"^[•·●▪◦*]\z"#)
    private static let parenRx = Rx(#"^([^(]+)(\(.*)\z"#)
    private static let gluedOpRx = Rx(#"^(<=|>=|<|>)(\d.*)\z"#)
    private static let maxDigits = 6
    private static let charW = 5.0

    struct Tok { var text: String; var x: Double }

    private static func len(_ s: String) -> Double { Double(s.utf16.count) }

    /// Splits glued pieces ("Phos(40-120)", "<5.0"), drops bullets, and normalises "x10*9" to "x10^9".
    private static func normaliseTokens(_ tokens: [PositionedToken]) -> [Tok] {
        var out: [Tok] = []
        for t in tokens {
            let text = t.text.replacingOccurrences(of: "x10*", with: "x10^", options: .caseInsensitive)
            if bulletRx.test(text) && text != "*" { continue }
            if let m = parenRx.first(text) {
                out.append(Tok(text: m[1]!, x: t.x))
                out.append(Tok(text: m[2]!, x: t.x + len(m[1]!) * charW))
                continue
            }
            if let m = gluedOpRx.first(text) {
                out.append(Tok(text: m[1]!, x: t.x))
                out.append(Tok(text: m[2]!, x: t.x + len(m[1]!) * charW))
                continue
            }
            out.append(Tok(text: text, x: t.x))
        }
        return out
    }

    private static let betweenRx = Rx(#"(-?\d+\.?\d*)\s*-\s*(-?\d+\.?\d*)"#)
    private static let boundRx = Rx(#"([<>])=?\s*(-?\d+\.?\d*)"#)

    private static func parseRange(_ text: String) -> (low: Double?, high: Double?) {
        if let m = betweenRx.first(text) { return (JS.number(m[1]!), JS.number(m[2]!)) }
        if let m = boundRx.first(text) {
            let n = JS.number(m[2]!)
            return m[1] == ">" ? (n, nil) : (nil, n)
        }
        return (nil, nil)
    }

    private static func slugify(_ name: String) -> String {
        var out = ""
        var inRun = false
        for u in JS.trim(name).lowercased().unicodeScalars {
            if (u >= "a" && u <= "z") || (u >= "0" && u <= "9") {
                out.unicodeScalars.append(u)
                inRun = false
            } else if !inRun {
                out.append("_")
                inRun = true
            }
        }
        if out.hasPrefix("_") { out.removeFirst() }
        if out.hasSuffix("_") { out.removeLast() }
        return out
    }

    struct Val { var value: Double; var display: String; var x: Double; var op: String }
    struct Parsed { var vals: [Val]; var unit: String; var rangeText: String }

    private static func make(_ fileName: String, _ name: String, _ markerKey: String, _ date: String,
                             _ v: Val, _ unit: String, _ rangeText: String) -> MarkerResult {
        let range = parseRange(rangeText)
        return MarkerResult(
            id: UUID().uuidString.lowercased(), markerKey: markerKey, rawName: name, date: date, value: v.value,
            displayValue: v.display, flag: .none, rangeLow: range.low, rangeHigh: range.high,
            rangeText: (range.low != nil || range.high != nil) ? rangeText : "", unit: unit,
            sourceFile: fileName, panel: "", addedManually: false, derived: nil,
            createdAt: ISO8601DateFormatter().string(from: Date()))
    }

    private struct DateColumn { var iso: String; var x: Double }

    private static let dateCollectedRx = Rx(#"^Date\s+Collected\b"#, ignoreCase: true)

    /// "Date Collected 16 May 24 10 Sep 25 10 Nov 26" -> one column per date, with its x position.
    private static func readDateColumns(_ line: Line) -> [DateColumn]? {
        if !dateCollectedRx.test(JS.trim(line.text)) { return nil }
        let found = DateUtils.findDatesInText(line.text)
        if found.isEmpty { return nil }
        var offsets: [(start: Int, end: Int, tok: PositionedToken)] = []
        var pos = 0
        for tok in line.tokens {
            let n = tok.text.utf16.count
            offsets.append((pos, pos + n, tok))
            pos += n + 1
        }
        return found.map { f in
            let hit = offsets.filter { $0.start < f.index + f.length && f.index < $0.end }
            var x = 0.0
            if let first = hit.first?.tok, let last = hit.last?.tok {
                x = (first.x + last.x + len(last.text) * charW) / 2
            }
            return DateColumn(iso: f.iso, x: x)
        }
    }

    private static let labelRx = Rx(#"(collect|observation|test date|date taken|specimen date)"#, ignoreCase: true)
    private static let rejectRx = Rx(#"(report|receiv|request|birth|dob)"#, ignoreCase: true)

    private static func slice(_ s: String, from: Int, to: Int? = nil) -> String {
        let ns = s as NSString
        let end = min(to ?? ns.length, ns.length)
        if from >= end { return "" }
        return ns.substring(with: NSRange(location: from, length: end - from))
    }

    /// The report's collection date: a date on (or just after) a "collected / observation / test date" label.
    private static func findReportDate(_ lines: [Line]) -> String? {
        for i in 0..<lines.count {
            let text = lines[i].text
            guard let lm = labelRx.first(text) else { continue }
            let from = lm.index
            var seg = slice(text, from: from)
            if let cut = rejectRx.first(seg)?.index, cut > 0 { seg = slice(seg, from: 0, to: cut) }
            var d = DateUtils.findDatesInText(seg).first
            if d == nil, i + 1 < lines.count,
               !rejectRx.test(slice(slice(lines[i].text, from: from), from: 0, to: 12)) {
                d = DateUtils.findDatesInText(lines[i + 1].text).first
            }
            if let d { return d.iso }
        }
        return nil
    }

    private struct Segment { var start: Int; var nameLen: Int; var name: String; var markerKey: String? }

    private static func nameTokensOk(_ toks: ArraySlice<Tok>) -> Bool {
        toks.allSatisfy { !numRx.test($0.text) && !opRx.test($0.text) && !$0.text.hasPrefix("(") && !flagRx.test($0.text) }
    }

    private static func findSegments(_ tokens: [Tok]) -> [Segment] {
        var segs: [Segment] = []
        var i = 0
        while i < tokens.count {
            var n = 3
            while n >= 1 {
                defer { n -= 1 }
                if i + n >= tokens.count { continue }
                let nameToks = tokens[i..<(i + n)]
                if !nameTokensOk(nameToks) { continue }
                var name = nameToks.map(\.text).joined(separator: " ")
                if name.hasSuffix(":") { name.removeLast() }
                let marker = MarkerCatalog.findExact(name)
                let next = tokens[i + n].text
                let unitThenValue = next.contains("/") && i + n + 1 < tokens.count
                    && (numRx.test(tokens[i + n + 1].text) || opRx.test(tokens[i + n + 1].text))
                if let marker, numRx.test(next) || opRx.test(next) || next.hasPrefix("(") || unitThenValue {
                    segs.append(Segment(start: i, nameLen: n, name: name, markerKey: marker.key))
                    i += n - 1
                    break
                }
            }
            i += 1
        }
        return segs
    }

    private static func readSegmentBody(_ body: [Tok]) -> Parsed {
        var vals: [Val] = []
        var unitParts: [String] = []
        var rangeText = ""
        var pendingOp = ""
        var lastWasUnit = false
        var j = 0
        while j < body.count {
            defer { j += 1 }
            let t = body[j].text
            if t.hasPrefix("(") {
                var parts = [t]
                while !parts[parts.count - 1].hasSuffix(")") && j + 1 < body.count {
                    j += 1
                    parts.append(body[j].text)
                }
                rangeText = JS.trim(parts.joined(separator: " ").replacingOccurrences(of: "(", with: "").replacingOccurrences(of: ")", with: ""))
                lastWasUnit = false
                continue
            }
            if opRx.test(t) { pendingOp = t; lastWasUnit = false; continue }
            if rangeTokenRx.test(t) && !vals.isEmpty {
                if rangeText.isEmpty { rangeText = t }
                lastWasUnit = false
                continue
            }
            if numRx.test(t) {
                if t.filter({ $0 != "." && $0 != "-" }).count <= maxDigits {
                    vals.append(Val(value: JS.number(t), display: pendingOp.isEmpty ? t : "\(pendingOp) \(t)", x: body[j].x, op: pendingOp))
                }
                pendingOp = ""
                lastWasUnit = false
                continue
            }
            if flagRx.test(t) { lastWasUnit = false; continue }
            if unitParts.isEmpty || lastWasUnit {
                unitParts.append(t)
                lastWasUnit = true
            } else {
                lastWasUnit = false
            }
        }
        return Parsed(vals: vals, unit: unitParts.joined(), rangeText: rangeText)
    }

    private static let valueLineRx = Rx(#"^[<>]?=?\s*\d+(\.\d+)?(\s+[^\d\s-].*)?\z"#)
    private static let rangeLineRx = Rx(#"^(([<>]=?\s*)?-?\d+(\.\d+)?(\s*-\s*-?\d+(\.\d+)?)?)(\s+\S+)*\z"#)
    private static let rangeCaptureRx = Rx(#"^(([<>]=?\s*)?-?\d+(\.\d+)?(\s*-\s*-?\d+(\.\d+)?)?\+?)"#)
    private static let normalRx = Rx(#"\bNormal\b"#, ignoreCase: true)
    private static let headingRx = Rx(#"^[A-Z][A-Z\s/&-]{4,}\z"#)
    private static let hasLetterRx = Rx(#"[A-Za-z]"#)
    private static let digitRx = Rx(#"\d"#)
    private static let unitSymbolRx = Rx(#"[/%]"#)
    private static let headingStripA = Rx(#"^SERUM\s*/\s*PLASMA\s+"#, ignoreCase: true)
    private static let headingStripB = Rx(#"^(SERUM|PLASMA)\s+"#, ignoreCase: true)

    private static func cleanLineText(_ line: Line) -> String {
        normaliseTokens(line.tokens).map(\.text).joined(separator: " ")
    }

    static func parse(fileName: String, lines: [Line], defaultDate: String?) -> ParseOutcome {
        var results: [MarkerResult] = []
        var warnings: [String] = []
        let reportDate = findReportDate(lines) ?? defaultDate
        var columns: [DateColumn]?
        var heading = ""
        var datelessRows = 0
        var unrecognised: [String] = []

        func emit(_ name: String, _ markerKey: String?, _ parsed: Parsed) {
            let marker = markerKey != nil ? MarkerCatalog.findExact(name) : nil
            let key = markerKey ?? "unmatched:\(slugify(name))"
            let unit = parsed.unit.isEmpty ? (marker?.defaultUnit ?? "") : parsed.unit
            if let cols = columns, cols.count > 1 {
                // Same count -> trust print order; sparse rows -> nearest column by x.
                let useOrder = parsed.vals.count == cols.count
                for (k, v) in parsed.vals.enumerated() {
                    let centre = v.x + len(v.display) * charW / 2
                    let col = useOrder ? cols[k] : cols.dropFirst().reduce(cols[0]) {
                        abs($1.x - centre) < abs($0.x - centre) ? $1 : $0
                    }
                    results.append(make(fileName, name, key, col.iso, v, unit, parsed.rangeText))
                }
                return
            }
            guard let date = columns?.first?.iso ?? reportDate else {
                datelessRows += 1
                return
            }
            guard let first = parsed.vals.first else { return }
            var rangeText = parsed.rangeText
            if rangeText.isEmpty, let bound = parsed.vals.dropFirst().first(where: { !$0.op.isEmpty }) {
                rangeText = bound.display
            }
            results.append(make(fileName, name, key, date, first, unit, rangeText))
        }

        var i = 0
        while i < lines.count {
            defer { i += 1 }
            let line = lines[i]
            let text = JS.trim(line.text)
            if text.isEmpty { continue }

            if let cols = readDateColumns(line) {
                columns = cols
                continue
            }
            if headingRx.test(text) { heading = text }

            let tokens = normaliseTokens(line.tokens)

            // Side-by-side segments: "Hb 155 g/L (130-180)   WBC 6.0 x10^9/L (4.0-11.0)".
            let segs = findSegments(tokens)
            if !segs.isEmpty {
                for (si, seg) in segs.enumerated() {
                    let end = si + 1 < segs.count ? segs[si + 1].start : tokens.count
                    emit(seg.name, seg.markerKey, readSegmentBody(Array(tokens[(seg.start + seg.nameLen)..<end])))
                }
                continue
            }

            // "Serum (3.4-5.4) mmol/L 3.3 5.3" under a heading that names the test.
            let firstWord = tokens.first?.text.lowercased()
            if (firstWord == "serum" || firstWord == "plasma") && !heading.isEmpty {
                let testName = headingStripB.replacingFirst(in: headingStripA.replacingFirst(in: heading, with: ""), with: "")
                if let marker = MarkerCatalog.find(alias: testName) {
                    let parsed = readSegmentBody(Array(tokens.dropFirst()))
                    if !parsed.vals.isEmpty { emit(marker.label, marker.key, parsed) }
                    continue
                }
            }

            // Stacked layout: name / "155 g/L" / "130-180 g/L" on successive lines.
            if i + 1 < lines.count, !tokens.isEmpty, tokens.count <= 5, text.utf16.count <= 40,
               hasLetterRx.test(text), !text.contains(":"), nameTokensOk(tokens[...]) {
                let nextText = cleanLineText(lines[i + 1])
                if valueLineRx.test(nextText) && DateUtils.findDatesInText(nextText).isEmpty {
                    let name = tokens.map(\.text).joined(separator: " ")
                    let marker = MarkerCatalog.findExact(name) ?? MarkerCatalog.find(alias: name)
                    let body = readSegmentBody(normaliseTokens(lines[i + 1].tokens))
                    // Collect the range lines that follow; prefer the one labelled "Normal".
                    var j = i + 2
                    var bands: [String] = []
                    var normalBand = ""
                    while j < lines.count {
                        let raw = cleanLineText(lines[j])
                        if raw == "-" || raw.isEmpty { j += 1; break }
                        if !rangeLineRx.test(raw) || (!valueLineRx.test(raw) && !digitRx.test(raw)) { break }
                        guard let range = rangeCaptureRx.first(raw) else { break }
                        bands.append(range[1]!)
                        if normalRx.test(raw) { normalBand = range[1]! }
                        j += 1
                    }
                    let rangeText = !body.rangeText.isEmpty ? body.rangeText : (!normalBand.isEmpty ? normalBand : (bands.first ?? ""))
                    if !body.vals.isEmpty && (marker != nil || (unitSymbolRx.test(body.unit) && !rangeText.isEmpty)) {
                        var parsed = body
                        parsed.rangeText = rangeText
                        emit(marker?.label ?? name, marker?.key, parsed)
                        if marker == nil, !unrecognised.contains(name) { unrecognised.append(name) }
                        i = j - 1
                        continue
                    }
                }
            }
        }

        if datelessRows > 0 {
            warnings.append(
                "\(datelessRows) result\(datelessRows == 1 ? "" : "s") skipped because no collection date was found - set the collection date, or include the \"Collected\" or \"Date of Observation\" line in what you paste.")
        }
        if !unrecognised.isEmpty {
            warnings.append("Read but not matched to a known marker: \(unrecognised.joined(separator: ", ")).")
        }
        return ParseOutcome(results: results, warnings: warnings)
    }
}
