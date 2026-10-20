import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, getDocs, orderBy, limit, startAfter, serverTimestamp, updateDoc, arrayUnion, arrayRemove, onSnapshot, deleteDoc } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const CLOUDINARY_CLOUD_NAME = "uot2qg2"; // Attention, j'ai corrigé une faute de frappe (uot2qg2)
const CLOUDINARY_UPLOAD_PRESET = "bluenexus"; 

let currentUser = null;
let userProfile = null;
let currentCommunityId = null; 
let currentCommunityMembers = []; 
let unsubscribeGlobal = null;
let unsubscribeComm = null; 
let unsubscribeChat = null;
let currentChatId = null;
let lastVisiblePost = null; // Pour le chargement infini
const $ = (id) => document.getElementById(id);

// ================= UI / LOGIN / SIGNUP =================
$('link-to-signup').addEventListener('click', (e) => { e.preventDefault(); $('login-form').style.display = 'none'; $('signup-form').style.display = 'block'; });
$('link-to-login').addEventListener('click', (e) => { e.preventDefault(); $('signup-form').style.display = 'none'; $('login-form').style.display = 'block'; });
$('btn-settings-signup').addEventListener('click', async () => { await signOut(auth); $('login-form').style.display = 'none'; $('signup-form').style.display = 'block'; });

// ================= NAVIGATION =================
function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = $(`view-${viewId}`);
  if(target) target.classList.add('active');
  
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
  if(navBtn) navBtn.classList.add('active');

  if (viewId === 'community' || viewId === 'chat') {
    $('main-nav').style.display = 'none'; $('main-header').style.display = 'none';
  } else {
    $('main-nav').style.display = 'flex'; $('main-header').style.display = 'flex';
    const titles = { home: "Accueil", communities: "Communautés", search: "Recherche", profile: "Mon Profil", settings: "Paramètres", music: "Musique", video: "Vidéo", messages: "Messages" };
    $('page-title').textContent = titles[viewId] || "BlueNexus";
  }

  if (viewId === 'home') loadGlobalFeed(true);
  if (viewId === 'communities') renderCommunitiesList();
  if (viewId === 'profile') renderProfile();
  if (viewId === 'music') loadMedia('audio');
  if (viewId === 'video') loadMedia('video');
  if (viewId === 'messages') renderUsersList();
  
  if (viewId !== 'home' && unsubscribeGlobal) { unsubscribeGlobal(); unsubscribeGlobal = null; }
  if (viewId !== 'community' && unsubscribeComm) { unsubscribeComm(); unsubscribeComm = null; }
  if (viewId !== 'chat' && unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; }
}

document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
$('btn-settings-top').addEventListener('click', () => switchView('settings'));
$('btn-go-communities').addEventListener('click', () => switchView('communities'));
$('btn-back-home-comm').addEventListener('click', () => switchView('home'));
$('btn-back-from-comm').addEventListener('click', () => switchView('communities'));
$('btn-back-from-chat').addEventListener('click', () => switchView('messages'));

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
  $('auth-error').textContent = "Création...";
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, 'users', cred.user.uid), {
      username: name, email: email, bio: "Nouveau sur BlueNexus 🚀", photoURL: "", pinned: [], following: [], followers: []
    });
  } catch (e) { $('auth-error').textContent = e.message; }
});

$('btn-login').addEventListener('click', async () => {
  const email = $('auth-email').value.trim(), pass = $('auth-pass').value.trim();
  if (!email || !pass) return $('auth-error').textContent = "Entrez email et mot de passe.";
  $('auth-error').textContent = "Connexion...";
  try { await signInWithEmailAndPassword(auth, email, pass); } 
  catch (e) { $('auth-error').textContent = "Email ou mot de passe incorrect."; }
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
    if (snap.exists()) userProfile = snap.data();
    else {
      userProfile = { username: user.email.split('@')[0], bio: "Nouveau sur BlueNexus", photoURL: "", pinned: [] };
      await setDoc(doc(db, 'users', user.uid), userProfile);
    }
    $('auth-screen').classList.remove('active');
    $('app-screen').classList.add('active');
    $('auth-error').textContent = "";
    switchView('home');
  } else {
    currentUser = null; userProfile = null;
    $('app-screen').classList.remove('active');
    $('auth-screen').classList.add('active');
    $('login-form').style.display = 'block';
    $('signup-form').style.display = 'none';
  }
});

// ================= FEED & CHARGEMENT INFINI =================
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
  loadGlobalFeed(true);
});

async function loadGlobalFeed(reset = false) {
  const list = $('global-feed-list');
  const btnMore = $('btn-load-more');
  
  if (reset) {
    list.innerHTML = '<p class="muted">Chargement...</p>';
    lastVisiblePost = null;
  }
  
  let q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(10));
  if (lastVisiblePost && !reset) {
    q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), startAfter(lastVisiblePost), limit(10));
  }

  const snap = await getDocs(q);
  if (snap.empty && reset) {
    list.innerHTML = '<p class="muted">Aucun message.</p>';
    btnMore.style.display = 'none';
    return;
  }
  
  if (reset) list.innerHTML = '';
  lastVisiblePost = snap.docs[snap.docs.length - 1];
  
  snap.docs.forEach(d => {
    list.innerHTML += generatePostHTML(d);
  });
  
  btnMore.style.display = snap.docs.length < 10 ? 'none' : 'block';
}

