export * from './app';            // exports getClientApp()
export * from './auth';           // auth helpers (getAuth, onAuth, etc.)
export * from './provider';       // <FirebaseProvider />

// If you have these hooks in your repo, keep them;
// otherwise remove these lines.
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
