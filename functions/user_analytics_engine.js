const {ANALYTICS_EVENTS} = require("./analytics.js");
// const {defaultParserConfig, defaultFormatConfig, defaultAccountSettingsConfig} = require("./defaultConfigs.js");

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
      const userAnalyticsData = snapshot.val();

      for (let offset = lookbackDays; offset >= 0; offset--) { // Iterate backwards so the array fills out earliest to latest
        const dateIndex = this.getDateFromOffset(offset);
        for (const event of Object.keys(globalEventsDatasets)) {
          const entry = {
            x: dateIndex,
            y: userAnalyticsData[dateIndex][event],
          };
          globalEventsDatasets[event].data.push(entry);
        }
      }

      callback(globalEventsDatasets);
    });
  }
}

module.exports = {UserAnalyticsEngine};
