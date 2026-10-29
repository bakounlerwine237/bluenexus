// --- js/feed.js ---
import { db, state } from './state.js';
import { $, timeAgo, uploadFile, speakText, translateText, toggleMoreMenu, sharePost, showToast, formatPostText, getLevelInfo } from './utils.js';
import { sendNotification } from './notifications.js';
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

// --- GAGNER DE L'XP ---
export async function gainXp(amount) {
  if (!state.currentUser || !state.userProfile) return;
  try {
    const newXp = (state.userProfile.xp || 0) + amount;
    await updateDoc(doc(db, 'users', state.currentUser.uid), { xp: newXp });
    state.userProfile.xp = newXp;
  } catch(e) { console.error("Erreur XP:", e); }
}

async function loadSuggestedUsers() {
  const container = $('suggested-users-container');
  const list = $('suggested-users-list');
  if(!container || !list) return;
  
  if (state.currentFeedMode !== 'discovery') { container.style.display = 'none'; return; }
  
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(10)));
    let html = ''; let count = 0;
    snap.forEach(d => {
      if (count >= 3 || d.id === state.currentUser.uid || state.userProfile.following?.includes(d.id)) return;
      const u = d.data();
      const avatar = u.photoURL ? `<img src="${u.photoURL}" class="tg-avatar">` : `<div class="tg-avatar">${u.username[0].toUpperCase()}</div>`;
      html += `<div class="tg-item" style="padding: 8px 12px;">${avatar}<div class="tg-content" onclick="window.openUserProfile('${d.id}')" style="cursor:pointer;"><div class="tg-title">${u.username} ${u.role === 'admin' ? '👑' : ''}</div><div class="tg-subtitle">${u.bio || 'Nouveau sur BlueNexus'}</div></div><button onclick="window.followFromSuggestion('${d.id}', this)" class="btn-primary small" style="padding: 4px 8px; font-size: 0.75rem;">Suivre</button></div>`;
      count++;
    });
    if (count > 0) { list.innerHTML = html; container.style.display = 'block'; } else { container.style.display = 'none'; }
  } catch(e) { console.error("Erreur suggestions:", e); }
}

window.followFromSuggestion = async (userId, btn) => {
  try {
    await updateDoc(doc(db, 'users', state.currentUser.uid), { following: arrayUnion(userId) });
    if(!state.userProfile.following) state.userProfile.following = [];
    state.userProfile.following.push(userId);
    btn.textContent = "Suivi ✅"; btn.className = "btn-secondary small"; btn.disabled = true;
    showToast("✅ Vous suivez ce profil !");
  } catch(e) { showToast("Erreur", "error"); }
};

async function processMentions(text, postAuthorId) {
  const mentions = text.match(/@([a-zA-Z0-9_]+)/g);
  if (!mentions) return;
  const usernames = [...new Set(mentions.map(m => m.substring(1)))];
  for (const username of usernames) {
    try {
      const q = query(collection(db, 'users'), where('username', '==', username), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const mentionedUser = snap.docs[0];
        if (mentionedUser.id !== postAuthorId) await sendNotification(mentionedUser.id, "vous a mentionné dans une publication.");
      }
    } catch (e) { console.error("Erreur mention:", e); }
  }
}

