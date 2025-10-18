import { getFirestore } from 'firebase/firestore';
import { getClientApp } from './app';

const app = getClientApp();
// getFirestore() will throw if the app is not initialized.
export const db = app ? getFirestore(app) : null;
