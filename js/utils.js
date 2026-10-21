import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from './state.js';

export const $ = (id) => document.getElementById(id);

// Upload d'image vers Cloudinary
export async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: 'POST', body: formData });
  const data = await res.json();
  return data.secure_url;
}

// Formatage du temps (Il y a 5 min...)
export function timeAgo(createdAt) {
  if (!createdAt) return "À l'instant";
  const diff = Date.now() - (createdAt.toMillis ? createdAt.toMillis() : createdAt);
  const mins = Math.floor(diff / 60000);
  if (mins > 0 && mins < 60) return `Il y a ${mins} min`;
  if (mins >= 60 && mins < 1440) return `Il y a ${Math.floor(mins/60)} h`;
  if (mins >= 1440) return `Il y a ${Math.floor(mins/1440)} j`;
  return "À l'instant";
}

// Lecture vocale (TTS)
export function speakText(elementId) {
  const el = $(elementId);
  if(!el) return;
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(el.textContent);
    utterance.lang = 'fr-FR'; 
    window.speechSynthesis.speak(utterance);
  } else { alert("Non supporté."); }
}

// Traduction (MyMemory)
export async function translateText(elementId) {
  const el = $(elementId);
  if(!el) return;
  if (el.dataset.translated === 'true') { el.textContent = el.dataset.original; el.dataset.translated = 'false'; return; }
  const originalText = el.textContent; el.dataset.original = originalText; el.textContent = "Traduction...";
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(originalText)}&langpair=autodetect|fr`);
    const data = await res.json(); el.textContent = data.responseData.translatedText; el.dataset.translated = 'true';
  } catch (e) { el.textContent = originalText; }
}

// Fermer les menus "..." des posts
export function toggleMoreMenu(postId) {
  const menu = $(`more-menu-${postId}`);
  if(!menu) return;
  document.querySelectorAll('.more-menu').forEach(m => { if(m !== menu) m.classList.remove('active'); });
  menu.classList.toggle('active');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.more-menu-container')) {
    document.querySelectorAll('.more-menu').forEach(m => m.classList.remove('active'));
  }
});

export function sharePost(postId) {
  const url = window.location.origin + window.location.pathname + "?post=" + postId;
  navigator.clipboard.writeText(url).then(() => alert("Lien du post copié !"));
}
