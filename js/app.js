// --- js/app.js ---
import { $, speakText, translateText, toggleMoreMenu, sharePost, getLevelInfo } from './utils.js';
import { initNavigation } from './navigation.js';
import { initAuth } from './auth.js';
import { initFeed, loadGlobalFeed, populatePageSelector } from './feed.js';
import { initCommunities, renderMyCommunities } from './communities.js';
import { initMessages, renderUsersList } from './messages.js';
import { initProfile, renderProfile, openUserProfile } from './profile.js';
import { initPages } from './pages.js';
import { initNotifications, listenToNotifications, loadNotifications } from './notifications.js';
import { initVideo, loadVideoFeed } from './video.js';
import { initSearch } from './search.js';
import { initAdmin } from './admin.js';
import { initSettings } from './settings.js';
import { initStories, loadStories } from './stories.js';
import { db, state } from './state.js';
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, limit, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

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
window.populatePageSelector = populatePageSelector;

function listenToUnreadMessages() {
  if(!state.currentUser) return;
  const q = query(collection(db, 'messages'), where('toUser', '==', state.currentUser.uid), where('read', '==', false));
  onSnapshot(q, (snap) => {
    const badge = $('msg-badge');
    if(!badge) return;
    if(snap.docs.length > 0) { badge.style.display = 'block'; badge.textContent = snap.docs.length; } 
    else { badge.style.display = 'none'; }
  });
}

// --- LOGIQUE TOP CREATEURS ---
window.loadTopCreators = async () => {
  const container = $('top-creators-list');
  if (!container) return;
  container.innerHTML = '<p class="muted" style="text-align:center;">Chargement...</p>';
  
  try {
    // Récupérer tous les utilisateurs et trier par XP
    const snap = await getDocs(collection(db, 'users'));
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    users.sort((a, b) => (b.xp || 0) - (a.xp || 0));
    
    const top10 = users.slice(0, 10);
    let html = '';
    
    top10.forEach((u, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
      const avatar = u.photoURL ? `<img src="${u.photoURL}" class="tg-avatar">` : `<div class="tg-avatar">${u.username[0].toUpperCase()}</div>`;
      const levelInfo = getLevelInfo(u.xp || 0);
      
      html += `<div class="tg-item" onclick="document.getElementById('modal-top-creators').classList.add('hidden'); window.openUserProfile('${u.id}')">
        <div style="font-size: 1.2rem; margin-right: 10px; width: 30px; text-align: center;">${medal}</div>
        ${avatar}
        <div class="tg-content">
          <div class="tg-title">${u.username} ${u.role === 'admin' ? '👑' : ''}</div>
          <div class="tg-subtitle">${levelInfo.title} · ${u.xp || 0} XP</div>
        </div>
      </div>`;
    });
    
    container.innerHTML = html;
  } catch(e) { container.innerHTML = '<p class="muted" style="color:red;">Erreur de chargement.</p>'; }
};

