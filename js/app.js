import { $, speakText, translateText, toggleMoreMenu, sharePost, showToast } from './utils.js';
import { initNavigation, switchView } from './navigation.js';
import { initAuth } from './auth.js';
import { initFeed, loadGlobalFeed, populatePageSelector } from './feed.js'; // <-- IMPORT AJOUTÉ
import { initCommunities, renderMyCommunities } from './communities.js';
import { initMessages, renderUsersList } from './messages.js';
import { initProfile, renderProfile, openUserProfile } from './profile.js';
import { initPages } from './pages.js';
import { listenToNotifications, loadNotifications, initNotifications } from './notifications.js';
import { initVideo, loadVideoFeed } from './video.js';
import { initSearch } from './search.js';
import { initAdmin } from './admin.js';

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
  initNavigation();
  initAuth();
  initFeed();
  initCommunities();
  initMessages();
  initProfile();
  initPages();
  initNotifications();
  initVideo();
  initSearch();
  initAdmin();
  
  // ... (mode sombre et micro inchangés)
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

document.addEventListener('userReady', () => {
  loadGlobalFeed(true);
  listenToNotifications();
  populatePageSelector(); // <-- NOUVEL APPEL ICI
});
