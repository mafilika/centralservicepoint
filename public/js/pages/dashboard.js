import { renderHeader, renderFooter } from "../modules/partials.js";
import { icon, icons } from "../modules/icons.js";
import { requireRole, auth } from "../modules/auth.js";
import { CATEGORIES, PROVINCES, CITIES_BY_PROVINCE, categoryById } from "../data/taxonomy.js";
import { escapeHtml, validateForm, isNonEmpty, isValidSaPhone } from "../modules/validate.js";
import { uploadContractorImage } from "../modules/storage-upload.js";
import {
  doc, getDoc, updateDoc, collection, query, where, orderBy, limit, getDocs, arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js";
import { db, functions } from "../firebase-config.js";

renderHeader();
renderFooter();

const root = document.getElementById("dashboard-root");
let contractor = null;
let contractorId = null;

const TIERS = [
  { id: "basic", name: "Basic Listing", price: 0, features: ["Contractor profile page", "Business description", "Contact details", "Customer enquiries"] },
  { id: "professional", name: "Professional Listing", price: 1500, features: ["Everything in Basic", "Featured placement", "More photos & projects", "Verified badge", "Priority leads"] },
  { id: "premium", name: "Premium Partner", price: 1899, features: ["Everything in Professional", "Top placement", "Homepage visibility", "Social promotion", "Marketing insights"] },
];

(async function init() {
  const { user } = await requireRole(["contractor"]);
  contractorId = user.uid;

  const snap = await getDoc(doc(db, "contractors", contractorId));
  if (!snap.exists()) {
    window.location.href = "/onboarding.html";
    return;
  }
  contractor = { id: snap.id, ...snap.data() };
  render();
})();

function render() {
  const cat = categoryById(contractor.categoryId) || { name: contractor.categoryId };
  const trialEndsAt = contractor.trialEndsAt?.toDate ? contractor.trialEndsAt.toDate() : null;
  const daysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt - new Date()) / 86400000)) : null;

  root.innerHTML = `
    <div class="dash-header">
      <div>
        <div class="eyebrow"><span class="eyebrow__bar"></span><span class="eyebrow__label">Contractor Dashboard</span></div>
        <h1 style="font-size:1.6rem;">Welcome back, ${escapeHtml(contractor.businessName)}</h1>
      </div>
      <div style="display:flex; align-items:center; gap:0.6rem;">
        <span class="badge badge-${contractor.tier === "basic" ? "basic" : contractor.tier}">${tierLabel(contractor.tier)}</span>
        ${contractor.subscriptionStatus === "trial" && daysLeft !== null
          ? `<span class="badge" style="background:var(--csp-gold-soft); color:var(--csp-gold);">Day ${60 - daysLeft} of 60-day trial</span>`
          : ""}
        <a href="/contractor/${contractor.slug}" target="_blank" class="btn btn-ghost btn-sm">View Public Profile</a>
      </div>
    </div>

    ${contractor.status === "pending" ? `<div class="status-pending-banner">${icon("clock", 16)} Your listing is awaiting admin review — this usually takes under one business day. It isn't visible in search yet.</div>` : ""}
    ${contractor.status === "suspended" ? `<div class="status-suspended-banner">${icon("checkCircle", 16)} Your listing is currently suspended${contractor.subscriptionStatus === "expired" ? " — your free trial ended without a subscription." : " — your last payment didn't go through."} Head to the Subscription tab to reactivate it.</div>` : ""}

    <div class="dash-tabs" id="dash-tabs">
      <button data-tab="overview" class="active">${icon("eye", 15)} Overview</button>
      <button data-tab="profile">${icon("building", 15)} Profile</button>
      <button data-tab="portfolio">${icon("image", 15)} Portfolio</button>
      <button data-tab="leads">${icon("bell", 15)} Leads</button>
      <button data-tab="subscription">${icon("checkCircle", 15)} Subscription</button>
    </div>

    <div class="dash-panel active" data-panel="overview" id="panel-overview"></div>
    <div class="dash-panel" data-panel="profile" id="panel-profile"></div>
    <div class="dash-panel" data-panel="portfolio" id="panel-portfolio"></div>
    <div class="dash-panel" data-panel="leads" id="panel-leads"></div>
    <div class="dash-panel" data-panel="subscription" id="panel-subscription"></div>
  `;

  document.getElementById("dash-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    document.querySelectorAll("#dash-tabs button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".dash-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === btn.dataset.tab));
  });

  renderOverview();
  renderProfilePanel(cat);
  renderPortfolioPanel();
  renderLeadsPanel();
  renderSubscriptionPanel(daysLeft);
}

function tierLabel(tier) {
  return tier === "premium" || tier === "enterprise" ? "Premium Partner" : tier === "professional" ? "Professional" : "Basic Listing";
}

/* ---------------- OVERVIEW ---------------- */
async function renderOverview() {
  const panel = document.getElementById("panel-overview");
  panel.innerHTML = `<div class="stat-grid" id="stat-grid">
    ${Array.from({ length: 4 }).map(() => `<div class="skeleton" style="height:100px;"></div>`).join("")}
  </div>
  <div class="card" style="padding:1.4rem; background:var(--csp-primary); color:#fff; margin-top:0.5rem;">
    <strong style="font-size:0.9rem;">Marketing Insight</strong>
    <p style="font-size:0.85rem; opacity:0.85; margin-top:0.4rem;">
      Profiles with 8+ portfolio photos receive significantly more quote requests on average. You currently have
      ${contractor.galleryUrls?.length || 0} — add more from the Portfolio tab to improve conversion.
    </p>
  </div>`;

  let analytics = { profileViews: 0, searchAppearances: 0 };
  try {
    const aSnap = await getDoc(doc(db, "analytics", contractorId));
    if (aSnap.exists()) analytics = aSnap.data();
  } catch { /* contractor may have no analytics doc yet — defaults above are fine */ }

  let leadCount = 0;
  try {
    const qSnap = await getDocs(query(collection(db, "quotes"), where("contractorId", "==", contractorId)));
    leadCount = qSnap.size;
  } catch { /* ignore */ }

  document.getElementById("stat-grid").innerHTML = `
    ${statCard("eye", analytics.profileViews || 0, "Profile Views")}
    ${statCard("bell", leadCount, "Leads Received")}
    ${statCard(icons.search ? "search" : "eye", analytics.searchAppearances || 0, "Search Appearances")}
    ${statCard("star", (contractor.rating || 0).toFixed(1), `Rating (${contractor.reviewCount || 0} reviews)`)}
  `;
}
function statCard(iconName, value, label) {
  return `<div class="card stat-card">
    <div class="stat-card__top"><div class="stat-card__icon">${icon(iconName, 16)}</div></div>
    <div class="stat-card__value">${value}</div>
    <div class="stat-card__label">${label}</div>
  </div>`;
}

/* ---------------- PROFILE ---------------- */
function renderProfilePanel(cat) {
  const panel = document.getElementById("panel-profile");
  panel.innerHTML = `
    <div class="card" style="padding:1.5rem; max-width:640px;">
      <h3 style="font-size:1rem; margin-bottom:1.25rem;">Edit Business Profile</h3>
      <div id="profile-alert"></div>
      <form id="profile-form" style="display:flex; flex-direction:column; gap:1rem;">
        <div class="field" data-field="businessName">
          <label>Business name</label>
          <input class="input" name="businessName" value="${escapeHtml(contractor.businessName)}" required>
          <span class="field-error"></span>
        </div>
        <div class="field">
          <label>Category</label>
          <select class="input" name="categoryId">${CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === contractor.categoryId ? "selected" : ""}>${c.name}</option>`).join("")}</select>
        </div>
        <div style="display:flex; gap:0.75rem;">
          <div class="field" style="flex:1;">
            <label>Province</label>
            <select class="input" name="province" id="p-province">${PROVINCES.map((p) => `<option value="${p}" ${p === contractor.province ? "selected" : ""}>${p}</option>`).join("")}</select>
          </div>
          <div class="field" style="flex:1;">
            <label>City</label>
            <select class="input" name="city" id="p-city">${(CITIES_BY_PROVINCE[contractor.province] || []).map((c) => `<option value="${c}" ${c === contractor.city ? "selected" : ""}>${c}</option>`).join("")}</select>
          </div>
        </div>
        <div class="field" data-field="phone">
          <label>Phone number</label>
          <input class="input" name="phone" value="${escapeHtml(contractor.phone)}" required>
          <span class="field-error"></span>
        </div>
        <div class="field" data-field="whatsapp">
          <label>WhatsApp number</label>
          <input class="input" name="whatsapp" value="${escapeHtml(contractor.whatsapp)}" required>
          <span class="field-error"></span>
        </div>
        <div class="field" data-field="description">
          <label>Business description</label>
          <textarea class="input" name="description" rows="4" required>${escapeHtml(contractor.description)}</textarea>
          <span class="field-error"></span>
        </div>
        <div class="field">
          <label>Services (one per line)</label>
          <textarea class="input" name="services" rows="4">${escapeHtml((contractor.services || []).join("\n"))}</textarea>
        </div>
        <button type="submit" class="btn btn-primary" style="align-self:flex-start;">Save Changes</button>
      </form>
    </div>`;

  document.getElementById("p-province").addEventListener("change", (e) => {
    const citySel = document.getElementById("p-city");
    const cities = CITIES_BY_PROVINCE[e.target.value] || [];
    citySel.innerHTML = cities.map((c) => `<option value="${c}">${c}</option>`).join("");
  });

  const form = document.getElementById("profile-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { valid } = validateForm(form, {
      businessName: (v) => (isNonEmpty(v, 2) ? true : "Required."),
      phone: (v) => (isValidSaPhone(v) ? true : "Enter a valid SA number."),
      whatsapp: (v) => (isValidSaPhone(v) ? true : "Enter a valid SA number."),
      description: (v) => (isNonEmpty(v, 20) ? true : "Please add a fuller description."),
    });
    if (!valid) return;

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      const updates = {
        businessName: form.businessName.value.trim(),
        categoryId: form.categoryId.value,
        province: form.province.value,
        city: form.city.value,
        phone: form.phone.value.trim(),
        whatsapp: form.whatsapp.value.trim(),
        description: form.description.value.trim(),
        services: form.services.value.split("\n").map((s) => s.trim()).filter(Boolean),
        updatedAt: new Date(),
      };
      await updateDoc(doc(db, "contractors", contractorId), updates);
      Object.assign(contractor, updates);
      document.getElementById("profile-alert").innerHTML = `<div class="alert alert-success">Saved.</div>`;
    } catch (err) {
      console.error(err);
      document.getElementById("profile-alert").innerHTML = `<div class="alert alert-error">Couldn't save changes — please try again.</div>`;
    }
    btn.disabled = false; btn.textContent = "Save Changes";
  });
}

