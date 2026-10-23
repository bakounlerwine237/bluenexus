import { db, state } from './state.js';
import { $, showToast } from './utils.js';
import { collection, query, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

let currentFilter = 'all';
let searchTimeout = null;

// Gestion de l'historique (localStorage)
function getHistory() {
  const h = localStorage.getItem('bluenexus_search_history');
  return h ? JSON.parse(h) : [];
}
function addToHistory(term) {
  let history = getHistory();
  history = history.filter(t => t !== term); // Éviter doublons
  history.unshift(term);
  if (history.length > 5) history = history.slice(0, 5); // Garder 5 max
  localStorage.setItem('bluenexus_search_history', JSON.stringify(history));
}
function clearHistory() {
  localStorage.removeItem('bluenexus_search_history');
  renderHistory();
}
function renderHistory() {
  const list = $('search-history-list');
  if(!list) return;
  const history = getHistory();
  if(history.length === 0) {
    list.innerHTML = '<p class="muted" style="padding: 1rem; text-align:center;">Aucune recherche récente.</p>';
    return;
  }
  list.innerHTML = history.map(term => `
    <div class="tg-item history-item" onclick="window.executeSearch('${term.replace(/'/g, "\\'")}')">
      <div class="tg-content">
        <div class="tg-title" style="font-weight: normal;">${term}</div>
      </div>
      <span style="color: var(--muted); font-size: 0.8rem;">↗</span>
    </div>
  `).join('');
}

export function initSearch() {
  const input = $('search-input');
  const clearBtn = $('btn-clear-search');
  const historyContainer = $('search-history-container');
  const resultsContainer = $('search-results');
  const noResults = $('search-no-results');

  // Effacer la recherche
  if(clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      historyContainer.style.display = 'block';
      resultsContainer.style.display = 'none';
      renderHistory();
    });
  }

  // Bouton effacer historique
  if($('btn-clear-history')) {
    $('btn-clear-history').addEventListener('click', () => {
      clearHistory();
      showToast("Historique effacé.", "error");
    });
  }

  // Filtres
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      if(input.value.trim().length > 0) doSearch(input.value.trim());
    });
  });

  // Saisie (avec debounce)
  if(input) {
    input.addEventListener('input', (e) => {
      const term = e.target.value.trim();
      
      if(term.length > 0) {
        clearBtn.style.display = 'flex';
        historyContainer.style.display = 'none';
        resultsContainer.style.display = 'block';
        
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => doSearch(term), 400); // Attendre 400ms après la dernière touche
      } else {
        clearBtn.style.display = 'none';
        historyContainer.style.display = 'block';
        resultsContainer.style.display = 'none';
        renderHistory();
      }
    });
  }

  // Fonction globale pour chercher depuis l'extérieur (ex: clic sur hashtag)
  window.executeSearch = (term) => {
    if(!input) return;
    input.value = term;
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
}

async function doSearch(term) {
  const termLower = term.toLowerCase();
  
  const usersDiv = $('search-results-users');
  const commsDiv = $('search-results-communities');
  const postsDiv = $('search-results-posts');
  const noResults = $('search-no-results');

  // Reset
  usersDiv.innerHTML = ''; commsDiv.innerHTML = ''; postsDiv.innerHTML = '';
  noResults.style.display = 'none';
  let totalFound = 0;

  try {
    // === UTILISATEURS ===
    if (currentFilter === 'all' || currentFilter === 'users') {
      const uSnap = await getDocs(collection(db, 'users'));
      const matchedUsers = uSnap.docs.filter(d => d.data().username?.toLowerCase().includes(termLower));
      
      if(matchedUsers.length > 0) {
        usersDiv.innerHTML = '<h4 class="search-section-title">Utilisateurs</h4><div class="tg-list">' + 
          matchedUsers.slice(0, 10).map(d => {
            const u = d.data();
            const avatar = u.photoURL ? `<img src="${u.photoURL}" class="tg-avatar">` : `<div class="tg-avatar">${u.username[0].toUpperCase()}</div>`;
            return `<div class="tg-item" onclick="window.openUserProfile('${d.id}')">${avatar}<div class="tg-content"><div class="tg-title">${u.username}</div><div class="tg-subtitle">${u.bio || ''}</div></div></div>`;
          }).join('') + '</div>';
        totalFound += matchedUsers.length;
      }
    }

    // === COMMUNAUTÉS ===
    if (currentFilter === 'all' || currentFilter === 'communities') {
      const cSnap = await getDocs(collection(db, 'communities'));
      const matchedComms = cSnap.docs.filter(d => d.data().name?.toLowerCase().includes(termLower));
      
      if(matchedComms.length > 0) {
        commsDiv.innerHTML = '<h4 class="search-section-title">Communautés</h4><div class="tg-list">' + 
          matchedComms.slice(0, 10).map(d => {
            const c = d.data();
            return `<div class="tg-item" onclick="window.openCommunity('${d.id}')"><div class="tg-avatar">${c.name[0].toUpperCase()}</div><div class="tg-content"><div class="tg-title">${c.name}</div><div class="tg-subtitle">${c.members.length} membres</div></div></div>`;
          }).join('') + '</div>';
        totalFound += matchedComms.length;
      }
    }

    // === POSTS ===
    if (currentFilter === 'all' || currentFilter === 'posts') {
      const pSnap = await getDocs(collection(db, 'posts'));
      const matchedPosts = pSnap.docs.filter(d => d.data().content?.toLowerCase().includes(termLower));
      
      if(matchedPosts.length > 0) {
        postsDiv.innerHTML = '<h4 class="search-section-title">Publications</h4><div class="tg-list">' + 
          matchedPosts.slice(0, 10).map(d => {
            const p = d.data();
            return `<div class="tg-item"><div class="tg-content"><div class="tg-title" style="font-weight: normal; white-space: normal;">${p.content}</div><div class="tg-subtitle">par @${p.authorName}</div></div></div>`;
          }).join('') + '</div>';
        totalFound += matchedPosts.length;
      }
    }

    // Ajouter à l'historique si on a trouvé quelque chose
    if (totalFound > 0) addToHistory(term);
    else noResults.style.display = 'block';

  } catch(e) {
    console.error(e);
    showToast("Erreur lors de la recherche.", "error");
  }
}
