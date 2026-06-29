import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC0KrMbs0fJ75SJYMskeqv8ytB7Id382Xs",
  authDomain: "golf-tracker-data.web.app",
  projectId: "golf-tracker-data",
  storageBucket: "golf-tracker-data.firebasestorage.app",
  messagingSenderId: "607235998741",
  appId: "1:607235998741:web:7dc88cc3525e45922b7a1c"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache() });
} catch {
  db = getFirestore(app);
}
export { db };
