const {StravaInterface} = require("../strava_interface.js");
const {DbInterface} = require("../db_interface.js");
const userTestActivities = require("./user_test_runs.json");
const userTestRunsPath = "./user_test_runs.json";

const fs = require("fs");
const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");
const firebase = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://atalanta-12c63-default-rtdb.firebaseio.com",
//   databaseURL: "http://127.0.0.1:9000/?ns=atalanta-12c63-default-rtdb",
});

const dbInterface = new DbInterface(firebase.database());


function cleanStravaActivity(activity) {
  const keysToSave = [
    "laps",
    "name",
    "description",
    "athlete",
    "distance",
    "moving_time",
    "elapsed_time",
    "total_elevation_gain",
    "workout_type",
    "id",
    "start_date",
    "average_speed",
    "max_speed",
    "has_heartrate",
    "average_heartrate",
    "max_heartrate",
  ];

  const cleanedActivity = {};

  for (const key of keysToSave) {
    cleanedActivity[key] = activity[key];
  }

  return cleanedActivity;
}

function saveToTests(activity) {
  const uncategorizedKey = "uncategorized";

  if (uncategorizedKey in userTestActivities) {
    userTestActivities.push(activity);
  } else {
    userTestActivities[uncategorizedKey] = [activity];
  }

  writeToJSON(userTestActivities, userTestRunsPath);
}

function writeToJSON(run, path) {
  const jsonContent = JSON.stringify(run, null, 4);
  fs.writeFile(path, jsonContent, "utf8", (err) => {
    if (err) {
      console.log("An error occured while writing JSON Object to File.");
      return console.log(err);
    }

    console.log(`${path} has been saved.`);
  });
}

function saveActivityForUser(userID, activityID) {
  dbInterface.getDataUsageOptIn(userID, (allowed) => {
    if (allowed) {
      dbInterface.getStravaTokenForID(userID, (stravaToken) => {
        StravaInterface.getActivity(activityID, stravaToken, (activity) => {
          saveToTests(cleanStravaActivity(activity));
          firebase.delete();
        });
      });
    } else {
      console.error(`User ${userID} opted out of data usage.`);
      firebase.delete();
    }
  });
}

// const testUserID = "";
// const testActivityID = "";
// saveActivityForUser(testUserID, testActivityID);

module.exports = {
  cleanStravaActivity,
  saveActivityForUser,
};