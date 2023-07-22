const axios = require("axios");
const functions = require("firebase-functions");

class StravaInterface {
  static stravaConfigDetails() {
    return {
      apiBase: "https://www.strava.com/api/v3",
      stravaAuthTokenURL: "https://www.strava.com/oauth/token",
      stravaClientID: "101816",
      stravaClientSecret: functions.config().strava.api_secret,
      initialGrantType: "authorization_code",
      refreshGrantType: "refresh_token",
    };
  }

  static acknowledgeWebhook(res) {
    res.status(200).send("EVENT_RECEIVED");
  }

  static refreshAccessToken(refreshToken, callback) {
    const stravaConfigDetails = this.stravaConfigDetails();

    // Request new access token
    axios({
      method: "post",
      url: `${stravaConfigDetails.stravaAuthTokenURL}?client_id=${stravaConfigDetails.stravaClientID}&client_secret=${stravaConfigDetails.stravaClientSecret}&grant_type=${stravaConfigDetails.refreshGrantType}&refresh_token=${refreshToken}`,
      headers: "application/json",
    }).then((res) => {
      // Save new access token and expiry
      const accessToken = res.data.access_token;
      const expiration = res.data.expires_at;

      callback({
        "accessToken": accessToken,
        "expiration": expiration,
      });
    });
  }

  static getActivity(activityID, accessToken, callback) {
    const stravaConfigDetails = this.stravaConfigDetails();
    // console.log(`Getting ${activityID} from Strava`);

    const config = {
      headers: {Accept: "application/json", Authorization: `Bearer ${accessToken}`},
    };

    axios.get(`${stravaConfigDetails.apiBase}/activities/${activityID}`, config)
        .then((res) => {
          callback(res.data);
        });
  }

  static getRecentRuns(accessToken, callback) {
    const stravaConfigDetails = this.stravaConfigDetails();
    const activitiesPerPage = 80;
    const config = {
      headers: {Accept: "application/json", Authorization: `Bearer ${accessToken}`},
    };

    axios.get(`${stravaConfigDetails.apiBase}/athlete/activities?&per_page=${activitiesPerPage}`, config)
        .then((res) => {
          callback(res.data
              .filter((activity) => activity.type === "Run")
              .map((activity) => activity.id),
          );
        });
  }

  static writeSummaryToStrava(activityID, summary, accessToken) {
    const stravaConfigDetails = this.stravaConfigDetails();
    const config = {headers: {Accept: "application/json", Authorization: `Bearer ${accessToken}`}};
    const newTitleAndDescription = {
      "name": summary.title,
      "description": summary.description,
    };
    axios.put(`${stravaConfigDetails.apiBase}/activities/${activityID}`, newTitleAndDescription, config)
        .then((res) => {
          console.log(`ACTIVITY ${activityID} written to Strava (${res.status})`);
        });
  }

  static webhookCreationResponse(req, res) {
    const webhookVerifyToken = "atalanta_verify";

    // Parses the query params
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    // Checks if a token and mode is in the query string of the request
    if (mode && token) {
      // Verifies that the mode and token sent are valid
      if (mode === "subscribe" && token === webhookVerifyToken) {
        // Responds with the challenge token from the request
        console.log(`STRAVA WEBHOOK VERIFIED`);
        res.json({"hub.challenge": challenge});
      } else {
        // Responds with '403 Forbidden' if verify tokens do not match
        res.sendStatus(403);
      }
    }
  }
}

module.exports = {
  StravaInterface,
};
