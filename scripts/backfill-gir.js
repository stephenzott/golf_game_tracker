/**
 * Backfill GIR for all rounds where holeData has gir: null
 *
 * Setup:
 *   1. Firebase Console → Project Settings → Service Accounts → Generate new private key
 *   2. Save the downloaded JSON as scripts/serviceAccount.json (already in .gitignore)
 *   3. npm install firebase-admin --save-dev
 *   4. node scripts/backfill-gir.js
 */

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(readFileSync(new URL('./serviceAccount.json', import.meta.url)));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const calcGir = (score, putts, par) => (score - putts) <= (par - 2);

async function backfill() {
  const usersSnap = await db.collection('users').get();
  let totalRounds = 0;
  let updatedRounds = 0;

  for (const userDoc of usersSnap.docs) {
    const roundsSnap = await db.collection('users').doc(userDoc.id).collection('rounds').get();

    for (const roundDoc of roundsSnap.docs) {
      totalRounds++;
      const round = roundDoc.data();
      if (!Array.isArray(round.holeData)) continue;

      let changed = false;
      const holeData = round.holeData.map(h => {
        if (h.score !== null) {
          const putts = h.putts ?? 2;
          const gir = calcGir(h.score, putts, h.par);
          if (gir !== h.gir || h.putts === null) {
            changed = true;
            return { ...h, putts, gir };
          }
        }
        return h;
      });

      if (changed) {
        await roundDoc.ref.update({ holeData });
        updatedRounds++;
        console.log(`Updated round ${roundDoc.id} (user: ${userDoc.id})`);
      }
    }
  }

  console.log(`\nDone. Checked ${totalRounds} rounds, updated ${updatedRounds}.`);
}

backfill().catch(err => { console.error(err); process.exit(1); });