$('btn-load-more').addEventListener('click', () => loadGlobalFeed(false));

// ================= MUSIQUE & VIDÉO =================
async function loadMedia(type) {
  const list = $(`${type}-list`);
  list.innerHTML = '<p class="muted">Chargement...</p>';
  const q = query(collection(db, 'posts'), where('mediaType', '==', type), orderBy('createdAt', 'desc'), limit(30));
  const snap = await getDocs(q);
  
  if (snap.empty) return list.innerHTML = `<p class="muted">Aucun fichier ${type} disponible.</p>`;
  
  list.innerHTML = snap.docs.map(d => {
    const p = d.data();
    let mediaHtml = '';
    if (type === 'audio') mediaHtml = `<audio src="${p.mediaUrl}" controls style="width:100%; margin-top:10px;"></audio>`;
    if (type === 'video') mediaHtml = `<video src="${p.mediaUrl}" controls class="post-media"></video>`;
    
    return `<div class="media-item">
      <div class="post-header">👤 @${p.authorName}</div>
      <p>${p.content}</p>
      ${mediaHtml}
    </div>`;
  }).join('');
}

// ================= POSTS & COMMENTAIRES =================
function generatePostHTML(docSnap) {
  const p = docSnap.data();
  const avatar = p.authorPhoto ? `<img src="${p.authorPhoto}" class="post-avatar">` : `<div class="post-avatar">${p.authorName[0].toUpperCase()}</div>`;
  const isLiked = p.likes?.includes(currentUser.uid);
  
  let mediaHtml = '';
  if (p.mediaUrl) {
    if (p.mediaType === 'image') mediaHtml = `<img src="${p.mediaUrl}" class="post-media">`;
    else if (p.mediaType === 'video') mediaHtml = `<video src="${p.mediaUrl}" controls class="post-media"></video>`;
    else if (p.mediaType === 'audio') mediaHtml = `<audio src="${p.mediaUrl}" controls style="width:100%; margin-top:10px;"></audio>`;
  }

  const isPinned = userProfile.pinned && userProfile.pinned.includes(docSnap.id);
  const pinBtn = (p.authorId === currentUser.uid) 
    ? `<button onclick="window.togglePin('${docSnap.id}', ${isPinned})" class="btn-secondary small">${isPinned ? '📌 Épinglé' : '📍 Épingler'}</button>` 
    : '';
  const deleteBtn = (p.authorId === currentUser.uid) 
    ? `<button onclick="window.deletePost('${docSnap.id}')" class="btn-secondary small" style="color:#ff6b6b; border-color:#ff6b6b;">🗑️</button>` 
    : '';

  return `<div class="media-item" id="post-${docSnap.id}">
    <div class="post-header">${avatar} @${p.authorName}</div>
    <p>${p.content}</p>
    ${mediaHtml}
    <div style="margin-top:0.5rem; display:flex; flex-wrap:wrap; gap:10px;">
      <button onclick="window.likePost('${docSnap.id}', ${isLiked})" class="btn-secondary small">${isLiked?'💙':'🤍'} ${p.likes?.length || 0}</button>
      <button onclick="window.toggleComments('${docSnap.id}')" class="btn-secondary small">💬 Commenter</button>
      ${pinBtn}
      ${deleteBtn}
    </div>

    <!-- ZONE COMMENTAIRES CACHEE -->
    <div id="comments-section-${docSnap.id}" class="comments-section" style="display: none;">
      <div id="comments-list-${docSnap.id}"><p class="muted" style="font-size: 0.8rem;">Chargement...</p></div>
      <div class="comment-input-row">
        <input type="text" id="comment-input-${docSnap.id}" placeholder="Votre commentaire...">
        <button onclick="window.addComment('${docSnap.id}')" class="btn-primary small">Envoyer</button>
      </div>
    </div>
  </div>`;
}

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
  list.innerHTML = comments.map(c => `<div class="comment-item"><strong>@${c.authorName}</strong> : ${c.content}</div>`).join('');
}

window.addComment = async (postId) => {
  const input = $(`comment-input-${postId}`);
  const content = input.value.trim();
  if (!content) return;
  input.value = ''; 
  try {
    await addDoc(collection(db, 'comments'), {
      postId: postId, content: content, authorId: currentUser.uid, authorName: userProfile.username, createdAt: Date.now() 
    });
    loadComments(postId); 
  } catch(e) { alert("Erreur : " + e.message); }
};

window.likePost = async (postId, isLiked) => {
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
  if($('view-profile').classList.contains('active')) renderProfile();
};

