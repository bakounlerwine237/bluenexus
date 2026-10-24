import { db, state } from './state.js';
import { $, uploadFile, showToast } from './utils.js';
import { switchView } from './navigation.js';
import { generatePostHTML } from './feed.js';
import { sendNotification } from './notifications.js'; // <-- IMPORT AJOUTÉ POUR LES NOTIFS
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

let viewingUserId = null; // Variable pour mémoriser le profil qu'on regarde

export function renderProfile() {
  if (!state.userProfile) return;
  viewingUserId = state.currentUser.uid;
  displayProfileData(state.userProfile, true, viewingUserId);
}

export async function openUserProfile(userId) {
  viewingUserId = userId;
  if (userId === state.currentUser.uid) {
    displayProfileData(state.userProfile, true, userId);
  } else {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) {
      displayProfileData(snap.data(), false, userId);
    }
  }
  switchView('profile');
}

window.switchProfileTab = (tabName) => {
  document.querySelectorAll('.fb-tab').forEach(t => t.classList.remove('active'));
  const targetTab = document.querySelector(`.fb-tab[onclick="window.switchProfileTab('${tabName}')"]`);
  if(targetTab) targetTab.classList.add('active');

  document.getElementById('profile-tab-posts').style.display = 'none';
  document.getElementById('profile-tab-pages').style.display = 'none';
  document.getElementById('profile-tab-about').style.display = 'none';

  document.getElementById(`profile-tab-${tabName}`).style.display = 'block';
};

async function displayProfileData(profile, isMe, targetId) {
  // Vérification de sécurité : si un autre script tente d'afficher un autre profil entre temps
  if(viewingUserId !== targetId) return;

  // 1. Infos de base
  if($('profile-name')) $('profile-name').textContent = profile.username;
  if($('profile-bio')) $('profile-bio').textContent = profile.bio || 'Aucune bio.';
  if($('about-username')) $('about-username').textContent = profile.username;
  if($('about-bio')) $('about-bio').textContent = profile.bio || 'Aucune bio.';
  
  const av = $('profile-avatar');
  if (av) {
    if (profile.photoURL) { av.style.backgroundImage = `url(${profile.photoURL})`; av.textContent = ''; }
    else { av.style.backgroundImage = 'none'; av.textContent = profile.username[0].toUpperCase(); }
  }

  // 2. Badges
  let badgesHtml = (profile.badges || []).map(b => `<span class="badge-item">${b}</span>`).join('');
  if (profile.role === 'admin') {
    badgesHtml = `<span class="badge-item" style="background: linear-gradient(135deg, #ef4444, #b91c1c); border: 1px solid #fca5a5;">👑 Admin Suprême</span>` + badgesHtml;
  }
  if($('profile-badges')) $('profile-badges').innerHTML = badgesHtml;

  // 3. Statistiques
  const postsQuery = query(collection(db, 'posts'), where('authorId', '==', targetId));
  const postsSnap = await getDocs(postsQuery);
  if($('stat-posts')) $('stat-posts').textContent = postsSnap.docs.length;
  if($('stat-followers')) $('stat-followers').textContent = profile.followers?.length || 0;
  if($('stat-following')) $('stat-following').textContent = profile.following?.length || 0;

  // 4. Boutons (Suivre / Modifier)
  const btnEdit = $('btn-edit-profile-trigger');
  const btnFollow = $('btn-follow-user');
  
  if (isMe) {
    if(btnEdit) btnEdit.style.display = 'block';
    if(btnFollow) btnFollow.style.display = 'none';
  } else {
    if(btnEdit) btnEdit.style.display = 'none';
    if(btnFollow) {
      btnFollow.style.display = 'block';
      const isFollowing = state.userProfile.following?.includes(targetId);
      btnFollow.textContent = isFollowing ? 'Se désabonner' : 'Suivre';
      btnFollow.className = isFollowing ? 'btn-secondary small' : 'btn-primary small';
      
      btnFollow.onclick = async () => {
        if (isFollowing) {
          await updateDoc(doc(db, 'users', state.currentUser.uid), { following: arrayRemove(targetId) });
          state.userProfile.following = state.userProfile.following.filter(id => id !== targetId);
        } else {
          await updateDoc(doc(db, 'users', state.currentUser.uid), { following: arrayUnion(targetId) });
          if(!state.userProfile.following) state.userProfile.following = [];
          state.userProfile.following.push(targetId);
          // ENVOI DE LA NOTIFICATION ICI
          sendNotification(targetId, "s'est abonné à votre profil.");
        }
        openUserProfile(targetId); // Recharge la page pour actualiser le bouton
      };
    }
  }

  // 5. Publications
  const postsContainer = $('profile-posts-list');
  postsContainer.innerHTML = '';
  if (postsSnap.empty) {
    postsContainer.innerHTML = '<p class="muted" style="padding: 1rem;">Aucune publication pour le moment.</p>';
  } else {
    const sortedPosts = postsSnap.docs.sort((a, b) => {
      const timeA = a.data().createdAt?.toMillis() || 0;
      const timeB = b.data().createdAt?.toMillis() || 0;
      return timeB - timeA; 
    });
    sortedPosts.forEach(d => {
      postsContainer.innerHTML += generatePostHTML(d);
    });
  }

  // 6. Pages
  const pagesContainer = $('profile-pages-list');
  pagesContainer.innerHTML = '';
  const pagesQuery = query(collection(db, 'pages'), where('ownerId', '==', targetId));
  const pagesSnap = await getDocs(pagesQuery);
  
  if (pagesSnap.empty) {
    pagesContainer.innerHTML = '<p class="muted" style="padding: 1rem;">Aucune page créée.</p>';
  } else {
    pagesSnap.forEach(d => {
      const p = d.data();
      pagesContainer.innerHTML += `
        <div class="tg-item" onclick="window.openPage('${d.id}')">
          <div class="tg-avatar" style="background: var(--blue-light);">📄</div>
          <div class="tg-content">
            <div class="tg-title">${p.name}</div>
            <div class="tg-subtitle">${p.category.toUpperCase()} · ${p.followers.length} abonnés</div>
          </div>
        </div>`;
    });
  }
}

