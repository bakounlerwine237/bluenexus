import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, getDocs, orderBy, limit, serverTimestamp, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let userProfile = null;
let currentCommunityId = null; 
let currentCommunityType = 'chat'; 
let currentCommunityOwner = null; 
const $ = (id) => document.getElementById(id);

// --- PARAMÈTRES ET DÉCONNEXION ---
$('btn-settings').addEventListener('click', () => {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('view-settings').classList.add('active');
  $('page-title').textContent = "Paramètres";
});

$('btn-logout').addEventListener('click', () => signOut(auth));

// --- MODIFIER LE PROFIL ---
$('btn-edit-profile-view').addEventListener('click', () => {
  $('edit-bio').value = userProfile.bio || '';
  $('edit-deco').value = userProfile.decorations[0] || '';
  $('modal-profile').classList.remove('hidden');
});

$('btn-cancel-profile').addEventListener('click', () => $('modal-profile').classList.add('hidden'));

$('btn-save-profile').addEventListener('click', async () => {
  const newBio = $('edit-bio').value.trim();
  const newDeco = $('edit-deco').value;
  const updates = { bio: newBio, decorations: newDeco ? [newDeco] : [] };
  await updateDoc(doc(db, 'users', currentUser.uid), updates);
  userProfile.bio = newBio;
  userProfile.decorations = updates.decorations;
  $('modal-profile').classList.add('hidden');
  renderProfile();
  alert("Profil mis à jour !");
});

// --- AUTHENTIFICATION ---
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

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const snap = await getDoc(doc(db, 'users', user.uid));
    userProfile = snap.exists() ? snap.data() : { username: "Utilisateur", decorations: [], badges: [], pinned: [] };
    
    $('auth-screen').classList.remove('active');
    $('app-screen').classList.add('active');
    renderHome(); renderProfile();
  } else {
    currentUser = null; userProfile = null;
    $('app-screen').classList.remove('active');
    $('auth-screen').classList.add('active');
  }
});

// --- NAVIGATION ---
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
    if (view === 'home') renderHome();
  });
});

// --- COMMUNAUTÉS ---
async function renderHome() {
  const list = $('communities-list');
  const snap = await getDocs(query(collection(db, 'communities'), orderBy('createdAt', 'desc'), limit(30)));
  if (snap.empty) { list.innerHTML = '<p class="muted">Aucune communauté. Créez la première !</p>'; return; }
  list.innerHTML = '';
  snap.forEach(d => {
    const c = d.data();
    const typeIcon = c.type === 'announcement' ? '📢' : '💬';
    
    list.innerHTML += `
      <div class="card" onclick="window.openCommunity('${d.id}', '${c.name}', '${c.description || ''}', '${c.type || 'chat'}', '${c.ownerId}')">
        <h4>${typeIcon} ${c.name}</h4>
        <p class="muted">${c.description || ''}</p>
        <span class="chip">Ouvrir</span>
      </div>`;
  });
}

$('btn-new-community').addEventListener('click', () => $('modal').classList.remove('hidden'));
$('comm-cancel').addEventListener('click', () => $('modal').classList.add('hidden'));

$('comm-save').addEventListener('click', async () => {
  const name = $('comm-name').value.trim();
  const type = $('comm-type').value;
  if (!name) return;
  
  await addDoc(collection(db, 'communities'), {
    name, description: $('comm-desc').value.trim(),
    type: type,
    ownerId: currentUser.uid, members: [currentUser.uid], createdAt: serverTimestamp()
  });

  if (!userProfile.badges.includes("Fondateur")) {
    await updateDoc(doc(db, 'users', currentUser.uid), { badges: arrayUnion("Fondateur") });
    userProfile.badges.push("Fondateur");
    renderProfile();
  }

  $('modal').classList.add('hidden');
  $('comm-name').value = ''; $('comm-desc').value = '';
  renderHome();
});

// --- OUVRIR UNE COMMUNAUTÉ (LOGIQUE D'ÉCRITURE) ---
window.openCommunity = (id, name, desc, type, ownerId) => {
  currentCommunityId = id;
  currentCommunityType = type;
  currentCommunityOwner = ownerId;

  $('comm-title-display').textContent = name;
  $('comm-desc-display').textContent = desc;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('view-community').classList.add('active');
  $('page-title').textContent = name;

  // SI C'EST UNE ANNONCE ET QUE JE NE SUIS PAS L'ADMIN, ON CACHE LE FORMULAIRE
  const formContainer = $('post-form-container');
  if (currentCommunityType === 'announcement' && currentUser.uid !== currentCommunityOwner) {
    formContainer.style.display = 'none'; 
  } else {
    formContainer.style.display = 'block'; 
  }

  loadPosts();
};

$('btn-back-home').addEventListener('click', () => {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('view-home').classList.add('active');
  $('page-title').textContent = "Accueil";
});

