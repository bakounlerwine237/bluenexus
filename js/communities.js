// --- js/communities.js ---
import { db, state } from './state.js'; 
import { $, showToast, uploadFile } from './utils.js'; 
import { switchView } from './navigation.js'; 
import { generatePostHTML } from './feed.js'; 
import { collection, addDoc, query, where, orderBy, getDocs, doc, getDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

let unsubscribeComm = null; 
let currentCommId = null;
let currentCommData = null;

export async function renderMyCommunities() { 
  const list = $('my-communities-list'); 
  list.innerHTML = '<p class="muted" style="padding: 1rem;">Chargement...</p>'; 
  $('my-communities-list').style.display = 'flex'; 
  if($('btn-discover-communities')) $('btn-discover-communities').style.display = 'block'; 
  $('discover-communities-section').style.display = 'none'; 
  
  // Uniquement les communautés où on est membre
  const q = query(collection(db, 'communities'), where('members', 'array-contains', state.currentUser.uid)); 
  const snap = await getDocs(q); 
  if (snap.empty) return list.innerHTML = '<p class="muted" style="padding: 1rem;">Vous n\'avez rejoint aucune communauté.</p>'; 
  
  list.innerHTML = snap.docs.map(c => { 
    const data = c.data(); 
    const avatarStyle = data.avatarURL ? `background-image: url(${data.avatarURL}); background-size: cover; background-position: center;` : ''; 
    const avatarContent = data.avatarURL ? '' : data.name[0].toUpperCase(); 
    return `<div class="tg-item" onclick="window.openCommunity('${c.id}')"><div class="tg-avatar" style="${avatarStyle}">${avatarContent}</div><div class="tg-content"><div class="tg-title">${data.name} ${data.type === 'private' ? '🔒' : data.type === 'announcement' ? '📢' : ''}</div><div class="tg-subtitle">${data.description || 'Aucune description'}</div></div></div>`; 
  }).join(''); 
}

export async function renderAllCommunities() { 
  const list = $('all-communities-list'); 
  list.innerHTML = '<p class="muted" style="padding: 1rem;">Chargement...</p>'; 
  const snap = await getDocs(collection(db, 'communities')); 
  if (snap.empty) return list.innerHTML = '<p class="muted" style="padding: 1rem;">Aucune communauté sur le réseau.</p>'; 
  list.innerHTML = snap.docs.map(c => { 
    const data = c.data(); 
    const isMember = data.members.includes(state.currentUser.uid); 
    const avatarStyle = data.avatarURL ? `background-image: url(${data.avatarURL}); background-size: cover; background-position: center;` : ''; 
    const avatarContent = data.avatarURL ? '' : data.name[0].toUpperCase(); 
    return `<div class="tg-item" onclick="window.openCommunity('${c.id}')"><div class="tg-avatar" style="${avatarStyle}">${avatarContent}</div><div class="tg-content"><div class="tg-title">${data.name} ${data.type === 'private' ? '🔒' : data.type === 'announcement' ? '📢' : ''}</div><div class="tg-subtitle">${data.members.length} membres ${isMember ? '· Déjà rejoint' : ''}</div></div></div>`; 
  }).join(''); 
}

window.toggleCommMenu = () => {
  const menu = $('comm-menu');
  if(menu) menu.classList.toggle('active');
};

window.openCommunity = async (id) => { 
  currentCommId = id; 
  switchView('community'); 
  const bannerEl = $('comm-banner-header'); 
  const avatarEl = $('comm-avatar-display'); 
  const titleEl = $('comm-title-display'); 
  const membersEl = $('members-count'); 
  const joinBtn = $('btn-join-community'); 
  const adminControls = $('comm-admin-controls'); 
  const postsContainer = $('posts-list'); 
  const lockScreen = $('private-lock-screen');
  const postForm = $('post-form-container');
  const leaveBtn = $('btn-leave-community');
  
  titleEl.textContent = "Chargement..."; 
  bannerEl.style.backgroundImage = 'none'; 
  avatarEl.style.backgroundImage = 'none'; 
  avatarEl.textContent = '...'; 
  postsContainer.innerHTML = ''; 
  lockScreen.style.display = 'none';
  joinBtn.style.display = 'none';
  leaveBtn.style.display = 'none';
  adminControls.style.display = 'none';
  postForm.style.display = 'none';

  try { 
    const snap = await getDoc(doc(db, 'communities', id)); 
    if (!snap.exists()) return; 
    const data = snap.data(); 
    currentCommData = data;
    
    titleEl.textContent = data.name; 
    membersEl.textContent = `${data.members.length} membres`; 
    
    if (data.bannerURL) bannerEl.style.backgroundImage = `url(${data.bannerURL})`; 
    else bannerEl.style.backgroundImage = 'linear-gradient(135deg, var(--blue), #0a0e1a)'; 
    
    if (data.avatarURL) { avatarEl.style.backgroundImage = `url(${data.avatarURL})`; avatarEl.textContent = ''; } 
    else { avatarEl.textContent = data.name[0].toUpperCase(); } 

    const isAdmin = (data.ownerId === state.currentUser.uid || state.userProfile.role === 'admin');
    const isMember = data.members.includes(state.currentUser.uid);
    const isPending = data.joinRequests?.includes(state.currentUser.uid);
    
    // Menu Admin
    if (isAdmin) { 
      adminControls.style.display = 'flex'; 
      leaveBtn.style.display = 'none';
      // Vérifier s'il y a des demandes
      if (data.type === 'private' && data.joinRequests?.length > 0) {
        $('btn-manage-requests').style.display = 'block';
        $('btn-manage-requests').textContent = `👥 Demandes (${data.joinRequests.length})`;
      } else {
        $('btn-manage-requests').style.display = 'none';
      }
    } else { 
      adminControls.style.display = 'none'; 
      if (isMember) leaveBtn.style.display = 'block';
    } 

    // Logique d'affichage selon le type et le statut
    if (data.type === 'private' && !isMember && !isAdmin) {
      // Groupe privé et on est pas membre
      lockScreen.style.display = 'block';
      postsContainer.style.display = 'none';
      if (isPending) {
        joinBtn.style.display = 'none';
        lockScreen.innerHTML = `<div style="font-size: 4rem; margin-bottom: 1rem;">⏳</div><h3 style="margin-bottom: 10px;">Demande en attente</h3><p class="muted">L'administrateur doit accepter votre demande pour que vous puissiez voir le contenu.</p>`;
      } else {
        joinBtn.style.display = 'block';
        joinBtn.textContent = 'Demander à rejoindre';
        lockScreen.innerHTML = `<div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div><h3 style="margin-bottom: 10px;">Ce groupe est privé</h3><p class="muted">Envoyez une demande pour y accéder.</p>`;
      }
    } else {
      // On est membre, admin, ou groupe public/annonce
      postsContainer.style.display = 'flex';
      lockScreen.style.display = 'none';
      
      if (isMember) {
        joinBtn.style.display = 'none';
        // Formulaire de post (sauf si annonce et pas admin)
        if (data.type === 'announcement' && !isAdmin) {
          postForm.style.display = 'none';
        } else {
          postForm.style.display = 'flex';
        }
      } else {
        // Pas membre mais groupe public ou annonce
        joinBtn.style.display = 'block';
        joinBtn.textContent = 'Rejoindre';
        postForm.style.display = 'none';
      }
    }

    // Écoute des posts
    if (unsubscribeComm) unsubscribeComm(); 
    if (data.type !== 'private' || isMember || isAdmin) {
      unsubscribeComm = onSnapshot(query(collection(db, 'posts'), where('communityId', '==', id), orderBy('createdAt', 'desc')), snap => { 
        postsContainer.innerHTML = snap.empty ? '<p class="muted" style="padding: 1rem;">Aucun message.</p>' : ''; 
        snap.docs.forEach(d => { 
          postsContainer.innerHTML += generatePostHTML(d); 
        }); 
      }); 
    }

  } catch(e) { 
    console.error(e); showToast("Erreur de chargement de la communauté", "error"); 
  } 
};

export function initCommunities() { 
  // Bouton paramètres
  if($('btn-new-community-settings')) $('btn-new-community-settings').addEventListener('click', () => $('modal-community').classList.remove('hidden'));
  
  if($('btn-discover-communities')) $('btn-discover-communities').addEventListener('click', () => { 
    $('my-communities-list').style.display = 'none'; 
    $('btn-discover-communities').style.display = 'none'; 
    $('discover-communities-section').style.display = 'block'; 
    renderAllCommunities(); 
  }); 
  if($('btn-back-to-my-comms')) $('btn-back-to-my-comms').addEventListener('click', () => { 
    $('discover-communities-section').style.display = 'none'; 
    $('my-communities-list').style.display = 'flex'; 
    $('btn-discover-communities').style.display = 'block'; 
  }); 
  
  if($('comm-cancel')) $('comm-cancel').addEventListener('click', () => $('modal-community').classList.add('hidden')); 
  
  if($('comm-save')) $('comm-save').addEventListener('click', async () => { 
    const name = $('comm-name').value.trim(); 
    const type = $('comm-type').value; 
    const avatarFile = $('comm-new-avatar').files[0]; 
    const bannerFile = $('comm-new-banner').files[0]; 
    if (!name) return showToast("Le nom est requis.", "error"); 
    $('comm-save').textContent = "Création..."; 
    $('comm-save').disabled = true; 
    try { 
      let avatarURL = ""; 
      let bannerURL = ""; 
      if(avatarFile) avatarURL = await uploadFile(avatarFile); 
      if(bannerFile) bannerURL = await uploadFile(bannerFile); 
      
      await addDoc(collection(db, 'communities'), { 
        name, 
        description: $('comm-desc').value.trim(), 
        type, 
        avatarURL, 
        bannerURL, 
        ownerId: state.currentUser.uid, 
        members: [state.currentUser.uid], 
        joinRequests: [],
        createdAt: serverTimestamp() 
      }); 
      
      if(!state.userProfile.badges.includes("Fondateur")) { 
        state.userProfile.badges.push("Fondateur"); 
        await updateDoc(doc(db, 'users', state.currentUser.uid), { badges: arrayUnion("Fondateur") }); 
      } 
      showToast("✅ Communauté créée !"); 
      $('modal-community').classList.add('hidden'); 
      $('comm-name').value = ''; 
      $('comm-desc').value = ''; 
      $('comm-new-avatar').value = ''; 
      $('comm-new-banner').value = ''; 
      renderMyCommunities(); 
    } catch (e) { 
      showToast("Erreur : " + e.message, "error"); 
    } finally { 
      $('comm-save').textContent = "Créer"; 
      $('comm-save').disabled = false; 
    } 
  }); 

  // Rejoindre
  if($('btn-join-community')) $('btn-join-community').addEventListener('click', async () => { 
    if (!currentCommData) return;
    if (currentCommData.type === 'private') {
      await updateDoc(doc(db, 'communities', currentCommId), { joinRequests: arrayUnion(state.currentUser.uid) }); 
      showToast("✅ Demande envoyée !", "success");
    } else {
      await updateDoc(doc(db, 'communities', currentCommId), { members: arrayUnion(state.currentUser.uid) }); 
      showToast("✅ Vous avez rejoint !", "success");
    }
    window.openCommunity(currentCommId); 
  }); 

  // Quitter
  if($('btn-leave-community')) $('btn-leave-community').addEventListener('click', async () => {
    if(!confirm("Voulez-vous vraiment quitter cette communauté ?")) return;
    try {
      await updateDoc(doc(db, 'communities', currentCommId), { members: arrayRemove(state.currentUser.uid) });
      showToast("Vous avez quitté la communauté.", "success");
      switchView('communities');
      renderMyCommunities();
    } catch(e) { showToast("Erreur", "error"); }
  });

  // Gestion des demandes (Admin)
  if($('btn-manage-requests')) $('btn-manage-requests').addEventListener('click', async () => {
    $('modal-manage-requests').classList.remove('hidden');
    const list = $('requests-list');
    list.innerHTML = 'Chargement...';
    const requests = currentCommData.joinRequests || [];
    if (requests.length === 0) { list.innerHTML = '<p class="muted">Aucune demande.</p>'; return; }
    
    list.innerHTML = '';
    for (const uid of requests) {
      const uSnap = await getDoc(doc(db, 'users', uid));
      if (uSnap.exists()) {
        const u = uSnap.data();
        list.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg); padding:10px; border-radius:8px; margin-bottom:8px;">
          <div><strong>@${u.username}</strong></div>
          <div style="display:flex; gap:5px;">
            <button onclick="window.acceptRequest('${uid}')" class="btn-primary small" style="padding:4px 8px;">✓</button>
            <button onclick="window.declineRequest('${uid}')" class="btn-secondary small" style="padding:4px 8px; color:#ef4444;">✕</button>
          </div>
        </div>`;
      }
    }
  });

  window.acceptRequest = async (uid) => {
    await updateDoc(doc(db, 'communities', currentCommId), { 
      joinRequests: arrayRemove(uid),
      members: arrayUnion(uid)
    });
    showToast("Demande acceptée.");
    $('modal-manage-requests').classList.add('hidden');
    window.openCommunity(currentCommId);
  };

  window.declineRequest = async (uid) => {
    await updateDoc(doc(db, 'communities', currentCommId), { joinRequests: arrayRemove(uid) });
    showToast("Demande refusée.", "error");
    $('modal-manage-requests').classList.add('hidden');
    window.openCommunity(currentCommId);
  };

  if($('btn-close-requests')) $('btn-close-requests').addEventListener('click', () => $('modal-manage-requests').classList.add('hidden'));

  // Changement avatar/bannière
  if($('btn-change-comm-avatar')) { 
    $('btn-change-comm-avatar').addEventListener('click', () => $('comm-avatar-upload').click()); 
    $('comm-avatar-upload').addEventListener('change', async (e) => { 
      const file = e.target.files[0]; 
      if(!file || !currentCommId) return; 
      showToast("Chargement...", "success"); 
      try { 
        const url = await uploadFile(file); 
        await updateDoc(doc(db, 'communities', currentCommId), { avatarURL: url }); 
        showToast("✅ Avatar mis à jour !"); 
        window.openCommunity(currentCommId); 
      } catch(err) { showToast("Erreur.", "error"); } 
    }); 
  } 
  if($('btn-change-comm-banner')) { 
    $('btn-change-comm-banner').addEventListener('click', () => $('comm-banner-upload').click()); 
    $('comm-banner-upload').addEventListener('change', async (e) => { 
      const file = e.target.files[0]; 
      if(!file || !currentCommId) return; 
      showToast("Chargement...", "success"); 
      try { 
        const url = await uploadFile(file); 
        await updateDoc(doc(db, 'communities', currentCommId), { bannerURL: url }); 
        showToast("✅ Bannière mise à jour !"); 
        window.openCommunity(currentCommId); 
      } catch(err) { showToast("Erreur.", "error"); } 
    }); 
  } 
  
  // Supprimer
  if($('btn-delete-community')) { 
    $('btn-delete-community').addEventListener('click', async () => { 
      if(!confirm("⚠️ Êtes-vous sûr de vouloir supprimer cette communauté ET TOUS ses messages ? Cette action est irréversible.")) return; 
      showToast("Suppression en cours...", "success"); 
      $('btn-delete-community').textContent = "Suppression..."; 
      $('btn-delete-community').disabled = true; 
      try { 
        const postsQ = query(collection(db, 'posts'), where('communityId', '==', currentCommId)); 
        const postsSnap = await getDocs(postsQ); 
        const deletePromises = postsSnap.docs.map(d => deleteDoc(doc(db, 'posts', d.id))); 
        await Promise.all(deletePromises); 
        await deleteDoc(doc(db, 'communities', currentCommId)); 
        showToast("🗑️ Communauté et messages supprimés.", "error"); 
        switchView('communities'); 
        renderMyCommunities(); 
      } catch(e) { 
        console.error(e); 
        showToast("Erreur lors de la suppression : " + e.message, "error"); 
        $('btn-delete-community').textContent = "🗑️ Supprimer la communauté"; 
        $('btn-delete-community').disabled = false; 
      } 
    }); 
  } 
  
  // Publier
  if($('btn-publish-post')) $('btn-publish-post').addEventListener('click', async () => { 
    const content = $('post-content').value.trim(); 
    if (!content) return; 
    $('post-content').value = ''; 
    await addDoc(collection(db, 'posts'), { communityId: currentCommId, communityType: 'public', content, authorId: state.currentUser.uid, authorName: state.userProfile.username, likes: [], commentsCount: 0, createdAt: serverTimestamp() }); 
  }); 
}
