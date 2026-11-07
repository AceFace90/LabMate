import PhotosUI
import SwiftUI
import UniformTypeIdentifiers
import VisionKit

/// Port of src/components/UploadFlow.tsx: PDF / pasted text, plus native-only camera
/// document scan and photo import (Vision OCR). Same review-before-save step, and only
/// recognised results are saved - "unmatched:" rows are shown but dropped.
struct ImportView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    enum Stage {
        case idle
        case paste
        case parsing(String)
        case review(sourceName: String, outcome: ParseOutcome)
        case error(String)
    }

    @State private var stage: Stage = .idle
    @State private var showFilePicker = false
    @State private var showScanner = false
    @State private var photoItem: PhotosPickerItem?

    // Password prompt - the password is used once for this parse and never stored.
    @State private var lockedPdf: URL?
    @State private var password = ""
    @State private var passwordError: String?

    @State private var pastedText = ""
    @State private var pastedDateOn = false
    @State private var pastedDate = Date()

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close", systemImage: "xmark") { dismiss() }
                    }
                }
        }
        .fileImporter(isPresented: $showFilePicker, allowedContentTypes: [.pdf]) { result in
            if case .success(let url) = result { importPdf(from: url) }
        }
        .fullScreenCover(isPresented: $showScanner) {
            DocumentScanner { images in
                showScanner = false
                if !images.isEmpty { parseImages(images, name: "Scanned report") }
            } onCancel: { showScanner = false }
            .ignoresSafeArea()
        }
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            photoItem = nil
            Task { await importPhoto(item) }
        }
        .alert("Password required", isPresented: Binding(get: { lockedPdf != nil }, set: { if !$0 { cancelPassword() } })) {
            SecureField("PDF password", text: $password)
            Button("Unlock") { if let url = lockedPdf { parsePdf(url, password: password) } }
            Button("Cancel", role: .cancel) { cancelPassword() }
        } message: {
            Text([lockedPdf?.lastPathComponent, passwordError].compactMap { $0 }.joined(separator: "\n"))
        }
    }

    private var title: String {
        switch stage {
        case .review: "Review Results"
        case .paste: "Paste Text"
        default: "Import Results"
        }
    }

    @ViewBuilder private var content: some View {
        switch stage {
        case .idle: idleView
        case .paste: pasteView
        case .parsing(let what):
            ProgressView(what).frame(maxWidth: .infinity, maxHeight: .infinity).background(HealthColor.canvas)
        case .error(let message): errorView(message)
        case .review(let name, let outcome): reviewView(name, outcome)
        }
    }

    // MARK: - Idle

    private var idleView: some View {
        HealthPage {
            VStack(alignment: .leading, spacing: 8) {
                Text("Add Your Results").healthHeadline()
                Text("Import a pathology report and LabMate will read each marker, its range and the collection date. You'll review everything before it's saved.")
                    .healthNarrative()
            }
            .padding(.top, 8)

            VStack(spacing: 12) {
                ImportOption(title: "Choose PDF", subtitle: "A report from your lab or GP. Password-protected files are supported.",
                             symbol: "doc.richtext.fill", color: HealthColor.heart) { showFilePicker = true }
                if VNDocumentCameraViewController.isSupported {
                    ImportOption(title: "Scan Paper Report", subtitle: "Use the camera to capture a printed report.",
                                 symbol: "doc.viewfinder.fill", color: HealthColor.vitals) { showScanner = true }
                }
                PhotosPicker(selection: $photoItem, matching: .images) {
                    ImportOptionLabel(title: "From Photos", subtitle: "A screenshot or photo of your results.",
                                      symbol: "photo.fill", color: HealthColor.sleepTeal)
                }
                .buttonStyle(.plain)
                ImportOption(title: "Paste Text", subtitle: "Copy results from a lab portal or Live Text and paste them in.",
                             symbol: "doc.on.clipboard.fill", color: HealthColor.purple) { stage = .paste }
            }

            Label("Reports are read on your iPhone. Passwords are used once and never stored.", systemImage: "lock.fill")
                .font(.footnote).foregroundStyle(.secondary)
        }
    }

    // MARK: - Paste

    private var pasteView: some View {
        Form {
            Section {
                TextEditor(text: $pastedText)
                    .font(.system(.footnote, design: .monospaced))
                    .frame(minHeight: 240)
                    .overlay(alignment: .topLeading) {
                        if pastedText.isEmpty {
                            Text("Paste results here").foregroundStyle(.tertiary).padding(.top, 8).padding(.leading, 5)
                                .allowsHitTesting(false)
                        }
                    }
                if pastedText.isEmpty {
                    PasteButton(payloadType: String.self) { strings in
                        pastedText = strings.joined(separator: "\n")
                    }
                }
            } footer: {
                Text("Copy the results from a PDF or your lab's web portal and paste them above.")
            }
            Section {
                Toggle("Set collection date", isOn: $pastedDateOn)
                if pastedDateOn {
                    DatePicker("Collection date", selection: $pastedDate, in: ...Date(), displayedComponents: .date)
                }
            } footer: {
                Text("Only needed if the text doesn't include the collection date.")
            }
            Section {
                Button("Read Results") {
                    let date = pastedDateOn ? DateUtils.iso(from: pastedDate) : nil
                    stage = .review(sourceName: "Pasted text", outcome: LabReportParser.parseText(pastedText, defaultDate: date))
                }
                .disabled(pastedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button("Cancel", role: .cancel) { stage = .idle }
            }
        }
    }

    // MARK: - Error

    private func errorView(_ message: String) -> some View {
        ContentUnavailableView {
            Label("Couldn't Read That", systemImage: "exclamationmark.triangle.fill")
        } description: {
            Text(message)
        } actions: {
            Button("Try Another") { stage = .idle }.buttonStyle(.borderedProminent)
        }
        .background(HealthColor.canvas)
    }

    // MARK: - Review

    private func reviewView(_ sourceName: String, _ outcome: ParseOutcome) -> some View {
        let recognised = outcome.results.filter { !$0.markerKey.hasPrefix("unmatched:") }
        let dates = Set(recognised.map(\.date)).sorted()
        return List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(recognised.isEmpty ? "Nothing Recognised" : "\(recognised.count) Results Found")
                        .font(.title2.bold())
                    Text(reviewNarrative(outcome, recognised: recognised, dates: dates))
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }
            if !outcome.warnings.isEmpty {
                Section("Warnings") {
                    ForEach(Array(outcome.warnings.enumerated()), id: \.offset) { _, w in
                        Label(w, systemImage: "exclamationmark.triangle.fill").foregroundStyle(HealthColor.serious)
                            .font(.subheadline)
                    }
                }
            }
            if !outcome.results.isEmpty {
                Section(sourceName) {
                    ForEach(outcome.results) { ReviewRow(result: $0) }
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                Button {
                    store.importResults(recognised)
                    dismiss()
                } label: {
                    Text(recognised.isEmpty ? "Nothing to Save" : "Save \(recognised.count) Results").frame(maxWidth: .infinity)
                }
                .buttonStyle(.glassProminent)
                .controlSize(.large)
                .disabled(recognised.isEmpty)
                HStack {
                    if sourceName == "Pasted text" {
                        Button("Edit Text") { stage = .paste }
                    }
                    Spacer()
                    Button("Discard", role: .destructive) { stage = .idle }
                }
                .font(.subheadline)
            }
            .padding()
            .background(.bar)
        }
    }

    private func reviewNarrative(_ outcome: ParseOutcome, recognised: [MarkerResult], dates: [String]) -> String {
        if recognised.isEmpty {
            return "LabMate couldn't match any markers in this report. It may not be a supported pathology format."
        }
        let unmatched = outcome.results.count - recognised.count
        let flagged = recognised.filter { $0.flag != .none }.count
        var parts: [String] = []
        if let first = dates.first, let last = dates.last {
            parts.append(first == last ? "Collected \(DateUtils.formatIsoDate(first))." :
                "Collected between \(DateUtils.formatIsoDate(first)) and \(DateUtils.formatIsoDate(last)).")
        }
        if flagged > 0 { parts.append("\(flagged) flagged by the lab.") }
        if unmatched > 0 { parts.append("\(unmatched) unrecognised \(unmatched == 1 ? "row" : "rows") won't be saved.") }
        return parts.joined(separator: " ")
    }

    // MARK: - Parsing

    private func importPdf(from picked: URL) {
        // fileImporter hands back a security-scoped URL; copy it into our sandbox so the
        // parser (and a later password retry) can read it freely.
        let scoped = picked.startAccessingSecurityScopedResource()
        defer { if scoped { picked.stopAccessingSecurityScopedResource() } }
        let dir = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        let local = dir.appending(path: picked.lastPathComponent)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: picked, to: local)
            parsePdf(local, password: nil)
        } catch {
            stage = .error("Couldn't open that file.")
        }
    }

    private func parsePdf(_ url: URL, password pw: String?) {
        lockedPdf = nil
        stage = .parsing("Reading PDF…")
        Task {
            do {
                let outcome = try await LabReportParser.parsePdf(url: url, password: pw)
                password = ""
                passwordError = nil
                stage = .review(sourceName: url.lastPathComponent, outcome: outcome)
            } catch PdfParseError.passwordNeeded {
                passwordError = nil
                stage = .idle
                lockedPdf = url
            } catch PdfParseError.wrongPassword {
                passwordError = "That password did not work - try again."
                password = ""
                stage = .idle
                lockedPdf = url
            } catch {
                stage = .error("Could not read that PDF. It may not be a supported pathology report.")
            }
        }
    }

    private func cancelPassword() {
        lockedPdf = nil
        password = ""
        passwordError = nil
    }

    private func importPhoto(_ item: PhotosPickerItem) async {
        stage = .parsing("Reading photo…")
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else {
            stage = .error("Couldn't load that photo.")
            return
        }
        parseImages([image], name: "Photo")
    }

    private func parseImages(_ images: [UIImage], name: String) {
        stage = .parsing("Reading text…")
        Task {
            var all = ParseOutcome(results: [], warnings: [])
            for (i, image) in images.enumerated() {
                guard let cg = image.uprightCGImage else { continue }
                let pageName = images.count > 1 ? "\(name) p\(i + 1)" : name
                if let outcome = try? await LabReportParser.parseImage(cg, fileName: pageName, defaultDate: nil) {
                    all.results += outcome.results
                    all.warnings += outcome.warnings
                }
            }
            if all.results.isEmpty {
                stage = .error("No results could be read from that image. Try a sharper, well-lit photo taken straight on.")
            } else {
                stage = .review(sourceName: name, outcome: all)
            }
        }
    }
}

