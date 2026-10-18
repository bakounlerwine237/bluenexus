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
let currentCommunityMembers = []; 
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

  if (viewId === 'community') {
    $('main-nav').style.display = 'none';
    $('main-header').style.display = 'none';
  } else {
    $('main-nav').style.display = 'flex';
    $('main-header').style.display = 'flex';
  }

  if (viewId === 'home') renderGlobalFeed();
  if (viewId === 'communities') renderCommunitiesList();
  if (viewId === 'profile') renderProfile();
  
  if (viewId !== 'home' && unsubscribeGlobalFeed) { unsubscribeGlobalFeed(); unsubscribeGlobalFeed = null; }
  if (viewId !== 'community' && unsubscribeCommunityFeed) { unsubscribeCommunityFeed(); unsubscribeCommunityFeed = null; }
}

document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
$('btn-settings-top').addEventListener('click', () => switchView('settings'));
$('btn-go-communities').addEventListener('click', () => switchView('communities'));
$('btn-back-home-comm').addEventListener('click', () => switchView('home'));
$('btn-back-from-comm').addEventListener('click', () => switchView('communities'));

// ================= CLOUDINARY =================
async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: 'POST', body: formData });
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
  try { await sendPasswordResetEmail(auth, email); alert("Email envoyé ! Vérifiez vos spams."); } 
  catch (e) { $('auth-error').textContent = e.message; }
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const snap = await getDoc(doc(db, 'users', user.uid));
    userProfile = snap.exists() ? snap.data() : { username: "Utilisateur", decorations: [], badges: [], pinned: [], photoURL: "", communities: [] };
    
    // Vérification Admin pour le fil global
    if (userProfile.role === 'admin') {
      $('global-post-container').style.display = 'block';
    } else {
      $('global-post-container').style.display = 'none';
    }

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

// ================= FLUX D'ACTUALITÉ (GLOBAL + ANNONCES) =================
async function renderGlobalFeed() {
  const list = $('global-feed-list');
  list.innerHTML = '<p class="muted">Chargement...</p>';
  
  try {
    // On ne cherche QUE les posts globaux ou d'annonces
    const q = query(
      collection(db, 'posts'), 
      where('communityType', 'in', ['global', 'announcement']), 
      orderBy('createdAt', 'desc'), 
      limit(50)
    );
    
    unsubscribeGlobalFeed = onSnapshot(q, snap => {
      if (snap.empty) return list.innerHTML = '<p class="muted">Aucune annonce publique pour l\'instant.</p>';
      list.innerHTML = snap.docs.map(d => generatePostHTML(d, false)).join('');
    });
  } catch (error) {
    console.error(error);
    list.innerHTML = '<p class="muted">Erreur : Vérifiez l\'index Firebase (communityType + createdAt).</p>';
  }
}

// Publication Admin (Global)
$('btn-global-publish').addEventListener('click', async () => {
  const content = $('global-post-content').value.trim();
  if (!content) return;
  $('btn-global-publish').textContent = "...";
  try {
    await addDoc(collection(db, 'posts'), {
      communityId: 'global', communityType: 'global', // <-- TYPE GLOBAL
      content, authorId: currentUser.uid, authorName: userProfile.username, authorPhoto: userProfile.photoURL || "",
      mediaUrl: null, mediaType: null, likes: [], createdAt: serverTimestamp()
    });
    $('global-post-content').value = '';
  } catch(e) { alert("Erreur : " + e.message); }
  $('btn-global-publish').textContent = "Publier l'annonce";
});

// ================= COMMUNAUTÉS =================
$('btn-new-community').addEventListener('click', () => $('modal-community').classList.remove('hidden'));
$('comm-cancel').addEventListener('click', () => $('modal-community').classList.add('hidden'));

