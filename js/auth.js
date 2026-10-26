// --- js/auth.js ---
import { auth, db, state, TENCENT_SDK_APP_ID } from './state.js';
import { $, showToast } from './utils.js';
import { switchView } from './navigation.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

async function initTencentChat(userId) { 
  try { 
    const response = await fetch('https://bluenexus-backend.vercel.app/api/tencent/usersig', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: userId }) }); 
    if (!response.ok) throw new Error("Erreur UserSig"); 
    const data = await response.json(); 
    state.tencentChat = TIM.create({ SDKAppID: TENCENT_SDK_APP_ID }); 
    await state.tencentChat.login({ userID: userId, userSig: data.userSig }); 
    console.log("Tencent Chat connecté !"); 
  } catch (error) { 
    console.error("Erreur Tencent:", error); 
  } 
}

export function initAuth() {
  // --- LOGIQUE DU CARROUSEL (ONBOARDING) ---
  let currentSlide = 0;
  const totalSlides = 5;
  const track = $('onboarding-track');
  const dots = document.querySelectorAll('.dot');
  const nextBtn = $('btn-onboarding-next');

  function updateCarousel() {
    if(!track) return;
    // 5 slides, chacune fait 20% de la largeur du track
    track.style.transform = `translateX(-${currentSlide * 20}%)`; 
    
    dots.forEach((dot, index) => {
      if(index === currentSlide) dot.classList.add('active');
      else dot.classList.remove('active');
    });

    if (currentSlide === totalSlides - 1) {
      nextBtn.style.display = 'none'; // Cacher le bouton au dernier slide
    } else {
      nextBtn.style.display = 'block';
      nextBtn.textContent = currentSlide === totalSlides - 2 ? 'Commencer' : 'Suivant →';
    }
  }

  if(nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentSlide < totalSlides - 1) {
        currentSlide++;
        updateCarousel();
      }
    });
  }

  // --- NAVIGATION ENTRE LES ÉCRANS ---
  window.goToLanding = () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('landing-screen').classList.add('active');
    currentSlide = 0;
    updateCarousel(); // Réinitialiser au premier slide
  };

  window.goToLogin = () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('auth-screen').classList.add('active');
    $('login-form').style.display = 'block';
    $('signup-form').style.display = 'none';
  };

  window.goToSignup = () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('auth-screen').classList.add('active');
    $('login-form').style.display = 'none';
    $('signup-form').style.display = 'block';
  };

  // Boutons de navigation
  if($('btn-landing-login')) $('btn-landing-login').onclick = window.goToLogin;
  if($('btn-final-login')) $('btn-final-login').onclick = window.goToLogin;
  if($('btn-final-signup')) $('btn-final-signup').onclick = window.goToSignup;

  // --- LOGIQUE DE CONNEXION / INSCRIPTION ---
  if($('link-to-signup')) $('link-to-signup').addEventListener('click', (e) => { e.preventDefault(); $('login-form').style.display = 'none'; $('signup-form').style.display = 'block'; });
  if($('link-to-login')) $('link-to-login').addEventListener('click', (e) => { e.preventDefault(); $('signup-form').style.display = 'none'; $('login-form').style.display = 'block'; });
  
  if($('btn-signup')) $('btn-signup').addEventListener('click', async () => { 
    const email = $('auth-email-signup').value.trim(), pass = $('auth-pass-signup').value.trim(), name = $('auth-name').value.trim(); 
    if (!email || !pass || !name) return $('auth-error').textContent = "Remplissez tous les champs."; 
    $('auth-error').textContent = "Création..."; 
    try { 
      const cred = await createUserWithEmailAndPassword(auth, email, pass); 
      await setDoc(doc(db, 'users', cred.user.uid), { username: name, email: email, bio: "Nouveau sur BlueNexus 🚀", photoURL: "", pinned: [], following: [], followers: [], badges: [], savedPosts: [] }); 
    } catch (e) { 
      $('auth-error').textContent = e.message; 
    } 
  });
  
  if($('btn-login')) $('btn-login').addEventListener('click', async () => { 
    const email = $('auth-email').value.trim(), pass = $('auth-pass').value.trim(); 
    if (!email || !pass) return $('auth-error').textContent = "Entrez email et mot de passe."; 
    $('auth-error').textContent = "Connexion..."; 
    try { 
      await signInWithEmailAndPassword(auth, email, pass); 
    } catch (e) { 
      $('auth-error').textContent = "Email ou mot de passe incorrect."; 
    } 
  });
  
  if($('btn-forgot-password')) $('btn-forgot-password').addEventListener('click', async () => { 
    const email = $('auth-email').value.trim(); 
    if (!email) return $('auth-error').textContent = "Entrez votre email."; 
    try { 
      await sendPasswordResetEmail(auth, email); 
      alert("Email envoyé !"); 
    } catch (e) { 
      $('auth-error').textContent = e.message; 
    } 
  });
  
  if($('btn-logout')) $('btn-logout').addEventListener('click', () => signOut(auth));

  // --- LE CHEF D'ORCHESTRE (SÉCURITÉ) ---
  onAuthStateChanged(auth, async (user) => { 
    if (user) { 
      // L'utilisateur EST connecté
      state.currentUser = user; 
      const snap = await getDoc(doc(db, 'users', user.uid)); 
      if (snap.exists()) { 
        state.userProfile = snap.data(); 
        if(!state.userProfile.badges) state.userProfile.badges = []; 
        if(!state.userProfile.following) state.userProfile.following = []; 
        if(!state.userProfile.savedPosts) state.userProfile.savedPosts = []; 
        if (state.userProfile.role === 'admin') { 
          if($('admin-panel-btn-container')) $('admin-panel-btn-container').style.display = 'block'; 
        } else { 
          if($('admin-panel-btn-container')) $('admin-panel-btn-container').style.display = 'none'; 
        } 
      } else { 
        state.userProfile = { username: user.email.split('@')[0], bio: "Nouveau", photoURL: "", pinned: [], following: [], badges: [], savedPosts: [] }; 
        await setDoc(doc(db, 'users', user.uid), state.userProfile); 
      } 
      
      const createAvatar = $('create-post-avatar'); 
      if (createAvatar) { 
        if (state.userProfile.photoURL) { 
          createAvatar.style.backgroundImage = `url(${state.userProfile.photoURL})`; 
          createAvatar.textContent = ''; 
        } else { 
          createAvatar.style.backgroundImage = 'none'; 
          createAvatar.textContent = state.userProfile.username[0].toUpperCase(); 
        } 
      } 
      
      await initTencentChat(user.uid); 
      
      // On affiche l'application
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      $('app-screen').classList.add('active'); 
      
      $('auth-error').textContent = ""; 
      switchView('home'); 
      document.dispatchEvent(new Event('userReady')); 
    } else { 
      // L'utilisateur N'EST PAS connecté (ou vient de se déconnecter)
      state.currentUser = null; 
      state.userProfile = null; 
      
      // SÉCURITÉ : On le renvoie IMMÉDIATEMENT sur la page d'accueil publique
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      $('landing-screen').classList.add('active');
      
      // On prépare les formulaires au cas où il clique sur "Se connecter"
      $('login-form').style.display = 'block'; 
      $('signup-form').style.display = 'none'; 
    } 
  });
}
