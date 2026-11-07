import Foundation
import PDFKit

// PDFKit equivalent of pdf.js `getTextContent()` + `groupItemsIntoLines` (see parsePdf in src/lib/pdfParser.ts).
// Tokens are words with x from the page's left edge and y from the page's bottom, in PDF points,
// so the parser's x tolerances (e.g. the 8pt column tolerance) and the 2pt line tolerance carry over.

nonisolated extension LabReportParser {
    /// Parses a pathology-report PDF. Throws `PdfParseError.passwordNeeded` for a locked PDF when
    /// no password is given, `.wrongPassword` when the password fails, `.unreadable` if it can't be opened.
    @concurrent
    static func parsePdf(url: URL, password: String? = nil) async throws -> ParseOutcome {
        try parsePdfSync(url: url, password: password)
    }

    static func parsePdfSync(url: URL, password: String? = nil) throws -> ParseOutcome {
        guard let doc = PDFDocument(url: url) else { throw PdfParseError.unreadable }
        if doc.isLocked {
            guard let password, !password.isEmpty else { throw PdfParseError.passwordNeeded }
            if !doc.unlock(withPassword: password) { throw PdfParseError.wrongPassword }
        }
        let fileName = url.lastPathComponent

        var lines: [Line] = []
        var unreadablePages: [Int] = []
        for pageIndex in 0..<doc.pageCount {
            guard let page = doc.page(at: pageIndex) else { continue }
            let pageLines = TextLines.groupItemsIntoLines(PDFTextExtractor.items(on: page))
            if isUnreadableText(pageLines.map(\.text).joined(separator: " ")) { unreadablePages.append(pageIndex + 1) }
            lines.append(contentsOf: pageLines)
        }

        var outcome = runStateMachine(fileName: fileName, lines: lines)
        for pageNum in unreadablePages {
            outcome.warnings.append(
                "Page \(pageNum) of \(fileName) has no readable text (often a \"print to PDF\" from a web portal) - copy its results from the original web page and use Paste text, or add them manually.")
        }
        return outcome
    }

    // Pages printed from some web portals embed fonts with no character mapping, so pdf.js
    // returns symbols instead of letters. Real report text is mostly letters and digits.
    static func isUnreadableText(_ text: String) -> Bool {
        let visible = JS.removingWhitespace(text)
        let total = visible.utf16.count
        if total < 40 { return false }
        let readable = visible.utf16.reduce(0) { n, c in
            (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) ? n + 1 : n
        }
        return Double(readable) / Double(total) < 0.5
    }
}

nonisolated enum PDFTextExtractor {
    /// One item per whitespace-separated word on the page. Y is the bottom of the word's
    /// glyph box measured from the bottom of the page (PDF text space).
    static func items(on page: PDFPage) -> [RawTextItem] {
        guard let string = page.string, !string.isEmpty else { return [] }
        let ns = string as NSString
        let origin = page.bounds(for: .cropBox).origin
        var items: [RawTextItem] = []
        var i = 0
        let n = ns.length
        while i < n {
            while i < n, JS.isSpace(ns.character(at: i)) { i += 1 }
            let start = i
            while i < n, !JS.isSpace(ns.character(at: i)) { i += 1 }
            if i == start { continue }
            let range = NSRange(location: start, length: i - start)
            guard let sel = page.selection(for: range) else { continue }
            let r = sel.bounds(for: page)
            if r.isEmpty || r.isNull || r.isInfinite { continue }
            items.append(RawTextItem(str: ns.substring(with: range), x: Double(r.minX - origin.x), y: Double(r.minY - origin.y), width: Double(r.width)))
        }
        return items
    }
}
