// ================= IMPORTATIONS DES MODULES =================
import { $, speakText, translateText, toggleMoreMenu, sharePost } from './utils.js';
import { initNavigation, switchView } from './navigation.js';
import { initAuth } from './auth.js';
import { initFeed, loadGlobalFeed } from './feed.js';
import { initCommunities, renderMyCommunities } from './communities.js';
import { initMessages, renderUsersList } from './messages.js';
import { initProfile, renderProfile } from './profile.js';

// ================= EXPOSITION DES FONCTIONS UTILITAIRES =================
// On attache ces fonctions à l'objet "window" pour que les boutons HTML
// (qui utilisent onclick="window.maFonction()") puissent les trouver.
window.speakText = speakText;
window.translateText = translateText;
window.toggleMoreMenu = toggleMoreMenu;
window.sharePost = sharePost;
window.loadGlobalFeed = loadGlobalFeed;
window.renderMyCommunities = renderMyCommunities;
window.renderUsersList = renderUsersList;
window.renderProfile = renderProfile;

// ================= INITIALISATION AU CHARGEMENT DE LA PAGE =================
document.addEventListener('DOMContentLoaded', () => {
  
  // 1. Initialiser la navigation (boutons du menu en bas)
  initNavigation();

  // 2. Initialiser l'authentification (Connexion, Inscription, Firebase)
  initAuth();

  // 3. Initialiser les fonctionnalités des modules
  initFeed();
  initCommunities();
  initMessages();
  initProfile();

  // ================= GESTION DU MODE SOMBRE / CLAIR =================
  const themeToggleBtn = $('btn-theme-toggle-settings');
  
  // Vérifier si le mode clair était activé la dernière fois
  if(localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-mode');
  }
  
  function updateThemeBtnText() {
    if(!themeToggleBtn) return;
    themeToggleBtn.textContent = document.body.classList.contains('light-mode') 
      ? 'Passer en mode sombre 🌙' 
      : 'Passer en mode clair ☀️';
  }
  updateThemeBtnText();

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('light-mode');
      localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
      updateThemeBtnText();
    });
  }

  // ================= GESTION DE LA DICTÉE VOCALE (MICRO) =================
  // On cherche tous les boutons avec la classe "btn-mic" sur la page
  document.querySelectorAll('.btn-mic').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-target'); // Récupère l'ID du champ de texte cible
      const targetInput = $(targetId);
      if (!targetInput) return;
      
      // Vérifier si le navigateur supporte la reconnaissance vocale
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        return alert("La dictée vocale n'est pas supportée par votre navigateur.");
      }
      
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'fr-FR'; 
      recognition.interimResults = false;
      
      // Changer l'icône en rouge pendant l'enregistrement
      btn.textContent = "🔴"; 
      recognition.start();
      
      // Quand la parole est reconnue
      recognition.onresult = (event) => { 
        const transcript = event.results[0][0].transcript;
        targetInput.value += (targetInput.value ? " " : "") + transcript; 
        btn.textContent = "🎤"; 
      };
      
      // En cas d'erreur ou de fin
      recognition.onerror = () => { btn.textContent = "🎤"; };
      recognition.onend = () => { btn.textContent = "🎤"; };
    });
  });
});

// ================= ÉVÉNEMENT : UTILISATEUR PRÊT =================
// Cet événement est déclenché par "auth.js" dès que la connexion Firebase
// est réussie et que le profil utilisateur est chargé.
document.addEventListener('userReady', () => {
  // On charge le fil d'actualité par défaut
  loadGlobalFeed(true);
});
