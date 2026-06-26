import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC0KrMbs0fJ75SJYMskeqv8ytB7Id382Xs",
  authDomain: "golf-tracker-data.web.app",
  projectId: "golf-tracker-data",
  storageBucket: "golf-tracker-data.firebasestorage.app",
  messagingSenderId: "607235998741",
  appId: "1:607235998741:web:7dc88cc3525e45922b7a1c"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
});
