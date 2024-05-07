const {ANALYTICS_EVENTS, logAnalytics} = require("./analytics.js");
const {StravaInterface} = require("./strava_interface.js");
const {defaultParserConfig, defaultFormatConfig, defaultAccountSettingsConfig, emailCampaigns} = require("./defaultConfigs.js");
const {getDatestamp} = require("./analytics.js");
const {EMAIL_STATUS} = require("./email_interface.js");

class DbInterface {
  constructor(db) {
    this.db = db;
  }

  isUserCreated(userID, callback) {
    this.db.ref(`users/${userID}`).once("value", (snapshot) => {
      callback(snapshot.exists());
    });
  }

  createNewUser(details, callback) {
    const updateObj = {};

    updateObj[`users/${details.userID}`] = {
      stravaConnected: false,
      name: details.name,
      email: details.email,
      createDate: getDatestamp(),
      preferences: {
        parser: defaultParserConfig,
        format: defaultFormatConfig,
        account: defaultAccountSettingsConfig,
      },
    };

    for (const emailID of Object.values(emailCampaigns)) {
      updateObj[`emailCampaigns/${emailID}/${details.userID}`] = EMAIL_STATUS.NOT_SENT;
    }

    this.db.ref().update(updateObj).then((error) => {
      if (error) {
        console.error(`Error creating user: ${error}`);
      } else {
        logAnalytics(ANALYTICS_EVENTS.USER_ACCOUNT_SIGNUP, this.db);
      }
      callback();
    });
  }

  saveStravaCredentialsForUser(userID, stravaID, accessToken, refreshToken, expiration) {
    const updateObj = {};
    this.db.ref(`users/${userID}`).update({
      stravaConnected: true,
      stravaID: stravaID,
      accessToken: accessToken,
      refreshToken: refreshToken,
      accessTokenExpiration: expiration,
    }, (error) => {
      if (error) {
        console.error(`Error saving Strava credentials: ${error}`);
      }
    });

    // Create the reverse lookup (stravaID: googleID)
    this.db.ref(`stravaIDLookup/${stravaID}`).update({
      userID: userID,
    }, (error) => {
      if (error) {
        console.error(`Error saving Strava credentials: ${error}`);
      }
    });
  }

  getStravaTokenForID(userID, callback, forceRefresh=false) {
    this.db.ref(`users/${userID}/accessTokenExpiration`).once("value", (snapshot) => {
      const expirationEpoch = snapshot.val();
      const expiration = new Date(0);
      expiration.setUTCSeconds(expirationEpoch);

      // Token has expired, request a new one
      if (new Date() >= expiration || forceRefresh) {
        // Get refresh token
        this.db.ref(`users/${userID}/refreshToken`).once("value", (snapshot) => {
          const refreshToken = snapshot.val();
          // Get new access token from Strava
          StravaInterface.refreshAccessToken(refreshToken, (res) => {
            // Save new access token and expiry
            this.db.ref(`users/${userID}`).update({
              accessToken: res.accessToken,
              accessTokenExpiration: res.expiration,
            });
            callback(res.accessToken);
          });
        });
      } else {
        this.db.ref(`users/${userID}/accessToken`).once("value", (snapshot) => {
          const accessToken = snapshot.val();
          callback(accessToken);
        });
      }
    });
  }

  getUserIDForStravaID(stravaID, callback) {
    this.db.ref(`stravaIDLookup/${stravaID}/userID`).once("value", (snapshot) => {
      const userID = snapshot.val();

      callback(userID);
    });
  }

  getUserDetails(userID, callback) {
    this.db.ref(`users/${userID}`).once("value", (snapshot) => {
      const details = snapshot.val();
      callback(
          // Construct a new object so we control exactly what's being sent
          // i.e. omitting access tokens etc.
          {
            stravaConnected: details["stravaConnected"],
            name: details["name"],
            email: details["email"],
            preferences: details.preferences,
          });
    });
  }

  // Excludes account settings
  getPreferencesForUser(userID, callback) {
    this.db.ref(`users/${userID}/preferences`).once("value", (snapshot) => {
      const prefs = snapshot.val();
      callback({
        parser: prefs.parser,
        format: prefs.format,
      });
    });
  }

  deleteUser(userID) {
    this.db.ref(`users/${userID}/stravaID`).once("value", (snapshot) => {
      const stravaID = snapshot.val();
      this.db.ref(`stravaIDLookup/${stravaID}`).remove();
      this.db.ref(`users/${userID}`).remove();
      // console.log(`Deleted user ${userID}`);
    });
  }

  updateUserPreferences(userID, updatedPreferences) {
    this.db.ref(`users/${userID}/preferences/parser`).update(
        updatedPreferences.parser,
        (error) => {
          console.error(error);
        },
    );

    this.db.ref(`users/${userID}/preferences/format`).update(
        updatedPreferences.format,
        (error) => {
          if (error) {
            console.error(`Error updating user preferences: ${error}`);
          }
        },
    );
  }

