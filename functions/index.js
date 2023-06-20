const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const path = require("path");
const favicon = require("serve-favicon");

const {parseWorkout} = require("./parser/parser.js");
const {StravaInterface} = require("./strava_interface.js");
const {ANALYTICS_EVENTS, logAnalytics} = require("./analytics.js");
const {defaultParserConfig, defaultFormatConfig, defaultAccountSettingsConfig} = require("./parser/defaultConfigs.js");

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

app.get("/test", (req, res) => {
  logAnalytics(ANALYTICS_EVENTS.TEST, db);
  res.send("Testing");
});

app.get("/", (req, res) => {
  res.render("index", {
    title: "Workout Parser Login",
    bodyMessage: "Log in to Workout Parser",
  });
});

app.get("/strava_oauth_redirect", (req, res) => {
  const code = req.query.code;
  const userToken = req.cookies["__session"];
  const stravaConfigDetails = StravaInterface.stravaConfigDetails();

  validateUserToken(userToken, res, (userID) => {
    axios({
      method: "post",
      url: `${stravaConfigDetails.stravaAuthTokenURL}?client_id=${stravaConfigDetails.stravaClientID}&client_secret=${stravaConfigDetails.stravaClientSecret}&grant_type=${stravaConfigDetails.initialGrantType}&code=${code}`,
      headers: "application/json",
    }).then((authRes) => {
      const athleteID = authRes.data.athlete.id;
      const accessToken = authRes.data.access_token;
      const refreshToken = authRes.data.refresh_token;
      const expiration = authRes.data.expires_at;
      saveStravaCredentialsForUser(userID, athleteID, accessToken, refreshToken, expiration);
      logAnalytics(ANALYTICS_EVENTS.USER_STRAVA_CONNECTION, db);

      res.redirect("/home");
    });
  });
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/home", (req, res) => {
  const userToken = req.cookies["__session"]; // Firebase functions' caching will strip any tokens not named `__session`
  validateUserToken(userToken, res, (userID) => {
    if (userID !== null) {
      isUserCreated(userID, (isCreated) => {
        if (!isCreated) {
          getPersonalDetailsFromUserToken(userToken, (details) => {
            createNewUser(details);
          });
        }

        getUserDetails(userID, (details) => {
          res.render("home", details);
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

  // console.log(`Explorer parsing: ${activityID}`);

  validateUserToken(userToken, res, (userID) => {
    getStravaTokenForID(userID, (accessToken) => {
      StravaInterface.getActivity(activityID, accessToken, (activity) => {
        if (activity.type === "Run") {
          const output = parseWorkout({
            run: activity,
            verbose: false,
          });
          if (output.isWorkout) {
            StravaInterface.writeSummaryToStrava(activityID, output.summary, accessToken);
          }
        }
      });
    });
  });
});

// Adds support for GET requests to the webhook for webhook subscription creation
app.get("/strava_webhook", (req, res) => {
  StravaInterface.webhookCreationResponse(req, res);
});

// Store all logic in a function for easy access by tests
function handleIncomingWebhook(req, res, isTest=false) {
  if (!isTest) {
    logAnalytics(ANALYTICS_EVENTS.INBOUND_WEBHOOK, db);
  }

  // Decide if we want to process the event
  const isActivityUpdate = req.body.object_type === "activity";
  const isRelevantUpdateType = req.body.aspect_type === "create" ||
   req.body.aspect_type === "update" && (req.body.updates === "title" || req.body.updates === "type");
  const isAccountDeauthorization = req.body.updates.authorized === "false";

  const activityID = req.body.object_id;
  const userStravaID = req.body.owner_id;

  if (!isTest) {
    StravaInterface.acknowledgeWebhook(res);
  }

  if (isActivityUpdate && isRelevantUpdateType) {
    getUserIDForStravaID(userStravaID, (userID) => {
      getStravaTokenForID(userID, (stravaToken) => {
        StravaInterface.getActivity(activityID, stravaToken, (activity) => {
          if (activity.type === "Run") {
            if (!isTest) {
              logAnalytics(ANALYTICS_EVENTS.ACTIVITY_IS_ELIGIBLE, db);
            }

            getPreferencesForUser(userID, (config) => {
              const output = parseWorkout({
                run: activity,
                config: config,
                verbose: false,
              });
              if (output.isWorkout) {
                console.log(`ACTIVITY ${activityID} is a workout. Title: [${output.summary.title}] Description: [${output.summary.description.replace(new RegExp("\n", "g"), " || ")}]`);
                if (!isTest) {
                  logAnalytics(ANALYTICS_EVENTS.WORKOUT_DETECTED, db);
                }
                setTimeout(() => {
                  if (isTest) {
                    output.summary.title += ` ${new Date()}`;
                    output.summary.description += `\n${new Date()}`;
                  }
                  StravaInterface.writeSummaryToStrava(activityID, output.summary, stravaToken);
                  if (!isTest) {
                    logAnalytics(ANALYTICS_EVENTS.WORKOUT_WRITTEN, db);
                  }
                }, 1000);
              } else {
                console.log(`ACTIVITY ${activityID} is NOT a workout, no action taken.`);
              }
            });
          }
        });
      }, isTest); // Force a refresh for code-exercise purposes if in test mode
    });
  } else if (isAccountDeauthorization) {
    getUserIDForStravaID(req.body.owner_id, (userID) => {
      deleteUser(userID);
      logAnalytics(ANALYTICS_EVENTS.USER_STRAVA_DEACTIVATION, db);
    });
  } else {
    console.log(`ACTVITIY ${activityID} is not eligible.`);
  }
}

app.post("/strava_webhook", (req, res) => {
  handleIncomingWebhook(req, res);
});

app.get("/_mock_strava_webhook", (req, res) => {
  const fakeReqBody = {
    "aspect_type": "create",
    "event_time": 1682863513, // mock time, shouldn't matter I think?
    "object_id": 8973556870, // https://www.strava.com/activities/8973556870
    "object_type": "activity",
    "owner_id": 92353751, // https://www.strava.com/athletes/92353751 (caiismyname2012@gmail.com)
    "subscription_id": 238513, // Prod subscription as of 4/31/23
    "updates": {},
  };

  req.body = fakeReqBody;
  handleIncomingWebhook(req, res, true);
  res.send("<html>Mocked — <a href=\"https://www.strava.com/activities/8973556870\">https://www.strava.com/activities/8973556870</a></html>");
});

app.get("/delete_account", (req, res) => {
  const userToken = req.cookies["__session"]; // Firebase functions' caching will strip any tokens not named `__session`
  validateUserToken(userToken, res, (userID) => {
    deleteUser(userID);
    logAnalytics(ANALYTICS_EVENTS.USER_ACCOUNT_DELETION, db);
    res.redirect("/");
  });
});

app.post("/update_preferences", (req, res) => {
  const userToken = req.cookies["__session"];
  validateUserToken(userToken, res, (userID) => {
    const data = req.body;
    const updatedPreferences = {
      parser: {
        dominantWorkoutType: data.dominantWorkoutType,
      },
      format: {
        paceUnits: data.paceUnits,
        sub90SecFormat: data.sub90SecFormat,
        subMileDistanceValue: data.subMileDistanceValue,
        greaterThanMileDistanceValue: data.greaterThanMileDistanceValue,
        detailsLength: data.detailsLength,
        detailsStructure: data.detailsStructure,
      },
    };

    updateUserPreferences(userID, updatedPreferences);
    res.redirect("/home");
  });
});

app.post("/update_account_settings", (req, res) => {
  const userToken = req.cookies["__session"];
  validateUserToken(userToken, res, (userID) => {
    const enabledSettings = req.body.accountSettings !== undefined ? req.body.accountSettings : []; // The object is undefined if no items were checked

    const updatedSettings = {...defaultAccountSettingsConfig};
    Object.keys(updatedSettings).forEach((setting) => {
      updatedSettings[setting] = enabledSettings.includes(setting);
    });

    updateAccountSettings(userID, updatedSettings);
  });

  res.redirect("/home");
});


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

function getPersonalDetailsFromUserToken(idToken, callback) {
  console.log("GETTING DETAILS");
  try {
    firebase.auth()
        .verifyIdToken(idToken)
        .then((decodedToken) => {
          const uid = decodedToken.uid;
          const name = decodedToken.name;
          const email = decodedToken.email;

          console.log(`EMAIL: ${email}`);
          callback({
            "userID": uid,
            "name": name,
            "email": email,
          });
        })
        .catch((error) => {
          console.error(`Invalid user authentication: ${error}`);
          callback({
            "userID": "",
            "name": "",
            "email": "",
          });
        });
  } catch (error) {
    console.error(error);
    callback({
      "userID": "",
      "name": "",
      "email": "",
    });
  }
}

function isUserCreated(userID, callback) {
  db.ref(`users/${userID}`).once("value", (snapshot) => {
    callback(snapshot.exists());
  });
}

function createNewUser(details) {
  logAnalytics(ANALYTICS_EVENTS.USER_ACCOUNT_SIGNUP, db);
  db.ref(`users/${details.userID}`).update({
    stravaConnected: false,
    name: details.name,
    email: details.email,
    preferences: {
      parser: defaultParserConfig,
      format: defaultFormatConfig,
      account: defaultAccountSettingsConfig,
    },
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

function getStravaTokenForID(userID, callback, forceRefresh=false) {
  db.ref(`users/${userID}/accessTokenExpiration`).once("value", (snapshot) => {
    const expirationEpoch = snapshot.val();
    const expiration = new Date(0);
    expiration.setUTCSeconds(expirationEpoch);

    // Token has expired, request a new one
    if (new Date() >= expiration || forceRefresh) {
      // Get refresh token
      db.ref(`users/${userID}/refreshToken`).once("value", (snapshot) => {
        const refreshToken = snapshot.val();
        // Get new access token from Strava
        StravaInterface.refreshAccessToken(refreshToken, (res) => {
          // Save new access token and expiry
          db.ref(`users/${userID}`).update({
            accessToken: res.accessToken,
            accessTokenExpiration: res.expiration,
          });
          callback(res.accessToken);
        });
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
        // Construct a new object so we control exactly what's being sent
        // i.e. omitting access tokens etc.
        {
          stravaConnected: details["stravaConnected"],
          name: details["name"],
          preferences: details.preferences,
        });
  });
}


// Excludes account settings
function getPreferencesForUser(userID, callback) {
  db.ref(`users/${userID}/preferences`).once("value", (snapshot) => {
    const prefs = snapshot.val();
    callback({
      parser: prefs.parser,
      format: prefs.format,
    });
  });
}

function deleteUser(userID) {
  db.ref(`users/${userID}/stravaID`).once("value", (snapshot) => {
    const stravaID = snapshot.val();
    db.ref(`stravaIDLookup/${stravaID}`).remove();
    db.ref(`users/${userID}`).remove();
    // console.log(`Deleted user ${userID}`);
  });
}

function updateUserPreferences(userID, updatedPreferences) {
  db.ref(`users/${userID}/preferences/parser`).update(
      updatedPreferences.parser,
      (error) => {
        console.error(error);
      },
  );

  db.ref(`users/${userID}/preferences/format`).update(
      updatedPreferences.format,
      (error) => {
        console.error(error);
      },
  );
}

function updateAccountSettings(userID, updatedSettings) {
  db.ref(`users/${userID}/preferences/account`).update(
      updatedSettings,
      (error) => {
        console.error(error);
      },
  );
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
  db.ref(`users/${userID}/preferences/account/dataUsageOptIn`).once("value", (snapshot) => {
    const allowed = snapshot.val();
    if (allowed) {
      getStravaTokenForID(userID, (stravaToken) => {
        StravaInterface.getActivity(activityID, stravaToken, (activity) => {
          saveJSON(activity);
        });
      });
    } else {
      console.error(`User ${userID} opted out of data usage.`);
    }
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
//       // parseWorkout({run: runDetails, verbose: true});
//     });
//   }

//   setTimeout(() => {
//     console.log(allRuns.length);
//     saveJSON({"examples": allRuns});
//   },
//   20000,
//   );
// });
