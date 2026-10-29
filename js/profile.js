// --- js/profile.js ---
import { db, state } from './state.js'; 
import { $, uploadFile, showToast } from './utils.js'; 
import { switchView } from './navigation.js'; 
import { generatePostHTML } from './feed.js'; 
import { sendNotification } from './notifications.js'; 
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

let viewingUserId = null; 

export function renderProfile() { 
  if (!state.userProfile || !state.currentUser) return; 
  viewingUserId = state.currentUser.uid; 
  displayProfileData(state.userProfile, true, viewingUserId); 
}

export async function openUserProfile(userId) { 
  if (!state.currentUser) return; 
  viewingUserId = userId; 
  
  // NOUVEAU : Logger la visite si ce n'est pas soi-même
  if (userId !== state.currentUser.uid) {
    logProfileView(userId);
  }
  
  if (userId === state.currentUser.uid) { displayProfileData(state.userProfile, true, userId); } 
  else { const snap = await getDoc(doc(db, 'users', userId)); if (snap.exists()) { displayProfileData(snap.data(), false, userId); } } 
  switchView('profile'); 
}

// NOUVELLE FONCTION : Enregistrer une visite
async function logProfileView(viewedId) {
  if (!state.currentUser) return;
  try {
    const viewerRef = doc(db, 'users', viewedId, 'profile_views', state.currentUser.uid);
    await setDoc(viewerRef, {
      viewerId: state.currentUser.uid,
      viewedAt: serverTimestamp()
    }, { merge: true });
  } catch(e) { console.error("Erreur log view:", e); }
}

// NOUVELLE FONCTION : Ouvrir la modale des visiteurs
window.openProfileViewers = async () => {
  if (!state.currentUser) return;
  const modal = $('modal-profile-viewers');
  const container = $('viewers-list-container');
  if (!modal || !container) return;
  
  modal.classList.remove('hidden');
  container.innerHTML = '<p class="muted" style="text-align: center;">Chargement...</p>';
  
  try {
    const viewsSnap = await getDocs(collection(db, 'users', state.currentUser.uid, 'profile_views'));
    
    if (viewsSnap.empty) {
      container.innerHTML = '<p class="muted" style="text-align: center; padding: 2rem;">Personne n\'a encore vu votre profil. Soyez patient !</p>';
      return;
    }
    
    const views = viewsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    views.sort((a, b) => {
      const tA = a.viewedAt?.toMillis ? a.viewedAt.toMillis() : 0;
      const tB = b.viewedAt?.toMillis ? b.viewedAt.toMillis() : 0;
      return tB - tA;
    });
    
    const isPremium = state.userProfile.isPremium || state.userProfile.role === 'admin';
    
    let html = '';
    if (!isPremium) {
      html += `<div style="background: rgba(168, 85, 247, 0.1); border: 1px solid #a855f7; padding: 10px; border-radius: 8px; margin-bottom: 1rem; text-align: center;">
        <p style="color: #a855f7; font-weight: bold; font-size: 0.9rem; margin-bottom: 5px;">✨ Passez Premium pour voir qui vous rend visite</p>
        <p class="muted" style="font-size: 0.75rem;">Vous voyez seulement ${views.length} visiteurs floutés.</p>
      </div>`;
    }
    
    for (const view of views.slice(0, 50)) {
      try {
        const uSnap = await getDoc(doc(db, 'users', view.viewerId));
        if (uSnap.exists()) {
          const u = uSnap.data();
          const avatar = u.photoURL ? `<img src="${u.photoURL}" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover; ${!isPremium ? 'filter: blur(8px);' : ''}">` : `<div style="width: 45px; height: 45px; border-radius: 50%; background: var(--blue); display: flex; align-items: center; justify-content: center; font-weight: bold; ${!isPremium ? 'filter: blur(8px);' : ''}">${u.username[0].toUpperCase()}</div>`;
          
          const timeAgoText = view.viewedAt ? timeAgoFromDate(view.viewedAt) : "Récemment";
          
          html += `
            <div class="tg-item" ${isPremium ? `onclick="document.getElementById('modal-profile-viewers').classList.add('hidden'); window.openUserProfile('${view.viewerId}')"` : ''} style="cursor: ${isPremium ? 'pointer' : 'default'};">
              ${avatar}
              <div class="tg-content">
                <div class="tg-title" style="${!isPremium ? 'filter: blur(6px); user-select: none;' : ''}">${isPremium ? u.username : '████████'}</div>
                <div class="tg-subtitle">${timeAgoText}</div>
              </div>
              ${u.isPremium ? '<span style="color: #a855f7;">💎</span>' : ''}
            </div>
          `;
        }
      } catch(e) { console.error(e); }
    }
    
    container.innerHTML = html;
  } catch(e) {
    console.error(e);
    container.innerHTML = '<p class="muted" style="text-align: center; color: #ef4444;">Erreur de chargement.</p>';
  }
};

