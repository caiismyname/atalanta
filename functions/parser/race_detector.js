const {milesToMeters} = require("./parser_helpers.js");
const rawKnownRaces = require("./known_races.json");

const knownRaces = JSON.parse(JSON.stringify(rawKnownRaces));
const raceDistances = {
  "halfMarathon": 21097.5,
  "fullMarathon": 42195,
  "tenMiler": 16093.4,
};

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180; // Convert degrees to radians
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in kilometers
  return distance;
}

function withinHalfMile(a, b) {
  const distance = calculateDistance(a[0], a[1], b[0], b[1]);
  const miles = distance * 0.621371; // Convert kilometers to miles
  return miles <= 0.5;
}

function runMatchesRace(run, race) {
  const startIsClose = withinHalfMile(run.start_latlng, race.start_latlng);
  const endIsClose = withinHalfMile(run.end_latlng, race.end_latlng);

  return startIsClose && endIsClose;
}

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

function isTenMiler(run) {
  const distanceIsClose = ((Math.abs(run.distance - raceDistances["tenMiler"]) / raceDistances["tenMiler"]) <= 0.05);
  const matchesKnownRace = matchKnownRace(run) !== "";

  return distanceIsClose && matchesKnownRace;
}

function matchKnownRace(run) {
  if (!("start_latlng" in run) || !("end_latlng" in run)) {
    return "";
  }

  for (const race of knownRaces) {
    if (runMatchesRace(run, race)) {
      return race.name;
    }
  }
  return "";
}

function isRace(run) {
  return isHalfMarathon(run) || isFullMarathon(run) || isTenMiler(run);
}

function detectRaceType(run) {
  if (isHalfMarathon(run)) {
    return "Half Marathon";
  }

  if (isFullMarathon(run)) {
    return "Marathon";
  }

  if (isTenMiler(run)) {
    return "Ten Miler";
  }

  return "";
}

module.exports = {
  isRace,
  detectRaceType,
  matchKnownRace,
};
