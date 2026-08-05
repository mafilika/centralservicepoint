// =========================================================
// CENTRAL SERVICE POINT — FIREBASE CONFIGURATION
// =========================================================
// Replace the values below with your own Firebase project's
// config (Firebase Console > Project Settings > General > Your apps).
// This file is safe to be public — Firebase web API keys are not
// secret; access control is enforced by Firestore Security Rules
// and Firebase Auth, not by hiding this config.
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "central-service-point.firebaseapp.com",
  projectId: "central-service-point",
  storageBucket: "central-service-point.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Uncomment to develop against local emulators:
// connectAuthEmulator(auth, "http://localhost:9099");
// connectFirestoreEmulator(db, "localhost", 8080);
