function isLapReasonable(inputLap) {
  const lapMargin = 0.15; // b/c GPS distances aren't that accurate
  const reasonablenessThreshold = 0.08; // Threshold as a percentage of WR that we consider a speed "reasonable"

  let closestDistance = Number.MAX_VALUE;
  let closestTime = Number.MAX_VALUE;

  for (const record of worldRecords) {
    if ((record.distance * (1 + lapMargin)) <= inputLap.distance) {
      const distanceDifference = inputLap.distance - record.distance;

      if (distanceDifference < closestDistance) {
        closestDistance = distanceDifference;
        closestTime = record.time;
      }
    }
  }

  if (closestTime === Number.MAX_VALUE) {
    // No record found within the given distance.
    return true;
  }

  return inputLap.moving_time > reasonablenessThreshold;
}

const worldRecords = {
  "mens": [
    {
      "distance": 100,
      "time": 9.58,
    },
    {
      "distance": 200,
      "time": 19.19,
    },
    {
      "distance": 400,
      "time": 43.03,
    },
    {
      "distance": 800,
      "time": 100.91,
    },
    {
      "distance": 1000,
      "time": 131.96,
    },
    {
      "distance": 1500,
      "time": 226.0,
    },
    {
      "distance": 1609.34,
      "time": 223.13,
    },
    {
      "distance": 2000,
      "time": 283.13,
    },
    {
      "distance": 3000,
      "time": 440.67,
    },
    {
      "distance": 5000,
      "time": 755.36,
    },
    {
      "distance": 10000,
      "time": 1571,
    },
    {
      "distance": 21.0975,
      "time": 3451,
    },
    {
      "distance": 42.195,
      "time": 7235,
    },
  ],
};

module.exports = {
  isLapReasonable,
};
