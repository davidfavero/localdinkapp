// Single app init — no React, no barrel imports
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { firebaseConfig } from './config';

// Initialize Firebase
export const app: FirebaseApp = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
