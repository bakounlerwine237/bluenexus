import { $, speakText, translateText, toggleMoreMenu, sharePost } from './utils.js';
import { initNavigation, switchView } from './navigation.js';
import { initAuth } from './auth.js';

// On ne charge que le strict minimum pour tester
window.speakText = speakText;
window.translateText = translateText;

document.addEventListener('DOMContentLoaded', () => {
  console.log("Lancement du mode sans échec");
  initNavigation();
  initAuth();
  
  // Une petite alerte pour confirmer que le JS s'exécute
  alert("Le site est en mode sans échec !");
});