$('comm-save').addEventListener('click', async () => {
  const name = $('comm-name').value.trim(), type = $('comm-type').value;
  if (!name) return;
  $('comm-save').textContent = "Création...";
  try {
    const newCommRef = await addDoc(collection(db, 'communities'), {
      name, description: $('comm-desc').value.trim(), type, ownerId: currentUser.uid, members: [currentUser.uid], createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'users', currentUser.uid), { 
      communities: arrayUnion(newCommRef.id), badges: arrayUnion("Fondateur")
    });
    $('modal-community').classList.add('hidden');
    renderCommunitiesList();
  } catch(e) { alert(e.message); }
  $('comm-save').textContent = "Créer";
});

async function renderCommunitiesList() {
  const list = $('communities-list');
  list.innerHTML = '<p class="muted">Chargement...</p>';
  const snap = await getDocs(collection(db, 'communities'));
  if (snap.empty) return list.innerHTML = '<p class="muted">Aucune communauté.</p>';
  const comms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  comms.sort((a, b) => (b.members?.length || 0) - (a.members?.length || 0));

  list.innerHTML = comms.map(c => {
    return `<div class="card" onclick="window.openCommunity('${c.id}')">
      <h4>${c.type === 'announcement' ? '📢' : '💬'} ${c.name}</h4>
      <p class="muted">${c.description || ''}</p>
      <span class="chip">${c.members?.length || 1} membres</span>
    </div>`;
  }).join('');
}

// ================= CHAT COMMUNAUTÉ =================
window.openCommunity = async (id) => {
  currentCommunityId = id;
  $('posts-list').innerHTML = '<p class="muted">Chargement...</p>';
  const docRef = doc(db, 'communities', id);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    currentCommunityType = data.type;
    currentCommunityOwner = data.ownerId;
    currentCommunityMembers = data.members || [];
    
    $('comm-title-display').textContent = data.name;
    $('members-count').textContent = `${currentCommunityMembers.length} membres`;
    
    updateJoinUI();
    switchView('community');
    loadCommunityFeed();
  }
};

function updateJoinUI() {
  const isMember = currentCommunityMembers.includes(currentUser.uid);
  const chatBar = $('post-form-container');
  const joinBtn = $('btn-join-community');

  if (isMember) {
    joinBtn.textContent = "Quitter";
    joinBtn.className = "btn-secondary small";
    joinBtn.style.color = "#ff6b6b";
    joinBtn.style.borderColor = "#ff6b6b";
    
    if (currentCommunityType === 'announcement' && currentUser.uid !== currentCommunityOwner) {
      chatBar.style.display = 'none'; 
    } else {
      chatBar.style.display = 'flex';
    }
  } else {
    joinBtn.textContent = "Rejoindre";
    joinBtn.className = "btn-primary small";
    joinBtn.style.color = "white";
    joinBtn.style.borderColor = "transparent";
    chatBar.style.display = 'none';
  }
}

$('btn-join-community').addEventListener('click', async () => {
  const isMember = currentCommunityMembers.includes(currentUser.uid);
  const ref = doc(db, 'communities', currentCommunityId);
  const userRef = doc(db, 'users', currentUser.uid);
  
  if (isMember) {
    await updateDoc(ref, { members: arrayRemove(currentUser.uid) });
    await updateDoc(userRef, { communities: arrayRemove(currentCommunityId) });
    currentCommunityMembers = currentCommunityMembers.filter(uid => uid !== currentUser.uid);
  } else {
    await updateDoc(ref, { members: arrayUnion(currentUser.uid) });
    await updateDoc(userRef, { communities: arrayUnion(currentCommunityId) });
    currentCommunityMembers.push(currentUser.uid);
  }
  
  $('members-count').textContent = `${currentCommunityMembers.length} membres`;
  updateJoinUI();
});

function loadCommunityFeed() {
  const list = $('posts-list');
  list.innerHTML = '<p class="muted">Chargement...</p>';
  const q = query(collection(db, 'posts'), where('communityId', '==', currentCommunityId), orderBy('createdAt', 'desc'));
  
  unsubscribeCommunityFeed = onSnapshot(q, snap => {
    if (snap.empty) return list.innerHTML = '<p class="muted" style="text-align:center; margin-top:2rem;">Aucun message.</p>';
    list.innerHTML = snap.docs.map(d => generatePostHTML(d, true)).join('');
    window.scrollTo(0, document.body.scrollHeight);
  });
}

