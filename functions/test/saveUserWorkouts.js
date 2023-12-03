/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "_" }]*/

const {StravaInterface} = require("../strava_interface.js");
const {DbInterface} = require("../db_interface.js");
const userTestActivities = require("./user_test_runs.json");
const userTestRunsPath = "./test/user_test_runs.json";

const specificTestActivities = require("./false_positive_test_runs.json");
const specificTestRunsPath = "./test/false_positive_test_runs.json";

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
    "name",
    "description",
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

  cleanedActivity.laps = [];
  if ("laps" in activity) {
    for (const lap of activity.laps) {
      const {athlete: _, activity: __, ...rest} = lap;
      cleanedActivity.laps.push(rest);
    }
    return cleanedActivity;
  } else {
    return {};
  }
}

function saveToTests(activity) {
  const uncategorizedKey = "uncategorized";

  if (uncategorizedKey in userTestActivities) {
    userTestActivities[uncategorizedKey].push(activity);
  } else {
    userTestActivities[uncategorizedKey] = [activity];
  }

  writeToJSON(userTestActivities, userTestRunsPath);
}

function saveToSpecificFile(activity) {
  const groupingKey = "brian_l";
  specificTestActivities[groupingKey]["unknown"][activity.id] = activity;
  writeToJSON(specificTestActivities, specificTestRunsPath);
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

function saveMultipleActivitiesForUser(userID, numRuns) {
  dbInterface.getDataUsageOptIn(userID, (allowed) => {
    if (allowed) {
      dbInterface.getStravaTokenForID(userID, (stravaToken) => {
        StravaInterface.getRecentRuns(stravaToken, numRuns, (activityIDs) => {
          console.log(activityIDs);
          for (const activityID of activityIDs) {
            console.log(`Saving ${activityID}`);
            StravaInterface.getActivity(activityID, stravaToken, (activity) => {
              saveToSpecificFile(cleanStravaActivity(activity));
            });
          }
          firebase.delete();
        });
      });
    } else {
      console.error(`User ${userID} opted out of data usage.`);
      firebase.delete();
    }
  });
}


const args = process.argv.slice(2); // skip `node` and the script name

if (args[0] === "-h" || args[0] === "h") { // help
  console.log("Usage: \n -i [activity ID] [userID (firebase)]\n -m [userID (firebase)] [number of runs to save]");
} else if (args[0] === "-i" || args[0] === "i") { // save individual activity
  const testActivityID = args[1];
  const testUserID = args[2];

  console.log(`Saving activity ${testActivityID} for ${testUserID}`);

  saveActivityForUser(testUserID, testActivityID);
} else if (args[0] === "-m" || args[0] === "m") { // save multiple activities
  const userID = args[1];
  const numRuns = args[2];

  console.log(`Saving ${numRuns} activities for ${userID}`);
  saveMultipleActivitiesForUser(userID, numRuns);
}

module.exports = {
  cleanStravaActivity,
  saveActivityForUser,
};
