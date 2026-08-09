import { renderHeader, renderFooter } from "../modules/partials.js";
import { requireRole, auth } from "../modules/auth.js";
import { CATEGORIES, PROVINCES, CITIES_BY_PROVINCE, categoryById } from "../data/taxonomy.js";
import { validateForm, isNonEmpty, isValidEmail, isValidSaPhone, escapeHtml } from "../modules/validate.js";
import { uploadContractorImage } from "../modules/storage-upload.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "../firebase-config.js";

renderHeader();
renderFooter();

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LANGUAGES = ["English", "Afrikaans", "Zulu", "Xhosa", "Sotho", "Tswana", "Venda", "Tsonga"];

let currentStep = 1;
const TOTAL_STEPS = 5;
let logoUrl = "";
let galleryUrls = [];
let selectedSecondary = new Set();
let selectedAreas = new Set();
let selectedLanguages = new Set();

const form = document.getElementById("onboarding-form");
const alertBox = document.getElementById("form-alert");

(async function init() {
  const { user, profile } = await requireRole(["contractor"]);

  // If they've already onboarded, send them to the dashboard instead
  const existing = await getDoc(doc(db, "contractors", user.uid));
  if (existing.exists()) {
    window.location.href = "/dashboard.html";
    return;
  }

  document.getElementById("onbEmail").value = user.email || "";
  buildStaticFields();
})();

function buildStaticFields() {
  const catSel = document.getElementById("categoryId");
  CATEGORIES.forEach((c) => catSel.insertAdjacentHTML("beforeend", `<option value="${c.id}">${c.name}</option>`));

  const secondaryWrap = document.getElementById("secondary-categories");
  secondaryWrap.innerHTML = CATEGORIES.map((c) => `<button type="button" data-cat="${c.id}">${c.name}</button>`).join("");
  secondaryWrap.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.cat;
    if (id === catSel.value) return; // can't duplicate the primary category
    if (selectedSecondary.has(id)) {
      selectedSecondary.delete(id);
      btn.classList.remove("selected");
    } else if (selectedSecondary.size < 3) {
      selectedSecondary.add(id);
      btn.classList.add("selected");
    }
  });

  const provSel = document.getElementById("province");
  PROVINCES.forEach((p) => provSel.insertAdjacentHTML("beforeend", `<option value="${p}">${p}</option>`));
  const citySel = document.getElementById("city");
  provSel.addEventListener("change", () => {
    const cities = CITIES_BY_PROVINCE[provSel.value] || [];
    citySel.disabled = !cities.length;
    citySel.innerHTML = `<option value="">Select city</option>` + cities.map((c) => `<option value="${c}">${c}</option>`).join("");
    renderAreaChips(cities);
  });

  const hoursGrid = document.getElementById("hours-grid");
  hoursGrid.innerHTML = DAYS.map((d, i) => `
    <div class="hours-row" data-day="${d}">
      <span class="day-label">${d}</span>
      <input type="time" class="hours-open" value="08:00">
      <span>–</span>
      <input type="time" class="hours-close" value="17:00">
      <label class="closed-toggle"><input type="checkbox" class="hours-closed" ${i >= 5 ? "checked" : ""}> Closed</label>
    </div>`).join("");
  hoursGrid.querySelectorAll(".hours-closed").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const row = e.target.closest(".hours-row");
      row.querySelectorAll("input[type='time']").forEach((t) => (t.disabled = e.target.checked));
    });
    cb.dispatchEvent(new Event("change"));
  });

  const langWrap = document.getElementById("languages-chips");
  langWrap.innerHTML = LANGUAGES.map((l) => `<button type="button" data-lang="${l}">${l}</button>`).join("");
  langWrap.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const l = btn.dataset.lang;
    if (selectedLanguages.has(l)) { selectedLanguages.delete(l); btn.classList.remove("selected"); }
    else { selectedLanguages.add(l); btn.classList.add("selected"); }
  });

  document.getElementById("description").addEventListener("input", (e) => {
    document.getElementById("desc-count").textContent = e.target.value.length;
  });

  wireUploads();
}

