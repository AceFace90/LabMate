import Foundation

// Port of src/lib/pdfParser.ts: a line-based state machine over positioned text tokens.
// Every type here is `nonisolated` so parsing runs off the main actor
// (the target's default isolation is MainActor).

nonisolated enum LabReportParser {
    // Regexes are written as the JS literals were. See `Rx` for the JS-vs-ICU differences
    // (ASCII-only \d, and `\z` in place of JS's end-of-input `$`).
    private static let dateRe = Rx(#"^\d{1,2}\/\d{1,2}\/\d{2,4}\z"#)
    private static let flagRe = Rx(#"^\*{1,2}\z"#)
    private static let opRe = Rx(#"^[<>]\z"#)
    private static let numberRe = Rx(#"^-?\d+(\.\d+)?\z"#)
    private static let dashLineRe = Rx(#"^-{5,}\z"#)
    private static let footerCodeLineRe = Rx(#"^([A-Z]{2,4}\d?-[A-Z0-9]\s*){3,}"#)
    private static let skipLinePrefixRe = Rx(#"^(Date|Time|Coll\.\s*Time|Lab Number|Lab#|Request):"#, ignoreCase: true)
    // Repeated page letterhead / patient-header lines. These reappear at the top of every
    // page and must reset any in-progress table state, or ID numbers and addresses on them
    // get misread as data rows (e.g. a Medicare number bucketed into a wide-table column).
    private static let pageResetRe = Rx(
        #"^(Page\s+\d+\s+of\s+\d+|Laboratory:|Addressee:|Your Reference:|Phone:|Birthdate:|Fax:|Copy to:|CC DRS:|PANEL CODES:|(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}|All tests on this request)"#,
        ignoreCase: true)
    // Column-label lines in single-result reports ("Collection Time 09:05", "Request 26-...",
    // "Units Reference Range", the patient footer) - never data rows.
    private static let headerLabelLineRe = Rx(#"^(PATIENT:|Collection Time\s|Request\s+\d|Units\s+(Reference\s+)?Range)"#, ignoreCase: true)
    // A comment paragraph keyed by its lab number ("46441897 Normal ACR.") - ends the table above.
    private static let labNumberCommentRe = Rx(#"^#?\d{7,}\s+[A-Za-z]"#)
    private static let timeRe = Rx(#"^(\d{1,2}:\d{2}(:\d{2})?|NS)\z"#)
    private static let labNumberRe = Rx(#"^#?\d{6,}\z"#)
    // A sane upper bound on digit count for a numeric wide-table value - lab results are
    // short (e.g. "149", "4.99"); phone/Medicare/reference numbers on letterhead are not.
    private static let maxValueDigits = 6

    // Other literals used inline in the TS source.
    private static let bareDateRe = Rx(#"^(\d{1,2}\/\d{1,2}\/\d{2,4})(\s+\d{1,2}:\d{2}(:\d{2})?)?\z"#)
    private static let startOfDocumentRe = Rx(#"^Start of Document\z"#, ignoreCase: true)
    private static let endOfDocumentRe = Rx(#"^End of Document\z"#, ignoreCase: true)
    private static let specimenHeadingRe = Rx(#"^(.*?)\s*SPECIMEN:\s*(.+)\z"#)
    private static let panelNameLineRe = Rx(#"^[A-Z0-9 /&()-]+\z"#)
    private static let nameOfTestRe = Rx(#"Name of Test:\s*(.+)"#, ignoreCase: true)
    private static let otherTestsRe = Rx(#"^This request has other tests"#, ignoreCase: true)
    private static let recommendedTargetsRe = Rx(#"^Recommended targets?\b"#, ignoreCase: true)
    private static let deficiencyRiskRe = Rx(#"deficiency risk"#, ignoreCase: true)
    private static let fastingRe = Rx(#"^Fasting\s+(-?\d+\.?\d*)\s*-\s*(-?\d+\.?\d*)"#, ignoreCase: true)
    private static let dateOnlyTokenRe = Rx(#"^Date\z"#, ignoreCase: true)
    private static let collectionTypeRe = Rx(#"Collection Type"#, ignoreCase: true)
    private static let labHashTokenRe = Rx(#"^Lab#\z"#, ignoreCase: true)
    private static let noTokenRe = Rx(#"^No\.?\z"#, ignoreCase: true)
    private static let labOrReqTokenRe = Rx(#"^(Lab|Req\.?)\z"#, ignoreCase: true)
    private static let headerUnitsTokenRe = Rx(#"^(Units|Ref\.?|Range|Reference)\z"#, ignoreCase: true)
    private static let unitOnlyRe = Rx(#"^\(([^)]+)\)\z"#)
    private static let refRangeLineRe = Rx(#"^Ref\.?\s*Range"#, ignoreCase: true)
    private static let parenGroupRe = Rx(#"\(([^)]*)\)"#)
    private static let unitsRowRe = Rx(#"^Units\b"#, ignoreCase: true)
    private static let referenceRangesRowRe = Rx(#"^Reference Ranges?\b"#, ignoreCase: true)
    private static let referenceRangesSpaceRe = Rx(#"^Reference Ranges?\s"#, ignoreCase: true)
    private static let collectedRe = Rx(#"Collected:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})"#, ignoreCase: true)
    private static let labelledDateRe = Rx(
        #"^Date (?:of )?(Observation|Collection|Requested|Received|Reported|of Message)\b[^:]*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})?"#,
        ignoreCase: true)
    private static let observationOrCollectionRe = Rx(#"observation|collection"#, ignoreCase: true)
    private static let labHashRe = Rx(#"Lab#"#, ignoreCase: true)
    private static let specimenTokenRe = Rx(#"^Specimen\z"#, ignoreCase: true)
    private static let longRangeRowRe = Rx(#"^(.+?)\s+(-?\d+\.?\d*)\s*-\s*(-?\d+\.?\d*)\s*(\S+)\z"#)
    private static let longTableEndRe = Rx(#"^This request has other tests|^\s*\z"#)
    private static let dateHeaderTokenRe = Rx(#"^Date:?\z"#, ignoreCase: true)
    private static let dateColonRe = Rx(#"^Date:"#, ignoreCase: true)
    private static let commentsRe = Rx(#"^Comments:"#, ignoreCase: true)
    private static let seeBelowRe = Rx(#"see below"#, ignoreCase: true)
    private static let hasDigitRe = Rx(#"\d"#)
    private static let parenWrappedRe = Rx(#"^\(.*\)\z"#)
    private static let valueTokenRe = Rx(#"^([<>]?)(-?\d+(?:\.\d+)?)(\*{0,2})\z"#)
    private static let unbracketedRowRe = Rx(
        #"^([A-Za-z][A-Za-z0-9 ./\-]*?)\s+([<>]?\s*-?\d+(?:\.\d+)?\*{0,2})\s+(\S*[A-Za-z%µμ]\S*)\s+(-?\d+(?:\.\d+)?\s*-\s*-?\d+(?:\.\d+)?|[<>]=?\s*-?\d+(?:\.\d+)?|see below)(?:\s+[A-Z]{1,2}){0,2}\z"#,
        ignoreCase: true)
    private static let singleValueRe = Rx(
        #"^([A-Za-z][A-Za-z0-9 ./\-]*(?:\([A-Za-z0-9]+\))?)\s+([<>]?\s*-?\d+(?:\.\d+)?)\s*([A-Za-z%/^0-9.]*)\s*\(([^)]*)\)\s*\z"#)
    private static let bareRatioRe = Rx(#"^([A-Za-z][A-Za-z0-9 ./\-]*\bRatio)\s+(-?\d+(?:\.\d+)?)\z"#, ignoreCase: true)
    private static let betweenRe = Rx(#"(-?\d+\.?\d*)\s*-\s*(-?\d+\.?\d*)"#)
    private static let boundedRe = Rx(#"^[^\d]*([<>])\s*(-?\d+\.?\d*)"#)
    private static let urineRe = Rx(#"urine"#, ignoreCase: true)

    // MARK: - Table state

    // Column-style single-panel table (e.g. INSULIN STUDIES): a "Date Time Request <Marker...>"
    // header, one row per collection date with values under each marker column, then
    // "Units" and "Reference Ranges" rows aligned to the same columns.
    private struct ColumnTableState {
        struct Column { var x: Double; var name: String; var unit: String; var rangeText: String }
        struct Row { var date: String; var values: [(colIdx: Int, text: String)] }
        var headerTokens: [PositionedToken]
        var columns: [Column]
        var rows: [Row]
        var panel: String
    }

    private struct HistoryValue {
        var value: Double
        var displayValue: String
        var flag: ResultFlag
        var x: Double
    }

    // Per-marker history table (e.g. CRP, HbA1c, Vitamin D): a "Date [Time] Lab No. <Marker...>"
    // header, then one row per collection date: date, optional time, lab number, value(s),
    // and - usually only on the latest row - the unit and "(range)".
    private struct HistoryTableState {
        struct Row { var date: String; var values: [HistoryValue]; var unit: String; var rangeText: String }
        var header: [PositionedToken]
        var rangeTexts: [String]
        var unit: String
        var rows: [Row]
        var panel: String
    }

    private struct LongTableState {
        struct Row { var date: String; var value: Double; var collectionType: String }
        struct Range { var low: Double; var high: Double; var unit: String }
        var markerKey: String?
        var rawName: String
        var unit: String
        var panel: String
        var rows: [Row]
        var ranges: [String: Range]
    }

    private struct WideTableState {
        var dates: [(iso: String, x: Double)]
    }

    // MARK: - State machine

    /// `defaultDate` (ISO) files results under that date until the text gives its own - used for pasted text.
    static func runStateMachine(fileName: String, lines: [Line], defaultDate: String? = nil) -> ParseOutcome {
        var results: [MarkerResult] = []
        var warnings: [String] = []

        var currentPanel = ""
        var currentCollectedDate: String? = (defaultDate?.isEmpty ?? true) ? nil : defaultDate
        // Rows that looked like results but had no collection date to file them under.
        var datelessRows = 0
        var awaitingObservationDate = false
        var wideTable: WideTableState?
        var longTable: LongTableState?
        var columnTable: ColumnTableState?
        var historyTable: HistoryTableState?
        // Specimen from the panel heading ("URINE ALBUMIN STUDIES  SPECIMEN: URINE") - a urine
        // "Albumin" or "Creatinine" is a different test from the blood marker of the same name.
        var currentSpecimen = ""
        // My Health Record exports append a "Start of Document ... End of Document" summary
        // after the lab's own pages - metadata only, no results.
        var inRecordSummary = false
        func lookupMarker(_ name: String) -> MarkerDef? {
            urineRe.test(currentSpecimen) ? MarkerCatalog.find(alias: "urine \(name)") : MarkerCatalog.find(alias: name)
        }
        // Results whose printed range was "See below" - filled from a following
        // "Fasting <low> - <high>" reference line in the comments, if one appears.
        // (Indices into `results`: the TS holds object references and mutates them in place.)
        var awaitingRange: [Int] = []
        // True while inside a trailing explanatory-note block (e.g. "Recommended targets
        // for high risk patients", B12 deficiency-risk guidance). These blocks have no
        // single closing marker, so every line is skipped outright - including single-value
        // fallback parsing - until a real panel/page boundary is hit.
        var inNoteBlock = false

        func flushLongTable() {
            guard let table = longTable else { return }
            for row in table.rows {
                let range = table.ranges[JS.trim(row.collectionType.lowercased())]
                results.append(
                    makeResult(
                        markerKey: table.markerKey ?? "unmatched:\(slugify(table.rawName))",
                        rawName: table.rawName,
                        date: row.date,
                        value: row.value,
                        displayValue: JS.numberString(row.value),
                        flag: .none,
                        rangeLow: range?.low,
                        rangeHigh: range?.high,
                        rangeText: range.map { "\(JS.numberString($0.low)) - \(JS.numberString($0.high))" } ?? "",
                        unit: nonEmpty(range?.unit) ?? table.unit,
                        sourceFile: fileName,
                        panel: table.panel))
            }
            longTable = nil
        }

        func flushHistoryTable() {
            guard let t = historyTable else { return }
            historyTable = nil
            let columnCount = max(0, t.rows.map { $0.values.count }.max() ?? 0)
            if columnCount == 0 { return }
            let columns = splitHeaderColumns(t.header, count: columnCount)
            let latestWithRange = t.rows.last { !$0.rangeText.isEmpty }
            let latestWithUnit = t.rows.last { !$0.unit.isEmpty }
            struct Built { var name: String; var unit: String; var x: Double; var marker: MarkerDef?; var rangeText: String }
            let built: [Built] = columns.enumerated().map { ci, col in
                let marker = lookupMarker(col.name)
                let rangeText = ci < t.rangeTexts.count ? t.rangeTexts[ci] : (columnCount == 1 ? (latestWithRange?.rangeText ?? "") : "")
                let unit = nonEmpty(col.unit)
                    ?? nonEmpty(columnCount == 1 ? (nonEmpty(latestWithUnit?.unit) ?? t.unit) : "")
                    ?? nonEmpty(marker?.defaultUnit)
                    ?? ""
                return Built(name: col.name, unit: unit, x: col.x, marker: marker, rangeText: rangeText)
            }
            // The same test reported in two units (HbA1c as mmol/mol and %): keep only the column
            // in the catalog's unit so one chart doesn't mix scales.
            let keep: [Bool] = built.indices.map { idx in
                let c = built[idx]
                guard let cm = c.marker else { return true }
                let twins = built.indices.filter { built[$0].marker?.key == cm.key }
                if twins.count < 2 { return true }
                let preferred = twins.first { built[$0].unit.lowercased() == (cm.defaultUnit ?? "").lowercased() } ?? twins[0]
                return preferred == idx
            }
            for row in t.rows {
                for (vi, v) in row.values.enumerated() {
                    let ci: Int
                    if row.values.count == columns.count {
                        ci = vi
                    } else {
                        var best = 0
                        for i in columns.indices where abs(columns[i].x - v.x) < abs(columns[best].x - v.x) { best = i }
                        ci = best
                    }
                    guard ci < built.count, keep[ci] else { continue }
                    let col = built[ci]
                    let range = parseRangeText(col.rangeText)
                    results.append(
                        makeResult(
                            markerKey: col.marker?.key ?? "unmatched:\(slugify(col.name))",
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
                            panel: t.panel))
                }
            }
        }

        func flushColumnTable() {
            guard let table = columnTable else { return }
            for row in table.rows {
                for v in row.values {
                    guard v.colIdx < table.columns.count else { continue }
                    let col = table.columns[v.colIdx]
                    guard !col.name.isEmpty, let parsed = parseValueToken(v.text) else { continue }
                    let marker = lookupMarker(col.name)
                    let range = parseRangeText(col.rangeText)
                    results.append(
                        makeResult(
                            markerKey: marker?.key ?? "unmatched:\(slugify(col.name))",
                            rawName: col.name,
                            date: row.date,
                            value: parsed.value,
                            displayValue: parsed.displayValue,
                            flag: parsed.flag,
                            rangeLow: range.rangeLow,
                            rangeHigh: range.rangeHigh,
                            rangeText: range.rangeLow != nil || range.rangeHigh != nil ? col.rangeText : "",
                            unit: nonEmpty(col.unit) ?? nonEmpty(marker?.defaultUnit) ?? "",
                            sourceFile: fileName,
                            panel: table.panel))
                    if seeBelowRe.test(col.rangeText) { awaitingRange.append(results.count - 1) }
                }
            }
            columnTable = nil
        }

        for i in 0..<lines.count {
            let line = lines[i]
            let text = JS.trim(line.text)
            if text.isEmpty { continue }

            // Header values pasted after their labels ("Date of Observation:" ... "09/10/2026 09:05"):
            // take bare date lines as the observation date. Portals list the date-only "Date
            // Requested" before it, so keep looking until one with a time turns up.
            if awaitingObservationDate {
                let bare = bareDateRe.first(text)
                let iso = bare.flatMap { DateUtils.ausDateToIso($0[1]!) }
                if let iso {
                    currentCollectedDate = iso
                    if let b = bare, !(b[2] ?? "").isEmpty { awaitingObservationDate = false }
                    continue
                }
            }

            if startOfDocumentRe.test(text) {
                flushHistoryTable()
                flushColumnTable()
                inRecordSummary = true
                continue
            }
            if inRecordSummary {
                if endOfDocumentRe.test(text) { inRecordSummary = false }
                continue
            }

            // Panel heading carrying its specimen ("C REACTIVE PROTEIN (CRP)  SPECIMEN: SERUM").
            if let specimenHeading = specimenHeadingRe.first(text) {
                flushHistoryTable()
                flushColumnTable()
                awaitingRange = []
                // Some layouts put the panel name on the line above ("GENERAL CHEMISTRY" / "SPECIMEN: Serum").
                let prevText = i > 0 ? JS.trim(lines[i - 1].text) : ""
                currentPanel = nonEmpty(JS.trim(specimenHeading[1] ?? ""))
                    ?? (panelNameLineRe.test(prevText) ? prevText : currentPanel)
                currentSpecimen = JS.trim(specimenHeading[2] ?? "")
                wideTable = nil
                inNoteBlock = false
                continue
            }

            if let nameOfTest = nameOfTestRe.first(text) {
                flushLongTable()
                flushColumnTable()
                flushHistoryTable()
                currentSpecimen = ""
                awaitingRange = []
                currentPanel = JS.trim(nameOfTest[1] ?? "")
                wideTable = nil
                inNoteBlock = false
                continue
            }

            if footerCodeLineRe.test(text) || otherTestsRe.test(text) || pageResetRe.test(text) {
                flushColumnTable()
                flushHistoryTable()
                awaitingRange = []
                wideTable = nil
                inNoteBlock = false
                continue
            }

            // Explanatory prose blocks (e.g. "Recommended targets for high risk patients",
            // deficiency-risk notes) sometimes follow a real data table with no "Name of
            // Test:" line to mark the boundary, but their own short lines - and any trailing
            // "(...)" on them - can otherwise look enough like table rows to get parsed as
            // more (wrongly dated) data. Skip every line until the next real panel/page.
            if recommendedTargetsRe.test(text)
                || deficiencyRiskRe.test(text)
                // (Long-format tables keep reading: their reference-range block follows the comment.)
                || (labNumberCommentRe.test(text) && longTable == nil)
            {
                flushHistoryTable()
                wideTable = nil
                inNoteBlock = true
                continue
            }
            if inNoteBlock { continue }

            if !awaitingRange.isEmpty {
                if let fasting = fastingRe.first(text) {
                    for idx in awaitingRange {
                        results[idx].rangeLow = JS.number(fasting[1]!)
                        results[idx].rangeHigh = JS.number(fasting[2]!)
                        results[idx].rangeText = "\(fasting[1]!) - \(fasting[2]!) (fasting)"
                    }
                    awaitingRange = []
                    continue
                }
            }

            // --- Per-marker history table (header "Date [Time] Lab No. <markers>") ---
            if dateOnlyTokenRe.test(line.tokens.first?.text ?? "")
                && !line.tokens.contains(where: { dateRe.test($0.text) })
                && !collectionTypeRe.test(text)
            {
                let labNoEnd = line.tokens.indices.first { idx in
                    let t = line.tokens[idx]
                    return labHashTokenRe.test(t.text)
                        || (noTokenRe.test(t.text) && labOrReqTokenRe.test(idx > 0 ? line.tokens[idx - 1].text : ""))
                }
                if let labNoEnd {
                    flushHistoryTable()
                    historyTable = HistoryTableState(
                        header: line.tokens[(labNoEnd + 1)...].filter { !headerUnitsTokenRe.test($0.text) },
                        rangeTexts: [],
                        unit: "",
                        rows: [],
                        panel: currentPanel)
                    wideTable = nil
                    continue
                }
            }
            if historyTable != nil {
                if dashLineRe.test(JS.removingWhitespace(text)) { continue }
                let unitOnly = unitOnlyRe.first(text)
                if let unitOnly, historyTable!.rows.isEmpty {
                    historyTable!.unit = unitOnly[1]!
                    continue
                }
                if refRangeLineRe.test(text) {
                    historyTable!.rangeTexts = parenGroupRe.all(text).map { JS.trim($0[1]!) }
                    continue
                }
                let row = dateRe.test(line.tokens.first?.text ?? "") ? parseHistoryRow(line) : nil
                if let row {
                    historyTable!.rows.append(row)
                    continue
                }
                flushHistoryTable()
            }

            // --- Column-style table (header "Date Time Request <markers>") ---
            let headerWords = line.tokens.prefix(3).map { $0.text.lowercased() }
            if headerWords.joined(separator: " ") == "date time request" && line.tokens.count > 3 {
                flushColumnTable()
                columnTable = ColumnTableState(headerTokens: Array(line.tokens[3...]), columns: [], rows: [], panel: currentPanel)
                wideTable = nil
                continue
            }
            if columnTable != nil {
                let first = line.tokens.first?.text ?? ""
                if dateRe.test(first) {
                    let iso = DateUtils.ausDateToIso(first)
                    // Values sit after the date, time and request-number columns.
                    let valueTokens = line.tokens.count > 3 ? Array(line.tokens[3...]) : []
                    if let iso, !valueTokens.isEmpty {
                        if columnTable!.columns.isEmpty {
                            // Anchor each column at its value's x; header words left of the next
                            // anchor belong to the previous column (e.g. "Serum Insulin").
                            columnTable!.columns = valueTokens.map { .init(x: $0.x, name: "", unit: "", rangeText: "") }
                            for h in columnTable!.headerTokens {
                                let idx = nearestColumnAtOrLeft(columnTable!.columns.map(\.x), h.x)
                                let name = columnTable!.columns[idx].name
                                columnTable!.columns[idx].name = name.isEmpty ? h.text : "\(name) \(h.text)"
                            }
                        }
                        let colXs = columnTable!.columns.map(\.x)
                        columnTable!.rows.append(
                            .init(date: iso, values: valueTokens.map { (colIdx: nearestColumnAtOrLeft(colXs, $0.x), text: $0.text) }))
                        continue
                    }
                }
                let isUnits = unitsRowRe.test(text)
                let isRanges = !isUnits && referenceRangesRowRe.test(text)
                if (isUnits || isRanges) && !columnTable!.columns.isEmpty {
                    let skip = isUnits ? 1 : (referenceRangesSpaceRe.test(text) ? 2 : 1)
                    let colXs = columnTable!.columns.map(\.x)
                    for t in line.tokens.dropFirst(skip) {
                        let ci = nearestColumnAtOrLeft(colXs, t.x)
                        if isUnits {
                            let cur = columnTable!.columns[ci].unit
                            columnTable!.columns[ci].unit = cur.isEmpty ? t.text : "\(cur) \(t.text)"
                        } else {
                            let cur = columnTable!.columns[ci].rangeText
                            columnTable!.columns[ci].rangeText = cur.isEmpty ? t.text : "\(cur) \(t.text)"
                        }
                    }
                    continue
                }
                flushColumnTable()
            }

            if let collected = collectedRe.first(text) {
                if let iso = DateUtils.ausDateToIso(collected[1]!) { currentCollectedDate = iso }
            }
            // Clinic-portal / HL7-style message headers ("Date of Observation: 09/10/2026 09:05").
            // The observation date is the collection date; "Date Requested:", "Date Received:" etc.
            // aren't, and none of these are a wide-table "Date:" header.
            if let labelledDate = labelledDateRe.first(text) {
                let iso = labelledDate[2].flatMap { DateUtils.ausDateToIso($0) }
                if observationOrCollectionRe.test(labelledDate[1]!) {
                    if let iso { currentCollectedDate = iso } else { awaitingObservationDate = true }
                }
                continue
            }

            // --- Long-format table (e.g. GLUCOSE: one row per date) ---
            if labHashRe.test(text) && collectionTypeRe.test(text) {
                flushLongTable()
                // The marker is the last header column ("... Specimen Glucose"); fall back to the panel name.
                let specimenIdx = line.tokens.firstIndex { specimenTokenRe.test($0.text) }
                let headerName = specimenIdx.map { line.tokens[($0 + 1)...].map(\.text).joined(separator: " ") } ?? ""
                let marker = lookupMarker(headerName) ?? lookupMarker(currentPanel)
                var unit = marker?.defaultUnit ?? ""
                let nextLine = i + 1 < lines.count ? JS.trim(lines[i + 1].text) : nil
                if let nextLine, let unitMatch = unitOnlyRe.first(nextLine) { unit = unitMatch[1]! }
                longTable = LongTableState(
                    markerKey: marker?.key,
                    rawName: nonEmpty(headerName) ?? currentPanel,
                    unit: unit,
                    panel: currentPanel,
                    rows: [],
                    ranges: [:])
                wideTable = nil
                continue
            }
            if longTable != nil {
                let rangeRow = longRangeRowRe.first(text)
                let dateToken = line.tokens.first?.text
                if let rangeRow, !dateRe.test(dateToken ?? "") {
                    longTable!.ranges[JS.trim(rangeRow[1]!.lowercased())] = .init(
                        low: JS.number(rangeRow[2]!), high: JS.number(rangeRow[3]!), unit: rangeRow[4]!)
                    continue
                }
                if dateRe.test(dateToken ?? "") {
                    if let row = parseLongTableRow(line) {
                        longTable!.rows.append(row)
                        continue
                    }
                }
                if longTableEndRe.test(text) {
                    flushLongTable()
                }
            }

            // --- Wide table header: "Date:  dd/mm/yy  dd/mm/yy ..." ---
            if dateHeaderTokenRe.test(line.tokens.first?.text ?? "") || dateColonRe.test(text) {
                let dateTokens = line.tokens.filter { dateRe.test($0.text) }
                if !dateTokens.isEmpty {
                    wideTable = WideTableState(
                        dates: dateTokens.compactMap { t in DateUtils.ausDateToIso(t.text).map { (iso: $0, x: t.x) } })
                    continue
                }
            }

            // A free-text comments section ends the result table above it.
            if commentsRe.test(text) {
                wideTable = nil
                continue
            }

            if skipLinePrefixRe.test(text) || headerLabelLineRe.test(text) || dashLineRe.test(JS.removingWhitespace(text)) {
                continue
            }

            // --- Single-result row with an unbracketed range or "see below"
            // (e.g. "Magnesium 0.91 mmol/L 0.70 - 1.10", "hsCRP 7.7 mg/L see below") ---
            if longTable == nil && (wideTable == nil || wideTable!.dates.count == 1) {
                let date = wideTable != nil ? wideTable!.dates[0].iso : currentCollectedDate
                if let row = parseUnbracketedRow(text) {
                    if let date {
                        let marker = lookupMarker(row.name)
                        results.append(
                            makeResult(
                                markerKey: marker?.key ?? "unmatched:\(slugify(row.name))",
                                rawName: row.name,
                                date: date,
                                value: row.value,
                                displayValue: row.displayValue,
                                flag: row.flag,
                                rangeLow: row.rangeLow,
                                rangeHigh: row.rangeHigh,
                                rangeText: row.rangeText,
                                unit: nonEmpty(row.unit) ?? nonEmpty(marker?.defaultUnit) ?? "",
                                sourceFile: fileName,
                                panel: currentPanel))
                        continue
                    } else {
                        datelessRows += 1
                    }
                }
            }

            // --- Wide table data row ---
            if let wt = wideTable, !wt.dates.isEmpty {
                if let parsed = parseWideTableRow(line, dateColumns: wt.dates) {
                    for v in parsed.values {
                        let marker = lookupMarker(parsed.name)
                        results.append(
                            makeResult(
                                markerKey: marker?.key ?? "unmatched:\(slugify(parsed.name))",
                                rawName: parsed.name,
                                date: v.date,
                                value: v.value,
                                displayValue: v.displayValue,
                                flag: v.flag,
                                rangeLow: parsed.rangeLow,
                                rangeHigh: parsed.rangeHigh,
                                rangeText: parsed.rangeText,
                                unit: nonEmpty(parsed.unit) ?? nonEmpty(marker?.defaultUnit) ?? "",
                                sourceFile: fileName,
                                panel: currentPanel))
                    }
                    // Single letters are the rotated department name printed down the page margin.
                    // A digit-free row under a single-result header is a subheading ("Electrolytes / Renal Function").
                    let isSubheading = wt.dates.count == 1 && !hasDigitRe.test(text)
                    if parsed.values.isEmpty && parsed.name.utf16.count > 1 && !isSubheading {
                        warnings.append("Could not read a value for \"\(parsed.name)\" in \(currentPanel) (\(fileName))")
                    }
                    continue
                }
            }

            // --- Single-value line fallback (e.g. ANDROGEN STUDIES: "Testosterone  15.7 nmol/L (6.0 - 28.0)") ---
            if wideTable == nil && longTable == nil {
                if let single = parseSingleValueLine(text) {
                    if let date = currentCollectedDate {
                        let marker = lookupMarker(single.name)
                        results.append(
                            makeResult(
                                markerKey: marker?.key ?? "unmatched:\(slugify(single.name))",
                                rawName: single.name,
                                date: date,
                                value: single.value,
                                displayValue: single.displayValue,
                                flag: .none,
                                rangeLow: single.rangeLow,
                                rangeHigh: single.rangeHigh,
                                rangeText: single.rangeText,
                                unit: nonEmpty(single.unit) ?? nonEmpty(marker?.defaultUnit) ?? "",
                                sourceFile: fileName,
                                panel: currentPanel))
                    } else {
                        datelessRows += 1
                    }
                }
            }
        }
        flushLongTable()
        flushColumnTable()
        flushHistoryTable()

        // No layout-specific parser recognised anything: fall back to marker-anchored parsing.
        // (Port of the fallback in src/lib/pdfParser.ts.)
        if results.isEmpty {
            let anchored = AnchoredParser.parse(fileName: fileName, lines: lines, defaultDate: defaultDate)
            if !anchored.results.isEmpty { return anchored }
        }

        if datelessRows > 0 {
            warnings.append(
                "\(datelessRows) result\(datelessRows == 1 ? "" : "s") skipped because no collection date was found - set the collection date, or include the \"Collected\" or \"Date of Observation\" line in what you paste.")
        }

        return ParseOutcome(results: results, warnings: warnings)
    }

    // MARK: - Row parsers

    private static func parseLongTableRow(_ line: Line) -> LongTableState.Row? {
        let tokens = line.tokens.map(\.text)
        if tokens.count < 5 { return nil }
        guard let iso = DateUtils.ausDateToIso(tokens[0]) else { return nil }
        let last = tokens[tokens.count - 1]
        if !numberRe.test(last) { return nil }
        // Columns are: date, time, lab#, collection type (1+ words), specimen (1 word), value.
        // The printed "Glucose Reference Ranges" block below the table keys its rows by
        // collection type alone (e.g. "Random"), so the specimen word must be excluded here
        // or the backfill lookup ("Random serum") never matches ("Random").
        let collectionType = tokens[3..<(tokens.count - 2)].joined(separator: " ")
        return .init(date: iso, value: JS.number(last), collectionType: collectionType)
    }

    private static func parseHistoryRow(_ line: Line) -> HistoryTableState.Row? {
        guard let date = DateUtils.ausDateToIso(line.tokens[0].text) else { return nil }
        var idx = 1
        while idx < line.tokens.count && (timeRe.test(line.tokens[idx].text) || labNumberRe.test(line.tokens[idx].text)) { idx += 1 }
        var values: [HistoryValue] = []
        var pendingFlag: ResultFlag = .none
        var pendingOp = ""
        while idx < line.tokens.count {
            let tok = line.tokens[idx]
            if flagRe.test(tok.text) {
                pendingFlag = ResultFlag(rawValue: tok.text) ?? .none
                idx += 1
                continue
            }
            if opRe.test(tok.text) {
                pendingOp = tok.text
                idx += 1
                continue
            }
            guard let parsed = parseValueToken(pendingOp + tok.text) else { break }
            values.append(HistoryValue(value: parsed.value, displayValue: parsed.displayValue, flag: parsed.flag != .none ? parsed.flag : pendingFlag, x: tok.x))
            pendingFlag = .none
            pendingOp = ""
            idx += 1
        }
        if values.isEmpty { return nil }
        // Whatever follows the values is the unit and/or "(range)", in either order.
        let rest = line.tokens[min(idx, line.tokens.count)...].map(\.text).joined(separator: " ")
        let rangeMatch = parenGroupRe.first(rest)
        let unit = JS.trim(parenGroupRe.replacingFirst(in: rest, with: ""))
        return .init(date: date, values: values, unit: unit, rangeText: rangeMatch.map { JS.trim($0[1]!) } ?? "")
    }

    /// Splits header tokens into `count` marker columns. A "(unit)" token closes a column
    /// ("HbA1c (mmol/mol) HbA1c (%)"); otherwise split at the widest x gaps.
    private static func splitHeaderColumns(_ header: [PositionedToken], count: Int) -> [(name: String, unit: String, x: Double)] {
        var groups: [[PositionedToken]] = []
        for t in header {
            if let prev = groups.last, !(prev[prev.count - 1].text.hasPrefix("(") && !t.text.hasPrefix("(")) {
                groups[groups.count - 1].append(t)
            } else {
                groups.append([t])
            }
        }
        if groups.count != count {
            let gaps = header.indices.dropFirst().map { (i: $0, gap: header[$0].x - header[$0 - 1].x) }
            // Stable sort by gap, widest first (JS sort is stable).
            let sorted = gaps.enumerated().sorted { $0.element.gap != $1.element.gap ? $0.element.gap > $1.element.gap : $0.offset < $1.offset }
            let cuts = sorted.prefix(max(0, count - 1)).map(\.element.i).sorted()
            groups = []
            var start = 0
            for cut in cuts + [header.count] {
                groups.append(Array(header[start..<cut]))
                start = cut
            }
        }
        return groups.map { g in
            let unitIdx = g.firstIndex { parenWrappedRe.test($0.text) }
            return (
                name: g.enumerated().filter { $0.offset != unitIdx }.map(\.element.text).joined(separator: " "),
                unit: unitIdx.map { String(g[$0].text.dropFirst().dropLast()) } ?? "",
                x: g.first?.x ?? 0
            )
        }
    }

    private static func nearestColumnAtOrLeft(_ xs: [Double], _ x: Double) -> Int {
        // Small tolerance: text in the same column can start a few units left of its anchor.
        var idx = 0
        for (i, cx) in xs.enumerated() where cx <= x + 8 { idx = i }
        return idx
    }

    /// Parses a value token that may carry a leading "<"/">" or a glued abnormal flag (e.g. "23.3**").
    private static func parseValueToken(_ text: String) -> (value: Double, displayValue: String, flag: ResultFlag)? {
        guard let m = valueTokenRe.first(text) else { return nil }
        let op = m[1] ?? "", num = m[2] ?? ""
        return (JS.number(num), op.isEmpty ? num : "\(op) \(num)", ResultFlag(rawValue: m[3] ?? "") ?? .none)
    }

    private struct UnbracketedRow {
        var name: String
        var value: Double
        var displayValue: String
        var flag: ResultFlag
        var unit: String
        var rangeLow: Double?
        var rangeHigh: Double?
        var rangeText: String
    }

    private static func parseUnbracketedRow(_ text: String) -> UnbracketedRow? {
        // name, value (optional op / glued flag), unit (must contain a letter or %), then
        // either a bare "low - high" / "< n" range or the words "see below", optionally followed
        // by short Flag / Status columns as clinic portals print them ("0.59-1.03  N  F").
        guard let m = unbracketedRowRe.first(text) else { return nil }
        let name = m[1]!, rawValue = m[2]!, unit = m[3]!, rangePart = m[4]!
        guard let parsed = parseValueToken(JS.removingWhitespace(rawValue)) else { return nil }
        let seeBelow = seeBelowRe.test(rangePart)
        let range = seeBelow ? (rangeLow: nil as Double?, rangeHigh: nil as Double?) : parseRangeText(rangePart)
        return UnbracketedRow(
            name: JS.trim(name), value: parsed.value, displayValue: parsed.displayValue, flag: parsed.flag, unit: unit,
            rangeLow: range.rangeLow, rangeHigh: range.rangeHigh, rangeText: seeBelow ? "" : rangePart)
    }

    private struct SingleValueRow {
        var name: String
        var value: Double
        var displayValue: String
        var unit: String
        var rangeLow: Double?
        var rangeHigh: Double?
        var rangeText: String
    }

    private static func parseSingleValueLine(_ text: String) -> SingleValueRow? {
        // Names may carry their own parentheses ("Lp(a)") - the range is the last "(...)".
        guard let m = singleValueRe.first(text) else {
            // Ratios are often printed bare, with no unit or range ("ApoB/A1 Ratio  0.52").
            guard let ratio = bareRatioRe.first(text) else { return nil }
            return SingleValueRow(
                name: JS.trim(ratio[1]!), value: JS.number(ratio[2]!), displayValue: ratio[2]!, unit: "",
                rangeLow: nil, rangeHigh: nil, rangeText: "")
        }
        let name = m[1]!, rawValue = m[2]!, unit = m[3]!, rangeText = m[4]!
        let numeric = JS.number(rawValue.replacingOccurrences(of: "<", with: "").replacingOccurrences(of: ">", with: ""))
        if numeric.isNaN { return nil }
        let range = parseRangeText(rangeText)
        return SingleValueRow(
            name: JS.trim(name), value: numeric, displayValue: JS.trim(rawValue), unit: JS.trim(unit),
            rangeLow: range.rangeLow, rangeHigh: range.rangeHigh, rangeText: rangeText)
    }

    private struct WideRow {
        struct Value { var date: String; var value: Double; var displayValue: String; var flag: ResultFlag }
        var name: String
        var values: [Value]
        var unit: String
        var rangeLow: Double?
        var rangeHigh: Double?
        var rangeText: String
    }

    private static func parseWideTableRow(_ line: Line, dateColumns: [(iso: String, x: Double)]) -> WideRow? {
        let tokens = line.tokens
        if tokens.isEmpty { return nil }

        var idx = 0
        var nameTokens: [String] = []
        while idx < tokens.count
            && !dateRe.test(tokens[idx].text)
            && !flagRe.test(tokens[idx].text)
            && !opRe.test(tokens[idx].text)
            && !numberRe.test(tokens[idx].text)
            && !tokens[idx].text.hasPrefix("(")
        {
            nameTokens.append(tokens[idx].text)
            idx += 1
        }
        let name = JS.trim(nameTokens.joined(separator: " "))
        if name.isEmpty { return nil }
        // Real marker names in these reports are always short (1-4 words). A long run of
        // non-numeric tokens before any number/paren/flag means this line is prose (a
        // section note, not a data row) - bail out rather than risk a bogus match.
        if nameTokens.count > 6 { return nil }

        // Find the trailing "(range)" span, if any. The closing ")" is sometimes glued
        // directly to a unit with no space (e.g. "(4.50 - 6.50)x10 ^12 /L") - split that
        // token instead of requiring it to end exactly with ")".
        var rangeStart = -1
        var rangeEnd = -1
        var gluedUnitPrefix = ""
        var j = idx
        while j < tokens.count {
            if tokens[j].text.hasPrefix("(") {
                rangeStart = j
                for k in j..<tokens.count {
                    let scalars = tokens[k].text.unicodeScalars
                    if let closeAt = scalars.firstIndex(of: ")") {
                        rangeEnd = k
                        gluedUnitPrefix = String(scalars[scalars.index(after: closeAt)...])
                        break
                    }
                }
                break
            }
            j += 1
        }

        let middleEnd = rangeStart == -1 ? tokens.count : rangeStart
        var middleTokens = idx <= middleEnd ? Array(tokens[idx..<middleEnd]) : []
        var unit = ""
        if rangeEnd != -1 {
            let trailing = tokens[(rangeEnd + 1)...].map(\.text).joined(separator: " ")
            unit = JS.trim([gluedUnitPrefix, trailing].filter { !$0.isEmpty }.joined(separator: " "))
            // Some labs print the unit before the range ("Albumin 9 mg/L (< 15)").
            if unit.isEmpty, let lastMiddle = middleTokens.last,
               !numberRe.test(lastMiddle.text), !flagRe.test(lastMiddle.text), !opRe.test(lastMiddle.text)
            {
                unit = lastMiddle.text
                middleTokens.removeLast()
            }
        } else if let lastMiddle = middleTokens.last {
            if !numberRe.test(lastMiddle.text) && !flagRe.test(lastMiddle.text) && !opRe.test(lastMiddle.text) {
                unit = lastMiddle.text
                middleTokens.removeLast()
            }
        }

        var rangeText = ""
        if rangeStart != -1 {
            let slice = tokens[rangeStart...(rangeEnd == -1 ? rangeStart : rangeEnd)]
            let parts = slice.enumerated().map { i, t -> String in
                guard i == slice.count - 1 else { return t.text }
                let scalars = t.text.unicodeScalars
                if let closeAt = scalars.firstIndex(of: ")") {
                    return String(scalars[...closeAt])
                }
                return t.text
            }
            rangeText = parts.joined(separator: " ").replacingOccurrences(of: "(", with: "").replacingOccurrences(of: ")", with: "")
        }
        let range = parseRangeText(rangeText)

        var rawValues: [HistoryValue] = []
        var pendingFlag: ResultFlag = .none
        var pendingOp = ""
        for tok in middleTokens {
            if flagRe.test(tok.text) {
                pendingFlag = ResultFlag(rawValue: tok.text) ?? .none
                continue
            }
            if opRe.test(tok.text) {
                pendingOp = tok.text
                continue
            }
            if numberRe.test(tok.text) {
                // Guard against letterhead ID numbers (phone/Medicare/reference) slipping through
                // if a table's end wasn't detected yet - real lab values are always short.
                if tok.text.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: "-", with: "").utf16.count > maxValueDigits { continue }
                rawValues.append(
                    HistoryValue(
                        value: JS.number(tok.text),
                        displayValue: pendingOp.isEmpty ? tok.text : "\(pendingOp) \(tok.text)",
                        flag: pendingFlag,
                        x: tok.x))
                pendingFlag = .none
                pendingOp = ""
            }
            // anything else (stray words like "Fasting", "Not", "Stated") is ignored - not a numeric result
        }

        // Numeric columns are right-aligned, so a value's x can sit closer to a neighbouring
        // date column than its own (e.g. a 2-digit MCV value drifts further right within its
        // column than a 3-digit Haemoglobin value does). When every date column has a value
        // - the common case - trust left-to-right print order over raw x-proximity. Only fall
        // back to nearest-x for sparse rows (a test not run at every collection), where order
        // alone can't say which date a lone value belongs to.
        let values: [WideRow.Value]
        if rawValues.count == dateColumns.count {
            values = rawValues.enumerated().map { i, v in
                .init(date: dateColumns[i].iso, value: v.value, displayValue: v.displayValue, flag: v.flag)
            }
        } else {
            values = rawValues.map { v in
                var nearest = dateColumns[0]
                for col in dateColumns.dropFirst() where abs(col.x - v.x) < abs(nearest.x - v.x) { nearest = col }
                return .init(date: nearest.iso, value: v.value, displayValue: v.displayValue, flag: v.flag)
            }
        }

        return WideRow(name: name, values: values, unit: unit, rangeLow: range.rangeLow, rangeHigh: range.rangeHigh, rangeText: rangeText)
    }

    private static func parseRangeText(_ rangeText: String) -> (rangeLow: Double?, rangeHigh: Double?) {
        if let between = betweenRe.first(rangeText) {
            return (JS.number(between[1]!), JS.number(between[2]!))
        }
        if let bounded = boundedRe.first(rangeText) {
            let n = JS.number(bounded[2]!)
            return bounded[1] == ">" ? (n, nil) : (nil, n)
        }
        return (nil, nil)
    }

    // MARK: - Helpers

    /// JS `a || b` falls through on an empty string; this maps "" (and nil) to nil so `??` does the same.
    private static func nonEmpty(_ s: String?) -> String? {
        guard let s, !s.isEmpty else { return nil }
        return s
    }

    // (Same values as MarkerResult.newID()/nowTimestamp(), which are MainActor-isolated.)
    private static func makeResult(
        markerKey: String, rawName: String, date: String, value: Double, displayValue: String, flag: ResultFlag,
        rangeLow: Double?, rangeHigh: Double?, rangeText: String, unit: String, sourceFile: String, panel: String
    ) -> MarkerResult {
        MarkerResult(
            id: UUID().uuidString.lowercased(), markerKey: markerKey, rawName: rawName, date: date, value: value,
            displayValue: displayValue, flag: flag, rangeLow: rangeLow, rangeHigh: rangeHigh, rangeText: rangeText,
            unit: unit, sourceFile: sourceFile, panel: panel, addedManually: false, derived: nil,
            createdAt: ISO8601DateFormatter().string(from: Date()))
    }

    /// `name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')`
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

    /// Pasted report text (including Live Text-style pastes where each table cell is on its
    /// own line). `defaultDate` (ISO) files results under that date until the text gives its own.
    static func parseText(_ text: String, defaultDate: String?) -> ParseOutcome {
        runStateMachine(fileName: "Pasted text", lines: TextLines.textToLines(text), defaultDate: defaultDate)
    }
}
