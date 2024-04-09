import {initializeApp} from "https://www.gstatic.com/firebasejs/9.18.0/firebase-app.js";
import {getAuth, signInWithRedirect, GoogleAuthProvider, onAuthStateChanged} from "https://www.gstatic.com/firebasejs/9.18.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDcNplg3hUv_ulTSUFVc-2RcJFE1WW1gFE",
  authDomain: "workoutsplitz.com",
  databaseURL: "https://atalanta-12c63-default-rtdb.firebaseio.com",
  projectId: "atalanta-12c63",
  storageBucket: "atalanta-12c63.appspot.com",
  messagingSenderId: "505805552902",
  appId: "1:505805552902:web:3be990397d7eebc454b287",
  measurementId: "G-SZQ2Q0XVP6",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
connectAuthEmulator(auth, "http://localhost:9099");

function login() {
  const provider = new GoogleAuthProvider();
  signInWithRedirect(auth, provider);
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    auth.currentUser.getIdToken().then(
        (token) => {
          document.cookie = `__session=${token}`; // Firebase functions' caching will strip any tokens not named `__session`
          window.location.replace("https://workoutsplitz.com/home");
          // window.location.replace("http://localhost:5002/home");
        },
        (error) => {
          console.error(error);
        },
    );
  } else {
    // noop
  }
});

// Give the onAuthStateChanged a chance to succeed before calling login
setTimeout(() => {
  login();
}, 1500);