window.deletePost = async (postId) => {
  if(confirm("Supprimer ce message ?")) {
    await deleteDoc(doc(db, 'posts', postId));
    const el = document.getElementById(`post-${postId}`);
    if(el) el.remove();
  }
};

// ================= MESSAGERIE PRIVÉE =================
async function renderUsersList() {
  const list = $('users-list');
  list.innerHTML = '<p class="muted">Chargement...</p>';
  const snap = await getDocs(collection(db, 'users'));
  
  const otherUsers = snap.docs.filter(d => d.id !== currentUser.uid).map(d => ({ id: d.id, ...d.data() }));
  if(otherUsers.length === 0) return list.innerHTML = '<p class="muted">Aucun autre membre.</p>';

  list.innerHTML = otherUsers.map(u => {
    const avatar = u.photoURL ? `<img src="${u.photoURL}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;margin-right:10px;">` : `<div style="width:40px;height:40px;border-radius:50%;background:var(--blue);display:inline-flex;align-items:center;justify-content:center;margin-right:10px;font-weight:bold;">${u.username[0].toUpperCase()}</div>`;
    return `<div class="card" style="flex-direction:row; align-items:center; padding:10px;" onclick="window.startChat('${u.id}', '${u.username}')">
      ${avatar}
      <div><h4 style="margin:0">${u.username}</h4></div>
    </div>`;
  }).join('');
}

window.startChat = async (targetId, targetName) => {
  const chatId = [currentUser.uid, targetId].sort().join('_');
  currentChatId = chatId;
  
  $('chat-with-name').textContent = targetName;
  switchView('chat');
  
  const list = $('chat-messages');
  list.innerHTML = '<p class="muted">Chargement...</p>';
  const q = query(collection(db, 'messages'), where('chatId', '==', chatId), orderBy('createdAt', 'asc'));
  
  if (unsubscribeChat) unsubscribeChat();
  unsubscribeChat = onSnapshot(q, snap => {
    if (snap.empty) return list.innerHTML = '<p class="muted" style="text-align:center; margin-top:2rem;">Dites bonjour ! 👋</p>';
    list.innerHTML = snap.docs.map(d => {
      const m = d.data();
      const isMine = m.senderId === currentUser.uid;
      return `<div class="chat-msg ${isMine ? 'mine' : 'theirs'}">${m.text}</div>`;
    }).join('');
    window.scrollTo(0, document.body.scrollHeight);
  });
};

$('btn-send-chat').addEventListener('click', async () => {
  const text = $('chat-input').value.trim();
  if(!text || !currentChatId) return;
  $('chat-input').value = '';
  try {
    await addDoc(collection(db, 'messages'), { 
      chatId: currentChatId, text: text, senderId: currentUser.uid, createdAt: serverTimestamp() 
    });
  } catch(e) { alert("Erreur : " + e.message); }
});

// ================= COMMUNAUTÉS =================
$('btn-new-community').addEventListener('click', () => $('modal-community').classList.remove('hidden'));
$('comm-cancel').addEventListener('click', () => $('modal-community').classList.add('hidden'));
$('comm-save').addEventListener('click', async () => {
  const name = $('comm-name').value.trim();
  if (!name) return;
  await addDoc(collection(db, 'communities'), {
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

// ================= PROFIL & FOLLOW =================
function renderProfile() {
  if(!userProfile) return;
  $('profile-name').textContent = userProfile.username;
  $('profile-bio').textContent = userProfile.bio || 'Aucune bio.';
  
  const av = $('profile-avatar');
  if (userProfile.photoURL) {
    av.style.backgroundImage = `url(${userProfile.photoURL})`; av.textContent = '';
  } else {
    av.style.backgroundImage = 'none'; av.textContent = userProfile.username[0].toUpperCase();
  }

  const pinnedContainer = $('profile-pinned');
  pinnedContainer.innerHTML = '';
  
  if (userProfile.pinned && userProfile.pinned.length > 0) {
    pinnedContainer.innerHTML = '<p class="muted">Chargement...</p>';
    Promise.all(userProfile.pinned.map(id => getDoc(doc(db, 'posts', id)))).then(docs => {
      pinnedContainer.innerHTML = '';
      docs.forEach(d => {
        if (d.exists()) {
          const p = d.data();
          pinnedContainer.innerHTML += `<div class="media-item" style="border-color: var(--blue-light);"><p style="font-size:0.9rem;">${p.content}</p></div>`;
        }
      });
    });
  } else {
    pinnedContainer.innerHTML = '<p class="muted">Aucune publication épinglée pour le moment.</p>';
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

// ================= RECHERCHE =================
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

window.followUser = async (targetId) => {
  if(targetId === currentUser.uid) return alert("C'est votre propre profil.");
  await updateDoc(doc(db, 'users', currentUser.uid), { following: arrayUnion(targetId) });
  await updateDoc(doc(db, 'users', targetId), { followers: arrayUnion(currentUser.uid) });
  alert("Vous êtes maintenant abonné à cet utilisateur !");
};
