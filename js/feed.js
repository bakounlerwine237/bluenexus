import { db, currentUser, userProfile, auth } from './auth.js';
import { collection, addDoc, query, where, orderBy, limit, onSnapshot, updateDoc, arrayUnion, arrayRemove, getDocs, doc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
let unsubGlobal = null;

export async function renderGlobalFeed() {
  const list = $('global-feed-list');
  list.innerHTML = '<p class="muted">Chargement...</p>';
  
  const q = query(collection(db, 'posts'), where('communityType', 'in', ['global', 'announcement']), orderBy('createdAt', 'desc'), limit(30));
  
  unsubGlobal = onSnapshot(q, snap => {
    if (snap.empty) return list.innerHTML = '<p class="muted">Aucune annonce pour l\'instant.</p>';
    list.innerHTML = snap.docs.map(d => generatePostHTML(d)).join('');
  });
}

window.addEventListener('view-changed-home', renderGlobalFeed);

// Publication Admin
$('btn-global-publish').addEventListener('click', async () => {
  const content = $('global-post-content').value.trim();
  if (!content) return;
  await addDoc(collection(db, 'posts'), {
    communityId: 'global', communityType: 'global',
    content, authorId: currentUser.uid, authorName: userProfile.username, authorPhoto: userProfile.photoURL || "",
    likes: [], createdAt: Date.now()
  });
  $('global-post-content').value = '';
});

function generatePostHTML(docSnap) {
  const p = docSnap.data();
  const avatar = p.authorPhoto ? `<img src="${p.authorPhoto}" class="post-avatar">` : `<div class="post-avatar">${p.authorName[0].toUpperCase()}</div>`;
  const isLiked = p.likes?.includes(currentUser.uid);
  const likeIcon = isLiked ? "💙" : "🤍";
  
  return `<div class="media-item">
    <div class="post-header">${avatar} @${p.authorName}</div>
    <p id="text-${docSnap.id}">${p.content}</p>
    <div class="post-actions">
      <button onclick="window.toggleLike('${docSnap.id}', ${isLiked})" class="btn-secondary small">${likeIcon} ${p.likes ? p.likes.length : 0}</button>
      <button onclick="window.toggleComments('${docSnap.id}')" class="btn-secondary small">💬 Commenter</button>
      <button onclick="window.speakText('text-${docSnap.id}')" class="btn-secondary small">🔊</button>
      <button onclick="window.translateText('text-${docSnap.id}')" class="btn-secondary small">🌐</button>
    </div>
    <div id="comments-${docSnap.id}" class="comments-section" style="display:none;">
      <div id="list-comments-${docSnap.id}"><p class="muted">Chargement...</p></div>
      <div class="comment-input-row">
        <input type="text" id="input-comment-${docSnap.id}" placeholder="Commenter...">
        <button onclick="window.addComment('${docSnap.id}')" class="btn-primary small">Envoyer</button>
      </div>
    </div>
  </div>`;
}

// FONCTIONS GLOBALES
window.toggleLike = async (postId, isLiked) => {
  const ref = doc(db, 'posts', postId);
  if (isLiked) await updateDoc(ref, { likes: arrayRemove(currentUser.uid) });
  else await updateDoc(ref, { likes: arrayUnion(currentUser.uid) });
};

window.speakText = (elementId) => {
  const text = $(elementId).textContent;
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR'; 
    window.speechSynthesis.speak(utterance);
  }
};

window.translateText = async (elementId) => {
  const el = $(elementId);
  if (el.dataset.translated === 'true') {
    el.textContent = el.dataset.original;
    el.dataset.translated = 'false';
    return;
  }
  const originalText = el.textContent;
  el.dataset.original = originalText;
  el.textContent = "Traduction...";
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(originalText)}&langpair=autodetect|fr`);
    const data = await res.json();
    el.textContent = data.responseData.translatedText;
    el.dataset.translated = 'true';
  } catch (e) { el.textContent = originalText; }
};

window.toggleComments = (postId) => {
  const sec = $(`comments-${postId}`);
  sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
  if (sec.style.display === 'block') loadComments(postId);
};

async function loadComments(postId) {
  const list = $(`list-comments-${postId}`);
  const q = query(collection(db, 'comments'), where('postId', '==', postId));
  const snap = await getDocs(q);
  if (snap.empty) return list.innerHTML = '<p class="muted">Aucun commentaire.</p>';
  list.innerHTML = snap.docs.map(d => `<div class="comment-item"><strong>@${d.data().authorName}</strong> : ${d.data().content}</div>`).join('');
}

window.addComment = async (postId) => {
  const input = $(`input-comment-${postId}`);
  const content = input.value.trim();
  if (!content) return;
  input.value = '';
  await addDoc(collection(db, 'comments'), { postId, content, authorId: currentUser.uid, authorName: userProfile.username, createdAt: Date.now() });
  loadComments(postId);
};
