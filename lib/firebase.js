import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

let app;

export function getFirebaseApp() {
  if (!app) {
    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
    };

    const missing = Object.entries(firebaseConfig)
      .filter(([, v]) => !v)
      .map(([k]) => k);

    if (missing.length) {
      throw new Error(
        `Missing Firebase env vars: ${missing.join(', ')}. Set them in .env.local or Vercel env vars.`
      );
    }

    app = initializeApp(firebaseConfig);
  }
  return app;
}

export function getDb() {
  return getFirestore(getFirebaseApp());
}

export function getAuthClient() {
  return getAuth(getFirebaseApp());
}
