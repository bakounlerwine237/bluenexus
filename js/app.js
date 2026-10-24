import { $, speakText, translateText, toggleMoreMenu, sharePost } from './utils.js';

window.speakText = speakText;
window.translateText = translateText;
window.toggleMoreMenu = toggleMoreMenu;
window.sharePost = sharePost;

document.addEventListener('DOMContentLoaded', async () => {
  
  function logSuccess(moduleName) {
    const div = document.createElement('div');
    div.style.cssText = "position:fixed;top:10px;left:10px;background:green;color:white;padding:5px;z-index:9999;border-radius:5px;font-size:12px;";
    div.textContent = `✅ ${moduleName} OK`;
    document.body.appendChild(div);
  }

  function logError(moduleName, error) {
    const div = document.createElement('div');
    div.style.cssText = "position:fixed;top:10px;left:10px;background:red;color:white;padding:5px;z-index:9999;border-radius:5px;font-size:12px;";
    div.textContent = `❌ Erreur dans ${moduleName} : ${error.message}`;
    document.body.appendChild(div);
    console.error(`Erreur dans ${moduleName}:`, error);
  }

  // On teste chaque fichier UN PAR UN
  try { await import('./navigation.js'); logSuccess('Navigation'); } catch(e) { logError('navigation.js', e); }
  try { await import('./auth.js'); logSuccess('Auth'); } catch(e) { logError('auth.js', e); }
  try { await import('./feed.js'); logSuccess('Feed'); } catch(e) { logError('feed.js', e); }
  try { await import('./communities.js'); logSuccess('Communautés'); } catch(e) { logError('communities.js', e); }
  try { await import('./messages.js'); logSuccess('Messages'); } catch(e) { logError('messages.js', e); }
  try { await import('./profile.js'); logSuccess('Profil'); } catch(e) { logError('profile.js', e); }
  try { await import('./pages.js'); logSuccess('Pages'); } catch(e) { logError('pages.js', e); }
  try { await import('./notifications.js'); logSuccess('Notifications'); } catch(e) { logError('notifications.js', e); }
  try { await import('./video.js'); logSuccess('Vidéo'); } catch(e) { logError('video.js', e); }
  try { await import('./search.js'); logSuccess('Recherche'); } catch(e) { logError('search.js', e); }
  try { await import('./admin.js'); logSuccess('Admin'); } catch(e) { logError('admin.js', e); }

  // Ensuite on lance le site normalement
  try {
    const nav = await import('./navigation.js'); nav.initNavigation();
    const auth = await import('./auth.js'); auth.initAuth();
    
    const feed = await import('./feed.js'); feed.initFeed(); window.loadGlobalFeed = feed.loadGlobalFeed;
    const comms = await import('./communities.js'); comms.initCommunities(); window.renderMyCommunities = comms.renderMyCommunities;
    const msgs = await import('./messages.js'); msgs.initMessages(); window.renderUsersList = msgs.renderUsersList;
    const prof = await import('./profile.js'); prof.initProfile(); window.renderProfile = prof.renderProfile; window.openUserProfile = prof.openUserProfile;
    const pages = await import('./pages.js'); pages.initPages();
    const notifs = await import('./notifications.js'); notifs.initNotifications(); window.listenToNotifications = notifs.listenToNotifications; window.loadNotifications = notifs.loadNotifications;
    const vid = await import('./video.js'); vid.initVideo(); window.loadVideoFeed = vid.loadVideoFeed;
    const search = await import('./search.js'); search.initSearch();
    const admin = await import('./admin.js'); admin.initAdmin();
  } catch(e) {
    console.error("Erreur d'initialisation:", e);
  }
});