/* ---------------- PORTFOLIO ---------------- */
function renderPortfolioPanel() {
  const panel = document.getElementById("panel-portfolio");
  const urls = contractor.galleryUrls || [];
  panel.innerHTML = `
    <div class="card" style="padding:1.5rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
        <h3 style="font-size:1rem;">Portfolio Photos</h3>
        <div>
          <input type="file" id="pf-input" accept="image/png,image/jpeg,image/webp" multiple class="visually-hidden">
          <button class="btn btn-ghost btn-sm" id="pf-trigger">Upload Photos</button>
        </div>
      </div>
      <div class="gallery-manage" id="pf-gallery">
        ${urls.map((u) => galleryItem(u)).join("") || `<p style="font-size:0.85rem; color:var(--csp-muted);">No portfolio photos yet — completed project photos significantly increase quote requests.</p>`}
      </div>
    </div>`;

  document.getElementById("pf-trigger").addEventListener("click", () => document.getElementById("pf-input").click());
  document.getElementById("pf-input").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    const btn = document.getElementById("pf-trigger");
    btn.disabled = true; btn.textContent = "Uploading…";
    for (const file of files) {
      try {
        const url = await uploadContractorImage(file, "gallery");
        contractor.galleryUrls = [...(contractor.galleryUrls || []), url];
        await updateDoc(doc(db, "contractors", contractorId), { galleryUrls: contractor.galleryUrls });
      } catch (err) {
        alert(err.message);
      }
    }
    btn.disabled = false; btn.textContent = "Upload Photos";
    renderPortfolioPanel();
  });

  panel.querySelectorAll("[data-remove-url]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.removeUrl;
      await updateDoc(doc(db, "contractors", contractorId), { galleryUrls: arrayRemove(url) });
      contractor.galleryUrls = (contractor.galleryUrls || []).filter((u) => u !== url);
      renderPortfolioPanel();
    });
  });
}
function galleryItem(url) {
  return `<div style="position:relative;">
    <img src="${url}" alt="Portfolio photo">
    <button data-remove-url="${url}" style="position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.6); color:#fff; border-radius:50%; width:22px; height:22px; font-size:12px;">✕</button>
  </div>`;
}

