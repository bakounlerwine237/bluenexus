// --- js/app.js ---
import { $, speakText, translateText, toggleMoreMenu, sharePost } from './utils.js';
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
      if (isNowEco) {
        ecoBtn.classList.add('active');
        if(window.showToast) window.showToast("🍃 Mode Éco activé.");
      } else {
        ecoBtn.classList.remove('active');
        if(window.showToast) window.showToast("Mode Éco désactivé.");
      }
    });
  }

  // --- LOGIQUE BOUTIQUE NEXUS ---
  const shopModal = $('modal-shop');
  
  if (shopModal) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class' && !shopModal.classList.contains('hidden')) {
          if ($('shop-coins-balance') && state.userProfile) {
            $('shop-coins-balance').textContent = state.userProfile.coins || 0;
          }
        }
      });
    });
    observer.observe(shopModal, { attributes: true });
  }

  window.buyShopItem = async (itemType, price) => {
    if (!state.currentUser || !state.userProfile) return;
    const currentCoins = state.userProfile.coins || 0;

    if (currentCoins < price) {
      if (window.showToast) window.showToast("❌ Solde insuffisant. Il vous manque " + (price - currentCoins) + " 🪙", "error");
      return;
    }

    if (!confirm(`Voulez-vous acheter cet article pour ${price} 🪙 Nexus Coins ?`)) return;

    try {
      const userRef = doc(db, 'users', state.currentUser.uid);
      const newCoins = currentCoins - price;
      let updates = { coins: newCoins };

      if (itemType === 'stars' || itemType === 'sakura') {
        updates.profileEffect = itemType;
      } else if (itemType === 'premium') {
        updates.isPremium = true;
      } else if (itemType === 'boost') {
        const q = query(collection(db, 'posts'), where('authorId', '==', state.currentUser.uid), orderBy('createdAt', 'desc'), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          await updateDoc(doc(db, 'posts', snap.docs[0].id), { createdAt: serverTimestamp() });
        }
      }

      await updateDoc(userRef, updates);
      state.userProfile.coins = newCoins;
      if (updates.profileEffect) state.userProfile.profileEffect = updates.profileEffect;
      if (updates.isPremium) state.userProfile.isPremium = true;

      if ($('shop-coins-balance')) $('shop-coins-balance').textContent = newCoins;
      if ($('profile-coins')) $('profile-coins').textContent = newCoins;
      
      if (window.showToast) window.showToast("✅ Achat réussi !", "success");
      
      setTimeout(() => {
        if (shopModal) shopModal.classList.add('hidden');
        if (window.renderProfile) window.renderProfile();
        if (itemType === 'boost' && window.loadGlobalFeed) window.loadGlobalFeed(true);
      }, 1000);

    } catch (e) {
      console.error(e);
      if (window.showToast) window.showToast("Erreur lors de l'achat : " + e.message, "error");
    }
  };

  // --- LOGIQUE PARRAINAGE ---
  const copyRefBtn = $('btn-copy-referral');
  if (copyRefBtn) {
    copyRefBtn.addEventListener('click', () => {
      const code = $('my-referral-code').value;
      navigator.clipboard.writeText(code).then(() => {
        if(window.showToast) window.showToast("✅ Code de parrainage copié !");
      });
    });
  }

  const shareRefBtn = $('btn-share-referral');
  if (shareRefBtn) {
    shareRefBtn.addEventListener('click', () => {
      const code = $('my-referral-code').value;
      // Lien vers ton site - à adapter si besoin
      const siteUrl = "https://bluenexus-psi.vercel.app"; 
      const message = encodeURIComponent(`Rejoins-moi sur BlueNexus, le nouveau réseau social ! 🚀\n\nUtilise mon code de parrainage lors de ton inscription : *${code}*\n\nOn gagne tous les deux des Nexus Coins ! 🪙\n\n${siteUrl}`);
      window.open(`https://wa.me/?text=${message}`, '_blank');
    });
  }
});

document.addEventListener('userReady', () => { 
  try { loadGlobalFeed(true); } catch(e) { console.error(e); } 
  try { listenToNotifications(); } catch(e) { console.error(e); } 
  try { listenToUnreadMessages(); } catch(e) { console.error(e); } 
  try { loadStories(); } catch(e) { console.error(e); } 
  try { populatePageSelector(); } catch(e) { console.error(e); } 
  if(document.getElementById('view-profile').classList.contains('active')) { 
    try { renderProfile(); } catch(e) { console.error(e); } 
  } 
});