function timeAgoFromDate(timestamp) {
  if (!timestamp) return "Récemment";
  const diff = Date.now() - (timestamp.toMillis ? timestamp.toMillis() : timestamp);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Il y a ${Math.max(1, mins)} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  return `Il y a ${Math.floor(hours / 24)}j`;
}

async function displayProfileData(profile, isMe, targetId) { 
  if(viewingUserId !== targetId) return; 
  
  if($('profile-name')) $('profile-name').textContent = profile.username; 
  if($('profile-bio')) $('profile-bio').textContent = profile.bio || 'Aucune bio.'; 
  if($('about-username')) $('about-username').textContent = profile.username; 
  if($('about-bio')) $('about-bio').textContent = profile.bio || 'Aucune bio.'; 
  
  // --- NEXUS COINS ---
  if($('profile-coins')) $('profile-coins').textContent = profile.coins || 0;

  // --- GESTION DE L'AVATAR ---
  const av = $('profile-avatar'); 
  if (av) { 
    if (profile.photoURL) { av.style.backgroundImage = `url(${profile.photoURL})`; av.textContent = ''; } 
    else { av.style.backgroundImage = 'none'; av.textContent = profile.username[0].toUpperCase(); } 
  } 

  // --- EFFET DE PROFIL ---
  const avatarWrapper = $('profile-avatar-wrapper');
  const bannerContainer = $('profile-banner');
  
  if (avatarWrapper) avatarWrapper.className = 'avatar-effect-container';
  if (bannerContainer) bannerContainer.className = 'fb-banner';

  if (profile.profileEffect && profile.profileEffect !== 'none') {
    if (avatarWrapper) avatarWrapper.classList.add(`effect-${profile.profileEffect}`);
    if (bannerContainer) bannerContainer.classList.add(`effect-${profile.profileEffect}`);
  }

  // --- BANNIÈRE ---
  if (bannerContainer) {
    if (profile.bannerURL) bannerContainer.style.backgroundImage = `url(${profile.bannerURL})`;
    else bannerContainer.style.backgroundImage = 'linear-gradient(135deg, var(--blue), #0a0e1a)';
  }

  // --- BADGES ---
  let badgesHtml = (profile.badges || []).map(b => `<span class="badge-item">${b}</span>`).join(''); 
  if (profile.role === 'admin') { badgesHtml = `<span class="badge-item" style="background: linear-gradient(135deg, #ef4444, #b91c1c); border: 1px solid #fca5a5;">👑 Admin Suprême</span>` + badgesHtml; } 
  if (profile.isPremium) { badgesHtml = `<span class="badge-item" style="background: linear-gradient(135deg, #a855f7, #6b21a8); border: 1px solid #d8b4fe;">💎 Premium</span>` + badgesHtml; }
  if($('profile-badges')) $('profile-badges').innerHTML = badgesHtml; 
  
  // --- STATS & BOUTONS ---
  const postsQuery = query(collection(db, 'posts'), where('authorId', '==', targetId)); 
  const postsSnap = await getDocs(postsQuery); 
  if($('stat-posts')) $('stat-posts').textContent = postsSnap.docs.length; 
  if($('stat-followers')) $('stat-followers').textContent = profile.followers?.length || 0; 
  if($('stat-following')) $('stat-following').textContent = profile.following?.length || 0; 
  
  // --- COMPTEUR DE VISITEURS ---
  if (isMe) {
    try {
      const viewsSnap = await getDocs(collection(db, 'users', targetId, 'profile_views'));
      if($('stat-profile-views')) $('stat-profile-views').textContent = viewsSnap.size;
    } catch(e) { console.error("Erreur count views:", e); }
  } else {
    const viewsEl = document.querySelector('#stat-profile-views')?.parentElement?.parentElement;
    if (viewsEl) viewsEl.style.display = 'none';
  }

  const btnEdit = $('btn-edit-profile-trigger'); const btnFollow = $('btn-follow-user'); const favTab = $('tab-favorites-btn'); 
  if (isMe) { 
    if(btnEdit) btnEdit.style.display = 'block'; if(btnFollow) btnFollow.style.display = 'none'; if(favTab) favTab.style.display = 'block'; 
  } else { 
    if(btnEdit) btnEdit.style.display = 'none'; if(favTab) favTab.style.display = 'none'; 
    if(btnFollow) { 
      btnFollow.style.display = 'block'; 
      const isFollowing = state.userProfile.following?.includes(targetId); 
      btnFollow.textContent = isFollowing ? 'Se désabonner' : 'Suivre'; 
      btnFollow.className = isFollowing ? 'btn-secondary small' : 'btn-primary small'; 
      btnFollow.onclick = async () => { 
        if (isFollowing) { await updateDoc(doc(db, 'users', state.currentUser.uid), { following: arrayRemove(targetId) }); state.userProfile.following = state.userProfile.following.filter(id => id !== targetId); } 
        else { await updateDoc(doc(db, 'users', state.currentUser.uid), { following: arrayUnion(targetId) }); if(!state.userProfile.following) state.userProfile.following = []; state.userProfile.following.push(targetId); sendNotification(targetId, "s'est abonné à votre profil."); } 
        openUserProfile(targetId); 
      }; 
    } 
  } 
  
  // --- POSTS ---
  const postsContainer = $('profile-posts-list'); postsContainer.innerHTML = ''; 
  if (postsSnap.empty) { postsContainer.innerHTML = '<p class="muted" style="padding: 1rem;">Aucune publication pour le moment.</p>'; } 
  else { const sortedPosts = postsSnap.docs.sort((a, b) => { const timeA = a.data().createdAt?.toMillis() || 0; const timeB = b.data().createdAt?.toMillis() || 0; return timeB - timeA; }); sortedPosts.forEach(d => { postsContainer.innerHTML += generatePostHTML(d); }); } 
  
  // --- PAGES ---
  const pagesContainer = $('profile-pages-list'); pagesContainer.innerHTML = ''; 
  const pagesQuery = query(collection(db, 'pages'), where('ownerId', '==', targetId)); 
  const pagesSnap = await getDocs(pagesQuery); 
  if (pagesSnap.empty) { pagesContainer.innerHTML = '<p class="muted" style="padding: 1rem;">Aucune page créée.</p>'; } 
  else { pagesSnap.forEach(d => { const p = d.data(); pagesContainer.innerHTML += `<div class="tg-item" onclick="window.openPage('${d.id}')"><div class="tg-avatar" style="background: var(--blue-light);">📄</div><div class="tg-content"><div class="tg-title">${p.name}</div><div class="tg-subtitle">${p.category.toUpperCase()} · ${p.followers.length} abonnés</div></div></div>`; }); } 
  
  // --- FAVORIS ---
  if (isMe) { 
    const favContainer = $('profile-favorites-list'); favContainer.innerHTML = ''; 
    if (!profile.savedPosts || profile.savedPosts.length === 0) { favContainer.innerHTML = '<p class="muted" style="padding: 1rem;">Vous n\'avez aucun favori.</p>'; } 
    else { 
      favContainer.innerHTML = '<p class="muted" style="padding: 1rem;">Chargement...</p>'; 
      try { const postsPromises = profile.savedPosts.map(id => getDoc(doc(db, 'posts', id))); const postsDocs = await Promise.all(postsPromises); favContainer.innerHTML = ''; postsDocs.forEach(d => { if(d.exists()) { favContainer.innerHTML += generatePostHTML(d); } }); } 
      catch(e) { favContainer.innerHTML = '<p class="muted" style="padding: 1rem;">Erreur de chargement.</p>'; } 
    } 
  } 
}