function renderAreaChips(cities) {
  const wrap = document.getElementById("areas-served-chips");
  selectedAreas = new Set();
  wrap.innerHTML = cities.map((c) => `<button type="button" data-area="${c}">${c}</button>`).join("");
  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const a = btn.dataset.area;
    if (selectedAreas.has(a)) { selectedAreas.delete(a); btn.classList.remove("selected"); }
    else { selectedAreas.add(a); btn.classList.add("selected"); }
  });
}

function wireUploads() {
  const logoInput = document.getElementById("logo-input");
  document.getElementById("logo-trigger").addEventListener("click", () => logoInput.click());
  logoInput.addEventListener("change", async () => {
    const file = logoInput.files[0];
    if (!file) return;
    const btn = document.getElementById("logo-trigger");
    btn.textContent = "Uploading…"; btn.disabled = true;
    try {
      logoUrl = await uploadContractorImage(file, "logo");
      document.getElementById("logo-preview").innerHTML = `<img src="${logoUrl}" alt="Logo preview">`;
      btn.textContent = "Change Logo";
    } catch (err) {
      showAlert("error", err.message);
      btn.textContent = "Upload Logo";
    }
    btn.disabled = false;
  });

  const galleryInput = document.getElementById("gallery-input");
  document.getElementById("gallery-trigger").addEventListener("click", () => galleryInput.click());
  galleryInput.addEventListener("change", async () => {
    const files = Array.from(galleryInput.files).slice(0, 6 - galleryUrls.length);
    const btn = document.getElementById("gallery-trigger");
    btn.textContent = "Uploading…"; btn.disabled = true;
    for (const file of files) {
      try {
        const url = await uploadContractorImage(file, "gallery");
        galleryUrls.push(url);
        document.getElementById("gallery-preview").insertAdjacentHTML("beforeend", `<img src="${url}" alt="Portfolio photo">`);
      } catch (err) {
        showAlert("error", err.message);
      }
    }
    btn.textContent = "Upload Photos"; btn.disabled = false;
  });
}

/* ---------------- Step navigation ---------------- */
const STEP_VALIDATORS = {
  1: () => validateForm(form, {
    businessName: (v) => (isNonEmpty(v, 2) ? true : "Enter your business name."),
    categoryId: (v) => (isNonEmpty(v) ? true : "Select a category."),
    yearsOperating: (v) => (v !== "" && Number(v) >= 0 ? true : "Enter years operating."),
    description: (v) => (isNonEmpty(v, 30) ? true : "Please write at least a couple of sentences (30+ characters)."),
  }).valid,
  2: () => validateForm(form, {
    province: (v) => (isNonEmpty(v) ? true : "Select a province."),
    city: (v) => (isNonEmpty(v) ? true : "Select a city."),
    services: (v) => (isNonEmpty(v, 3) ? true : "List at least one service."),
  }).valid,
  3: () => validateForm(form, {
    phone: (v) => (isValidSaPhone(v) ? true : "Enter a valid SA phone number."),
    whatsapp: (v) => (isValidSaPhone(v) ? true : "Enter a valid SA WhatsApp number."),
    email: (v) => (isValidEmail(v) ? true : "Enter a valid email address."),
  }).valid,
  4: () => true,
  5: () => true,
};

