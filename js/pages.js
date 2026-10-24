import { db, state } from './state.js';
import { $, showToast, uploadFile } from './utils.js';
import { switchView } from './navigation.js';
import { generatePostHTML } from './feed.js';
import { sendNotification } from './notifications.js'; // <-- Import pour notifier
import { collection, addDoc, query, where, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

let currentPageId = null;
let currentPageData = null;

async function canUserCreatePage() {
  if (state.userProfile.role === 'admin') return true; 
  const followersCount = state.userProfile.followers?.length || 0;
  if (followersCount < 10) { showToast("Il vous faut au moins 10 abonnés pour créer une page.", "error"); return false; }
  const postsQuery = query(collection(db, 'posts'), where('authorId', '==', state.currentUser.uid));
  const postsSnap = await getDocs(postsQuery);
  if (postsSnap.docs.length < 3) { showToast("Il vous faut au moins 3 publications pour créer une page.", "error"); return false; }
  return true;
}

// OUVERTURE D'UNE PAGE
window.openPage = async (pageId) => {
  currentPageId = pageId;
  switchView('page');
  
  const titleEl = $('page-view-title');
  const catEl = $('page-view-category');
  const followersEl = $('page-view-followers');
  const ownerEl = $('page-view-owner');
  const postsContainer = $('page-view-posts');
  const followBtn = $('btn-follow-page');
  const avatarEl = $('page-avatar');
  const bannerEl = $('page-banner');
  const ownerControls = $('page-owner-controls');

  titleEl.textContent = "Chargement...";
  postsContainer.innerHTML = '';
  avatarEl.style.backgroundImage = 'none'; avatarEl.textContent = '📄';
  bannerEl.style.backgroundImage = 'none';

  try {
    const pageDoc = await getDoc(doc(db, 'pages', pageId));
    if (!pageDoc.exists()) {
      showToast("Page introuvable.", "error");
      return switchView('home');
    }

    currentPageData = pageDoc.data();
    titleEl.textContent = currentPageData.name;
    catEl.textContent = currentPageData.category.toUpperCase() + " · " + currentPageData.type;
    followersEl.textContent = currentPageData.followers?.length || 0;
    ownerEl.textContent = "Créé par @" + currentPageData.ownerName;

    // Affichage de l'avatar et bannière si existants
    if (currentPageData.avatarURL) {
      avatarEl.style.backgroundImage = `url(${currentPageData.avatarURL})`;
      avatarEl.textContent = '';
    }
    if (currentPageData.bannerURL) {
      bannerEl.style.backgroundImage = `url(${currentPageData.bannerURL})`;
    }

    // Gestion du bouton Suivre
    const isFollowing = state.userProfile.following?.includes(pageId);
    followBtn.textContent = isFollowing ? 'Se désabonner' : 'Suivre cette page';
    followBtn.className = isFollowing ? 'btn-secondary small' : 'btn-primary small';
    
    // Afficher ou cacher les contrôles du propriétaire
    if (currentPageData.ownerId === state.currentUser.uid) {
      ownerControls.style.display = 'flex';
    } else {
      ownerControls.style.display = 'none';
    }
    
    followBtn.onclick = async () => {
      if (isFollowing) {
        await updateDoc(doc(db, 'pages', pageId), { followers: arrayRemove(state.currentUser.uid) });
        await updateDoc(doc(db, 'users', state.currentUser.uid), { following: arrayRemove(pageId) });
        state.userProfile.following = state.userProfile.following.filter(id => id !== pageId);
      } else {
        await updateDoc(doc(db, 'pages', pageId), { followers: arrayUnion(state.currentUser.uid) });
        await updateDoc(doc(db, 'users', state.currentUser.uid), { following: arrayUnion(pageId) });
        if(!state.userProfile.following) state.userProfile.following = [];
        state.userProfile.following.push(pageId);
        showToast("✅ Vous suivez cette page !");
        // Notifier le propriétaire
        sendNotification(currentPageData.ownerId, `a suivi votre page "${currentPageData.name}"`);
      }
      window.openPage(pageId); 
    };

    // Charger les posts de la page
    const postsQuery = query(collection(db, 'posts'), where('pageId', '==', pageId), orderBy('createdAt', 'desc'));
    const postsSnap = await getDocs(postsQuery);

    if (postsSnap.empty) {
      postsContainer.innerHTML = '<p class="muted" style="padding: 1rem;">Cette page n\'a pas encore publié de contenu.</p>';
    } else {
      postsSnap.forEach(d => { postsContainer.innerHTML += generatePostHTML(d); });
    }

  } catch(e) {
    console.error(e);
    showToast("Erreur de chargement de la page.", "error");
  }
};

export function initPages() {
  if($('btn-back-from-page')) $('btn-back-from-page').addEventListener('click', () => switchView('profile'));

  if ($('btn-create-page-settings')) {
    $('btn-create-page-settings').addEventListener('click', async () => {
      const canCreate = await canUserCreatePage();
      if (canCreate) $('modal-page').classList.remove('hidden');
    });
  }

  if ($('page-cancel')) $('page-cancel').addEventListener('click', () => $('modal-page').classList.add('hidden'));

  if ($('page-save')) {
    $('page-save').addEventListener('click', async () => {
      const name = $('page-name').value.trim();
      if (!name) return showToast("Le nom est requis.", "error");
      $('page-save').textContent = "Création...";

      try {
        const newPageRef = await addDoc(collection(db, 'pages'), {
          name: name, description: $('page-desc').value.trim(), type: $('page-type').value, category: $('page-category').value,
          ownerId: state.currentUser.uid, ownerName: state.userProfile.username, followers: [state.currentUser.uid], createdAt: serverTimestamp()
        });

        await updateDoc(doc(db, 'users', state.currentUser.uid), { following: arrayUnion(newPageRef.id) });
        if(!state.userProfile.following) state.userProfile.following = [];
        state.userProfile.following.push(newPageRef.id);

        showToast("✅ Page créée avec succès !", "success");
        $('modal-page').classList.add('hidden');
        $('page-name').value = ''; $('page-desc').value = '';
        if (window.renderProfile) window.renderProfile();

      } catch (e) { showToast("Erreur : " + e.message, "error"); }
      finally { $('page-save').textContent = "Créer la page"; }
    });
  }

  // UPLOAD AVATAR DE LA PAGE
  if($('btn-change-page-avatar')) {
    $('btn-change-page-avatar').addEventListener('click', () => $('page-avatar-upload').click());
    $('page-avatar-upload').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if(!file || !currentPageId) return;
      showToast("Chargement de l'image...", "success");
      try {
        const url = await uploadFile(file);
        await updateDoc(doc(db, 'pages', currentPageId), { avatarURL: url });
        showToast("✅ Photo de profil mise à jour !");
        window.openPage(currentPageId);
      } catch(err) { showToast("Erreur d'upload", "error"); }
    });
  }

  // UPLOAD BANNIÈRE DE LA PAGE
  if($('btn-change-page-banner')) {
    $('btn-change-page-banner').addEventListener('click', () => $('page-banner-upload').click());
    $('page-banner-upload').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if(!file || !currentPageId) return;
      showToast("Chargement de la bannière...", "success");
      try {
        const url = await uploadFile(file);
        await updateDoc(doc(db, 'pages', currentPageId), { bannerURL: url });
        showToast("✅ Bannière mise à jour !");
        window.openPage(currentPageId);
      } catch(err) { showToast("Erreur d'upload", "error"); }
    });
  }
}
