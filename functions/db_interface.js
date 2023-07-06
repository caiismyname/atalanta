const {ANALYTICS_EVENTS, logAnalytics} = require("./analytics.js");
const {StravaInterface} = require("./strava_interface.js");
const {defaultParserConfig, defaultFormatConfig, defaultAccountSettingsConfig} = require("./parser/defaultConfigs.js");

class DbInterface {
  constructor(db) {
    this.db = db;
  }

  isUserCreated(userID, callback) {
    this.db.ref(`users/${userID}`).once("value", (snapshot) => {
      callback(snapshot.exists());
    });
  }

  createNewUser(details) {
    logAnalytics(ANALYTICS_EVENTS.USER_ACCOUNT_SIGNUP, this.db);
    this.db.ref(`users/${details.userID}`).update({
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

  saveStravaCredentialsForUser(userID, stravaID, accessToken, refreshToken, expiration) {
    this.db.ref(`users/${userID}`).update({
      stravaConnected: true,
      stravaID: stravaID,
      accessToken: accessToken,
      refreshToken: refreshToken,
      accessTokenExpiration: expiration,
    }, (error) => {
      console.log(error);
    });

    // Create the reverse lookup (stravaID: googleID)
    this.db.ref(`stravaIDLookup/${stravaID}`).update({
      userID: userID,
    }, (error) => {
      console.log(error);
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
          console.error(error);
        },
    );
  }

  updateAccountSettings(userID, updatedSettings) {
    this.db.ref(`users/${userID}/preferences/account`).update(
        updatedSettings,
        (error) => {
          console.error(error);
        },
    );
  }

  getDataUsageOptIn(userID, callback) {
    this.db.ref(`users/${userID}/preferences/account/dataUsageOptIn`).once("value", (snapshot) => {
      const allowed = snapshot.val();
      callback(allowed);
    });
  }
}


module.exports = {DbInterface};