  updateAccountSettings(userID, updatedSettings) {
    this.db.ref(`users/${userID}/preferences/account`).update(
        updatedSettings,
        (error) => {
          if (error) {
            console.error(`Error updating account settings: ${error}`);
          }
        },
    );
  }

  getDataUsageOptIn(userID, callback) {
    this.db.ref(`users/${userID}/preferences/account/dataUsageOptIn`).once("value", (snapshot) => {
      const allowed = snapshot.val();
      callback(allowed);
    });
  }

  generateDatestamp(date = new Date()) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  storeWrittenWorkout(activityID, userID, parsedOutput) {
    const datestamp = this.generateDatestamp();

    this.db.ref(`analytics/parsedWorkouts/${datestamp}`).push({
      "activityID": activityID,
      "userID": userID,
      "parsedOutputTitle": `${parsedOutput.title}`,
      "parsedOutputDescription": `${parsedOutput.description.replace("Workout summary generated by workoutsplitz.com", "")}`,
    }, (error) => {
      if (error) {
        console.error(`Error storing written workout: ${error}`);
      }
    });
  }

  fillWorkouts() {
    for (let i = 0; i < 10; i++) {
      this.storeWrittenWorkout("123", "456", {title: "4x400m", description: "4 x 400m — Avg: 59\n59,58,57,56"});
    }
  }

  getStoredWorkoutsForAnalytics(callback, daysBack = 3) {
    const queriedDates = [];
    for (let i = 0; i < daysBack; i++) {
      const today = new Date();
      today.setDate(today.getDate() - i);
      queriedDates.push(this.generateDatestamp(today));
    }

    const allPromises = [];
    const fetchedWorkouts = [];

    for (const datestamp of queriedDates) {
      allPromises.push(new Promise((resolve, reject) => {
        this.db.ref(`analytics/parsedWorkouts/${datestamp}`).once("value", (snapshot) => {
          const rawWorkouts = snapshot.val();
          if (rawWorkouts) {
            fetchedWorkouts.push({
              "date": datestamp,
              "workouts": Object.values(rawWorkouts),
            });
          }
          resolve();
        });
      }));
    }

    Promise.all(allPromises)
        .then((result) => {
          fetchedWorkouts.sort((a, b) => {
            new Date(b.date) - new Date(a.date); // sort in reverse order (most recent first);
          });
          callback(fetchedWorkouts);
        })
        .catch((error) => {
          console.error(`ERROR ${error}`);
          callback([]);
        });


    // Format:
    //   [
    //     {
    //       date: "2023-7-7",
    //       workouts: [
    //         {
    //           "activityID": "1235",
    //           "userID": "abcde",
    //           "parsedOutputTitle": "4 x 400m",
    //           "parsedOutputDesription": "400m — Avg: 58 \n59,58,58,57",
    //         },
    //         {
    //           "activityID": "1235",
    //           "userID": "abcde",
    //           "parsedOutputTitle": "4 x 400m",
    //           "parsedOutputDesription": "400m — Avg: 58 \n59,58,58,57",
    //         }
    //       ]
    //     },
    //     {
    //       date: "2023-7-6",
    //       workouts: [
    //         {
    //           "activityID": "1235",
    //           "userID": "abcde",
    //           "parsedOutputTitle": "4 x 400m",
    //           "parsedOutputDesription": "400m — Avg: 58 \n59,58,58,57",
    //         },
    //         {
    //           "activityID": "1235",
    //           "userID": "abcde",
    //           "parsedOutputTitle": "4 x 400m",
    //           "parsedOutputDesription": "400m — Avg: 58 \n59,58,58,57",
    //         }
    //       ]
    //     }
    //   ]
  }

  getIsWorkoutWritten(activityID, callback) {
    const todayDatestamp = this.generateDatestamp();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDatestamp = this.generateDatestamp(yesterday);

    const todayRef = this.db.ref(`analytics/parsedWorkouts/${todayDatestamp}`);
    const yesterdayRef = this.db.ref(`analytics/parsedWorkouts/${yesterdayDatestamp}`);

    todayRef.orderByChild(`activityID`).equalTo(activityID).once("value", (snapshot) => {
      const writtenWorkoutFoundToday = snapshot.exists();
      if (writtenWorkoutFoundToday) { // If false, check yesterday
        callback(writtenWorkoutFoundToday);
      } else {
        yesterdayRef.orderByChild(`activityID`).equalTo(activityID).once("value", (snapshot) => {
          const writtenWorkoutFoundYesterday = snapshot.exists();
          callback(writtenWorkoutFoundYesterday); // Send regardless of result since we're only looking at today and yesterday
        });
      }
    });
  }
}


module.exports = {DbInterface};
