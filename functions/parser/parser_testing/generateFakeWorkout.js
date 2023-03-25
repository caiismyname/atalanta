const fs = require("fs");
const Helpers = require("./parser_helpers.js");

const name = "4x(400, 200) + 5x(mile, 800) all with 400jg [made up]";
const workoutSecondsPerMile = 300;
const restSecondsPerMile = 420;
// let fuzzingPercentage = .1 // Maximum percentage from true pace for fuzzing

// Structure: [(value, "METERS" or "SECONDS", isWorkout), ...]
const desiredLaps = [
  [3424, "METERS", false],
  [400, "METERS", true],
  [400, "METERS", false],
  [200, "METERS", true],
  [400, "METERS", false],
  [400, "METERS", true],
  [400, "METERS", false],
  [200, "METERS", true],
  [400, "METERS", false],
  [400, "METERS", true],
  [400, "METERS", false],
  [200, "METERS", true],
  [400, "METERS", false],
  [400, "METERS", true],
  [400, "METERS", false],
  [200, "METERS", true],
  [400, "METERS", false],
  [4424, "METERS", false],
];


// Generator

function generate() {
  const laps = [];
  let prevIndex = 0;
  let lapIndex = 1;
  for (const lap of desiredLaps) {
    const newLap = generateLap(lap[0], lap[1], lap[2], prevIndex, lapIndex);
    laps.push(newLap);
    prevIndex = newLap.end_index;
    lapIndex += 1;
  }

  const run = {
    "name": name,
    "distance": laps.reduce((a, b) => a + b.distance, 0),
    "moving_time": laps.reduce((a, b) => a + b.moving_time, 0),
    "elapsed_time": laps.reduce((a, b) => a + b.elapsed_time, 0),
    "laps": laps,
  };

  run.average_speed = run.distance / run.moving_time;

  // print(run)

  const jsonContent = JSON.stringify(run);
  fs.writeFile(name + ".json", jsonContent, "utf8", (err) => {
    if (err) {
      console.log("An error occured while writing JSON Object to File.");
      return console.log(err);
    }

    console.log("JSON file has been saved.");
  });
}


function generateLap(value, unit, isWorkout, prevIndex, lapIndex) {
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
    lap.distance = fuzz(value);
    lap.moving_time = Math.round(Helpers.metersToMiles(lap.distance) * (isWorkout ? workoutSecondsPerMile : restSecondsPerMile));
  } else if (unit === "SECONDS") {
    lap.moving_time = Math.round(fuzz(value));
    lap.distance = Helpers.milesToMeter(lap.moving_time / (isWorkout ? workoutSecondsPerMile : restSecondsPerMile));
  }

  lap.elapsed_time = lap.moving_time;
  lap.start_index = prevIndex + 1;
  lap.end_index = lap.start_index + getRandomInt(0, 100);
  lap.average_speed = lap.distance / lap.moving_time;
  lap.max_speed = Math.max(lap.average_speed, lap.max_speed);

  return lap;
}

function fuzz(value) {
  const direction = Math.random() > 0.5 ? 1 : -1;
  return Math.round((((Math.random() / 10) * direction * value) + value) * 100) / 100;
}

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}

generate();
