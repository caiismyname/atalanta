const fs = require("fs");
const Helpers = require("../parser/parser_helpers.js");
const testRuns = require("./test_runs.json");

const name = "10 x 75sec";
const defaultWorkoutSecondsPerMile = 330;
const defaultRestSecondsPerMile = 480;

// Structure: [(value, "METERS" or "SECONDS", isWorkout), ...]
const desiredLaps = [
  [75, "SECONDS", false],
  [75, "SECONDS", true],
  [75, "SECONDS", false],
  [75, "SECONDS", true],
  [75, "SECONDS", false],
  [75, "SECONDS", true],
  [75, "SECONDS", false],
  [75, "SECONDS", true],
  [75, "SECONDS", false],
  [75, "SECONDS", true],
  [75, "SECONDS", false],
  [75, "SECONDS", true],
  [75, "SECONDS", false],
  [75, "SECONDS", true],
  [75, "SECONDS", false],
  [75, "SECONDS", true],
  [75, "SECONDS", false],
  [75, "SECONDS", true],
  [75, "SECONDS", false],
  [75, "SECONDS", true],
  [75, "SECONDS", false],
];


// [
//   [1609.3, "METERS", false],
//   [800, "METERS", true],
//   [1609.3, "METERS", false],
// ];

//
// Entrypoints
//

// Saves to the JSON that powers the unit tests
// eslint-disable-next-line no-unused-vars
function generateAndSave(laps, name, workoutSecondsPerMile, restSecondsPerMile) {
  const run = generate(laps, name, workoutSecondsPerMile, restSecondsPerMile);
  saveToTests(run);
}

// Just clearer naming
function generateAndReturnWorkout(laps, name = "unnamed", includeWarmup = true, workoutSecondsPerMile = defaultWorkoutSecondsPerMile, restSecondsPerMile = defaultRestSecondsPerMile) {
  if (includeWarmup) {
    const warmupIncludedLaps = [[1609, "METERS", false]].concat(laps).concat([[1609, "METERS", false]]);
    return generate(warmupIncludedLaps, name, workoutSecondsPerMile, restSecondsPerMile);
  }
  return generate(laps, name, workoutSecondsPerMile, restSecondsPerMile);
}

// Generator

function generate(inputLaps, name, workoutSecondsPerMile, restSecondsPerMile) {
  const laps = [];
  let prevIndex = 0;
  let lapIndex = 1;
  for (const lap of inputLaps) {
    const isWorkout = lap[2];
    const newLap = generateLap(lap[0], lap[1], prevIndex, lapIndex, (isWorkout ? workoutSecondsPerMile : restSecondsPerMile));
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

function generateLap(value, unit, prevIndex, lapIndex, pace) {
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
    // Fuzz the time, not the distance, in order to get pace variation
    lap.distance = value;
    lap.moving_time = Math.round(fuzz(Helpers.metersToMiles(lap.distance) * pace));
  } else if (unit === "SECONDS") {
    // Fuzz the distance, not the time, in order to maintain time precision
    lap.moving_time = value;
    lap.distance = Helpers.milesToMeters(fuzz(lap.moving_time / pace));
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

  const fuzzMax = 0.05;
  const fuzzMin= 0.02;
  // between 2 — 5% (see min/max above)
  const fuzzPercentage = (Math.random() * (fuzzMax - fuzzMin)) + fuzzMin;

  // const fuzzPercentage = 0.045; // Maybe a constant value at the limit of reasonable variation makes testing easier?
  return Math.round(((fuzzPercentage * direction * value) + value) * 100) / 100;
}

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}

generateAndSave(desiredLaps, name, defaultWorkoutSecondsPerMile, defaultRestSecondsPerMile);


module.exports = {generateAndReturnWorkout};