export function initProfile() {
  window.openUserProfile = openUserProfile;
  window.renderProfile = renderProfile;

  // La fonction openPage est maintenant gérée par pages.js, mais on garde une sécurité
  if(!window.openPage) {
    window.openPage = (pageId) => showToast("Chargement de la page...", "success");
  }

  if($('btn-edit-profile-trigger')) $('btn-edit-profile-trigger').addEventListener('click', () => $('modal-profile').classList.remove('hidden'));
  if($('btn-cancel-profile')) $('btn-cancel-profile').addEventListener('click', () => $('modal-profile').classList.add('hidden'));
  
  if($('btn-save-profile')) $('btn-save-profile').addEventListener('click', async () => {
    const file = $('edit-avatar').files[0];
    let photoURL = state.userProfile.photoURL;
    
    // On change le texte du bouton pour indiquer que ça charge
    $('btn-save-profile').textContent = "Chargement...";
    $('btn-save-profile').disabled = true;

    try {
      if (file) {
        // On upload l'image sur Cloudinary (ça peut prendre quelques secondes sur mobile)
        photoURL = await uploadFile(file);
      }
      
      await updateDoc(doc(db, 'users', state.currentUser.uid), { bio: $('edit-bio').value.trim(), photoURL });
      state.userProfile.bio = $('edit-bio').value.trim();
      state.userProfile.photoURL = photoURL;
      
      const createAvatar = $('create-post-avatar');
      if (createAvatar) {
        if (photoURL) { createAvatar.style.backgroundImage = `url(${photoURL})`; createAvatar.textContent = ''; }
        else { createAvatar.style.backgroundImage = 'none'; createAvatar.textContent = state.userProfile.username[0].toUpperCase(); }
      }

      $('modal-profile').classList.add('hidden');
      renderProfile();
      showToast("✅ Profil mis à jour !");
    } catch (e) {
      showToast("Erreur d'envoi de l'image", "error");
    } finally {
      $('btn-save-profile').textContent = "Enregistrer";
      $('btn-save-profile').disabled = false;
    }
  });
}
