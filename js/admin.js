// --- js/admin.js ---
import { db, state } from './state.js'; 
import { $, showToast, timeAgo } from './utils.js'; 
import { switchView } from './navigation.js'; 
import { collection, getDocs, doc, getDoc, deleteDoc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

// ✅ FONCTION GLOBALE INFAILLIBLE
window.openAdminPanel = () => {
  try {
    // On tente d'utiliser la fonction de navigation normale
    switchView('admin');
  } catch (e) {
    // Si ça plante (cache, etc.), on force l'affichage manuellement
    console.warn("Fallback manuel activé :", e);
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-admin');
    if(target) target.classList.add('active');
    
    const mainNav = document.getElementById('main-nav');
    const mainHeader = document.getElementById('main-header');
    if(mainNav) mainNav.style.display = 'flex';
    if(mainHeader) mainHeader.style.display = 'flex';
    
    const pageTitle = document.getElementById('page-title');
    if(pageTitle) pageTitle.textContent = "Panneau Admin";
  }
  
  // On charge les données du panneau
  loadDashboardStats();
  loadReports();
  switchAdminTab('dashboard');
};

export function initAdmin() { 
  // On garde aussi l'écouteur au cas où, mais le HTML s'en occupe déjà
  const adminBtn = $('btn-open-admin-panel');
  if(adminBtn) { 
    adminBtn.onclick = window.openAdminPanel; 
  } 

  const backBtn = $('btn-back-to-settings');
  if(backBtn) { 
    backBtn.onclick = () => { 
      if (window.switchView) window.switchView('settings'); 
    }; 
  } 

  if($('admin-tab-dashboard')) $('admin-tab-dashboard').onclick = () => switchAdminTab('dashboard');
  if($('admin-tab-users')) $('admin-tab-users').onclick = () => { switchAdminTab('users'); loadUsersList(); };
  if($('admin-tab-reports')) $('admin-tab-reports').onclick = () => { switchAdminTab('reports'); loadReports(); };

  if($('admin-search-user')) {
    $('admin-search-user').oninput = (e) => {
      const term = e.target.value.toLowerCase();
      const items = document.querySelectorAll('#admin-users-list .tg-item');
      items.forEach(item => {
        const name = item.querySelector('.tg-title').textContent.toLowerCase();
        item.style.display = name.includes(term) ? 'flex' : 'none';
      });
    };
  }
}

function switchAdminTab(tab) {
  if($('admin-content-dashboard')) $('admin-content-dashboard').style.display = 'none';
  if($('admin-content-users')) $('admin-content-users').style.display = 'none';
  if($('admin-content-reports')) $('admin-content-reports').style.display = 'none';

  if($('admin-tab-dashboard')) $('admin-tab-dashboard').className = 'btn-secondary small';
  if($('admin-tab-users')) $('admin-tab-users').className = 'btn-secondary small';
  if($('admin-tab-reports')) $('admin-tab-reports').className = 'btn-secondary small';

  if (tab === 'dashboard') {
    if($('admin-content-dashboard')) $('admin-content-dashboard').style.display = 'block';
    if($('admin-tab-dashboard')) $('admin-tab-dashboard').className = 'btn-primary small';
  } else if (tab === 'users') {
    if($('admin-content-users')) $('admin-content-users').style.display = 'block';
    if($('admin-tab-users')) $('admin-tab-users').className = 'btn-primary small';
  } else if (tab === 'reports') {
    if($('admin-content-reports')) $('admin-content-reports').style.display = 'block';
    if($('admin-tab-reports')) $('admin-tab-reports').className = 'btn-primary small';
  }
}

async function loadDashboardStats() {
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const postsSnap = await getDocs(collection(db, 'posts'));
    const commsSnap = await getDocs(collection(db, 'communities'));
    
    if($('admin-stat-users')) $('admin-stat-users').textContent = usersSnap.size;
    if($('admin-stat-posts')) $('admin-stat-posts').textContent = postsSnap.size;
    if($('admin-stat-comms')) $('admin-stat-comms').textContent = commsSnap.size;
  } catch(e) {
    console.error("Erreur stats:", e);
  }
}

