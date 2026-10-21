import { db, state } from './state.js';
import { $, timeAgo, uploadFile, speakText, translateText, toggleMoreMenu, sharePost, showToast } from './utils.js';
import { collection, addDoc, query, orderBy, limit, startAfter, getDocs, doc, updateDoc, arrayUnion, arrayRemove, getDoc, deleteDoc, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

let isFetchingFeed = false;
let noMorePosts = false;

export async function loadGlobalFeed(reset = false) {
  const list = $('global-feed-list');
  if(!list) return;
  
  if (reset) {
    list.innerHTML = `
      <div class="skeleton-post"><div class="skeleton-line short"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>
      <div class="skeleton-post"><div class="skeleton-line short"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>
    `;
    state.lastVisiblePost = null;
    noMorePosts = false;
  }

  if (noMorePosts || isFetchingFeed) return;
  isFetchingFeed = true;
  
  let q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(20));
  if (state.lastVisiblePost && !reset) {
    q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), startAfter(state.lastVisiblePost), limit(20));
  }

  try {
    const snap = await getDocs(q);
    
    if (snap.empty && reset) {
      list.innerHTML = '<p class="muted">Aucun message.</p>';
      noMorePosts = true;
      return;
    }
    
    if (reset) list.innerHTML = '';
    
    if (snap.docs.length > 0) {
      state.lastVisiblePost = snap.docs[snap.docs.length - 1];
    }
    
    if (snap.docs.length < 20) {
      noMorePosts = true;
    }
    
    let postsToShow = snap.docs;
    
    if (state.currentFeedMode === 'following') {
      postsToShow = snap.docs.filter(d => state.userProfile.following.includes(d.data().authorId));
      if(postsToShow.length === 0 && reset) {
        list.innerHTML = '<p class="muted">Abonnez-vous à des personnes pour voir leurs posts ici !</p>';
      }
    }

    postsToShow.forEach(d => { list.innerHTML += generatePostHTML(d); });

  } catch (error) {
    console.error("Erreur de chargement du feed:", error);
  } finally {
    isFetchingFeed = false;
  }
}