// MARK: - Pieces

private struct ImportOption: View {
    let title: String, subtitle: String, symbol: String, color: Color
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            ImportOptionLabel(title: title, subtitle: subtitle, symbol: symbol, color: color)
        }
        .buttonStyle(.plain)
    }
}

private struct ImportOptionLabel: View {
    let title: String, subtitle: String, symbol: String, color: Color
    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.title2)
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(color.gradient, in: .rect(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
        }
        .padding(HealthMetrics.cardPadding)
        .background(HealthColor.card, in: .rect(cornerRadius: HealthMetrics.cardRadius, style: .continuous))
        .contentShape(.rect)
    }
}

private struct ReviewRow: View {
    let result: MarkerResult
    var body: some View {
        let known = !result.markerKey.hasPrefix("unmatched:")
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(known ? (MarkerCatalog.marker(result.markerKey)?.label ?? result.rawName) : result.rawName)
                    .font(.body.weight(.medium))
                    .foregroundStyle(known ? .primary : .secondary)
                HStack(spacing: 6) {
                    Text(DateUtils.formatIsoDate(result.date))
                    if !result.rangeText.isEmpty { Text("· \(result.rangeText)") }
                }
                .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(result.displayValue) \(result.unit)")
                    .font(.body.monospacedDigit())
                    .foregroundStyle(result.flag != .none ? HealthColor.serious : .primary)
                if !known {
                    Text("Unrecognised").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                } else if result.flag != .none {
                    Text("Flagged").font(.caption2.weight(.semibold)).foregroundStyle(HealthColor.serious)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// VisionKit document camera - auto edge detection + perspective correction, multi-page.
struct DocumentScanner: UIViewControllerRepresentable {
    let onFinish: ([UIImage]) -> Void
    let onCancel: () -> Void

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let vc = VNDocumentCameraViewController()
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: VNDocumentCameraViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish, onCancel: onCancel) }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let onFinish: ([UIImage]) -> Void
        let onCancel: () -> Void
        init(onFinish: @escaping ([UIImage]) -> Void, onCancel: @escaping () -> Void) {
            self.onFinish = onFinish
            self.onCancel = onCancel
        }
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            onFinish((0..<scan.pageCount).map { scan.imageOfPage(at: $0) })
        }
        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) { onCancel() }
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) { onCancel() }
    }
}

private extension UIImage {
    /// Vision reads CGImage pixels without EXIF orientation, so redraw upright first.
    var uprightCGImage: CGImage? {
        if imageOrientation == .up, let cg = cgImage { return cg }
        let renderer = UIGraphicsImageRenderer(size: size, format: { let f = UIGraphicsImageRendererFormat(); f.scale = scale; return f }())
        return renderer.image { _ in draw(at: .zero) }.cgImage
    }
}

#Preview {
    ImportView().environment(AppStore())
}
