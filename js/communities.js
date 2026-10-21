import { db, state } from './state.js';
import { $ } from './utils.js';
import { switchView } from './navigation.js';
import { generatePostHTML } from './feed.js';
import { collection, addDoc, query, where, orderBy, getDocs, doc, getDoc, updateDoc, arrayUnion, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

let unsubscribeComm = null;

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
    return `<div class="tg-item" onclick="window.openCommunity('${c.id}')">
      <div class="tg-avatar">${data.name[0].toUpperCase()}</div>
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
    return `<div class="tg-item" onclick="window.openCommunity('${c.id}')">
      <div class="tg-avatar">${data.name[0].toUpperCase()}</div>
      <div class="tg-content">
        <div class="tg-title">${data.name}</div>
        <div class="tg-subtitle">${data.members.length} membres ${isMember ? '· Déjà rejoint' : ''}</div>
      </div>
    </div>`;
  }).join('');
}

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
  if($('comm-save')) $('comm-save').addEventListener('click', async () => {
    const name = $('comm-name').value.trim();
    if (!name) return;
    await addDoc(collection(db, 'communities'), {
      name, description: $('comm-desc').value.trim(), ownerId: state.currentUser.uid, ownerName: state.userProfile.username, members: [state.currentUser.uid], createdAt: serverTimestamp()
    });
    if(!state.userProfile.badges.includes("👑 Fondateur")) {
      state.userProfile.badges.push("👑 Fondateur");
      await updateDoc(doc(db, 'users', state.currentUser.uid), { badges: arrayUnion("👑 Fondateur") });
    }
    $('modal-community').classList.add('hidden');
    renderMyCommunities();
  });

  if($('btn-join-community')) $('btn-join-community').addEventListener('click', async () => {
    await updateDoc(doc(db, 'communities', state.currentCommunityId), { members: arrayUnion(state.currentUser.uid) });
    window.openCommunity(state.currentCommunityId);
  });

  if($('btn-publish-post')) $('btn-publish-post').addEventListener('click', async () => {
    const content = $('post-content').value.trim();
    if (!content) return;
    $('post-content').value = '';
    await addDoc(collection(db, 'posts'), {
      communityId: state.currentCommunityId, communityType: 'public', content, 
      authorId: state.currentUser.uid, authorName: state.userProfile.username, likes: [], commentsCount: 0, createdAt: serverTimestamp()
    });
  });

  // Fonction globale pour le HTML
  window.openCommunity = async (id) => {
    state.currentCommunityId = id;
    const snap = await getDoc(doc(db, 'communities', id));
    if (!snap.exists()) return;
    const data = snap.data();
    state.currentCommunityMembers = data.members; 
    state.currentCommunityOwner = data.ownerName;
    $('comm-title-display').textContent = data.name;
    $('members-count').textContent = `${data.members.length} membres`;
    
    if (data.members.includes(state.currentUser.uid)) $('post-form-container').style.display = 'flex';
    else $('post-form-container').style.display = 'none';
    
    switchView('community');
    
    if(unsubscribeComm) unsubscribeComm();
    unsubscribeComm = onSnapshot(query(collection(db, 'posts'), where('communityId', '==', id), orderBy('createdAt', 'desc')), snap => {
      $('posts-list').innerHTML = snap.docs.map(d => generatePostHTML(d)).join('');
    });
  };
}
