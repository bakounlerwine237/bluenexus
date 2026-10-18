import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, getDocs, orderBy, limit, serverTimestamp, updateDoc, arrayUnion, arrayRemove, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const CLOUDINARY_CLOUD_NAME = "uotg2qg2"; 
const CLOUDINARY_UPLOAD_PRESET = "bluenexus"; 

let currentUser = null;
let userProfile = null;
let currentCommunityId = null; 
let currentCommunityType = 'chat'; 
let currentCommunityOwner = null; 
let unsubscribeGlobalFeed = null;
let unsubscribeCommunityFeed = null; 
const $ = (id) => document.getElementById(id);

// ================= NAVIGATION =================
function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = $(`view-${viewId}`);
  if(target) target.classList.add('active');
  
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
  if(navBtn) navBtn.classList.add('active');

  const titles = { home: "Accueil", communities: "Communautés", messages: "Messages", music: "Musique", video: "Vidéo", search: "Recherche", profile: "Mon Profil", settings: "Paramètres" };
  $('page-title').textContent = titles[viewId] || "BlueNexus";

  // Gestion de l'affichage de la barre de navigation principale
  if (viewId === 'community') {
    $('main-nav').style.display = 'none'; // Cache le menu du bas dans le chat
    $('main-header').style.display = 'none'; // Cache le header principal
  } else {
    $('main-nav').style.display = 'flex';
    $('main-header').style.display = 'flex';
  }

  if (viewId === 'home') renderGlobalFeed();
  if (viewId === 'communities') renderCommunitiesList();
  if (viewId === 'messages') renderUsersForMessages();
  if (viewId === 'profile') renderProfile();
  
  // Nettoyage des flux temps réel si on quitte
  if (viewId !== 'home' && unsubscribeGlobalFeed) { unsubscribeGlobalFeed(); unsubscribeGlobalFeed = null; }
  if (viewId !== 'community' && unsubscribeCommunityFeed) { unsubscribeCommunityFeed(); unsubscribeCommunityFeed = null; }
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});
$('btn-settings-top').addEventListener('click', () => switchView('settings'));

// Bouton pour aller aux communautés depuis l'accueil
$('btn-go-communities').addEventListener('click', () => switchView('communities'));
$('btn-back-home-comm').addEventListener('click', () => switchView('home'));
$('btn-back-from-comm').addEventListener('click', () => switchView('communities'));

// ================= CLOUDINARY =================
async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
    method: 'POST', body: formData
  });
  const data = await res.json();
  if(data.secure_url) return data.secure_url;
  throw new Error("Upload échoué");
}

// ================= AUTHENTIFICATION =================
$('btn-signup').addEventListener('click', async () => {
  const email = $('auth-email').value.trim(), pass = $('auth-pass').value.trim(), name = $('auth-name').value.trim();
  if (!email || !pass || !name) return $('auth-error').textContent = "Remplissez tous les champs.";
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, 'users', cred.user.uid), {
      username: name, email, bio: "Nouveau sur BlueNexus 🚀", photoURL: "", decorations: [], badges: [], pinned: []
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
  try { await sendPasswordResetEmail(auth, email); alert("Email envoyé ! Vérifiez vos spams."); } 
  catch (e) { $('auth-error').textContent = e.message; }
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const snap = await getDoc(doc(db, 'users', user.uid));
    userProfile = snap.exists() ? snap.data() : { username: "Utilisateur", decorations: [], badges: [], pinned: [], photoURL: "" };
    $('auth-screen').classList.remove('active');
    $('app-screen').classList.add('active');
    switchView('home');
  } else {
    currentUser = null;
    if(unsubscribeGlobalFeed) unsubscribeGlobalFeed();
    if(unsubscribeCommunityFeed) unsubscribeCommunityFeed();
    $('app-screen').classList.remove('active');
    $('auth-screen').classList.add('active');
  }
});

// ================= FLUX D'ACTUALITÉ GLOBAL (ACCUEIL) =================
function renderGlobalFeed() {
  const list = $('global-feed-list');
  list.innerHTML = '<p class="muted">Chargement du fil d\'actualité...</p>';
  
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));
  
  unsubscribeGlobalFeed = onSnapshot(q, snap => {
    if (snap.empty) return list.innerHTML = '<p class="muted">Aucun message sur le réseau pour l\'instant.</p>';
    list.innerHTML = snap.docs.map(d => generatePostHTML(d, false)).join('');
  });
}

// ================= COMMUNAUTÉS (TRIÉES PAR POPULARITÉ) =================
$('btn-new-community').addEventListener('click', () => $('modal-community').classList.remove('hidden'));
$('comm-cancel').addEventListener('click', () => $('modal-community').classList.add('hidden'));

