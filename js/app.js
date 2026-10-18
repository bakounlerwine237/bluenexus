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
let unsubscribePosts = null; 
const $ = (id) => document.getElementById(id);

// ================= NAVIGATION =================
function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = $(`view-${viewId}`);
  if(target) target.classList.add('active');
  
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
  if(navBtn) navBtn.classList.add('active');

  const titles = { home: "Accueil", messages: "Messages", music: "Musique", video: "Vidéo", search: "Recherche", profile: "Mon Profil", settings: "Paramètres" };
  $('page-title').textContent = titles[viewId] || "BlueNexus";

  if (viewId === 'home') renderHome();
  if (viewId === 'messages') renderUsersForMessages();
  if (viewId === 'music') renderMusic();
  if (viewId === 'video') renderVideo();
  if (viewId === 'profile') renderProfile();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});
$('btn-settings-top').addEventListener('click', () => switchView('settings'));

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
    if(unsubscribePosts) unsubscribePosts();
    $('app-screen').classList.remove('active');
    $('auth-screen').classList.add('active');
  }
});

// ================= PARAMÈTRES ET PROFIL =================
$('btn-logout').addEventListener('click', () => signOut(auth));
$('btn-edit-profile-view').addEventListener('click', () => {
  $('edit-bio').value = userProfile.bio || '';
  $('edit-deco').value = userProfile.decorations[0] || '';
  $('modal-profile').classList.remove('hidden');
});
$('btn-cancel-profile').addEventListener('click', () => $('modal-profile').classList.add('hidden'));

$('btn-save-profile').addEventListener('click', async () => {
  const file = $('edit-avatar').files[0];
  let photoURL = userProfile.photoURL;
  $('btn-save-profile').textContent = "Enregistrement...";
  try {
    if (file) photoURL = await uploadToCloudinary(file);
    const updates = { bio: $('edit-bio').value.trim(), decorations: $('edit-deco').value ? [$('edit-deco').value] : [], photoURL };
    await updateDoc(doc(db, 'users', currentUser.uid), updates);
    userProfile = { ...userProfile, ...updates };
    $('modal-profile').classList.add('hidden');
    renderProfile();
  } catch (e) { alert("Erreur photo: " + e.message); }
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

// ================= COMMUNAUTÉS (AVEC PHOTO) =================
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
    renderHome();
  } catch(e) { alert(e.message); }
  $('comm-save').textContent = "Créer";
});

async function renderHome() {
  const list = $('communities-list');
  const snap = await getDocs(query(collection(db, 'communities'), orderBy('createdAt', 'desc')));
  if (snap.empty) return list.innerHTML = '<p class="muted">Aucune communauté.</p>';
  list.innerHTML = snap.docs.map(d => {
    const c = d.data();
    const imgHtml = c.imageURL ? `<img src="${c.imageURL}" style="width:100%; height:80px; object-fit:cover; border-radius:8px; margin-bottom:8px;">` : '';
    return `<div class="card" onclick="window.openCommunity('${d.id}', '${c.name}', '${c.description || ''}', '${c.type}', '${c.ownerId}', '${c.imageURL || ''}')">
      ${imgHtml}
      <h4>${c.type === 'announcement' ? '📢' : '💬'} ${c.name}</h4>
      <p class="muted">${c.description || ''}</p>
    </div>`;
  }).join('');
}

window.openCommunity = (id, name, desc, type, ownerId, imageURL) => {
  currentCommunityId = id; currentCommunityType = type; currentCommunityOwner = ownerId;
  $('comm-title-display').textContent = name;
  $('comm-desc-display').textContent = desc;
  
  const imgDisplay = $('comm-image-display');
  if(imageURL) { imgDisplay.src = imageURL; imgDisplay.style.display = 'block'; }
  else { imgDisplay.style.display = 'none'; }

  switchView('community');
  
  const form = $('post-form-container');
  form.style.display = (type === 'announcement' && currentUser.uid !== ownerId) ? 'none' : 'block';
  loadPosts();
};

$('btn-back-home').addEventListener('click', () => switchView('home'));

// ================= POSTS, UPLOAD, LIKE ET PIN =================
$('btn-attach-file').addEventListener('click', () => $('post-file').click());
$('post-file').addEventListener('change', () => {
  const f = $('post-file').files[0];
  if(f) $('file-name').textContent = f.name;
});

$('btn-publish-post').addEventListener('click', async () => {
  const content = $('post-content').value.trim();
  const file = $('post-file').files[0];
  if (!content && !file) return;
  
  $('btn-publish-post').textContent = "Envoi...";
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
    
    $('post-content').value = ''; $('post-file').value = ''; $('file-name').textContent = '';
  } catch(e) { alert("Erreur d'envoi : " + e.message); }
  $('btn-publish-post').textContent = "Publier";
});