/* ---------------- LEADS ---------------- */
async function renderLeadsPanel() {
  const panel = document.getElementById("panel-leads");
  panel.innerHTML = `<div class="card" id="leads-card"><div style="padding:1.5rem;">Loading enquiries…</div></div>`;

  try {
    const qSnap = await getDocs(query(collection(db, "quotes"), where("contractorId", "==", contractorId), orderBy("createdAt", "desc"), limit(50)));
    const card = document.getElementById("leads-card");
    if (qSnap.empty) {
      card.innerHTML = `<div style="padding:2.5rem; text-align:center; color:var(--csp-muted); font-size:0.88rem;">No enquiries yet — they'll show up here as soon as a customer requests a quote.</div>`;
      return;
    }
    card.innerHTML = qSnap.docs.map((d) => leadRow(d.id, d.data())).join("");
    card.querySelectorAll("[data-lead-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await updateDoc(doc(db, "quotes", btn.dataset.leadId), { status: btn.dataset.leadAction });
        renderLeadsPanel();
      });
    });
  } catch (err) {
    console.error(err);
    document.getElementById("leads-card").innerHTML = `<div style="padding:1.5rem;">Couldn't load enquiries right now.</div>`;
  }
}
function leadRow(id, q) {
  const cat = categoryById(q.categoryId)?.name || q.categoryId;
  const date = q.createdAt?.toDate ? q.createdAt.toDate().toLocaleDateString() : "";
  return `<div class="lead-row">
    <div>
      <div style="font-weight:700; font-size:0.9rem;">${escapeHtml(q.customerName)} — ${escapeHtml(cat)}</div>
      <div style="font-size:0.8rem; color:var(--csp-muted); margin-top:2px;">${escapeHtml(q.message)}</div>
      <div style="font-size:0.75rem; color:var(--csp-muted); margin-top:4px;">${escapeHtml(q.customerPhone)} · ${date}</div>
    </div>
    <div style="display:flex; align-items:center; gap:0.5rem;">
      <span class="lead-status lead-status--${q.status}">${q.status}</span>
      ${q.status === "new" ? `<button class="btn btn-ghost btn-sm" data-lead-action="responded" data-lead-id="${id}">Mark Responded</button>` : ""}
      ${q.status !== "closed" ? `<button class="btn btn-ghost btn-sm" data-lead-action="closed" data-lead-id="${id}">Close</button>` : ""}
    </div>
  </div>`;
}

