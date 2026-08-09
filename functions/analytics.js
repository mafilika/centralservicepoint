const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = () => admin.firestore();

/**
 * Callable (not onRequest) so it's easy to invoke from the client SDK with
 * httpsCallable, and so we get basic abuse protection (App Check can be
 * layered on later) without hand-rolling CORS. Analytics docs are
 * write-protected in firestore.rules — this function is the only path in.
 */
exports.logProfileView = functions.https.onCall(async (data, context) => {
  const { contractorId, source = "direct" } = data;
  if (!contractorId) throw new functions.https.HttpsError("invalid-argument", "contractorId is required.");

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD bucket
  const ref = db().collection("analytics").doc(contractorId);

  await ref.set(
    {
      profileViews: admin.firestore.FieldValue.increment(1),
      [`viewsBySource.${source}`]: admin.firestore.FieldValue.increment(1),
      [`dailyViews.${today}`]: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.Timestamp.now(),
    },
    { merge: true }
  );
  return { ok: true };
});

/** Same idea for a contractor appearing in a search results page — called
 * once per results page load with the list of contractor IDs shown. */
exports.logSearchImpressions = functions.https.onCall(async (data, context) => {
  const { contractorIds = [] } = data;
  if (!Array.isArray(contractorIds) || contractorIds.length === 0) return { ok: true };

  const batch = db().batch();
  contractorIds.slice(0, 50).forEach((id) => {
    batch.set(
      db().collection("analytics").doc(id),
      { searchAppearances: admin.firestore.FieldValue.increment(1) },
      { merge: true }
    );
  });
  await batch.commit();
  return { ok: true };
});
