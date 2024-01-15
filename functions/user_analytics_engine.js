const {ANALYTICS_EVENTS} = require("./analytics.js");
// const {defaultParserConfig, defaultFormatConfig, defaultAccountSettingsConfig} = require("./defaultConfigs.js");

class UserAnalyticsEngine {
  constructor(db) {
    this.db = db;
  }

  async webhooksByDay(lookbackDays=90, callback) {
    this.db.ref(`analytics`).once("value", snapshot => {
        const dataset = [];
        const userAnalyticsData = snapshot.val();
        for (let offset = lookbackDays; offset >= 0; offset--) { // Iterate backwards so the array fills out earliest to latest
            const today = new Date();
            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() - offset);
            
            const year = targetDate.getFullYear();
            const month = String(targetDate.getMonth() + 1);
            const day = String(targetDate.getDate());
            const dateIndex = `${year}-${month}-${day}`;
    
            const entry = {
                x: dateIndex,
                y: userAnalyticsData[dateIndex][ANALYTICS_EVENTS.INBOUND_WEBHOOK]
            }
            dataset.push(entry);
        }
    
        callback(dataset)
    });
  }
}

module.exports = {UserAnalyticsEngine};
