import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, getDocs, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let userProfile = null;
const $ = (id) => document.getElementById(id);

// Action pour le bouton Paramètres
$('btn-settings').addEventListener('click', () => {
  alert("⚙️ Les paramètres de BlueNexus arrivent très bientôt !");
});

$('btn-signup').addEventListener('click', async () => {
  const email = $('auth-email').value.trim();
  const pass = $('auth-pass').value.trim();
  const name = $('auth-name').value.trim();
  if (!email || !pass || !name) { $('auth-error').textContent = "Remplissez tous les champs."; return; }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, 'users', cred.user.uid), {
      username: name, email, bio: "Nouveau sur BlueNexus 🚀",
      decorations: [], badges: [], pinned: [], communities: [], createdAt: serverTimestamp()
    });
    $('auth-error').textContent = "";
  } catch (e) { $('auth-error').textContent = e.message; }
});

$('btn-login').addEventListener('click', async () => {
  const email = $('auth-email').value.trim();
  const pass = $('auth-pass').value.trim();
  if (!email || !pass) { $('auth-error').textContent = "Email et mot de passe requis."; return; }
  try { await signInWithEmailAndPassword(auth, email, pass); }
  catch (e) { $('auth-error').textContent = e.message; }
});

// GESTION ROBUSTE DE LA CONNEXION
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      userProfile = snap.exists() ? snap.data() : { username: "Utilisateur", bio: "Nouveau membre" };
    } catch (error) {
      console.error("Erreur de lecture du profil :", error);
      userProfile = { username: "Utilisateur", bio: "Nouveau membre", decorations: [], badges: [] };
    }
    
    // On change d'écran QUOI QU'IL ARRIVE si l'utilisateur est connecté
    $('auth-screen').classList.remove('active');
    $('app-screen').classList.add('active');
    renderHome(); 
    renderProfile();
  } else {
    currentUser = null; userProfile = null;
    $('app-screen').classList.remove('active');
    $('auth-screen').classList.add('active');
  }
});

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = btn.dataset.view;
    $(`view-${view}`).classList.add('active');
    if (view === 'music') renderMusic();
    if (view === 'video') renderVideo();
    if (view === 'profile') renderProfile();
  });
});

async function renderHome() {
  const list = $('communities-list');
  try {
    const snap = await getDocs(query(collection(db, 'communities'), orderBy('createdAt', 'desc'), limit(30)));
    if (snap.empty) { list.innerHTML = '<p class="muted">Aucune communauté. Créez la première !</p>'; return; }
    list.innerHTML = '';
    snap.forEach(d => {
      const c = d.data();
      list.innerHTML += `<div class="card"><h4>${c.name}</h4><p class="muted">${c.description || ''}</p><span class="chip">${c.members?.length || 1} membres</span></div>`;
    });
  } catch(e) {
    list.innerHTML = '<p class="muted">Prêt à créer votre première communauté !</p>';
  }
}

$('btn-new-community').addEventListener('click', () => $('modal').classList.remove('hidden'));
$('comm-cancel').addEventListener('click', () => $('modal').classList.add('hidden'));
$('comm-save').addEventListener('click', async () => {
  const name = $('comm-name').value.trim();
  if (!name) return;
  await addDoc(collection(db, 'communities'), {
    name, description: $('comm-desc').value.trim(),
    ownerId: currentUser.uid, members: [currentUser.uid], createdAt: serverTimestamp()
  });
  $('modal').classList.add('hidden');
  $('comm-name').value = ''; $('comm-desc').value = '';
  renderHome();
});

async function renderMusic() {
  const list = $('music-list');
  const snap = await getDocs(query(collection(db, 'media'), where('type', '==', 'audio'), orderBy('createdAt', 'desc'), limit(30)));
  if (snap.empty) { list.innerHTML = '<p class="muted">Aucun audio disponible.</p>'; return; }
  list.innerHTML = '';
  snap.forEach(d => { const m = d.data();
    list.innerHTML += `<div class="media-item"><div class="thumb">🎵</div><div class="info"><h4>${m.title || 'Sans titre'}</h4><p>Audio</p></div></div>`; });
}

async function renderVideo() {
  const list = $('video-list');
  const snap = await getDocs(query(collection(db, 'media'), where('type', '==', 'video'), orderBy('likes', 'desc'), limit(30)));
  if (snap.empty) { list.innerHTML = '<p class="muted">Aucune vidéo.</p>'; return; }
  list.innerHTML = '';
  snap.forEach(d => { const m = d.data();
    list.innerHTML += `<div class="media-item"><div class="thumb">🎬</div><div class="info"><h4>${m.title || 'Vidéo'}</h4><p>❤️ ${m.likes || 0} · ${m.views || 0} vues</p></div></div>`; });
}

$('search-input').addEventListener('input', debounce(doSearch, 350));
$('search-type').addEventListener('change', doSearch);
async function doSearch() {
  const term = $('search-input').value.trim().toLowerCase();
  const type = $('search-type').value;
  const results = $('search-results');
  results.innerHTML = '';
  if (!term) return;
  if (type === 'all' || type === 'user') {
    const snap = await getDocs(collection(db, 'users'));
    snap.forEach(d => { const u = d.data();
      if (u.username?.toLowerCase().includes(term)) results.innerHTML += `<div class="card"><h4>👤 ${u.username}</h4><p class="muted">${u.bio || ''}</p></div>`; });
  }
  if (type === 'all' || type === 'community') {
    const snap = await getDocs(collection(db, 'communities'));
    snap.forEach(d => { const c = d.data();
      if (c.name?.toLowerCase().includes(term)) results.innerHTML += `<div class="card"><h4>🏘️ ${c.name}</h4><p class="muted">${c.description || ''}</p></div>`; });
  }
  if (!results.innerHTML) results.innerHTML = '<p class="muted">Aucun résultat.</p>';
}

function renderProfile() {
  if (!userProfile) return;
  $('profile-name').textContent = userProfile.username || "Utilisateur";
  $('profile-bio').textContent = userProfile.bio || '';
  $('profile-avatar').textContent = userProfile.username ? userProfile.username[0].toUpperCase() : '?';
  $('profile-decorations').innerHTML = (userProfile.decorations || []).map(d => `<span class="deco-item">${d}</span>`).join('');
  $('profile-badges').innerHTML = (userProfile.badges || []).map(b => `<span class="badge-item">🏅 ${b}</span>`).join('');
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
