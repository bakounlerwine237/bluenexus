import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, getDocs, orderBy, limit, startAfter, serverTimestamp, updateDoc, arrayUnion, arrayRemove, onSnapshot, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const CLOUDINARY_CLOUD_NAME = "uotg2qg2"; 
const CLOUDINARY_UPLOAD_PRESET = "bluenexus"; 

let currentUser = null;
let userProfile = null;
let currentCommunityId = null; 
let currentCommunityMembers = []; 
let unsubscribeGlobal = null;
let unsubscribeComm = null; 
let lastVisiblePost = null; // Pour la pagination
const $ = (id) => document.getElementById(id);

// ================= GESTION UI (Login / Signup) =================
$('link-to-signup').addEventListener('click', (e) => {
  e.preventDefault();
  $('login-form').style.display = 'none';
  $('signup-form').style.display = 'block';
});
$('link-to-login').addEventListener('click', (e) => {
  e.preventDefault();
  $('signup-form').style.display = 'none';
  $('login-form').style.display = 'block';
});
$('btn-settings-signup').addEventListener('click', async () => {
  await signOut(auth);
  $('login-form').style.display = 'none';
  $('signup-form').style.display = 'block';
});

// ================= NAVIGATION =================
function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = $(`view-${viewId}`);
  if(target) target.classList.add('active');
  
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
  if(navBtn) navBtn.classList.add('active');

  if (viewId === 'community') {
    $('main-nav').style.display = 'none'; $('main-header').style.display = 'none';
  } else {
    $('main-nav').style.display = 'flex'; $('main-header').style.display = 'flex';
    const titles = { home: "Accueil", communities: "Communautés", search: "Recherche", profile: "Mon Profil", settings: "Paramètres", music: "Musique", video: "Vidéo" };
    $('page-title').textContent = titles[viewId] || "BlueNexus";
  }

  if (viewId === 'home') loadGlobalFeed(true);
  if (viewId === 'communities') renderCommunitiesList();
  if (viewId === 'profile') renderProfile();
  if (viewId === 'music') renderMedia('audio');
  if (viewId === 'video') renderMedia('video');
  
  if (viewId !== 'home' && unsubscribeGlobal) { unsubscribeGlobal(); unsubscribeGlobal = null; }
  if (viewId !== 'community' && unsubscribeComm) { unsubscribeComm(); unsubscribeComm = null; }
}

document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
$('btn-settings-top').addEventListener('click', () => switchView('settings'));
$('btn-go-communities').addEventListener('click', () => switchView('communities'));
$('btn-back-home-comm').addEventListener('click', () => switchView('home'));
$('btn-back-from-comm').addEventListener('click', () => switchView('communities'));

// ================= CLOUDINARY =================
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: 'POST', body: formData });
  const data = await res.json();
  return data.secure_url;
}

// ================= AUTHENTIFICATION =================
$('btn-signup').addEventListener('click', async () => {
  const email = $('auth-email-signup').value.trim(), pass = $('auth-pass-signup').value.trim(), name = $('auth-name').value.trim();
  if (!email || !pass || !name) return $('auth-error').textContent = "Remplissez tous les champs.";
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, 'users', cred.user.uid), {
      username: name, email, bio: "Nouveau sur BlueNexus 🚀", photoURL: "", following: [], followers: []
    });
  } catch (e) { $('auth-error').textContent = e.message; }
});

$('btn-login').addEventListener('click', async () => {
  const email = $('auth-email').value.trim(), pass = $('auth-pass').value.trim();
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
    userProfile = snap.data();
    $('auth-screen').classList.remove('active');
    $('app-screen').classList.add('active');
    switchView('home');
  } else {
    $('app-screen').classList.remove('active');
    $('auth-screen').classList.add('active');
  }
});

// ================= FIL D'ACTUALITÉ ET PAGINATION =================
$('btn-global-attach').addEventListener('click', () => $('global-post-file').click());
$('btn-global-publish').addEventListener('click', async () => {
  const content = $('global-post-content').value.trim();
  const file = $('global-post-file').files[0];
  if (!content && !file) return;
  
  $('btn-global-publish').textContent = "Publication...";
  let mediaUrl = null, mediaType = null;
  if (file) {
    mediaUrl = await uploadFile(file);
    if (file.type.startsWith('image')) mediaType = 'image';
    else if (file.type.startsWith('video')) mediaType = 'video';
    else mediaType = 'audio';
  }
  
  await addDoc(collection(db, 'posts'), {
    communityId: 'global', communityType: 'global', content, 
    authorId: currentUser.uid, authorName: userProfile.username, authorPhoto: userProfile.photoURL || "",
    mediaUrl, mediaType, likes: [], createdAt: serverTimestamp()
  });
  
  $('global-post-content').value = ''; $('global-post-file').value = '';
  $('btn-global-publish').textContent = "Publier";
  loadGlobalFeed(true); // Recharger
});

