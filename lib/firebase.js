import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

function readFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

function missingKeys(cfg) {
  return Object.entries(cfg)
    .filter(([_, v]) => !v)
    .map(([k]) => k);
}

export function getFirebaseApp() {
  const cfg = readFirebaseConfig();
  const missing = missingKeys(cfg);

  // IMPORTANT: Don't crash Vercel build/SSR. Only enforce on the client.
  if (missing.length && typeof window !== "undefined") {
    throw new Error("Missing Firebase env vars: " + missing.join(", "));
  }

  return !getApps().length ? initializeApp(cfg) : getApp();
}

export function getAuthClient() {
  return getAuth(getFirebaseApp());
}

export function getDb() {
  return getFirestore(getFirebaseApp());
}

// Keep default export for any existing imports
export default getFirebaseApp();
