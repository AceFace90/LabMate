import Foundation

// Port of src/lib/greeting.ts.

nonisolated enum Greeting {
    /// Same thresholds as GymMate/MacroMate, for a consistent greeting across all three apps.
    static func timeOfDayGreeting(hour: Int = Calendar.current.component(.hour, from: Date())) -> String {
        if hour < 12 { return "Good morning" }
        if hour < 18 { return "Good afternoon" }
        return "Good evening"
    }

    static func firstNameOf(_ name: String?, fallback: String?) -> String {
        // JS `||` treats empty strings as missing too.
        let source = [name, fallback].compactMap { $0 }.first { !$0.isEmpty } ?? "there"
        let trimmed = source.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
    }
}
