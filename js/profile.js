import { db, state } from './state.js';
import { $, uploadFile } from './utils.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

export function renderProfile() {
  if(!state.userProfile) return;
  if($('profile-name')) $('profile-name').textContent = state.userProfile.username;
  if($('profile-bio')) $('profile-bio').textContent = state.userProfile.bio || 'Aucune bio.';
  
  const av = $('profile-avatar');
  if (av) {
    if (state.userProfile.photoURL) { av.style.backgroundImage = `url(${state.userProfile.photoURL})`; av.textContent = ''; } 
    else { av.style.backgroundImage = 'none'; av.textContent = state.userProfile.username[0].toUpperCase(); }
  }
  if($('profile-badges')) $('profile-badges').innerHTML = (state.userProfile.badges || []).map(b => `<span class="badge-item">${b}</span>`).join('');
  
  const pinnedContainer = $('profile-pinned');
  if(!pinnedContainer) return;
  pinnedContainer.innerHTML = '';
  if (state.userProfile.pinned && state.userProfile.pinned.length > 0) {
    pinnedContainer.innerHTML = '<p class="muted">Chargement...</p>';
    Promise.all(state.userProfile.pinned.map(id => getDoc(doc(db, 'posts', id)))).then(docs => {
      pinnedContainer.innerHTML = '';
      docs.forEach(d => { if (d.exists()) pinnedContainer.innerHTML += `<div class="media-item" style="border-color: var(--blue-light);"><p style="font-size:0.9rem;">${d.data().content}</p></div>`; });
    });
  } else { pinnedContainer.innerHTML = '<p class="muted">Aucune publication épinglée.</p>'; }
}

export function initProfile() {
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
