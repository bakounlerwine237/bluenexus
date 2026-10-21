import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, getDocs, orderBy, limit, startAfter, serverTimestamp, updateDoc, arrayUnion, arrayRemove, onSnapshot, deleteDoc } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const CLOUDINARY_CLOUD_NAME = "uotg2qg2"; 
const CLOUDINARY_UPLOAD_PRESET = "bluenexus"; 
const TENCENT_SDK_APP_ID = 20049692; 

let currentUser = null;
let userProfile = null;
let currentCommunityId = null; 
let currentCommunityMembers = []; 
let currentCommunityOwner = null; 
let unsubscribeGlobal = null;
let unsubscribeComm = null; 
let unsubscribeChat = null;
let unsubscribeNotifs = null;
let currentChatId = null;
let lastVisiblePost = null; 
let currentFeedMode = 'discovery';
let tencentChat = null;
const $ = (id) => document.getElementById(id);

// ================= MODE CLAIR / SOMBRE =================
const themeToggleBtn = $('btn-theme-toggle-settings');
function updateThemeBtnText() {
  if(!themeToggleBtn) return;
  if(document.body.classList.contains('light-mode')) themeToggleBtn.textContent = 'Passer en mode sombre 🌙';
  else themeToggleBtn.textContent = 'Passer en mode clair ☀️';
}
if(localStorage.getItem('theme') === 'light') document.body.classList.add('light-mode');
updateThemeBtnText();
if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    if(document.body.classList.contains('light-mode')) localStorage.setItem('theme', 'light');
    else localStorage.setItem('theme', 'dark');
    updateThemeBtnText();
  });
}

// ================= UI / LOGIN / SIGNUP =================
if($('link-to-signup')) $('link-to-signup').addEventListener('click', (e) => { e.preventDefault(); $('login-form').style.display = 'none'; $('signup-form').style.display = 'block'; });
if($('link-to-login')) $('link-to-login').addEventListener('click', (e) => { e.preventDefault(); $('signup-form').style.display = 'none'; $('login-form').style.display = 'block'; });
if($('btn-settings-signup')) $('btn-settings-signup').addEventListener('click', async () => { await signOut(auth); $('login-form').style.display = 'none'; $('signup-form').style.display = 'block'; });

// ================= NAVIGATION =================
function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = $(`view-${viewId}`);
  if(target) target.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
  if(navBtn) navBtn.classList.add('active');

  if (viewId === 'community' || viewId === 'chat') {
    if($('main-nav')) $('main-nav').style.display = 'none'; 
    if($('main-header')) $('main-header').style.display = 'none';
  } else {
    if($('main-nav')) $('main-nav').style.display = 'flex'; 
    if($('main-header')) $('main-header').style.display = 'flex';
    const titles = { home: "Accueil", communities: "Communautés", search: "Recherche", profile: "Mon Profil", settings: "Paramètres", music: "Musique", video: "Vidéo", messages: "Messages", notifications: "Notifications" };
    if($('page-title')) $('page-title').textContent = titles[viewId] || "BlueNexus";
  }

  if (viewId === 'home') loadGlobalFeed(true);
  if (viewId === 'communities') renderCommunitiesList();
  if (viewId === 'profile') renderProfile();
  if (viewId === 'music') loadMedia('audio');
  if (viewId === 'video') loadMedia('video');
  if (viewId === 'messages') renderUsersList();
  if (viewId === 'notifications') loadNotifications();
  
  if (viewId !== 'home' && unsubscribeGlobal) { unsubscribeGlobal(); unsubscribeGlobal = null; }
  if (viewId !== 'community' && unsubscribeComm) { unsubscribeComm(); unsubscribeComm = null; }
  if (viewId !== 'chat' && unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; }
}

document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
if($('btn-settings-top')) $('btn-settings-top').addEventListener('click', () => switchView('settings'));
if($('btn-go-communities')) $('btn-go-communities').addEventListener('click', () => switchView('communities'));
if($('btn-back-home-comm')) $('btn-back-home-comm').addEventListener('click', () => switchView('home'));
if($('btn-back-from-comm')) $('btn-back-from-comm').addEventListener('click', () => switchView('communities'));
if($('btn-back-from-chat')) $('btn-back-from-chat').addEventListener('click', () => switchView('messages'));