// --- TOP HASHTAGS ---
async function loadTopHashtags() {
  const container = $('top-hashtags-container');
  const list = $('top-hashtags-list');
  if (!container || !list) return;
  
  if (state.currentFeedMode !== 'trending') {
    container.style.display = 'none';
    return;
  }
  
  try {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(100));
    const snap = await getDocs(q);
    const hashtagCounts = {};
    snap.docs.forEach(d => {
      const content = d.data().content || "";
      const hashtags = content.match(/#([a-zA-Z0-9_]+)/g);
      if (hashtags) {
        hashtags.forEach(tag => {
          const t = tag.toLowerCase();
          hashtagCounts[t] = (hashtagCounts[t] || 0) + 1;
        });
      }
    });
    
    const sortedTags = Object.entries(hashtagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (sortedTags.length === 0) { container.style.display = 'none'; return; }
    
    list.innerHTML = sortedTags.map(([tag, count]) => `
      <button onclick="window.searchFromPost('${tag}')" class="btn-secondary small" style="border-radius: 20px; background: rgba(59, 130, 246, 0.1); border-color: var(--blue-light); color: var(--blue-light);">
        ${tag} <span style="font-size: 0.7rem; opacity: 0.7;">(${count})</span>
      </button>
    `).join('');
    container.style.display = 'block';
  } catch(e) { console.error("Erreur hashtags:", e); }
}

export async function loadGlobalFeed(reset = false) {
  const list = $('global-feed-list');
  if (!list) return;
  
  if (reset) {
    list.innerHTML = `<div class="skeleton-post"><div class="skeleton-line short"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div><div class="skeleton-post"><div class="skeleton-line short"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>`;
    state.lastVisiblePost = null; noMorePosts = false; 
    loadSuggestedUsers();
    loadTopHashtags();
  }
  
  if (noMorePosts || isFetchingFeed) return;
  isFetchingFeed = true;
  
  let q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));
  if (state.lastVisiblePost && !reset) q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), startAfter(state.lastVisiblePost), limit(50));
  
  try {
    const snap = await getDocs(q);
    if (snap.empty && reset) {
      list.innerHTML = '<p class="muted" style="padding: 1rem; text-align: center;">Aucune publication pour le moment.</p>';
      noMorePosts = true; return;
    }
    if (reset) list.innerHTML = '';
    if (snap.docs.length > 0) state.lastVisiblePost = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < 50) noMorePosts = true;
    
    let postsToShow = snap.docs.map(d => ({ id: d.id, data: d.data(), ref: d }));
    postsToShow = postsToShow.filter(p => p.data.communityId === 'global' || !p.data.communityId);

    postsToShow.forEach(p => { p.score = calculatePostScore(p.data); });
    postsToShow.sort((a, b) => b.score - a.score);

    if (state.currentFeedMode === 'following') {
      postsToShow = postsToShow.filter(p => {
        if (p.data.postType === 'opportunity' || p.data.postType === 'confession' || p.data.postType === 'event') return false; 
        const isMe = p.data.authorId === state.currentUser.uid;
        const isUserFollowed = state.userProfile?.following?.includes(p.data.authorId) || false;
        const isPageFollowed = (p.data.pageId && state.userProfile?.following?.includes(p.data.pageId)) || false;
        return isMe || isUserFollowed || isPageFollowed;
      });
      if (postsToShow.length === 0 && reset) {
        list.innerHTML = `<div style="text-align: center; padding: 3rem 1rem; color: var(--muted);"><div style="font-size: 4rem; margin-bottom: 1rem;">👀</div><h3 style="color: var(--text); margin-bottom: 10px;">C'est bien calme par ici...</h3><p style="margin-bottom: 1.5rem; font-size: 0.9rem;">Abonnez-vous à des profils ou des pages pour voir leurs publications.</p><button onclick="window.switchToDiscovery()" class="btn-primary small">Découvrir du contenu</button></div>`;
        return;
      }
    } else if (state.currentFeedMode === 'discovery') {
      postsToShow = postsToShow.filter(p => {
        if (p.data.postType === 'opportunity' || p.data.postType === 'confession' || p.data.postType === 'event') return false; 
        const isMe = p.data.authorId === state.currentUser.uid;
        const isUserFollowed = state.userProfile?.following?.includes(p.data.authorId) || false;
        const isPageFollowed = (p.data.pageId && state.userProfile?.following?.includes(p.data.pageId)) || false;
        return !isMe && !isUserFollowed && !isPageFollowed;
      });
      if (postsToShow.length === 0 && reset) {
        list.innerHTML = `<div style="text-align: center; padding: 3rem 1rem; color: var(--muted);"><div style="font-size: 4rem; margin-bottom: 1rem;">🌟</div><h3 style="color: var(--text); margin-bottom: 10px;">Vous êtes à jour !</h3><p style="margin-bottom: 1.5rem; font-size: 0.9rem;">Vous suivez déjà tous les créateurs actifs.</p></div>`;
      }
    } else if (state.currentFeedMode === 'opportunities') {
      postsToShow = postsToShow.filter(p => p.data.postType === 'opportunity');
      if (postsToShow.length === 0 && reset) {
        list.innerHTML = `<div style="text-align: center; padding: 3rem 1rem; color: var(--muted);"><div style="font-size: 4rem; margin-bottom: 1rem;">💼</div><h3 style="color: var(--text); margin-bottom: 10px;">Aucune opportunité</h3><p style="margin-bottom: 1.5rem; font-size: 0.9rem;">Soyez le premier à publier une offre d'emploi ou un service !</p><button onclick="document.getElementById('modal-opportunity').classList.remove('hidden')" class="btn-primary small" style="background: #10b981;">Publier une annonce</button></div>`;
        return;
      }
    } else if (state.currentFeedMode === 'confessions') {
      postsToShow = postsToShow.filter(p => p.data.postType === 'confession');
      if (postsToShow.length === 0 && reset) {
        list.innerHTML = `<div style="text-align: center; padding: 3rem 1rem; color: var(--muted);"><div style="font-size: 4rem; margin-bottom: 1rem;">🤫</div><h3 style="color: var(--text); margin-bottom: 10px;">Aucune confession</h3><p style="margin-bottom: 1.5rem; font-size: 0.9rem;">Soyez le premier à balancer ton secret anonymement !</p><button onclick="document.getElementById('global-post-content').focus(); document.getElementById('post-as-select').value = 'confession';" class="btn-primary small" style="background: #6366f1;">Écrire une confession</button></div>`;
        return;
      }
    } else if (state.currentFeedMode === 'events') {
      postsToShow = postsToShow.filter(p => p.data.postType === 'event');
      if (postsToShow.length === 0 && reset) {
        list.innerHTML = `<div style="text-align: center; padding: 3rem 1rem; color: var(--muted);"><div style="font-size: 4rem; margin-bottom: 1rem;">📅</div><h3 style="color: var(--text); margin-bottom: 10px;">Aucun événement</h3><p style="margin-bottom: 1.5rem; font-size: 0.9rem;">Soyez le premier à créer un événement local !</p><button onclick="document.getElementById('modal-event').classList.remove('hidden')" class="btn-primary small" style="background: #f59e0b;">Créer un événement</button></div>`;
        return;
      }
    } else if (state.currentFeedMode === 'trending') {
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      postsToShow = postsToShow.filter(p => {
        if (p.data.postType === 'opportunity' || p.data.postType === 'confession' || p.data.postType === 'event') return false;
        const postTime = p.data.createdAt ? (p.data.createdAt.toMillis ? p.data.createdAt.toMillis() : p.data.createdAt) : 0;
        const hasEngagement = (p.data.likes?.length || 0) > 0 || (p.data.commentsCount || 0) > 0;
        return postTime > sevenDaysAgo && hasEngagement;
      });
      if (postsToShow.length === 0 && reset) {
        list.innerHTML = `<div style="text-align: center; padding: 3rem 1rem; color: var(--muted);"><div style="font-size: 4rem; margin-bottom: 1rem;">🔥</div><h3 style="color: var(--text); margin-bottom: 10px;">Aucune tendance</h3><p style="margin-bottom: 1.5rem; font-size: 0.9rem;">Les publications les plus populaires de la semaine apparaîtront ici.</p></div>`;
        return;
      }
    }

    const bestPosts = postsToShow.slice(0, 20);
    bestPosts.forEach(p => { list.innerHTML += generatePostHTML(p.ref); });
  } catch (error) {
    console.error("Erreur de chargement:", error);
    list.innerHTML = `<p class="muted" style="color:#ef4444; padding: 1rem;">Erreur : ${error.message}</p>`;
  } finally {
    isFetchingFeed = false;
  }
}

