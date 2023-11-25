
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

function isKilometer(distance) {
  const marginOfError = 20.0; // meters
  return Math.abs(distance - 1000) <= marginOfError;
}

function isMile(distance) {
  const marginOfError = 0.02; // miles
  return Math.abs((distance * 0.000621371) - 1.0) <= marginOfError;
}

function isLongerThanMile(distance) {
  const marginOfError = 0.02; // miles
  return (distance * 0.000621371) - (1.0 - marginOfError) >= 0;
}

// Returns "LESS", "EQUALS", "MORE"
function compareToMile(distanceMeters) {
  if (isMile(distanceMeters)) {
    return "EQUALS";
  } else {
    if (isLongerThanMile(distanceMeters)) {
      return "MORE";
    } else {
      return "LESS";
    }
  }
}

function isAutolap(lap) {
  return isMile(lap.distance) || isKilometer(lap.distance);
}

function lapIsNotTooFast(lap) {
  const worldRecordSpeed = 100 / 9.58; // Bolt's 100m record
  const lapSpeed = lap.distance / lap.moving_time;

  return lapSpeed < worldRecordSpeed;
}

function winsorizeLapSpeeds(laps) {
  const maxSlowness = milesToMeters(6) / (60.0 * 60.0); // 10 minute mile, in m/s
  // Adjust super slow laps as they're probably standing rest, and it messes with the workout classifier by skewing the average speed
  const maxSpeed =
    laps
        .filter((lap) => lapIsNotTooFast(lap))
        .reduce((fastestFoundSpeed, curLap) => Math.max(curLap.distance / curLap.moving_time, fastestFoundSpeed), 0);

  for (const lap of laps) {
    lap.average_speed = Math.max(lap.average_speed, maxSlowness);
    if (!lapIsNotTooFast(lap)) {
      // If the lap is impossible, adjust its time so it matches the speed of the fastest reasonable lap

      lap.moving_time = lap.distance / maxSpeed;
      lap.average_speed = maxSpeed;
    }
  }
}

module.exports = {
  arraysAreEqual,
  averageDistanceToCluster,
  distanceBetweenNDPoints,
  computeCentroid,
  standardDeviation,
  metersToMiles,
  metersToMilesRounded,
  milesToMeters,
  isMile,
  isKilometer,
  compareToMile,
  isAutolap,
  winsorizeLapSpeeds,
  lapIsNotTooFast,
};
