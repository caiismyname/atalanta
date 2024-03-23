// Default value is first in the options comment on each line

const defaultFormatConfig = {
  "paceUnits": "MILE", // "MILE", "KM"
  "sub90SecFormat": "MINUTE", // "MINUTE", "SECONDS"
  "subMileDistanceValue": "TIME", // "TIME", "PACE"
  "greaterThanMileDistanceValue": "PACE", // "PACE", "TIME"
  "detailsLength": "FULL", // "FULL", "CONDENSED"
  "detailsStructure": "SPLITS", // "SPLITS", "RANGE"
};

const defaultParserConfig = {
  "workoutPace": 0, // 7, 6, 8, 9, 10 — references the slow end of the per-mile pace range for workouts. 0 means not set, and is the default
  "dominantWorkoutType": "BALANCED", //  "BALANCED", "DISTANCE", "TIME"
  "autodetectActivities": true, // true, false
};

const defaultAccountSettingsConfig = {
  "dataUsageOptIn": true, // true, false
  "emailOptIn": true, // true, false
};

const knownStravaDefaultRunNames = ["Morning Run", "Lunch Run", "Afternoon Run", "Evening Run", "Night Run"];

const manualTriggerKeywords = ["splitz", "workoutsplitz", "workoutsplits", "workoutsplitz.com", "workoutsplitzcom", "parse", "reparse"];

const emailCampaignTriggerProperties = {
  MONETIZATION_1: "monetization_trigger_1",
  MONETIZATION_2: "monetization_trigger_2",
};

module.exports = {
  defaultFormatConfig,
  defaultParserConfig,
  defaultAccountSettingsConfig,
  knownStravaDefaultRunNames,
  emailCampaignTriggerProperties,
  manualTriggerKeywords,
};
