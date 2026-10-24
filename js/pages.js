import { db, state } from './state.js';
import { $, showToast } from './utils.js';
import { switchView } from './navigation.js';
import { generatePostHTML } from './feed.js';
import { collection, addDoc, query, where, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

let currentPageId = null;

// Vérification des règles de création
async function canUserCreatePage() {
  if (state.userProfile.role === 'admin') return true; 

  const followersCount = state.userProfile.followers?.length || 0;
  if (followersCount < 10) {
    showToast("Il vous faut au moins 10 abonnés pour créer une page.", "error");
    return false;
  }

  const postsQuery = query(collection(db, 'posts'), where('authorId', '==', state.currentUser.uid));
  const postsSnap = await getDocs(postsQuery);
  if (postsSnap.docs.length < 3) {
    showToast("Il vous faut au moins 3 publications pour créer une page.", "error");
    return false;
  }

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

  titleEl.textContent = "Chargement...";
  postsContainer.innerHTML = '';

  try {
    // 1. Récupérer les infos de la page
    const pageDoc = await getDoc(doc(db, 'pages', pageId));
    if (!pageDoc.exists()) {
      showToast("Page introuvable.", "error");
      return switchView('home');
    }

    const pageData = pageDoc.data();
    titleEl.textContent = pageData.name;
    catEl.textContent = pageData.category.toUpperCase() + " · " + pageData.type;
    followersEl.textContent = pageData.followers?.length || 0;
    ownerEl.textContent = "Créé par @" + pageData.ownerName;

    // 2. Gérer le bouton Suivre
    const isFollowing = state.userProfile.following?.includes(pageId);
    followBtn.textContent = isFollowing ? 'Se désabonner' : 'Suivre cette page';
    followBtn.className = isFollowing ? 'btn-secondary small' : 'btn-primary small';
    
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
      }
      window.openPage(pageId); // Rafraîchir
    };

    // 3. Charger les posts de cette page
    // On récupère les posts où le pageId correspond
    const postsQuery = query(collection(db, 'posts'), where('pageId', '==', pageId), orderBy('createdAt', 'desc'));
    const postsSnap = await getDocs(postsQuery);

    if (postsSnap.empty) {
      postsContainer.innerHTML = '<p class="muted" style="padding: 1rem;">Cette page n\'a pas encore publié de contenu.</p>';
    } else {
      postsSnap.forEach(d => {
        postsContainer.innerHTML += generatePostHTML(d);
      });
    }

  } catch(e) {
    console.error(e);
    showToast("Erreur de chargement de la page.", "error");
  }
};

export function initPages() {
  // Bouton retour depuis une page
  if($('btn-back-from-page')) {
    $('btn-back-from-page').addEventListener('click', () => switchView('profile'));
  }

  // Ouvrir la modale de création
  if ($('btn-create-page-settings')) {
    $('btn-create-page-settings').addEventListener('click', async () => {
      const canCreate = await canUserCreatePage();
      if (canCreate) {
        $('modal-page').classList.remove('hidden');
      }
    });
  }

  if ($('page-cancel')) {
    $('page-cancel').addEventListener('click', () => {
      $('modal-page').classList.add('hidden');
    });
  }

  // Créer la page
  if ($('page-save')) {
    $('page-save').addEventListener('click', async () => {
      const name = $('page-name').value.trim();
      const desc = $('page-desc').value.trim();
      const type = $('page-type').value;
      const category = $('page-category').value;

      if (!name) return showToast("Le nom est requis.", "error");

      $('page-save').textContent = "Création...";

      try {
        const newPageRef = await addDoc(collection(db, 'pages'), {
          name: name,
          description: desc,
          type: type,
          category: category,
          ownerId: state.currentUser.uid,
          ownerName: state.userProfile.username,
          followers: [state.currentUser.uid], // Le créateur s'abonne d'office
          createdAt: serverTimestamp()
        });

        // Ajouter la page aux abonnements du créateur
        await updateDoc(doc(db, 'users', state.currentUser.uid), {
          following: arrayUnion(newPageRef.id)
        });
        if(!state.userProfile.following) state.userProfile.following = [];
        state.userProfile.following.push(newPageRef.id);

        showToast("✅ Page créée avec succès !", "success");
        $('modal-page').classList.add('hidden');
        
        // Réinitialiser
        $('page-name').value = ''; $('page-desc').value = '';
        
        // Rafraîchir le profil
        if (window.renderProfile) window.renderProfile();

      } catch (e) {
        showToast("Erreur : " + e.message, "error");
      } finally {
        $('page-save').textContent = "Créer la page";
      }
    });
  }
}
