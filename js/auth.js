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


/* =========================================================
   HELPER FUNCTIONS
========================================================= */

function showAlert(el, message, type = "error") {
  if (!el) return;

  el.textContent = message;
  el.className = `alert show alert-${type}`;
}


function setLoading(button, loading) {
  if (!button) return;

  if (loading) {
    button.disabled = true;

    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }

    button.innerHTML =
      `<span class="spinner" aria-hidden="true"></span> Please wait…`;

  } else {
    button.disabled = false;

    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
    }
  }
}


function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


function mapAuthError(err) {
  const code = err?.code;

  const messages = {

    "auth/email-already-in-use":
      "An account with this email already exists.",

    "auth/invalid-email":
      "That email address is invalid.",

    "auth/weak-password":
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,

    "auth/user-not-found":
      "No account was found with that email.",

    "auth/wrong-password":
      "Incorrect password.",

    "auth/invalid-credential":
      "Incorrect email or password.",

    "auth/too-many-requests":
      "Too many attempts. Please wait a moment and try again.",

    "auth/network-request-failed":
      "Network error. Please check your internet connection.",

    "auth/operation-not-allowed":
      "This sign-in method has not been enabled in Firebase Authentication."
  };

  return messages[code] || err?.message || "Something went wrong. Please try again.";
}



/* =========================================================
   REGISTER
========================================================= */

function initRegisterForm() {

  const form = document.getElementById("register-form");

  if (!form) {
    return;
  }

  const alertBox = document.getElementById("form-alert");
  const submitBtn = form.querySelector('button[type="submit"]');

  let selectedRole = "customer";


  /* -----------------------------------------
     ROLE SELECTION
  ----------------------------------------- */

  const roleButtons =
    document.querySelectorAll(".role-toggle button[data-role]");

  roleButtons.forEach((btn) => {

    btn.addEventListener("click", (e) => {

      e.preventDefault();

      roleButtons.forEach((button) => {
        button.classList.remove("active");
      });

      btn.classList.add("active");

      selectedRole = btn.dataset.role;

      const companyGroup =
        document.getElementById("company-name-group");

      if (companyGroup) {

        companyGroup.style.display =
          selectedRole === "contractor"
            ? "block"
            : "none";
      }

      console.log("Selected role:", selectedRole);
    });

  });


  /* -----------------------------------------
     FORM SUBMISSION
  ----------------------------------------- */

  form.addEventListener("submit", async (e) => {

    e.preventDefault();

    if (alertBox) {
      alertBox.classList.remove("show");
    }


    const name =
      form.fullName?.value.trim() || "";

    const email =
      form.email?.value.trim() || "";

    const password =
      form.password?.value || "";

    const confirmPassword =
      form.confirmPassword?.value || "";

    const companyName =
      form.companyName?.value.trim() || "";

    const terms =
      form.terms?.checked || false;


    /* -----------------------------------------
       VALIDATION
    ----------------------------------------- */

    if (!name || !email || !password) {

      showAlert(
        alertBox,
        "Please fill in all required fields."
      );

      return;
    }


    if (!isValidEmail(email)) {

      showAlert(
        alertBox,
        "Please enter a valid email address."
      );

      return;
    }


    if (password.length < PASSWORD_MIN_LENGTH) {

      showAlert(
        alertBox,
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
      );

      return;
    }


    if (password !== confirmPassword) {

      showAlert(
        alertBox,
        "Passwords do not match."
      );

      return;
    }


    if (
      selectedRole === "contractor" &&
      !companyName
    ) {

      showAlert(
        alertBox,
        "Please enter your business name."
      );

      return;
    }


    if (!terms) {

      showAlert(
        alertBox,
        "You must accept the Terms and Privacy Policy to continue."
      );

      return;
    }


    /* -----------------------------------------
       START LOADING
    ----------------------------------------- */

    setLoading(submitBtn, true);


    try {

      /* -----------------------------------------
         CREATE FIREBASE AUTH ACCOUNT
      ----------------------------------------- */

      const cred =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );


      /* -----------------------------------------
         UPDATE DISPLAY NAME
      ----------------------------------------- */

      await updateProfile(
        cred.user,
        {
          displayName: name
        }
      );


      /* -----------------------------------------
         SEND VERIFICATION EMAIL
      ----------------------------------------- */

      await sendEmailVerification(
        cred.user
      );


      /* -----------------------------------------
         CREATE USER DOCUMENT
      ----------------------------------------- */

      await setDoc(
        doc(
          db,
          "users",
          cred.user.uid
        ),
        {
          uid: cred.user.uid,

          fullName: name,

          email: email,

          role: selectedRole,

          createdAt: serverTimestamp(),

          emailVerified: false,

          status: "active"
        }
      );


      /* -----------------------------------------
         CONTRACTOR PROFILE
      ----------------------------------------- */

      if (selectedRole === "contractor") {

        const trialStart = new Date();

        const trialEnd = new Date(trialStart);

        trialEnd.setDate(
          trialEnd.getDate() + 60
        );


        await setDoc(
          doc(
            db,
            "contractors",
            cred.user.uid
          ),
          {

            ownerUid: cred.user.uid,

            businessName: companyName,

            email: email,

            approvalStatus: "pending",

            verified: false,

            subscriptionPlan: "trial",

            subscriptionStatus: "trial",

            trialStartedAt: trialStart,

            trialEndsAt: trialEnd,

            createdAt: serverTimestamp(),

            province: "",

            cities: [],

            categories: [],

            services: [],

            rating: 0,

            reviewCount: 0,

            whatsapp: "",

            whatsappNotificationsEnabled: true
          }
        );
      }


      /* -----------------------------------------
         SUCCESS
      ----------------------------------------- */

      showAlert(
        alertBox,
        "Account created! Please check your email to verify your address.",
        "success"
      );


      const redirect =
        new URLSearchParams(
          window.location.search
        ).get("redirect");


    const destination =
    redirect ||
    (
        selectedRole === "contractor"
            ? "contractor-onboarding.html"
            : "dashboard-customer.html"
    );


      setTimeout(() => {

        window.location.href =
          destination;

      }, 1500);


    } catch (err) {

      console.error(
        "Registration Error:",
        err
      );

      showAlert(
        alertBox,
        mapAuthError(err)
      );

    } finally {

      setLoading(
        submitBtn,
        false
      );

    }

  });

}



