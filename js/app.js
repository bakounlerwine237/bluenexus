import { $, speakText, translateText, toggleMoreMenu, sharePost, showToast } from './utils.js';
import { initNavigation, switchView } from './navigation.js';
import { initAuth } from './auth.js';
import { initFeed, loadGlobalFeed, populatePageSelector } from './feed.js'; 
import { initCommunities, renderMyCommunities } from './communities.js';
import { initMessages, renderUsersList } from './messages.js';
import { initProfile, renderProfile, openUserProfile } from './profile.js';
import { initPages } from './pages.js';
import { listenToNotifications, loadNotifications, initNotifications } from './notifications.js';
import { initVideo, loadVideoFeed } from './video.js';
import { initSearch } from './search.js';
import { initAdmin } from './admin.js';

// On expose les fonctions globales pour les boutons HTML
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

document.addEventListener('DOMContentLoaded', () => {
  console.log("Démarrage de BlueNexus...");
  
  // On initialise chaque module avec un try/catch. 
  // Si l'un plante, les autres continuent de fonctionner.
  try { initNavigation(); } catch(e) { console.error("Erreur Navigation:", e); }
  try { initAuth(); } catch(e) { console.error("Erreur Auth:", e); }
  try { initFeed(); } catch(e) { console.error("Erreur Feed:", e); }
  try { initCommunities(); } catch(e) { console.error("Erreur Communautés:", e); }
  try { initMessages(); } catch(e) { console.error("Erreur Messages:", e); }
  try { initProfile(); } catch(e) { console.error("Erreur Profil:", e); }
  try { initPages(); } catch(e) { console.error("Erreur Pages:", e); }
  try { initNotifications(); } catch(e) { console.error("Erreur Notifs:", e); }
  try { initVideo(); } catch(e) { console.error("Erreur Vidéo:", e); }
  try { initSearch(); } catch(e) { console.error("Erreur Recherche:", e); }
  try { initAdmin(); } catch(e) { console.error("Erreur Admin:", e); }
  
  // Gestion du mode sombre
  const themeToggleBtn = $('btn-theme-toggle-settings');
  if(localStorage.getItem('theme') === 'light') document.body.classList.add('light-mode');
  
  function updateThemeBtnText() {
    if(!themeToggleBtn) return;
    themeToggleBtn.textContent = document.body.classList.contains('light-mode') ? 'Passer en mode sombre 🌙' : 'Passer en mode clair ☀️';
  }
  updateThemeBtnText();
  
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('light-mode');
      localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
      updateThemeBtnText();
    });
  }

  // Gestion de la dictée vocale
  document.querySelectorAll('.btn-mic').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetInput = $(btn.getAttribute('data-target'));
      if (!targetInput) return;
      if (!('webkitSpeechRecognition' in window)) return alert("Non supporté.");
      const recognition = new webkitSpeechRecognition();
      recognition.lang = 'fr-FR';
      btn.textContent = "🔴"; recognition.start();
      recognition.onresult = (event) => { targetInput.value += " " + event.results[0][0].transcript; btn.textContent = "🎤"; };
      recognition.onerror = () => btn.textContent = "🎤";
      recognition.onend = () => btn.textContent = "🎤";
    });
  });
});

// On lance le chargement des données une fois connecté
document.addEventListener('userReady', () => {
  try { loadGlobalFeed(true); } catch(e) { console.error(e); }
  try { listenToNotifications(); } catch(e) { console.error(e); }
  try { populatePageSelector(); } catch(e) { console.error(e); }
});
