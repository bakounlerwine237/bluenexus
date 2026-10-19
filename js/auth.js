import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';
import { switchView } from './ui.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export let currentUser = null;
export let userProfile = null;

const $ = (id) => document.getElementById(id);

$('btn-signup').addEventListener('click', async () => {
  const email = $('auth-email').value.trim(), pass = $('auth-pass').value.trim(), name = $('auth-name').value.trim();
  if (!email || !pass || !name) return $('auth-error').textContent = "Remplissez tous les champs.";
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, 'users', cred.user.uid), {
      username: name, email, bio: "Nouveau sur BlueNexus 🚀", photoURL: "", decorations: [], badges: [], pinned: [], communities: []
    });
  } catch (e) { $('auth-error').textContent = e.message; }
});

$('btn-login').addEventListener('click', async () => {
  const email = $('auth-email').value.trim(), pass = $('auth-pass').value.trim();
  if (!email || !pass) return $('auth-error').textContent = "Email et mot de passe requis.";
  try { await signInWithEmailAndPassword(auth, email, pass); } 
  catch (e) { $('auth-error').textContent = "Identifiants invalides."; }
});

$('btn-forgot-password').addEventListener('click', async () => {
  const email = $('auth-email').value.trim();
  if (!email) return $('auth-error').textContent = "Entrez votre email.";
  try { await sendPasswordResetEmail(auth, email); alert("Email envoyé !"); } 
  catch (e) { $('auth-error').textContent = e.message; }
});

$('btn-logout').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const snap = await getDoc(doc(db, 'users', user.uid));
    userProfile = snap.exists() ? snap.data() : { username: "Utilisateur", pinned: [], badges: [] };
    
    // Afficher la zone admin si l'utilisateur est admin
    if (userProfile.role === 'admin') $('global-post-container').style.display = 'block';

    $('auth-screen').classList.remove('active');
    $('app-screen').classList.add('active');
    switchView('home');
  } else {
    currentUser = null; userProfile = null;
    $('app-screen').classList.remove('active');
    $('auth-screen').classList.add('active');
  }
});
