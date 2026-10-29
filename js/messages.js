// --- js/messages.js ---
import { db, state } from './state.js'; 
import { $, timeAgo, showToast, uploadFile } from './utils.js'; 
import { switchView } from './navigation.js'; 
import { collection, addDoc, query, where, orderBy, getDocs, doc, updateDoc, onSnapshot, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

let currentChatUserId = null;
let replyToMessage = null;
let unsubscribeChat = null;

export async function renderUsersList() {
  const list = $('users-list');
  if(!list) return;
  list.innerHTML = '<p class="muted" style="padding: 1rem;">Chargement...</p>';
  
  try {
    const snap = await getDocs(collection(db, 'users'));
    let html = '';
    snap.forEach(d => {
      if (d.id === state.currentUser.uid) return;
      const u = d.data();
      const avatar = u.photoURL ? `<img src="${u.photoURL}" class="tg-avatar">` : `<div class="tg-avatar">${u.username[0].toUpperCase()}</div>`;
      html += `<div class="tg-item" onclick="window.openChat('${d.id}', '${u.username}')">
        ${avatar}
        <div class="tg-content">
          <div class="tg-title">${u.username} ${u.isPremium ? '💎' : ''}</div>
          <div class="tg-subtitle">Appuyez pour discuter</div>
        </div>
      </div>`;
    });
    list.innerHTML = html || '<p class="muted" style="padding: 1rem;">Aucun autre utilisateur.</p>';
  } catch(e) { list.innerHTML = '<p class="muted" style="padding: 1rem; color:red;">Erreur.</p>'; }
}

// --- NOUVELLE FONCTION : Ouvrir le chat ---
window.openChat = async (userId, username) => {
  currentChatUserId = userId;
  replyToMessage = null;
  $('chat-with-name').textContent = username;
  if($('chat-reply-container')) $('chat-reply-container').style.display = 'none';
  
  // Masquer la nav
  if($('main-nav')) $('main-nav').style.display = 'none';
  if($('main-header')) $('main-header').style.display = 'none';
  
  switchView('chat');
  
  const container = $('chat-messages');
  container.innerHTML = '<p class="muted" style="text-align:center;">Chargement...</p>';
  
  if (unsubscribeChat) unsubscribeChat();
  
  // On écoute les messages de la conversation
  const chatId = [state.currentUser.uid, userId].sort().join('_');
  
  const q = query(collection(db, 'messages'), where('chatId', '==', chatId), orderBy('createdAt', 'asc'));
  
  unsubscribeChat = onSnapshot(q, async (snap) => {
    container.innerHTML = '';
    if (snap.empty) {
      container.innerHTML = '<p class="muted" style="text-align:center;">Début de la conversation.</p>';
      return;
    }
    
    let unreadMessages = [];
    
    for (const docSnap of snap.docs) {
      const msg = docSnap.data();
      const isMine = msg.fromUser === state.currentUser.uid;
      
      // Si c'est un message de l'autre et non lu, on le marque lu
      if (!isMine && !msg.read) {
        unreadMessages.push(docSnap.id);
      }
      
      let replyHtml = '';
      if (msg.replyTo) {
        replyHtml = `<div style="background: rgba(0,0,0,0.2); padding: 5px 10px; border-radius: 8px; margin-bottom: 5px; border-left: 3px solid var(--blue-light); font-size: 0.75rem;">
          <strong>@${msg.replyTo.name}</strong>: ${msg.replyTo.text}
        </div>`;
      }
      
      let mediaHtml = '';
      if (msg.mediaUrl) {
        if (msg.mediaType === 'image') mediaHtml = `<img src="${msg.mediaUrl}" class="chat-image">`;
        else if (msg.mediaType === 'video') mediaHtml = `<video src="${msg.mediaUrl}" controls style="max-width:100%; border-radius:10px; margin-top:5px;"></video>`;
        else if (msg.mediaType === 'audio') mediaHtml = `<audio src="${msg.mediaUrl}" controls style="width:100%; margin-top:5px;"></audio>`;
      }
      
      // Boutons d'action (Répondre, Supprimer)
      const actionButtons = `
        <div style="display: flex; gap: 5px; justify-content: ${isMine ? 'flex-end' : 'flex-start'}; margin-top: 5px;">
          <button onclick="window.setReplyTo('${docSnap.id}', '${msg.fromName}', '${msg.content ? msg.content.replace(/'/g, "\\'") : "Média"}')" style="background: none; border: none; color: var(--muted); font-size: 0.75rem; cursor: pointer;">↩️ Répondre</button>
          ${isMine ? `<button onclick="window.deleteMessage('${docSnap.id}')" style="background: none; border: none; color: #ef4444; font-size: 0.75rem; cursor: pointer;">🗑️ Supprimer</button>` : ''}
        </div>
      `;
      
      // Statut de lecture (double coche)
      let readStatus = '';
      if (isMine) {
        readStatus = msg.read ? '<span style="color: #60a5fa; margin-left: 5px; font-size: 0.75rem;">✓✓</span>' : '<span style="color: var(--muted); margin-left: 5px; font-size: 0.75rem;">✓</span>';
      }

      container.innerHTML += `
        <div class="chat-msg ${isMine ? 'mine' : 'theirs'}" style="max-width: 85%;">
          ${replyHtml}
          ${mediaHtml}
          <div>${msg.content || ''}</div>
          <span class="chat-time">${timeAgo(msg.createdAt)} ${readStatus}</span>
          ${actionButtons}
        </div>
      `;
    }
    
    container.scrollTop = container.scrollHeight;
    
    // Marquer comme lu
    if (unreadMessages.length > 0) {
      unreadMessages.forEach(async (msgId) => {
        try { await updateDoc(doc(db, 'messages', msgId), { read: true }); } catch(e){}
      });
    }
  });
};

// --- NOUVELLE FONCTION : Répondre ---
window.setReplyTo = (msgId, authorName, text) => {
  replyToMessage = { id: msgId, name: authorName, text: text.substring(0, 40) + (text.length > 40 ? '...' : '') };
  if($('chat-reply-container')) $('chat-reply-container').style.display = 'block';
  if($('reply-to-name')) $('reply-to-name').textContent = `Répondre à @${authorName}`;
  if($('reply-to-text')) $('reply-to-text').textContent = text;
  if($('chat-input')) $('chat-input').focus();
};

window.cancelReply = () => {
  replyToMessage = null;
  if($('chat-reply-container')) $('chat-reply-container').style.display = 'none';
};

// --- NOUVELLE FONCTION : Supprimer un message ---
window.deleteMessage = async (msgId) => {
  if (!confirm("Supprimer ce message ?")) return;
  try {
    await deleteDoc(doc(db, 'messages', msgId));
    showToast("Message supprimé.", "error");
  } catch(e) { showToast("Erreur.", "error"); }
};

export function initMessages() {
  if($('btn-send-chat')) {
    $('btn-send-chat').addEventListener('click', async () => {
      const input = $('chat-input');
      const content = input.value.trim();
      if (!content || !currentChatUserId) return;
      
      input.value = '';
      input.style.height = '40px';
      
      const chatId = [state.currentUser.uid, currentChatUserId].sort().join('_');
      
      let msgData = {
        chatId,
        fromUser: state.currentUser.uid,
        fromName: state.userProfile.username,
        toUser: currentChatUserId,
        content,
        read: false,
        createdAt: serverTimestamp()
      };
      
      if (replyToMessage) {
        msgData.replyTo = replyToMessage;
      }
      
      window.cancelReply();
      
      try {
        await addDoc(collection(db, 'messages'), msgData);
      } catch(e) { showToast("Erreur", "error"); }
    });
  }

  // Envoi avec Entrée
  if($('chat-input')) {
    $('chat-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if($('btn-send-chat')) $('btn-send-chat').click();
      }
    });
  }

  // Pièce jointe
  if($('btn-chat-attach')) {
    $('btn-chat-attach').addEventListener('click', () => $('chat-file').click());
    
    $('chat-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !currentChatUserId) return;
      
      showToast("Envoi du fichier...", "success");
      try {
        const url = await uploadFile(file);
        const chatId = [state.currentUser.uid, currentChatUserId].sort().join('_');
        
        let mediaType = 'file';
        if (file.type.startsWith('image')) mediaType = 'image';
        else if (file.type.startsWith('video')) mediaType = 'video';
        else if (file.type.startsWith('audio')) mediaType = 'audio';
        
        let msgData = {
          chatId,
          fromUser: state.currentUser.uid,
          fromName: state.userProfile.username,
          toUser: currentChatUserId,
          content: '',
          mediaUrl: url,
          mediaType: mediaType,
          read: false,
          createdAt: serverTimestamp()
        };
        
        if (replyToMessage) {
          msgData.replyTo = replyToMessage;
          window.cancelReply();
        }
        
        await addDoc(collection(db, 'messages'), msgData);
        showToast("✅ Fichier envoyé !");
        $('chat-file').value = '';
      } catch(e) { showToast("Erreur d'envoi.", "error"); }
    });
  }
}
