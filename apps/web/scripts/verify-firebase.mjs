import assert from 'node:assert/strict';
import { deleteApp } from 'firebase/app';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { createServer } from 'vite';

const server = await createServer({
  root: process.cwd(),
  mode: 'emulator',
  server: { middlewareMode: true },
});

let services;

try {
  const { getFirebaseServices } = await server.ssrLoadModule('/src/services/firebase.ts');
  services = getFirebaseServices();
  assert.equal(services, getFirebaseServices());
  assert.equal(services.app.options.projectId, 'demo-taskgo');
  const email = `smoke-${Date.now()}@example.test`;
  const credential = await createUserWithEmailAndPassword(services.auth, email, 'TemporaryTestPass123!');
  assert.equal(credential.user.email, email);

  await assert.rejects(
    getDoc(doc(services.db, 'smoke', 'sample')),
    (error) => error.code === 'permission-denied',
  );

  console.log('Firebase Auth emulator connection and deny-all Firestore rules passed.');
} finally {
  if (services) {
    await signOut(services.auth);
    await deleteApp(services.app);
  }
  await server.close();
}
