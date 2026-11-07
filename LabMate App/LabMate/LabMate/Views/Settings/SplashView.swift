import SwiftUI

/// Welcome screen. Port of Splash.tsx with a Health-style hero.
struct SplashView: View {
    @Environment(AppStore.self) private var store
    @State private var showNameInput = false
    @State private var name = ""
    @FocusState private var nameFocused: Bool

    private let features: [(symbol: String, tint: Color, title: String, desc: String)] = [
        ("doc.text.fill", HealthColor.vitals, "Import lab PDFs", "Drop in a pathology report and every marker is parsed automatically."),
        ("chart.line.uptrend.xyaxis", HealthColor.good, "Track trends over time", "See how each marker moves across every test you've ever had."),
        ("heart.text.square.fill", HealthColor.heart, "Biological age estimate", "A PhenoAge-based estimate from your own routine bloodwork."),
    ]

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                hero
                featuresCard
                if let err = store.authError {
                    Text(err).font(.subheadline).foregroundStyle(HealthColor.critical)
                        .accessibilityLabel("Error: \(err)")
                }
                if showNameInput { nameCard } else { actions }
            }
            .padding(.horizontal, HealthMetrics.pagePadding)
            .padding(.vertical, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(HealthColor.canvas.ignoresSafeArea())
        .animation(.default, value: showNameInput)
    }

    private var hero: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(RadialGradient(colors: [HealthColor.heart.opacity(0.35), .clear], center: .center, startRadius: 4, endRadius: 110))
                    .frame(width: 220, height: 220)
                    .blur(radius: 8)
                Image(systemName: "drop.fill")
                    .font(.system(size: 84))
                    .foregroundStyle(LinearGradient(colors: [HealthColor.heart, HealthColor.orange], startPoint: .top, endPoint: .bottom))
                    .shadow(color: HealthColor.heart.opacity(0.4), radius: 16)
                Image(systemName: "heart.fill")
                    .font(.system(size: 26))
                    .foregroundStyle(.white)
                    .offset(y: 12)
            }
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 8) {
                Text("Welcome to LabMate").healthHeadline()
                Text("Blood test tracking, over time. Bring your results together and see what they say about your health.")
                    .healthNarrative()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
        }
    }

    private var featuresCard: some View {
        HealthCard {
            ForEach(Array(features.enumerated()), id: \.offset) { i, f in
                if i > 0 { Divider() }
                HStack(alignment: .top, spacing: 14) {
                    Image(systemName: f.symbol).font(.title2).foregroundStyle(f.tint).frame(width: 32)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(f.title).font(.headline)
                        Text(f.desc).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    private var actions: some View {
        VStack(spacing: 12) {
            Button { showNameInput = true; nameFocused = true } label: {
                Label("Quick Start", systemImage: "arrow.right.circle.fill")
                    .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(HealthColor.heart)
            .controlSize(.large)
            .accessibilityHint("Enter your name and start using LabMate on this device")

            if store.isCloudAvailable {
                Button { Task { await store.signIn() } } label: {
                    Label(store.migrating ? "Signing in..." : "Continue with Google", systemImage: "person.crop.circle.badge.checkmark")
                        .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(store.migrating)
                .accessibilityHint("Sync across devices with a secure cloud backup")
                Text("Sync across devices - secure cloud backup")
                    .font(.footnote).foregroundStyle(.secondary)
            }

            Button("Skip for now - use LabMate without a name") { store.skipSplash() }
                .font(.subheadline)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
    }

    private var nameCard: some View {
        HealthCard {
            Text("What should we call you?").font(.title3.weight(.semibold))
            TextField("Your name", text: $name)
                .textContentType(.givenName)
                .focused($nameFocused)
                .submitLabel(.continue)
                .onSubmit(proceed)
                .padding(12)
                .background(HealthColor.canvas, in: .rect(cornerRadius: 12, style: .continuous))
            Button(action: proceed) {
                Text("Continue").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(HealthColor.heart)
            .controlSize(.large)
            .disabled(trimmedName.isEmpty)
            Button("Back") { showNameInput = false }
                .font(.subheadline)
        }
    }

    private func proceed() {
        guard !trimmedName.isEmpty else { return }
        store.quickStart(name: trimmedName)
    }
}

#Preview {
    SplashView().environment(AppStore())
}
