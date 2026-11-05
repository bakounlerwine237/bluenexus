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
    const titles = { home: "Accueil", communities: "Groupes", search: "Recherche", profile: "Mon Profil", settings: "Paramètres", video: "Vidéo", messages: "Messages", notifications: "Notifications", admin: "Panneau Admin" }; 
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
  if($('btn-back-from-comm')) $('btn-back-from-comm').addEventListener('click', () => switchView('communities')); 
  if($('btn-back-from-chat')) $('btn-back-from-chat').addEventListener('click', () => switchView('messages')); 
  
  const tabDiscovery = $('tab-discovery');
  const tabFollowing = $('tab-following');
  const tabTrending = $('tab-trending');

  function resetFeedTabs() {
    if(tabDiscovery) tabDiscovery.classList.remove('active');
    if(tabFollowing) tabFollowing.classList.remove('active');
    if(tabTrending) tabTrending.classList.remove('active');
    if($('tab-opportunities')) $('tab-opportunities').classList.remove('active');
    if($('tab-confessions')) $('tab-confessions').classList.remove('active');
    if($('tab-events')) $('tab-events').classList.remove('active');
  }

  if(tabDiscovery) { 
    tabDiscovery.addEventListener('click', () => { 
      resetFeedTabs(); state.currentFeedMode = 'discovery'; 
      tabDiscovery.classList.add('active');
      if($('post-creation-container')) $('post-creation-container').style.display = 'flex'; 
      if($('btn-float-opp')) $('btn-float-opp').style.display = 'none';
      if($('btn-float-event')) $('btn-float-event').style.display = 'none';
      if(window.loadGlobalFeed) window.loadGlobalFeed(true); 
    }); 
  } 
  if(tabFollowing) { 
    tabFollowing.addEventListener('click', () => { 
      resetFeedTabs(); state.currentFeedMode = 'following'; 
      tabFollowing.classList.add('active');
      if($('post-creation-container')) $('post-creation-container').style.display = 'none'; 
      if($('btn-float-opp')) $('btn-float-opp').style.display = 'none';
      if($('btn-float-event')) $('btn-float-event').style.display = 'none';
      if($('suggested-users-container')) $('suggested-users-container').style.display = 'none';
      if(window.loadGlobalFeed) window.loadGlobalFeed(true); 
    }); 
  } 
  if(tabTrending) { 
    tabTrending.addEventListener('click', () => { 
      resetFeedTabs(); state.currentFeedMode = 'trending'; 
      tabTrending.classList.add('active');
      if($('post-creation-container')) $('post-creation-container').style.display = 'none'; 
      if($('btn-float-opp')) $('btn-float-opp').style.display = 'none';
      if($('btn-float-event')) $('btn-float-event').style.display = 'none';
      if($('suggested-users-container')) $('suggested-users-container').style.display = 'none';
      if(window.loadGlobalFeed) window.loadGlobalFeed(true); 
    }); 
  } 
}

window.switchToDiscovery = () => { 
  state.currentFeedMode = 'discovery'; 
  const tabDisco = document.getElementById('tab-discovery'); 
  const tabFollow = document.getElementById('tab-following'); 
  const tabTrend = document.getElementById('tab-trending'); 
  const tabOpp = document.getElementById('tab-opportunities');
  const tabConf = document.getElementById('tab-confessions');
  const tabEvent = document.getElementById('tab-events');
  
  if(tabDisco) tabDisco.classList.add('active');
  if(tabFollow) tabFollow.classList.remove('active');
  if(tabTrend) tabTrend.classList.remove('active');
  if(tabOpp) tabOpp.classList.remove('active');
  if(tabConf) tabConf.classList.remove('active');
  if(tabEvent) tabEvent.classList.remove('active');
  
  if(document.getElementById('post-creation-container')) document.getElementById('post-creation-container').style.display = 'flex'; 
  if(document.getElementById('btn-float-opp')) document.getElementById('btn-float-opp').style.display = 'none';
  if(document.getElementById('btn-float-event')) document.getElementById('btn-float-event').style.display = 'none';
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

window.switchView = switchView;
