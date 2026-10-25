// --- js/navigation.js ---
import { $ } from './utils.js'; 
import { state } from './state.js';

export function switchView(viewId) { 
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); 
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active')); 
  const target = $(`view-${viewId}`); 
  if(target) target.classList.add('active'); 
  const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`); 
  if(navBtn) navBtn.classList.add('active'); 
  if (viewId === 'community' || viewId === 'chat' || viewId === 'page') { 
    if($('main-nav')) $('main-nav').style.display = 'none'; 
    if($('main-header')) $('main-header').style.display = 'none'; 
  } else { 
    if($('main-nav')) $('main-nav').style.display = 'flex'; 
    if($('main-header')) $('main-header').style.display = 'flex'; 
    const titles = { home: "Accueil", communities: "Communautés", search: "Recherche", profile: "Mon Profil", settings: "Paramètres", video: "Vidéo", messages: "Messages", notifications: "Notifications", admin: "Panneau Admin" }; 
    if($('page-title')) $('page-title').textContent = titles[viewId] || "BlueNexus"; 
  } 
  if (viewId === 'home' && window.loadGlobalFeed) window.loadGlobalFeed(true); 
  if (viewId === 'communities' && window.renderMyCommunities) window.renderMyCommunities(); 
  if (viewId === 'video' && window.loadVideoFeed) window.loadVideoFeed(); 
  if (viewId === 'messages' && window.renderUsersList) window.renderUsersList(); 
  if (viewId === 'notifications' && window.loadNotifications) window.loadNotifications(); 
}

export function initNavigation() { 
  document.querySelectorAll('.nav-btn').forEach(btn => { 
    btn.addEventListener('click', () => { 
      const viewId = btn.dataset.view; 
      switchView(viewId); 
      if (viewId === 'profile' && window.renderProfile) window.renderProfile(); 
    }); 
  }); 
  if($('btn-settings-top')) $('btn-settings-top').addEventListener('click', () => switchView('settings')); 
  if($('btn-go-communities')) $('btn-go-communities').addEventListener('click', () => switchView('communities')); 
  if($('btn-back-home-comm')) $('btn-back-home-comm').addEventListener('click', () => switchView('home')); 
  if($('btn-back-from-comm')) $('btn-back-from-comm').addEventListener('click', () => switchView('communities')); 
  if($('btn-back-from-chat')) $('btn-back-from-chat').addEventListener('click', () => switchView('messages')); 
  
  if($('tab-discovery')) { 
    $('tab-discovery').addEventListener('click', () => { 
      state.currentFeedMode = 'discovery'; 
      $('tab-discovery').className = 'btn-primary small'; 
      if($('tab-following')) $('tab-following').className = 'btn-secondary small'; 
      if($('tab-trending')) $('tab-trending').className = 'btn-secondary small'; 
      if($('post-creation-container')) $('post-creation-container').style.display = 'flex'; 
      if(window.loadGlobalFeed) window.loadGlobalFeed(true); 
    }); 
  } 
  if($('tab-following')) { 
    $('tab-following').addEventListener('click', () => { 
      state.currentFeedMode = 'following'; 
      $('tab-following').className = 'btn-primary small'; 
      if($('tab-discovery')) $('tab-discovery').className = 'btn-secondary small'; 
      if($('tab-trending')) $('tab-trending').className = 'btn-secondary small'; 
      if($('post-creation-container')) $('post-creation-container').style.display = 'none'; 
      if(window.loadGlobalFeed) window.loadGlobalFeed(true); 
    }); 
  } 
  if($('tab-trending')) { 
    $('tab-trending').addEventListener('click', () => { 
      state.currentFeedMode = 'trending'; 
      $('tab-trending').className = 'btn-primary small'; 
      if($('tab-discovery')) $('tab-discovery').className = 'btn-secondary small'; 
      if($('tab-following')) $('tab-following').className = 'btn-secondary small'; 
      if($('post-creation-container')) $('post-creation-container').style.display = 'none'; 
      if(window.loadGlobalFeed) window.loadGlobalFeed(true); 
    }); 
  } 
}

window.switchToDiscovery = () => { 
  state.currentFeedMode = 'discovery'; 
  const tabDisco = document.getElementById('tab-discovery'); 
  const tabFollow = document.getElementById('tab-following'); 
  const tabTrend = document.getElementById('tab-trending'); 
  if(tabDisco) tabDisco.className = 'btn-primary small'; 
  if(tabFollow) tabFollow.className = 'btn-secondary small'; 
  if(tabTrend) tabTrend.className = 'btn-secondary small'; 
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
}
