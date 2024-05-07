const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const favicon = require("serve-favicon");

const {parseWorkout} = require("./parser/parser.js");
const {StravaInterface} = require("./strava_interface.js");
const {MockStravaInterface} = require("./mock_strava_interface.js");
const {DbInterface} = require("./db_interface.js");
const {UserAnalyticsEngine} = require("./user_analytics_engine.js");
const {EmailInterface} = require("./email_interface.js");
const {ANALYTICS_EVENTS, logAnalytics, logUserEvent, USER_EVENTS} = require("./analytics.js");
const {defaultAccountSettingsConfig, stravaOauthURL} = require("./defaultConfigs.js");

const functions = require("firebase-functions");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

const app = express();

app.set("title", "Strava Workout Parser");
app.set("views", "./views");
app.set("view engine", "pug");

app.use(cookieParser());
app.use(express.static("public"));
app.use(cors());
app.use(favicon(path.join(__dirname, "public", "favicon.ico")));

const isEmulator = process.env.FUNCTIONS_EMULATOR;
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

  const code = req.query.code;
  const userToken = req.cookies["__session"];

  validateUserToken({
    userToken: userToken,
    res: res,
    originalURL: `test?code=${encodeURIComponent(code)}`,
    callback: (userID) => {
      console.log(`CODE FOUND: [${code}]`);
      res.send(`CODE FOUND: [${code}]`);
    },
  });
});

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/initiate_strava_oauth_connection", (req, res) => {
  // This endpoint exists as the entrypoint to Strava OAuth flow when initiated from a link in an arbitary context (e.g. email)
  // It hits the validateUserToken endpoint to ensure we're logged in, then redirects to Strava. This way,
  // when `/strava_oauth_redirect` is called, we are ensured that the browser already has the _sessino cookie set.
  const userToken = req.cookies["__session"];
  validateUserToken({
    userToken: userToken,
    res: res,
    originalURL: `initiate_strava_oauth_connection`,
    callback: () => {
      res.redirect(stravaOauthURL); // TO BE CLEAR, this is a Strava-hosted page, not Splitz's /strava_oauth_redirect
    },
  });
});

app.get("/strava_oauth_redirect", (req, res) => {
  const code = req.query.code;
  const userToken = req.cookies["__session"];
  const stravaConfigDetails = StravaInterface.stravaConfigDetails();

  validateUserToken({
    userToken: userToken,
    res: res,
    originalURL: `strava_oauth_redirect?code=${encodeURIComponent(code)}`,
    callback: (userID) => {
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
    },
  });
});

app.get("/login", (req, res) => {
  res.render("login", {postLogin: encodeURIComponent(req.query.postLogin)});
});

app.get("/home", (req, res) => {
  const userToken = req.cookies["__session"]; // Firebase functions' caching will strip any tokens not named `__session`
  validateUserToken({
    userToken: userToken,
    res: res,
    originalURL: `home`,
    callback: (userID) => {
      if (userID !== null) {
        dbInterface.isUserCreated(userID, (isCreated) => {
          if (!isCreated) {
            getPersonalDetailsFromUserToken(userToken, (details) => {
              dbInterface.createNewUser(details, () => {
                dbInterface.getUserDetails(userID, (details) => {
                  details.stravaOauthURL = stravaOauthURL;
                  res.render("home", details);
                });
              });
            });
          } else {
            dbInterface.getUserDetails(userID, (details) => {
              details.stravaOauthURL = stravaOauthURL;
              res.render("home", details);
            });
          }
        });
      }
    },
  });
});

app.get("/admin", (req, res) => {
  const userToken = req.cookies["__session"];
  validateAdminToken({
    userToken: userToken,
    res: res,
    originalURL: `admin`,
    callback:
      () => {
        res.render("admin");
      },
  });
});

app.get("/admin/recent_workouts", (req, res) => {
  const userToken = req.cookies["__session"]; // Firebase functions' caching will strip any tokens not named `__session`
  validateAdminToken({
    userToken: userToken,
    res: res,
    originalURL: `admin/recent_workouts`,
    callback: () => {
      dbInterface.getStoredWorkoutsForAnalytics((workouts) => {
        res.render("recent_workouts_viewer", {workouts: workouts});
      });
    },
  });
});

app.get("/admin/user_analytics", (req, res) => {
  const userToken = req.cookies["__session"];
  validateAdminToken({
    userToken: userToken,
    res: res,
    originalURL: `admin/user_analytics`,
    callback: () => {
      const userAnalyticsEngine = new UserAnalyticsEngine(db);
      userAnalyticsEngine.getGlobalEventsDatasets(90, (globalEventDatasets) => {
        userAnalyticsEngine.getUserEventsDatasets((userEventDatasets) => {
          res.render("user_analytics", {
            "globalEventDatasets": globalEventDatasets,
            "userEventDatasets": userEventDatasets,
          });
        });
      });
    },
  });
});

