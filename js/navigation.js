import { $ } from './utils.js';

// On importe les fonctions de rendu des autres modules (on les ajoutera au fur et à mesure)
// import { loadGlobalFeed } from './feed.js';
// import { renderMyCommunities } from './communities.js';

export function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = $(`view-${viewId}`);
  if(target) target.classList.add('active');
  
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
  if(navBtn) navBtn.classList.add('active');

  // Gestion de l'en-tête (cacher la barre du haut pour le chat)
  if (viewId === 'community' || viewId === 'chat') {
    if($('main-nav')) $('main-nav').style.display = 'none'; 
    if($('main-header')) $('main-header').style.display = 'none';
  } else {
    if($('main-nav')) $('main-nav').style.display = 'flex'; 
    if($('main-header')) $('main-header').style.display = 'flex';
    const titles = { home: "Accueil", communities: "Mes Communautés", search: "Recherche", profile: "Mon Profil", settings: "Paramètres", video: "Vidéo", messages: "Messages", notifications: "Notifications" };
    if($('page-title')) $('page-title').textContent = titles[viewId] || "BlueNexus";
  }

  // Appel des fonctions de chargement (à décommenter au fur et à mesure)
  /*
  if (viewId === 'home') loadGlobalFeed(true);
  if (viewId === 'communities') renderMyCommunities();
  if (viewId === 'profile') renderProfile();
  if (viewId === 'video') loadMedia('video');
  if (viewId === 'messages') renderUsersList();
  if (viewId === 'notifications') loadNotifications();
  */
}

// Écouteurs de clics sur les boutons de navigation
export function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  
  if($('btn-settings-top')) $('btn-settings-top').addEventListener('click', () => switchView('settings'));
  if($('btn-go-communities')) $('btn-go-communities').addEventListener('click', () => switchView('communities'));
  if($('btn-back-home-comm')) $('btn-back-home-comm').addEventListener('click', () => switchView('home'));
  if($('btn-back-from-comm')) $('btn-back-from-comm').addEventListener('click', () => switchView('communities'));
  if($('btn-back-from-chat')) $('btn-back-from-chat').addEventListener('click', () => switchView('messages'));

  // Onglets Accueil
  if($('tab-discovery')) $('tab-discovery').addEventListener('click', () => {
    window.currentFeedMode = 'discovery';
    $('tab-discovery').className = 'btn-primary small';
    if($('tab-following')) $('tab-following').className = 'btn-secondary small';
    if(window.loadGlobalFeed) window.loadGlobalFeed(true);
  });
  if($('tab-following')) $('tab-following').addEventListener('click', () => {
    window.currentFeedMode = 'following';
    $('tab-following').className = 'btn-primary small';
    if($('tab-discovery')) $('tab-discovery').className = 'btn-secondary small';
    if(window.loadGlobalFeed) window.loadGlobalFeed(true);
  });
}
