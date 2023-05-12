
//
//
//
// Helper functions
//
//
//


//
// JS helpers
//

// eslint-disable-next-line no-unused-vars
function print(x) {
  console.log(x);
}

// eslint-disable-next-line no-unused-vars
function arraysAreEqual(a, b) {
  return a.length === b.length && a.every((val, index) => val === b[index]);
}

//
// Math helpers
//

// eslint-disable-next-line no-unused-vars
function averageDistanceToCluster(item, cluster) { // Just an average of all the individual points across the same position in the vector
  if (cluster.length === 0) {
    return 999999999;
  }
  const centroidFeature = computeCentroid(cluster);
  return distanceBetweenNDPoints(centroidFeature, item);
}

function distanceBetweenNDPoints(a, b) {
  const featureCount = a.length;
  const resultVector = [];

  for (let i = 0; i < featureCount; i++) {
    resultVector[i] = Math.pow(a[i] - b[i], 2);
  }

  return Math.pow(resultVector.reduce((a, b) => a + b, 0), 0.5);
}

function computeCentroid(cluster) {
  const featureCount = cluster[0].length;
  const centroidFeature = [];

  for (let i = 0; i < featureCount; i++) {
    centroidFeature.push(cluster.reduce((a, b) => a + b[i], 0) / cluster.length);
  }

  return centroidFeature;
}

// eslint-disable-next-line no-unused-vars
function standardDeviation(items) {
  const average = items.reduce((a, b) => a + b, 0) / items.length;
  const sumOfSquares = items.reduce((a, b) => a + Math.pow(b - average, 2), 0);
  const stdDev = Math.pow(sumOfSquares / items.length, 0.5);

  return stdDev;
}

//
// Running time/dist. helpers
//

// eslint-disable-next-line no-unused-vars
function metersToMiles(meters) {
  return meters * 0.000621371;
}

// eslint-disable-next-line no-unused-vars
function metersToMilesRounded(meters) {
  const res = Math.round(metersToMiles(meters) * 10) / 10;
  if (res % 1 === 0) {
    return Math.round(res); // Cut off the `.0` if it's a whole number
  } else {
    return res;
  }
}

function milesToMeters(miles) {
  return miles * 1609.34;
}

// eslint-disable-next-line no-unused-vars
function secondsToMinutes(seconds) {
  if (seconds % 60 === 30) { // half minute
    return Math.round((seconds - 30) / 60) + 0.5;
  } else {
    return Math.round(seconds / 60);
  }
}

// eslint-disable-next-line no-unused-vars
function secondsPerMile(lap) {
  const distanceMiles = metersToMiles(lap.distance);
  const secondsPerMile = lap.moving_time / distanceMiles;

  return secondsPerMile;
}

// eslint-disable-next-line no-unused-vars
function averagePaceOfSet(set) {
  const totalTime = set.laps.reduce((a, b) => a + b.moving_time, 0);
  const totalDistance = set.laps.reduce((a, b) => a + b.distance, 0);

  return pacePerMileFormatted({"distance": totalDistance, "moving_time": totalTime});
}

//
// Printing helpers
//

// eslint-disable-next-line no-unused-vars
function pacePerMileFormatted(lap) {
  return secondsToTimeFormatted(secondsPerMile(lap));
}

// eslint-disable-next-line no-unused-vars
function averageTimeOfSetFormatted(set) {
  const averageSeconds = set.laps.reduce((a, b) => a + b.moving_time, 0) / set.laps.length;
  return secondsToTimeFormatted(averageSeconds);
}

// eslint-disable-next-line no-unused-vars
function averageDistanceOfSetFormatted(set) {
  const averageDistance = set.laps.reduce((a, b) => a + b.distance, 0) / set.laps.length;
  const roundedMiles = metersToMiles(averageDistance).toFixed(2);

  return roundedMiles;
}

// eslint-disable-next-line no-unused-vars
function secondsFormatter(input, shouldRound) {
  let rounded;

  if (shouldRound) {
    rounded = Math.round(input);
  } else {
    rounded = input.toFixed(1);
  }


  if (rounded === 0) {
    return {
      seconds: "00",
      minuteDiff: 0,
    };
  } else if (rounded < 10) {
    return {
      seconds: `0${rounded}`,
      minuteDiff: 0,
    };
  } else if (rounded === 60) {
    return {
      seconds: "00",
      minuteDiff: 1,
    };
  }

  return {
    seconds: rounded,
    minuteDiff: 0,
  };
}

// eslint-disable-next-line no-unused-vars
function indented(input, indentLevel = 1) {
  return `${"  ".repeat(indentLevel)}${input}\n`;
}

// eslint-disable-next-line no-unused-vars
function secondsToTimeFormatted(seconds, displayWholeMinutes = false) {
  const minutes = Math.floor(seconds / 60);
  const secondsRes = secondsFormatter(seconds % 60, true); // shouldRound = true b/c strava doesn't give decimals for laps

  if (minutes + secondsRes.minuteDiff === 0) {
    return `${secondsRes.seconds}`;
  } else {
    if (secondsRes.seconds === "00" && displayWholeMinutes) {
      return `${minutes} min${minutes === 1 ? "" : "s"}`
    } else {
      return `${minutes + secondsRes.minuteDiff}:${secondsRes.seconds}`;
    }
  }
}

const sixMinMileAsSpeed = 4.47;

module.exports = {
  arraysAreEqual,
  averageDistanceToCluster,
  distanceBetweenNDPoints,
  computeCentroid,
  standardDeviation,
  metersToMiles,
  metersToMilesRounded,
  milesToMeters,
  secondsToMinutes,
  secondsPerMile,
  averagePaceOfSet,
  pacePerMileFormatted,
  averageTimeOfSetFormatted,
  averageDistanceOfSetFormatted,
  secondsFormatter,
  indented,
  secondsToTimeFormatted,
  sixMinMileAsSpeed,
};