export function generatePostHTML(docSnap) {
  const p = docSnap.data();
  const avatar = p.authorPhoto ? `<img src="${p.authorPhoto}" class="post-avatar" loading="lazy">` : `<div class="post-avatar">${p.authorName[0].toUpperCase()}</div>`;
  const isLiked = p.likes?.includes(state.currentUser.uid);
  const likeCount = p.likes?.length || 0;
  
  let mediaHtml = '';
  if (p.mediaUrl) {
    if (p.mediaType === 'image') mediaHtml = `<img src="${p.mediaUrl}" class="post-media" loading="lazy">`;
    else if (p.mediaType === 'video') mediaHtml = `<video src="${p.mediaUrl}" controls class="post-media" preload="metadata"></video>`;
    else if (p.mediaType === 'audio') mediaHtml = `<audio src="${p.mediaUrl}" controls style="width:100%; margin-top:10px;" preload="metadata"></audio>`;
  }

  const isPinned = state.userProfile.pinned && state.userProfile.pinned.includes(docSnap.id);
  const pinBtn = (p.authorId === state.currentUser.uid) ? `<button onclick="window.togglePin('${docSnap.id}', ${isPinned}); window.toggleMoreMenu('${docSnap.id}')">${isPinned ? '📌 Désépingler' : '📍 Épingler'}</button>` : '';
  const canDelete = (p.authorId === state.currentUser.uid) || (state.currentCommunityId && state.userProfile.username === state.currentCommunityOwner);
  const deleteBtn = canDelete ? `<button onclick="window.deletePost('${docSnap.id}')" style="color:#ff6b6b;">🗑️ Supprimer</button>` : '';

  return `<div class="media-item" id="post-${docSnap.id}" ondblclick="window.doubleTapLike('${docSnap.id}', '${p.authorId}', ${isLiked})">
    <div class="heart-animation" id="heart-${docSnap.id}">❤️</div>
    
    <div class="post-header">
      <div style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="window.openUserProfile('${p.authorId}')">
        ${avatar} <strong>@${p.authorName}</strong>
      </div>
      <span class="post-time">${timeAgo(p.createdAt)}</span>
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

export function initFeed() {
  if($('btn-global-attach')) $('btn-global-attach').addEventListener('click', () => $('global-post-file').click());
  
  if($('global-post-file')) {
    $('global-post-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      const previewContainer = $('global-file-preview');
      
      if (!file) {
        previewContainer.innerHTML = '';
        previewContainer.classList.add('hidden');
        return;
      }

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
      removeBtn.onclick = () => {
        $('global-post-file').value = ''; 
        previewContainer.innerHTML = '';
        previewContainer.classList.add('hidden');
      };
      previewContainer.appendChild(removeBtn);
    });
  }
  
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
      authorId: state.currentUser.uid, authorName: state.userProfile.username, authorPhoto: state.userProfile.photoURL || "",
      mediaUrl, mediaType, likes: [], commentsCount: 0, createdAt: serverTimestamp()
    });
    
    $('global-post-content').value = ''; 
    $('global-post-file').value = '';
    $('global-file-preview').innerHTML = '';
    $('global-file-preview').classList.add('hidden');
    
    $('btn-global-publish').textContent = "Publier";
    showToast("✅ Publication réussie !", "success");
    loadGlobalFeed(true);
  });

  if($('btn-refresh-feed')) $('btn-refresh-feed').addEventListener('click', () => {
    $('btn-refresh-feed').textContent = "⏳";
    loadGlobalFeed(true);
    setTimeout(() => { $('btn-refresh-feed').textContent = "🔄"; }, 1000);
  });

  const sentinel = $('feed-sentinel');
  if (sentinel) {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && $('view-home').classList.contains('active')) {
        loadGlobalFeed(false);
      }
    }, { rootMargin: '200px' });
    observer.observe(sentinel);
  }

  // --- LOGIQUE DU BOUTON RETOUR EN HAUT ---
  const btnBackToTop = $('btn-back-to-top');
  if (btnBackToTop) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        btnBackToTop.classList.add('show');
      } else {
        btnBackToTop.classList.remove('show');
      }
    });
    btnBackToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // --- LOGIQUE DU DOUBLE TAP ---
  window.doubleTapLike = async (postId, authorId, isLiked) => {
    // Animation du cœur
    const heart = $(`heart-${postId}`);
    if (heart) {
      heart.classList.add('animate');
      setTimeout(() => heart.classList.remove('animate'), 600);
    }
    
    // Si ce n'est pas déjà liké, on like
    if (!isLiked) {
      window.likePost(postId, authorId, false);
    }
  };

  window.likePost = async (postId, authorId, isLiked) => {
    const ref = doc(db, 'posts', postId);
    const iconEl = $(`like-icon-${postId}`), countEl = $(`like-count-${postId}`), btnEl = $(`like-btn-${postId}`);
    let currentCount = parseInt(countEl.textContent) || 0;

    if (isLiked) { iconEl.textContent = '🤍'; countEl.textContent = Math.max(0, currentCount - 1); btnEl.style.color = 'var(--text)'; }
    else { iconEl.textContent = '💙'; countEl.textContent = currentCount + 1; btnEl.style.color = 'var(--blue-light)'; }

    try {
      if (isLiked) await updateDoc(ref, { likes: arrayRemove(state.currentUser.uid) });
      else await updateDoc(ref, { likes: arrayUnion(state.currentUser.uid) });
      btnEl.setAttribute('onclick', `window.likePost('${postId}', '${authorId}', ${!isLiked})`);
    } catch(e) { 
      if (isLiked) { iconEl.textContent = '💙'; countEl.textContent = currentCount + 1; }
      else { iconEl.textContent = '🤍'; countEl.textContent = currentCount - 1; }
    }
  };

  window.deletePost = async (postId) => {
    if(confirm("Supprimer ce message ?")) {
      await deleteDoc(doc(db, 'posts', postId));
      const el = document.getElementById(`post-${postId}`);
      if(el) el.remove();
      showToast("🗑️ Post supprimé.", "error");
    }
  };

  window.toggleComments = (postId) => {
    const section = $(`comments-section-${postId}`);
    if(!section) return;
    if (section.style.display === 'none') { section.style.display = 'block'; window.loadComments(postId); }
    else { section.style.display = 'none'; }
  };

  window.loadComments = async (postId) => {
    const list = $(`comments-list-${postId}`);
    if(!list) return;
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
    if(!input) return;
    const content = input.value.trim();
    if (!content) return;
    input.value = ''; 
    try {
      await addDoc(collection(db, 'comments'), { postId, content, authorId: state.currentUser.uid, authorName: state.userProfile.username, createdAt: Date.now() });
      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);
      if(postSnap.exists()) {
        await updateDoc(postRef, { commentsCount: (postSnap.data().commentsCount || 0) + 1 });
      }
      window.loadComments(postId); 
    } catch(e) { alert("Erreur : " + e.message); }
  };

  window.togglePin = async (postId, isPinned) => {
    const ref = doc(db, 'users', state.currentUser.uid);
    if (isPinned) { await updateDoc(ref, { pinned: arrayRemove(postId) }); state.userProfile.pinned = state.userProfile.pinned.filter(id => id !== postId); } 
    else { await updateDoc(ref, { pinned: arrayUnion(postId) }); if(!state.userProfile.pinned) state.userProfile.pinned = []; state.userProfile.pinned.push(postId); }
    if($('view-profile').classList.contains('active') && window.renderProfile) window.renderProfile();
  };
}
