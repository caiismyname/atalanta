const {milesToMeters} = require("./parser_helpers.js");

const raceDistances = {
  "halfMarathon": 21097.5,
  "fullMarathon": 42195,
};

function isHalfMarathon(run) {
  const isGreaterThan13 = run.distance >= milesToMeters(13);
  const distanceIsClose = ((Math.abs(run.distance - raceDistances["halfMarathon"]) / raceDistances["halfMarathon"]) <= 0.04);

  return (isGreaterThan13 && distanceIsClose);
}

function isFullMarathon(run) {
  const isGreaterThan26 = run.distance >= milesToMeters(26);
  const distanceIsClose = ((Math.abs(run.distance - raceDistances["fullMarathon"]) / raceDistances["fullMarathon"]) <= 0.03);

  return (isGreaterThan26 && distanceIsClose);
}


function isRace(run) {
  return isHalfMarathon(run) || isFullMarathon(run);
}

function detectRaceType(run) {
  if (isHalfMarathon(run)) {
    return "Half Marathon";
  }

  if (isFullMarathon(run)) {
    return "Marathon";
  }

  return "";
}

module.exports = {
  isRace,
  detectRaceType,
};
