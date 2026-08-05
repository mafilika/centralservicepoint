// =========================================================
// CENTRAL SERVICE POINT — REQUEST QUOTE FLOW
// Requires sign-in (Firestore rules require customerUid ==
// auth.uid on quotes/{id}). Writes one quote doc per submission.
// Notification to the contractor + email are handled by a
// Cloud Function trigger on quotes/{id} onCreate (see README) —
// this keeps that fan-out logic server-side and reliable.
// =========================================================

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { escapeHtml } from "./main.js";

const el = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const contractorId = params.get("contractor");

function showState(stateId) {
  ["signin-gate", "no-contractor-state", "quote-form-state", "success-state"].forEach((id) => {
    el(id).style.display = id === stateId ? "block" : "none";
  });
}

function showAlert(message, type = "error") {
  const box = el("form-alert");
  box.textContent = message;
  box.className = `alert show alert-${type}`;
}

async function init() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
      el("gate-login-link").href = `login.html?redirect=${returnUrl}`;
      el("gate-register-link").href = `register.html?redirect=${returnUrl}`;
      showState("signin-gate");
      return;
    }

    if (!contractorId) {
      showState("no-contractor-state");
      return;
    }

    try {
      const snap = await getDoc(doc(db, "contractors", contractorId));
      if (!snap.exists()) {
        showState("no-contractor-state");
        return;
      }
      const contractor = { id: snap.id, ...snap.data() };
      renderSummary(contractor);
      renderServiceChips(contractor);
      showState("quote-form-state");
      wireForm(user, contractor);
    } catch (err) {
      console.error(err);
      showState("no-contractor-state");
    }
  });
}

function renderSummary(c) {
  el("summary-logo").textContent = (c.businessName || "?").slice(0, 2).toUpperCase();
  el("summary-name").textContent = c.businessName || "Contractor";
  el("summary-location").textContent = [Array.isArray(c.cities) ? c.cities.join(", ") : "", c.province].filter(Boolean).join(", ");
}

function renderServiceChips(c) {
  const chips = el("service-chips");
  const categories = Array.isArray(c.categories) && c.categories.length ? c.categories : ["General enquiry"];
  chips.innerHTML = categories
    .map(
      (cat, i) => `
      <label>
        <input type="radio" name="service" value="${escapeHtml(cat)}" ${i === 0 ? "checked" : ""} />
        <span>${escapeHtml(cat)}</span>
      </label>
    `
    )
    .join("");
}

function wireForm(user, contractor) {
  const form = el("quote-form");
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    el("form-alert").classList.remove("show");

    const service = form.service.value;
    const description = form.description.value.trim();
    const contactPhone = form.contactPhone.value.trim();

    if (!description) {
      showAlert("Please describe your project.");
      return;
    }
    if (!contactPhone) {
      showAlert("Please add a contact number so the contractor can reach you.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    try {
      await addDoc(collection(db, "quotes"), {
        customerUid: user.uid,
        customerName: user.displayName || "",
        customerEmail: user.email || "",
        contractorUid: contractor.id,
        contractorName: contractor.businessName || "",
        service,
        description,
        budget: form.budget.value,
        timeline: form.timeline.value,
        contactPhone,
        preferredContact: form.preferredContact.value,
        status: "new", // new -> responded -> completed -> closed (admin/contractor managed)
        createdAt: serverTimestamp()
      });

      showState("success-state");
    } catch (err) {
      console.error(err);
      showAlert("Something went wrong sending your request. Please try again.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Send quote request";
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
