import CoreGraphics
import Foundation
import Vision

// Vision text recognition for a photo or camera scan of a report, feeding the same pipeline as PDFs.

nonisolated extension LabReportParser {
    /// A page of ~A4 width, so photo coordinates land on the same scale as PDF points
    /// and the parser's column tolerances (8pt) mean the same thing.
    private static let photoPageWidth = 595.0

    /// OCRs `cgImage` and runs the report parser over it. Throws `ImageParseError.noTextFound`
    /// if Vision finds no text. `defaultDate` (ISO) files results under that date until the text gives its own.
    @concurrent
    static func parseImage(_ cgImage: CGImage, fileName: String, defaultDate: String?) async throws -> ParseOutcome {
        let items = try await ImageTextExtractor.items(in: cgImage, pageWidth: photoPageWidth)
        if items.isEmpty { throw ImageParseError.noTextFound }
        // Photos are skewed and curved, so allow a little more vertical slack than a PDF's 2pt,
        // scaled to the text height.
        let tolerance = ImageTextExtractor.yTolerance(for: items)
        let lines = TextLines.groupItemsIntoLines(items, yTolerance: tolerance)
        return runStateMachine(fileName: fileName, lines: lines, defaultDate: defaultDate)
    }
}

nonisolated enum ImageTextExtractor {
    /// Word-level items. x is the word's left edge and y its vertical centre, scaled so the
    /// image is `pageWidth` points wide, with y measured from the bottom (as in PDF space).
    static func items(in cgImage: CGImage, pageWidth: Double) async throws -> [RawTextItem] {
        var request = RecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false // lab values and units are not dictionary words
        request.automaticallyDetectsLanguage = false
        let observations = try await request.perform(on: cgImage, orientation: nil)

        let aspect = Double(cgImage.height) / Double(cgImage.width)
        let pageHeight = pageWidth * aspect
        var items: [RawTextItem] = []
        for obs in observations {
            guard let candidate = obs.topCandidates(1).first else { continue }
            let s = candidate.string
            var idx = s.startIndex
            while idx < s.endIndex {
                while idx < s.endIndex, s[idx].isWhitespace { idx = s.index(after: idx) }
                let start = idx
                while idx < s.endIndex, !s[idx].isWhitespace { idx = s.index(after: idx) }
                if start == idx { break }
                let word = String(s[start..<idx])
                // Vision's normalised coordinates already have a lower-left origin.
                let box = candidate.boundingBox(for: start..<idx)?.boundingBox.cgRect ?? obs.boundingBox.cgRect
                items.append(RawTextItem(
                    str: word,
                    x: Double(box.minX) * pageWidth,
                    y: Double(box.midY) * pageHeight,
                    width: Double(box.width) * pageWidth,
                    height: Double(box.height) * pageHeight))
            }
        }
        return items
    }

    /// ~40% of the median text height, never below the PDF value of 2pt.
    static func yTolerance(for items: [RawTextItem]) -> Double {
        let heights = items.map(\.height).filter { $0 > 0 }.sorted()
        guard !heights.isEmpty else { return 2 }
        return max(2, heights[heights.count / 2] * 0.4)
    }
}
