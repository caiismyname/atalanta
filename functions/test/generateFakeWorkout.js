const fs = require("fs");
const Helpers = require("../parser/parser_helpers.js");
const testRuns = require("./test_runs.json");

const name = "4 x 4 mins";
const defaultWorkoutSecondsPerMile = 330;
const defaultRestSecondsPerMile = 480;

// Structure: [(value, "METERS" or "SECONDS", isWorkout), ...]
// const desiredLaps = [
//   [1609.3, "METERS", false],
//   [240, "SECONDS", true],
//   [60, "SECONDS", false],
//   [240, "SECONDS", true],
//   [60, "SECONDS", false],
//   [240, "SECONDS", true],
//   [60, "SECONDS", false],
//   [240, "SECONDS", true],
//   [60, "SECONDS", false],
//   [1609.3, "METERS", false],
// ];

// Saves to the JSON that powers the unit tests
// eslint-disable-next-line no-unused-vars
function generateAndSave({
  laps = [],
  name = "unnamed",
  workoutSecondsPerMile = defaultWorkoutSecondsPerMile,
  restSecondsPerMile = defaultRestSecondsPerMile,
} = {}) {
  const run = generate({
    laps: laps,
    name: name,
    workoutSecondsPerMile: workoutSecondsPerMile,
    restSecondsPerMile: restSecondsPerMile,
  });
  saveToTests(run);
}

// Just clearer naming
function generateAndReturnWorkout({
  laps = [],
  name = "unnamed",
  includeWarmup = true,
  workoutSecondsPerMile = defaultWorkoutSecondsPerMile,
  restSecondsPerMile = defaultRestSecondsPerMile,
  shouldFuzz = true
} = {},
) {
  if (includeWarmup) {
    laps = [[1609, "METERS", false]].concat(laps).concat([[1609, "METERS", false]]);
  }

  return generate({
    laps: laps,
    name: name,
    workoutSecondsPerMile: workoutSecondsPerMile,
    restSecondsPerMile: restSecondsPerMile,
    shouldFuzz: shouldFuzz
  });
}

// Generator
function generate({
  laps: inputLaps = [], // Function call takes the prop as `laps` and renames it `inputLaps` for use in the function
  name = "unamed",
  workoutSecondsPerMile = defaultWorkoutSecondsPerMile,
  restSecondsPerMile = defaultRestSecondsPerMile,
  shouldFuzz = true
} = {}) {
  const laps = [];
  let prevIndex = 0;
  let lapIndex = 1;
  for (const lap of inputLaps) {
    const isWorkout = lap[2];
    const newLap = generateLap({
      value: lap[0],
      unit: lap[1],
      prevIndex: prevIndex,
      lapIndex: lapIndex,
      pace: isWorkout ? workoutSecondsPerMile : restSecondsPerMile,
      shouldFuzz: shouldFuzz
    });
    laps.push(newLap);
    prevIndex = newLap.end_index;
    lapIndex += 1;
  }

  const run = {
    "name": name,
    "distance": laps.reduce((a, b) => a + b.distance, 0),
    "moving_time": laps.reduce((a, b) => a + b.moving_time, 0),
    "elapsed_time": laps.reduce((a, b) => a + b.elapsed_time, 0),
    "id": Math.round(Math.random() * 10000),
    "workout_type": 3, // 3 means workout, anything else is not a workout
    "laps": laps,
  };

  run.average_speed = run.distance / run.moving_time;

  return run;
}

// Helpers

function generateLap({
  value = 1609,
  unit = "METERS",
  prevIndex = -1,
  lapIndex = 1,
  pace = defaultRestSecondsPerMile,
  shouldFuzz = true
} = {}) {
  const lap = {
    "elapsed_time": 0,
    "moving_time": 0,
    "distance": 0,
    "start_index": 0,
    "end_index": 10,
    "total_elevation_gain": getRandomInt(-30, 30),
    "average_speed": 0,
    "max_speed": getRandomInt(1, 9),
    "lap_index": lapIndex,
  };

  if (unit === "METERS") {
    lap.distance = value;
    if (shouldFuzz) {
      // Fuzz the time, not the distance, in order to get pace variation
      lap.moving_time = Math.round(fuzz(Helpers.metersToMiles(lap.distance) * pace));
    } else {
      lap.moving_time = Helpers.metersToMiles(lap.distance) * pace;
    }
    
  } else if (unit === "SECONDS") {
    lap.moving_time = value;
    if (shouldFuzz) {
      // Fuzz the distance, not the time, in order to maintain time precision
      lap.distance = Helpers.milesToMeters(fuzz(lap.moving_time / pace));
    } else {
      lap.distance = Helpers.milesToMeters(lap.moving_time / pace);
    }
  }

  lap.elapsed_time = lap.moving_time;
  lap.start_index = prevIndex + 1;
  lap.end_index = lap.start_index + getRandomInt(0, 100);
  lap.average_speed = lap.distance / lap.moving_time;
  lap.max_speed = Math.max(lap.average_speed, lap.max_speed);

  return lap;
}

function writeToJSON(run, path) {
  const jsonContent = JSON.stringify(run, null, 4);
  fs.writeFile(path, jsonContent, "utf8", (err) => {
    if (err) {
      console.log("An error occured while writing JSON Object to File.");
      return console.log(err);
    }

    console.log(`${path} has been saved.`);
  });
}

function saveToTests(run) {
  testRuns[name] = run;

  writeToJSON(testRuns, `./test_runs.json`);
}

function fuzz(value) {
  const direction = Math.random() > 0.5 ? 1 : -1;

  // const fuzzMax = 0.05;
  // const fuzzMin= 0.02;
  // between 2 — 5% (see min/max above)
  // const fuzzPercentage = (Math.random() * (fuzzMax - fuzzMin)) + fuzzMin;

  const fuzzPercentage = 0.045; // Maybe a constant value at the limit of reasonable variation makes testing easier?
  return Math.round(((fuzzPercentage * direction * value) + value) * 100) / 100;
}

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}

module.exports = {generateAndReturnWorkout};
