import Foundation

/// Public URLs required by App Store Review (guidelines 5.1.1 privacy policy, 1.5 support).
/// Set these before submission; rows are hidden while nil. The same URLs must be entered in App Store Connect.
enum AppLinks {
    static let privacyPolicy: URL? = URL(string: "https://aceface90.github.io/LabMate/privacy.html")
    static let support: URL? = URL(string: "mailto:wacorrey+labmate@gmail.com")
}

/// Sign in with Apple needs a paid Apple Developer Program account (capability + entitlement
/// `com.apple.developer.applesignin`). Set to true, re-add the entitlement to LabMate.entitlements,
/// and enable the Apple provider in Firebase once the account exists. Guideline 4.8 requires it
/// whenever another third-party login (Google) is offered.
enum Features {
    static let signInWithApple = false
}
