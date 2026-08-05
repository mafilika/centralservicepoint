// =========================================================
// CENTRAL SERVICE POINT — AUTHENTICATION
// Handles register + login for both Customers and Contractors.
// Passwords are never handled directly by our code beyond
// passing them to Firebase Auth over HTTPS; we never store them.
// =========================================================

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PASSWORD_MIN_LENGTH = 8;

function showAlert(el, message, type = "error") {
  if (!el) return;
  el.textContent = message;
  el.className = `alert show alert-${type}`;
}

function setLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.dataset.originalText = button.dataset.originalText || button.textContent;
  button.innerHTML = loading
    ? `<span class="spinner" aria-hidden="true"></span> Please wait…`
    : button.dataset.originalText;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* -------------------- REGISTER -------------------- */
function initRegisterForm() {
  const form = document.getElementById("register-form");
  if (!form) return;

  const alertBox = document.getElementById("form-alert");
  const submitBtn = form.querySelector('button[type="submit"]');
  let selectedRole = "customer";

  document.querySelectorAll(".role-toggle button[data-role]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".role-toggle button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedRole = btn.dataset.role;
      const companyGroup = document.getElementById("company-name-group");
      if (companyGroup) companyGroup.style.display = selectedRole === "contractor" ? "block" : "none";
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertBox.classList.remove("show");

    const name = form.fullName.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    const confirmPassword = form.confirmPassword.value;
    const companyName = form.companyName ? form.companyName.value.trim() : "";
    const terms = form.terms.checked;

    if (!name || !email || !password) {
      showAlert(alertBox, "Please fill in all required fields.");
      return;
    }
    if (!isValidEmail(email)) {
      showAlert(alertBox, "Please enter a valid email address.");
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      showAlert(alertBox, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      showAlert(alertBox, "Passwords do not match.");
      return;
    }
    if (selectedRole === "contractor" && !companyName) {
      showAlert(alertBox, "Please enter your business name.");
      return;
    }
    if (!terms) {
      showAlert(alertBox, "You must accept the Terms and Privacy Policy to continue.");
      return;
    }

    setLoading(submitBtn, true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await sendEmailVerification(cred.user);

      // Base user record — role-based permissions are enforced in
      // Firestore Security Rules against this `role` field.
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        fullName: name,
        email,
        role: selectedRole, // "customer" | "contractor"
        createdAt: serverTimestamp(),
        emailVerified: false,
        status: "active"
      });

      if (selectedRole === "contractor") {
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 60);

        await setDoc(doc(db, "contractors", cred.user.uid), {
          ownerUid: cred.user.uid,
          businessName: companyName,
          email,
          approvalStatus: "pending", // pending | approved | rejected — set by admin
          verified: false,
          subscriptionPlan: "trial",
          trialEndsAt: trialEnd,
          createdAt: serverTimestamp(),
          province: "",
          cities: [],
          categories: [],
          rating: 0,
          reviewCount: 0,
          whatsapp: "",
          whatsappNotificationsEnabled: true
        });
      }

      showAlert(alertBox, "Account created! Check your email to verify your address.", "success");
      const redirect = new URLSearchParams(window.location.search).get("redirect");
      const destination = redirect || (
    selectedRole === "contractor"
        ? "contractor-profile.html?setup=true"
        : "dashboard-customer.html"
); setTimeout(() => {
        window.location.href = destination;
      }, 1200);
    } catch (err) {
      showAlert(alertBox, mapAuthError(err));
    } finally {
      setLoading(submitBtn, false);
    }
  });
}

/* -------------------- LOGIN -------------------- */
function initLoginForm() {
  const form = document.getElementById("login-form");
  if (!form) return;

  const alertBox = document.getElementById("form-alert");
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertBox.classList.remove("show");

    const email = form.email.value.trim();
    const password = form.password.value;

    if (!email || !password) {
      showAlert(alertBox, "Please enter your email and password.");
      return;
    }

    setLoading(submitBtn, true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      const redirect = new URLSearchParams(window.location.search).get("redirect");
      window.location.href = redirect || "index.html";
    } catch (err) {
      showAlert(alertBox, mapAuthError(err));
    } finally {
      setLoading(submitBtn, false);
    }
  });

  const forgotLink = document.getElementById("forgot-password-link");
  if (forgotLink) {
    forgotLink.addEventListener("click", async (e) => {
      e.preventDefault();
      const email = form.email.value.trim();
      if (!isValidEmail(email)) {
        showAlert(alertBox, "Enter your email above first, then click 'Forgot password'.");
        return;
      }
      try {
        await sendPasswordResetEmail(auth, email);
        showAlert(alertBox, "Password reset email sent.", "success");
      } catch (err) {
        showAlert(alertBox, mapAuthError(err));
      }
    });
  }
}

function mapAuthError(err) {
  const code = err && err.code;
  const messages = {
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/invalid-email": "That email address looks invalid.",
    "auth/weak-password": `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again."
  };
  return messages[code] || "Something went wrong. Please try again.";
}

document.addEventListener("DOMContentLoaded", () => {
  initRegisterForm();
  initLoginForm();
});
