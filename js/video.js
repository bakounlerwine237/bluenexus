// --- js/video.js ---
import { db, state } from './state.js';
import { $, showToast } from './utils.js';
import { collection, where, getDocs, limit, query, orderBy, doc, getDoc, addDoc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

export async function loadVideoFeed() {
  const feed = $('video-feed');
  if (!feed) return;
  feed.innerHTML = '<div style="color:white; text-align:center; padding:2rem;">Chargement des vidéos...</div>';
  try {
    const q = query(collection(db, 'posts'), where('mediaType', '==', 'video'), orderBy('createdAt', 'desc'), limit(20));
    const snap = await getDocs(q);
    if (snap.empty) {
      feed.innerHTML = '<div style="color:white; text-align:center; padding:3rem 1rem;"><div style="font-size:4rem; margin-bottom:1rem;">🎬</div><h3 style="margin-bottom:10px;">Aucune vidéo</h3><p style="color:#7a86a8;">Soyez le premier à publier une vidéo sur BlueNexus !</p></div>';
      return;
    }
    feed.innerHTML = '';
    snap.docs.forEach(d => {
      const p = d.data();
      const isLiked = p.likes?.includes(state.currentUser.uid);
      const likeCount = p.likes?.length || 0;
      feed.innerHTML += `<div class="video-slide" id="v-${d.id}"><video src="${p.mediaUrl}" loop playsinline controls preload="metadata"></video><div class="video-overlay"><h4 onclick="window.openUserProfile('${p.authorId}')">@${p.authorName}</h4><p>${p.content}</p></div><div class="video-actions"><button onclick="window.toggleVideoLike('${d.id}', ${isLiked})"><span id="v-like-icon-${d.id}">${isLiked ? '💙' : '🤍'}</span><span id="v-like-count-${d.id}">${likeCount}</span></button><button onclick="window.openCommentsFromVideo('${d.id}')">💬</button></div></div>`;
    });
    setupVideoObserver();
  } catch (e) {
    console.error("Erreur chargement vidéos:", e);
    feed.innerHTML = '<div style="color:white; text-align:center; padding:3rem 1rem;"><div style="font-size:4rem; margin-bottom:1rem;">🎬</div><h3 style="margin-bottom:10px;">Aucune vidéo disponible</h3><p style="color:#7a86a8;">Le flux vidéo est vide pour le moment.</p></div>';
  }
}

function setupVideoObserver() {
  const videos = document.querySelectorAll('.video-slide video');
  if (!videos.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const video = entry.target;
      if (entry.isIntersecting) { video.play().catch(() => {}); } else { video.pause(); }
    });
  }, { threshold: 0.6 });
  videos.forEach(v => observer.observe(v));
}

window.toggleVideoLike = async (postId, isLiked) => {
  const ref = doc(db, 'posts', postId);
  const iconEl = $(`v-like-icon-${postId}`), countEl = $(`v-like-count-${postId}`);
  if (!iconEl || !countEl) return;
  let currentCount = parseInt(countEl.textContent) || 0;
  if (isLiked) { iconEl.textContent = '🤍'; countEl.textContent = Math.max(0, currentCount - 1); }
  else { iconEl.textContent = '💙'; countEl.textContent = currentCount + 1; }
  try {
    if (isLiked) await updateDoc(ref, { likes: arrayRemove(state.currentUser.uid) });
    else await updateDoc(ref, { likes: arrayUnion(state.currentUser.uid) });
    const btn = iconEl.parentElement;
    btn.setAttribute('onclick', `window.toggleVideoLike('${postId}', ${!isLiked})`);
  } catch (e) {
    if (isLiked) { iconEl.textContent = '💙'; countEl.textContent = currentCount + 1; }
    else { iconEl.textContent = '🤍'; countEl.textContent = currentCount - 1; }
  }
};

window.openCommentsFromVideo = async (postId) => {
  let overlay = $('video-comments-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'video-comments-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:200;display:none;flex-direction:column;padding:1rem;';
    overlay.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;"><h3 style="color:white;margin:0;">Commentaires</h3><button id="video-comments-close" style="background:none;border:none;color:white;font-size:1.5rem;cursor:pointer;">✕</button></div><div id="video-comments-list" style="flex:1;overflow-y:auto;"></div><div style="display:flex;gap:8px;margin-top:10px;"><input id="video-comment-input" type="text" placeholder="Ajouter un commentaire..." style="flex:1;padding:10px;border-radius:20px;border:none;margin:0;" /><button id="video-comment-send" class="btn-primary small">Envoyer</button></div>`;
    document.body.appendChild(overlay);
    $('video-comments-close').addEventListener('click', () => { overlay.style.display = 'none'; });
    $('video-comment-send').addEventListener('click', () => window.sendVideoComment(postId));
    $('video-comment-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') window.sendVideoComment(postId); });
  } else {
    overlay.style.display = 'flex';
    $('video-comment-send').onclick = () => window.sendVideoComment(postId);
  }
  overlay.style.display = 'flex';
  await window.loadVideoComments(postId);
};

window.loadVideoComments = async (postId) => {
  const list = $('video-comments-list');
  if (!list) return;
  list.innerHTML = '<p style="color:#7a86a8;">Chargement...</p>';
  const q = query(collection(db, 'comments'), where('postId', '==', postId));
  const snap = await getDocs(q);
  if (snap.empty) { list.innerHTML = '<p style="color:#7a86a8;">Soyez le premier à commenter.</p>'; return; }
  const comments = snap.docs.map(d => d.data()).sort((a, b) => a.createdAt - b.createdAt);
  list.innerHTML = comments.map(c => `<div style="background:#121829;padding:10px;border-radius:10px;margin-bottom:8px;"><strong style="color:#3b82f6;">@${c.authorName}</strong> : <span style="color:#e6ecff;">${c.content}</span></div>`).join('');
  list.scrollTop = list.scrollHeight;
};

window.sendVideoComment = async (postId) => {
  const input = $('video-comment-input');
  if (!input) return;
  const content = input.value.trim();
  if (!content) return;
  input.value = '';
  try {
    await addDoc(collection(db, 'comments'), { postId, content, authorId: state.currentUser.uid, authorName: state.userProfile.username, createdAt: Date.now() });
    const postRef = doc(db, 'posts', postId);
    const postSnap = await getDoc(postRef);
    if (postSnap.exists()) await updateDoc(postRef, { commentsCount: (postSnap.data().commentsCount || 0) + 1 });
    await window.loadVideoComments(postId);
    showToast("✅ Commentaire ajouté !", "success");
  } catch (e) { showToast("Erreur : " + e.message, "error"); }
};

// LA FONCTION MANQUANTE QUI BLOQUAIT TOUT LE SITE
export function initVideo() {
  console.log("Module Vidéo initialisé.");
}
