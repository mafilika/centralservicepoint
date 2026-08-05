// =========================================================
// CENTRAL SERVICE POINT — CLOUD FUNCTIONS
// =========================================================
// notifyContractorOnNewQuote
//   Fires whenever a customer submits a quote request
//   (quotes/{quoteId} created client-side from request-quote.html).
//   It looks up the contractor's WhatsApp number and sends them
//   a templated WhatsApp message via Twilio, then logs the result
//   as a `notifications` doc and back onto the quote itself.
//
// Why this lives server-side, not in the browser:
//   - The client can never hold Twilio credentials.
//   - Firestore security rules only allow `notifications` writes
//     from trusted server code (the Admin SDK bypasses rules).
//   - WhatsApp business-initiated messages must use a pre-approved
//     template — this function is the single place that template
//     SID and its variable order are defined, so they can't drift
//     out of sync with what's approved in the Twilio/Meta console.
// =========================================================

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const twilio = require("twilio");

admin.initializeApp();
const db = admin.firestore();

// Set these with:
//   firebase functions:secrets:set TWILIO_ACCOUNT_SID
//   firebase functions:secrets:set TWILIO_AUTH_TOKEN
//   firebase functions:secrets:set TWILIO_WHATSAPP_FROM   (e.g. "whatsapp:+14155238886")
//   firebase functions:secrets:set TWILIO_QUOTE_TEMPLATE_SID  (Twilio Content Template SID, e.g. "HXxxxxxxxx")
const TWILIO_ACCOUNT_SID = defineSecret("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_WHATSAPP_FROM = defineSecret("TWILIO_WHATSAPP_FROM");
const TWILIO_QUOTE_TEMPLATE_SID = defineSecret("TWILIO_QUOTE_TEMPLATE_SID");

/**
 * Normalizes a South African number to E.164 (+27...).
 * Accepts local format (0821234567), already-international
 * (+27821234567 / 27821234567), and strips spaces/dashes.
 */
function toE164ZA(rawNumber) {
  if (!rawNumber) return null;
  const digits = rawNumber.replace(/[^\d+]/g, "");
  if (digits.startsWith("+27")) return digits;
  if (digits.startsWith("27")) return `+${digits}`;
  if (digits.startsWith("0")) return `+27${digits.slice(1)}`;
  return null; // unrecognized format — skip rather than send to a wrong number
}

exports.notifyContractorOnNewQuote = onDocumentCreated(
  {
    document: "quotes/{quoteId}",
    secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, TWILIO_QUOTE_TEMPLATE_SID],
    region: "europe-west1" // pick the region closest to your Firestore location
  },
  async (event) => {
    const quoteId = event.params.quoteId;
    const quote = event.data.data();
    if (!quote) return;

    const quoteRef = event.data.ref;

    try {
      const contractorSnap = await db.collection("contractors").doc(quote.contractorUid).get();
      if (!contractorSnap.exists) {
        logger.warn(`Quote ${quoteId}: contractor ${quote.contractorUid} not found.`);
        return;
      }
      const contractor = contractorSnap.data();

      // Respect an opt-out if the contractor has disabled WhatsApp leads
      // in their dashboard (field defaults to true when absent).
      if (contractor.whatsappNotificationsEnabled === false) {
        logger.info(`Quote ${quoteId}: contractor has WhatsApp notifications disabled.`);
        await writeNotification(quote, quoteId, "skipped_opted_out");
        return;
      }

      const toNumber = toE164ZA(contractor.whatsapp || contractor.phone);
      if (!toNumber) {
        logger.warn(`Quote ${quoteId}: contractor ${quote.contractorUid} has no valid WhatsApp/phone number.`);
        await writeNotification(quote, quoteId, "failed_no_number");
        return;
      }

      const client = twilio(TWILIO_ACCOUNT_SID.value(), TWILIO_AUTH_TOKEN.value());

      // Uses a pre-approved WhatsApp template. Template variables below
      // are an example order — match them to whatever your approved
      // template actually defines in the Twilio Content Editor.
      //   e.g. "New lead on Central Service Point! {{1}} needs {{2}}.
      //         Budget: {{3}}. View & respond: {{4}}"
      const message = await client.messages.create({
        from: TWILIO_WHATSAPP_FROM.value(),
        to: `whatsapp:${toNumber}`,
        contentSid: TWILIO_QUOTE_TEMPLATE_SID.value(),
        contentVariables: JSON.stringify({
          1: quote.customerName || "A customer",
          2: quote.service || "a project",
          3: quote.budget || "Not specified",
          4: `https://centralservicepoint.co.za/dashboard-contractor.html?quote=${quoteId}`
        })
      });

      logger.info(`Quote ${quoteId}: WhatsApp sent to contractor ${quote.contractorUid} (Twilio SID ${message.sid}).`);
      await writeNotification(quote, quoteId, "sent", message.sid);
      await quoteRef.update({ whatsappNotifiedAt: admin.firestore.FieldValue.serverTimestamp() });
    } catch (err) {
      logger.error(`Quote ${quoteId}: WhatsApp notification failed.`, err);
      await writeNotification(quote, quoteId, "failed_error", null, err.message);
    }
  }
);

