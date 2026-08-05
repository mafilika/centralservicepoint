// =========================================================
// CENTRAL SERVICE POINT — CONTRACTOR PROFILE
// Loads a single contractor by ?id=, plus their portfolio
// subcollection and approved reviews, and renders the page.
// =========================================================

import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { escapeHtml } from "./main.js";

const params = new URLSearchParams(window.location.search);
const contractorId = params.get("id");

const el = (id) => document.getElementById(id);

function show(elmt) { elmt.style.display = ""; }
function hide(elmt) { elmt.style.display = "none"; }

async function loadProfile() {
  if (!contractorId) {
    hide(el("profile-loading"));
    show(el("profile-not-found"));
    return;
  }

  try {
    const snap = await getDoc(doc(db, "contractors", contractorId));
    if (!snap.exists() || snap.data().approvalStatus !== "approved") {
      hide(el("profile-loading"));
      show(el("profile-not-found"));
      return;
    }

    const c = { id: snap.id, ...snap.data() };
    renderProfile(c);
    hide(el("profile-loading"));
    show(el("profile-content"));

    loadGallery(c.id);
    loadReviews(c.id);
  } catch (err) {
    console.error(err);
    hide(el("profile-loading"));
    show(el("profile-not-found"));
  }
}

function renderProfile(c) {
  const name = c.businessName || "Contractor";
  document.title = `${name} | Central Service Point`;
  el("page-title").textContent = document.title;
  el("page-description").setAttribute(
    "content",
    `${name} — ${(c.categories || []).join(", ")} contractor in ${(c.cities || []).join(", ")}, ${c.province || ""}. View reviews, gallery and request a quote.`
  );
  el("page-canonical").setAttribute("href", `https://centralservicepoint.co.za/contractor-profile.html?id=${c.id}`);

  if (c.coverImageUrl) {
    el("profile-cover").style.backgroundImage = `url('${c.coverImageUrl}')`;
  }
  el("profile-logo").textContent = name.slice(0, 2).toUpperCase();
  el("profile-name").textContent = name;

  if (c.verified) show(el("profile-verified-badge"));

  const rating = typeof c.rating === "number" ? c.rating.toFixed(1) : "New";
  el("profile-rating").textContent = rating;
  el("profile-review-count").textContent = c.reviewCount ? `(${c.reviewCount} reviews)` : "(No reviews yet)";
  el("stat-rating").textContent = rating;

  const cities = Array.isArray(c.cities) ? c.cities.join(", ") : "";
  el("profile-location").textContent = [cities, c.province].filter(Boolean).join(", ");

  const years = c.yearsInBusiness ? `${c.yearsInBusiness} yrs in business` : "";
  el("profile-years").textContent = years;
  el("stat-years").textContent = c.yearsInBusiness ?? "–";

  el("stat-projects").textContent = c.completedProjects ?? "–";
  el("profile-projects-detail").textContent = c.completedProjects ?? "Not provided";
  el("stat-response").textContent = c.avgResponseTime || "–";
  el("profile-response-detail").textContent = c.avgResponseTime || "Not provided";
  el("profile-languages").textContent = Array.isArray(c.languages) && c.languages.length ? c.languages.join(", ") : "Not provided";

  el("profile-description").textContent = c.description || "This contractor hasn't added a description yet.";

  el("profile-services").innerHTML = (c.categories || []).map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join("") || `<span class="text-muted">Not specified</span>`;
  el("profile-areas").innerHTML = (c.cities || []).map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join("") || `<span class="text-muted">Not specified</span>`;

  // Contact + CTAs
  const phone = c.phone || "";
  const whatsapp = c.whatsapp || phone;
  el("profile-call-btn").href = phone ? `tel:${phone.replace(/\s/g, "")}` : "#";
  el("profile-whatsapp-btn").href = whatsapp ? `https://wa.me/${whatsapp.replace(/[^\d]/g, "")}` : "#";
  const quoteUrl = `request-quote.html?contractor=${encodeURIComponent(c.id)}`;
  el("profile-quote-btn").href = quoteUrl;
  el("side-quote-btn").href = quoteUrl;

  el("side-phone").textContent = c.phone || "Not provided";
  el("side-email").textContent = c.email || "Not provided";
  el("side-website").textContent = c.website || "Not provided";

  // Business hours
  if (c.businessHours && typeof c.businessHours === "object") {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    el("hours-list").innerHTML = days
      .filter((d) => c.businessHours[d])
      .map((d) => `<div class="hours-row"><span class="day">${d}</span><span>${escapeHtml(c.businessHours[d])}</span></div>`)
      .join("") || `<p class="text-muted" style="font-size:0.85rem;">Hours not provided.</p>`;
  }

  // Map
  if (c.mapAddress) {
    el("map-embed").src = `https://www.google.com/maps?q=${encodeURIComponent(c.mapAddress)}&output=embed`;
  } else {
    el("map-embed").closest(".sidebar-card").style.display = "none";
  }

  // Compliance panel
  el("compliance-status").textContent = c.verified ? "Verified by Central Service Point" : "Not yet verified";
  const complianceRows = [];
  if (c.licenceNumber) complianceRows.push(["Licence number", c.licenceNumber]);
  if (c.hasInsurance) complianceRows.push(["Insurance", "On file"]);
  el("compliance-list").insertAdjacentHTML(
    "beforeend",
    complianceRows.map(([k, v]) => `<div class="row"><span>${escapeHtml(k)}</span><span>${escapeHtml(v)}</span></div>`).join("")
  );

  // JSON-LD LocalBusiness for SEO
  const ld = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
    description: c.description || "",
    address: { "@type": "PostalAddress", addressLocality: cities, addressRegion: c.province || "", addressCountry: "ZA" },
    telephone: c.phone || undefined,
    aggregateRating: c.reviewCount
      ? { "@type": "AggregateRating", ratingValue: c.rating || 0, reviewCount: c.reviewCount }
      : undefined
  };
  el("ld-localbusiness").textContent = JSON.stringify(ld);

  initTabs();
}

