import { db, currentUser, userProfile } from './auth.js';
import { switchView } from './ui.js';

// Importation de nos modules (qui vont s'exécuter tout seuls)
import './feed.js';
import './communities.js';

// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});
document.getElementById('btn-settings-top').addEventListener('click', () => switchView('settings'));
document.getElementById('btn-go-communities').addEventListener('click', () => switchView('communities'));
document.getElementById('btn-back-home-comm').addEventListener('click', () => switchView('home'));
document.getElementById('btn-back-from-comm').addEventListener('click', () => switchView('communities'));

// Exposer les fonctions pour les boutons HTML
window.switchView = switchView;
