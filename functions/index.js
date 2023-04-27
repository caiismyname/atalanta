const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const path = require("path");
const favicon = require("serve-favicon");

const {parseWorkout} = require("./parser/parser.js");
const {ANALYTICS_EVENTS, logAnalytics} = require("./analytics.js");

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const app = express();

app.set("title", "Strava Workout Parser");
app.set("views", "./views");
app.set("view engine", "pug");

app.use(cookieParser());
app.use(express.static("public"));
app.use(cors());
app.use(favicon(path.join(__dirname, "public", "favicon.ico")));

const serviceAccount = require("./serviceAccountKey.json");
const firebase = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://atalanta-12c63-default-rtdb.firebaseio.com",
});
const db = firebase.database();

//
//
// App routes
//
//

const stravaAuthTokenURL = "https://www.strava.com/oauth/token";
const stravaClientID = "101816";
const stravaClientSecret = functions.config().strava.api_secret;
const initialGrantType = "authorization_code";
const refreshGrantType = "refresh_token";

app.get("/", (req, res) => {
  res.render("index", {
    title: "Workout Parser Login",
    bodyMessage: "Log in to Workout Parser",
  });
});

app.get("/test", (req, res) => {
  res.send("Testing");
});

app.get("/strava_oauth_redirect", (req, res) => {
  const code = req.query.code;
  const userToken = req.cookies["__session"];
  validateUserToken(userToken, res, (userID) => {
    axios({
      method: "post",
      url: `${stravaAuthTokenURL}?client_id=${stravaClientID}&client_secret=${stravaClientSecret}&grant_type=${initialGrantType}&code=${code}`,
      headers: "application/json",
    }).then((authRes) => {
      const athleteID = authRes.data.athlete.id;
      const accessToken = authRes.data.access_token;
      const refreshToken = authRes.data.refresh_token;
      const expiration = authRes.data.expires_at;
      saveStravaCredentialsForUser(userID, athleteID, accessToken, refreshToken, expiration);

      res.redirect("/home");
    });
  });
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/home", (req, res) => {
  // res.render("home", {
  //   name: `${"David"}`,g
  //   bodyMessage: `Welcome to Splitz ${"David"}`,
  //   stravaConnected: false,
  // });
  const userToken = req.cookies["__session"]; // Firebase functions' caching will strip any tokens not named `__session`
  validateUserToken(userToken, res, (userID) => {
    if (userID !== null) {
      isUserCreated(userID, (isCreated) => {
        if (!isCreated) {
          createNewUser(userID, "foo");
        }

        getUserDetails(userID, (details) => {
          res.render("home", {
            stravaConnected: details["stravaConnected"],
            name: details["name"],
          });
        });
      });
    }
  });
});

app.get("/explorer", (req, res) => {

});

app.get("/explorer_parse", (req, res) => {
  const activityID = req.query.activityID;
  const userToken = req.cookies["__session"];

  console.log(`Explorer parsing: ${activityID}`);

  validateUserToken(userToken, res, (userID) => {
    getStravaTokenForID(userID, (accessToken) => {
      getActivity(activityID, accessToken, (activity) => {
        if (activity.type === "Run") {
          const output = parseWorkout(activity, false, false);
          if (output.isWorkout) {
            writeSummaryToStrava(activityID, output.summary, accessToken);
          }
        }
      });
    });
  });
});

// Adds support for GET requests to the webhook for webhook subscription creation
app.get("/strava_webhook", (req, res) => {
  // Your verify token. Should be a random string.
  const VERIFY_TOKEN = "atalanta_verify";
  // Parses the query params
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  // Checks if a token and mode is in the query string of the request
  if (mode && token) {
    // Verifies that the mode and token sent are valid
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      // Responds with the challenge token from the request
      console.log(`STRAVA WEBHOOK VERIFIED`);
      res.json({"hub.challenge": challenge});
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  }
});

