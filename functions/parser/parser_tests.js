const {parseWorkout, determineRunIsWorkout} = require("./parser.js");
const fs = require("fs");

const workoutFormatTests = require("./parser_testing_examples/workout_format_examples.json");
const workoutFormatGroundTruth = require("./parser_testing_examples/workout_format_ground_truth.json");
const workoutDetectionFalsePositive = require("./parser_testing_examples/workout_detection_false_positive.json");
const workoutDetectionFalseNegative = require("./parser_testing_examples/workout_detection_false_negative.json");
// const mixedExamples = require("./parser_testing_examples/mixed_nonworkouts.json");

// eslint-disable-next-line no-unused-vars

function runFormatTests(verbose=false) {
  let correctCount = 0;
  const wrongExamples = [];
  const falseNegatives = [];

  print(`\nTesting Workout Formats`);

  for (const run of workoutFormatTests["examples"]) {
    // FOCUS: track lap miles and removing the extra dingus
    // if (![347652898].includes(run.id)) {
    //   continue;
    // }

    // Run it through workout detection just in case. It'd be a real bad false neg if it fails here
    if (!determineRunIsWorkout(run.laps)) {
      falseNegatives.push(run);
      continue;
    }

    // NOTE because we might be reparsing the same run, we create a copy using json parse/stringify because running parseWorkout on the same run object is not idempotent
    const testRes = parseWorkout({
      run: JSON.parse(JSON.stringify(run)),
      verbose: verbose,
      returnSets: true,
    });

    // const testRes = parseWorkout(JSON.parse(JSON.stringify(run)), verbose, true)
    let groundTruthSets;

    if (run.id in workoutFormatGroundTruth) {
      groundTruthSets = workoutFormatGroundTruth[run.id];
    } else {
      print(`================================`);
      print(`${run.id} DOES NOT HAVE GROUND TRUTH`);
      parseWorkout({
        run: JSON.parse(JSON.stringify(run)),
        verbose: true,
        returnSets: false,
      });
      print(`================================`);
      continue;
    }

    if (JSON.stringify(testRes.sets) === JSON.stringify(groundTruthSets)) {
      correctCount += 1;
    } else {
      wrongExamples.push(run);
    }
  }

  for (const run of wrongExamples) {
    print(`================================`);
    parseWorkout({
      run: JSON.parse(JSON.stringify(run)),
      verbose: true,
      returnSets: false,
    });
    print(`================================`);
  }

  print(`Parsed ${correctCount} / ${workoutFormatTests["examples"].length} correctly.`);
  if (falseNegatives.length > 0) {
    print(`\tFalse negatives:`);
    for (const run of falseNegatives) {
      print(`\t\t${run.id}`);
    }
  }
}

// eslint-disable-next-line no-unused-vars
function runDetectionTests() {
  let falsePositive = 0;
  let falseNegative = 0;
  const falsePositiveExamples = [];
  const falseNegativeExamples = [];

  const allExamples = workoutDetectionFalseNegative["examples"].concat(workoutDetectionFalsePositive["examples"]);

  // const allExamples = mixedExamples["examples"];

  for (const run of allExamples) {
    print(run.name);
    const testIsWorkout = determineRunIsWorkout(run.laps, true);
    const truthIsWorkout = run.workout_type === 3;

    if (testIsWorkout !== truthIsWorkout) {
      if (truthIsWorkout === true) { // Supposed to be workout, detection said not
        falseNegative += 1;
        falseNegativeExamples.push(run);
      } else {
        falsePositive +=1;
        falsePositiveExamples.push(run);
      }
    }
  }

  print(`\nTesting Detection`);

  if (falseNegative > 0) {
    print(`\tFalse Negatives:`);
    for (const run of falseNegativeExamples) {
      print(`\t\t${run.id} | ${run.name}`);
    }
  }

  if (falsePositive > 0) {
    print(`\tFalse Positives:`);
    for (const run of falsePositiveExamples) {
      print(`\t\t${run.id} | ${run.name}`);
    }
  }

  print("\n");

  print(`\tFalse Negatives: ${workoutDetectionFalseNegative["examples"].length - falseNegative} / ${workoutDetectionFalseNegative["examples"].length} correct`);
  print(`\tFalse Positives: ${workoutDetectionFalsePositive["examples"].length - falsePositive} / ${workoutDetectionFalsePositive["examples"].length} correct`);
  print("\n");
}

// eslint-disable-next-line no-unused-vars
function generateFormatGroundTruth() {
  const groundTruth = {};
  for (const run of workoutFormatTests["examples"]) {
    const res = parseWorkout({
      run: run,
      verbose: false,
      returnSets: true,
      forceParse: true,
    });
    groundTruth[run.id] = res.sets;
  }

  saveJSON(groundTruth, "workout_format_ground_truth.json");
}

function print(input) {
  console.log(input);
}

// eslint-disable-next-line no-unused-vars
function saveJSON(content, fileName="output.json") {
  const jsonContent = JSON.stringify(content, null, 4);
  fs.writeFile(fileName, jsonContent, "utf8", (err) => {
    if (err) {
      console.log("An error occured while writing JSON Object to file.");
      return console.log(err);
    }

    console.log(`JSON file ${fileName} has been saved.`);
  });
}


// runDetectionTests();
runFormatTests(true);

// generateFormatGroundTruth()