function showStep(step) {
  document.querySelectorAll(".onboarding-step").forEach((el) => (el.hidden = Number(el.dataset.step) !== step));
  document.querySelectorAll(".onboarding-progress__step").forEach((el) => {
    const s = Number(el.dataset.step);
    el.classList.toggle("active", s === step);
    el.classList.toggle("done", s < step);
  });
  document.getElementById("back-btn").hidden = step === 1;
  document.getElementById("next-btn").hidden = step === TOTAL_STEPS;
  document.getElementById("submit-btn").hidden = step !== TOTAL_STEPS;
  if (step === TOTAL_STEPS) renderReview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.getElementById("next-btn").addEventListener("click", () => {
  if (!STEP_VALIDATORS[currentStep]()) return;
  currentStep = Math.min(currentStep + 1, TOTAL_STEPS);
  showStep(currentStep);
});
document.getElementById("back-btn").addEventListener("click", () => {
  currentStep = Math.max(currentStep - 1, 1);
  showStep(currentStep);
});

function renderReview() {
  const cat = categoryById(form.categoryId.value);
  const el = document.getElementById("review-summary");
  el.innerHTML = `
    <div class="review-block">
      <dl>
        <dt>Business name</dt><dd>${escapeHtml(form.businessName.value)}</dd>
        <dt>Category</dt><dd>${escapeHtml(cat?.name || "")}${selectedSecondary.size ? ` + ${selectedSecondary.size} more` : ""}</dd>
        <dt>Years operating</dt><dd>${escapeHtml(form.yearsOperating.value)}</dd>
        <dt>Location</dt><dd>${escapeHtml(form.city.value)}, ${escapeHtml(form.province.value)}</dd>
        <dt>Areas served</dt><dd>${[form.city.value, ...selectedAreas].join(", ")}</dd>
        <dt>Phone</dt><dd>${escapeHtml(form.phone.value)}</dd>
        <dt>WhatsApp</dt><dd>${escapeHtml(form.whatsapp.value)}</dd>
        <dt>Email</dt><dd>${escapeHtml(form.email.value)}</dd>
        <dt>Logo</dt><dd>${logoUrl ? "Uploaded" : "Not added — you can add this later"}</dd>
        <dt>Portfolio photos</dt><dd>${galleryUrls.length} uploaded</dd>
      </dl>
    </div>`;
}

/* ---------------- Submit ---------------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById("submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";

  try {
    const businessHours = {};
    document.querySelectorAll(".hours-row").forEach((row) => {
      const day = row.dataset.day;
      const closed = row.querySelector(".hours-closed").checked;
      businessHours[day] = closed ? "Closed" : `${row.querySelector(".hours-open").value}-${row.querySelector(".hours-close").value}`;
    });

    const servicesList = form.services.value.split("\n").map((s) => s.trim()).filter(Boolean);
    const certList = form.certifications.value.split("\n").map((s) => s.trim()).filter(Boolean);

    const contractorDoc = {
      businessName: form.businessName.value.trim(),
      slug: slugify(form.businessName.value.trim()), // finalized/uniqued server-side by onContractorCreate
      categoryId: form.categoryId.value,
      secondaryCategoryIds: [...selectedSecondary],
      province: form.province.value,
      city: form.city.value,
      areasServed: [form.city.value, ...selectedAreas],
      description: form.description.value.trim(),
      services: servicesList,
      logoUrl, coverUrl: "", galleryUrls,
      phone: form.phone.value.trim(),
      whatsapp: form.whatsapp.value.trim(),
      email: form.email.value.trim(),
      website: form.website.value.trim(),
      socials: { facebook: form.facebook.value.trim(), instagram: form.instagram.value.trim() },
      businessHours,
      yearsOperating: Number(form.yearsOperating.value),
      languagesSpoken: [...selectedLanguages],
      certifications: certList,
      complianceDocs: [],
      completedProjects: 0,
      avgResponseTimeHours: null,

      // Required by firestore.rules' create condition — server trigger
      // (onContractorCreate) then locks these + trialEndsAt authoritatively.
      status: "pending",
      tier: "basic",
      subscriptionStatus: "trial",
      verified: false,
    };

    await setDoc(doc(db, "contractors", auth.currentUser.uid), contractorDoc);

    showAlert("success", "Listing submitted! It's now awaiting a quick review — we'll email you once it's live. Redirecting to your dashboard…");
    setTimeout(() => (window.location.href = "/dashboard.html"), 1800);
  } catch (err) {
    console.error(err);
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit for Review";
    showAlert("error", "Something went wrong submitting your listing. Please try again.");
  }
});

function showAlert(type, message) {
  alertBox.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  alertBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function slugify(str) {
  return String(str).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