async function loadUsersList() {
  const list = $('admin-users-list');
  if(!list) return;
  list.innerHTML = '<p class="muted" style="padding:1rem;">Chargement...</p>';
  try {
    const snap = await getDocs(collection(db, 'users'));
    list.innerHTML = '';
    snap.forEach(d => {
      const u = d.data();
      const avatar = u.photoURL ? `<img src="${u.photoURL}" class="tg-avatar">` : `<div class="tg-avatar">${u.username[0].toUpperCase()}</div>`;
      const badges = (u.badges || []).join(', ');
      
      list.innerHTML += `
        <div class="tg-item" style="cursor: default;">
          ${avatar}
          <div class="tg-content">
            <div class="tg-title">${u.username} ${u.role === 'admin' ? '👑' : ''}</div>
            <div class="tg-subtitle">Badges: ${badges || 'Aucun'}</div>
          </div>
          <button onclick="window.openBadgeModal('${d.id}', '${u.username}')" class="btn-primary small" style="padding: 5px 10px; font-size: 0.75rem;">🎖️ Badge</button>
        </div>
      `;
    });
  } catch(e) {
    list.innerHTML = '<p class="muted" style="color:red;">Erreur de chargement.</p>';
  }
}

window.openBadgeModal = (userId, username) => {
  const badge = prompt(`Donner un badge à @${username} (ex: Vérifié, Partenaire, VIP).\nLaissez vide pour annuler.`);
  if (badge && badge.trim() !== "") {
    window.addBadgeToUser(userId, badge.trim());
  }
};

window.addBadgeToUser = async (userId, badgeName) => {
  try {
    await updateDoc(doc(db, 'users', userId), {
      badges: arrayUnion(badgeName)
    });
    showToast(`✅ Badge "${badgeName}" ajouté !`, "success");
    loadUsersList();
  } catch(e) {
    showToast("Erreur : " + e.message, "error");
  }
};

async function loadReports() { 
  const list = $('admin-reports-list'); 
  if(!list) return; 
  list.innerHTML = '<p class="muted" style="padding: 1rem;">Chargement des signalements...</p>'; 
  try { 
    const snap = await getDocs(collection(db, 'reports')); 
    if(snap.empty) { 
      list.innerHTML = '<p class="muted" style="padding: 1rem; text-align: center;">Aucun signalement. 🎉</p>'; 
      return; 
    } 
    list.innerHTML = ''; 
    for (const reportDoc of snap.docs) { 
      const report = reportDoc.data(); 
      let postContent = "[Post introuvable ou déjà supprimé]"; 
      try { 
        const postSnap = await getDoc(doc(db, 'posts', report.postId)); 
        if(postSnap.exists()) postContent = postSnap.data().content; 
      } catch(e) {} 
      list.innerHTML += `<div class="media-item" style="border-color: #ef4444;"><strong style="color: #ef4444;">⚠️ ${report.reason}</strong><p class="muted" style="font-size: 0.8rem;">Par @${report.reporterName} - ${timeAgo(report.createdAt)}</p><p style="background: var(--bg); padding: 10px; margin: 10px 0; border-radius: 8px;">${postContent}</p><button onclick="window.adminDeletePost('${report.postId}', '${reportDoc.id}')" class="btn-primary small" style="background: #ef4444;">Supprimer le post</button><button onclick="window.adminIgnoreReport('${reportDoc.id}')" class="btn-secondary small">Ignorer</button></div>`; 
    } 
  } catch(e) { 
    list.innerHTML = '<p class="muted">Erreur de chargement.</p>'; 
  } 
}

window.adminDeletePost = async (postId, reportId) => { 
  if(!confirm("Supprimer définitivement ce post ?")) return; 
  try { 
    await deleteDoc(doc(db, 'posts', postId)); 
    await deleteDoc(doc(db, 'reports', reportId)); 
    showToast("🗑️ Post supprimé.", "success"); 
    loadReports(); 
  } catch(e) { 
    showToast("Erreur.", "error"); 
  } 
};

window.adminIgnoreReport = async (reportId) => { 
  if(!confirm("Ignorer ce signalement ?")) return; 
  try { 
    await deleteDoc(doc(db, 'reports', reportId)); 
    showToast("Ignoré.", "success"); 
    loadReports(); 
  } catch(e) { 
    showToast("Erreur.", "error"); 
  } 
};
