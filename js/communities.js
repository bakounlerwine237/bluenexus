import { db, currentUser, userProfile } from './auth.js';
import { collection, addDoc, query, where, orderBy, onSnapshot, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { switchView } from './ui.js';

const $ = (id) => document.getElementById(id);
let currentCommId = null;
let unsubComm = null;

$('btn-new-community').addEventListener('click', () => $('modal-community').classList.remove('hidden'));
$('comm-cancel').addEventListener('click', () => $('modal-community').classList.add('hidden'));

$('comm-save').addEventListener('click', async () => {
  const name = $('comm-name').value.trim(), type = $('comm-type').value;
  if (!name) return;
  const ref = await addDoc(collection(db, 'communities'), {
    name, description: $('comm-desc').value.trim(), type, ownerId: currentUser.uid, members: [currentUser.uid], createdAt: Date.now()
  });
  await updateDoc(doc(db, 'users', currentUser.uid), { communities: arrayUnion(ref.id) });
  $('modal-community').classList.add('hidden');
  renderCommunities();
});

export async function renderCommunities() {
  const list = $('communities-list');
  const snap = await getDocs(collection(db, 'communities'));
  if (snap.empty) return list.innerHTML = '<p class="muted">Aucune communauté.</p>';
  
  const comms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  comms.sort((a, b) => (b.members?.length || 0) - (a.members?.length || 0)); // Tri par popularité

  list.innerHTML = comms.map(c => `
    <div class="card" onclick="window.openCommunity('${c.id}')">
      <h4>${c.type === 'announcement' ? '📢' : '💬'} ${c.name}</h4>
      <p class="muted">${c.description}</p>
      <span style="font-size:0.7rem;background:var(--blue);padding:2px 8px;border-radius:10px;margin-top:auto;align-self:flex-start;">${c.members?.length || 1} membres</span>
    </div>
  `).join('');
}
window.addEventListener('view-changed-communities', renderCommunities);

window.openCommunity = async (id) => {
  currentCommId = id;
  const snap = await getDoc(doc(db, 'communities', id));
  if (!snap.exists()) return;
  
  const data = snap.data();
  $('comm-title-display').textContent = data.name;
  $('members-count').textContent = `${data.members.length} membres`;
  
  // Gestion de l'UI selon si on est membre ou non
  const isMember = data.members.includes(currentUser.uid);
  const chatBar = $('post-form-container');
  if (isMember) {
    chatBar.style.display = 'flex';
    $('btn-join-community').style.display = 'none';
  } else {
    chatBar.style.display = 'none';
    $('btn-join-community').style.display = 'block';
  }

  switchView('community');
  loadCommFeed();
};

function loadCommFeed() {
  const list = $('posts-list');
  list.innerHTML = '<p class="muted">Chargement...</p>';
  const q = query(collection(db, 'posts'), where('communityId', '==', currentCommId), orderBy('createdAt', 'desc'));
  
  if (unsubComm) unsubComm();
  unsubComm = onSnapshot(q, snap => {
    if (snap.empty) return list.innerHTML = '<p class="muted" style="text-align:center;">Soyez le premier à écrire !</p>';
    list.innerHTML = snap.docs.map(d => {
      const p = d.data();
      const avatar = p.authorPhoto ? `<img src="${p.authorPhoto}" class="post-avatar">` : `<div class="post-avatar">${p.authorName[0].toUpperCase()}</div>`;
      return `<div class="media-item"><div class="post-header">${avatar} @${p.authorName}</div><p>${p.content}</p></div>`;
    }).join('');
    window.scrollTo(0, document.body.scrollHeight);
  });
}

$('btn-publish-post').addEventListener('click', async () => {
  const content = $('post-content').value.trim();
  if (!content) return;
  $('post-content').value = '';
  await addDoc(collection(db, 'posts'), {
    communityId: currentCommId, communityType: 'chat',
    content, authorId: currentUser.uid, authorName: userProfile.username, authorPhoto: userProfile.photoURL || "",
    likes: [], createdAt: Date.now()
  });
});

$('btn-join-community').addEventListener('click', async () => {
  await updateDoc(doc(db, 'communities', currentCommId), { members: arrayUnion(currentUser.uid) });
  window.openCommunity(currentCommId); // Recharger la vue
});
