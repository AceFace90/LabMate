import Foundation
import Observation
import UIKit
import FirebaseCore
import FirebaseAuth
import FirebaseFirestore
import GoogleSignIn

struct AuthUser: Equatable, Sendable {
    let uid: String
    let email: String?
    let displayName: String?
    let photoURL: URL?
}

enum AuthServiceError: LocalizedError {
    case cloudUnavailable, noRootViewController, missingToken, noUser
    var errorDescription: String? {
        switch self {
        case .cloudUnavailable: "Cloud sync is not configured (GoogleService-Info.plist missing)."
        case .noRootViewController: "No window available to present sign-in."
        case .missingToken: "Google did not return an ID token."
        case .noUser: "Not signed in."
        }
    }
}

@Observable
final class AuthService {
    private(set) var user: AuthUser?
    /// True until Firebase reports the first auth state (immediately false in local-only mode).
    private(set) var initializing = true
    /// False when GoogleService-Info.plist is missing: app runs local-only.
    private(set) var isCloudAvailable = false
    /// Underlying Firebase user, needed by CloudStore.
    @ObservationIgnored private(set) var firebaseUser: User?
    @ObservationIgnored private var handle: AuthStateDidChangeListenerHandle?
    /// Called on every auth state change (including the first one).
    @ObservationIgnored var onUserChange: ((AuthUser?) -> Void)?

    /// Configures Firebase if possible. Call once at launch.
    func start() {
        if FirebaseApp.app() == nil {
            guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else {
                isCloudAvailable = false
                initializing = false
                onUserChange?(nil)
                return
            }
            FirebaseApp.configure()
            // Persistent on-device cache (unlimited) so launches read from disk and only
            // server deltas come over the network. Listener callbacks go to a background
            // queue so decoding hundreds of results never blocks the main thread.
            let settings = FirestoreSettings()
            settings.cacheSettings = PersistentCacheSettings(sizeBytes: NSNumber(value: FirestoreCacheSizeUnlimited))
            settings.dispatchQueue = DispatchQueue(label: "labmate.firestore", qos: .userInitiated)
            Firestore.firestore().settings = settings
        }
        isCloudAvailable = true
        handle = Auth.auth().addStateDidChangeListener { [weak self] _, fbUser in
            MainActor.assumeIsolated { self?.apply(fbUser) }
        }
    }

    private func apply(_ fbUser: User?) {
        firebaseUser = fbUser
        user = fbUser.map { AuthUser(uid: $0.uid, email: $0.email, displayName: $0.displayName, photoURL: $0.photoURL) }
        initializing = false
        onUserChange?(user)
    }

    func signInWithGoogle() async throws {
        guard isCloudAvailable else { throw AuthServiceError.cloudUnavailable }
        let credential = try await googleCredential()
        _ = try await Auth.auth().signIn(with: credential)
    }

    /// Fresh Google credential, used by the deleteAccount reauth retry.
    func reauthenticate() async throws {
        guard let fb = firebaseUser else { throw AuthServiceError.noUser }
        let credential = try await googleCredential()
        nonisolated(unsafe) let u = fb
        _ = try await u.reauthenticate(with: credential)
    }

    func signOut() throws {
        guard isCloudAvailable else { return }
        GIDSignIn.sharedInstance.signOut()
        try Auth.auth().signOut()
    }

    private func googleCredential() async throws -> AuthCredential {
        guard let clientID = FirebaseApp.app()?.options.clientID else { throw AuthServiceError.cloudUnavailable }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        guard let root = Self.rootViewController() else { throw AuthServiceError.noRootViewController }
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: root)
        guard let idToken = result.user.idToken?.tokenString else { throw AuthServiceError.missingToken }
        return GoogleAuthProvider.credential(withIDToken: idToken, accessToken: result.user.accessToken.tokenString)
    }

    private static func rootViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap(\.windows).first { $0.isKeyWindow } ?? scenes.flatMap(\.windows).first
        var top = window?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
