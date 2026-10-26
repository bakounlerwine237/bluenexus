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
  // --- LOGIQUE DU CARROUSEL ---
  let currentSlide = 0;
  const totalSlides = 5;
  const track = $('onboarding-track');
  const dots = document.querySelectorAll('.dot');
  const nextBtn = $('btn-onboarding-next');

  function updateCarousel() {
    if(!track) return;
    track.style.transform = `translateX(-${currentSlide * 20}%)`; 
    
    dots.forEach((dot, index) => {
      if(index === currentSlide) dot.classList.add('active');
      else dot.classList.remove('active');
    });

    if (currentSlide === totalSlides - 1) {
      nextBtn.style.display = 'none';
      
      // Si l'utilisateur est déjà connecté en arrière-plan, on lui montre le bouton pour entrer
      if (state.currentUser) {
        if($('btn-final-enter-app')) $('btn-final-enter-app').style.display = 'block';
        if($('btn-final-signup')) $('btn-final-signup').style.display = 'none';
        if($('btn-final-login')) $('btn-final-login').style.display = 'none';
      } else {
        if($('btn-final-enter-app')) $('btn-final-enter-app').style.display = 'none';
        if($('btn-final-signup')) $('btn-final-signup').style.display = 'block';
        if($('btn-final-login')) $('btn-final-login').style.display = 'block';
      }
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

  // --- SÉCURITÉ / NAVIGATION FORCÉE ---
  // On stocke dans le sessionStorage si l'utilisateur a décidé d'entrer dans l'app
  function enterApp() {
    sessionStorage.setItem('bypass_onboarding', 'true');
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('app-screen').classList.add('active');
    switchView('home');
    document.dispatchEvent(new Event('userReady'));
  }

  window.goToLanding = () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('landing-screen').classList.add('active');
    currentSlide = 0;
    updateCarousel();
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

  if($('btn-landing-login')) $('btn-landing-login').onclick = window.goToLogin;
  if($('btn-final-login')) $('btn-final-login').onclick = window.goToLogin;
  if($('btn-final-signup')) $('btn-final-signup').onclick = window.goToSignup;

  // BOUTON MAGIQUE : Permet d'entrer dans l'app si on est déjà connecté
  if($('btn-final-enter-app')) {
    $('btn-final-enter-app').onclick = () => {
      enterApp();
    };
  }

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
      // Une fois connecté avec succès, on entre dans l'app
      enterApp();
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
  
  if($('btn-logout')) $('btn-logout').addEventListener('click', () => {
    sessionStorage.removeItem('bypass_onboarding'); // On réinitialise la sécurité
    signOut(auth);
  });

  // --- LE CHEF D'ORCHESTRE ---
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
      
      // SÉCURITÉ STRICTE : On regarde si l'utilisateur a déjà validé la page de présentation pour cette session
      const bypass = sessionStorage.getItem('bypass_onboarding');
      
      if (bypass === 'true') {
        // Il a déjà cliqué sur "Terminer" ou s'est connecté, on l'emmène dans l'app
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        $('app-screen').classList.add('active'); 
        switchView('home'); 
        document.dispatchEvent(new Event('userReady')); 
      } else {
        // Il est connecté mais n'a pas encore validé la landing page, on le laisse sur la landing page
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        $('landing-screen').classList.add('active');
        // On met à jour le dernier slide pour lui afficher le bouton "Accéder"
        currentSlide = totalSlides - 1;
        updateCarousel();
      }
      
      $('auth-error').textContent = ""; 
    } else { 
      // L'utilisateur N'EST PAS connecté
      state.currentUser = null; 
      state.userProfile = null; 
      
      // On le renvoie sur la page d'accueil
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      $('landing-screen').classList.add('active');
      
      $('login-form').style.display = 'block'; 
      $('signup-form').style.display = 'none'; 
    } 
  });
}
