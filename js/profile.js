import { db, state } from './state.js';
import { $, uploadFile } from './utils.js';
import { switchView } from './navigation.js';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

export function renderProfile() {
  if (!state.userProfile) return;
  displayProfileData(state.userProfile, true);
}

export async function openUserProfile(userId) {
  if (userId === state.currentUser.uid) {
    displayProfileData(state.userProfile, true);
  } else {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) {
      displayProfileData(snap.data(), false, userId);
    }
  }
  switchView('profile');
}

async function displayProfileData(profile, isMe, targetId = null) {
  if($('profile-name')) $('profile-name').textContent = profile.username;
  if($('profile-bio')) $('profile-bio').textContent = profile.bio || 'Aucune bio.';
  
  const av = $('profile-avatar');
  if (av) {
    if (profile.photoURL) { av.style.backgroundImage = `url(${profile.photoURL})`; av.textContent = ''; }
    else { av.style.backgroundImage = 'none'; av.textContent = profile.username[0].toUpperCase(); }
  }
  
  let badgesHtml = (profile.badges || []).map(b => `<span class="badge-item">${b}</span>`).join('');
  if (profile.role === 'admin') {
    badgesHtml = `<span class="badge-item" style="background: linear-gradient(135deg, #ef4444, #b91c1c); border: 1px solid #fca5a5;">👑 Admin Suprême</span>` + badgesHtml;
  }
  if($('profile-badges')) $('profile-badges').innerHTML = badgesHtml;

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
        }
        openUserProfile(targetId);
      };
    }
  }

  // --- CHARGEMENT DES PAGES CRÉÉES ---
  const pagesContainer = $('profile-pages');
  if (pagesContainer) {
    pagesContainer.innerHTML = '<p class="muted" style="padding:1rem;">Chargement...</p>';
    const q = query(collection(db, 'pages'), where('ownerId', '==', targetId || state.currentUser.uid));
    const snap = await getDocs(q);
    
    if (snap.empty) {
      pagesContainer.innerHTML = '<p class="muted" style="padding:1rem;">Aucune page créée.</p>';
    } else {
      pagesContainer.innerHTML = snap.docs.map(d => {
        const p = d.data();
        return `<div class="tg-item" onclick="window.openPage('${d.id}')">
          <div class="tg-avatar">📄</div>
          <div class="tg-content">
            <div class="tg-title">${p.name}</div>
            <div class="tg-subtitle">${p.category.toUpperCase()} · ${p.followers.length} abonnés</div>
          </div>
        </div>`;
      }).join('');
    }
  }

  const pinnedContainer = $('profile-pinned');
  if (!pinnedContainer) return;
  pinnedContainer.innerHTML = '';
  
  if (profile.pinned && profile.pinned.length > 0) {
    pinnedContainer.innerHTML = '<p class="muted">Chargement...</p>';
    const docs = await Promise.all(profile.pinned.map(id => getDoc(doc(db, 'posts', id))));
    pinnedContainer.innerHTML = '';
    docs.forEach(d => {
      if (d.exists()) pinnedContainer.innerHTML += `<div class="media-item" style="border-color: var(--blue-light);"><p style="font-size:0.9rem;">${d.data().content}</p></div>`;
    });
  } else {
     pinnedContainer.innerHTML = '<p class="muted">Aucune publication épinglée.</p>';
  }
}

export function initProfile() {
  window.openUserProfile = openUserProfile;
  window.renderProfile = renderProfile;

  // Fonction globale pour ouvrir une page (on fera la vue plus tard)
  window.openPage = (pageId) => {
    alert("La vue détaillée de la page arrivera à la prochaine mise à jour !");
  };

  if($('btn-edit-profile-trigger')) $('btn-edit-profile-trigger').addEventListener('click', () => $('modal-profile').classList.remove('hidden'));
  if($('btn-cancel-profile')) $('btn-cancel-profile').addEventListener('click', () => $('modal-profile').classList.add('hidden'));
  
  if($('btn-save-profile')) $('btn-save-profile').addEventListener('click', async () => {
    const file = $('edit-avatar').files[0];
    let photoURL = state.userProfile.photoURL;
    $('btn-save-profile').textContent = "Patientez...";
    if (file) photoURL = await uploadFile(file);
    
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
    $('btn-save-profile').textContent = "Enregistrer";
  });
}
