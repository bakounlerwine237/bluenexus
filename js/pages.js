import { db, state } from './state.js';
import { $, showToast } from './utils.js';
import { collection, addDoc, query, where, getDocs, doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

// L'ALGORITHME DE VÉRIFICATION
async function canUserCreatePage() {
  if (state.userProfile.role === 'admin') return true; // Les admins passent outre

  // 1. Vérifier le nombre d'abonnés
  const followersCount = state.userProfile.followers?.length || 0;
  if (followersCount < 10) {
    showToast("Il vous faut au moins 10 abonnés pour créer une page.", "error");
    return false;
  }

  // 2. Vérifier le nombre de posts
  const postsQuery = query(collection(db, 'posts'), where('authorId', '==', state.currentUser.uid));
  const postsSnap = await getDocs(postsQuery);
  if (postsSnap.docs.length < 3) {
    showToast("Il vous faut au moins 3 publications pour créer une page.", "error");
    return false;
  }

  return true;
}

export function initPages() {
  // Ouvrir la modale
  if ($('btn-create-page-settings')) {
    $('btn-create-page-settings').addEventListener('click', async () => {
      const canCreate = await canUserCreatePage();
      if (canCreate) {
        $('modal-page').classList.remove('hidden');
      }
    });
  }

  // Fermer la modale
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
        // Créer le document de la page dans Firestore
        await addDoc(collection(db, 'pages'), {
          name: name,
          description: desc,
          type: type,
          category: category,
          ownerId: state.currentUser.uid,
          ownerName: state.userProfile.username,
          followers: [state.currentUser.uid], // Le créateur s'abonne d'office
          createdAt: serverTimestamp()
        });

        showToast("✅ Page créée avec succès !", "success");
        $('modal-page').classList.add('hidden');
        
        // Réinitialiser les champs
        $('page-name').value = ''; $('page-desc').value = '';
        
        // Rafraîchir le profil pour afficher la nouvelle page
        if (window.renderProfile) window.renderProfile();

      } catch (e) {
        showToast("Erreur : " + e.message, "error");
      } finally {
        $('page-save').textContent = "Créer la page";
      }
    });
  }
}
