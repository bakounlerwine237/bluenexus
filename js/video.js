import { db, state } from './state.js';
import { $, showToast } from './utils.js';
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

let videoUnsubscribe = null;

export async function loadVideoFeed() {
  const feed = $('video-feed');
  if(!feed) return;
  feed.innerHTML = '<div style="color:white; text-align:center; padding:2rem;">Chargement des vidéos...</div>';

  try {
    // On récupère les 20 dernières vidéos (uniquement mediaType == 'video')
    const q = query(collection(db, 'posts'), where('mediaType', '==', 'video'), orderBy('createdAt', 'desc'), limit(20));
    const snap = await getDocs(q);

    if (snap.empty) {
      feed.innerHTML = '<div style="color:white; text-align:center; padding:2rem;">Aucune vidéo disponible pour le moment.</div>';
      return;
    }

    feed.innerHTML = '';
    snap.docs.forEach(d => {
      const p = d.data();
      const isLiked = p.likes?.includes(state.currentUser.uid);
      const likeCount = p.likes?.length || 0;

      // Création de la slide vidéo
      feed.innerHTML += `
        <div class="video-slide" id="v-${d.id}">
          <video src="${p.mediaUrl}" loop playsinline controls preload="metadata"></video>
          
          <div class="video-overlay">
            <h4 onclick="window.openUserProfile('${p.authorId}')">@${p.authorName}</h4>
            <p>${p.content}</p>
          </div>

          <div class="video-actions">
            <button onclick="window.toggleVideoLike('${d.id}', '${isLiked}')">
              <span id="v-like-icon-${d.id}">${isLiked ? '💙' : '🤍'}</span>
              <span id="v-like-count-${d.id}">${likeCount}</span>
            </button>
            <button onclick="window.openCommentsFromVideo('${d.id}')">
              💬
            </button>
          </div>
        </div>
      `;
    });

    // Auto-play des vidéos quand elles entrent dans l'écran
    setupVideoObserver();

  } catch (e) {
    console.error("Erreur chargement vidéos:", e);
    feed.innerHTML = '<div style="color:white; text-align:center; padding:2rem;">Erreur de chargement.</div>';
  }
}

// Gestion du Like spécifique à la vidéo
window.toggleVideoLike = async (postId, isLiked) => {
  const ref = doc(db, 'posts', postId);
  const iconEl = $(`v-like-icon-${postId}`), countEl = $(`v-like-count-${postId}`);
  let currentCount = parseInt(countEl.textContent) || 0;

  // Mise à jour visuelle instantanée
  if (isLiked) { iconEl.textContent = '🤍'; countEl.textContent = Math.max(0, currentCount - 1); }
  else { iconEl.textContent = '💙'; countEl.textContent = currentCount + 1; }

  try {
    if (isLiked) await updateDoc(ref, { likes: arrayRemove(state.currentUser.uid) });
    else await updateDoc(ref, { likes: arrayUnion(state.currentUser.uid) });
    
    // Mettre à jour l'attribut onclick pour le prochain clic
    const btn = iconEl.parentElement;
    btn.setAttribute('onclick', `window.toggleVideoLike('${postId}', ${!isLiked})`);

  } catch(e) {
    // En cas d'erreur, on annule
    if (isLiked) { iconEl.textContent = '💙'; countEl.textContent = currentCount + 1; }
    else { iconEl.textContent = '🤍'; countEl.textContent = currentCount - 1; }
  }
};

// Ouvrir les commentaires depuis la vidéo (on bascule sur l'accueil pour l'instant)
window.openCommentsFromVideo = (postId) => {
  showToast("Les commentaires vidéos arrivent bientôt !", "success");
};

// Permet de lire automatiquement la vidéo visible
function setupVideoObserver() {
  const videos = document.querySelectorAll('.video-slide video');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.play().catch(e => console.log("Autoplay bloqué par le navigateur"));
      } else {
        entry.target.pause();
      }
    });
  }, { threshold: 0.6 }); // La vidéo doit être à 60% visible

  videos.forEach(v => observer.observe(v));
}

export function initVideo() {
  // On ne charge pas tout de suite, on attend que l'utilisateur clique sur l'onglet
}