document.addEventListener('DOMContentLoaded', () => {
  try { initNavigation(); } catch(e) { console.error(e); } 
  try { initAuth(); } catch(e) { console.error(e); } 
  try { initFeed(); } catch(e) { console.error(e); } 
  try { initCommunities(); } catch(e) { console.error(e); } 
  try { initMessages(); } catch(e) { console.error(e); } 
  try { initProfile(); } catch(e) { console.error(e); } 
  try { initPages(); } catch(e) { console.error(e); } 
  try { initNotifications(); } catch(e) { console.error(e); } 
  try { initVideo(); } catch(e) { console.error(e); } 
  try { initSearch(); } catch(e) { console.error(e); } 
  try { initAdmin(); } catch(e) { console.error(e); } 
  try { initSettings(); } catch(e) { console.error(e); } 
  try { initStories(); } catch(e) { console.error(e); }

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
      btn.textContent = "🔴"; 
      recognition.start(); 
      recognition.onresult = (event) => { targetInput.value += " " + event.results[0][0].transcript; btn.textContent = "🎤"; }; 
      recognition.onerror = () => btn.textContent = "🎤"; 
      recognition.onend = () => btn.textContent = "🎤"; 
    }); 
  });

  let deferredPrompt;
  const installContainer = document.getElementById('pwa-install-container');
  const installBtn = document.getElementById('btn-install-pwa');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    if(installContainer) installContainer.style.display = 'block';
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') installContainer.style.display = 'none';
      deferredPrompt = null;
    });
  }

  const premiumBtn = document.getElementById('btn-go-premium');
  if (premiumBtn) {
    premiumBtn.addEventListener('click', () => {
      const phone = "237650284435";
      const message = encodeURIComponent("Bonjour Admin, je souhaite passer au compte BlueNexus Premium. Mon pseudo est : " + (state.userProfile ? state.userProfile.username : ""));
      window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
    });
  }

  const ecoBtn = document.getElementById('btn-eco-mode');
  const isEcoMode = localStorage.getItem('bluenexus_eco_mode') === 'true';

  if (isEcoMode) {
    document.body.classList.add('eco-mode');
    if(ecoBtn) ecoBtn.classList.add('active');
  }

  if (ecoBtn) {
    ecoBtn.addEventListener('click', () => {
      document.body.classList.toggle('eco-mode');
      const isNowEco = document.body.classList.contains('eco-mode');
      localStorage.setItem('bluenexus_eco_mode', isNowEco);
      if (isNowEco) { ecoBtn.classList.add('active'); if(window.showToast) window.showToast("🍃 Mode Éco activé."); } 
      else { ecoBtn.classList.remove('active'); if(window.showToast) window.showToast("Mode Éco désactivé."); }
    });
  }

  const shopModal = $('modal-shop');
  if (shopModal) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class' && !shopModal.classList.contains('hidden')) {
          if ($('shop-coins-balance') && state.userProfile) $('shop-coins-balance').textContent = state.userProfile.coins || 0;
        }
      });
    });
    observer.observe(shopModal, { attributes: true });
  }

  window.buyShopItem = async (itemType, price) => {
    if (!state.currentUser || !state.userProfile) return;
    const currentCoins = state.userProfile.coins || 0;
    if (currentCoins < price) return window.showToast("❌ Solde insuffisant. Il vous manque " + (price - currentCoins) + " 🪙", "error");
    if (!confirm(`Voulez-vous acheter cet article pour ${price} 🪙 Nexus Coins ?`)) return;
    try {
      const userRef = doc(db, 'users', state.currentUser.uid);
      const newCoins = currentCoins - price;
      let updates = { coins: newCoins };
      if (itemType === 'stars' || itemType === 'sakura') updates.profileEffect = itemType;
      else if (itemType === 'premium') updates.isPremium = true;
      else if (itemType === 'boost') {
        const q = query(collection(db, 'posts'), where('authorId', '==', state.currentUser.uid), orderBy('createdAt', 'desc'), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) await updateDoc(doc(db, 'posts', snap.docs[0].id), { createdAt: serverTimestamp() });
      }
      await updateDoc(userRef, updates);
      state.userProfile.coins = newCoins;
      if (updates.profileEffect) state.userProfile.profileEffect = updates.profileEffect;
      if (updates.isPremium) state.userProfile.isPremium = true;
      if ($('shop-coins-balance')) $('shop-coins-balance').textContent = newCoins;
      if ($('profile-coins')) $('profile-coins').textContent = newCoins;
      window.showToast("✅ Achat réussi !", "success");
      setTimeout(() => {
        if (shopModal) shopModal.classList.add('hidden');
        if (window.renderProfile) window.renderProfile();
        if (itemType === 'boost' && window.loadGlobalFeed) window.loadGlobalFeed(true);
      }, 1000);
    } catch (e) { window.showToast("Erreur lors de l'achat : " + e.message, "error"); }
  };

  const copyRefBtn = $('btn-copy-referral');
  if (copyRefBtn) {
    copyRefBtn.addEventListener('click', () => {
      navigator.clipboard.writeText($('my-referral-code').value).then(() => window.showToast("✅ Code de parrainage copié !"));
    });
  }

  const shareRefBtn = $('btn-share-referral');
  if (shareRefBtn) {
    shareRefBtn.addEventListener('click', () => {
      const code = $('my-referral-code').value;
      const siteUrl = "https://bluenexus-psi.vercel.app"; 
      const message = encodeURIComponent(`Rejoins-moi sur BlueNexus ! 🚀\nCode de parrainage : *${code}*\n${siteUrl}`);
      window.open(`https://wa.me/?text=${message}`, '_blank');
    });
  }

  window.checkDailyBonus = () => {
    if (!state.userProfile) return;
    const banner = $('daily-bonus-banner');
    if (!banner) return;
    const lastClaim = state.userProfile.lastDailyClaim || 0;
    const hoursElapsed = (Date.now() - lastClaim) / (1000 * 60 * 60);
    banner.style.display = (!lastClaim || hoursElapsed >= 24) ? 'block' : 'none';
  };

  if($('btn-close-daily')) $('btn-close-daily').addEventListener('click', () => $('modal-daily').classList.add('hidden'));

  if($('btn-claim-daily')) {
    $('btn-claim-daily').addEventListener('click', async () => {
      if (!state.userProfile || !state.currentUser) return;
      const lastClaim = state.userProfile.lastDailyClaim || 0;
      const hoursElapsed = (Date.now() - lastClaim) / (1000 * 60 * 60);
      if (hoursElapsed < 24) return window.showToast(`⏳ Revenez dans ${Math.ceil(24 - hoursElapsed)}h`, "error");
      
      let streak = state.userProfile.dailyStreak || 0;
      streak = (hoursElapsed < 48) ? streak + 1 : 1;
      
      const rewards = [25, 50, 75, 100, 150];
      let reward = rewards[Math.floor(Math.random() * rewards.length)];
      if (streak >= 7) reward += 150;
      else if (streak > 1) reward += streak * 10;
      
      try {
        const userRef = doc(db, 'users', state.currentUser.uid);
        const currentCoins = state.userProfile.coins || 0;
        await updateDoc(userRef, { coins: currentCoins + reward, lastDailyClaim: Date.now(), dailyStreak: streak });
        state.userProfile.coins = currentCoins + reward;
        state.userProfile.lastDailyClaim = Date.now();
        state.userProfile.dailyStreak = streak;
        
        $('daily-gift-display').textContent = '🎉';
        window.showToast(`🎉 +${reward} 🪙 Nexus Coins !`, "success");
        setTimeout(() => {
          $('modal-daily').classList.add('hidden');
          $('daily-bonus-banner').style.display = 'none';
          $('daily-gift-display').textContent = '📦';
          if (window.renderProfile) window.renderProfile();
        }, 2000);
      } catch (e) { window.showToast("Erreur : " + e.message, "error"); }
    });
  }
});

document.addEventListener('userReady', () => { 
  try { loadGlobalFeed(true); } catch(e) { console.error(e); } 
  try { listenToNotifications(); } catch(e) { console.error(e); } 
  try { listenToUnreadMessages(); } catch(e) { console.error(e); } 
  try { loadStories(); } catch(e) { console.error(e); } 
  try { populatePageSelector(); } catch(e) { console.error(e); } 
  try { window.checkDailyBonus(); } catch(e) { console.error(e); }
  if(document.getElementById('view-profile').classList.contains('active')) { try { renderProfile(); } catch(e) { console.error(e); } } 
});