app.get("/admin/user_viewer", (req, res) => {
  const userToken = req.cookies["__session"];
  validateAdminToken({
    userToken: userToken,
    res: res,
    originalURL: `admin/user_viewer`,
    callback: () => {
      const userAnalyticsEngine = new UserAnalyticsEngine(db);
      userAnalyticsEngine.getAllUsers((userInfo) => {
        const totalCount = Object.keys(userInfo).length;
        const activeCount = Object.values(userInfo).filter((x) => x.stravaConnected).length;
        res.render("user_viewer", {
          "users": userInfo,
          "totalCount": totalCount,
          "activeCount": activeCount,
        });
      });
    },
  });
});

app.get("/admin/mock_strava", (req, res) => {
  // Not validating token because it's emulator-only
  if (isEmulator) {
    MockStravaInterface.initialize(dbInterface);
    MockStravaInterface.sendWorkoutRun(processActivity);
    res.send("Mocked");
  } else {
    res.render("/");
  }
});

// Adds support for GET requests to the webhook for webhook subscription creation
app.get("/strava_webhook", (req, res) => {
  StravaInterface.webhookCreationResponse(req, res);
});

function processActivity({
  activityID = "0",
  userStravaID = "0",
  isTest = false,
  forceParse = false,
  configOverride="DEFAULT",
} = {}) {
  dbInterface.getUserIDForStravaID(userStravaID, (userID) => {
    dbInterface.getStravaTokenForID(userID, (stravaToken) => {
      StravaInterface.getActivity(activityID, stravaToken, (activity) => {
        logUserEvent(USER_EVENTS.WEBHOOK, userID, db);
        logUserEvent(USER_EVENTS.MOST_RECENT_WEBHOOK, userID, db);

        if (activity.type === "Run") {
          if (!isTest) {
            logAnalytics(ANALYTICS_EVENTS.ACTIVITY_IS_ELIGIBLE, db);
            logUserEvent(USER_EVENTS.RUN, userID, db);
          }

          dbInterface.getPreferencesForUser(userID, (config) => {
            // Short circuit if both not autodetect AND not a manual trigger
            // Double check the title b/c `handleWebhook` only checks the title if the event is an update,
            // but `splitz` could've been added to the title on the creation of the activity.
            if (!config.parser.autodetectActivities && !forceParse && !StravaInterface.titleIsManualTrigger(activity.name)) {
              console.log(`ACTIVITY ${activityID} not parsed because autoparse is disabled`);
              return;
            }

            // Overriding preferences if the manual trigger specified them.
            if (configOverride === "PACE") {
              config.format.subMileDistanceValue = "PACE";
              config.format.greaterThanMileDistanceValue = "PACE";
            } else if (configOverride === "TIME") {
              config.format.subMileDistanceValue = "TIME";
              config.format.greaterThanMileDistanceValue = "TIME";
            }

            const output = parseWorkout({
              run: activity,
              config: config,
              verbose: false,
              forceParse: forceParse,
            });
            if (output.isWorkout) {
              console.log(`ACTIVITY ${activityID} is a workout. Title: [${output.summary.title}] Description: [${output.summary.description.replace(new RegExp("\n", "g"), " || ")}]`);
              if (!isTest) {
                logAnalytics(ANALYTICS_EVENTS.WORKOUT_DETECTED, db);
                logUserEvent(USER_EVENTS.WORKOUT, userID, db);
                logUserEvent(USER_EVENTS.MOST_RECENT_WORKOUT, userID, db);
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
            } else if (output.isRace) {
              console.log(`ACTIVITY ${activityID} is a race. Title: [${output.summary.title}] Description: [${output.summary.description.replace(new RegExp("\n", "g"), " || ")}]`);
              if (!isTest) {
                logAnalytics(ANALYTICS_EVENTS.RACE_DETECTED, db);
              }
              setTimeout(() => {
                if (isTest) {
                  output.summary.title += ` ${new Date()}`;
                  output.summary.description += `\n${new Date()}`;
                }
                StravaInterface.writeSummaryToStrava(activityID, output.summary, stravaToken);
                if (!isTest) {
                  logAnalytics(ANALYTICS_EVENTS.RACE_WRITTEN, db);
                  dbInterface.storeWrittenWorkout(activityID, userID, output.summary);
                }
              }, 0); // Keep the timeout framework but no timeout for now
            } else {
              console.log(`ACTIVITY ${activityID} is NOT a workout nor race — no action taken.`);
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
  const isAccountDeauthorization = StravaInterface.webhookIsAccountDeauth(req);
  const isStravaDefaultTitleUpdate = StravaInterface.webhookIsDefaultTitleUpdate(req);
  const isManualTrigger = StravaInterface.webhookIsManualTrigger(req);

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
        processActivity({
          activityID: activityID,
          userStravaID: userStravaID,
          isTest: isTest,
        });
      }
    });
  } else if (isActivity && isStravaDefaultTitleUpdate) {
    dbInterface.getIsWorkoutWritten(activityID, (isWritten) => {
      // If we've already written the workout, and we subsequently receive a default title update, it means we were overwritten and we need to re-write
      if (isWritten) {
        processActivity({
          activityID: activityID,
          userStravaID: userStravaID,
          isTest: isTest,
        });
      }
    });
  } else if (isAccountDeauthorization) {
    dbInterface.getUserIDForStravaID(req.body.owner_id, (userID) => {
      dbInterface.deleteUser(userID);
      logAnalytics(ANALYTICS_EVENTS.USER_STRAVA_DEACTIVATION, db);
    });
  } else if (isManualTrigger) {
    console.log(`Manual override for ACTIVITY ${activityID}. Details override: [${isManualTrigger}]`);
    processActivity({
      activityID: activityID,
      userStravaID: userStravaID,
      isTest: isTest,
      forceParse: true,
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
  validateUserToken({
    userToken: userToken,
    res: res,
    originalURL: `delete_account`,
    callback: (userID) => {
      dbInterface.deleteUser(userID);
      logAnalytics(ANALYTICS_EVENTS.USER_ACCOUNT_DELETION, db);
      res.redirect("/");
    },
  });
});

app.post("/update_preferences", (req, res) => {
  const userToken = req.cookies["__session"];
  validateUserToken({
    userToken: userToken,
    res: res,
    originalURL: `update_preferences`,
    callback: (userID) => {
      const data = req.body;

      // workoutPace defaults to 0, which means it won't be returned in the form if it's not set
      let workoutPace = 0;
      if ("workoutPace" in data) {
        workoutPace = Number(data.workoutPace); // The value is returned as a string but we need to store it as a number since it represents minutes
      }

      const updatedPreferences = {
        parser: {
          dominantWorkoutType: data.dominantWorkoutType,
          workoutPace: workoutPace,
          autodetectActivities: data.autodetectActivities == "true", // It comes in as a string
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
    },
  });
});

app.post("/update_account_settings", (req, res) => {
  const userToken = req.cookies["__session"];
  validateUserToken({
    userToken: userToken,
    res: res,
    originalURL: `update_account_settings`,
    callback: (userID) => {
      const enabledSettings = req.body.accountSettings !== undefined ? req.body.accountSettings : []; // The object is undefined if no items were checked

      const updatedSettings = {...defaultAccountSettingsConfig};
      Object.keys(updatedSettings).forEach((setting) => {
        updatedSettings[setting] = enabledSettings.includes(setting);
      });

      dbInterface.updateAccountSettings(userID, updatedSettings);
    },
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
function validateUserToken({
  userToken = "123",
  res = {},
  originalURL = "/",
  callback = () => {},
}) {
  try {
    firebase.auth()
        .verifyIdToken(userToken)
        .then((decodedToken) => {
          const uid = decodedToken.uid;
          callback(uid);
        })
        .catch((error) => {
          console.error(`Invalid user authentication: ${error}`);
          res.redirect(`/login?postLogin=${encodeURIComponent(originalURL)}`);
        });
  } catch (error) {
    console.error(error);
    res.redirect(`/login?postLogin=${originalURL}`);
  }
}

function validateAdminToken({
  userToken = "123",
  res = {},
  originalURL = "admin",
  callback = () => {},
}) {
  try {
    if (isEmulator) {
      callback(1234);
      return;
    }

    firebase.auth()
        .verifyIdToken(userToken)
        .then((decodedToken) => {
          const uid = decodedToken.uid;
          if (uid === functions.config().admin.david || uid === functions.config().admin.caiismyname) {
            callback(uid);
          } else {
            console.error(`Logged in user is not an admin`);
            res.redirect("/home");
          }
        })
        .catch((error) => {
          console.error(`Invalid user authentication: ${error}`);
          res.redirect(`/login?postLogin=${originalURL}`);
        });
  } catch (error) {
    console.error(error);
    res.redirect(`/login?postLogin=${originalURL}`);
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

// The main app for Firebase
exports.app = functions.https.onRequest(app);

exports.emailDaemon = onSchedule("every day 12:00", () => { // UTC, so it's 8am ET
  const emailHandler = new EmailInterface(db);
  emailHandler.runDailyTriggerDaemon();
});
