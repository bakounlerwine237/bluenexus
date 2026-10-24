import { db, state } from './state.js';
import { $, timeAgo, showToast } from './utils.js';
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc, writeBatch, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

let unsubscribeNotifs = null;

export function listenToNotifications() {
  if(unsubscribeNotifs) unsubscribeNotifs();
  if(!state.currentUser) return;
  
  const q = query(collection(db, 'notifications'), where('toUser', '==', state.currentUser.uid), where('read', '==', false));
  
  unsubscribeNotifs = onSnapshot(q, snap => {
    const badge = $('notif-badge');
    if(!badge) return;
    if(snap.docs.length > 0) { 
      badge.style.display = 'block'; 
      badge.textContent = snap.docs.length; 
    } else { 
      badge.style.display = 'none'; 
    }
  });
}

// C'EST CETTE FONCTION QUI MANQUAIT
export async function sendNotification(toUser, text, fromUserId, fromUsername) {
  if(!state.currentUser || toUser === state.currentUser.uid) return; 
  await addDoc(collection(db, 'notifications'), {
    toUser: toUser, 
    fromUser: fromUserId || state.currentUser.uid, 
    fromUsername: fromUsername || state.userProfile.username, 
    text: text, 
    read: false, 
    createdAt: serverTimestamp()
  });
}

export async function loadNotifications() {
  const list = $('notif-list');
  if(!list) return;
  list.innerHTML = '<p class="muted" style="padding:1rem;">Chargement...</p>';
  
  const q = query(collection(db, 'notifications'), where('toUser', '==', state.currentUser.uid), orderBy('createdAt', 'desc'), limit(30));
  const snap = await getDocs(q);
  
  if(snap.empty) return list.innerHTML = '<p class="muted" style="padding:1rem;">Aucune notification pour le moment.</p>';
  
  list.innerHTML = '';
  snap.docs.forEach(d => {
    const n = d.data();
    const isUnread = !n.read;
    
    list.innerHTML += `
      <div class="notif-item ${isUnread ? 'unread' : ''}" onclick="window.openUserProfile('${n.fromUser}')">
        <div class="notif-avatar">${n.fromUsername[0].toUpperCase()}</div>
        <div class="notif-content">
          <div class="notif-text"><strong>@${n.fromUsername}</strong> ${n.text}</div>
          <div class="notif-time">${timeAgo(n.createdAt)}</div>
        </div>
      </div>`;
  });
}

export function initNotifications() {
  if($('btn-mark-all-read')) {
    $('btn-mark-all-read').addEventListener('click', async () => {
      const q = query(collection(db, 'notifications'), where('toUser', '==', state.currentUser.uid), where('read', '==', false));
      const snap = await getDocs(q);
      
      if (snap.empty) return showToast("Aucune notification non lue.", "error");

      const batch = writeBatch(db);
      snap.docs.forEach(d => {
        batch.update(doc(db, 'notifications', d.id), { read: true });
      });
      await batch.commit();
      
      showToast("✅ Toutes les notifications sont lues.");
      loadNotifications(); 
    });
  }
}
