// --- js/stories.js ---
import { db, state } from './state.js';
import { $, showToast, uploadFile } from './utils.js';
import { collection, addDoc, query, orderBy, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

export async function loadStories() {
  const container = $('stories-list');
  if (!container) return;
  container.innerHTML = '';

  // Bouton "Ajouter ma story"
  const myAvatar = state.userProfile.photoURL ? `<img src="${state.userProfile.photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : `<div style="width:100%; height:100%; border-radius:50%; background:var(--blue); display:flex; align-items:center; justify-content:center; font-weight:bold;">${state.userProfile.username[0].toUpperCase()}</div>`;
  
  const addBtnHtml = `
    <div class="story-item" onclick="document.getElementById('story-file-input').click()">
      <div class="story-avatar-ring seen">
        <div class="story-avatar-img">
          ${myAvatar}
          <div class="story-add-btn">+</div>
        </div>
      </div>
      <span class="story-name">Ma story</span>
    </div>
  `;
  container.innerHTML += addBtnHtml;

  try {
    const now = Date.now();
    // On récupère les stories récentes (limité à 50 pour les perfs)
    const q = query(collection(db, 'stories'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    
    // On filtre celles de moins de 24h et qui ne sont pas les nôtres
    const validStories = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => {
      const time = s.createdAt?.toMillis ? s.createdAt.toMillis() : 0;
      return (now - time < 24 * 60 * 60 * 1000) && s.userId !== state.currentUser.uid;
    });

    // Grouper par utilisateur pour n'avoir qu'un seul cercle par personne
    const usersWithStories = {};
    validStories.forEach(s => {
      if (!usersWithStories[s.userId]) usersWithStories[s.userId] = s;
    });

    Object.values(usersWithStories).forEach(s => {
      const avatar = s.userPhoto ? `<img src="${s.userPhoto}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : `<div style="width:100%; height:100%; border-radius:50%; background:var(--blue); display:flex; align-items:center; justify-content:center; font-weight:bold;">${s.username[0].toUpperCase()}</div>`;
      container.innerHTML += `
        <div class="story-item" onclick="window.viewStory('${s.id}', '${s.username}', '${s.mediaUrl}')">
          <div class="story-avatar-ring">
            <div class="story-avatar-img">${avatar}</div>
          </div>
          <span class="story-name">${s.username}</span>
        </div>
      `;
    });

  } catch (e) {
    console.error("Erreur chargement stories:", e);
  }
}

export function initStories() {
  const fileInput = $('story-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      showToast("Publication de la story...", "success");
      try {
        const mediaUrl = await uploadFile(file);
        await addDoc(collection(db, 'stories'), {
          userId: state.currentUser.uid,
          username: state.userProfile.username,
          userPhoto: state.userProfile.photoURL || "",
          mediaUrl: mediaUrl,
          createdAt: serverTimestamp()
        });
        showToast("✅ Story publiée !");
        loadStories();
      } catch (err) {
        showToast("Erreur lors de la publication.", "error");
      }
    });
  }

  window.viewStory = (storyId, username, mediaUrl) => {
    const viewer = $('story-viewer');
    const img = $('story-viewer-img');
    const name = $('story-viewer-name');
    const prog = $('story-progress');
    
    if (!viewer) return;
    name.textContent = username;
    img.src = mediaUrl;
    viewer.classList.add('active');
    
    // Relancer l'animation de la barre de progression
    prog.style.animation = 'none';
    prog.offsetHeight; 
    prog.style.animation = 'fillProgress 5s linear forwards';

    // Fermer automatiquement après 5 secondes
    if (window.storyTimeout) clearTimeout(window.storyTimeout);
    window.storyTimeout = setTimeout(() => {
      viewer.classList.remove('active');
    }, 5000);
  };

  window.closeStory = () => {
    const viewer = $('story-viewer');
    if (viewer) viewer.classList.remove('active');
    if (window.storyTimeout) clearTimeout(window.storyTimeout);
  };
}