export function generatePostHTML(docSnap) {
  const p = docSnap.data();
  
  // --- EVENEMENTS ---
  if (p.postType === 'event') {
    const isAttending = p.eventAttendees?.includes(state.currentUser.uid);
    const attendeesCount = p.eventAttendees?.length || 0;
    const eventDateObj = new Date(p.eventDate);
    const formattedDate = eventDateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    
    return `<div class="media-item" style="border-left: 4px solid #f59e0b;">
      <div class="post-header">
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="post-avatar" style="background: #f59e0b;">📅</div>
          <div>
            <strong style="font-size: 1.05rem; color: #f59e0b;">${p.eventTitle}</strong>
            <div style="font-size: 0.75rem; color: var(--muted); margin-top: 2px;">Organisé par @${p.authorName}</div>
          </div>
        </div>
        <span class="post-time">${timeAgo(p.createdAt)}</span>
      </div>
      <div style="background: var(--bg); border-radius: 8px; padding: 10px; margin-top: 10px; border: 1px solid var(--border);">
        <p style="font-weight: bold; color: #f59e0b; margin-bottom: 5px;">🕒 ${formattedDate}</p>
        <p style="font-weight: bold; color: #f59e0b;">📍 ${p.eventLocation}</p>
        <p style="margin-top: 10px;">${p.content}</p>
      </div>
      <div class="post-actions" style="margin-top: 10px;">
        <button onclick="window.toggleAttendEvent('${docSnap.id}', ${isAttending})" class="btn-primary small" style="background: ${isAttending ? '#10b981' : '#f59e0b'}; border: none; flex: 1;">
          ${isAttending ? '✅ Je participe' : '👋 Je participe'} (${attendeesCount})
        </button>
        <button onclick="window.sharePost('${docSnap.id}')" class="action-btn" style="flex: 1;">📤 Partager</button>
      </div>
    </div>`;
  }

  // --- CONFESSIONS ---
  if (p.postType === 'confession') {
    const isAuthor = p.authorId === state.currentUser.uid;
    const canReveal = p.allowReveal && !isAuthor;
    const alreadyRevealed = p.revealedTo?.includes(state.currentUser.uid) || isAuthor || state.userProfile.role === 'admin';
    let authorDisplay = isAuthor ? `@${p.authorRealName} <span style="font-size: 0.7rem; color: #6366f1;">(vous)</span>` : (alreadyRevealed ? `@${p.authorRealName}` : `<span class="confession-author" style="color: #6366f1;">🤫 Anonyme</span>`);
    let actionHtml = '';
    if (!isAuthor && !alreadyRevealed) {
      if (p.allowReveal) {
        actionHtml = `<div class="confession-action" style="margin-top: 10px; text-align: center;"><button onclick="window.revealConfession('${docSnap.id}', '${p.authorId}')" class="btn-primary small" style="background: #6366f1; width: 100%;">🔍 Révéler l'auteur (50 🪙)</button></div>`;
      } else {
        actionHtml = `<div class="confession-action" style="margin-top: 10px; text-align: center;"><p class="muted" style="font-size: 0.8rem;">🔒 L'auteur n'autorise pas la révélation.</p></div>`;
      }
    }
    return `<div class="media-item" style="border-left: 4px solid #6366f1;">
      <div class="post-header"><div style="display:flex; align-items:center; gap:10px;"><div class="post-avatar" style="background: #6366f1;">🤫</div><div><strong style="color: #6366f1;">${authorDisplay}</strong><div style="font-size: 0.7rem; color: var(--muted); margin-top: 2px;">Confession anonyme · ${timeAgo(p.createdAt)}</div></div></div></div>
      <p style="margin-top: 10px; font-style: italic; font-size: 1.05rem;">"${formatPostText(p.content)}"</p>
      ${actionHtml}
      <div class="post-actions"><button onclick="window.sharePost('${docSnap.id}')" class="action-btn">📤 Partager</button>${(p.authorId === state.currentUser.uid || state.userProfile.role === 'admin') ? `<button onclick="window.deletePost('${docSnap.id}')" class="action-btn delete">🗑️ Supprimer</button>` : ''}</div>
    </div>`;
  }

  // --- OPPORTUNITES ---
  if (p.postType === 'opportunity') {
    const typeIcons = { emploi: '💼', vente: '🛒', service: '🛠️', immobilier: '🏠' };
    const icon = typeIcons[p.oppType] || '📌';
    return `<div class="media-item" style="border-left: 4px solid #10b981;">
      <div class="post-header"><div style="display:flex; align-items:center; gap:10px;"><div class="post-avatar" style="background: #10b981;">${icon}</div><div><strong style="font-size: 1.05rem; color: #10b981;">${p.oppTitle}</strong><div style="font-size: 0.75rem; color: var(--muted); margin-top: 2px;">📍 ${p.oppCity} · Par @${p.authorName}</div></div></div><span class="post-time">${timeAgo(p.createdAt)}</span></div>
      <p style="margin-top: 10px;">${p.content}</p>
      <div style="background: var(--bg); padding: 10px; border-radius: 8px; margin-top: 10px; font-size: 0.85rem; border: 1px dashed var(--border);"><strong>📞 Contact :</strong> ${p.oppContact || 'Message privé'}</div>
      <div class="post-actions"><button onclick="window.sharePost('${docSnap.id}')" class="action-btn">📤 Partager</button><button onclick="window.openUserProfile('${p.authorId}')" class="action-btn" style="color: var(--blue-light);">💬 Contacter</button>${(p.authorId === state.currentUser.uid || state.userProfile.role === 'admin') ? `<button onclick="window.deletePost('${docSnap.id}')" class="action-btn delete">🗑️ Supprimer</button>` : ''}</div>
    </div>`;
  }

  // --- SONDAGES ---
  if (p.postType === 'poll') {
    const totalVotes = (p.pollVotes || []).length;
    const hasVoted = p.pollVotes?.some(v => v.userId === state.currentUser.uid);
    const myVote = p.pollVotes?.find(v => v.userId === state.currentUser.uid);
    let optionsHtml = '';
    p.pollOptions.forEach((opt, index) => {
      const votesForOpt = (p.pollVotes || []).filter(v => v.optionIndex === index).length;
      const percentage = totalVotes > 0 ? Math.round((votesForOpt / totalVotes) * 100) : 0;
      const isMyChoice = myVote && myVote.optionIndex === index;
      const barColor = isMyChoice ? '#a855f7' : 'var(--blue-light)';
      optionsHtml += `<div onclick="window.votePoll('${docSnap.id}', ${index})" style="background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px; margin-bottom: 8px; cursor: pointer; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; height: 100%; width: ${hasVoted ? percentage : 0}%; background: ${barColor}; opacity: 0.2; transition: width 0.5s;"></div><div style="position: relative; display: flex; justify-content: space-between; align-items: center;"><span style="font-weight: ${isMyChoice ? 'bold' : 'normal'}; color: ${isMyChoice ? barColor : 'var(--text)'};">${isMyChoice ? '✓ ' : ''}${opt}</span>${hasVoted ? `<span style="font-size: 0.85rem; color: var(--muted);">${percentage}%</span>` : ''}</div></div>`;
    });
    return `<div class="media-item" style="border-left: 4px solid #a855f7;"><div class="post-header"><div style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="window.openUserProfile('${p.authorId}')">${p.authorPhoto ? `<img src="${p.authorPhoto}" class="post-avatar">` : `<div class="post-avatar" style="background: #a855f7;">${p.authorName[0].toUpperCase()}</div>`}<div><strong>@${p.authorName}</strong><div style="font-size: 0.7rem; color: #a855f7; font-weight: bold;">📊 SONDAGE</div></div></div><span class="post-time">${timeAgo(p.createdAt)}</span></div><p style="font-weight: bold; margin: 10px 0; font-size: 1.05rem;">${p.pollQuestion}</p>${optionsHtml}<div style="font-size: 0.8rem; color: var(--muted); text-align: center; margin-top: 5px;">${totalVotes} vote${totalVotes > 1 ? 's' : ''} ${hasVoted ? '· Cliquez pour changer votre vote' : ''}</div><div class="post-actions"><button onclick="window.sharePost('${docSnap.id}')" class="action-btn">📤 Partager</button>${(p.authorId === state.currentUser.uid || state.userProfile.role === 'admin') ? `<button onclick="window.deletePost('${docSnap.id}')" class="action-btn delete">🗑️ Supprimer</button>` : ''}</div></div>`;
  }

  // --- POST STANDARD ---
  const avatar = p.authorPhoto ? `<img src="${p.authorPhoto}" class="post-avatar" loading="lazy">` : `<div class="post-avatar">${p.authorName[0].toUpperCase()}</div>`;
  const isLiked = p.likes?.includes(state.currentUser.uid);
  const likeCount = p.likes?.length || 0;
  const formattedContent = formatPostText(p.content);
  const verifiedIcon = p.authorIsPremium ? '<span style="color: #3b82f6; font-size: 0.9rem; margin-left: 4px;" title="Compte Vérifié">✅</span>' : '';
  const levelInfo = getLevelInfo(p.authorXp || 0);
  const levelBadge = `<span style="background: var(--bg); color: var(--blue-light); font-size: 0.65rem; padding: 2px 6px; border-radius: 10px; margin-left: 5px; border: 1px solid var(--border);">Lv.${levelInfo.level}</span>`;

  let mediaHtml = '';
  if (p.mediaUrl) {
    const isEco = document.body.classList.contains('eco-mode');
    const ecoClass = isEco ? 'post-media' : 'post-media show-media';
    const clickHandler = isEco ? `onclick="this.classList.add('show-media')"` : '';
    if (p.mediaType === 'image') mediaHtml = `<img src="${p.mediaUrl}" class="${ecoClass}" ${clickHandler} loading="lazy">`;
    else if (p.mediaType === 'video') mediaHtml = `<video src="${p.mediaUrl}" controls class="${ecoClass}" ${clickHandler} preload="metadata"></video>`;
    else if (p.mediaType === 'audio') mediaHtml = `<audio src="${p.mediaUrl}" controls style="width:100%; margin-top:10px;" preload="metadata"></audio>`;
  }
  
  const isPinned = state.userProfile.pinned && state.userProfile.pinned.includes(docSnap.id);
  const pinBtn = (p.authorId === state.currentUser.uid) ? `<button onclick="window.togglePin('${docSnap.id}', ${isPinned}); window.toggleMoreMenu('${docSnap.id}')">${isPinned ? '📌 Désépingler' : '📍 Épingler'}</button>` : '';
  const isAdmin = state.userProfile.role === 'admin';
  const canDelete = (p.authorId === state.currentUser.uid) || (state.currentCommunityId && state.userProfile.username === state.currentCommunityOwner) || isAdmin;
  const deleteBtn = canDelete ? `<button onclick="window.deletePost('${docSnap.id}')" style="color:#ff6b6b;">🗑️ Supprimer ${isAdmin && p.authorId !== state.currentUser.uid ? '(Admin)' : ''}</button>` : '';
  const isSaved = state.userProfile.savedPosts?.includes(docSnap.id);
  const saveBtn = `<button onclick="window.toggleSavePost('${docSnap.id}', ${isSaved}); window.toggleMoreMenu('${docSnap.id}')">${isSaved ? '🔖 Retirer des favoris' : '🔖 Sauvegarder'}</button>`;
  const reportBtn = (p.authorId !== state.currentUser.uid) ? `<button onclick="window.reportPost('${docSnap.id}'); window.toggleMoreMenu('${docSnap.id}')" style="color:#f59e0b;">🚨 Signaler</button>` : '';
  const pageBadge = p.pageName ? `<div style="font-size: 0.75rem; color: #10b981; margin-top: 2px; font-weight: bold;">📄 Publié en tant que ${p.pageName}</div>` : '';
  const isCreator = (p.authorId === state.currentUser.uid);
  const canBoost = isCreator && (state.userProfile.isPremium || isAdmin);
  const boostBtn = canBoost ? `<button onclick="window.boostPost('${docSnap.id}'); window.toggleMoreMenu('${docSnap.id}')" style="color: #a855f7; font-weight: bold;">🚀 Booster ce post</button>` : '';

  return `<div class="media-item" id="post-${docSnap.id}" ondblclick="window.doubleTapLike('${docSnap.id}', '${p.authorId}', ${isLiked})"><div class="heart-animation" id="heart-${docSnap.id}">❤️</div><div class="post-header"><div style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="window.openUserProfile('${p.authorId}')">${avatar} <div><strong>@${p.authorName}</strong>${levelBadge}${verifiedIcon}${pageBadge}</div></div><span class="post-time">${timeAgo(p.createdAt)}</span></div><p id="text-${docSnap.id}">${formattedContent}</p>${mediaHtml}<div class="post-actions"><button id="like-btn-${docSnap.id}" onclick="window.likePost('${docSnap.id}', '${p.authorId}', ${isLiked})" class="action-btn" style="color:${isLiked?'var(--blue-light)':'var(--text)'};"><span id="like-icon-${docSnap.id}">${isLiked?'💙':'🤍'}</span> <span id="like-count-${docSnap.id}">${likeCount}</span></button><button onclick="window.toggleComments('${docSnap.id}')" class="action-btn">💬 ${p.commentsCount || 0}</button><button onclick="window.sharePost('${docSnap.id}')" class="action-btn" title="Partager">📤</button><div class="more-menu-container"><button onclick="window.toggleMoreMenu('${docSnap.id}')" class="action-btn">⋮</button><div id="more-menu-${docSnap.id}" class="more-menu"><button onclick="window.speakText('text-${docSnap.id}'); window.toggleMoreMenu('${docSnap.id}')">🔊 Écouter</button><button onclick="window.translateText('text-${docSnap.id}'); window.toggleMoreMenu('${docSnap.id}')">🌐 Traduire</button>${boostBtn}${saveBtn}${pinBtn}${reportBtn}${deleteBtn}</div></div></div><div id="comments-section-${docSnap.id}" class="comments-section" style="display: none;"><div id="comments-list-${docSnap.id}"><p class="muted" style="font-size: 0.8rem;">Chargement...</p></div><div class="comment-input-row"><input type="text" id="comment-input-${docSnap.id}" placeholder="Commenter..."><button onclick="window.addComment('${docSnap.id}', '${p.authorId}')" class="btn-primary small">Envoyer</button></div></div></div>`;
}

