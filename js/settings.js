// --- js/settings.js ---
import { auth, db, state } from './state.js';
import { $, showToast } from './utils.js';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider, deleteUser } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";
import { doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

export function initSettings() {
  // --- 1. MODIFIER LE NOM D'UTILISATEUR ---
  if ($('btn-change-username')) {
    $('btn-change-username').addEventListener('click', () => {
      $('new-username').value = state.userProfile.username;
      $('modal-change-username').classList.remove('hidden');
    });
  }
  if ($('btn-cancel-username')) $('btn-cancel-username').addEventListener('click', () => $('modal-change-username').classList.add('hidden'));

  if ($('btn-save-username')) {
    $('btn-save-username').addEventListener('click', async () => {
      const newUsername = $('new-username').value.trim();
      if (!newUsername) return showToast("Le nom ne peut pas être vide.", "error");
      $('btn-save-username').textContent = "Chargement...";
      try {
        await updateDoc(doc(db, 'users', state.currentUser.uid), { username: newUsername });
        state.userProfile.username = newUsername;
        showToast("✅ Nom d'utilisateur mis à jour !", "success");
        $('modal-change-username').classList.add('hidden');
        if (window.renderProfile) window.renderProfile();
      } catch (e) {
        showToast("Erreur : " + e.message, "error");
      } finally {
        $('btn-save-username').textContent = "Enregistrer";
      }
    });
  }

  // --- 2. CHANGER LE MOT DE PASSE ---
  if ($('btn-change-password')) $('btn-change-password').addEventListener('click', () => $('modal-change-password').classList.remove('hidden'));
  if ($('btn-cancel-password')) $('btn-cancel-password').addEventListener('click', () => $('modal-change-password').classList.add('hidden'));

  if ($('btn-save-password')) {
    $('btn-save-password').addEventListener('click', async () => {
      const currentPass = $('current-password').value;
      const newPass = $('new-password').value;
      if (!currentPass || !newPass) return showToast("Remplissez tous les champs.", "error");
      if (newPass.length < 6) return showToast("Le nouveau mot de passe doit faire 6 caractères min.", "error");
      
      $('btn-save-password').textContent = "Mise à jour...";
      try {
        // Firebase exige une réauthentification avant de changer le mot de passe
        const credential = EmailAuthProvider.credential(state.currentUser.email, currentPass);
        await reauthenticateWithCredential(state.currentUser, credential);
        await updatePassword(state.currentUser, newPass);
        
        showToast("✅ Mot de passe mis à jour !", "success");
        $('modal-change-password').classList.add('hidden');
        $('current-password').value = '';
        $('new-password').value = '';
      } catch (e) {
        if (e.code === 'auth/wrong-password') showToast("Mot de passe actuel incorrect.", "error");
        else showToast("Erreur : " + e.message, "error");
      } finally {
        $('btn-save-password').textContent = "Mettre à jour";
      }
    });
  }

  // --- 3. SUPPRIMER LE COMPTE ---
  if ($('btn-delete-account')) {
    $('btn-delete-account').addEventListener('click', async () => {
      const confirm1 = confirm("⚠️ Voulez-vous vraiment supprimer votre compte ? Cette action est irréversible et supprimera toutes vos données.");
      if (!confirm1) return;
      const confirm2 = prompt("Tapez 'SUPPRIMER' pour confirmer la suppression définitive :");
      if (confirm2 !== "SUPPRIMER") return showToast("Suppression annulée.", "error");

      try {
        // Supprimer le profil dans Firestore
        await deleteDoc(doc(db, 'users', state.currentUser.uid));
        // Supprimer l'utilisateur d'Auth (nécessite parfois une ré-auth, mais on tente)
        await deleteUser(state.currentUser);
        showToast("Compte supprimé. Au revoir !", "success");
        window.location.reload();
      } catch (e) {
        if (e.code === 'auth/requires-recent-login') {
          showToast("Veuillez vous déconnecter et vous reconnecter pour pouvoir supprimer votre compte.", "error");
        } else {
          showToast("Erreur lors de la suppression : " + e.message, "error");
        }
      }
    });
  }

  // --- 4. CONFIDENTIALITÉ & AIDE ---
  if ($('btn-privacy-policy')) {
    $('btn-privacy-policy').addEventListener('click', () => {
      alert("🛡️ Confidentialité & Sécurité\n\nVos données sont stockées de manière sécurisée sur Google Firebase. Nous ne vendons jamais vos données à des tiers. Vous pouvez supprimer votre compte à tout moment depuis les paramètres.");
    });
  }
  if ($('btn-support')) {
    $('btn-support').addEventListener('click', () => {
      alert("❓ Centre d'aide\n\nPour toute question ou problème, contactez-nous à : support@bluenexus.com");
    });
  }
}
