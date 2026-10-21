import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Variables partagées (State)
export const state = {
  currentUser: null,
  userProfile: null,
  currentCommunityId: null,
  currentCommunityMembers: [],
  currentCommunityOwner: null,
  tencentChat: null,
  currentChatId: null,
  currentFeedMode: 'discovery',
  lastVisiblePost: null
};

export const TENCENT_SDK_APP_ID = 20049692;
export const CLOUDINARY_CLOUD_NAME = "uot2gq2"; // Vérifie bien ce nom
export const CLOUDINARY_UPLOAD_PRESET = "bluenexus";
