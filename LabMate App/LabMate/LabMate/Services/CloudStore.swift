import Foundation
import FirebaseAuth
import FirebaseFirestore

/// Port of src/lib/cloudStorage.ts + firebase.ts. Schema:
/// users/{uid}, users/{uid}/results/{id}, users/{uid}/customMarkers/{key}.
nonisolated struct CloudStore: Sendable {
    private nonisolated var db: Firestore { Firestore.firestore() }
    private nonisolated func userDoc(_ uid: String) -> DocumentReference { db.collection("users").document(uid) }
    private nonisolated func resultsCol(_ uid: String) -> CollectionReference { userDoc(uid).collection("results") }
    private nonisolated func customCol(_ uid: String) -> CollectionReference { userDoc(uid).collection("customMarkers") }

    // MARK: Listeners (return a cancel closure)

    /// Listener callbacks arrive on Firestore's background dispatch queue (configured in
    /// AuthService), so decoding never blocks the UI. Only changed documents are decoded:
    /// the first snapshot comes from the on-device cache, later ones carry just the deltas.
    nonisolated func subscribeResults(uid: String, _ cb: @escaping @Sendable @MainActor ([MarkerResult]) -> Void) -> () -> Void {
        subscribeCollection(resultsCol(uid), as: MarkerResult.self, cb)
    }

    nonisolated func subscribeCustomMarkers(uid: String, _ cb: @escaping @Sendable @MainActor ([CustomMarker]) -> Void) -> () -> Void {
        subscribeCollection(customCol(uid), as: CustomMarker.self, cb)
    }

    private nonisolated final class DocBox<T>: @unchecked Sendable { var byID: [String: T] = [:]; var order: [String] = [] }

    private nonisolated func subscribeCollection<T: Decodable & Sendable>(
        _ col: CollectionReference, as: T.Type, _ cb: @escaping @Sendable @MainActor ([T]) -> Void
    ) -> () -> Void {
        let box = DocBox<T>()
        let reg = col.addSnapshotListener { snap, _ in
            guard let snap else { return }
            var changed = false
            for change in snap.documentChanges {
                let id = change.document.documentID
                switch change.type {
                case .removed:
                    if box.byID.removeValue(forKey: id) != nil { changed = true }
                case .added, .modified:
                    if let item = try? change.document.data(as: T.self) {
                        if box.byID[id] == nil { box.order.append(id) }
                        box.byID[id] = item
                        changed = true
                    }
                }
            }
            guard changed else { return }
            box.order.removeAll { box.byID[$0] == nil }
            let items = box.order.compactMap { box.byID[$0] }
            Task { @MainActor in cb(items) }
        }
        return { reg.remove() }
    }

    nonisolated func subscribeProfile(uid: String, _ cb: @escaping @Sendable @MainActor (Profile) -> Void) -> () -> Void {
        let reg = userDoc(uid).addSnapshotListener { snap, _ in
            guard let snap else { return }
            let d = snap.data() ?? [:]
            let profile = Profile(
                name: d["name"] as? String,
                birthDate: d["birthDate"] as? String,
                sex: (d["sex"] as? String).flatMap(Sex.init(rawValue:)),
                takesCreatineSupplement: d["takesCreatineSupplement"] as? Bool,
                theme: (d["theme"] as? String).flatMap(ThemePreference.init(rawValue:)))
            Task { @MainActor in cb(profile) }
        }
        return { reg.remove() }
    }

    // MARK: Writes

    func saveResult(uid: String, _ result: MarkerResult) async throws {
        try resultsCol(uid).document(result.id).setData(from: result)
    }

    /// Writes many results in Firestore batches (max 500 ops each) - one round trip per
    /// batch instead of one per document, and one listener event instead of hundreds.
    func saveResults(uid: String, _ results: [MarkerResult]) async throws {
        var i = 0
        while i < results.count {
            let batch = db.batch()
            for r in results[i..<min(i + 450, results.count)] {
                try batch.setData(from: r, forDocument: resultsCol(uid).document(r.id))
            }
            try await batch.commit()
            i += 450
        }
    }

    /// Upserts `upserts` and deletes `deleteIDs` / custom markers `deleteCustomKeys`, in batches.
    func replaceResults(uid: String, upserts: [MarkerResult], deleteIDs: [String], deleteCustomKeys: [String] = []) async throws {
        enum Op { case set(MarkerResult), delResult(String), delCustom(String) }
        let ops = upserts.map(Op.set) + deleteIDs.map(Op.delResult) + deleteCustomKeys.map(Op.delCustom)
        var i = 0
        while i < ops.count {
            let batch = db.batch()
            for op in ops[i..<min(i + 450, ops.count)] {
                switch op {
                case .set(let r): try batch.setData(from: r, forDocument: resultsCol(uid).document(r.id))
                case .delResult(let id): batch.deleteDocument(resultsCol(uid).document(id))
                case .delCustom(let key): batch.deleteDocument(customCol(uid).document(key))
                }
            }
            try await batch.commit()
            i += 450
        }
    }

    func deleteResult(uid: String, id: String) async throws {
        try await resultsCol(uid).document(id).delete()
    }

    func updateResult(uid: String, id: String, patch: ResultPatch) async throws {
        var fields: [String: Any] = [:]
        if let v = patch.date { fields["date"] = v }
        if let v = patch.value { fields["value"] = v ?? NSNull() }
        if let v = patch.displayValue { fields["displayValue"] = v }
        if let v = patch.rangeLow { fields["rangeLow"] = v ?? NSNull() }
        if let v = patch.rangeHigh { fields["rangeHigh"] = v ?? NSNull() }
        if let v = patch.rangeText { fields["rangeText"] = v }
        if let v = patch.unit { fields["unit"] = v }
        guard !fields.isEmpty else { return }
        try await resultsCol(uid).document(id).updateData(fields)
    }

    func saveCustomMarker(uid: String, _ marker: CustomMarker) async throws {
        try customCol(uid).document(marker.key).setData(from: marker)
    }

    /// Merge write that omits nil fields (nil never erases a stored value).
    func saveProfile(uid: String, _ profile: Profile) async throws {
        var data = Self.profileFields(profile)
        data["updatedAt"] = FieldValue.serverTimestamp()
        try await userDoc(uid).setData(data, merge: true)
    }

    private static func profileFields(_ p: Profile) -> [String: Any] {
        var d: [String: Any] = [:]
        if let v = p.name { d["name"] = v }
        if let v = p.birthDate { d["birthDate"] = v }
        if let v = p.sex { d["sex"] = v.rawValue }
        if let v = p.takesCreatineSupplement { d["takesCreatineSupplement"] = v }
        if let v = p.theme { d["theme"] = v.rawValue }
        return d
    }

    // MARK: Migration / deletion

    /// Runs once after sign-in. Merges local-only data into the account (deduped via
    /// ResultMerge) and returns; the caller clears the local copy afterwards.
    func migrateLocalDataToCloud(user: User, results localResults: [MarkerResult],
                                 customMarkers localCustom: [CustomMarker], profile localProfile: Profile) async throws {
        let uid = user.uid
        let userSnap = try await userDoc(uid).getDocument()
        let isFirstSignIn = !userSnap.exists
        async let rSnap = resultsCol(uid).getDocuments()
        async let cSnap = customCol(uid).getDocuments()
        let (existingResultsSnap, existingCustomSnap) = try await (rSnap, cSnap)
        let existing = existingResultsSnap.documents.compactMap { try? $0.data(as: MarkerResult.self) }
        let existingKeys = Set(existingCustomSnap.documents.map(\.documentID))

        let merged = ResultMerge.mergeResults(existing, localResults)
        let existingIDs = Set(existing.map(\.id))
        let newCustom = localCustom.filter { !existingKeys.contains($0.key) }

        let batch = db.batch()
        var userData: [String: Any] = ["updatedAt": FieldValue.serverTimestamp()]
        if let v = user.email { userData["email"] = v }
        if let v = user.displayName { userData["displayName"] = v }
        if let v = user.photoURL { userData["photoURL"] = v.absoluteString }
        if isFirstSignIn {
            userData.merge(Self.profileFields(localProfile)) { a, _ in a }
            userData["createdAt"] = FieldValue.serverTimestamp()
        }
        batch.setData(userData, forDocument: userDoc(uid), merge: true)
        for r in merged where !existingIDs.contains(r.id) {
            try batch.setData(from: r, forDocument: resultsCol(uid).document(r.id))
        }
        for m in newCustom {
            try batch.setData(from: m, forDocument: customCol(uid).document(m.key))
        }
        try await batch.commit()
    }

    /// Deletes all results/custom markers and resets profile fields; keeps the account doc.
    func deleteAllCloudData(uid: String) async throws {
        async let rSnap = resultsCol(uid).getDocuments()
        async let cSnap = customCol(uid).getDocuments()
        let (r, c) = try await (rSnap, cSnap)
        let batch = db.batch()
        for d in r.documents + c.documents { batch.deleteDocument(d.reference) }
        batch.setData([
            "name": FieldValue.delete(),
            "birthDate": NSNull(),
            "sex": NSNull(),
            "takesCreatineSupplement": FieldValue.delete(),
            "theme": FieldValue.delete(),
            "updatedAt": FieldValue.serverTimestamp(),
        ], forDocument: userDoc(uid), merge: true)
        try await batch.commit()
    }

    /// Deletes Firestore data, then the Auth account. If Firebase demands a recent login,
    /// `reauthenticate` runs once and deletion is retried.
    func deleteAccount(user: User, reauthenticate: () async throws -> Void) async throws {
        let uid = user.uid
        async let rSnap = resultsCol(uid).getDocuments()
        async let cSnap = customCol(uid).getDocuments()
        let (r, c) = try await (rSnap, cSnap)
        let batch = db.batch()
        for d in r.documents + c.documents { batch.deleteDocument(d.reference) }
        batch.deleteDocument(userDoc(uid))
        try await batch.commit()
        nonisolated(unsafe) let fbUser = user
        do {
            try await fbUser.delete()
        } catch let err as NSError where err.domain == AuthErrorDomain && err.code == AuthErrorCode.requiresRecentLogin.rawValue {
            try await reauthenticate()
            try await fbUser.delete()
        }
    }
}
