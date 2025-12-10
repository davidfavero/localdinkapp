// Preload script to ensure Buffer is globally available
const { Buffer } = require('buffer');

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

console.log('✅ Buffer preloaded globally');


