import { db, state } from './state.js';
import { $, uploadFile, showToast, timeAgo } from './utils.js';
import { switchView } from './navigation.js';
import { collection, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

export async function renderUsersList() {
  const list = $('users-list');
  if(!list) return;
  list.innerHTML = '<p class="muted" style="padding:1rem;">Chargement...</p>';
  const snap = await getDocs(collection(db, 'users'));
  const otherUsers = snap.docs.filter(d => d.id !== state.currentUser.uid).map(d => ({ id: d.id, ...d.data() }));
  
  if(otherUsers.length === 0) return list.innerHTML = '<p class="muted" style="padding:1rem;">Aucun autre membre.</p>';

  list.innerHTML = otherUsers.map(u => {
    const avatar = u.photoURL ? `<img src="${u.photoURL}" class="tg-avatar">` : `<div class="tg-avatar">${u.username[0].toUpperCase()}</div>`;
    return `<div class="tg-item" onclick="window.startTencentChat('${u.id}', '${u.username}')">
      ${avatar}
      <div class="tg-content">
        <div class="tg-title">${u.username}</div>
        <div class="tg-subtitle">Appuyez pour discuter</div>
      </div>
    </div>`;
  }).join('');
}

export function initMessages() {
  // Bouton trombone
  if($('btn-chat-attach')) {
    $('btn-chat-attach').addEventListener('click', () => $('chat-file').click());
  }

  if($('btn-send-chat')) $('btn-send-chat').addEventListener('click', async () => {
    const text = $('chat-input').value.trim();
    const file = $('chat-file').files[0];
    if((!text && !file) || !state.currentChatId || !state.tencentChat) return;
    
    $('chat-input').value = '';
    $('chat-file').value = '';
    
    try {
      let mediaUrl = null;
      if (file) {
        // 1. On upload l'image sur Cloudinary
        $('btn-send-chat').textContent = "⏳";
        mediaUrl = await uploadFile(file);
      }

      // 2. On prépare le message (Texte ou Image)
      let message;
      if (mediaUrl) {
        // Message image
        message = state.tencentChat.createImageMessage({
          to: state.currentChatId,
          conversationType: TIM.TYPES.CONV_C2C,
          payload: { file: mediaUrl } // Tencent accepte les URL
        });
      } else {
        // Message texte
        message = state.tencentChat.createTextMessage({
          to: state.currentChatId,
          conversationType: TIM.TYPES.CONV_C2C,
          payload: { text: text }
        });
      }

      await state.tencentChat.sendMessage(message);
      
      // Afficher instantanément dans l'UI
      addMessageToUI({ text: text, imageUrl: mediaUrl, isMine: true, time: Date.now() });

    } catch(e) { 
      console.error(e); 
      showToast("Erreur d'envoi.", "error"); 
    } finally {
      $('btn-send-chat').textContent = "➤";
    }
  });

  // Fonction globale pour ouvrir un chat
  window.startTencentChat = async (targetId, targetName) => {
    if (!state.tencentChat) { showToast("La messagerie se connecte..."); return; }
    state.currentChatId = targetId;
    $('chat-with-name').textContent = targetName;
    switchView('chat');
    
    const list = $('chat-messages');
    list.innerHTML = '<p class="muted" style="text-align:center; margin-top:2rem;">Chargement de l\'historique...</p>';
    
    // --- CHARGER L'HISTORIQUE (20 DERNIERS MESSAGES) ---
    try {
      const conversationID = `C2C${targetId}`;
      const history = await state.tencentChat.getMessageList({ conversationID: conversationID });
      
      list.innerHTML = '';
      
      if (history.messageList && history.messageList.length > 0) {
        // Trier du plus ancien au plus récent
        const sortedHistory = history.messageList.sort((a, b) => a.time - b.time);
        sortedHistory.forEach(msg => {
          addMessageToUI({
            text: msg.payload.text || '',
            imageUrl: msg.payload.imageInfoArray?.[0]?.url || null,
            isMine: msg.from === state.currentUser.uid,
            time: msg.time * 1000 // Tencent renvoie les secondes
          });
        });
      } else {
        list.innerHTML = '<p class="muted" style="text-align:center; margin-top:2rem;">Dites bonjour ! 👋</p>';
      }
    } catch(e) {
      console.error("Erreur historique:", e);
      list.innerHTML = '<p class="muted" style="text-align:center; margin-top:2rem;">Dites bonjour ! 👋</p>';
    }
    
    // --- ÉCOUTER LES NOUVEAUX MESSAGES EN TEMPS RÉEL ---
    if (window.tencentMessageListener) state.tencentChat.off(TIM.EVENT.MESSAGE_RECEIVED, window.tencentMessageListener);
    window.tencentMessageListener = (event) => {
      event.data.forEach(msg => {
        if (msg.conversationID === `C2C${targetId}`) {
          addMessageToUI({
            text: msg.payload.text || '',
            imageUrl: msg.payload.imageInfoArray?.[0]?.url || null,
            isMine: msg.from === state.currentUser.uid,
            time: Date.now()
          });
        }
      });
    };
    state.tencentChat.on(TIM.EVENT.MESSAGE_RECEIVED, window.tencentMessageListener);
  };
}

// Fonction pour ajouter un message dans le DOM
function addMessageToUI({ text, imageUrl, isMine, time }) {
  const list = $('chat-messages');
  if(!list) return;
  
  const timeStr = new Date(time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  
  let content = '';
  if (text) content += `<div>${text}</div>`;
  if (imageUrl) content += `<img src="${imageUrl}" class="chat-image" onclick="window.open('${imageUrl}', '_blank')">`;

  const msgHtml = `<div class="chat-msg ${isMine ? 'mine' : 'theirs'}">
    ${content}
    <span class="chat-time">${timeStr}</span>
  </div>`;
  
  // Si c'était le message "Dites bonjour", on le supprime
  if (list.querySelector('.muted')) list.innerHTML = '';
  
  list.innerHTML += msgHtml;
  window.scrollTo(0, document.body.scrollHeight);
}
