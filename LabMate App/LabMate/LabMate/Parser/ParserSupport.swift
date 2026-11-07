import Foundation

// Shared plumbing for the pathology-report parser (port of src/lib/pdfParser.ts + textLines.ts).
// Everything here is `nonisolated` so the parser can run off the main actor even though the
// target defaults to MainActor isolation.

/// Mirrors the TS `ParseOutcome`.
nonisolated struct ParseOutcome: Sendable {
    var results: [MarkerResult]
    var warnings: [String]
}

/// Mirrors PdfPasswordNeededError / PdfWrongPasswordError, plus `unreadable` for files that
/// can't be opened at all (the web app shows its generic "could not read that PDF" message).
nonisolated enum PdfParseError: Error, Sendable, Equatable, LocalizedError {
    case passwordNeeded
    case wrongPassword
    case unreadable

    var errorDescription: String? {
        switch self {
        case .passwordNeeded: "This PDF is password protected."
        case .wrongPassword: "That password did not work."
        case .unreadable: "Could not read that PDF. It may not be a supported pathology report."
        }
    }
}

nonisolated enum ImageParseError: Error, Sendable, Equatable, LocalizedError {
    case noTextFound

    var errorDescription: String? {
        "No readable text was found in that image."
    }
}

// MARK: - JS-compatible helpers

/// Helpers that reproduce JavaScript string/number semantics the parser relies on.
nonisolated enum JS {
    /// The code units JS `String.prototype.trim` / `\s` treat as whitespace or line terminators.
    static func isSpace(_ u: UInt16) -> Bool {
        switch u {
        case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
            return true
        default:
            return false
        }
    }

    /// `String.prototype.trim`.
    static func trim(_ s: String) -> String {
        let u = Array(s.utf16)
        var a = 0
        var b = u.count
        while a < b && isSpace(u[a]) { a += 1 }
        while b > a && isSpace(u[b - 1]) { b -= 1 }
        if a == 0 && b == u.count { return s }
        return String(decoding: u[a..<b], as: UTF16.self)
    }

    /// `Number(str)` for the plain decimal strings the parser's regexes produce ("5", "-1.5", "5.").
    static func number(_ s: String) -> Double {
        let t = trim(s)
        if t.isEmpty { return 0 }
        if let d = Double(t) { return d }
        if t.hasSuffix("."), let d = Double(String(t.dropLast())) { return d }
        return .nan
    }

    /// `String(number)` for the values the parser prints back (integral values have no ".0").
    static func numberString(_ d: Double) -> String {
        if d == 0 { return "0" }
        if d.isFinite && d == d.rounded() && abs(d) < 1e15 { return String(Int64(d)) }
        return "\(d)"
    }

    /// `str.replace(/\s/g, '')`.
    static func removingWhitespace(_ s: String) -> String {
        String(decoding: s.utf16.filter { !isSpace($0) }, as: UTF16.self)
    }
}

// MARK: - Regex wrapper

/// One regex match with JS-style groups: a group that did not participate is `nil`
/// (JS `undefined`). Offsets are UTF-16, like JS string indices.
nonisolated struct RxMatch: Sendable {
    let source: String
    let ranges: [NSRange]

    subscript(_ i: Int) -> String? {
        guard i < ranges.count, ranges[i].location != NSNotFound else { return nil }
        return (source as NSString).substring(with: ranges[i])
    }

    /// UTF-16 offset of the whole match (JS `match.index`).
    var index: Int { ranges[0].location }
}

/// Thin NSRegularExpression wrapper. Patterns are written as JS regex literals would be;
/// the differences from ICU are handled here or by hand in the pattern:
///  - `\d` is ASCII-only in JS but any Unicode digit in ICU, so it is rewritten to `[0-9]`.
///  - JS `$` (no `m` flag) matches only at the very end; ICU `$` also matches before a final
///    line terminator, so patterns use `\z` for end-of-input.
nonisolated struct Rx: @unchecked Sendable {
    let regex: NSRegularExpression

    init(_ pattern: String, ignoreCase: Bool = false) {
        let p = pattern.replacingOccurrences(of: "\\d", with: "[0-9]")
        do {
            regex = try NSRegularExpression(pattern: p, options: ignoreCase ? [.caseInsensitive] : [])
        } catch {
            preconditionFailure("Invalid regex \(pattern): \(error)")
        }
    }

    private func whole(_ s: String) -> NSRange { NSRange(location: 0, length: (s as NSString).length) }

    private func wrap(_ m: NSTextCheckingResult, _ s: String) -> RxMatch {
        RxMatch(source: s, ranges: (0..<m.numberOfRanges).map { m.range(at: $0) })
    }

    /// JS `re.test(s)` (non-global).
    func test(_ s: String) -> Bool {
        regex.firstMatch(in: s, options: [], range: whole(s)) != nil
    }

    /// JS `s.match(re)` (non-global).
    func first(_ s: String) -> RxMatch? {
        regex.firstMatch(in: s, options: [], range: whole(s)).map { wrap($0, s) }
    }

    /// JS `s.matchAll(re)` (global).
    func all(_ s: String) -> [RxMatch] {
        regex.matches(in: s, options: [], range: whole(s)).map { wrap($0, s) }
    }

    /// JS `s.replace(re, replacement)` for the first match only (replacement is literal).
    func replacingFirst(in s: String, with replacement: String) -> String {
        guard let m = regex.firstMatch(in: s, options: [], range: whole(s)) else { return s }
        return (s as NSString).replacingCharacters(in: m.range, with: replacement)
    }
}