if($('tab-discovery')) $('tab-discovery').addEventListener('click', () => {
  currentFeedMode = 'discovery';
  $('tab-discovery').className = 'btn-primary small';
  if($('tab-following')) $('tab-following').className = 'btn-secondary small';
  loadGlobalFeed(true);
});
if($('tab-following')) $('tab-following').addEventListener('click', () => {
  currentFeedMode = 'following';
  $('tab-following').className = 'btn-primary small';
  if($('tab-discovery')) $('tab-discovery').className = 'btn-secondary small';
  loadGlobalFeed(true);
});

if($('btn-refresh-feed')) $('btn-refresh-feed').addEventListener('click', () => {
  $('btn-refresh-feed').textContent = "⏳";
  loadGlobalFeed(true);
  setTimeout(() => { $('btn-refresh-feed').textContent = "🔄"; }, 1000);
});

// ================= INITIALISATION TENCENT CHAT (API SÉCURISÉE) =================
async function initTencentChat(userId) {
  try {
    // Appel à ton backend Vercel sécurisé
    const response = await fetch('https://bluenexus-backend.vercel.app/api/tencent/usersig', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId })
    });
    
    if (!response.ok) throw new Error("Erreur de récupération du UserSig");
    const data = await response.json();
    
    // Initialisation de Tencent
    tencentChat = TIM.create({ SDKAppID: TENCENT_SDK_APP_ID });
    
    // Connexion avec la signature du serveur
    await tencentChat.login({
      userID: userId,
      userSig: data.userSig 
    });
    
    console.log("Tencent Chat connecté via l'API sécurisée !");
    
  } catch (error) {
    console.error("Erreur Tencent:", error);
  }
}

// ================= CLOUDINARY =================
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: 'POST', body: formData });
  const data = await res.json();
  return data.secure_url;
}

// ================= DICTÉE VOCALE =================
document.querySelectorAll('.btn-mic').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const targetId = btn.getAttribute('data-target');
    const targetInput = $(targetId);
    if (!targetInput) return;
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return alert("Non supporté.");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR'; recognition.interimResults = false;
    btn.textContent = "🔴"; recognition.start();
    recognition.onresult = (event) => { targetInput.value += (targetInput.value ? " " : "") + event.results[0][0].transcript; btn.textContent = "🎤"; };
    recognition.onerror = () => { btn.textContent = "🎤"; };
    recognition.onend = () => { btn.textContent = "🎤"; };
  });
});

// ================= AUTHENTIFICATION =================
if($('btn-signup')) $('btn-signup').addEventListener('click', async () => {
  const email = $('auth-email-signup').value.trim(), pass = $('auth-pass-signup').value.trim(), name = $('auth-name').value.trim();
  if (!email || !pass || !name) return $('auth-error').textContent = "Remplissez tous les champs.";
  $('auth-error').textContent = "Création...";
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, 'users', cred.user.uid), {
      username: name, email: email, bio: "Nouveau sur BlueNexus 🚀", photoURL: "", pinned: [], following: [], followers: [], badges: []
    });
  } catch (e) { $('auth-error').textContent = e.message; }
});

if($('btn-login')) $('btn-login').addEventListener('click', async () => {
  const email = $('auth-email').value.trim(), pass = $('auth-pass').value.trim();
  if (!email || !pass) return $('auth-error').textContent = "Entrez email et mot de passe.";
  $('auth-error').textContent = "Connexion...";
  try { await signInWithEmailAndPassword(auth, email, pass); } 
  catch (e) { $('auth-error').textContent = "Email ou mot de passe incorrect."; }
});

if($('btn-forgot-password')) $('btn-forgot-password').addEventListener('click', async () => {
  const email = $('auth-email').value.trim();
  if (!email) return $('auth-error').textContent = "Entrez votre email.";
  try { await sendPasswordResetEmail(auth, email); alert("Email envoyé !"); } 
  catch (e) { $('auth-error').textContent = e.message; }
});

