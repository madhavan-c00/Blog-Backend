import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

import dotenv from "dotenv";
dotenv.config();

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY?.trim(),
  authDomain: process.env.FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: process.env.FIREBASE_PROJECT_ID?.trim(),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: process.env.FIREBASE_APP_ID?.trim(),
  measurementId: process.env.FIREBASE_MEASUREMENT_ID?.trim()
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
