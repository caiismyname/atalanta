
const defaultPrintConfig = {
  "paceUnits": "MILE", // "KM","MILE"
  "showMinForSub90Sec": true, // true, false
  "subMileDistanceAverageUnit": "TIME", // "PACE", "TIME"
  "greaterThanMileDistanceAverageUnit": "PACE", // "TIME", "PACE"
  "condensedSplits": false, // true, false
  "summaryMode": "AVERAGE", // "AVERAGE", "RANGE"
};

const defaultParserConfig = {
  "dominantWorkoutType": "BALANCED", // "DISTANCE", "TIME", "BALANCED"
};

module.exports = {
  defaultPrintConfig,
  defaultParserConfig,
};
