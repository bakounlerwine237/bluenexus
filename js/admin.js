import { db } from './state.js';
import { $, showToast, timeAgo } from './utils.js';
import { collection, getDocs, doc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

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
    const snap = await getDocs(collection(db, 'reports'));
    if(snap.empty) {
      list.innerHTML = '<p class="muted" style="padding: 1rem;">Aucun signalement. 🎉</p>';
      return;
    }
    list.innerHTML = '';
    for (const reportDoc of snap.docs) {
      const report = reportDoc.data();
      let postContent = "[Introuvable]";
      try {
        const postSnap = await getDoc(doc(db, 'posts', report.postId));
        if(postSnap.exists()) postContent = postSnap.data().content;
      } catch(e) {}

      list.innerHTML += `
        <div class="media-item" style="border-color: #ef4444;">
          <strong style="color: #ef4444;">⚠️ ${report.reason}</strong>
          <p class="muted" style="font-size: 0.8rem;">Par @${report.reporterName} - ${timeAgo(report.createdAt)}</p>
          <p style="background: var(--bg); padding: 10px; margin: 10px 0;">${postContent}</p>
          <button onclick="window.adminDeletePost('${report.postId}', '${reportDoc.id}')" class="btn-primary small" style="background: #ef4444;">Supprimer</button>
          <button onclick="window.adminIgnoreReport('${reportDoc.id}')" class="btn-secondary small">Ignorer</button>
        </div>`;
    }
  } catch(e) { list.innerHTML = '<p class="muted">Erreur de chargement.</p>'; }
}

window.adminDeletePost = async (postId, reportId) => {
  if(!confirm("Supprimer ce post ?")) return;
  try {
    await deleteDoc(doc(db, 'posts', postId));
    await deleteDoc(doc(db, 'reports', reportId));
    showToast("🗑️ Post supprimé.", "success");
    loadReports();
  } catch(e) { showToast("Erreur.", "error"); }
};

window.adminIgnoreReport = async (reportId) => {
  if(!confirm("Ignorer ?")) return;
  try {
    await deleteDoc(doc(db, 'reports', reportId));
    showToast("Ignoré.", "success");
    loadReports();
  } catch(e) { showToast("Erreur.", "error"); }
};
