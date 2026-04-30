import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

import dotenv from "dotenv";
dotenv.config();

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY?.replace(/[\r\n]/g, '').trim(),
  authDomain: process.env.FIREBASE_AUTH_DOMAIN?.replace(/[\r\n]/g, '').trim(),
  projectId: process.env.FIREBASE_PROJECT_ID?.replace(/[\r\n]/g, '').trim(),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET?.replace(/[\r\n]/g, '').trim(),
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID?.replace(/[\r\n]/g, '').trim(),
  appId: process.env.FIREBASE_APP_ID?.replace(/[\r\n]/g, '').trim(),
  measurementId: process.env.FIREBASE_MEASUREMENT_ID?.replace(/[\r\n]/g, '').trim()
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
