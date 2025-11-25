// This file runs before the Next.js app starts
// It ensures Buffer is available globally for Firebase Admin dependencies

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Use Node.js native Buffer (available in Node.js runtime)
    const NodeBuffer = require('buffer').Buffer;
    
    // Ensure Buffer is available globally
    if (typeof globalThis.Buffer === 'undefined') {
      (globalThis as any).Buffer = NodeBuffer;
    }
    if (typeof global.Buffer === 'undefined') {
      (global as any).Buffer = NodeBuffer;
    }
    
    console.log('✅ Buffer polyfill registered successfully');
  }
}

