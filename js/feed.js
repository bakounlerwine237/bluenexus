// --- js/feed.js ---
import { db, state } from './state.js';
import { $, timeAgo, uploadFile, speakText, translateText, toggleMoreMenu, sharePost, showToast, formatPostText } from './utils.js';
import { collection, addDoc, query, orderBy, limit, startAfter, getDocs, doc, updateDoc, arrayUnion, arrayRemove, getDoc, deleteDoc, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

let isFetchingFeed = false;
let noMorePosts = false;

function calculatePostScore(post) {
  const now = Date.now();
  const postTime = post.createdAt ? (post.createdAt.toMillis ? post.createdAt.toMillis() : post.createdAt) : now;
  const likesPoints = (post.likes?.length || 0) * 2;
  const commentsPoints = (post.commentsCount || 0) * 3;
  const hoursSincePost = (now - postTime) / (1000 * 60 * 60);
  const freshnessPoints = Math.max(0, 50 - (hoursSincePost * 2));
  return likesPoints + commentsPoints + freshnessPoints;
}

export async function loadGlobalFeed(reset = false) {
  const list = $('global-feed-list');
  if (!list) return;
  if (reset) {
    list.innerHTML = `<div class="skeleton-post"><div class="skeleton-line short"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div><div class="skeleton-post"><div class="skeleton-line short"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>`;
    state.lastVisiblePost = null;
    noMorePosts = false;
  }
  if (noMorePosts || isFetchingFeed) return;
  isFetchingFeed = true;
  
  let q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));
  if (state.lastVisiblePost && !reset) {
    q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), startAfter(state.lastVisiblePost), limit(50));
  }
  
  try {
    const snap = await getDocs(q);
    if (snap.empty && reset) {
      list.innerHTML = '<p class="muted">Aucun message sur le réseau.</p>';
      noMorePosts = true;
      return;
    }
    if (reset) list.innerHTML = '';
    if (snap.docs.length > 0) state.lastVisiblePost = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < 50) noMorePosts = true;
    
    let postsToShow = snap.docs.map(d => ({ id: d.id, data: d.data(), ref: d }));
    postsToShow.forEach(p => { p.score = calculatePostScore(p.data); });
    postsToShow.sort((a, b) => b.score - a.score);

    if (state.currentFeedMode === 'following') {
      postsToShow = postsToShow.filter(p => {
        const isMe = p.data.authorId === state.currentUser.uid;
        const isUserFollowed = state.userProfile.following?.includes(p.data.authorId) || false;
        const isPageFollowed = (p.data.pageId && state.userProfile.following?.includes(p.data.pageId)) || false;
        return isMe || isUserFollowed || isPageFollowed;
      });
      if (postsToShow.length === 0 && reset) {
        list.innerHTML = `<div style="text-align: center; padding: 3rem 1rem; color: var(--muted);"><div style="font-size: 4rem; margin-bottom: 1rem;">👀</div><h3 style="color: var(--text); margin-bottom: 10px;">C'est bien calme par ici...</h3><p style="margin-bottom: 1.5rem; font-size: 0.9rem;">Abonnez-vous à des profils ou des pages pour voir leurs publications.</p><button onclick="window.switchToDiscovery()" class="btn-primary small">Découvrir du contenu</button></div>`;
        return;
      }
    } else if (state.currentFeedMode === 'discovery') {
      postsToShow = postsToShow.filter(p => {
        const isMe = p.data.authorId === state.currentUser.uid;
        const isUserFollowed = state.userProfile.following?.includes(p.data.authorId) || false;
        const isPageFollowed = (p.data.pageId && state.userProfile.following?.includes(p.data.pageId)) || false;
        return !isMe && !isUserFollowed && !isPageFollowed;
      });
      if (postsToShow.length === 0 && reset) {
        list.innerHTML = `<div style="text-align: center; padding: 3rem 1rem; color: var(--muted);"><div style="font-size: 4rem; margin-bottom: 1rem;">🌟</div><h3 style="color: var(--text); margin-bottom: 10px;">Vous êtes à jour !</h3><p style="margin-bottom: 1.5rem; font-size: 0.9rem;">Vous suivez déjà tous les créateurs actifs.</p></div>`;
      }
    } else if (state.currentFeedMode === 'trending') {
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      postsToShow = postsToShow.filter(p => {
        const postTime = p.data.createdAt ? (p.data.createdAt.toMillis ? p.data.createdAt.toMillis() : p.data.createdAt) : 0;
        const hasEngagement = (p.data.likes?.length || 0) > 0 || (p.data.commentsCount || 0) > 0;
        return postTime > sevenDaysAgo && hasEngagement;
      });
      if (postsToShow.length === 0 && reset) {
        list.innerHTML = `<div style="text-align: center; padding: 3rem 1rem; color: var(--muted);"><div style="font-size: 4rem; margin-bottom: 1rem;">🔥</div><h3 style="color: var(--text); margin-bottom: 10px;">Aucune tendance pour le moment</h3><p style="margin-bottom: 1.5rem; font-size: 0.9rem;">Les publications les plus populaires de la semaine apparaîtront ici.</p></div>`;
        return;
      }
    }

    const bestPosts = postsToShow.slice(0, 20);
    bestPosts.forEach(p => { list.innerHTML += generatePostHTML(p.ref); });
  } catch (error) {
    console.error("Erreur de chargement:", error);
  } finally {
    isFetchingFeed = false;
  }
}

// ... Le reste de feed.js (generatePostHTML, populatePageSelector, initFeed) reste EXACTEMENT identique à la version avec le bouton Signaler.
