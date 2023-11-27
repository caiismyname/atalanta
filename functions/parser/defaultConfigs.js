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
  "workoutPace": 7, // 7, 6, 8, 9, 10 — references the slow end of the per-mile pace range for workouts
  "dominantWorkoutType": "BALANCED", //  "BALANCED", "DISTANCE", "TIME"
};

const defaultAccountSettingsConfig = {
  "dataUsageOptIn": true, // true, false
  "emailOptIn": true, // true, false
};

const knownStravaDefaultRunNames = ["Morning Run", "Lunch Run", "Afternoon Run", "Evening Run", "Night Run"];

module.exports = {
  defaultFormatConfig,
  defaultParserConfig,
  defaultAccountSettingsConfig,
  knownStravaDefaultRunNames,
};
