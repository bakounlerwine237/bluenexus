import { db, state } from './state.js';
import { $, showToast, uploadFile } from './utils.js';
import { switchView } from './navigation.js';
import { generatePostHTML } from './feed.js';
import { collection, addDoc, query, where, orderBy, getDocs, doc, getDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

let unsubscribeComm = null;
let currentCommId = null;
let currentCommData = null;

// Fonction pour afficher les communautés de l'utilisateur
export async function renderMyCommunities() {
  const list = $('my-communities-list');
  list.innerHTML = '<p class="muted" style="padding: 1rem;">Chargement...</p>';
  $('my-communities-list').style.display = 'flex';
  if($('btn-discover-communities')) $('btn-discover-communities').style.display = 'block';
  $('discover-communities-section').style.display = 'none';

  const q = query(collection(db, 'communities'), where('members', 'array-contains', state.currentUser.uid));
  const snap = await getDocs(q);
  
  if (snap.empty) return list.innerHTML = '<p class="muted" style="padding: 1rem;">Vous n\'avez rejoint aucune communauté.</p>';
  
  list.innerHTML = snap.docs.map(c => {
    const data = c.data();
    const avatarStyle = data.avatarURL ? `background-image: url(${data.avatarURL}); background-size: cover; background-position: center;` : '';
    const avatarContent = data.avatarURL ? '' : data.name[0].toUpperCase();
    
    return `<div class="tg-item" onclick="window.openCommunity('${c.id}')">
      <div class="tg-avatar" style="${avatarStyle}">${avatarContent}</div>
      <div class="tg-content">
        <div class="tg-title">${data.name}</div>
        <div class="tg-subtitle">${data.description || 'Aucune description'}</div>
      </div>
    </div>`;
  }).join('');
}

// Fonction pour découvrir toutes les communautés
export async function renderAllCommunities() {
  const list = $('all-communities-list');
  list.innerHTML = '<p class="muted" style="padding: 1rem;">Chargement...</p>';
  const snap = await getDocs(collection(db, 'communities'));
  
  if (snap.empty) return list.innerHTML = '<p class="muted" style="padding: 1rem;">Aucune communauté sur le réseau.</p>';
  
  list.innerHTML = snap.docs.map(c => {
    const data = c.data();
    const isMember = data.members.includes(state.currentUser.uid);
    const isPending = data.pendingRequests?.includes(state.currentUser.uid);
    const avatarStyle = data.avatarURL ? `background-image: url(${data.avatarURL}); background-size: cover; background-position: center;` : '';
    const avatarContent = data.avatarURL ? '' : data.name[0].toUpperCase();
    
    let typeIcon = '🌍';
    if (data.type === 'private') typeIcon = '🔒';
    if (data.type === 'announcement') typeIcon = '📢';

    return `<div class="tg-item" onclick="window.openCommunity('${c.id}')">
      <div class="tg-avatar" style="${avatarStyle}">${avatarContent}</div>
      <div class="tg-content">
        <div class="tg-title">${typeIcon} ${data.name}</div>
        <div class="tg-subtitle">${data.members.length} membres ${isMember ? '· Déjà membre' : isPending ? '· En attente' : ''}</div>
      </div>
    </div>`;
  }).join('');
}

// Ouvrir une communauté
window.openCommunity = async (id) => {
  currentCommId = id;
  switchView('community');
  
  const bannerEl = $('comm-banner-header');
  const avatarEl = $('comm-avatar-display');
  const titleEl = $('comm-title-display');
  const membersEl = $('members-count');
  const joinContainer = $('join-action-container');
  const joinBtn = $('btn-join-community-action');
  const adminControls = $('comm-admin-controls');
  const postsContainer = $('posts-list');
  const optionsMenu = $('comm-options-menu');
  const btnLeave = $('btn-leave-community');
  const btnDelete = $('btn-delete-community');
  const btnManage = $('btn-manage-requests');
  const reqPanel = $('admin-requests-panel');
  const reqList = $('admin-requests-list');

  titleEl.textContent = "Chargement...";
  bannerEl.style.backgroundImage = 'none';
  avatarEl.style.backgroundImage = 'none';
  avatarEl.textContent = '...';
  postsContainer.innerHTML = '';
  reqPanel.style.display = 'none';

  try {
    const snap = await getDoc(doc(db, 'communities', id));
    if (!snap.exists()) return;
    
    currentCommData = snap.data();
    titleEl.textContent = currentCommData.name;
    membersEl.textContent = `${currentCommData.members.length} membres`;
    
    if (currentCommData.bannerURL) bannerEl.style.backgroundImage = `url(${currentCommData.bannerURL})`;
    if (currentCommData.avatarURL) {
      avatarEl.style.backgroundImage = `url(${currentCommData.avatarURL})`;
      avatarEl.textContent = '';
    } else {
      avatarEl.textContent = currentCommData.name[0].toUpperCase();
    }

    const isAdmin = currentCommData.ownerId === state.currentUser.uid || state.userProfile.role === 'admin';
    const isMember = currentCommData.members.includes(state.currentUser.uid);
    const isPending = currentCommData.pendingRequests?.includes(state.currentUser.uid);

    // Affichage des contrôles admin
    if (isAdmin) {
      adminControls.style.display = 'flex';
      btnDelete.style.display = 'block';
      btnManage.style.display = 'block';
      
      // Afficher le nombre de demandes
      const pendingCount = currentCommData.pendingRequests?.length || 0;
      btnManage.textContent = `👥 Demandes d'adhésion (${pendingCount})`;
      
      // Afficher la liste des demandes
      if(pendingCount > 0) {
        reqList.innerHTML = '';
        for(const uid of currentCommData.pendingRequests) {
          try {
            const uSnap = await getDoc(doc(db, 'users', uid));
            if(uSnap.exists()) {
              reqList.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; background: var(--bg); padding: 10px; border-radius: 8px;">
                  <span>@${uSnap.data().username}</span>
                  <div>
                    <button onclick="window.acceptRequest('${uid}')" class="btn-primary small" style="padding: 5px 10px;">Accepter</button>
                    <button onclick="window.rejectRequest('${uid}')" class="btn-secondary small" style="padding: 5px 10px; color: #ef4444;">Refuser</button>
                  </div>
                </div>`;
            }
          } catch(e) {}
        }
      } else {
        reqList.innerHTML = '<p class="muted">Aucune demande en attente.</p>';
      }

    } else {
      adminControls.style.display = 'none';
      btnDelete.style.display = 'none';
      btnManage.style.display = 'none';
    }

    // Gestion du bouton rejoindre / demander
    if (isMember) {
      joinContainer.style.display = 'none';
      $('post-form-container').style.display = (currentCommData.type === 'announcement' && !isAdmin) ? 'none' : 'flex';
      btnLeave.style.display = 'block';
    } else {
      joinContainer.style.display = 'block';
      $('post-form-container').style.display = 'none';
      btnLeave.style.display = 'none';
      
      if (isPending) {
        joinBtn.textContent = "⏳ Demande en attente...";
        joinBtn.className = "btn-secondary";
        joinBtn.disabled = true;
      } else if (currentCommData.type === 'private') {
        joinBtn.textContent = "🔒 Demander à rejoindre";
        joinBtn.className = "btn-primary";
        joinBtn.disabled = false;
      } else if (currentCommData.type === 'announcement') {
        joinBtn.textContent = "📢 Suivre les publications";
        joinBtn.className = "btn-primary";
        joinBtn.disabled = false;
      } else {
        joinBtn.textContent = "🌍 Rejoindre la communauté";
        joinBtn.className = "btn-primary";
        joinBtn.disabled = false;
      }
    }

    // Chargement des posts
    if(unsubscribeComm) unsubscribeComm();
    unsubscribeComm = onSnapshot(query(collection(db, 'posts'), where('communityId', '==', id), orderBy('createdAt', 'desc')), snap => {
      postsContainer.innerHTML = snap.empty ? '<p class="muted" style="padding: 1rem;">Aucun message.</p>' : '';
      snap.docs.forEach(d => { postsContainer.innerHTML += generatePostHTML(d); });
      window.scrollTo(0, document.body.scrollHeight);
    });

  } catch(e) {
    console.error(e);
    showToast("Erreur de chargement de la communauté", "error");
  }
};

// Accepter une demande
window.acceptRequest = async (uid) => {
  try {
    await updateDoc(doc(db, 'communities', currentCommId), {
      pendingRequests: arrayRemove(uid),
      members: arrayUnion(uid)
    });
    showToast("✅ Membre accepté !");
    window.openCommunity(currentCommId); // Recharger
  } catch(e) { showToast("Erreur", "error"); }
};

// Refuser une demande
window.rejectRequest = async (uid) => {
  try {
    await updateDoc(doc(db, 'communities', currentCommId), {
      pendingRequests: arrayRemove(uid)
    });
    showToast("❌ Demande refusée.", "error");
    window.openCommunity(currentCommId); // Recharger
  } catch(e) { showToast("Erreur", "error"); }
};

export function initCommunities() {
  // Menu 3 points
  if($('btn-comm-options')) {
    $('btn-comm-options').addEventListener('click', () => {
      $('comm-options-menu').classList.toggle('active');
    });
  }

  // Quitter la communauté
  if($('btn-leave-community')) {
    $('btn-leave-community').addEventListener('click', async () => {
      if(!confirm("Voulez-vous vraiment quitter cette communauté ?")) return;
      try {
        await updateDoc(doc(db, 'communities', currentCommId), { members: arrayRemove(state.currentUser.uid) });
        showToast("Vous avez quitté la communauté.");
        switchView('communities');
        renderMyCommunities();
      } catch(e) { showToast("Erreur", "error"); }
    });
  }

  // Supprimer la communauté (Admin)
  if($('btn-delete-community')) {
    $('btn-delete-community').addEventListener('click', async () => {
      if(!confirm("⚠️ Êtes-vous sûr de vouloir supprimer cette communauté ET TOUS ses messages ?")) return;
      try {
        const postsQ = query(collection(db, 'posts'), where('communityId', '==', currentCommId));
        const postsSnap = await getDocs(postsQ);
        await Promise.all(postsSnap.docs.map(d => deleteDoc(doc(db, 'posts', d.id))));
        await deleteDoc(doc(db, 'communities', currentCommId));
        showToast("🗑️ Communauté supprimée.", "error");
        switchView('communities');
        renderMyCommunities();
      } catch(e) { showToast("Erreur", "error"); }
    });
  }

  // Bouton rejoindre
  if($('btn-join-community-action')) {
    $('btn-join-community-action').addEventListener('click', async () => {
      if(!currentCommData) return;
      
      if (currentCommData.type === 'private') {
        await updateDoc(doc(db, 'communities', currentCommId), {
          pendingRequests: arrayUnion(state.currentUser.uid)
        });
        showToast("Demande envoyée à l'administrateur.", "success");
      } else {
        await updateDoc(doc(db, 'communities', currentCommId), {
          members: arrayUnion(state.currentUser.uid)
        });
        showToast("✅ Vous avez rejoint la communauté !");
      }
      window.openCommunity(currentCommId); // Recharger l'UI
    });
  }

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

  if($('btn-new-community-settings')) $('btn-new-community-settings').addEventListener('click', () => $('modal-community').classList.remove('hidden'));
  if($('comm-cancel')) $('comm-cancel').addEventListener('click', () => $('modal-community').classList.add('hidden'));

  // Création de la communauté
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
        pendingRequests: [], // NOUVEAU : Tableau des demandes en attente
        createdAt: serverTimestamp()
      });

      if(!state.userProfile.badges.includes("Fondateur")) {
        state.userProfile.badges.push("Fondateur");
        await updateDoc(doc(db, 'users', state.currentUser.uid), { badges: arrayUnion("Fondateur") });
      }

      showToast("✅ Communauté créée !");
      $('modal-community').classList.add('hidden');
      $('comm-name').value = ''; $('comm-desc').value = '';
      $('comm-new-avatar').value = ''; $('comm-new-banner').value = '';
      
      switchView('communities');
      renderMyCommunities();

    } catch (e) {
      showToast("Erreur : " + e.message, "error");
    } finally {
      $('comm-save').textContent = "Créer";
      $('comm-save').disabled = false;
    }
  });

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

  // Publier un message dans la communauté
  if($('btn-publish-post')) $('btn-publish-post').addEventListener('click', async () => {
    const content = $('post-content').value.trim();
    if (!content) return;
    $('post-content').value = '';
    await addDoc(collection(db, 'posts'), {
      communityId: currentCommId, communityType: 'public', content, 
      authorId: state.currentUser.uid, authorName: state.userProfile.username, likes: [], commentsCount: 0, createdAt: serverTimestamp()
    });
  });
}