/* =========================================================
   LOGIN
========================================================= */

function initLoginForm() {

  const form =
    document.getElementById("login-form");

  if (!form) {
    return;
  }


  const alertBox =
    document.getElementById("form-alert");

  const submitBtn =
    form.querySelector(
      'button[type="submit"]'
    );


  /* -----------------------------------------
     LOGIN
  ----------------------------------------- */

  form.addEventListener(
    "submit",
    async (e) => {

      e.preventDefault();


      if (alertBox) {
        alertBox.classList.remove("show");
      }


      const email =
        form.email?.value.trim() || "";

      const password =
        form.password?.value || "";


      if (!email || !password) {

        showAlert(
          alertBox,
          "Please enter your email and password."
        );

        return;
      }


      setLoading(
        submitBtn,
        true
      );


      try {

        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );


        const redirect =
          new URLSearchParams(
            window.location.search
          ).get("redirect");


        window.location.href =
          redirect || "index.html";


      } catch (err) {

        console.error(
          "Login Error:",
          err
        );

        showAlert(
          alertBox,
          mapAuthError(err)
        );


      } finally {

        setLoading(
          submitBtn,
          false
        );

      }

    }
  );


  /* -----------------------------------------
     FORGOT PASSWORD
  ----------------------------------------- */

  const forgotLink =
    document.getElementById(
      "forgot-password-link"
    );


  if (forgotLink) {

    forgotLink.addEventListener(
      "click",
      async (e) => {

        e.preventDefault();


        const email =
          form.email?.value.trim() || "";


        if (!isValidEmail(email)) {

          showAlert(
            alertBox,
            "Enter your email above first, then click 'Forgot password'."
          );

          return;
        }


        try {

          await sendPasswordResetEmail(
            auth,
            email
          );


          showAlert(
            alertBox,
            "Password reset email sent.",
            "success"
          );


        } catch (err) {

          console.error(
            "Password Reset Error:",
            err
          );


          showAlert(
            alertBox,
            mapAuthError(err)
          );

        }

      }
    );

  }

}



/* =========================================================
   INITIALIZE
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    initRegisterForm();

    initLoginForm();

  }
);