// --- POSTS ET LIKES ---
$('btn-publish-post').addEventListener('click', async () => {
  if (currentCommunityType === 'announcement' && currentUser.uid !== currentCommunityOwner) {
    alert("Seul l'administrateur peut publier ici.");
    return;
  }

  const content = $('post-content').value.trim();
  if (!content) return;
  
  await addDoc(collection(db, 'posts'), {
    communityId: currentCommunityId,
    content: content,
    authorId: currentUser.uid,
    authorName: userProfile.username,
    likes: [],
    createdAt: serverTimestamp()
  });
  $('post-content').value = '';
  loadPosts();
});

async function loadPosts() {
  const list = $('posts-list');
  list.innerHTML = '<p class="muted">Chargement...</p>';
  const q = query(collection(db, 'posts'), where('communityId', '==', currentCommunityId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  
  if (snap.empty) { list.innerHTML = '<p class="muted">Aucun message pour le moment.</p>'; return; }
  list.innerHTML = '';
  
  snap.forEach(d => {
    const p = d.data();
    const isLiked = p.likes.includes(currentUser.uid);
    const likeIcon = isLiked ? "💙" : "🤍";
    const isPinned = userProfile.pinned && userProfile.pinned.includes(d.id);
    const pinIcon = isPinned ? "📌 Épinglé" : "📍 Épingler";
    
    const pinBtn = (p.authorId === currentUser.uid) 
      ? `<button onclick="window.togglePin('${d.id}', ${isPinned})" class="btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; border-radius: 20px; margin-left: 5px;">${pinIcon}</button>` 
      : '';

    list.innerHTML += `
      <div class="media-item" style="flex-direction: column; align-items: flex-start;">
        <div style="width: 100%; margin-bottom: 0.5rem;">
          <strong style="color: var(--blue-light); font-size: 0.9rem;">@${p.authorName}</strong>
          <p style="margin-top: 0.3rem; font-size: 0.95rem;">${p.content}</p>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button onclick="window.toggleLike('${d.id}', ${isLiked})" class="btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; border-radius: 20px;">
            ${likeIcon} ${p.likes.length}
          </button>
          ${pinBtn}
        </div>
      </div>`;
  });
}

window.toggleLike = async (postId, isLiked) => {
  const postRef = doc(db, 'posts', postId);
  if (isLiked) { await updateDoc(postRef, { likes: arrayRemove(currentUser.uid) }); }
  else { await updateDoc(postRef, { likes: arrayUnion(currentUser.uid) }); }
  loadPosts();
};

window.togglePin = async (postId, isPinned) => {
  const userRef = doc(db, 'users', currentUser.uid);
  if (isPinned) {
    await updateDoc(userRef, { pinned: arrayRemove(postId) });
    userProfile.pinned = userProfile.pinned.filter(id => id !== postId);
  } else {
    await updateDoc(userRef, { pinned: arrayUnion(postId) });
    if(!userProfile.pinned) userProfile.pinned = [];
    userProfile.pinned.push(postId);
  }
  loadPosts();
  renderProfile();
};

// --- MUSIQUE ET VIDÉO ---
async function renderMusic() { $('music-list').innerHTML = '<p class="muted">La bibliothèque musicale arrive bientôt ! 🎧</p>'; }
async function renderVideo() { $('video-list').innerHTML = '<p class="muted">Les vidéos arrivent bientôt ! 🎬</p>'; }

// --- RECHERCHE ---
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

// --- PROFIL VITRINE ---
async function renderProfile() {
  if (!userProfile) return;
  $('profile-name').textContent = userProfile.username || "Utilisateur";
  $('profile-bio').textContent = userProfile.bio || 'Aucune bio.';
  $('profile-avatar').textContent = userProfile.username ? userProfile.username[0].toUpperCase() : '?';
  
  $('profile-decorations').innerHTML = (userProfile.decorations || []).map(d => `<span class="deco-item">${d}</span>`).join('');
  $('profile-badges').innerHTML = (userProfile.badges || []).map(b => `<span class="badge-item">🏅 ${b}</span>`).join('');
  
  const pinnedContainer = $('profile-pinned');
  pinnedContainer.innerHTML = '';
  
  if (userProfile.pinned && userProfile.pinned.length > 0) {
    pinnedContainer.innerHTML = '<p class="muted">Chargement...</p>';
    try {
      const postDocs = await Promise.all(userProfile.pinned.map(id => getDoc(doc(db, 'posts', id))));
      pinnedContainer.innerHTML = '';
      postDocs.forEach(d => {
        if (d.exists()) {
          const p = d.data();
          pinnedContainer.innerHTML += `
            <div class="card" style="border-color: var(--blue-light);">
              <p style="font-size: 0.85rem;">${p.content}</p>
            </div>`;
        }
      });
    } catch(e) { pinnedContainer.innerHTML = '<p class="muted">Erreur de chargement.</p>'; }
  } else {
    pinnedContainer.innerHTML = '<p class="muted">Aucune contribution épinglée.</p>';
  }
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
