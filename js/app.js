import { $, speakText, translateText, toggleMoreMenu, sharePost, showToast } from './utils.js';

// On expose les fonctions de base immédiatement
window.speakText = speakText;
window.translateText = translateText;
window.toggleMoreMenu = toggleMoreMenu;
window.sharePost = sharePost;

document.addEventListener('DOMContentLoaded', async () => {
  console.log("Démarrage de BlueNexus...");
  
  // On charge chaque module un par un avec une sécurité
  // Si un module plante, le site continue de tourner
  
  try { 
    const nav = await import('./navigation.js'); 
    nav.initNavigation(); 
  } catch(e) { console.error("Erreur Navigation:", e); }

  try { 
    const auth = await import('./auth.js'); 
    auth.initAuth(); 
  } catch(e) { console.error("Erreur Auth:", e); }

  try { 
    const feed = await import('./feed.js'); 
    feed.initFeed(); 
    window.loadGlobalFeed = feed.loadGlobalFeed;
    window.populatePageSelector = feed.populatePageSelector;
  } catch(e) { console.error("Erreur Feed:", e); }

  try { 
    const comms = await import('./communities.js'); 
    comms.initCommunities(); 
    window.renderMyCommunities = comms.renderMyCommunities;
  } catch(e) { console.error("Erreur Communautés:", e); }

  try { 
    const msgs = await import('./messages.js'); 
    msgs.initMessages(); 
    window.renderUsersList = msgs.renderUsersList;
  } catch(e) { console.error("Erreur Messages:", e); }

  try { 
    const prof = await import('./profile.js'); 
    prof.initProfile(); 
    window.renderProfile = prof.renderProfile;
    window.openUserProfile = prof.openUserProfile;
  } catch(e) { console.error("Erreur Profil:", e); }

  try { 
    const pages = await import('./pages.js'); 
    pages.initPages(); 
  } catch(e) { console.error("Erreur Pages:", e); }

  try { 
    const notifs = await import('./notifications.js'); 
    notifs.initNotifications(); 
    window.listenToNotifications = notifs.listenToNotifications;
    window.loadNotifications = notifs.loadNotifications;
  } catch(e) { console.error("Erreur Notifications:", e); }

  try { 
    const vid = await import('./video.js'); 
    vid.initVideo(); 
    window.loadVideoFeed = vid.loadVideoFeed;
  } catch(e) { console.error("Erreur Vidéo:", e); }

  try { 
    const search = await import('./search.js'); 
    search.initSearch(); 
  } catch(e) { console.error("Erreur Recherche:", e); }

  try { 
    const admin = await import('./admin.js'); 
    admin.initAdmin(); 
  } catch(e) { console.error("Erreur Admin:", e); }

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
document.addEventListener('userReady', async () => {
  try { 
    const feed = await import('./feed.js'); 
    feed.loadGlobalFeed(true); 
  } catch(e) { console.error(e); }
  
  try { 
    const notifs = await import('./notifications.js'); 
    notifs.listenToNotifications(); 
  } catch(e) { console.error(e); }
  
  try { 
    const feed = await import('./feed.js'); 
    feed.populatePageSelector(); 
  } catch(e) { console.error(e); }
});
