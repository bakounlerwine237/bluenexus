import { db, state } from './state.js';
import { $ } from './utils.js';
import { switchView } from './navigation.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

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
  if($('btn-send-chat')) $('btn-send-chat').addEventListener('click', async () => {
    const text = $('chat-input').value.trim();
    if(!text || !state.currentChatId || !state.tencentChat) return;
    $('chat-input').value = '';
    try {
      const message = state.tencentChat.createTextMessage({
        to: state.currentChatId,
        conversationType: TIM.TYPES.CONV_C2C,
        payload: { text: text }
      });
      await state.tencentChat.sendMessage(message);
      const list = $('chat-messages');
      if (list) {
        list.innerHTML += `<div class="chat-msg mine">${text}</div>`;
        window.scrollTo(0, document.body.scrollHeight);
      }
    } catch(e) { console.error(e); alert("Erreur d'envoi Tencent."); }
  });

  window.startTencentChat = async (targetId, targetName) => {
    if (!state.tencentChat) { alert("La messagerie se connecte..."); return; }
    state.currentChatId = targetId;
    $('chat-with-name').textContent = targetName;
    switchView('chat');
    const list = $('chat-messages');
    if(!list) return;
    list.innerHTML = '<p class="muted" style="text-align:center; margin-top:2rem;">Dites bonjour ! 👋</p>';
    
    if (window.tencentMessageListener) state.tencentChat.off(TIM.EVENT.MESSAGE_RECEIVED, window.tencentMessageListener);
    window.tencentMessageListener = (event) => {
      event.data.forEach(msg => {
        if (msg.conversationID === `C2C${targetId}` || msg.from === targetId) {
          const isMine = msg.from === state.currentUser.uid;
          list.innerHTML += `<div class="chat-msg ${isMine ? 'mine' : 'theirs'}">${msg.payload.text || '[Média]'}</div>`;
          window.scrollTo(0, document.body.scrollHeight);
        }
      });
    };
    state.tencentChat.on(TIM.EVENT.MESSAGE_RECEIVED, window.tencentMessageListener);
  };
}