// Envoi message communauté
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
      communityId: currentCommunityId, 
      communityType: currentCommunityType, // <-- TYPE DE LA COMMUNAUTÉ (chat ou announcement)
      content, authorId: currentUser.uid, authorName: userProfile.username, authorPhoto: userProfile.photoURL || "",
      mediaUrl, mediaType, likes: [], createdAt: serverTimestamp()
    });
    
    $('post-content').value = ''; $('post-file').value = '';
  } catch(e) { alert("Erreur : " + e.message); }
  $('btn-publish-post').textContent = "➤";
});

// ================= GÉNÉRATION HTML (POSTS + COMMENTAIRES) =================
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
  
  return `<div class="media-item">
    <div class="post-header">${avatar} <strong>@${p.authorName}</strong></div>
    <p>${p.content}</p>
    ${mediaHtml}
    
    <div class="post-actions">
      <button onclick="window.toggleLike('${docSnap.id}', ${isLiked})" class="btn-secondary small">${likeIcon} ${p.likes ? p.likes.length : 0}</button>
      <button onclick="window.toggleComments('${docSnap.id}')" class="btn-secondary small">💬 Commenter</button>
    </div>

    <!-- ZONE DES COMMENTAIRES (Cachée par défaut) -->
    <div id="comments-section-${docSnap.id}" class="comments-section" style="display: none;">
      <div id="comments-list-${docSnap.id}">
        <p class="muted" style="font-size: 0.8rem;">Chargement des commentaires...</p>
      </div>
      <div class="comment-input-row">
        <input type="text" id="comment-input-${docSnap.id}" placeholder="Votre commentaire...">
        <button onclick="window.addComment('${docSnap.id}')" class="btn-primary small">Envoyer</button>
      </div>
    </div>
  </div>`;
}

// ================= SYSTÈME DE COMMENTAIRES =================
window.toggleComments = (postId) => {
  const section = $(`comments-section-${postId}`);
  if (section.style.display === 'none') {
    section.style.display = 'block';
    loadComments(postId);
  } else {
    section.style.display = 'none';
  }
};

async function loadComments(postId) {
  const list = $(`comments-list-${postId}`);
  list.innerHTML = '<p class="muted" style="font-size: 0.8rem;">Chargement...</p>';
  
  const q = query(collection(db, 'comments'), where('postId', '==', postId));
  const snap = await getDocs(q);
  
  if (snap.empty) {
    list.innerHTML = '<p class="muted" style="font-size: 0.8rem;">Soyez le premier à commenter !</p>';
    return;
  }
  
  const comments = snap.docs.map(d => d.data());
  comments.sort((a, b) => a.createdAt - b.createdAt);

  list.innerHTML = comments.map(c => `
    <div class="comment-item">
      <strong>@${c.authorName}</strong> : ${c.content}
    </div>
  `).join('');
}

window.addComment = async (postId) => {
  const input = $(`comment-input-${postId}`);
  const content = input.value.trim();
  if (!content) return;

  input.value = ''; // Vider le champ
  try {
    await addDoc(collection(db, 'comments'), {
      postId: postId,
      content: content,
      authorId: currentUser.uid,
      authorName: userProfile.username,
      createdAt: Date.now() 
    });
    loadComments(postId); 
  } catch(e) {
    alert("Erreur d'envoi du commentaire : " + e.message);
  }
};

window.toggleLike = async (postId, isLiked) => {
  const ref = doc(db, 'posts', postId);
  if (isLiked) await updateDoc(ref, { likes: arrayRemove(currentUser.uid) });
  else await updateDoc(ref, { likes: arrayUnion(currentUser.uid) });
};

// ================= PROFIL =================
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
  $('profile-pinned').innerHTML = '<p class="muted">Aucun post épinglé.</p>';
}
