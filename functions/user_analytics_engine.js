const {ANALYTICS_EVENTS, USER_EVENTS} = require("./analytics.js");

class UserAnalyticsEngine {
  constructor(db) {
    this.db = db;
  }

  getDateFromOffset(offset) {
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - offset);

    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1);
    const day = String(targetDate.getDate());
    return `${year}-${month}-${day}`;
  }

  async getGlobalEventsDatasets(lookbackDays, callback) {
    this.db.ref(`analytics`).once("value", (snapshot) => {
      const globalEventsDatasets = {
        [ANALYTICS_EVENTS.INBOUND_WEBHOOK]: {
          name: ANALYTICS_EVENTS.INBOUND_WEBHOOK,
          data: [],
        },
        [ANALYTICS_EVENTS.WORKOUT_WRITTEN]: {
          name: ANALYTICS_EVENTS.WORKOUT_WRITTEN,
          data: [],
        },
        [ANALYTICS_EVENTS.RACE_WRITTEN]: {
          name: ANALYTICS_EVENTS.RACE_WRITTEN,
          data: [],
        },
      };
      const globalEventsData = snapshot.val();

      for (let offset = lookbackDays; offset > 0; offset--) { // Iterate backwards so the array fills out earliest to latest
        const dateIndex = this.getDateFromOffset(offset);
        for (const event of Object.keys(globalEventsDatasets)) {
          const entry = {
            x: dateIndex,
            y: globalEventsData[dateIndex][event] === undefined ? 0 : globalEventsData[dateIndex][event],
          };

          globalEventsDatasets[event]["data"].push(entry);
        }
      }

      callback(globalEventsDatasets);
    });
  }

  // Assumes key is the to be bucketed, value is the count
  bucketize(data, step) {
    const bucketizedData = {0: 0};
    let maxBucket = step;
    for (const val of Object.keys(data).sort((a, b) => a - b)) {
      const bucketIdx = Math.ceil(val / step) * step;
      maxBucket = Math.max(bucketIdx, maxBucket);

      if (bucketIdx in bucketizedData) {
        bucketizedData[bucketIdx] += data[val];
      } else {
        bucketizedData[bucketIdx] = data[val];
      }
    }

    // Fill in 0-value bucket gaps if they exist
    for (let potentialBucket = step; potentialBucket < maxBucket; potentialBucket += step) {
      if (!(potentialBucket in bucketizedData)) {
        bucketizedData[potentialBucket] = 0;
      }
    }

    return bucketizedData;
  }

  async getUserEventsDatasets(callback) {
    this.db.ref(`userEvents`).once("value", (snapshot) => {
      const userEventsDatasets = {
        [USER_EVENTS.WEBHOOK]: {
          name: USER_EVENTS.WEBHOOK,
          data: {0: 0},
        },
        [USER_EVENTS.WORKOUT]: {
          name: ANALYTICS_EVENTS.WORKOUT_WRITTEN,
          data: {0: 0},
        },
      };
      const userEventsData = snapshot.val();

      for (const user of Object.values(userEventsData)) {
        for (const event of Object.keys(userEventsDatasets)) {
          if (event in user) {
            const userVal = user[event];
            if (userVal in userEventsDatasets[event]["data"]) {
              userEventsDatasets[event]["data"][userVal] += 1;
            } else {
              userEventsDatasets[event]["data"][userVal] = 1;
            }
          } else {
            userEventsDatasets[event]["data"][0] += 1;
          }
        }
      }

      // Turn into buckets
      for (const event of Object.keys(userEventsDatasets)) {
        userEventsDatasets[event]["data"] = this.bucketize(userEventsDatasets[event]["data"], 5);
      }

      callback(userEventsDatasets);
    });
  }

  async getAllUsers(callback) {
    this.db.ref(`users`).once("value", (usersSnapshot) => {
      this.db.ref(`userEvents`).once("value", (eventsSnapshot) => {
        const allUsers = usersSnapshot.val();
        const allEvents = eventsSnapshot.val();
        const emptyEvents = {webhook_count: 0, workout_count: 0};

        for (const userID of Object.keys(allUsers)) {
          allUsers[userID].id = userID;
          allUsers[userID].events = {...emptyEvents, ...allEvents[userID]}; // Give default if there are no analytics events for the user
        }

        callback(allUsers);
      });
    });
  }
}

module.exports = {UserAnalyticsEngine};
