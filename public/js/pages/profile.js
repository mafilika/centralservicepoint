import { renderHeader, renderFooter, trustSealSvg } from "../modules/partials.js";
import { icon } from "../modules/icons.js";
import { categoryById } from "../data/taxonomy.js";
import { getContractorBySlug, searchContractors } from "../modules/contractors-api.js";
import { escapeHtml, validateForm, isNonEmpty, isValidSaPhone, stripDangerousChars, debounceSubmit } from "../modules/validate.js";
import { toggleFavourite, isFavourited } from "../modules/favourites.js";
import { addDoc, collection, serverTimestamp, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js";
import { db, auth, functions } from "../firebase-config.js";

renderHeader();
renderFooter();

const slug = location.pathname.startsWith("/contractor/")
  ? decodeURIComponent(location.pathname.replace("/contractor/", ""))
  : new URLSearchParams(location.search).get("slug");

const root = document.getElementById("profile-root");

if (!slug) {
  root.innerHTML = `<div class="container" style="padding:4rem 0; text-align:center;">Contractor not found.</div>`;
} else {
  getContractorBySlug(slug)
    .then(async (c) => {
      if (!c) {
        root.innerHTML = `<div class="container" style="padding:4rem 0; text-align:center;">
          <h1>Contractor Not Found</h1>
          <p style="color:var(--csp-muted); margin-top:0.5rem;">This listing may have been removed or is no longer active.</p>
          <a href="/search.html" class="btn btn-primary" style="margin-top:1.5rem;">Browse Contractors</a>
        </div>`;
        return;
      }
      renderProfile(c);
      updateDocumentMeta(c);
      loadReviews(c.id);
      loadSimilar(c);

      // Fire-and-forget — a failed analytics call should never block the page
      const source = new URLSearchParams(location.search).get("src") || "direct";
      httpsCallable(functions, "logProfileView")({ contractorId: c.id, source }).catch(() => {});
    })
    .catch((err) => {
      console.error(err);
      root.innerHTML = `<div class="container" style="padding:4rem 0;">Something went wrong loading this profile.</div>`;
    });
}

function updateDocumentMeta(c) {
  const cat = categoryById(c.categoryId)?.name || c.categoryId;
  document.title = `${c.businessName} — ${cat} in ${c.city}, ${c.province} | Central Service Point`;
  document.querySelector('meta[name="description"]')?.setAttribute(
    "content",
    `${c.businessName} offers ${cat.toLowerCase()} in ${c.city}, ${c.province}. Rated ${c.rating?.toFixed(1) || "—"}/5 from ${c.reviewCount || 0} reviews. Request a free quote today.`
  );
}

function renderProfile(c) {
  const cat = categoryById(c.categoryId) || { name: c.categoryId };
  const fav = isFavourited(c.id);

  document.getElementById("breadcrumb").innerHTML =
    `<a href="/">Home</a> / <a href="/search.html">Contractors</a> / <a href="/search.html?category=${c.categoryId}">${escapeHtml(cat.name)}</a> / <span style="color:var(--csp-text);">${escapeHtml(c.businessName)}</span>`;

  root.innerHTML = `
    <div class="profile-hero">
      <a href="/search.html" class="profile-back">${icon("chevronLeft", 16)} Back to results</a>
    </div>
    <div class="container">
      <div class="profile-header">
        <div class="profile-logo">${icon("building", 40)}</div>
        <div>
          <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
            <h1 style="font-size:1.6rem;">${escapeHtml(c.businessName)}</h1>
            ${c.verified ? trustSealSvg(24) : ""}
          </div>
          <div class="profile-meta-row">
            <span>${escapeHtml(cat.name)}</span>
            <span>${icon("mapPin", 14)} ${escapeHtml(c.city)}, ${escapeHtml(c.province)}</span>
            <span>${icon("clock", 14)} ${c.yearsOperating || 0} years operating</span>
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.5rem;">
            ${starsHtml(c.rating)}
            <strong style="font-size:0.85rem;">${(c.rating || 0).toFixed(1)}</strong>
            <span style="font-size:0.8rem; color:var(--csp-muted);">(${c.reviewCount || 0} reviews)</span>
            <span class="badge badge-${badgeClass(c.tier)}">${tierLabel(c.tier)}</span>
          </div>
        </div>
        <div class="profile-actions">
          <button class="btn btn-ghost" id="fav-btn">${icon("heart", 16, fav)} Save</button>
          <a class="btn btn-primary" href="tel:${c.phone}">${icon("phone", 16)} Call Now</a>
          <a class="btn btn-gold" href="https://wa.me/${(c.whatsapp || "").replace(/\D/g, "")}" target="_blank" rel="noopener">${icon("message", 16)} WhatsApp</a>
        </div>
      </div>

      <div class="trust-strip card">
        ${trustItem("Verified Business", c.verified)}
        ${trustItem("Identity Checked", c.identityChecked)}
        ${trustItem("Customer Reviewed", (c.reviewCount || 0) > 0)}
        ${trustItem("Registered Contractor", true)}
        ${trustItem("Recommended Partner", c.tier === "premium" || c.tier === "enterprise")}
      </div>

      <div class="profile-grid">
        <div>
          <section class="profile-section">
            <h2>About</h2>
            <p style="color:var(--csp-muted); font-size:0.9rem; line-height:1.6;">${escapeHtml(c.description || "")}</p>
          </section>

          <section class="profile-section">
            <h2>Services Offered</h2>
            <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:0.5rem;">
              ${(c.services || []).map((s) => `<div class="service-chip">${icon("check", 14)} ${escapeHtml(s)}</div>`).join("")}
            </div>
          </section>

          <section class="profile-section">
            <h2>Areas Served</h2>
            <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
              ${(c.areasServed || []).map((a) => `<span class="area-chip">${escapeHtml(a)}</span>`).join("")}
            </div>
          </section>

          <section class="profile-section">
            <h2>Portfolio</h2>
            <div class="gallery-grid">
              ${(c.galleryUrls?.length ? c.galleryUrls.map((u) => `<img loading="lazy" data-src="${u}" alt="Completed project by ${escapeHtml(c.businessName)}">`) :
                Array.from({ length: 4 }).map(() => `<div class="ph">${icon("image", 20)}</div>`)).join("")}
            </div>
          </section>

          <section class="profile-section">
            <h2>Certifications &amp; Compliance</h2>
            <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
              ${(c.certifications || []).map((cert) => `<span class="cert-chip">${icon("shield", 12)} ${escapeHtml(cert)}</span>`).join("")}
            </div>
          </section>

          <section class="profile-section">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h2 style="margin:0;">Customer Reviews</h2>
            </div>
            <div id="reviews-list" style="margin-top:1rem;">
              <div class="skeleton" style="height:80px; margin-bottom:0.75rem;"></div>
              <div class="skeleton" style="height:80px;"></div>
            </div>
          </section>
        </div>

        <aside>
          <div class="card quote-sidebar">
            <h3 style="font-size:0.95rem; margin-bottom:1rem;">Request a Quote</h3>
            <div id="quote-alert"></div>
            <form id="quote-form" style="display:flex; flex-direction:column; gap:0.6rem;">
              <input type="hidden" name="contractorId" value="${c.id}">
              <div class="field" data-field="name"><input class="input" name="name" placeholder="Your name" required><span class="field-error"></span></div>
              <div class="field" data-field="phone"><input class="input" name="phone" placeholder="Phone number" required><span class="field-error"></span></div>
              <div class="field" data-field="message"><textarea class="input" name="message" rows="3" placeholder="Tell us about the job..." required></textarea><span class="field-error"></span></div>
              <button type="submit" class="btn btn-primary btn-block" id="quote-submit">Send Enquiry</button>
              <p style="font-size:0.7rem; text-align:center; color:var(--csp-muted);">Free — you can request quotes from multiple contractors.</p>
            </form>
          </div>
          <div id="similar-contractors" style="margin-top:1.25rem;"></div>
        </aside>
      </div>
    </div>
  `;

  document.getElementById("fav-btn").addEventListener("click", async (e) => {
    const nowFav = await toggleFavourite(c.id);
    e.currentTarget.innerHTML = `${icon("heart", 16, nowFav)} Save`;
  });

  wireQuoteForm(c);
}

function trustItem(label, active) {
  return `<span class="trust-strip__item" style="color:${active ? "var(--csp-text)" : "var(--csp-border)"};">
    ${icon("checkCircle", 16)} ${label}
  </span>`;
}
function starsHtml(rating = 0) {
  let s = "";
  for (let i = 0; i < 5; i++) s += icon("star", 15, i < Math.round(rating));
  return `<span style="color:var(--csp-gold); display:inline-flex;">${s}</span>`;
}
function badgeClass(tier) { return tier === "premium" || tier === "enterprise" ? "premium" : tier === "professional" ? "professional" : "basic"; }
function tierLabel(tier) { return tier === "premium" || tier === "enterprise" ? "Premium Partner" : tier === "professional" ? "Professional" : "Listed"; }

function wireQuoteForm(c) {
  const form = document.getElementById("quote-form");
  const alertBox = document.getElementById("quote-alert");
  const submitBtn = document.getElementById("quote-submit");

  const submit = debounceSubmit(submitBtn, async (e) => {
    e.preventDefault();
    const { valid } = validateForm(form, {
      name: (v) => (isNonEmpty(v) ? true : "Required."),
      phone: (v) => (isValidSaPhone(v) ? true : "Enter a valid SA number."),
      message: (v) => (isNonEmpty(v, 5) ? true : "Tell us a bit more about the job."),
    });
    if (!valid) return;

    if (!auth.currentUser) {
      alertBox.innerHTML = `<div class="alert alert-error">Please <a href="/login.html?next=${encodeURIComponent(location.pathname)}" style="text-decoration:underline;">log in</a> or <a href="/register.html" style="text-decoration:underline;">create a free account</a> to send a quote request — this is what lets you track responses and leave a verified review afterwards.</div>`;
      return;
    }

    try {
      await addDoc(collection(db, "quotes"), {
        contractorId: c.id,
        customerId: auth.currentUser.uid,
        customerName: stripDangerousChars(form.name.value),
        customerPhone: form.phone.value.trim(),
        customerEmail: auth.currentUser.email,
        categoryId: c.categoryId,
        message: stripDangerousChars(form.message.value),
        status: "new",
        source: "profile",
        createdAt: serverTimestamp(),
      });
      alertBox.innerHTML = `<div class="alert alert-success">${icon("checkCircle", 16)} Your enquiry was sent to ${escapeHtml(c.businessName)}. They typically respond within a few hours.</div>`;
      form.hidden = true;
    } catch (err) {
      console.error(err);
      alertBox.innerHTML = `<div class="alert alert-error">Couldn't send your enquiry — please try again.</div>`;
    }
  });

  form.addEventListener("submit", submit);
}

async function loadReviews(contractorId) {
  const el = document.getElementById("reviews-list");
  try {
    const qRef = query(
      collection(db, "reviews"),
      where("contractorId", "==", contractorId),
      where("status", "==", "published"),
      orderBy("createdAt", "desc"),
      limit(8)
    );
    const snap = await getDocs(qRef);
    if (snap.empty) {
      el.innerHTML = `<p style="font-size:0.85rem; color:var(--csp-muted);">No reviews yet — be the first to request a quote and leave one.</p>`;
      return;
    }
    el.innerHTML = snap.docs
      .map((d) => {
        const r = d.data();
        const initials = (r.customerName || "Customer").split(" ").map((p) => p[0]).slice(0, 2).join("");
        return `<div class="review-item">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span class="review-avatar">${escapeHtml(initials)}</span>
              <strong style="font-size:0.85rem;">${escapeHtml(r.customerName || "Verified Customer")}</strong>
            </div>
          </div>
          <div style="margin-top:0.4rem;">${starsHtml(r.rating)}</div>
          <p style="font-size:0.85rem; color:var(--csp-muted); margin-top:0.4rem;">${escapeHtml(r.text)}</p>
        </div>`;
      })
      .join("");
  } catch (err) {
    console.error(err);
    el.innerHTML = `<p style="font-size:0.85rem; color:var(--csp-muted);">Couldn't load reviews right now.</p>`;
  }
}

async function loadSimilar(c) {
  const el = document.getElementById("similar-contractors");
  try {
    const { results } = await searchContractors({ categoryId: c.categoryId, pageSize: 4 });
    const others = results.filter((x) => x.id !== c.id).slice(0, 3);
    if (!others.length) return;
    el.innerHTML = `<h3 style="font-size:0.85rem; margin-bottom:0.75rem;">Similar Contractors</h3>` +
      others.map((s) => `
        <a href="/contractor/${s.slug}" class="card" style="display:flex; align-items:center; gap:0.6rem; padding:0.7rem; margin-bottom:0.5rem;">
          <div style="width:34px; height:34px; border-radius:9px; background:var(--csp-bg); display:flex; align-items:center; justify-content:center;">${icon("building", 15)}</div>
          <div style="min-width:0;">
            <div style="font-size:0.78rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(s.businessName)}</div>
            <div style="font-size:0.7rem; color:var(--csp-muted);">${escapeHtml(s.city)} · ${(s.rating || 0).toFixed(1)}★</div>
          </div>
        </a>`).join("");
  } catch (err) {
    console.error(err);
  }
}
