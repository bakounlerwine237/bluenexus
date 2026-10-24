import { db, state } from './state.js';
import { $, showToast, timeAgo } from './utils.js';
import { collection, query, where, getDocs, doc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

export function initAdmin() {
  if($('btn-open-admin-panel')) {
    $('btn-open-admin-panel').addEventListener('click', () => {
      if(window.switchView) window.switchView('admin');
      loadReports();
    });
  }

  if($('btn-back-to-settings')) {
    $('btn-back-to-settings').addEventListener('click', () => {
      if(window.switchView) window.switchView('settings');
    });
  }
}

async function loadReports() {
  const list = $('admin-reports-list');
  if(!list) return;
  list.innerHTML = '<p class="muted" style="padding: 1rem;">Chargement des signalements...</p>';

  try {
    const q = query(collection(db, 'reports'));
    const snap = await getDocs(q);

    if(snap.empty) {
      list.innerHTML = '<p class="muted" style="padding: 1rem;">Aucun signalement pour le moment. 🎉</p>';
      return;
    }

    list.innerHTML = '';

    for (const reportDoc of snap.docs) {
      const report = reportDoc.data();
      let postContent = "[Post supprimé ou introuvable]";
      
      try {
        const postSnap = await getDoc(doc(db, 'posts', report.postId));
        if(postSnap.exists()) {
          postContent = postSnap.data().content;
        }
      } catch(e) { console.error(e); }

      list.innerHTML += `
        <div class="media-item" style="border-color: #ef4444; padding: 1rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <strong style="color: #ef4444;">⚠️ Motif : ${report.reason}</strong>
            <span class="muted" style="font-size: 0.75rem;">${timeAgo(report.createdAt)}</span>
          </div>
          <p class="muted" style="font-size: 0.8rem; margin-bottom: 5px;">Signalé par @${report.reporterName}</p>
          <div style="background: var(--bg); padding: 10px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 10px;">
            <p style="font-size: 0.9rem;">${postContent}</p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button onclick="window.adminDeletePost('${report.postId}', '${reportDoc.id}')" class="btn-primary small" style="background: #ef4444; flex: 1;">Supprimer le post</button>
            <button onclick="window.adminIgnoreReport('${reportDoc.id}')" class="btn-secondary small" style="flex: 1;">Ignorer</button>
          </div>
        </div>
      `;
    }
  } catch(e) {
    console.error(e);
    list.innerHTML = '<p class="muted" style="padding: 1rem;">Erreur de chargement des signalements.</p>';
  }
}

window.adminDeletePost = async (postId, reportId) => {
  if(!confirm("Voulez-vous vraiment supprimer ce post et clôturer le signalement ?")) return;
  try {
    await deleteDoc(doc(db, 'posts', postId));
    await deleteDoc(doc(db, 'reports', reportId));
    showToast("🗑️ Post supprimé et signalement traité.", "success");
    loadReports();
  } catch(e) {
    showToast("Erreur de suppression.", "error");
  }
};

window.adminIgnoreReport = async (reportId) => {
  if(!confirm("Ignorer ce signalement ?")) return;
  try {
    await deleteDoc(doc(db, 'reports', reportId));
    showToast("Signalement ignoré.", "success");
    loadReports();
  } catch(e) {
    showToast("Erreur.", "error");
  }
};
