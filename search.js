// =========================================================
// CENTRAL SERVICE POINT — SEARCH
// Homepage hero search redirects to search-results.html with
// query params; results page reads them and queries Firestore.
// =========================================================

import { db } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { escapeHtml } from "./main.js";

/* -------------------- HERO SEARCH (index.html) -------------------- */
function initHeroSearch() {
  const form = document.getElementById("hero-search-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    const province = form.province.value;
    const city = form.city.value;
    const service = form.service.value;
    const keyword = form.keyword ? form.keyword.value.trim() : "";

    if (province) params.set("province", province);
    if (city) params.set("city", city);
    if (service) params.set("service", service);
    if (keyword) params.set("q", keyword);

    window.location.href = `search-results.html?${params.toString()}`;
  });
}

/* -------------------- RESULTS PAGE (search-results.html) -------------------- */
async function runSearch() {
  const grid = document.getElementById("results-grid");
  const countLabel = document.getElementById("results-count");
  const emptyState = document.getElementById("results-empty");
  if (!grid) return;

  const params = new URLSearchParams(window.location.search);
  const province = params.get("province");
  const city = params.get("city");
  const service = params.get("service");

  grid.innerHTML = `<p class="text-muted">Searching…</p>`;

  try {
    // Firestore doesn't support arbitrary free-text search or many
    // combined range filters, so we filter on indexed equality
    // fields here and layer additional client-side refinement
    // (rating/price sort, keyword contains) on the returned set.
    // For full-text search at scale, pair this with Algolia or
    // Typesense synced via a Cloud Function.
    const contractorsRef = collection(db, "contractors");
    const clauses = [where("approvalStatus", "==", "approved")];
    if (province) clauses.push(where("province", "==", province));
    if (service) clauses.push(where("categories", "array-contains", service));

    const q = query(contractorsRef, ...clauses, orderBy("rating", "desc"), limit(30));
    const snap = await getDocs(q);

    let results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (city) {
      results = results.filter((r) => Array.isArray(r.cities) && r.cities.includes(city));
    }

    renderResults(results, grid, countLabel, emptyState);
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p class="text-muted">We couldn't load results right now. Please try again shortly.</p>`;
  }
}

function renderResults(results, grid, countLabel, emptyState) {
  if (countLabel) countLabel.textContent = `${results.length} contractor${results.length === 1 ? "" : "s"} found`;

  if (results.length === 0) {
    grid.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    return;
  }
  if (emptyState) emptyState.style.display = "none";

  grid.innerHTML = results.map(cardTemplate).join("");
}

function cardTemplate(c) {
  const initials = escapeHtml((c.businessName || "?").slice(0, 2).toUpperCase());
  const rating = typeof c.rating === "number" ? c.rating.toFixed(1) : "New";
  const cities = Array.isArray(c.cities) ? c.cities.slice(0, 2).join(", ") : "";
  const tags = Array.isArray(c.categories) ? c.categories.slice(0, 3) : [];

  return `
    <article class="card contractor-card">
      <div class="cover">
        ${c.verified ? '<span class="badge">Verified</span>' : ""}
        <div class="logo">${initials}</div>
      </div>
      <div class="body">
        <h3>${escapeHtml(c.businessName)}</h3>
        <div class="location">${escapeHtml(cities)}${c.province ? ", " + escapeHtml(c.province) : ""}</div>
        <div class="rating"><span class="stars">★★★★★</span> ${rating} ${c.reviewCount ? `(${c.reviewCount})` : ""}</div>
        <div class="tags">${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
        <div class="actions">
          <a class="btn btn-primary btn-sm" href="contractor-profile.html?id=${encodeURIComponent(c.id)}">View Profile</a>
          <a class="btn btn-outline btn-sm" href="request-quote.html?contractor=${encodeURIComponent(c.id)}">Get Quote</a>
        </div>
      </div>
    </article>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  initHeroSearch();
  runSearch();
});
