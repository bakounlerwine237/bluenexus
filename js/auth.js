// --- js/auth.js ---
import { auth, db, state, TENCENT_SDK_APP_ID } from './state.js';
import { $, showToast } from './utils.js';
import { switchView } from './navigation.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, arrayUnion, increment, collection, query, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

async function initTencentChat(userId) { 
  try { 
    const response = await fetch('https://bluenexus-backend.vercel.app/api/tencent/usersig', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: userId }) }); 
    if (!response.ok) throw new Error("Erreur UserSig"); 
    const data = await response.json(); 
    state.tencentChat = TIM.create({ SDKAppID: TENCENT_SDK_APP_ID }); 
    await state.tencentChat.login({ userID: userId, userSig: data.userSig }); 
  } catch (error) { console.error("Erreur Tencent:", error); } 
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
      if (currentSlide < totalSlides - 1) { currentSlide++; updateCarousel(); }
    });
  }

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
    currentSlide = 0; updateCarousel();
  };
  window.goToLogin = () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('auth-screen').classList.add('active');
    $('login-form').style.display = 'block'; $('signup-form').style.display = 'none';
  };
  window.goToSignup = () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('auth-screen').classList.add('active');
    $('login-form').style.display = 'none'; $('signup-form').style.display = 'block';
  };

  if($('btn-landing-login')) $('btn-landing-login').onclick = window.goToLogin;
  if($('btn-final-login')) $('btn-final-login').onclick = window.goToLogin;
  if($('btn-final-signup')) $('btn-final-signup').onclick = window.goToSignup;
  if($('btn-final-enter-app')) $('btn-final-enter-app').onclick = () => enterApp();

  // --- INSCRIPTION AVEC PARRAINAGE ---
  if($('btn-signup')) $('btn-signup').addEventListener('click', async () => { 
    const email = $('auth-email-signup').value.trim(), pass = $('auth-pass-signup').value.trim(), name = $('auth-name').value.trim(); 
    const refCode = $('auth-referral-code') ? $('auth-referral-code').value.trim().toUpperCase() : ""; 
    
    if (!email || !pass || !name) return $('auth-error').textContent = "Remplissez tous les champs."; 
    $('auth-error').textContent = "Création..."; 
    
    try { 
      const cred = await createUserWithEmailAndPassword(auth, email, pass); 
      const myRefCode = name.toUpperCase() + Math.floor(Math.random() * 100); 
      
      let initialCoins = 50;
      let referredBy = null;

      if (refCode) {
        const q = query(collection(db, 'users'), where('referralCode', '==', refCode), limit(1));
        const refSnap = await getDocs(q);
        if (!refSnap.empty) {
          const parrainId = refSnap.docs[0].id;
          referredBy = parrainId;
          initialCoins = 100; 
          
          await updateDoc(doc(db, 'users', parrainId), {
            coins: increment(100),
            referrals: arrayUnion(cred.user.uid)
          });
        }
      }

      await setDoc(doc(db, 'users', cred.user.uid), { 
        username: name, 
        email: email, 
        bio: "Nouveau sur BlueNexus 🚀", 
        photoURL: "", pinned: [], following: [], followers: [], badges: [], savedPosts: [], 
        coins: initialCoins,
        referralCode: myRefCode,
        referredBy: referredBy,
        referrals: [],
        lastDailyClaim: 0,
        dailyStreak: 0,
        xp: 0 // NOUVEAU : Initialisation de l'XP
      }); 
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
      enterApp();
    } catch (e) { $('auth-error').textContent = "Email ou mot de passe incorrect."; }
  });
  
  if($('btn-forgot-password')) $('btn-forgot-password').addEventListener('click', async () => { 
    const email = $('auth-email').value.trim(); 
    if (!email) return $('auth-error').textContent = "Entrez votre email."; 
    try { await sendPasswordResetEmail(auth, email); alert("Email envoyé !"); } 
    catch (e) { $('auth-error').textContent = e.message; }
  });
  
  if($('btn-logout')) $('btn-logout').addEventListener('click', () => {
    sessionStorage.removeItem('bypass_onboarding');
    signOut(auth);
  });

  // --- LE CHEF D'ORCHESTRE ---
  onAuthStateChanged(auth, async (user) => { 
    if (user) { 
      state.currentUser = user; 
      const snap = await getDoc(doc(db, 'users', user.uid)); 
      if (snap.exists()) { 
        state.userProfile = snap.data(); 
        if(!state.userProfile.badges) state.userProfile.badges = []; 
        if(!state.userProfile.following) state.userProfile.following = []; 
        if(!state.userProfile.savedPosts) state.userProfile.savedPosts = []; 
        if(!state.userProfile.coins) state.userProfile.coins = 0; 
        if(state.userProfile.lastDailyClaim === undefined) state.userProfile.lastDailyClaim = 0;
        if(state.userProfile.dailyStreak === undefined) state.userProfile.dailyStreak = 0;
        if(state.userProfile.xp === undefined) {
            state.userProfile.xp = 0;
            await updateDoc(doc(db, 'users', user.uid), { xp: 0 });
        }
        
        if(!state.userProfile.referralCode) {
          const newCode = state.userProfile.username.toUpperCase() + Math.floor(Math.random() * 100);
          await updateDoc(doc(db, 'users', user.uid), { referralCode: newCode });
          state.userProfile.referralCode = newCode;
        }
        
        if($('my-referral-code')) $('my-referral-code').value = state.userProfile.referralCode;
        
        if (state.userProfile.role === 'admin') { 
          if($('admin-panel-btn-container')) $('admin-panel-btn-container').style.display = 'block'; 
        } else { 
          if($('admin-panel-btn-container')) $('admin-panel-btn-container').style.display = 'none'; 
        } 
      } else { 
        const newCode = user.email.split('@')[0].toUpperCase() + Math.floor(Math.random() * 100);
        state.userProfile = { username: user.email.split('@')[0], bio: "Nouveau", photoURL: "", pinned: [], following: [], badges: [], savedPosts: [], coins: 50, referralCode: newCode, referrals: [], lastDailyClaim: 0, dailyStreak: 0, xp: 0 }; 
        await setDoc(doc(db, 'users', user.uid), state.userProfile); 
        if($('my-referral-code')) $('my-referral-code').value = newCode;
      } 
      
      const createAvatar = $('create-post-avatar'); 
      if (createAvatar) { 
        if (state.userProfile.photoURL) { createAvatar.style.backgroundImage = `url(${state.userProfile.photoURL})`; createAvatar.textContent = ''; } 
        else { createAvatar.style.backgroundImage = 'none'; createAvatar.textContent = state.userProfile.username[0].toUpperCase(); } 
      } 
      
      await initTencentChat(user.uid); 
      
      const bypass = sessionStorage.getItem('bypass_onboarding');
      if (bypass === 'true') {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        $('app-screen').classList.add('active'); 
        switchView('home'); 
        document.dispatchEvent(new Event('userReady')); 
      } else {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        $('landing-screen').classList.add('active');
        currentSlide = totalSlides - 1; updateCarousel();
      }
      $('auth-error').textContent = ""; 
    } else { 
      state.currentUser = null; state.userProfile = null; 
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      $('landing-screen').classList.add('active');
      $('login-form').style.display = 'block'; $('signup-form').style.display = 'none'; 
    } 
  });
}
