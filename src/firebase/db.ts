import { getFirestore } from 'firebase/firestore';
import { app } from './app';

// getFirestore() will throw if the app is not initialized.
export const db = app ? getFirestore(app) : null;
