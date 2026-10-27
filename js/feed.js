// --- js/feed.js ---
import { db, state } from './state.js';
import { $, timeAgo, uploadFile, speakText, translateText, toggleMoreMenu, sharePost, showToast, formatPostText } from './utils.js';
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

async function loadSuggestedUsers() {
  const container = $('suggested-users-container');
  const list = $('suggested-users-list');
  if(!container || !list) return;
  
  if (state.currentFeedMode !== 'discovery') {
    container.style.display = 'none';
    return;
  }
  
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(10)));
    let html = '';
    let count = 0;
    
    snap.forEach(d => {
      if (count >= 3) return;
      if (d.id === state.currentUser.uid) return;
      if (state.userProfile.following?.includes(d.id)) return;
      
      const u = d.data();
      const avatar = u.photoURL ? `<img src="${u.photoURL}" class="tg-avatar">` : `<div class="tg-avatar">${u.username[0].toUpperCase()}</div>`;
      
      html += `
        <div class="tg-item" style="padding: 8px 12px;">
          ${avatar}
          <div class="tg-content" onclick="window.openUserProfile('${d.id}')" style="cursor:pointer;">
            <div class="tg-title">${u.username} ${u.role === 'admin' ? '👑' : ''}</div>
            <div class="tg-subtitle">${u.bio || 'Nouveau sur BlueNexus'}</div>
          </div>
          <button onclick="window.followFromSuggestion('${d.id}', this)" class="btn-primary small" style="padding: 4px 8px; font-size: 0.75rem;">Suivre</button>
        </div>
      `;
      count++;
    });
    
    if (count > 0) {
      list.innerHTML = html;
      container.style.display = 'block';
    } else {
      container.style.display = 'none';
    }
  } catch(e) { console.error("Erreur suggestions:", e); }
}

window.followFromSuggestion = async (userId, btn) => {
  try {
    await updateDoc(doc(db, 'users', state.currentUser.uid), { following: arrayUnion(userId) });
    if(!state.userProfile.following) state.userProfile.following = [];
    state.userProfile.following.push(userId);
    btn.textContent = "Suivi ✅";
    btn.className = "btn-secondary small";
    btn.disabled = true;
    showToast("✅ Vous suivez ce profil !");
  } catch(e) { showToast("Erreur", "error"); }
};