async function writeNotification(quote, quoteId, status, providerMessageId = null, errorMessage = null) {
  await db.collection("notifications").add({
    recipientUid: quote.contractorUid,
    type: "quote_whatsapp",
    quoteId,
    status, // sent | skipped_opted_out | failed_no_number | failed_error
    providerMessageId,
    errorMessage,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

// =========================================================
// trialExpiryReminders (scheduled)
// Runs daily, WhatsApps contractors whose free trial is ending
// soon or has just ended. Same template-message constraint applies —
// create a separate approved template (e.g. "trial_ending") and set
// its SID via TWILIO_TRIAL_TEMPLATE_SID before enabling this in production.
// Included here as a scaffold since it reuses all the same plumbing;
// safe to deploy, it simply does nothing until that secret is set.
// =========================================================
const TWILIO_TRIAL_TEMPLATE_SID = defineSecret("TWILIO_TRIAL_TEMPLATE_SID");

exports.trialExpiryReminders = onSchedule(
  {
    schedule: "every day 08:00",
    timeZone: "Africa/Johannesburg",
    secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, TWILIO_TRIAL_TEMPLATE_SID],
    region: "europe-west1"
  },
  async () => {
    let templateSid;
    try {
      templateSid = TWILIO_TRIAL_TEMPLATE_SID.value();
    } catch {
      templateSid = null;
    }
    if (!templateSid) {
      logger.info("trialExpiryReminders: TWILIO_TRIAL_TEMPLATE_SID not set yet — skipping.");
      return;
    }

    const in3Days = new Date();
    in3Days.setDate(in3Days.getDate() + 3);

    const snap = await db
      .collection("contractors")
      .where("subscriptionPlan", "==", "trial")
      .where("trialEndsAt", "<=", in3Days)
      .get();

    if (snap.empty) return;

    const client = twilio(TWILIO_ACCOUNT_SID.value(), TWILIO_AUTH_TOKEN.value());

    for (const docSnap of snap.docs) {
      const contractor = docSnap.data();
      const toNumber = toE164ZA(contractor.whatsapp || contractor.phone);
      if (!toNumber) continue;

      try {
        await client.messages.create({
          from: TWILIO_WHATSAPP_FROM.value(),
          to: `whatsapp:${toNumber}`,
          contentSid: templateSid,
          contentVariables: JSON.stringify({ 1: contractor.businessName || "there" })
        });
        logger.info(`Trial reminder sent to contractor ${docSnap.id}.`);
      } catch (err) {
        logger.error(`Trial reminder failed for contractor ${docSnap.id}.`, err);
      }
    }
  }
);
