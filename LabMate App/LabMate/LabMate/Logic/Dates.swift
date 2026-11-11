import Foundation

// Port of src/lib/dates.ts. Dates stay as ISO yyyy-mm-dd strings. All calendar maths is
// done in a fixed UTC gregorian calendar so results never shift with the device timezone.

nonisolated enum DateUtils {
    private static let utc = TimeZone(identifier: "UTC")!

    private static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = utc
        c.locale = Locale(identifier: "en_US_POSIX")
        return c
    }

    private static func isoFormatter() -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = utc
        f.dateFormat = "yyyy-MM-dd"
        return f
    }

    /// Parses an ISO yyyy-mm-dd string to a Date at UTC midnight (nil if malformed).
    static func date(fromIso iso: String) -> Date? {
        isoFormatter().date(from: iso)
    }

    static func iso(from date: Date) -> String {
        isoFormatter().string(from: date)
    }

    // MARK: - Finding dates in free text (port of findDatesInText)

    struct FoundDate: Sendable {
        var iso: String
        /// UTF-16 offset of the match in the searched text.
        var index: Int
        var length: Int
    }

    private static let months: [String: Int] = ["jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12]
    private static let mon = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?"
    private static let isoRx = Rx(#"\b(\d{4})-(\d{2})-(\d{2})\b"#)
    private static let dayMonthRx = Rx("\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+\(mon)[\\s,-]+(\\d{4}|\\d{2})\\b", ignoreCase: true)
    private static let monthDayRx = Rx("\\b\(mon)\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b", ignoreCase: true)
    private static let slashRx = Rx(#"\b(\d{1,2})/(\d{1,2})/(\d{4}|\d{2})\b"#)

    private static func buildIso(_ y: Int, _ m: Int, _ d: Int) -> String? {
        var year = y
        if year < 100 { year += year >= 70 ? 1900 : 2000 }
        if m < 1 || m > 12 || d < 1 || d > 31 { return nil }
        return String(format: "%04d-%02d-%02d", year, m, d)
    }

    /// Every date in a piece of text (2026-11-10, 10 Nov 26, 10 November 2026, Nov 10, 2026,
    /// 10/11/26). Numeric dates are day-first. Returned in order of appearance.
    static func findDatesInText(_ text: String) -> [FoundDate] {
        var found: [FoundDate] = []
        func add(_ m: RxMatch, _ iso: String?) {
            guard let iso else { return }
            let len = m.ranges[0].length
            if found.contains(where: { m.index < $0.index + $0.length && $0.index < m.index + len }) { return }
            found.append(FoundDate(iso: iso, index: m.index, length: len))
        }
        for m in isoRx.all(text) { add(m, buildIso(Int(m[1]!)!, Int(m[2]!)!, Int(m[3]!)!)) }
        for m in dayMonthRx.all(text) {
            add(m, buildIso(Int(m[3]!)!, months[m[2]!.lowercased()] ?? 0, Int(m[1]!)!))
        }
        for m in monthDayRx.all(text) {
            add(m, buildIso(Int(m[3]!)!, months[m[1]!.lowercased()] ?? 0, Int(m[2]!)!))
        }
        for m in slashRx.all(text) { add(m, buildIso(Int(m[3]!)!, Int(m[2]!)!, Int(m[1]!)!)) }
        return found.sorted { $0.index < $1.index }
    }

    /// Parses "dd/mm/yy" or "dd/mm/yyyy" (as printed on Australian pathology reports) to ISO yyyy-mm-dd.
    static func ausDateToIso(_ input: String) -> String? {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = trimmed.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 3 else { return nil }
        func digits(_ s: Substring, _ lens: ClosedRange<Int>) -> Int? {
            guard lens.contains(s.count), s.allSatisfy({ $0 >= "0" && $0 <= "9" }) else { return nil }
            return Int(s)
        }
        guard let day = digits(parts[0], 1...2),
              let month = digits(parts[1], 1...2),
              parts[2].count == 2 || parts[2].count == 4,
              var year = digits(parts[2], 2...4) else { return nil }
        if year < 100 { year += year >= 70 ? 1900 : 2000 }
        if month < 1 || month > 12 || day < 1 || day > 31 { return nil }
        return String(format: "%04d-%02d-%02d", year, month, day)
    }

    /// "05 Nov 2026" style (en-AU, dd MMM yyyy). Returns the input unchanged if it isn't a valid date.
    static func formatIsoDate(_ iso: String) -> String {
        guard let d = date(fromIso: iso) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_AU")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = utc
        f.setLocalizedDateFormatFromTemplate("ddMMMyyyy")
        return f.string(from: d)
    }

    /// Today's date as ISO. Like the web app (toISOString), this is the UTC date.
    static func todayIso() -> String {
        iso(from: Date())
    }

    /// Adds a (possibly negative) number of whole months to an ISO date, clamping the day if the target month is shorter.
    static func addMonthsIso(_ iso: String, _ months: Int) -> String {
        guard let d = date(fromIso: iso) else { return iso }
        let cal = calendar
        let comps = cal.dateComponents([.year, .month, .day], from: d)
        let day = comps.day!
        var first = DateComponents(year: comps.year, month: comps.month, day: 1)
        guard let firstOfMonth = cal.date(from: first),
              let target = cal.date(byAdding: .month, value: months, to: firstOfMonth),
              let range = cal.range(of: .day, in: .month, for: target) else { return iso }
        let t = cal.dateComponents([.year, .month], from: target)
        first = DateComponents(year: t.year, month: t.month, day: min(day, range.count))
        guard let result = cal.date(from: first) else { return iso }
        return self.iso(from: result)
    }

    /// Whole days from `a` to `b` (positive if `b` is after `a`).
    static func daysBetweenIso(_ a: String, _ b: String) -> Int {
        guard let da = date(fromIso: a), let db = date(fromIso: b) else { return 0 }
        return Int((db.timeIntervalSince(da) / 86_400).rounded(.toNearestOrAwayFromZero))
    }

    static func ageInYears(_ birthIso: String, _ atIso: String) -> Int {
        guard let birth = date(fromIso: birthIso), let at = date(fromIso: atIso) else { return 0 }
        let cal = calendar
        let b = cal.dateComponents([.year, .month, .day], from: birth)
        let a = cal.dateComponents([.year, .month, .day], from: at)
        var age = a.year! - b.year!
        let monthDiff = a.month! - b.month!
        if monthDiff < 0 || (monthDiff == 0 && a.day! < b.day!) { age -= 1 }
        return age
    }
}
