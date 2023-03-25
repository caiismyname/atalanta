const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cookieParser = require('cookie-parser');

const {parseWorkout} = require("./parser/parser.js");

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const app = express();
const port = 4004;

app.set("title", "Strava Workout Parser");
app.set("views", "./views");
app.set("view engine", "pug");

app.use(cookieParser());
app.use(express.static('public'));
app.use(cors());

app.listen(port, () => {
  console.log(`App started, listening on port ${port}`);
});

const firebaseConfig = {
  apiKey: "AIzaSyC1OSm3JPYtw3RrxpKKVDDcvBiBAa8LjKo",
  authDomain: "atalanta-12c63.firebaseapp.com",
  databaseURL: "https://atalanta-12c63-default-rtdb.firebaseio.com",
  projectId: "atalanta-12c63",
  storageBucket: "atalanta-12c63.appspot.com",
  messagingSenderId: "505805552902",
  appId: "1:505805552902:web:3be990397d7eebc454b287",
  measurementId: "G-SZQ2Q0XVP6",
};

const firebase = admin.initializeApp(firebaseConfig);
const db = firebase.database();

//
//
// App routes
//
//

const stravaAuthTokenURL = "https://www.strava.com/oauth/token";
const clientID = "101816";
const clientSecret = functions.config().strava.api_secret;
const initialGrantType = "authorization_code";
const refreshGrantType = "refresh_token";

app.get("/", (req, res) => {
  res.render("index", {
    title: "Workout Parser Login",
    bodyMessage: "Log in to Workout Parser",
  });
});

app.get("/oauth_redirect", (req, res) => {
  const code = req.query.code;
  axios({
    method: "post",
    url: `${stravaAuthTokenURL}?client_id=${clientID}&client_secret=${clientSecret}&grant_type=${initialGrantType}&code=${code}`,
    headers: "application/json",
  }).then((authRes) => {
    const athleteID = authRes.data.athlete.id;
    const accessToken = authRes.data.access_token;
    const refreshToken = authRes.data.refresh_token;
    const expiration = authRes.data.expires_at;
    createNewUser(athleteID, accessToken, refreshToken, expiration);
    res.cookie("atalantaID", athleteID)
    res.redirect("/login_home");
  });
});

app.get("/login_home", (req, res) => {
  res.render("login_home", {
    title: "Workout Parser",
    bodyMessage: "Welcome to Workout Parser"
  });
});

app.get("/parse_activity", (req, res) => {
  var cookies = req.cookies
  const userID = cookies['atalantaID']
  const activityID = req.query.activityID;
  console.log(`Parsing activity ${activityID}`);

  getTokenForID(userID, (accessToken) => {
    getActivity(activityID, accessToken, (run) => {
      const output = parseWorkout(run);
      res.render("parsed_workout", {
        title: "my run",
        body: output,
      });
    });
  });
});


//
//
// Strava API
//
//


function refreshAccessToken(id, callback) {
  // Get refresh token from DB
  db.ref(`users/${id}/refreshToken`).once("value", (snapshot) => {
    const refreshToken = snapshot.val();

    // Request new access token
    axios({
      method: "post",
      url: `${stravaAuthTokenURL}?client_id=${clientID}&client_secret=${clientSecret}&grant_type=${refreshGrantType}&refresh_token=${refreshToken}`,
      headers: "application/json",
    }).then((res) => {
      // Save new access token and expiry
      const accessToken = res.data.access_token;
      const expiration = res.data.expires_at;

      db.ref(`users/${id}`).update({
        accessToken: accessToken,
        accessTokenExpiration: expiration,
      });

      callback(accessToken);
    });
  });
}

const apiBase = "https://www.strava.com/api/v3";

function getActivity(activityID, accessToken, callback) {
  console.log(`Getting ${activityID} with ${accessToken}`);

  const config = {
    headers: {Accept: "application/json", Authorization: `Bearer ${accessToken}`},
  };

  axios.get(`${apiBase}/activities/${activityID}`, config)
      .then((res) => {
        callback(res.data);
      });
}


//
//
// DB Functions
//
//

function createNewUser(id, accessToken, refreshToken, expiration) {
  db.ref(`users/${id}`).update({
    accessToken: accessToken,
    refreshToken: refreshToken,
    accessTokenExpiration: expiration,
  }, (error) => {
    console.log(error);
    console.log(`Created new user with ID: ${id}`);
  });
}

function getTokenForID(id, callback) {
  console.log(`Getting token for ID ${id}`);

  db.ref(`users/${id}/accessTokenExpiration`).once("value", (snapshot) => {
    const expiration = snapshot.val();
    console.log(`    Expiration: ${expiration}`);
    // Token has expired, request a new one
    if (new Date() > Date(expiration)) {
      console.log(`Token expired on ${expiration}`);
      refreshAccessToken(id, (newAccessToken) => {
        callback(newAccessToken);
      });
    } else {
      db.ref(`users/${id}/accessToken`).once("value", (snapshot) => {
        const accessToken = snapshot.val();
        console.log(`Retrieved token ${accessToken}`);
        callback(accessToken);
      });
    }
  });
}

//
//
// Firebase
//
//

exports.app = functions.https.onRequest(app);
