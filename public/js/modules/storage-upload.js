import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import { storage, auth } from "../firebase-config.js";

const MAX_BYTES = 5 * 1024 * 1024; // matches storage.rules
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Uploads a logo/cover/gallery image to contractors/{uid}/{kind}/{filename}
 * and returns its public download URL. Storage rules restrict this path to
 * the owning contractor (or an admin), so this only ever succeeds for the
 * signed-in contractor's own files.
 */
export async function uploadContractorImage(file, kind = "gallery") {
  if (!auth.currentUser) throw new Error("You must be signed in to upload images.");
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error("Please upload a JPG, PNG, or WEBP image.");
  if (file.size > MAX_BYTES) throw new Error("Image must be under 5MB.");

  const uid = auth.currentUser.uid;
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
  const path = `contractors/${uid}/${kind}/${safeName}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}

/** Uploads a compliance document (licence/insurance/certificate PDF or image)
 * to the private compliance/{uid}/ path — not publicly readable. */
export async function uploadComplianceDoc(file) {
  if (!auth.currentUser) throw new Error("You must be signed in to upload documents.");
  const allowed = [...ALLOWED_TYPES, "application/pdf"];
  if (!allowed.includes(file.type)) throw new Error("Please upload a JPG, PNG, or PDF file.");
  if (file.size > MAX_BYTES) throw new Error("File must be under 5MB.");

  const uid = auth.currentUser.uid;
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
  const path = `compliance/${uid}/${safeName}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file, { contentType: file.type });
  return { url: await getDownloadURL(storageRef), path };
}