async function loadGlobalFeed(reset = false) {
  const list = $('global-feed-list');
  if (reset) {
    list.innerHTML = '<p class="muted">Chargement...</p>';
    lastVisiblePost = null;
  }
  
  let q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(10));
  if (lastVisiblePost && !reset) {
    q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), startAfter(lastVisiblePost), limit(10));
  }

  const snap = await getDocs(q);
  if (snap.empty && reset) return list.innerHTML = '<p class="muted">Aucun message.</p>';
  
  if (reset) list.innerHTML = '';
  lastVisiblePost = snap.docs[snap.docs.length - 1];
  
  snap.docs.forEach(d => {
    list.innerHTML += generatePostHTML(d);
  });
}

$('btn-load-more').addEventListener('click', () => loadGlobalFeed(false));

// ================= MUSIQUE ET VIDÉO =================
async function renderMedia(type) {
  const list = $(`${type}-list`);
  list.innerHTML = '<p class="muted">Chargement...</p>';
  const q = query(collection(db, 'posts'), where('mediaType', '==', type), orderBy('createdAt', 'desc'), limit(30));
  const snap = await getDocs(q);
  
  if (snap.empty) return list.innerHTML = `<p class="muted">Aucun fichier ${type} disponible.</p>`;
  
  list.innerHTML = snap.docs.map(d => {
    const p = d.data();
    let mediaHtml = '';
    if (type === 'audio') mediaHtml = `<audio src="${p.mediaUrl}" controls style="width:100%; margin-top:10px;"></audio>`;
    if (type === 'video') mediaHtml = `<video src="${p.mediaUrl}" controls style="width:100%; border-radius:8px; margin-top:10px;"></video>`;
    
    return `<div class="media-item">
      <div class="post-header">👤 @${p.authorName}</div>
      <p>${p.content}</p>
      ${mediaHtml}
    </div>`;
  }).join('');
}

// ================= SUPPRESSION ET HTML POSTS =================
function generatePostHTML(docSnap) {
  const p = docSnap.data();
  const avatar = p.authorPhoto ? `<img src="${p.authorPhoto}" class="post-avatar">` : `<div class="post-avatar">${p.authorName[0].toUpperCase()}</div>`;
  const isLiked = p.likes?.includes(currentUser.uid);
  
  let mediaHtml = '';
  if (p.mediaUrl) {
    if (p.mediaType === 'image') mediaHtml = `<img src="${p.mediaUrl}" class="post-media">`;
    else if (p.mediaType === 'video') mediaHtml = `<video src="${p.mediaUrl}" controls class="post-media"></video>`;
    else if (p.mediaType === 'audio') mediaHtml = `<audio src="${p.mediaUrl}" controls class="post-media"></audio>`;
  }

  // Bouton supprimer visible uniquement par l'auteur
  const deleteBtn = p.authorId === currentUser.uid ? 
    `<button onclick="window.deletePost('${docSnap.id}')" class="btn-secondary small" style="color:#ff6b6b; border-color:#ff6b6b;">🗑️</button>` : '';

  return `<div class="media-item" id="post-${docSnap.id}">
    <div class="post-header">${avatar} @${p.authorName}</div>
    <p>${p.content}</p>
    ${mediaHtml}
    <div style="margin-top:0.5rem; display:flex; gap:10px;">
      <button onclick="window.likePost('${docSnap.id}', ${isLiked})" class="btn-secondary small">${isLiked?'💙':'🤍'} ${p.likes?.length || 0}</button>
      ${deleteBtn}
    </div>
  </div>`;
}

window.deletePost = async (postId) => {
  if(confirm("Voulez-vous vraiment supprimer ce message ?")) {
    await deleteDoc(doc(db, 'posts', postId));
    const el = document.getElementById(`post-${postId}`);
    if(el) el.remove();
  }
};

window.likePost = async (postId, isLiked) => {
  const ref = doc(db, 'posts', postId);
  if (isLiked) await updateDoc(ref, { likes: arrayRemove(currentUser.uid) });
  else await updateDoc(ref, { likes: arrayUnion(currentUser.uid) });
};

// ================= COMMUNAUTÉS =================
$('btn-new-community').addEventListener('click', () => $('modal-community').classList.remove('hidden'));
$('comm-cancel').addEventListener('click', () => $('modal-community').classList.add('hidden'));
$('comm-save').addEventListener('click', async () => {
  const name = $('comm-name').value.trim();
  if (!name) return;
  const ref = await addDoc(collection(db, 'communities'), {
    name, description: $('comm-desc').value.trim(), ownerId: currentUser.uid, members: [currentUser.uid], createdAt: serverTimestamp()
  });
  $('modal-community').classList.add('hidden');
  renderCommunitiesList();
});

