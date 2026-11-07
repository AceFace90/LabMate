import SwiftUI

/// Add-a-result-by-hand form (port of the web "+ Add a result by hand" form).
struct AddResultSheet: View {
    let markerKey: String
    let label: String
    let unit: String
    let prefillLow: Double?
    let prefillHigh: Double?
    let onSave: (MarkerResult) -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var date = Date()
    @State private var value = ""
    @State private var low = ""
    @State private var high = ""
    @State private var duplicate = false

    private var numeric: Double? { MarkerFormat.parse(value) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Date", selection: $date, in: ...Date(), displayedComponents: .date)
                    HStack {
                        Text("Value")
                        TextField(unit.isEmpty ? "No unit" : unit, text: $value)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            .accessibilityLabel("Value in \(unit.isEmpty ? "no unit" : unit)")
                    }
                }
                Section {
                    RangeFields(low: $low, high: $high)
                } header: { Text("Reference range (optional)") }
                footer: { Text("As printed on your report. Leave blank to use the general range, if one exists.") }
                if duplicate {
                    Section { Label("A result for this date and value already exists.", systemImage: "exclamationmark.triangle.fill").foregroundStyle(HealthColor.serious) }
                }
            }
            .navigationTitle("Add \(label)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(numeric == nil)
                }
            }
            .onAppear {
                if low.isEmpty, let l = prefillLow { low = MarkerFormat.number(l) }
                if high.isEmpty, let h = prefillHigh { high = MarkerFormat.number(h) }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func save() {
        guard let v = numeric else { return }
        let r = MarkerFormat.rangeFields(low: low, high: high)
        let result = MarkerResult(
            id: "", markerKey: markerKey, rawName: label,
            date: MarkerFormat.localIso(date), value: v,
            displayValue: value.trimmingCharacters(in: .whitespaces),
            flag: .none, rangeLow: r.low, rangeHigh: r.high, rangeText: r.text,
            unit: unit, sourceFile: "manual entry", panel: "Manual",
            addedManually: true, derived: nil, createdAt: ""
        )
        if onSave(result) { dismiss() } else { duplicate = true }
    }
}

/// Edit a result's date / value / range (ResultPatch). Unit is editable too.
struct EditResultSheet: View {
    let result: MarkerResult
    let onSave: (ResultPatch) -> Void
    let onDelete: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var date: Date
    @State private var value: String
    @State private var low: String
    @State private var high: String
    @State private var unit: String
    @State private var confirmDelete = false

    init(result: MarkerResult, onSave: @escaping (ResultPatch) -> Void, onDelete: @escaping () -> Void) {
        self.result = result
        self.onSave = onSave
        self.onDelete = onDelete
        _date = State(initialValue: MarkerFormat.localDate(fromIso: result.date))
        _value = State(initialValue: result.value.map(MarkerFormat.number) ?? "")
        _low = State(initialValue: result.rangeLow.map(MarkerFormat.number) ?? "")
        _high = State(initialValue: result.rangeHigh.map(MarkerFormat.number) ?? "")
        _unit = State(initialValue: result.unit)
    }

    private var numeric: Double? { MarkerFormat.parse(value) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Date", selection: $date, in: ...Date(), displayedComponents: .date)
                    HStack {
                        Text("Value")
                        TextField("Value", text: $value).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    }
                    HStack {
                        Text("Unit")
                        TextField("Unit", text: $unit).multilineTextAlignment(.trailing)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                    }
                }
                Section("Reference range") { RangeFields(low: $low, high: $high) }
                Section("Source") {
                    Text(result.addedManually ? "Manual entry" : result.sourceFile).foregroundStyle(.secondary)
                }
                Section {
                    Button("Delete Result", role: .destructive) { confirmDelete = true }
                }
            }
            .navigationTitle("Edit Result")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        guard let v = numeric else { return }
                        let r = MarkerFormat.rangeFields(low: low, high: high)
                        onSave(ResultPatch(
                            date: MarkerFormat.localIso(date), value: .some(v),
                            displayValue: value.trimmingCharacters(in: .whitespaces),
                            rangeLow: .some(r.low), rangeHigh: .some(r.high), rangeText: r.text,
                            unit: unit.trimmingCharacters(in: .whitespaces)
                        ))
                        dismiss()
                    }
                    .disabled(numeric == nil)
                }
            }
            .confirmationDialog("Delete this result?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete", role: .destructive) { onDelete(); dismiss() }
            } message: { Text("This can't be undone.") }
        }
        .presentationDetents([.large])
    }
}

private struct RangeFields: View {
    @Binding var low: String
    @Binding var high: String
    var body: some View {
        HStack {
            TextField("Low", text: $low).keyboardType(.numbersAndPunctuation).accessibilityLabel("Range low")
            Text("–").foregroundStyle(.secondary)
            TextField("High", text: $high).keyboardType(.numbersAndPunctuation).multilineTextAlignment(.trailing).accessibilityLabel("Range high")
        }
    }
}

/// Add-a-custom-marker form (name + optional unit).
struct AddCustomMarkerSheet: View {
    let onAdd: (String, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var label = ""
    @State private var unit = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name, e.g. Sleep score", text: $label)
                    TextField("Unit (optional), e.g. /100", text: $unit)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                } footer: { Text("Anything you want to track that isn't in the built-in list.") }
            }
            .navigationTitle("New Custom Metric")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        onAdd(label.trimmingCharacters(in: .whitespaces), unit.trimmingCharacters(in: .whitespaces))
                        dismiss()
                    }
                    .disabled(label.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