app.post("/strava_webhook", (req, res) => {
  console.log("INCOMING STRAVA WEBHOOK");
  console.log(req.body);
  logAnalytics(ANALYTICS_EVENTS.INBOUND_WEBHOOK, db);

  // Decide if we want to process the event
  const isActivityUpdate = req.body.object_type === "activity";
  const isRelevantUpdateType = req.body.aspect_type === "create" ||
   req.body.aspect_type === "update" && (req.body.updates === "title" || req.body.updates === "type");
  const isAccountDeauthorization = req.body.updates.authorized === "false";

  acknowledgeWebhook(res);

  if (isActivityUpdate && isRelevantUpdateType) {
    console.log(`Pulling activity for incoming webhook`);
    const activityID = req.body.object_id;
    const userStravaID = req.body.owner_id;

    getUserIDForStravaID(userStravaID, (userID) => {
      getStravaTokenForID(userID, (stravaToken) => {
        getActivity(activityID, stravaToken, (activity) => {
          if (activity.type === "Run") {
            console.log(`Activity is run, processing...`);
            logAnalytics(ANALYTICS_EVENTS.ACTIVITY_IS_ELIGIBLE, db);
            const output = parseWorkout(activity, false, false);
            if (output.isWorkout) {
              console.log(`Activity ${activityID} is a workout. Title: [${output.summary.title}]`);
              logAnalytics(ANALYTICS_EVENTS.WORKOUT_DETECTED, db);
              setTimeout(() => {
                writeSummaryToStrava(activityID, output.summary, stravaToken);
                logAnalytics(ANALYTICS_EVENTS.WORKOUT_WRITTEN, db);
              }, 5000);
            } else {
              console.log(`Activity ${activityID} is NOT a workout`);
            }
          }
        });
      });
    });
  } else if (isAccountDeauthorization) {
    getUserIDForStravaID(req.body.owner_id, (userID) => {
      deleteUser(userID);
      logAnalytics(ANALYTICS_EVENTS.USER_STRAVA_DEACTIVATION, db);
    });
  } else {
    console.log(`Ignoring webhook contents`);
  }
});

app.get("/delete_account", (req, res) => {
  const userToken = req.cookies["__session"]; // Firebase functions' caching will strip any tokens not named `__session`
  validateUserToken(userToken, res, (userID) => {
    deleteUser(userID);
    logAnalytics(ANALYTICS_EVENTS.USER_ACCOUNT_DELETION, db);
    res.redirect("/");
  });
});

//
//
// Strava API
//
//

const apiBase = "https://www.strava.com/api/v3";

function acknowledgeWebhook(res) {
  console.log(`ACK STRAVA WEBHOOK`);
  res.status(200).send("EVENT_RECEIVED");
}