function initTabs() {
  const tabs = document.querySelectorAll(".profile-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".profile-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
    });
  });
}

async function loadGallery(id) {
  const grid = el("gallery-grid");
  try {
    const snap = await getDocs(collection(db, "contractors", id, "portfolio"));
    if (snap.empty) return; // keep default "no photos" message
    grid.innerHTML = snap.docs
      .map((d) => {
        const data = d.data();
        return data.imageUrl
          ? `<img src="${data.imageUrl}" alt="${escapeHtml(data.caption || "Portfolio image")}" loading="lazy" />`
          : "";
      })
      .join("");
  } catch (err) {
    console.error(err);
  }
}

async function loadReviews(id) {
  const list = el("reviews-list");
  try {
    const q = query(
      collection(db, "reviews"),
      where("contractorUid", "==", id),
      where("status", "==", "approved"),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      list.innerHTML = `<p class="text-muted">No reviews yet — be the first to hire and review this contractor.</p>`;
      return;
    }

    list.innerHTML = snap.docs
      .map((d) => {
        const r = d.data();
        const date = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate().toLocaleDateString("en-ZA", { year: "numeric", month: "short" }) : "";
        const stars = "★".repeat(Math.round(r.rating || 0)) + "☆".repeat(5 - Math.round(r.rating || 0));
        return `
          <div class="review-card">
            <div class="head">
              <span class="author">${escapeHtml(r.customerName || "Verified customer")}</span>
              <span class="date">${date}</span>
            </div>
            <span class="stars">${stars}</span>
            <p style="margin:0;">${escapeHtml(r.text || "")}</p>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    console.error(err);
    list.innerHTML = `<p class="text-muted">Couldn't load reviews right now.</p>`;
  }
}

document.addEventListener("DOMContentLoaded", loadProfile);
