import {initializeApp} from "https://www.gstatic.com/firebasejs/9.18.0/firebase-app.js";
import {getAuth, signInWithRedirect, GoogleAuthProvider, connectAuthEmulator, getRedirectResult} from "https://www.gstatic.com/firebasejs/9.18.0/firebase-auth.js";

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

if (window.location.hostname === "localhost") {
  connectAuthEmulator(auth, "http://localhost:9099");
}

function login() {
  const provider = new GoogleAuthProvider();
  signInWithRedirect(auth, provider);
}

// Not actually used
// document.addEventListener("DOMContentLoaded", () => {
//   const loginButton = document.getElementById("loginButton");
//   const signUpButton = document.getElementById("signUpButton");
//   loginButton.addEventListener("click", () => {
//     login();
//   });
//   signUpButton.addEventListener("click", () => {
//     login();
//   });
// });

const user = auth.currentUser;
const queryParams = new URLSearchParams(window.location.search);

if (user) {
  const queryParams = new URLSearchParams(window.location.search);
  if (queryParams.get("postLogin")) {
    window.location.replace(`${queryParams.get("postLogin")}`);
  } else {
    window.location.replace(`home`);
  }
} else {
  getRedirectResult(auth)
      .then((result) => {
        if (result) { // Check `result` object first otherwise it's a null access and the function returns
          if (result.user) { // Successful login
            auth.currentUser.getIdToken().then(
                (token) => {
                  document.cookie = `__session=${token}`; // Firebase functions' caching will strip any tokens not named `__session`
                  if (queryParams.get("postLogin")) {
                    window.location.replace(`${queryParams.get("postLogin")}`);
                  } else {
                    window.location.replace(`home`);
                  }
                });
          } else {
            login();
          }
        } else {
          login();
        }
      })
      .catch((error) => {
        const errorCode = error.code;
        if (errorCode === "auth/account-exists-with-different-credential") {
          alert(
              "You have already signed up with a different auth provider for that email.",
          );
        } else {
          console.error(error);
        }
      });
}