export async function populatePageSelector() {
  const select = $('post-as-select');
  if (!select) return;
  const q = query(collection(db, 'pages'), where('ownerId', '==', state.currentUser.uid));
  const snap = await getDocs(q);
  select.innerHTML = '<option value="user">👤 Publier en tant que moi</option><option value="confession">🤫 Publier une confession anonyme</option>';
  if (!snap.empty) {
    snap.docs.forEach(d => {
      const page = d.data();
      const option = document.createElement('option');
      option.value = d.id;
      option.textContent = `📄 ${page.name}`;
      option.dataset.pageName = page.name;
      select.appendChild(option);
    });
  }
}

export function initFeed() {
  if ($('btn-global-attach')) $('btn-global-attach').addEventListener('click', () => $('global-post-file').click());
  
  const postContent = $('global-post-content');
  const publishBtn = $('btn-global-publish');
  
  if (postContent) {
    const savedDraft = localStorage.getItem('bluenexus_draft_global');
    if (savedDraft) postContent.value = savedDraft;
    
    const checkPublishState = () => {
      const hasText = postContent.value.trim().length > 0;
      const hasFile = $('global-post-file') && $('global-post-file').files.length > 0;
      if(publishBtn) publishBtn.disabled = !(hasText || hasFile);
    };

    postContent.addEventListener('input', function() {
      this.style.height = '40px';
      this.style.height = (this.scrollHeight) + 'px';
      localStorage.setItem('bluenexus_draft_global', this.value);
      checkPublishState();
    });
    setTimeout(checkPublishState, 100); 
  }
  
  if ($('global-post-file')) {
    $('global-post-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      const previewContainer = $('global-file-preview');
      if (!file) { previewContainer.innerHTML = ''; previewContainer.classList.add('hidden'); if(publishBtn) publishBtn.disabled = true; return; }
      previewContainer.innerHTML = '';
      previewContainer.classList.remove('hidden');
      if (file.type.startsWith('image')) {
        const img = document.createElement('img');
        img.className = 'file-preview-img';
        img.src = URL.createObjectURL(file);
        previewContainer.appendChild(img);
      } else {
        const icon = document.createElement('span');
        icon.textContent = file.type.startsWith('video') ? '🎬' : '🎵';
        icon.style.fontSize = '1.5rem';
        previewContainer.appendChild(icon);
      }
      const fileName = document.createElement('div');
      fileName.className = 'file-preview-name';
      fileName.textContent = file.name;
      previewContainer.appendChild(fileName);
      const removeBtn = document.createElement('button');
      removeBtn.className = 'file-preview-remove';
      removeBtn.textContent = '✕';
      removeBtn.onclick = () => { $('global-post-file').value = ''; previewContainer.innerHTML = ''; previewContainer.classList.add('hidden'); if(publishBtn) publishBtn.disabled = true; };
      previewContainer.appendChild(removeBtn);
      if(publishBtn) publishBtn.disabled = false;
    });
  }

  if (publishBtn) publishBtn.addEventListener('click', async () => {
    const content = $('global-post-content').value.trim();
    const file = $('global-post-file').files[0];
    const select = $('post-as-select');
    let pageId = null; let pageName = null;
    let isConfession = false;
    
    if (select) {
      if (select.value === 'confession') { isConfession = true; } 
      else if (select.value !== 'user') { pageId = select.value; pageName = select.options[select.selectedIndex].dataset.pageName; }
    }
    
    if (!content && !file) return;
    publishBtn.textContent = "Publication...";
    let mediaUrl = null, mediaType = null;
    if (file) {
      mediaUrl = await uploadFile(file);
      if (file.type.startsWith('image')) mediaType = 'image';
      else if (file.type.startsWith('video')) mediaType = 'video';
      else mediaType = 'audio';
    }
    
    let postData = {
      communityId: 'global', communityType: 'global', content, 
      authorId: state.currentUser.uid, authorName: state.userProfile.username, 
      authorPhoto: state.userProfile.photoURL || "", 
      authorIsPremium: state.userProfile.isPremium || false,
      authorXp: state.userProfile.xp || 0,
      mediaUrl, mediaType, likes: [], commentsCount: 0, createdAt: serverTimestamp(), pageId: pageId, pageName: pageName 
    };
    
    if (isConfession) {
      postData = { postType: 'confession', content, authorId: state.currentUser.uid, authorRealName: state.userProfile.username, allowReveal: true, createdAt: serverTimestamp() };
    }
    
    await addDoc(collection(db, 'posts'), postData);

    if (content && !isConfession) processMentions(content, state.currentUser.uid);
    
    try {
      const userRef = doc(db, 'users', state.currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const currentCoins = userSnap.data().coins || 0;
        const currentXp = userSnap.data().xp || 0;
        await updateDoc(userRef, { coins: currentCoins + 10, xp: currentXp + 10 });
        state.userProfile.coins = currentCoins + 10;
        state.userProfile.xp = currentXp + 10;
        showToast("🪙 +10 Coins & ⭐ +10 XP gagnés !", "success");
      }
    } catch(e) { console.error("Erreur coins/xp:", e); }

    $('global-post-content').value = '';
    $('global-post-content').style.height = '40px';
    localStorage.removeItem('bluenexus_draft_global');
    $('global-post-file').value = '';
    $('global-file-preview').innerHTML = '';
    $('global-file-preview').classList.add('hidden');
    if (select) select.value = 'user';
    publishBtn.textContent = "Publier";
    publishBtn.disabled = true;
    
    if (state.currentFeedMode === 'discovery') { if($('tab-following')) $('tab-following').click(); } 
    else { loadGlobalFeed(true); }
  });
  
  if ($('btn-refresh-feed')) $('btn-refresh-feed').addEventListener('click', () => {
    $('btn-refresh-feed').textContent = "⏳";
    loadGlobalFeed(true);
    setTimeout(() => { $('btn-refresh-feed').textContent = "🔄"; }, 1000);
  });
  
  const sentinel = $('feed-sentinel');
  if (sentinel) {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && $('view-home').classList.contains('active')) loadGlobalFeed(false);
    }, { rootMargin: '200px' });
    observer.observe(sentinel);
  }
  
  const btnBackToTop = $('btn-back-to-top');
  if (btnBackToTop) {
    window.addEventListener('scroll', () => { btnBackToTop.classList.toggle('show', window.scrollY > 300); });
    btnBackToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }
  
  window.doubleTapLike = async (postId, authorId, isLiked) => {
    const heart = $(`heart-${postId}`);
    if (heart) { heart.classList.add('animate'); setTimeout(() => heart.classList.remove('animate'), 600); }
    if (!isLiked) window.likePost(postId, authorId, false);
  };
  
  window.boostPost = async (postId) => {
    try {
      await updateDoc(doc(db, 'posts', postId), { createdAt: serverTimestamp() });
      showToast("🚀 Publication boostée !", "success");
      if (document.getElementById('view-home').classList.contains('active')) window.loadGlobalFeed(true);
    } catch (e) { showToast("Erreur lors du boost", "error"); }
  };

  window.toggleSavePost = async (postId, isSaved) => {
    const ref = doc(db, 'users', state.currentUser.uid);
    if (isSaved) {
      await updateDoc(ref, { savedPosts: arrayRemove(postId) });
      state.userProfile.savedPosts = state.userProfile.savedPosts.filter(id => id !== postId);
      showToast("Retiré des favoris.", "error");
    } else {
      await updateDoc(ref, { savedPosts: arrayUnion(postId) });
      if (!state.userProfile.savedPosts) state.userProfile.savedPosts = [];
      state.userProfile.savedPosts.push(postId);
      showToast("🔖 Post sauvegardé !", "success");
    }
  };
  
  window.likePost = async (postId, authorId, isLiked) => {
    const ref = doc(db, 'posts', postId);
    const iconEl = $(`like-icon-${postId}`), countEl = $(`like-count-${postId}`), btnEl = $(`like-btn-${postId}`);
    if (!iconEl || !countEl) return;
    let currentCount = parseInt(countEl.textContent) || 0;
    if (isLiked) { iconEl.textContent = '🤍'; countEl.textContent = Math.max(0, currentCount - 1); btnEl.style.color = 'var(--text)'; }
    else { iconEl.textContent = '💙'; countEl.textContent = currentCount + 1; btnEl.style.color = 'var(--blue-light)'; }
    try {
      if (isLiked) await updateDoc(ref, { likes: arrayRemove(state.currentUser.uid) });
      else {
        await updateDoc(ref, { likes: arrayUnion(state.currentUser.uid) });
        if (authorId !== state.currentUser.uid) {
          await sendNotification(authorId, "a aimé votre publication.");
          gainXp(2);
        }
      }
      btnEl.setAttribute('onclick', `window.likePost('${postId}', '${authorId}', ${!isLiked})`);
    } catch (e) {
      if (isLiked) { iconEl.textContent = '💙'; countEl.textContent = currentCount + 1; }
      else { iconEl.textContent = '🤍'; countEl.textContent = currentCount - 1; }
    }
  };
  
  window.deletePost = async (postId) => {
    if (confirm("Supprimer ce message ?")) {
      await deleteDoc(doc(db, 'posts', postId));
      const el = document.getElementById(`post-${postId}`);
      if (el) el.remove();
      showToast("🗑️ Post supprimé.", "error");
    }
  };
  
  window.toggleComments = (postId) => {
    const section = $(`comments-section-${postId}`);
    if (!section) return;
    if (section.style.display === 'none') { section.style.display = 'block'; window.loadComments(postId); }
    else section.style.display = 'none';
  };
  
  window.loadComments = async (postId) => {
    const list = $(`comments-list-${postId}`);
    if (!list) return;
    list.innerHTML = '<p class="muted" style="font-size: 0.8rem;">Chargement...</p>';
    const q = query(collection(db, 'comments'), where('postId', '==', postId));
    const snap = await getDocs(q);
    if (snap.empty) return list.innerHTML = '<p class="muted" style="font-size: 0.8rem;">Soyez le premier à commenter !</p>';
    const comments = snap.docs.map(d => d.data());
    comments.sort((a, b) => a.createdAt - b.createdAt);
    list.innerHTML = comments.map(c => `<div class="comment-item"><strong>@${c.authorName}</strong> : ${c.content}</div>`).join('');
  };
  
  window.addComment = async (postId, authorId) => {
    const input = $(`comment-input-${postId}`);
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    try {
      await addDoc(collection(db, 'comments'), { postId, content, authorId: state.currentUser.uid, authorName: state.userProfile.username, createdAt: Date.now() });
      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);
      if (postSnap.exists()) await updateDoc(postRef, { commentsCount: (postSnap.data().commentsCount || 0) + 1 });
      if (authorId !== state.currentUser.uid) {
        await sendNotification(authorId, "a commenté votre publication.");
        gainXp(5);
      }
      window.loadComments(postId);
    } catch (e) { alert("Erreur : " + e.message); }
  };
  
  window.togglePin = async (postId, isPinned) => {
    const ref = doc(db, 'users', state.currentUser.uid);
    if (isPinned) {
      await updateDoc(ref, { pinned: arrayRemove(postId) });
      state.userProfile.pinned = state.userProfile.pinned.filter(id => id !== postId);
    } else {
      await updateDoc(ref, { pinned: arrayUnion(postId) });
      if (!state.userProfile.pinned) state.userProfile.pinned = [];
      state.userProfile.pinned.push(postId);
    }
    if ($('view-profile').classList.contains('active') && window.renderProfile) window.renderProfile();
  };
  
  window.reportPost = async (postId) => {
    const dupQuery = query(collection(db, 'reports'), where('postId', '==', postId), where('reporterId', '==', state.currentUser.uid));
    const dupSnap = await getDocs(dupQuery);
    if (!dupSnap.empty) return showToast("Vous avez déjà signalé ce post.", "error");
    let modal = $('modal-report');
    if (!modal) {
      modal = document.createElement('div'); modal.id = 'modal-report'; modal.className = 'modal hidden';
      modal.innerHTML = `<div class="modal-content"><h3 style="margin-bottom:1rem;">🚨 Signaler ce post</h3><div id="report-reasons" style="display:flex; flex-direction:column; gap:8px; margin-bottom:1rem;"><button class="btn-secondary" data-reason="Haineux" style="text-align:left;">🚫 Contenu haineux</button><button class="btn-secondary" data-reason="Harcèlement" style="text-align:left;">😠 Harcèlement</button><button class="btn-secondary" data-reason="Spam" style="text-align:left;">📢 Spam</button><button class="btn-secondary" data-reason="Autre" style="text-align:left;">❓ Autre</button></div><button id="btn-cancel-report" class="btn-secondary" style="width:100%;">Annuler</button></div>`;
      document.body.appendChild(modal);
      $('btn-cancel-report').addEventListener('click', () => modal.classList.add('hidden'));
      modal.querySelectorAll('#report-reasons button').forEach(btn => {
        btn.addEventListener('click', () => { window.submitReport(postId, btn.dataset.reason); modal.classList.add('hidden'); });
      });
    }
    modal.classList.remove('hidden');
  };
  
  window.submitReport = async (postId, reason) => {
    try {
      await addDoc(collection(db, 'reports'), { postId, reason, reporterId: state.currentUser.uid, reporterName: state.userProfile.username, createdAt: serverTimestamp() });
      showToast("✅ Signalement envoyé.", "success");
    } catch (e) { showToast("Erreur", "error"); }
  };

  // --- LOGIQUE ONGLETS ---
  const tabOpp = $('tab-opportunities');
  const floatOpp = $('btn-float-opp');
  const tabConf = $('tab-confessions');
  const tabEvent = $('tab-events');
  const floatEvent = $('btn-float-event');

  function resetTabs() {
    if($('tab-discovery')) $('tab-discovery').className = 'btn-secondary small';
    if($('tab-following')) $('tab-following').className = 'btn-secondary small';
    if($('tab-trending')) $('tab-trending').className = 'btn-secondary small';
    if(tabConf) { tabConf.className = 'btn-secondary small'; tabConf.style.background = ''; }
    if(tabOpp) { tabOpp.className = 'btn-secondary small'; tabOpp.style.background = ''; }
    if(tabEvent) { tabEvent.className = 'btn-secondary small'; tabEvent.style.background = ''; }
    if(floatOpp) floatOpp.style.display = 'none';
    if(floatEvent) floatEvent.style.display = 'none';
    if($('post-creation-container')) $('post-creation-container').style.display = 'none';
    if($('top-hashtags-container')) $('top-hashtags-container').style.display = 'none';
  }

  if(tabOpp) {
    tabOpp.addEventListener('click', () => {
      resetTabs();
      state.currentFeedMode = 'opportunities';
      tabOpp.className = 'btn-primary small';
      tabOpp.style.background = '#10b981';
      if(floatOpp) floatOpp.style.display = 'flex';
      loadGlobalFeed(true);
    });
  }

  if(floatOpp) {
    floatOpp.onclick = () => { if($('modal-opportunity')) $('modal-opportunity').classList.remove('hidden'); };
  }

  if($('btn-cancel-opp')) $('btn-cancel-opp').addEventListener('click', () => $('modal-opportunity').classList.add('hidden'));

  if($('btn-publish-opp')) {
    $('btn-publish-opp').addEventListener('click', async () => {
      const title = $('opp-title').value.trim();
      const desc = $('opp-desc').value.trim();
      const city = $('opp-city').value.trim();
      const type = $('opp-type').value;
      
      if (!title || !desc || !city) return showToast("Remplissez tous les champs.", "error");
      
      const userCoins = state.userProfile.coins || 0;
      if (userCoins < 5 && state.userProfile.role !== 'admin') return showToast("❌ Besoin de 5 🪙 Nexus Coins.", "error");

      $('btn-publish-opp').textContent = "Publication..."; $('btn-publish-opp').disabled = true;

      try {
        if (state.userProfile.role !== 'admin') {
          await updateDoc(doc(db, 'users', state.currentUser.uid), { coins: userCoins - 5 });
          state.userProfile.coins = userCoins - 5;
        }
        await addDoc(collection(db, 'posts'), {
          postType: 'opportunity', oppTitle: title, oppCity: city, oppType: type, content: desc, oppContact: "Message privé",
          authorId: state.currentUser.uid, authorName: state.userProfile.username, authorIsPremium: state.userProfile.isPremium || false,
          createdAt: serverTimestamp(), likes: [], commentsCount: 0
        });
        showToast("✅ Annonce publiée ! (-5 🪙)");
        $('modal-opportunity').classList.add('hidden');
        $('opp-title').value = ''; $('opp-desc').value = ''; $('opp-city').value = '';
        if(tabOpp) tabOpp.click();
      } catch (e) { showToast("Erreur : " + e.message, "error"); } 
      finally { $('btn-publish-opp').textContent = "Publier l'annonce (Coût: 5 🪙)"; $('btn-publish-opp').disabled = false; }
    });
  }

  if(tabConf) {
    tabConf.addEventListener('click', () => {
      resetTabs();
      state.currentFeedMode = 'confessions';
      tabConf.className = 'btn-primary small';
      tabConf.style.background = '#6366f1';
      if($('post-creation-container')) $('post-creation-container').style.display = 'flex';
      loadGlobalFeed(true);
    });
  }

  if(tabEvent) {
    tabEvent.addEventListener('click', () => {
      resetTabs();
      state.currentFeedMode = 'events';
      tabEvent.className = 'btn-primary small';
      tabEvent.style.background = '#f59e0b';
      if(floatEvent) floatEvent.style.display = 'flex';
      loadGlobalFeed(true);
    });
  }

  if(floatEvent) {
    floatEvent.onclick = () => { if($('modal-event')) $('modal-event').classList.remove('hidden'); };
  }

  if($('btn-cancel-event')) $('btn-cancel-event').addEventListener('click', () => $('modal-event').classList.add('hidden'));

  if($('btn-publish-event')) {
    $('btn-publish-event').addEventListener('click', async () => {
      const title = $('event-title').value.trim();
      const date = $('event-date').value;
      const location = $('event-location').value.trim();
      const desc = $('event-desc').value.trim();
      
      if (!title || !date || !location) return showToast("Remplissez le titre, la date et le lieu.", "error");
      
      const userCoins = state.userProfile.coins || 0;
      if (userCoins < 10 && state.userProfile.role !== 'admin') return showToast("❌ Besoin de 10 🪙 pour créer un événement.", "error");

      $('btn-publish-event').textContent = "Publication..."; $('btn-publish-event').disabled = true;

      try {
        if (state.userProfile.role !== 'admin') {
          await updateDoc(doc(db, 'users', state.currentUser.uid), { coins: userCoins - 10 });
          state.userProfile.coins = userCoins - 10;
        }
        await addDoc(collection(db, 'posts'), {
          postType: 'event', eventTitle: title, eventDate: date, eventLocation: location, content: desc, eventAttendees: [state.currentUser.uid],
          authorId: state.currentUser.uid, authorName: state.userProfile.username, authorIsPremium: state.userProfile.isPremium || false,
          createdAt: serverTimestamp()
        });
        showToast("✅ Événement créé ! (-10 🪙)");
        $('modal-event').classList.add('hidden');
        $('event-title').value = ''; $('event-date').value = ''; $('event-location').value = ''; $('event-desc').value = '';
        if(tabEvent) tabEvent.click();
      } catch (e) { showToast("Erreur : " + e.message, "error"); } 
      finally { $('btn-publish-event').textContent = "Créer l'événement"; $('btn-publish-event').disabled = false; }
    });
  }

  window.toggleAttendEvent = async (postId, isAttending) => {
    try {
      const ref = doc(db, 'posts', postId);
      if (isAttending) { await updateDoc(ref, { eventAttendees: arrayRemove(state.currentUser.uid) }); } 
      else { await updateDoc(ref, { eventAttendees: arrayUnion(state.currentUser.uid) }); }
      loadGlobalFeed(true);
    } catch(e) { showToast("Erreur", "error"); }
  };

  // --- SONDAGES ---
  if($('btn-create-poll')) {
    $('btn-create-poll').addEventListener('click', () => {
      if (!state.userProfile.isPremium && state.userProfile.role !== 'admin') return showToast("❌ Devenez Premium pour créer des sondages.", "error");
      $('modal-poll').classList.remove('hidden');
    });
  }
  if($('btn-cancel-poll')) $('btn-cancel-poll').addEventListener('click', () => $('modal-poll').classList.add('hidden'));

  if($('btn-publish-poll')) {
    $('btn-publish-poll').addEventListener('click', async () => {
      const question = $('poll-question').value.trim();
      const options = [$('poll-opt-1').value.trim(), $('poll-opt-2').value.trim(), $('poll-opt-3').value.trim(), $('poll-opt-4').value.trim()].filter(o => o !== '');
      if (!question || options.length < 2) return showToast("Remplissez la question et au moins 2 options.", "error");
      try {
        await addDoc(collection(db, 'posts'), { postType: 'poll', pollQuestion: question, pollOptions: options, pollVotes: [], authorId: state.currentUser.uid, authorName: state.userProfile.username, authorPhoto: state.userProfile.photoURL || "", authorIsPremium: state.userProfile.isPremium || false, createdAt: serverTimestamp() });
        showToast("✅ Sondage publié !");
        $('modal-poll').classList.add('hidden');
        $('poll-question').value = ''; $('poll-opt-1').value = ''; $('poll-opt-2').value = ''; $('poll-opt-3').value = ''; $('poll-opt-4').value = '';
        loadGlobalFeed(true);
      } catch (e) { showToast("Erreur : " + e.message, "error"); }
    });
  }

  window.votePoll = async (postId, optionIndex) => {
    try {
      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);
      if (!postSnap.exists()) return;
      const data = postSnap.data();
      let votes = data.pollVotes || [];
      votes = votes.filter(v => v.userId !== state.currentUser.uid);
      votes.push({ userId: state.currentUser.uid, optionIndex });
      await updateDoc(postRef, { pollVotes: votes });
      const newHtml = generatePostHTML({ id: postId, data: { ...data, pollVotes: votes }, exists: () => true });
      const oldEl = document.getElementById(`post-${postId}`);
      if (oldEl) oldEl.outerHTML = newHtml;
    } catch (e) { showToast("Erreur : " + e.message, "error"); }
  };
}
