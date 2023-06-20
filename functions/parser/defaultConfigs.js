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
  "dominantWorkoutType": "BALANCED", //  "BALANCED", "DISTANCE", "TIME"
};

const defaultAccountSettingsConfig = {
  "dataUsageOptIn": true, // true, false
  "emailOptIn": true, // true, false
};

module.exports = {
  defaultFormatConfig,
  defaultParserConfig,
  defaultAccountSettingsConfig,
};
