/**
 * Audit phone numbers across Firestore collections.
 * Usage: npx tsx scripts/audit-phones.ts
 */

import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

// Init Firebase Admin — load from .env.local
const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
const saLine = envFile.split('\n').find(l => l.startsWith('FIREBASE_SERVICE_ACCOUNT='));
if (!saLine) throw new Error('FIREBASE_SERVICE_ACCOUNT not found in .env.local');
const serviceAccount = JSON.parse(saLine.split('=').slice(1).join('='));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const PHONES_TO_CHECK = [
  '404-442-7260',   // David Thompson
  '404-538-9332',   // David Favero
];

// Generate all format variants
function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, '');
  const variants = new Set<string>();
  variants.add(phone);
  variants.add(digits);
  if (digits.length === 10) {
    variants.add(`+1${digits}`);
    variants.add(`1${digits}`);
    variants.add(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`);
    variants.add(`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`);
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    const ten = digits.slice(1);
    variants.add(`+${digits}`);
    variants.add(ten);
    variants.add(`${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`);
    variants.add(`(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`);
  }
  return [...variants];
}

async function searchCollection(collection: string, variants: string[]) {
  const results: any[] = [];
  for (const variant of variants) {
    const snap = await db.collection(collection).where('phone', '==', variant).get();
    for (const doc of snap.docs) {
      if (!results.some(r => r.id === doc.id)) {
        results.push({ id: doc.id, collection, ...doc.data() });
      }
    }
  }
  return results;
}

async function main() {
  for (const phone of PHONES_TO_CHECK) {
    console.log(`\n========== ${phone} ==========`);
    const variants = phoneVariants(phone);
    console.log('Checking variants:', variants);

    for (const coll of ['users', 'players']) {
      const results = await searchCollection(coll, variants);
      if (results.length > 0) {
        console.log(`\n  [${coll}] ${results.length} doc(s):`);
        for (const r of results) {
          console.log(`    ID: ${r.id}`);
          console.log(`      phone: ${r.phone}`);
          console.log(`      firstName: ${r.firstName}, lastName: ${r.lastName}`);
          if (r.ownerId) console.log(`      ownerId: ${r.ownerId}`);
          if (r.linkedUserId) console.log(`      linkedUserId: ${r.linkedUserId}`);
          if (r.email) console.log(`      email: ${r.email}`);
        }
      } else {
        console.log(`\n  [${coll}] No docs found`);
      }
    }
  }

  process.exit(0);
}

main().catch(console.error);