export async function loadGlobalFeed(reset = false) {
  const list = $('global-feed-list');
  if (!list) return;
  
  if (reset) {
    list.innerHTML = `<div class="skeleton-post"><div class="skeleton-line short"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div><div class="skeleton-post"><div class="skeleton-line short"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>`;
    state.lastVisiblePost = null;
    noMorePosts = false;
    loadSuggestedUsers();
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
      list.innerHTML = '<p class="muted" style="padding: 1rem; text-align: center;">Aucune publication pour le moment.</p>';
      noMorePosts = true;
      return;
    }
    if (reset) list.innerHTML = '';
    if (snap.docs.length > 0) state.lastVisiblePost = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < 50) noMorePosts = true;
    
    let postsToShow = snap.docs.map(d => ({ id: d.id, data: d.data(), ref: d }));
    
    // --- CORRECTION ICI : On ne garde QUE les posts globaux ---
    // On filtre les posts qui n'ont pas de communityId ou qui ont communityId === 'global'
    postsToShow = postsToShow.filter(p => p.data.communityId === 'global' || !p.data.communityId);

    postsToShow.forEach(p => { p.score = calculatePostScore(p.data); });
    postsToShow.sort((a, b) => b.score - a.score);

    if (state.currentFeedMode === 'following') {
      postsToShow = postsToShow.filter(p => {
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
        const isMe = p.data.authorId === state.currentUser.uid;
        const isUserFollowed = state.userProfile?.following?.includes(p.data.authorId) || false;
        const isPageFollowed = (p.data.pageId && state.userProfile?.following?.includes(p.data.pageId)) || false;
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
    list.innerHTML = `<p class="muted" style="color:#ef4444; padding: 1rem;">Erreur : ${error.message}</p>`;
  } finally {
    isFetchingFeed = false;
  }
}

export function generatePostHTML(docSnap) {
  const p = docSnap.data();
  const avatar = p.authorPhoto ? `<img src="${p.authorPhoto}" class="post-avatar" loading="lazy">` : `<div class="post-avatar">${p.authorName[0].toUpperCase()}</div>`;
  const isLiked = p.likes?.includes(state.currentUser.uid);
  const likeCount = p.likes?.length || 0;
  const formattedContent = formatPostText(p.content);
  let mediaHtml = '';
  if (p.mediaUrl) {
    if (p.mediaType === 'image') mediaHtml = `<img src="${p.mediaUrl}" class="post-media" loading="lazy">`;
    else if (p.mediaType === 'video') mediaHtml = `<video src="${p.mediaUrl}" controls class="post-media" preload="metadata"></video>`;
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
  
  return `<div class="media-item" id="post-${docSnap.id}" ondblclick="window.doubleTapLike('${docSnap.id}', '${p.authorId}', ${isLiked})"><div class="heart-animation" id="heart-${docSnap.id}">❤️</div><div class="post-header"><div style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="window.openUserProfile('${p.authorId}')">${avatar} <div><strong>@${p.authorName}</strong>${pageBadge}</div></div><span class="post-time">${timeAgo(p.createdAt)}</span></div><p id="text-${docSnap.id}">${formattedContent}</p>${mediaHtml}<div class="post-actions"><button id="like-btn-${docSnap.id}" onclick="window.likePost('${docSnap.id}', '${p.authorId}', ${isLiked})" class="action-btn" style="color:${isLiked?'var(--blue-light)':'var(--text)'};"><span id="like-icon-${docSnap.id}">${isLiked?'💙':'🤍'}</span> <span id="like-count-${docSnap.id}">${likeCount}</span></button><button onclick="window.toggleComments('${docSnap.id}')" class="action-btn">💬 ${p.commentsCount || 0}</button><button onclick="window.sharePost('${docSnap.id}')" class="action-btn" title="Partager">📤</button><div class="more-menu-container"><button onclick="window.toggleMoreMenu('${docSnap.id}')" class="action-btn">⋮</button><div id="more-menu-${docSnap.id}" class="more-menu"><button onclick="window.speakText('text-${docSnap.id}'); window.toggleMoreMenu('${docSnap.id}')">🔊 Écouter</button><button onclick="window.translateText('text-${docSnap.id}'); window.toggleMoreMenu('${docSnap.id}')">🌐 Traduire</button>${saveBtn}${pinBtn}${reportBtn}${deleteBtn}</div></div></div><div id="comments-section-${docSnap.id}" class="comments-section" style="display: none;"><div id="comments-list-${docSnap.id}"><p class="muted" style="font-size: 0.8rem;">Chargement...</p></div><div class="comment-input-row"><input type="text" id="comment-input-${docSnap.id}" placeholder="Commenter..."><button onclick="window.addComment('${docSnap.id}', '${p.authorId}')" class="btn-primary small">Envoyer</button></div></div></div>`;
}

export async function populatePageSelector() {
  const select = $('post-as-select');
  if (!select) return;
  const q = query(collection(db, 'pages'), where('ownerId', '==', state.currentUser.uid));
  const snap = await getDocs(q);
  select.innerHTML = '<option value="user">👤 Publier en tant que moi</option>';
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
    if (select && select.value !== 'user') { pageId = select.value; pageName = select.options[select.selectedIndex].dataset.pageName; }
    if (!content && !file) return;
    publishBtn.textContent = "Publication...";
    let mediaUrl = null, mediaType = null;
    if (file) {
      mediaUrl = await uploadFile(file);
      if (file.type.startsWith('image')) mediaType = 'image';
      else if (file.type.startsWith('video')) mediaType = 'video';
      else mediaType = 'audio';
    }
    await addDoc(collection(db, 'posts'), { communityId: 'global', communityType: 'global', content, authorId: state.currentUser.uid, authorName: state.userProfile.username, authorPhoto: state.userProfile.photoURL || "", mediaUrl, mediaType, likes: [], commentsCount: 0, createdAt: serverTimestamp(), pageId: pageId, pageName: pageName });
    $('global-post-content').value = '';
    $('global-post-content').style.height = '40px';
    localStorage.removeItem('bluenexus_draft_global');
    $('global-post-file').value = '';
    $('global-file-preview').innerHTML = '';
    $('global-file-preview').classList.add('hidden');
    if (select) select.value = 'user';
    publishBtn.textContent = "Publier";
    publishBtn.disabled = true;
    showToast("✅ Publication réussie !", "success");
    
    if (state.currentFeedMode === 'discovery') {
      if($('tab-following')) $('tab-following').click();
    } else {
      loadGlobalFeed(true);
    }
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
    const btn = document.querySelector(`#more-menu-${postId} button:nth-child(3)`);
    if (btn) btn.textContent = isSaved ? '🔖 Sauvegarder' : '🔖 Retirer des favoris';
  };
  window.likePost = async (postId, authorId, isLiked) => {
    const ref = doc(db, 'posts', postId);
    const iconEl = $(`like-icon-${postId}`), countEl = $(`like-count-${postId}`), btnEl = $(`like-btn-${postId}`);
    let currentCount = parseInt(countEl.textContent) || 0;
    if (isLiked) { iconEl.textContent = '🤍'; countEl.textContent = Math.max(0, currentCount - 1); btnEl.style.color = 'var(--text)'; }
    else { iconEl.textContent = '💙'; countEl.textContent = currentCount + 1; btnEl.style.color = 'var(--blue-light)'; }
    try {
      if (isLiked) {
        await updateDoc(ref, { likes: arrayRemove(state.currentUser.uid) });
      } else {
        await updateDoc(ref, { likes: arrayUnion(state.currentUser.uid) });
        if (authorId !== state.currentUser.uid) {
          await sendNotification(authorId, "a aimé votre publication.");
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
        await sendNotification(authorId, "a commenté votre publication : " + content.substring(0, 30) + (content.length > 30 ? "..." : ""));
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
    if (!dupSnap.empty) {
      showToast("Vous avez déjà signalé ce post.", "error");
      return;
    }
    let modal = $('modal-report');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-report';
      modal.className = 'modal hidden';
      modal.innerHTML = `<div class="modal-content"><h3 style="margin-bottom:1rem;">🚨 Signaler ce post</h3><p class="muted" style="margin-bottom:1rem; font-size:0.85rem;">Choisissez un motif. Un administrateur examinera votre signalement.</p><div id="report-reasons" style="display:flex; flex-direction:column; gap:8px; margin-bottom:1rem;"><button class="btn-secondary" data-reason="Contenu haineux ou discriminatoire" style="text-align:left;">🚫 Contenu haineux ou discriminatoire</button><button class="btn-secondary" data-reason="Harcèlement" style="text-align:left;">😠 Harcèlement</button><button class="btn-secondary" data-reason="Spam ou contenu trompeur" style="text-align:left;">📢 Spam ou contenu trompeur</button><button class="btn-secondary" data-reason="Violence ou contenu choquant" style="text-align:left;">⚠️ Violence ou contenu choquant</button><button class="btn-secondary" data-reason="Autre" style="text-align:left;">❓ Autre</button></div><button id="btn-cancel-report" class="btn-secondary" style="width:100%;">Annuler</button></div>`;
      document.body.appendChild(modal);
      $('btn-cancel-report').addEventListener('click', () => modal.classList.add('hidden'));
      modal.querySelectorAll('#report-reasons button').forEach(btn => {
        btn.addEventListener('click', () => {
          window.submitReport(postId, btn.dataset.reason);
          modal.classList.add('hidden');
        });
      });
    }
    modal.classList.remove('hidden');
  };
  window.submitReport = async (postId, reason) => {
    try {
      await addDoc(collection(db, 'reports'), { postId: postId, reason: reason, reporterId: state.currentUser.uid, reporterName: state.userProfile.username, createdAt: serverTimestamp() });
      showToast("✅ Signalement envoyé. Merci !", "success");
    } catch (e) { showToast("Erreur lors du signalement : " + e.message, "error"); }
  };
}