if($('btn-logout')) $('btn-logout').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      userProfile = snap.data();
      if(!userProfile.badges) userProfile.badges = [];
      if(!userProfile.following) userProfile.following = [];
    } else {
      userProfile = { username: user.email.split('@')[0], bio: "Nouveau", photoURL: "", pinned: [], following: [], badges: [] };
      await setDoc(doc(db, 'users', user.uid), userProfile);
    }
    
    // Mettre l'avatar dans la zone de création
    const createAvatar = $('create-post-avatar');
    if (createAvatar) {
      if (userProfile.photoURL) { createAvatar.style.backgroundImage = `url(${userProfile.photoURL})`; createAvatar.textContent = ''; }
      else { createAvatar.style.backgroundImage = 'none'; createAvatar.textContent = userProfile.username[0].toUpperCase(); }
    }

    // Initialiser Tencent
    await initTencentChat(user.uid);
    listenToNotifications();
    
    $('auth-screen').classList.remove('active');
    $('app-screen').classList.add('active');
    $('auth-error').textContent = "";
    switchView('home');
  } else {
    currentUser = null; userProfile = null;
    if(unsubscribeNotifs) unsubscribeNotifs();
    $('app-screen').classList.remove('active');
    $('auth-screen').classList.add('active');
    $('login-form').style.display = 'block';
    $('signup-form').style.display = 'none';
  }
});

// ================= NOTIFICATIONS =================
function listenToNotifications() {
  if(unsubscribeNotifs) unsubscribeNotifs();
  const q = query(collection(db, 'notifications'), where('toUser', '==', currentUser.uid), where('read', '==', false));
  unsubscribeNotifs = onSnapshot(q, snap => {
    const badge = $('notif-badge');
    if(!badge) return;
    if(snap.docs.length > 0) { badge.style.display = 'block'; badge.textContent = snap.docs.length; } 
    else { badge.style.display = 'none'; }
  });
}

async function sendNotification(toUser, text) {
  if(toUser === currentUser.uid) return; 
  await addDoc(collection(db, 'notifications'), {
    toUser: toUser, fromUser: currentUser.uid, fromUsername: userProfile.username, text: text, read: false, createdAt: serverTimestamp()
  });
}

async function loadNotifications() {
  const list = $('notif-list');
  if(!list) return;
  const q = query(collection(db, 'notifications'), where('toUser', '==', currentUser.uid), orderBy('createdAt', 'desc'), limit(20));
  const snap = await getDocs(q);
  if(snap.empty) return list.innerHTML = '<p class="muted">Aucune notification.</p>';
  list.innerHTML = snap.docs.map(d => `<div class="media-item" style="padding:10px;"><strong>@${d.data().fromUsername}</strong> ${d.data().text}</div>`).join('');
  for (const docSnap of snap.docs) { await updateDoc(doc(db, 'notifications', docSnap.id), { read: true }); }
}

// ================= FEED =================
if($('btn-global-attach')) $('btn-global-attach').addEventListener('click', () => $('global-post-file').click());
if($('btn-global-publish')) $('btn-global-publish').addEventListener('click', async () => {
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
    mediaUrl, mediaType, likes: [], commentsCount: 0, createdAt: serverTimestamp()
  });
  $('global-post-content').value = ''; $('global-post-file').value = '';
  $('btn-global-publish').textContent = "Publier";
  loadGlobalFeed(true);
});

async function loadGlobalFeed(reset = false) {
  const list = $('global-feed-list');
  const btnMore = $('btn-load-more');
  if(!list) return;
  
  if (reset) {
    list.innerHTML = `
      <div class="skeleton-post"><div class="skeleton-line short"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>
      <div class="skeleton-post"><div class="skeleton-line short"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>
    `;
    lastVisiblePost = null;
  }
  
  let q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(20));
  if (lastVisiblePost && !reset) q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), startAfter(lastVisiblePost), limit(20));

  const snap = await getDocs(q);
  if (snap.empty && reset) {
    list.innerHTML = '<p class="muted">Aucun message.</p>';
    if(btnMore) btnMore.style.display = 'none';
    return;
  }
  
  if (reset) list.innerHTML = '';
  lastVisiblePost = snap.docs[snap.docs.length - 1];
  
  let postsToShow = snap.docs;
  if (currentFeedMode === 'following') {
    postsToShow = snap.docs.filter(d => userProfile.following.includes(d.data().authorId));
    if(postsToShow.length === 0 && reset) list.innerHTML = '<p class="muted">Abonnez-vous à des personnes pour voir leurs posts ici !</p>';
  }

  postsToShow.forEach(d => { list.innerHTML += generatePostHTML(d); });
  if(btnMore) btnMore.style.display = snap.docs.length < 20 ? 'none' : 'block';
}