export function initProfile() { 
  window.openUserProfile = openUserProfile; 
  window.renderProfile = renderProfile; 
  
  const tabPosts = $('btn-tab-posts'); const tabPages = $('btn-tab-pages'); const tabFav = $('tab-favorites-btn'); const tabAbout = $('btn-tab-about'); 
  
  function setActiveTab(tabId, contentId) { 
    [tabPosts, tabPages, tabFav, tabAbout].forEach(btn => { if(btn) btn.classList.remove('active'); }); 
    if($(tabId)) $(tabId).classList.add('active'); 
    ['posts', 'pages', 'favorites', 'about'].forEach(sec => { const el = $(`profile-tab-${sec}`); if(el) el.style.display = 'none'; }); 
    if($(contentId)) $(contentId).style.display = 'block'; 
  } 
  
  if(tabPosts) tabPosts.addEventListener('click', () => setActiveTab('btn-tab-posts', 'profile-tab-posts')); 
  if(tabPages) tabPages.addEventListener('click', () => setActiveTab('btn-tab-pages', 'profile-tab-pages')); 
  if(tabFav) tabFav.addEventListener('click', () => setActiveTab('tab-favorites-btn', 'profile-tab-favorites')); 
  if(tabAbout) tabAbout.addEventListener('click', () => setActiveTab('btn-tab-about', 'profile-tab-about')); 
  
  if($('btn-edit-profile-trigger')) {
    $('btn-edit-profile-trigger').addEventListener('click', () => {
      if ($('edit-profile-effect')) {
        $('edit-profile-effect').value = state.userProfile.profileEffect || 'none';
        
        const options = $('edit-profile-effect').querySelectorAll('option');
        options.forEach(opt => {
          if (opt.value !== 'none' && !state.userProfile.isPremium && state.userProfile.role !== 'admin') {
            opt.disabled = true;
            opt.textContent = opt.textContent.replace('✨', '🔒');
          } else {
            opt.disabled = false;
          }
        });
      }
      $('modal-profile').classList.remove('hidden');
    });
  }
  if($('btn-cancel-profile')) $('btn-cancel-profile').addEventListener('click', () => $('modal-profile').classList.add('hidden')); 
  
  if($('btn-save-profile')) $('btn-save-profile').addEventListener('click', async () => { 
    const file = $('edit-avatar').files[0]; 
    const bannerFile = $('edit-banner').files[0]; 
    const effect = $('edit-profile-effect') ? $('edit-profile-effect').value : 'none';
    
    if (effect !== 'none' && !state.userProfile.isPremium && state.userProfile.role !== 'admin') {
      showToast("❌ Devenez Premium pour utiliser les effets animés.", "error");
      return;
    }

    let photoURL = state.userProfile.photoURL; 
    let bannerURL = state.userProfile.bannerURL; 
    
    $('btn-save-profile').textContent = "Chargement..."; 
    $('btn-save-profile').disabled = true; 
    
    try { 
      if (file) photoURL = await uploadFile(file); 
      if (bannerFile) bannerURL = await uploadFile(bannerFile); 
      
      await updateDoc(doc(db, 'users', state.currentUser.uid), { 
        bio: $('edit-bio').value.trim(), 
        photoURL: photoURL,
        bannerURL: bannerURL,
        profileEffect: effect
      }); 
      
      state.userProfile.bio = $('edit-bio').value.trim(); 
      state.userProfile.photoURL = photoURL; 
      state.userProfile.bannerURL = bannerURL; 
      state.userProfile.profileEffect = effect;
      
      const createAvatar = $('create-post-avatar'); 
      if (createAvatar) { 
        if (photoURL) { createAvatar.style.backgroundImage = `url(${photoURL})`; createAvatar.textContent = ''; } 
        else { createAvatar.style.backgroundImage = 'none'; createAvatar.textContent = state.userProfile.username[0].toUpperCase(); } 
      } 
      
      $('modal-profile').classList.add('hidden'); 
      renderProfile(); 
      showToast("✅ Profil mis à jour !"); 
    } catch (e) { 
      console.error(e);
      showToast("Erreur d'envoi de l'image", "error"); 
    } finally { 
      $('btn-save-profile').textContent = "Enregistrer"; 
      $('btn-save-profile').disabled = false; 
    } 
  }); 
}
