// =========================================================
// CENTRAL SERVICE POINT — SHARED SITE BEHAVIOR
// Loaded on every page. Handles nav toggle, auth-aware header,
// and small reusable helpers.
// =========================================================

import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/** Wire the mobile nav toggle button. Safe no-op if markup absent. */
function initNavToggle() {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (!toggle || !links) return;
  toggle.addEventListener("click", () => {
    const isOpen = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

/** Mark the current page's nav link with aria-current for styling + a11y. */
function markCurrentNavLink() {
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a[href]").forEach((link) => {
    const href = link.getAttribute("href").split("/").pop();
    if (href === path) link.setAttribute("aria-current", "page");
  });
}

/**
 * Reflect signed-in state in the header: swap "Login / Register"
 * for a dashboard + logout affordance. Every page's header must
 * include a `#nav-auth-slot` container for this to populate.
 */
function initAuthAwareHeader() {
  const slot = document.getElementById("nav-auth-slot");
  if (!slot) return;

  onAuthStateChanged(auth, (user) => {
    if (user) {
      slot.innerHTML = `
        <a href="dashboard-customer.html" class="btn btn-ghost btn-sm">Dashboard</a>
        <button id="logout-btn" class="btn btn-outline btn-sm" type="button">Log out</button>
      `;
      document.getElementById("logout-btn").addEventListener("click", async () => {
        await signOut(auth);
        window.location.href = "index.html";
      });
    } else {
      slot.innerHTML = `
        <a href="login.html" class="btn btn-ghost btn-sm">Log in</a>
        <a href="register.html" class="btn btn-primary btn-sm">List Your Business</a>
      `;
    }
  });
}

/** Basic client-side input sanitizer: strips tags before inserting user text as HTML. */
export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  initNavToggle();
  markCurrentNavLink();
  initAuthAwareHeader();
});