if($('btn-load-more')) $('btn-load-more').addEventListener('click', () => loadGlobalFeed(false));

// ================= MUSIQUE & VIDÉO =================
async function loadMedia(type) {
  const list = $(`${type}-list`);
  if(!list) return;
  list.innerHTML = '<p class="muted">Chargement...</p>';
  const q = query(collection(db, 'posts'), where('mediaType', '==', type), orderBy('createdAt', 'desc'), limit(30));
  const snap = await getDocs(q);
  if (snap.empty) return list.innerHTML = `<p class="muted">Aucun fichier ${type} disponible.</p>`;
  list.innerHTML = snap.docs.map(d => {
    const p = d.data();
    let mediaHtml = '';
    if (type === 'audio') mediaHtml = `<audio src="${p.mediaUrl}" controls style="width:100%; margin-top:10px;"></audio>`;
    if (type === 'video') mediaHtml = `<video src="${p.mediaUrl}" controls class="post-media"></video>`;
    return `<div class="media-item"><div class="post-header">👤 @${p.authorName}</div><p>${p.content}</p>${mediaHtml}</div>`;
  }).join('');
}

// ================= POSTS =================
function generatePostHTML(docSnap) {
  const p = docSnap.data();
  const avatar = p.authorPhoto ? `<img src="${p.authorPhoto}" class="post-avatar">` : `<div class="post-avatar">${p.authorName[0].toUpperCase()}</div>`;
  const isLiked = p.likes?.includes(currentUser.uid);
  const likeCount = p.likes?.length || 0;
  
  let timeAgo = "À l'instant";
  if (p.createdAt) {
    const diff = Date.now() - (p.createdAt.toMillis ? p.createdAt.toMillis() : p.createdAt);
    const mins = Math.floor(diff / 60000);
    if (mins > 0 && mins < 60) timeAgo = `Il y a ${mins} min`;
    else if (mins >= 60 && mins < 1440) timeAgo = `Il y a ${Math.floor(mins/60)} h`;
    else if (mins >= 1440) timeAgo = `Il y a ${Math.floor(mins/1440)} j`;
  }

  let mediaHtml = '';
  if (p.mediaUrl) {
    if (p.mediaType === 'image') mediaHtml = `<img src="${p.mediaUrl}" class="post-media">`;
    else if (p.mediaType === 'video') mediaHtml = `<video src="${p.mediaUrl}" controls class="post-media"></video>`;
    else if (p.mediaType === 'audio') mediaHtml = `<audio src="${p.mediaUrl}" controls style="width:100%; margin-top:10px;"></audio>`;
  }

  const isPinned = userProfile.pinned && userProfile.pinned.includes(docSnap.id);
  const pinBtn = (p.authorId === currentUser.uid) ? `<button onclick="window.togglePin('${docSnap.id}', ${isPinned}); window.toggleMoreMenu('${docSnap.id}')">${isPinned ? '📌 Désépingler' : '📍 Épingler'}</button>` : '';
  const canDelete = (p.authorId === currentUser.uid) || (currentCommunityId && userProfile.username === currentCommunityOwner);
  const deleteBtn = canDelete ? `<button onclick="window.deletePost('${docSnap.id}')" style="color:#ff6b6b;">🗑️ Supprimer</button>` : '';

  return `<div class="media-item" id="post-${docSnap.id}">
    <div class="post-header">
      <div style="display:flex; align-items:center; gap:10px;">
        ${avatar} <strong>@${p.authorName}</strong>
      </div>
      <span class="post-time">${timeAgo}</span>
    </div>
    <p id="text-${docSnap.id}">${p.content}</p>
    ${mediaHtml}
    
    <div class="post-actions">
      <button id="like-btn-${docSnap.id}" onclick="window.likePost('${docSnap.id}', '${p.authorId}', ${isLiked})" class="action-btn" style="color:${isLiked?'var(--blue-light)':'var(--text)'};">
        <span id="like-icon-${docSnap.id}">${isLiked?'💙':'🤍'}</span> 
        <span id="like-count-${docSnap.id}">${likeCount}</span>
      </button>
      <button onclick="window.toggleComments('${docSnap.id}')" class="action-btn">
        💬 ${p.commentsCount || 0}
      </button>
      <button onclick="window.sharePost('${docSnap.id}')" class="action-btn" title="Partager">📤</button>

      <div class="more-menu-container">
        <button onclick="window.toggleMoreMenu('${docSnap.id}')" class="action-btn">⋮</button>
        <div id="more-menu-${docSnap.id}" class="more-menu">
          <button onclick="window.speakText('text-${docSnap.id}'); window.toggleMoreMenu('${docSnap.id}')">🔊 Écouter</button>
          <button onclick="window.translateText('text-${docSnap.id}'); window.toggleMoreMenu('${docSnap.id}')">🌐 Traduire</button>
          ${pinBtn}
          ${deleteBtn}
        </div>
      </div>
    </div>

    <div id="comments-section-${docSnap.id}" class="comments-section" style="display: none;">
      <div id="comments-list-${docSnap.id}"><p class="muted" style="font-size: 0.8rem;">Chargement...</p></div>
      <div class="comment-input-row">
        <input type="text" id="comment-input-${docSnap.id}" placeholder="Commenter...">
        <button onclick="window.addComment('${docSnap.id}', '${p.authorId}')" class="btn-primary small">Envoyer</button>
      </div>
    </div>
  </div>`;
}