async function renderCommunitiesList() {
  const list = $('communities-list');
  const snap = await getDocs(collection(db, 'communities'));
  list.innerHTML = snap.docs.map(c => `<div class="card" onclick="window.openCommunity('${c.id}')"><h4>${c.data().name}</h4><p class="muted">${c.data().description}</p></div>`).join('');
}

window.openCommunity = async (id) => {
  currentCommunityId = id;
  const snap = await getDoc(doc(db, 'communities', id));
  if (!snap.exists()) return;
  
  const data = snap.data();
  currentCommunityMembers = data.members;
  $('comm-title-display').textContent = data.name;
  $('members-count').textContent = `${data.members.length} membres`;
  
  if (data.members.includes(currentUser.uid)) $('post-form-container').style.display = 'flex';
  else $('post-form-container').style.display = 'none';

  switchView('community');
  
  unsubscribeComm = onSnapshot(query(collection(db, 'posts'), where('communityId', '==', id), orderBy('createdAt', 'desc')), snap => {
    $('posts-list').innerHTML = snap.docs.map(d => generatePostHTML(d)).join('');
  });
};

$('btn-join-community').addEventListener('click', async () => {
  await updateDoc(doc(db, 'communities', currentCommunityId), { members: arrayUnion(currentUser.uid) });
  window.openCommunity(currentCommunityId);
});

$('btn-publish-post').addEventListener('click', async () => {
  const content = $('post-content').value.trim();
  if (!content) return;
  $('post-content').value = '';
  await addDoc(collection(db, 'posts'), {
    communityId: currentCommunityId, communityType: 'public', content, 
    authorId: currentUser.uid, authorName: userProfile.username, likes: [], createdAt: serverTimestamp()
  });
});

// ================= PROFIL ET FOLLOW =================
function renderProfile() {
  if(!userProfile) return;
  $('profile-name').textContent = userProfile.username;
  $('profile-bio').textContent = userProfile.bio || 'Aucune bio.';
  $('profile-followers').textContent = `${userProfile.followers?.length || 0} abonnés`;
  
  const av = $('profile-avatar');
  if (userProfile.photoURL) {
    av.style.backgroundImage = `url(${userProfile.photoURL})`; av.textContent = '';
  } else {
    av.style.backgroundImage = 'none'; av.textContent = userProfile.username[0].toUpperCase();
  }
}

$('btn-edit-profile-trigger').addEventListener('click', () => $('modal-profile').classList.remove('hidden'));
$('btn-cancel-profile').addEventListener('click', () => $('modal-profile').classList.add('hidden'));
$('btn-save-profile').addEventListener('click', async () => {
  const file = $('edit-avatar').files[0];
  let photoURL = userProfile.photoURL;
  $('btn-save-profile').textContent = "Patientez...";
  if (file) photoURL = await uploadFile(file);
  await updateDoc(doc(db, 'users', currentUser.uid), { bio: $('edit-bio').value.trim(), photoURL });
  userProfile.bio = $('edit-bio').value.trim();
  userProfile.photoURL = photoURL;
  $('modal-profile').classList.add('hidden');
  renderProfile();
  $('btn-save-profile').textContent = "Enregistrer";
});

// ================= RECHERCHE (Cliqable vers profil) =================
$('search-input').addEventListener('input', async (e) => {
  const term = e.target.value.toLowerCase();
  const usersDiv = $('search-results-users');
  const commsDiv = $('search-results-communities');
  if(!term) { usersDiv.innerHTML = ''; commsDiv.innerHTML = ''; return; }
  
  const snapU = await getDocs(collection(db, 'users'));
  usersDiv.innerHTML = '<h4>Utilisateurs</h4>' + snapU.docs.filter(d => d.data().username.toLowerCase().includes(term)).map(d => `<div class="card" onclick="window.followUser('${d.id}')">👤 ${d.data().username}</div>`).join('');
  
  const snapC = await getDocs(collection(db, 'communities'));
  commsDiv.innerHTML = '<h4>Communautés</h4>' + snapC.docs.filter(d => d.data().name.toLowerCase().includes(term)).map(d => `<div class="card" onclick="window.openCommunity('${d.id}')">🌐 ${d.data().name}</div>`).join('');
});

// Fonction d'abonnement basique
window.followUser = async (targetId) => {
  if(targetId === currentUser.uid) return alert("C'est votre propre profil.");
  await updateDoc(doc(db, 'users', currentUser.uid), { following: arrayUnion(targetId) });
  await updateDoc(doc(db, 'users', targetId), { followers: arrayUnion(currentUser.uid) });
  alert("Vous êtes maintenant abonné à cet utilisateur !");
};
