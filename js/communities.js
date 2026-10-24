import { db, state } from './state.js';
import { $, showToast, uploadFile } from './utils.js';
import { switchView } from './navigation.js';
import { generatePostHTML } from './feed.js';
import { collection, addDoc, query, where, orderBy, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

let unsubscribeComm = null;
let currentCommId = null;
let currentCommOwnerId = null;

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

    return `<div class="tg-item" onclick="window.openCommunity('${c.id}')">
      <div class="tg-avatar" style="${avatarStyle}">${avatarContent}</div>
      <div class="tg-content">
        <div class="tg-title">${data.name}</div>
        <div class="tg-subtitle">${data.members.length} membres ${isMember ? '· Déjà rejoint' : ''}</div>
      </div>
    </div>`;
  }).join('');
}

// OUVRIR UNE COMMUNAUTÉ
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

  titleEl.textContent = "Chargement...";
  bannerEl.style.backgroundImage = 'none';
  avatarEl.style.backgroundImage = 'none';
  avatarEl.textContent = '...';
  postsContainer.innerHTML = '';

  try {
    const snap = await getDoc(doc(db, 'communities', id));
    if (!snap.exists()) return;
    
    const data = snap.data();
    currentCommOwnerId = data.ownerId;
    
    titleEl.textContent = data.name;
    membersEl.textContent = `${data.members.length} membres`;
    
    // AFFICHAGE DE LA BANNIÈRE ET DE L'AVATAR
    if (data.bannerURL) {
      bannerEl.style.backgroundImage = `url(${data.bannerURL})`;
    } else {
      bannerEl.style.backgroundImage = 'linear-gradient(135deg, var(--blue), #0a0e1a)';
    }
    
    if (data.avatarURL) {
      avatarEl.style.backgroundImage = `url(${data.avatarURL})`;
      avatarEl.textContent = '';
    } else {
      avatarEl.textContent = data.name[0].toUpperCase();
    }

    // AFFICHAGE DES BOUTONS ADMIN
    if (data.ownerId === state.currentUser.uid || state.userProfile.role === 'admin') {
      adminControls.style.display = 'flex';
    } else {
      adminControls.style.display = 'none';
    }

    // BOUTON REJOINDRE
    if (data.members.includes(state.currentUser.uid)) {
      joinBtn.style.display = 'none';
      $('post-form-container').style.display = 'flex';
    } else {
      joinBtn.style.display = 'block';
      $('post-form-container').style.display = 'none';
    }

    // CHARGER LES POSTS
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

export function initCommunities() {
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

  if($('btn-new-community')) $('btn-new-community').addEventListener('click', () => $('modal-community').classList.remove('hidden'));
  if($('comm-cancel')) $('comm-cancel').addEventListener('click', () => $('modal-community').classList.add('hidden'));

  // CRÉATION DE LA COMMUNAUTÉ AVEC UPLOAD D'IMAGES
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

      // On upload les images si elles existent
      if(avatarFile) avatarURL = await uploadFile(avatarFile);
      if(bannerFile) bannerURL = await uploadFile(bannerFile);

      await addDoc(collection(db, 'communities'), {
        name, 
        description: $('comm-desc').value.trim(), 
        type, 
        avatarURL, // <-- NOUVEAU
        bannerURL, // <-- NOUVEAU
        ownerId: state.currentUser.uid, 
        members: [state.currentUser.uid], 
        createdAt: serverTimestamp()
      });

      // Ajouter le badge Fondateur
      if(!state.userProfile.badges.includes("Fondateur")) {
        state.userProfile.badges.push("Fondateur");
        await updateDoc(doc(db, 'users', state.currentUser.uid), { badges: arrayUnion("Fondateur") });
      }

      showToast("✅ Communauté créée !");
      $('modal-community').classList.add('hidden');
      
      // Reset des champs
      $('comm-name').value = ''; $('comm-desc').value = '';
      $('comm-new-avatar').value = ''; $('comm-new-banner').value = '';
      
      renderMyCommunities();

    } catch (e) {
      showToast("Erreur : " + e.message, "error");
    } finally {
      $('comm-save').textContent = "Créer";
      $('comm-save').disabled = false;
    }
  });

  // CHANGEMENT DE L'AVATAR DE LA COMMUNAUTÉ
  if($('btn-change-comm-avatar')) {
    $('btn-change-comm-avatar').addEventListener('click', () => $('comm-avatar-upload').click());
    $('comm-avatar-upload').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if(!file || !currentCommId) return;
      showToast("Chargement de l'image...", "success");
      try {
        const url = await uploadFile(file);
        await updateDoc(doc(db, 'communities', currentCommId), { avatarURL: url });
        showToast("✅ Avatar mis à jour !");
        window.openCommunity(currentCommId);
      } catch(err) { showToast("Erreur d'upload", "error"); }
    });
  }

  // CHANGEMENT DE LA BANNIÈRE DE LA COMMUNAUTÉ
  if($('btn-change-comm-banner')) {
    $('btn-change-comm-banner').addEventListener('click', () => $('comm-banner-upload').click());
    $('comm-banner-upload').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if(!file || !currentCommId) return;
      showToast("Chargement de la bannière...", "success");
      try {
        const url = await uploadFile(file);
        await updateDoc(doc(db, 'communities', currentCommId), { bannerURL: url });
        showToast("✅ Bannière mise à jour !");
        window.openCommunity(currentCommId);
      } catch(err) { showToast("Erreur d'upload", "error"); }
    });
  }

  if($('btn-join-community')) $('btn-join-community').addEventListener('click', async () => {
    await updateDoc(doc(db, 'communities', currentCommId), { members: arrayUnion(state.currentUser.uid) });
    window.openCommunity(currentCommId);
  });

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
