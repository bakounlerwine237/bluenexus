export function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${viewId}`);
  if(target) target.classList.add('active');
  
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
  if(navBtn) navBtn.classList.add('active');

  const titles = { home: "Accueil", communities: "Communautés", messages: "Messages", music: "Musique", video: "Vidéo", search: "Recherche", profile: "Mon Profil", settings: "Paramètres" };
  document.getElementById('page-title').textContent = titles[viewId] || "BlueNexus";

  const nav = document.getElementById('main-nav');
  const header = document.getElementById('main-header');
  
  if (viewId === 'community') {
    nav.style.display = 'none'; header.style.display = 'none';
  } else {
    nav.style.display = 'flex'; header.style.display = 'flex';
  }
}