window.toggleMoreMenu = (postId) => {
  const menu = $(`more-menu-${postId}`);
  if(!menu) return;
  document.querySelectorAll('.more-menu').forEach(m => { if(m !== menu) m.classList.remove('active'); });
  menu.classList.toggle('active');
};

document.addEventListener('click', (e) => {
  if (!e.target.closest('.more-menu-container')) {
    document.querySelectorAll('.more-menu').forEach(m => m.classList.remove('active'));
  }
});

window.sharePost = (postId) => {
  const url = window.location.origin + window.location.pathname + "?post=" + postId;
  navigator.clipboard.writeText(url).then(() => {
    alert("Lien du post copié ! Partagez-le partout.");
  }).catch(() => {
    alert("Voici le lien : " + url);
  });
};

window.speakText = (elementId) => {
  const el = $(elementId);
  if(!el) return;
  const text = el.textContent;
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR'; window.speechSynthesis.speak(utterance);
  } else { alert("Non supporté."); }
};

window.translateText = async (elementId) => {
  const el = $(elementId);
  if(!el) return;
  if (el.dataset.translated === 'true') { el.textContent = el.dataset.original; el.dataset.translated = 'false'; return; }
  const originalText = el.textContent; el.dataset.original = originalText; el.textContent = "Traduction...";
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(originalText)}&langpair=autodetect|fr`);
    const data = await res.json(); el.textContent = data.responseData.translatedText; el.dataset.translated = 'true';
  } catch (e) { el.textContent = originalText; }
};

window.toggleComments = (postId) => {
  const section = $(`comments-section-${postId}`);
  if(!section) return;
  if (section.style.display === 'none') { section.style.display = 'block'; loadComments(postId); }
  else { section.style.display = 'none'; }
};

async function loadComments(postId) {
  const list = $(`comments-list-${postId}`);
  if(!list) return;
  list.innerHTML = '<p class="muted" style="font-size: 0.8rem;">Chargement...</p>';
  const q = query(collection(db, 'comments'), where('postId', '==', postId));
  const snap = await getDocs(q);
  if (snap.empty) return list.innerHTML = '<p class="muted" style="font-size: 0.8rem;">Soyez le premier à commenter !</p>';
  const comments = snap.docs.map(d => d.data());
  comments.sort((a, b) => a.createdAt - b.createdAt);
  list.innerHTML = comments.map(c => `<div class="comment-item"><strong>@${c.authorName}</strong> : ${c.content}</div>`).join('');
}

window.addComment = async (postId, authorId) => {
  const input = $(`comment-input-${postId}`);
  if(!input) return;
  const content = input.value.trim();
  if (!content) return;
  input.value = ''; 
  try {
    await addDoc(collection(db, 'comments'), { postId, content, authorId: currentUser.uid, authorName: userProfile.username, createdAt: Date.now() });
    const postRef = doc(db, 'posts', postId);
    const postSnap = await getDoc(postRef);
    if(postSnap.exists()) {
      const currentCount = postSnap.data().commentsCount || 0;
      await updateDoc(postRef, { commentsCount: currentCount + 1 });
    }
    sendNotification(authorId, "a commenté votre publication.");
    loadComments(postId); 
  } catch(e) { alert("Erreur : " + e.message); }
};

window.likePost = async (postId, authorId, isLiked) => {
  const ref = doc(db, 'posts', postId);
  const iconEl = $(`like-icon-${postId}`);
  const countEl = $(`like-count-${postId}`);
  const btnEl = $(`like-btn-${postId}`);
  let currentCount = parseInt(countEl.textContent) || 0;

  if (isLiked) {
    iconEl.textContent = '🤍'; countEl.textContent = currentCount > 0 ? currentCount - 1 : 0; btnEl.style.color = 'var(--text)';
  } else {
    iconEl.textContent = '💙'; countEl.textContent = currentCount + 1; btnEl.style.color = 'var(--blue-light)';
  }

  try {
    if (isLiked) await updateDoc(ref, { likes: arrayRemove(currentUser.uid) });
    else {
      await updateDoc(ref, { likes: arrayUnion(currentUser.uid) });
      sendNotification(authorId, "a aimé votre publication.");
    }
    const btn = $(`like-btn-${postId}`);
    btn.setAttribute('onclick', `window.likePost('${postId}', '${authorId}', ${!isLiked})`);
  } catch(e) { 
    if (isLiked) { iconEl.textContent = '💙'; countEl.textContent = currentCount + 1; }
    else { iconEl.textContent = '🤍'; countEl.textContent = currentCount - 1; }
  }
};

window.togglePin = async (postId, isPinned) => {
  const ref = doc(db, 'users', currentUser.uid);
  if (isPinned) { await updateDoc(ref, { pinned: arrayRemove(postId) }); userProfile.pinned = userProfile.pinned.filter(id => id !== postId); } 
  else { await updateDoc(ref, { pinned: arrayUnion(postId) }); if(!userProfile.pinned) userProfile.pinned = []; userProfile.pinned.push(postId); }
  if($('view-profile').classList.contains('active')) renderProfile();
};

window.deletePost = async (postId) => {
  if(confirm("Supprimer ce message ?")) {
    await deleteDoc(doc(db, 'posts', postId));
    const el = document.getElementById(`post-${postId}`);
    if(el) el.remove();
  }
};

// ================= MESSAGERIE (TENCENT) =================
async function renderUsersList() {
  const list = $('users-list');
  if(!list) return;
  list.innerHTML = '<p class="muted">Chargement...</p>';
  const snap = await getDocs(collection(db, 'users'));
  const otherUsers = snap.docs.filter(d => d.id !== currentUser.uid).map(d => ({ id: d.id, ...d.data() }));
  if(otherUsers.length === 0) return list.innerHTML = '<p class="muted">Aucun autre membre.</p>';

  list.innerHTML = otherUsers.map(u => {
    const avatar = u.photoURL ? `<img src="${u.photoURL}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;margin-right:10px;">` : `<div style="width:40px;height:40px;border-radius:50%;background:var(--blue);display:inline-flex;align-items:center;justify-content:center;margin-right:10px;font-weight:bold;color:white;">${u.username[0].toUpperCase()}</div>`;
    return `<div class="card" style="flex-direction:row; align-items:center; padding:10px;" onclick="window.startTencentChat('${u.id}', '${u.username}')">${avatar}<div><h4 style="margin:0">${u.username}</h4></div></div>`;
  }).join('');
}

window.startTencentChat = async (targetId, targetName) => {
  if (!tencentChat) { alert("La messagerie se connecte..."); return; }
  
  currentChatId = targetId;
  $('chat-with-name').textContent = targetName;
  switchView('chat');
  
  const list = $('chat-messages');
  if(!list) return;
  list.innerHTML = '<p class="muted">Chargement de la conversation...</p>';
  
  try {
    // Note: L'historique complet nécessite une version plus poussée, ici on affiche les nouveaux messages
    list.innerHTML = '<p class="muted" style="text-align:center; margin-top:2rem;">Dites bonjour ! 👋</p>';
  } catch(e) { console.error(e); }
  
  if (window.tencentMessageListener) tencentChat.off(TIM.EVENT.MESSAGE_RECEIVED, window.tencentMessageListener);
  
  window.tencentMessageListener = (event) => {
    event.data.forEach(msg => {
      if (msg.conversationID === `C2C${targetId}` || msg.from === targetId) {
        const isMine = msg.from === currentUser.uid;
        list.innerHTML += `<div class="chat-msg ${isMine ? 'mine' : 'theirs'}">${msg.payload.text || '[Média]'}</div>`;
        window.scrollTo(0, document.body.scrollHeight);
      }
    });
  };
  
  tencentChat.on(TIM.EVENT.MESSAGE_RECEIVED, window.tencentMessageListener);
};

if($('btn-send-chat')) $('btn-send-chat').addEventListener('click', async () => {
  const text = $('chat-input').value.trim();
  if(!text || !currentChatId || !tencentChat) return;
  
  $('chat-input').value = '';
  
  try {
    const message = tencentChat.createTextMessage({
      to: currentChatId,
      conversationType: TIM.TYPES.CONV_C2C,
      payload: { text: text }
    });
    await tencentChat.sendMessage(message);
    
    const list = $('chat-messages');
    if (list) {
      list.innerHTML += `<div class="chat-msg mine">${text}</div>`;
      window.scrollTo(0, document.body.scrollHeight);
    }
  } catch(e) { console.error(e); alert("Erreur d'envoi Tencent."); }
});

// ================= COMMUNAUTÉS =================
if($('btn-new-community')) $('btn-new-community').addEventListener('click', () => $('modal-community').classList.remove('hidden'));
if($('comm-cancel')) $('comm-cancel').addEventListener('click', () => $('modal-community').classList.add('hidden'));
if($('comm-save')) $('comm-save').addEventListener('click', async () => {
  const name = $('comm-name').value.trim();
  if (!name) return;
  await addDoc(collection(db, 'communities'), {
    name, description: $('comm-desc').value.trim(), ownerId: currentUser.uid, ownerName: userProfile.username, members: [currentUser.uid], createdAt: serverTimestamp()
  });
  if(!userProfile.badges.includes("👑 Fondateur")) {
    userProfile.badges.push("👑 Fondateur");
    await updateDoc(doc(db, 'users', currentUser.uid), { badges: arrayUnion("👑 Fondateur") });
  }
  $('modal-community').classList.add('hidden');
  renderCommunitiesList();
});

async function renderCommunitiesList() {
  const list = $('communities-list');
  if(!list) return;
  const snap = await getDocs(collection(db, 'communities'));
  list.innerHTML = snap.docs.map(c => `<div class="card" onclick="window.openCommunity('${c.id}')"><h4>${c.data().name}</h4><p class="muted">${c.data().description}</p></div>`).join('');
}

window.openCommunity = async (id) => {
  currentCommunityId = id;
  const snap = await getDoc(doc(db, 'communities', id));
  if (!snap.exists()) return;
  const data = snap.data();
  currentCommunityMembers = data.members; currentCommunityOwner = data.ownerName;
  $('comm-title-display').textContent = data.name;
  $('members-count').textContent = `${data.members.length} membres`;
  if (data.members.includes(currentUser.uid)) $('post-form-container').style.display = 'flex';
  else $('post-form-container').style.display = 'none';
  switchView('community');
  
  unsubscribeComm = onSnapshot(query(collection(db, 'posts'), where('communityId', '==', id), orderBy('createdAt', 'desc')), snap => {
    $('posts-list').innerHTML = snap.docs.map(d => generatePostHTML(d)).join('');
  });
};

if($('btn-join-community')) $('btn-join-community').addEventListener('click', async () => {
  await updateDoc(doc(db, 'communities', currentCommunityId), { members: arrayUnion(currentUser.uid) });
  window.openCommunity(currentCommunityId);
});

if($('btn-publish-post')) $('btn-publish-post').addEventListener('click', async () => {
  const content = $('post-content').value.trim();
  if (!content) return;
  $('post-content').value = '';
  await addDoc(collection(db, 'posts'), {
    communityId: currentCommunityId, communityType: 'public', content, 
    authorId: currentUser.uid, authorName: userProfile.username, likes: [], commentsCount: 0, createdAt: serverTimestamp()
  });
});

// ================= PROFIL =================
function renderProfile() {
  if(!userProfile) return;
  if($('profile-name')) $('profile-name').textContent = userProfile.username;
  if($('profile-bio')) $('profile-bio').textContent = userProfile.bio || 'Aucune bio.';
  const av = $('profile-avatar');
  if (av) {
    if (userProfile.photoURL) { av.style.backgroundImage = `url(${userProfile.photoURL})`; av.textContent = ''; } 
    else { av.style.backgroundImage = 'none'; av.textContent = userProfile.username[0].toUpperCase(); }
  }
  if($('profile-badges')) $('profile-badges').innerHTML = (userProfile.badges || []).map(b => `<span class="badge-item">${b}</span>`).join('');
  const pinnedContainer = $('profile-pinned');
  if(!pinnedContainer) return;
  pinnedContainer.innerHTML = '';
  if (userProfile.pinned && userProfile.pinned.length > 0) {
    pinnedContainer.innerHTML = '<p class="muted">Chargement...</p>';
    Promise.all(userProfile.pinned.map(id => getDoc(doc(db, 'posts', id)))).then(docs => {
      pinnedContainer.innerHTML = '';
      docs.forEach(d => { if (d.exists()) pinnedContainer.innerHTML += `<div class="media-item" style="border-color: var(--blue-light);"><p style="font-size:0.9rem;">${d.data().content}</p></div>`; });
    });
  } else { pinnedContainer.innerHTML = '<p class="muted">Aucune publication épinglée.</p>'; }
}

if($('btn-edit-profile-trigger')) $('btn-edit-profile-trigger').addEventListener('click', () => $('modal-profile').classList.remove('hidden'));
if($('btn-cancel-profile')) $('btn-cancel-profile').addEventListener('click', () => $('modal-profile').classList.add('hidden'));
if($('btn-save-profile')) $('btn-save-profile').addEventListener('click', async () => {
  const file = $('edit-avatar').files[0];
  let photoURL = userProfile.photoURL;
  $('btn-save-profile').textContent = "Patientez...";
  if (file) photoURL = await uploadFile(file);
  await updateDoc(doc(db, 'users', currentUser.uid), { bio: $('edit-bio').value.trim(), photoURL });
  userProfile.bio = $('edit-bio').value.trim();
  userProfile.photoURL = photoURL;
  
  const createAvatar = $('create-post-avatar');
  if (createAvatar) {
    if (photoURL) { createAvatar.style.backgroundImage = `url(${photoURL})`; createAvatar.textContent = ''; }
    else { createAvatar.style.backgroundImage = 'none'; createAvatar.textContent = userProfile.username[0].toUpperCase(); }
  }

  $('modal-profile').classList.add('hidden');
  renderProfile();
  $('btn-save-profile').textContent = "Enregistrer";
});

// ================= RECHERCHE =================
if($('search-input')) $('search-input').addEventListener('input', async (e) => {
  const term = e.target.value.toLowerCase();
  const usersDiv = $('search-results-users');
  const commsDiv = $('search-results-communities');
  if(!usersDiv || !commsDiv) return;
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
  if(!userProfile.following) userProfile.following = [];
  userProfile.following.push(targetId);
  alert("Vous êtes maintenant abonné à cet utilisateur !");
  sendNotification(targetId, "s'est abonné à vous.");
};
