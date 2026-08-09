const admin = require("firebase-admin");
admin.initializeApp();

// Auth: role custom-claims management
const { onUserProfileWrite, setUserRole } = require("./auth");
exports.onUserProfileWrite = onUserProfileWrite;
exports.setUserRole = setUserRole;

// Reviews: rating aggregation + duplicate prevention
const { onReviewCreate, recalculateContractorRating } = require("./reviews");
exports.onReviewCreate = onReviewCreate;
exports.recalculateContractorRating = recalculateContractorRating;

// Billing: PayFast checkout + ITN webhook (recurring subscriptions)
const { createCheckout, payfastItn } = require("./billing");
exports.createCheckout = createCheckout;
exports.payfastItn = payfastItn;

// Scheduled jobs: trial reminders, trial expiry, grace-period suspension
const { sendTrialReminders, expireTrialsAndSuspendOverdue } = require("./scheduled");
exports.sendTrialReminders = sendTrialReminders;
exports.expireTrialsAndSuspendOverdue = expireTrialsAndSuspendOverdue;

// SEO server-side rendering for crawlable dynamic pages
const { renderContractorProfile, renderSeoLanding } = require("./ssr");
exports.renderContractorProfile = renderContractorProfile;
exports.renderSeoLanding = renderSeoLanding;

// Contractor lifecycle: server-authoritative trial dates + unique slugs
const { onContractorCreate } = require("./contractors");
exports.onContractorCreate = onContractorCreate;

// Analytics: profile views + search impressions, written via Admin SDK only
const { logProfileView, logSearchImpressions } = require("./analytics");
exports.logProfileView = logProfileView;
exports.logSearchImpressions = logSearchImpressions;
