const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = () => admin.firestore();
const TRIAL_DAYS = 60;

/**
 * A contractor document is allowed to be self-created by the client (see
 * firestore.rules), but a client could set an arbitrary far-future
 * `trialEndsAt` to get free listing forever. This trigger immediately
 * overwrites the trust-sensitive fields with server-computed values right
 * after creation, so the client-supplied values never actually matter.
 * It also guarantees the public profile slug is unique.
 */
exports.onContractorCreate = functions.firestore
  .document("contractors/{contractorId}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const now = admin.firestore.Timestamp.now();
    const trialEndsAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const uniqueSlug = await ensureUniqueSlug(data.slug || slugify(data.businessName || "contractor"), context.params.contractorId);

    await snap.ref.update({
      slug: uniqueSlug,
      status: "pending",
      tier: "basic",
      tierRank: 2,
      subscriptionStatus: "trial",
      verified: false,
      identityChecked: false,
      trialEndsAt,
      createdAt: now,
      updatedAt: now,
      rating: 0,
      reviewCount: 0,
    });

    // Notify admins a new contractor is awaiting approval
    const adminsSnap = await admin.auth().listUsers().then((r) => r.users.filter((u) => u.customClaims?.role === "admin"));
    await Promise.all(
      adminsSnap.map((adminUser) =>
        db().collection("notifications").doc(adminUser.uid).collection("items").add({
          type: "contractor_pending_review",
          message: `${data.businessName} submitted a new listing awaiting approval.`,
          contractorId: context.params.contractorId,
          read: false,
          createdAt: now,
        })
      )
    );

    return null;
  });

function slugify(str) {
  return String(str).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function ensureUniqueSlug(baseSlug, contractorId) {
  let candidate = baseSlug;
  let suffix = 0;
  // Small bounded loop — collisions are rare, this only runs once per signup
  while (suffix < 20) {
    const existing = await db().collection("contractors").where("slug", "==", candidate).limit(1).get();
    if (existing.empty || existing.docs[0].id === contractorId) return candidate;
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
  return `${baseSlug}-${contractorId.slice(0, 6)}`;
}