function refreshStravaAccessToken(id, callback) {
  // Get refresh token from DB
  db.ref(`users/${id}/refreshToken`).once("value", (snapshot) => {
    const refreshToken = snapshot.val();

    // Request new access token
    axios({
      method: "post",
      url: `${stravaAuthTokenURL}?client_id=${stravaClientID}&client_secret=${stravaClientSecret}&grant_type=${refreshGrantType}&refresh_token=${refreshToken}`,
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

function getActivity(activityID, accessToken, callback) {
  console.log(`Getting ${activityID} from Strava`);

  const config = {
    headers: {Accept: "application/json", Authorization: `Bearer ${accessToken}`},
  };

  axios.get(`${apiBase}/activities/${activityID}`, config)
      .then((res) => {
        callback(res.data);
      });
}

// eslint-disable-next-line no-unused-vars
function getRecentRuns(accessToken, callback) {
  const config = {
    headers: {Accept: "application/json", Authorization: `Bearer ${accessToken}`},
  };

  const activitiesPerPage = 80;
  axios.get(`${apiBase}/athlete/activities?&per_page=${activitiesPerPage}`, config)
      .then((res) => {
        callback(res.data
            .filter((activity) => activity.type === "Run")
            .map((activity) => activity.id),
        );
      });
}

function writeSummaryToStrava(activityID, summary, accessToken) {
  console.log(`Writing workout:\n\tActivity: ${activityID}\nTitle:${summary.title}`);

  const config = {headers: {Accept: "application/json", Authorization: `Bearer ${accessToken}`}};
  const newTitleAndDescription = {
    "name": summary.title,
    "description": summary.description,
  };
  axios.put(`${apiBase}/activities/${activityID}`, newTitleAndDescription, config)
      .then((res) => {
        console.log(`Writing to Strava result: ${res.status}`);
      });
}

//
//
// DB Functions
//
//

// Returns the userID if the token validates successfully
// Redirects the res to / if it fails to validate
function validateUserToken(idToken, res, callback) {
  try {
    firebase.auth()
        .verifyIdToken(idToken)
        .then((decodedToken) => {
          const uid = decodedToken.uid;
          callback(uid);
        })
        .catch((error) => {
          console.error(`Invalid user authentication: ${error}`);
          res.redirect("/");
        });
  } catch (error) {
    console.error(error);
    res.redirect("/");
  }
}

function isUserCreated(userID, callback) {
  db.ref(`users/${userID}`).once("value", (snapshot) => {
    callback(snapshot.exists());
  });
}

function createNewUser(userID, name) {
  console.log(`CREATED USER: ${userID}`);
  db.ref(`users/${userID}`).update({
    stravaConnected: false,
    name: name,
  }, (error) => {
    console.log(error);
  });
}

function saveStravaCredentialsForUser(userID, stravaID, accessToken, refreshToken, expiration) {
  db.ref(`users/${userID}`).update({
    stravaConnected: true,
    stravaID: stravaID,
    accessToken: accessToken,
    refreshToken: refreshToken,
    accessTokenExpiration: expiration,
  }, (error) => {
    console.log(error);
  });

  // Create the reverse lookup (stravaID: googleID)
  db.ref(`stravaIDLookup/${stravaID}`).update({
    userID: userID,
  }, (error) => {
    console.log(error);
  });
}

function getStravaTokenForID(userID, callback) {
  db.ref(`users/${userID}/accessTokenExpiration`).once("value", (snapshot) => {
    const expirationEpoch = snapshot.val();
    const expiration = new Date(0);
    expiration.setUTCSeconds(expirationEpoch);

    // Token has expired, request a new one
    if (new Date() >= expiration) {
      refreshStravaAccessToken(userID, (newAccessToken) => {
        callback(newAccessToken);
      });
    } else {
      db.ref(`users/${userID}/accessToken`).once("value", (snapshot) => {
        const accessToken = snapshot.val();
        callback(accessToken);
      });
    }
  });
}

function getUserIDForStravaID(stravaID, callback) {
  db.ref(`stravaIDLookup/${stravaID}/userID`).once("value", (snapshot) => {
    const userID = snapshot.val();

    callback(userID);
  });
}

function getUserDetails(userID, callback) {
  db.ref(`users/${userID}`).once("value", (snapshot) => {
    const details = snapshot.val();
    callback(
        {
          stravaConnected: details["stravaConnected"],
          name: details["name"],
        },
    );
  });
}

function deleteUser(userID) {
  db.ref(`users/${userID}/stravaID`).once("value", (snapshot) => {
    const stravaID = snapshot.val();
    db.ref(`stravaIDLookup/${stravaID}`).remove();
    db.ref(`users/${userID}`).remove();
    console.log(`Deleted user ${userID}`);
  });
}

//
//
// Firebase
//
//

exports.app = functions.https.onRequest(app);


//
//
// Utilities
//
//

function saveJSON(content, fileName="output.json") {
  const jsonContent = JSON.stringify(content, null, 4);
  fs.writeFile(fileName, jsonContent, "utf8", (err) => {
    if (err) {
      console.log("An error occured while writing JSON Object to file.");
      return console.log(err);
    }

    console.log(`JSON file ${fileName} has been saved.`);
  });
}

// eslint-disable-next-line no-unused-vars
function saveActivityForUser(userID, activityID) {
  getStravaTokenForID(userID, (stravaToken) => {
    getActivity(activityID, stravaToken, (activity) => {
      saveJSON(activity);
    });
  });
}


// const testUserID = "";
// const testActivityID = "";
// saveActivityForUser(testUserID, testActivityID);

// getRecentRuns(stravaToken, (runs) => {
//   console.log(runs.length);

//   const allRuns = [];

//   for (const runId of runs) {
//     getActivity(runId, stravaToken, (runDetails) => {
//       allRuns.push(runDetails);
//       // parseWorkout(runDetails);
//     });
//   }

//   setTimeout(() => {
//     console.log(allRuns.length);
//     saveJSON({"examples": allRuns});
//   },
//   20000,
//   );
// });
