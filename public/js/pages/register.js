import { renderHeader, renderFooter } from "../modules/partials.js";
import { registerUser } from "../modules/auth.js";
import { validateForm, isValidEmail, isValidSaPhone, isNonEmpty } from "../modules/validate.js";

renderHeader();
renderFooter();

const roleButtons = document.querySelectorAll(".role-toggle button");
const roleInput = document.getElementById("role-input");
roleButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    roleButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    roleInput.value = btn.dataset.role;
  });
});

const form = document.getElementById("register-form");
const alertBox = document.getElementById("form-alert");
const submitBtn = document.getElementById("register-submit");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  alertBox.innerHTML = "";

  const { valid } = validateForm(form, {
    firstName: (v) => (isNonEmpty(v) ? true : "Required."),
    lastName: (v) => (isNonEmpty(v) ? true : "Required."),
    email: (v) => (isValidEmail(v) ? true : "Enter a valid email address."),
    phone: (v) => (!v || isValidSaPhone(v) ? true : "Enter a valid South African number, e.g. 082 123 4567."),
    password: (v) => (v.length >= 8 ? true : "At least 8 characters."),
  });
  if (!valid) return;
  if (!form.terms.checked) {
    alertBox.innerHTML = `<div class="alert alert-error">Please accept the Terms of Service to continue.</div>`;
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Creating account…";

  try {
    await registerUser({
      email: form.email.value.trim(),
      password: form.password.value,
      firstName: form.firstName.value.trim(),
      lastName: form.lastName.value.trim(),
      phone: form.phone.value.trim(),
      role: roleInput.value,
    });

    alertBox.innerHTML = `<div class="alert alert-success">Account created! We've sent a verification link to your email — please confirm it, then continue.</div>`;

    setTimeout(() => {
      window.location.href = roleInput.value === "contractor" ? "/onboarding.html" : "/account.html";
    }, 1800);
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Account";
    alertBox.innerHTML = `<div class="alert alert-error">${friendlyAuthError(err)}</div>`;
  }
});

function friendlyAuthError(err) {
  const map = {
    "auth/email-already-in-use": "An account already exists with that email — try logging in instead.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Choose a stronger password.",
  };
  return map[err.code] || err.message || "Something went wrong. Please try again.";
}
