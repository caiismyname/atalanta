const axios = require("axios");
const functions = require("firebase-functions");
const {knownStravaDefaultRunNames, manualTriggerKeywords} = require("./defaultConfigs.js");

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

  // Returns a list of IDs of activities, to then retrieve one-by-one
  static getRecentRuns(accessToken, numActivities, callback) {
    const stravaConfigDetails = this.stravaConfigDetails();
    const activitiesPerPage = numActivities; // Making it clear that this doesn't actually paginate, it just sets a large page size
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

  static webhookIsAccountDeauth(req) {
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

  static webhookIsDefaultTitleUpdate(req) {
    if (req.body.aspect_type === "update") {
      if ("updates" in req.body) { // being defensive here
        if ("title" in req.body.updates) {
          const newTitle = req.body.updates.title;
          return knownStravaDefaultRunNames.includes(newTitle);
        }
      }
    }

    return false;
  }

  static titleIsManualTrigger(title) {
    let isManualTrigger = false;
    let requestPace = false;
    let requestTime = false;

    const newTitle = title
        .toLowerCase()
        .replace(/[-~!@&*()_+=|'";:/?.>,<]/g, "")
        .split(" ");

    for (const word of newTitle) {
      if (manualTriggerKeywords.includes(word)) {
        isManualTrigger = true;
      }
    }

    if (isManualTrigger) {
      requestPace = newTitle.includes("pace");
      requestTime = newTitle.includes("time");
    }

    if (!isManualTrigger) {
      return false;
    }

    // Non-empty string evals to `true`
    if (requestPace && !requestTime) {
      return "PACE";
    } else if (!requestPace && requestTime) {
      return "TIME";
    } else {
      return "DEFAULT";
    }
  }

  static webhookIsManualTrigger(req) {
    if (req.body.aspect_type === "update") {
      if ("updates" in req.body) { // being defensive here
        if ("title" in req.body.updates) {
          const title = req.body.updates.title;
          return this.titleIsManualTrigger(title);
        }
      }
    }

    return false;
  }
}

module.exports = {
  StravaInterface,
};