function loadPosts() {
  const list = $('posts-list');
  list.innerHTML = '<p class="muted">Chargement...</p>';
  const q = query(collection(db, 'posts'), where('communityId', '==', currentCommunityId), orderBy('createdAt', 'desc'));
  
  unsubscribePosts = onSnapshot(q, snap => {
    if (snap.empty) return list.innerHTML = '<p class="muted">Aucun message.</p>';
    list.innerHTML = snap.docs.map(d => {
      const p = d.data();
      const avatar = p.authorPhoto ? `<img src="${p.authorPhoto}" class="post-avatar">` : `<div class="post-avatar">${p.authorName[0].toUpperCase()}</div>`;
      
      let mediaHtml = '';
      if (p.mediaUrl) {
        if (p.mediaType === 'image') mediaHtml = `<img src="${p.mediaUrl}" class="post-media">`;
        else if (p.mediaType === 'video') mediaHtml = `<video src="${p.mediaUrl}" controls class="post-media"></video>`;
        else if (p.mediaType === 'audio') mediaHtml = `<audio src="${p.mediaUrl}" controls style="width:100%; margin-top:10px;"></audio>`;
      }
      
      // LOGIQUE DU LIKE
      const isLiked = p.likes.includes(currentUser.uid);
      const likeIcon = isLiked ? "💙" : "🤍";
      
      // LOGIQUE DU PIN (Si c'est notre post)
      const isPinned = userProfile.pinned && userProfile.pinned.includes(d.id);
      const pinIcon = isPinned ? "📌 Épinglé" : "📍 Épingler";
      const pinBtn = (p.authorId === currentUser.uid) 
        ? `<button onclick="window.togglePin('${d.id}', ${isPinned})" class="btn-secondary small">${pinIcon}</button>` 
        : '';

      return `<div class="media-item">
        <div class="post-header">${avatar} <strong>@${p.authorName}</strong></div>
        <p>${p.content}</p>
        ${mediaHtml}
        <div class="post-actions">
          <button onclick="window.toggleLike('${d.id}', ${isLiked})" class="btn-secondary small">${likeIcon} ${p.likes.length}</button>
          ${pinBtn}
        </div>
      </div>`;
    }).join('');
  });
}

// FONCTIONS GLOBALES POUR LES BOUTONS DANS LE HTML
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
  renderProfile();
};

// ================= MESSAGERIE & AUTRES =================
async function renderUsersForMessages() {
  const list = $('users-list');
  const snap = await getDocs(collection(db, 'users'));
  list.innerHTML = snap.docs.filter(d => d.id !== currentUser.uid).map(d => {
    const u = d.data();
    return `<div class="card"><h4>👤 ${u.username}</h4><button class="btn-secondary small" style="margin-top:10px" onclick="alert('La messagerie sera ajoutée à la prochaine mise à jour !')">Discuter</button></div>`;
  }).join('');
}

async function renderMusic() {
  const list = $('music-list');
  const snap = await getDocs(query(collection(db, 'posts'), where('mediaType', '==', 'audio'), limit(20)));
  if(snap.empty) return list.innerHTML = '<p class="muted">Aucun audio.</p>';
  list.innerHTML = snap.docs.map(d => `<div class="media-item"><strong>@${d.data().authorName}</strong><p>${d.data().content}</p><audio src="${d.data().mediaUrl}" controls style="width:100%; margin-top:10px;"></audio></div>`).join('');
}

async function renderVideo() {
  const list = $('video-list');
  const snap = await getDocs(query(collection(db, 'posts'), where('mediaType', '==', 'video'), limit(20)));
  if(snap.empty) return list.innerHTML = '<p class="muted">Aucune vidéo.</p>';
  list.innerHTML = snap.docs.map(d => `<div class="media-item"><strong>@${d.data().authorName}</strong><p>${d.data().content}</p><video src="${d.data().mediaUrl}" controls class="post-media"></video></div>`).join('');
}

$('search-input').addEventListener('input', async () => {
  const term = $('search-input').value.toLowerCase();
  const res = $('search-results');
  if(!term) return res.innerHTML = '';
  const snapU = await getDocs(collection(db, 'users'));
  res.innerHTML = snapU.docs.filter(d => d.data().username.toLowerCase().includes(term)).map(d => `<div class="card"><h4>👤 ${d.data().username}</h4></div>`).join('');
});
