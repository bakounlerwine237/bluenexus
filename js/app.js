// --- js/app.js ---
import { $, speakText, translateText, toggleMoreMenu, sharePost } from './utils.js';
import { initNavigation } from './navigation.js';
import { initAuth } from './auth.js';
import { initFeed, loadGlobalFeed, populatePageSelector } from './feed.js';
import { initCommunities, renderMyCommunities } from './communities.js';
import { initMessages, renderUsersList } from './messages.js';
import { initProfile, renderProfile, openUserProfile } from './profile.js';
import { initPages } from './pages.js';
import { initNotifications, listenToNotifications, loadNotifications } from './notifications.js';
import { initVideo, loadVideoFeed } from './video.js';
import { initSearch } from './search.js';
import { initAdmin } from './admin.js';
import { initSettings } from './settings.js';
import { db, state } from './state.js'; // NOUVEAU
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js"; // NOUVEAU

window.speakText = speakText; 
window.translateText = translateText; 
window.toggleMoreMenu = toggleMoreMenu; 
window.sharePost = sharePost; 
window.loadGlobalFeed = loadGlobalFeed; 
window.renderMyCommunities = renderMyCommunities; 
window.renderUsersList = renderUsersList; 
window.renderProfile = renderProfile; 
window.openUserProfile = openUserProfile; 
window.loadNotifications = loadNotifications; 
window.loadVideoFeed = loadVideoFeed; 
window.populatePageSelector = populatePageSelector;

// NOUVEAU : BADGE MESSAGE NON LU
function listenToUnreadMessages() {
  if(!state.currentUser) return;
  const q = query(collection(db, 'messages'), where('toUser', '==', state.currentUser.uid), where('read', '==', false));
  onSnapshot(q, (snap) => {
    const badge = $('msg-badge');
    if(!badge) return;
    if(snap.docs.length > 0) {
      badge.style.display = 'block';
      badge.textContent = snap.docs.length;
    } else {
      badge.style.display = 'none';
    }
  }, (error) => console.log("Erreur badge messages", error));
}

document.addEventListener('DOMContentLoaded', () => {
  try { initNavigation(); } catch(e) { console.error(e); } 
  try { initAuth(); } catch(e) { console.error(e); } 
  try { initFeed(); } catch(e) { console.error(e); } 
  try { initCommunities(); } catch(e) { console.error(e); } 
  try { initMessages(); } catch(e) { console.error(e); } 
  try { initProfile(); } catch(e) { console.error(e); } 
  try { initPages(); } catch(e) { console.error(e); } 
  try { initNotifications(); } catch(e) { console.error(e); } 
  try { initVideo(); } catch(e) { console.error(e); } 
  try { initSearch(); } catch(e) { console.error(e); } 
  try { initAdmin(); } catch(e) { console.error(e); } 
  try { initSettings(); } catch(e) { console.error(e); } 

  const themeToggleBtn = $('btn-theme-toggle-settings'); 
  if(localStorage.getItem('theme') === 'light') document.body.classList.add('light-mode');
  function updateThemeBtnText() { if(!themeToggleBtn) return; themeToggleBtn.textContent = document.body.classList.contains('light-mode') ? 'Passer en mode sombre 🌙' : 'Passer en mode clair ☀️'; } 
  updateThemeBtnText();
  if (themeToggleBtn) { 
    themeToggleBtn.addEventListener('click', () => { 
      document.body.classList.toggle('light-mode'); 
      localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark'); 
      updateThemeBtnText(); 
    }); 
  }
  document.querySelectorAll('.btn-mic').forEach(btn => { 
    btn.addEventListener('click', (e) => { 
      e.preventDefault(); 
      const targetInput = $(btn.getAttribute('data-target')); 
      if (!targetInput) return; 
      if (!('webkitSpeechRecognition' in window)) return alert("Non supporté."); 
      const recognition = new webkitSpeechRecognition(); 
      recognition.lang = 'fr-FR'; 
      btn.textContent = "🔴"; 
      recognition.start(); 
      recognition.onresult = (event) => { targetInput.value += " " + event.results[0][0].transcript; btn.textContent = "🎤"; }; 
      recognition.onerror = () => btn.textContent = "🎤"; 
      recognition.onend = () => btn.textContent = "🎤"; 
    }); 
  });
});

document.addEventListener('userReady', () => { 
  try { loadGlobalFeed(true); } catch(e) { console.error(e); } 
  try { listenToNotifications(); } catch(e) { console.error(e); } 
  try { listenToUnreadMessages(); } catch(e) { console.error(e); } // NOUVEAU
  try { populatePageSelector(); } catch(e) { console.error(e); } 
  if(document.getElementById('view-profile').classList.contains('active')) { 
    try { renderProfile(); } catch(e) { console.error(e); } 
  } 
});
