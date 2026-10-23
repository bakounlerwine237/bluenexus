import { $ } from './utils.js';
import { state } from './state.js';

export function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = $(`view-${viewId}`);
  if(target) target.classList.add('active');
  
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
  if(navBtn) navBtn.classList.add('active');

  if (viewId === 'community' || viewId === 'chat') {
    if($('main-nav')) $('main-nav').style.display = 'none'; 
    if($('main-header')) $('main-header').style.display = 'none';
  } else {
    if($('main-nav')) $('main-nav').style.display = 'flex'; 
    if($('main-header')) $('main-header').style.display = 'flex';
    const titles = { home: "Accueil", communities: "Mes Communautés", search: "Recherche", profile: "Mon Profil", settings: "Paramètres", video: "Vidéo", messages: "Messages", notifications: "Notifications" };
    if($('page-title')) $('page-title').textContent = titles[viewId] || "BlueNexus";
  }

  if (viewId === 'home' && window.loadGlobalFeed) window.loadGlobalFeed(true);
  if (viewId === 'communities' && window.renderMyCommunities) window.renderMyCommunities();
  if (viewId === 'profile' && window.renderProfile) window.renderProfile();
  if (viewId === 'video' && window.loadMedia) window.loadMedia('video');
  if (viewId === 'messages' && window.renderUsersList) window.renderUsersList();
  if (viewId === 'notifications' && window.loadNotifications) window.loadNotifications();
}

export function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  
  if($('btn-settings-top')) $('btn-settings-top').addEventListener('click', () => switchView('settings'));
  if($('btn-go-communities')) $('btn-go-communities').addEventListener('click', () => switchView('communities'));
  if($('btn-back-home-comm')) $('btn-back-home-comm').addEventListener('click', () => switchView('home'));
  if($('btn-back-from-comm')) $('btn-back-from-comm').addEventListener('click', () => switchView('communities'));
  if($('btn-back-from-chat')) $('btn-back-from-chat').addEventListener('click', () => switchView('messages'));

  // --- GESTION DES ONGLETS ET DE LA ZONE DE CRÉATION ---
  if($('tab-discovery')) $('tab-discovery').addEventListener('click', () => {
    state.currentFeedMode = 'discovery';
    $('tab-discovery').className = 'btn-primary small';
    if($('tab-following')) $('tab-following').className = 'btn-secondary small';
    // ON AFFICHE LA ZONE DE CRÉATION
    if($('post-creation-container')) $('post-creation-container').style.display = 'flex';
    if(window.loadGlobalFeed) window.loadGlobalFeed(true);
  });
  
  if($('tab-following')) $('tab-following').addEventListener('click', () => {
    state.currentFeedMode = 'following';
    $('tab-following').className = 'btn-primary small';
    if($('tab-discovery')) $('tab-discovery').className = 'btn-secondary small';
    // ON CACHE LA ZONE DE CRÉATION
    if($('post-creation-container')) $('post-creation-container').style.display = 'none';
    if(window.loadGlobalFeed) window.loadGlobalFeed(true);
  });
}

// Fonction pour l'Empty State (bouton "Découvrir")
window.switchToDiscovery = () => {
  state.currentFeedMode = 'discovery';
  const tabDisco = document.getElementById('tab-discovery');
  const tabFollow = document.getElementById('tab-following');
  if(tabDisco) tabDisco.className = 'btn-primary small';
  if(tabFollow) tabFollow.className = 'btn-secondary small';
  // ON AFFICHE LA ZONE DE CRÉATION
  if(document.getElementById('post-creation-container')) document.getElementById('post-creation-container').style.display = 'flex';
  if(window.loadGlobalFeed) window.loadGlobalFeed(true);
};

window.searchFromPost = (term) => {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.value = term;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    if (window.switchView) window.switchView('search');
  }
};
