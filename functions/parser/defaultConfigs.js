
const defaultFormatConfig = {
  "paceUnits": "MILE", // "KM","MILE"
  "sub90SecFormat": "MINUTE", // "MINUTE", "SECONDS"
  "subMileDistanceAverageUnit": "TIME", // "PACE", "TIME"
  "greaterThanMileDistanceAverageUnit": "PACE", // "TIME", "PACE"
  // "splitsFormat": "FULL", // "FULL", "CONDENSED"
  // "summaryMode": "AVERAGE", // "AVERAGE", "RANGE"
};

const defaultParserConfig = {
  "dominantWorkoutType": "BALANCED", // "DISTANCE", "TIME", "BALANCED"
};

const defaultAccountSettingsConfig = {
  "dataUsageOptIn": true,
  "emailOptIn": true,
};

module.exports = {
  defaultFormatConfig,
  defaultParserConfig,
  defaultAccountSettingsConfig,
};
