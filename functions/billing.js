const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {
  createSubscriptionFields,
  verifyItnSignature,
  verifySourceHost,
  verifyWithPayfast,
} = require("./payfast");

const db = () => admin.firestore();

// Set with: firebase functions:config:set payfast.merchant_id="..." payfast.merchant_key="..." payfast.passphrase="..." payfast.sandbox="true" app.url="https://centralservicepoint.co.za"
const cfg = functions.config();
const payfastCfg = cfg.payfast || {};
const appUrl = cfg.app?.url || "https://centralservicepoint.co.za";

// professional = 1500 to match the standard Subscription Fee committed to in terms.html Clause 4
const TIER_PRICES = { basic: 0, professional: 1500, premium: 1899, enterprise: 3499 };
const TIER_RANK = { premium: 0, enterprise: 0, professional: 1, basic: 2 };
const TIER_LABELS = {
  professional: "Central Service Point - Professional Listing",
  premium: "Central Service Point - Premium Partner Listing",
  enterprise: "Central Service Point - Enterprise Listing",
};

exports.createCheckout = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== "contractor") {
    throw new functions.https.HttpsError("unauthenticated", "Sign in as a contractor to subscribe.");
  }
  const { tier } = data;
  const price = TIER_PRICES[tier];
  if (!price) throw new functions.https.HttpsError("invalid-argument", "Not a valid paid tier.");

  const contractorId = context.auth.uid;
  const contractorSnap = await db().collection("contractors").doc(contractorId).get();
  if (!contractorSnap.exists) throw new functions.https.HttpsError("not-found", "Complete your contractor profile first.");
  const contractor = contractorSnap.data();

  const mPaymentId = `${contractorId}-${Date.now()}`;

  await db().collection("payments").doc(mPaymentId).set({
    contractorId,
    tier,
    amount: price,
    status: "pending",
    invoiceNumber: `INV-${mPaymentId}`,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const { fields, processUrl } = createSubscriptionFields({
    merchantId: payfastCfg.merchant_id,
    merchantKey: payfastCfg.merchant_key,
    passphrase: payfastCfg.passphrase,
    returnUrl: `${appUrl}/dashboard.html?billing=success`,
    cancelUrl: `${appUrl}/dashboard.html?billing=cancelled`,
    notifyUrl: `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/payfastItn`,
    nameFirst: contractor.contactFirstName || "Contractor",
    nameLast: contractor.contactLastName || "",
    email: contractor.email,
    mPaymentId,
    itemName: TIER_LABELS[tier],
    itemDescription: `Monthly ${tier} listing subscription on Central Service Point`,
    amountRands: price,
    recurringAmountRands: price,
    frequency: 3,
    cycles: 0,
    customStr1: contractorId,
    customStr2: tier,
  });

  return { fields, processUrl };
});

exports.payfastItn = functions.https.onRequest(async (req, res) => {
  const body = req.body;
  const rawBody = req.rawBody ? req.rawBody.toString("utf8") : "";

  try {
    if (!verifyItnSignature(body, payfastCfg.passphrase)) {
      functions.logger.error("PayFast ITN: signature mismatch", body);
      return res.status(400).send("invalid signature");
    }
    const sourceIp = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    if (!(await verifySourceHost(sourceIp))) {
      functions.logger.error("PayFast ITN: request not from a PayFast host", sourceIp);
      return res.status(400).send("invalid source");
    }
    if (!(await verifyWithPayfast(rawBody))) {
      functions.logger.error("PayFast ITN: server-side validation failed");
      return res.status(400).send("not valid");
    }

    const paymentRef = db().collection("payments").doc(body.m_payment_id);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) {
      functions.logger.error("PayFast ITN: unknown m_payment_id", body.m_payment_id);
      return res.status(400).send("unknown payment");
    }
    const payment = paymentSnap.data();
    if (Number(body.amount_gross).toFixed(2) !== Number(payment.amount).toFixed(2)) {
      functions.logger.error("PayFast ITN: amount mismatch");
      return res.status(400).send("amount mismatch");
    }

    const contractorId = body.custom_str1;
    const tier = body.custom_str2;
    const contractorRef = db().collection("contractors").doc(contractorId);

    if (body.payment_status === "COMPLETE") {
      const now = admin.firestore.Timestamp.now();
      const nextPeriodEnd = admin.firestore.Timestamp.fromMillis(now.toMillis() + 31 * 24 * 60 * 60 * 1000);

      await db().runTransaction(async (tx) => {
        tx.update(contractorRef, {
          tier,
          tierRank: TIER_RANK[tier] ?? 2,
          subscriptionStatus: "active",
          currentPeriodEnd: nextPeriodEnd,
          payfastToken: body.token || admin.firestore.FieldValue.delete(),
          lastPaymentAt: now,
        });
        tx.update(paymentRef, { status: "paid", pfPaymentId: body.pf_payment_id, paidAt: now });
        tx.set(db().collection("subscriptions").doc(contractorId), {
          contractorId, tier, status: "active", renewalDate: nextPeriodEnd, updatedAt: now,
        }, { merge: true });
      });

      await db().collection("notifications").doc(contractorId).collection("items").add({
        type: "payment_success",
        message: `Your ${tier} subscription payment was successful. Next billing date: ${nextPeriodEnd.toDate().toDateString()}.`,
        read: false,
        createdAt: now,
      });
    } else if (body.payment_status === "FAILED") {
      await paymentRef.update({ status: "failed" });
      await contractorRef.update({ subscriptionStatus: "grace_period" });
      await db().collection("notifications").doc(contractorId).collection("items").add({
        type: "payment_failed",
        message: `Your subscription payment failed. Please update your payment method within 7 days to avoid your listing being suspended.`,
        read: false,
        createdAt: admin.firestore.Timestamp.now(),
      });
    }

    return res.status(200).send("OK");
  } catch (err) {
    functions.logger.error("PayFast ITN: unexpected error", err);
    return res.status(500).send("error");
  }
});