/* ---------------- SUBSCRIPTION ---------------- */
function renderSubscriptionPanel(daysLeft) {
  const panel = document.getElementById("panel-subscription");
  panel.innerHTML = `
    <div class="grid-cards">
      ${TIERS.map((t) => `
        <div class="card tier-card ${t.id === contractor.tier ? "current" : ""}">
          ${t.id === contractor.tier ? `<span style="font-size:0.7rem; font-weight:700; color:var(--csp-primary); margin-bottom:0.5rem;">CURRENT PLAN</span>` : ""}
          <h4 style="font-size:0.95rem;">${t.name}</h4>
          <div style="font-size:1.4rem; font-weight:800; margin:0.4rem 0;">R${t.price}<span style="font-size:0.75rem; font-weight:500; color:var(--csp-muted);">/mo</span></div>
          <ul style="font-size:0.78rem; color:var(--csp-muted); display:flex; flex-direction:column; gap:0.4rem; flex:1; margin:0.5rem 0 1rem;">
            ${t.features.map((f) => `<li>${icon("check", 13)} ${f}</li>`).join("")}
          </ul>
          <button class="btn ${t.id === contractor.tier ? "btn-ghost" : "btn-primary"} btn-sm" data-select-tier="${t.id}" ${t.id === contractor.tier ? "disabled" : ""}>
            ${t.id === contractor.tier ? "Current Plan" : t.price === 0 ? "Downgrade" : "Subscribe"}
          </button>
        </div>`).join("")}
    </div>
    <div id="subscription-alert" style="margin-top:1rem;"></div>
    <p style="font-size:0.78rem; color:var(--csp-muted); margin-top:1rem;">
      Billing is handled securely by PayFast — card details are never entered on or stored by Central Service Point.
      Subscriptions renew monthly and can be cancelled at any time; see our <a href="/terms.html" style="color:var(--csp-primary);">Terms of Service</a>.
    </p>
  `;

  panel.querySelectorAll("[data-select-tier]").forEach((btn) => {
    btn.addEventListener("click", () => startCheckout(btn.dataset.selectTier, btn));
  });
}

async function startCheckout(tier, btn) {
  const alertBox = document.getElementById("subscription-alert");
  if (tier === "basic") {
    alertBox.innerHTML = `<div class="alert" style="background:var(--csp-bg);">Contact support to downgrade to the free Basic listing at the end of your current billing period.</div>`;
    return;
  }
  btn.disabled = true;
  btn.textContent = "Redirecting to PayFast…";
  try {
    const createCheckout = httpsCallable(functions, "createCheckout");
    const { data } = await createCheckout({ tier });
    // Build a hidden form and auto-submit to PayFast's hosted checkout —
    // this is what keeps card entry off Central Service Point entirely.
    const form = document.createElement("form");
    form.method = "POST";
    form.action = data.processUrl;
    Object.entries(data.fields).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden"; input.name = key; input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  } catch (err) {
    console.error(err);
    alertBox.innerHTML = `<div class="alert alert-error">Couldn't start checkout — please try again.</div>`;
    btn.disabled = false;
    btn.textContent = "Subscribe";
  }
}