$('comm-save').addEventListener('click', async () => {
  const name = $('comm-name').value.trim(), type = $('comm-type').value;
  const imgFile = $('comm-image').files[0];
  if (!name) return;
  
  $('comm-save').textContent = "Création...";
  try {
    let imageURL = "";
    if(imgFile) imageURL = await uploadToCloudinary(imgFile);

    await addDoc(collection(db, 'communities'), {
      name, description: $('comm-desc').value.trim(), type, imageURL, ownerId: currentUser.uid, members: [currentUser.uid], createdAt: serverTimestamp()
    });
    if (!userProfile.badges.includes("Fondateur")) {
      await updateDoc(doc(db, 'users', currentUser.uid), { badges: arrayUnion("Fondateur") });
      userProfile.badges.push("Fondateur");
    }
    $('modal-community').classList.add('hidden');
    renderCommunitiesList();
  } catch(e) { alert(e.message); }
  $('comm-save').textContent = "Créer";
});

async function renderCommunitiesList() {
  const list = $('communities-list');
  list.innerHTML = '<p class="muted">Chargement...</p>';
  
  const snap = await getDocs(collection(db, 'communities'));
  if (snap.empty) return list.innerHTML = '<p class="muted">Aucune communauté trouvée.</p>';
  
  // Tri côté client : du plus populaire (membres) au moins populaire
  const comms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  comms.sort((a, b) => (b.members?.length || 0) - (a.members?.length || 0));

  list.innerHTML = comms.map(c => {
    const imgHtml = c.imageURL ? `<img src="${c.imageURL}" style="width:100%; height:80px; object-fit:cover; border-radius:8px; margin-bottom:8px;">` : '';
    return `<div class="card" onclick="window.openCommunity('${c.id}', '${c.name}', '${c.description || ''}', '${c.type}', '${c.ownerId}', '${c.imageURL || ''}', ${c.members?.length || 1})">
      ${imgHtml}
      <h4>${c.type === 'announcement' ? '📢' : '💬'} ${c.name}</h4>
      <p class="muted">${c.description || ''}</p>
      <span class="chip">${c.members?.length || 1} membres</span>
    </div>`;
  }).join('');
}

// ================= OUVERTURE D'UNE COMMUNAUTÉ (CHAT) =================
window.openCommunity = (id, name, desc, type, ownerId, imageURL, membersCount) => {
  currentCommunityId = id; 
  currentCommunityType = type; 
  currentCommunityOwner = ownerId;
  
  $('comm-title-display').textContent = name;
  $('members-count').textContent = `${membersCount} membres`;
  
  // Gestion de l'affichage du formulaire en bas
  const chatBar = $('post-form-container');
  if (type === 'announcement' && currentUser.uid !== ownerId) {
    chatBar.classList.add('hidden'); // Les lecteurs ne voient pas la barre
  } else {
    chatBar.classList.remove('hidden'); // Admin ou groupe de chat
  }

  switchView('community');
  loadCommunityFeed();
};

function loadCommunityFeed() {
  const list = $('posts-list');
  list.innerHTML = '<p class="muted">Chargement du chat...</p>';
  
  const q = query(collection(db, 'posts'), where('communityId', '==', currentCommunityId), orderBy('createdAt', 'desc'));
  
  unsubscribeCommunityFeed = onSnapshot(q, snap => {
    if (snap.empty) return list.innerHTML = '<p class="muted" style="text-align:center; margin-top:2rem;">Soyez le premier à écrire !</p>';
    list.innerHTML = snap.docs.map(d => generatePostHTML(d, true)).join('');
    
    // Auto-scroll vers le bas (nouveaux messages)
    window.scrollTo(0, document.body.scrollHeight);
  });
}

// Générateur de HTML pour les posts (évite de dupliquer le code)
function generatePostHTML(docSnap, showPinBtn) {
  const p = docSnap.data();
  const avatar = p.authorPhoto ? `<img src="${p.authorPhoto}" class="post-avatar">` : `<div class="post-avatar">${p.authorName[0].toUpperCase()}</div>`;
  
  let mediaHtml = '';
  if (p.mediaUrl) {
    if (p.mediaType === 'image') mediaHtml = `<img src="${p.mediaUrl}" class="post-media">`;
    else if (p.mediaType === 'video') mediaHtml = `<video src="${p.mediaUrl}" controls class="post-media"></video>`;
    else if (p.mediaType === 'audio') mediaHtml = `<audio src="${p.mediaUrl}" controls style="width:100%; margin-top:10px;"></audio>`;
  }
  
  const isLiked = p.likes?.includes(currentUser.uid);
  const likeIcon = isLiked ? "💙" : "🤍";
  
  let pinBtn = '';
  if (showPinBtn && p.authorId === currentUser.uid) {
    const isPinned = userProfile.pinned && userProfile.pinned.includes(docSnap.id);
    const pinIcon = isPinned ? "📌" : "📍";
    pinBtn = `<button onclick="window.togglePin('${docSnap.id}', ${isPinned})" class="btn-secondary small">${pinIcon}</button>`;
  }

  return `<div class="media-item">
    <div class="post-header">${avatar} <strong>@${p.authorName}</strong></div>
    <p>${p.content}</p>
    ${mediaHtml}
    <div class="post-actions">
      <button onclick="window.toggleLike('${docSnap.id}', ${isLiked})" class="btn-secondary small">${likeIcon} ${p.likes ? p.likes.length : 0}</button>
      ${pinBtn}
    </div>
  </div>`;
}

