const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const favicon = require("serve-favicon");

const {parseWorkout} = require("./parser/parser.js");
const {StravaInterface} = require("./strava_interface.js");
const {DbInterface} = require("./db_interface.js");
const {ANALYTICS_EVENTS, logAnalytics} = require("./analytics.js");
const {defaultAccountSettingsConfig, knownStravaDefaultRunNames} = require("./parser/defaultConfigs.js");

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
const dbInterface = new DbInterface(db);

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
      dbInterface.saveStravaCredentialsForUser(userID, athleteID, accessToken, refreshToken, expiration);
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
      dbInterface.isUserCreated(userID, (isCreated) => {
        if (!isCreated) {
          getPersonalDetailsFromUserToken(userToken, (details) => {
            dbInterface.createNewUser(details);
          });
        }

        dbInterface.getUserDetails(userID, (details) => {
          res.render("home", details);
        });
      });
    }
  });
});

app.get("/admin/explorer", (req, res) => {

});

app.get("/explorer_parse", (req, res) => {
  const activityID = req.query.activityID;
  const userToken = req.cookies["__session"];

  // console.log(`Explorer parsing: ${activityID}`);

  validateUserToken(userToken, res, (userID) => {
    dbInterface.getStravaTokenForID(userID, (accessToken) => {
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

app.get("/admin/analytics", (req, res) => {
  // dbInterface.getStoredWorkoutsForAnalytics((workouts) => {
  //   res.render("analytics_viewer", {workouts: workouts});
  // });

  const userToken = req.cookies["__session"]; // Firebase functions' caching will strip any tokens not named `__session`
  validateUserToken(userToken, res, (userID) => {
    if (userID === functions.config().admin.david) {
      dbInterface.getStoredWorkoutsForAnalytics((workouts) => {
        res.render("analytics_viewer", {workouts: workouts});
      });
    } else {
      res.redirect("/home");
    }
  });
});

// Adds support for GET requests to the webhook for webhook subscription creation
app.get("/strava_webhook", (req, res) => {
  StravaInterface.webhookCreationResponse(req, res);
});

function webhookIsAccountDeauth(req) {
  if (req.body.aspect_type === "update") {
    if ("updates" in req.body) { // being defensive here
      if ("authorized" in req.body.updates) {
        if (req.body.updates.authorized === "false") {
          return true;
        }
      }
    }
  }

  return false;
}

function webhookIsDefaultTitleUpdate(req) {
  if (req.body.aspect_type === "update") {
    if ("updates" in req.body) { // being defensive here
      if (req.body.updates === "title") {
        const newTitle = req.body.updates.title;
        return knownStravaDefaultRunNames.includes(newTitle);
      }
    }
  }

  return false;
}

function processActivity(activityID, userStravaID, isTest) {
  dbInterface.getUserIDForStravaID(userStravaID, (userID) => {
    dbInterface.getStravaTokenForID(userID, (stravaToken) => {
      StravaInterface.getActivity(activityID, stravaToken, (activity) => {
        if (activity.type === "Run") {
          if (!isTest) {
            logAnalytics(ANALYTICS_EVENTS.ACTIVITY_IS_ELIGIBLE, db);
          }

          dbInterface.getPreferencesForUser(userID, (config) => {
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
                  dbInterface.storeWrittenWorkout(activityID, userID, output.summary);
                }
              }, 0); // Keep the timeout framework but no timeout for now
            } else {
              console.log(`ACTIVITY ${activityID} is NOT a workout, no action taken.`);
            }
          });
        } else {
          console.log(`ACTIVITY ${activityID} is NOT a run, no action taken.`);
        }
      });
    }, isTest); // Force a refresh for code-exercise purposes if in test mode
  });
}

// Store all logic in a function for easy access by tests
function handleIncomingWebhook(req, res, isTest=false) {
  if (!isTest) {
    logAnalytics(ANALYTICS_EVENTS.INBOUND_WEBHOOK, db);
  }

  // Decide if we want to process the event
  const isActivity = req.body.object_type === "activity";
  const isCreate = req.body.aspect_type === "create"; // || (req.body.aspect_type === "update" && (req.body.updates === "title" || req.body.updates === "type"));
  const isAccountDeauthorization = webhookIsAccountDeauth(req);
  const isStravaDefaultTitleUpdate = webhookIsDefaultTitleUpdate(req);

  const activityID = req.body.object_id;
  const userStravaID = req.body.owner_id;

  if (!isTest) {
    StravaInterface.acknowledgeWebhook(res);
  }

  if (isActivity && isCreate) {
    dbInterface.getIsWorkoutWritten(activityID, (isWritten) => {
      /*
      Sometimes we get a second ping if the function doesn't start up soon enough to ack the webhook in time.
      Even so, we still do the full parse+write (if it's a workout) in response to the first webhook, so the second write is unnecessary.
      The second write can be harmful if the user updates the activity between the two webhooks because the second write would overwrite the user's changes.
      */
      if (!isWritten) {
        processActivity(activityID, userStravaID, isTest);
      }
    });
  } else if (isActivity && isStravaDefaultTitleUpdate) {
    dbInterface.getIsWorkoutWritten(activityID, (isWritten) => {
      // If we've already written the workout, and we subsequently receive a default title update, it means we were overwritten and we need to re-write
      if (isWritten) {
        processActivity(activityID, userStravaID, isTest);
      }
    });
  } else if (isAccountDeauthorization) {
    dbInterface.getUserIDForStravaID(req.body.owner_id, (userID) => {
      dbInterface.deleteUser(userID);
      logAnalytics(ANALYTICS_EVENTS.USER_STRAVA_DEACTIVATION, db);
    });
  } else if (req.body.aspect_type === "update") {
    console.log(`Received update for ACTIVITY ${activityID}, no action taken.`);
  } else {
    console.log(`Webhook for ACTIVITY ${activityID} is not eligible.`);
  }
}

app.post("/strava_webhook", (req, res) => {
  console.log(`INBOUND WEBHOOK ${JSON.stringify(req.body).replace(new RegExp("\n", "g"), " || ")}`);

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
    dbInterface.deleteUser(userID);
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

    dbInterface.updateUserPreferences(userID, updatedPreferences);
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

    dbInterface.updateAccountSettings(userID, updatedSettings);
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
  try {
    firebase.auth()
        .verifyIdToken(idToken)
        .then((decodedToken) => {
          const uid = decodedToken.uid;
          const name = decodedToken.name;
          const email = decodedToken.email;

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

exports.app = functions.https.onRequest(app); // Exporting the app for Firebase

// //
// //
// // Utilities
// //
// //

// function saveJSON(content, fileName="output.json") {
//   const jsonContent = JSON.stringify(content, null, 4);
//   fs.writeFile(fileName, jsonContent, "utf8", (err) => {
//     if (err) {
//       console.log("An error occured while writing JSON Object to file.");
//       return console.log(err);
//     }

//     console.log(`JSON file ${fileName} has been saved.`);
//   });
// }

// // eslint-disable-next-line no-unused-vars
// function saveActivityForUser(userID, activityID) {
//   db.ref(`users/${userID}/preferences/account/dataUsageOptIn`).once("value", (snapshot) => {
//     const allowed = snapshot.val();
//     if (allowed) {
//       getStravaTokenForID(userID, (stravaToken) => {
//         StravaInterface.getActivity(activityID, stravaToken, (activity) => {
//           saveJSON(activity);
//         });
//       });
//     } else {
//       console.error(`User ${userID} opted out of data usage.`);
//     }
//   });
// }


// const testUserID = "";
// const testActivityID = "";
// saveActivityForUser(testUserID, testActivityID);
