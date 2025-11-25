// Ensure Buffer is available globally before Firebase Admin imports
// This is needed for Next.js compatibility with Firebase Admin dependencies

// Use require to ensure synchronous loading
const { Buffer } = require('buffer');

// Set Buffer globally if it's not already available
if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

if (typeof global.Buffer === 'undefined') {
  (global as any).Buffer = Buffer;
}

// Also set it on the window object for completeness (though not needed server-side)
if (typeof window !== 'undefined' && typeof (window as any).Buffer === 'undefined') {
  (window as any).Buffer = Buffer;
}