// ================= ENVOI DE MESSAGES (CHAT) =================
$('btn-attach-file').addEventListener('click', () => $('post-file').click());

$('btn-publish-post').addEventListener('click', async () => {
  const content = $('post-content').value.trim();
  const file = $('post-file').files[0];
  if (!content && !file) return;
  
  $('btn-publish-post').textContent = "...";
  try {
    let mediaUrl = null, mediaType = null;
    if (file) {
      mediaUrl = await uploadToCloudinary(file);
      if (file.type.startsWith('image')) mediaType = 'image';
      else if (file.type.startsWith('video')) mediaType = 'video';
      else mediaType = 'audio';
    }
    
    await addDoc(collection(db, 'posts'), {
      communityId: currentCommunityId, content, authorId: currentUser.uid, authorName: userProfile.username, authorPhoto: userProfile.photoURL || "",
      mediaUrl, mediaType, likes: [], createdAt: serverTimestamp()
    });
    
    $('post-content').value = ''; $('post-file').value = '';
  } catch(e) { alert("Erreur : " + e.message); }
  $('btn-publish-post').textContent = "➤";
});

// ================= ACTIONS (LIKE & PIN) =================
window.toggleLike = async (postId, isLiked) => {
  const ref = doc(db, 'posts', postId);
  if (isLiked) await updateDoc(ref, { likes: arrayRemove(currentUser.uid) });
  else await updateDoc(ref, { likes: arrayUnion(currentUser.uid) });
};

window.togglePin = async (postId, isPinned) => {
  const ref = doc(db, 'users', currentUser.uid);
  if (isPinned) {
    await updateDoc(ref, { pinned: arrayRemove(postId) });
    userProfile.pinned = userProfile.pinned.filter(id => id !== postId);
  } else {
    await updateDoc(ref, { pinned: arrayUnion(postId) });
    if(!userProfile.pinned) userProfile.pinned = [];
    userProfile.pinned.push(postId);
  }
};

// ================= PROFIL & RESTE =================
$('btn-logout').addEventListener('click', () => signOut(auth));
$('btn-edit-profile-view').addEventListener('click', () => $('modal-profile').classList.remove('hidden'));
$('btn-cancel-profile').addEventListener('click', () => $('modal-profile').classList.add('hidden'));

$('btn-save-profile').addEventListener('click', async () => {
  const file = $('edit-avatar').files[0];
  let photoURL = userProfile.photoURL;
  $('btn-save-profile').textContent = "Patientez...";
  try {
    if (file) photoURL = await uploadToCloudinary(file);
    const updates = { bio: $('edit-bio').value.trim(), photoURL };
    await updateDoc(doc(db, 'users', currentUser.uid), updates);
    userProfile = { ...userProfile, ...updates };
    $('modal-profile').classList.add('hidden');
    renderProfile();
  } catch (e) { alert("Erreur : " + e.message); }
  $('btn-save-profile').textContent = "Enregistrer";
});

async function renderProfile() {
  if (!userProfile) return;
  $('profile-name').textContent = userProfile.username;
  $('profile-bio').textContent = userProfile.bio || 'Aucune bio.';
  const av = $('profile-avatar');
  if (userProfile.photoURL) {
    av.style.backgroundImage = `url(${userProfile.photoURL})`; av.textContent = '';
  } else {
    av.style.backgroundImage = 'none'; av.textContent = userProfile.username[0].toUpperCase();
  }
  $('profile-decorations').innerHTML = (userProfile.decorations || []).map(d => `<span class="deco-item">${d}</span>`).join('');
  $('profile-badges').innerHTML = (userProfile.badges || []).map(b => `<span class="badge-item">🏅 ${b}</span>`).join('');
  
  const pinned = $('profile-pinned');
  pinned.innerHTML = '<p class="muted">Chargement...</p>';
  if (userProfile.pinned && userProfile.pinned.length > 0) {
    const docs = await Promise.all(userProfile.pinned.map(id => getDoc(doc(db, 'posts', id))));
    pinned.innerHTML = docs.map(d => d.exists() ? `<div class="media-item"><p style="font-size:0.9rem">${d.data().content}</p></div>` : '').join('');
  } else pinned.innerHTML = '<p class="muted">Aucun post épinglé.</p>';
}

async function renderUsersForMessages() {
  const list = $('users-list');
  const snap = await getDocs(collection(db, 'users'));
  list.innerHTML = snap.docs.filter(d => d.id !== currentUser.uid).map(d => {
    const u = d.data();
    return `<div class="card"><h4>👤 ${u.username}</h4><button class="btn-secondary small" style="margin-top:10px" onclick="alert('Bientôt disponible !')">Discuter</button></div>`;
  }).join('');
}

$('search-input').addEventListener('input', async () => {
  const term = $('search-input').value.toLowerCase();
  const res = $('search-results');
  if(!term) return res.innerHTML = '';
  const snapU = await getDocs(collection(db, 'users'));
  res.innerHTML = snapU.docs.filter(d => d.data().username.toLowerCase().includes(term)).map(d => `<div class="card"><h4>👤 ${d.data().username}</h4></div>`).join('');
});
