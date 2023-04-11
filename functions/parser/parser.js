const Helpers = require("./parser_helpers.js");
const workoutExamples = require("./parser_testing/workout_examples.json");
const mixedExamples = require("./parser_testing/mixed_nonworkouts.json");
const example = require("./travis_example.json");

// eslint-disable-next-line no-unused-vars
function runExamples() {
  for (const run of workoutExamples["examples"]) {
    parseWorkout(run);
  }
}

// eslint-disable-next-line no-unused-vars
function gradeWorkoutDetection() {
  const allExamples = mixedExamples["examples"];
  print(allExamples.length);

  const trials = {};
  let wrong = [];

  for (let i = 1.05; i < 1.27; i = i + 0.01) {
    for (let j = 1.05; j < 1.27; j = j + 0.01) {
      wrong = [];
      let correctCount = 0;
      let falsePositive = 0;
      let falseNegative = 0;

      for (const run of allExamples) {
        const result = determineRunIsWorkout(run.laps, i, j);
        const truthIsWorkout = run.workout_type === 3;

        if (result === truthIsWorkout) {
          correctCount += 1;
        } else {
          wrong.push({
            "guess": result,
            "name": run.name,
            "run": run,
          });

          if (result === false) {
            falseNegative += 1;
          } else {
            falsePositive += 1;
          }
        }
      }

      if (correctCount > 162) {
        trials[`${Math.round(i * 100) / 100} ${Math.round(j * 100) / 100}`] = {
          "overall": correctCount,
          "falseNeg": falseNegative,
          "falsePos": falsePositive,
        };
      }
    }
  }

  print(trials);
  for (const run of wrong) {
    print(`Guess: ${run.guess} ID: ${run.run.id}`);
    parseWorkout(run.run, false, true);
    print("\n\n ");
  }
}


// This is the entrypoint
// eslint-disable-next-line no-unused-vars
function parseWorkout(run, htmlMode=false, verbose=true) {
  const runIsWorkout = determineRunIsWorkout(run.laps);

  if (!runIsWorkout) {
    if (verbose) {
      print(`${run.id} NOT WORKOUT`);
    }
    return ({
      "isWorkout": false,
      "summary": "",
    });
  }

  // Remove last lap if it's super short, as this tends to give falsely fast/slow readings

  let laps = run.laps;
  if (run.laps[run.laps.length - 1].distance < Helpers.milesToMeters(.03)) {
    laps = run.laps.slice(0, -1);
  }

  const workoutsIdentifiedLaps = tagWorkoutLaps(laps);
  const mergedLaps = mergeAbutingLaps(workoutsIdentifiedLaps);
  tagWorkoutTypes(mergedLaps); // Mutates in place
  const sets = extractPatterns(mergedLaps.filter((lap) => lap.isWorkout));
  const summary = printSets(sets);

  if (htmlMode) {
    summary.description.replace("\n", "<br>");
  }

  if (verbose) {
    console.log(`PARSING: ${run.name} (${run.id})`);
    print(summary.title);
    print(summary.description);
    print("\n\n");
  }

  return ({
    "isWorkout": true,
    "summary": summary,
  });
}

function determineRunIsWorkout(laps) {
  // Check if laps exist first. They won't exist on manual activities
  if (laps === undefined) {
    return (false);
  }

  // Remove last lap if it's super short, as this tends to give falsely fast/slow readings
  if (laps[laps.length - 1].distance < Helpers.milesToMeters(.03)) {
    laps = laps.slice(0, -1);
  }

  // If any lap's average pace is faster than 6min/mi, it's probably a workout
  // (regardless of the person. No one recovers at < 6min)
  const existsFastLap = laps.reduce((foundFastLap, curLap) => foundFastLap || (curLap.average_speed > Helpers.sixMinMileAsSpeed), false);

  // // If we find a workout-nonworkout-workout sequence, it's probably a workout
  // const workoutStructure = laps.map((lap) => lap.isWorkout);
  // let hasWorkoutRecoveryPattern = false;
  // for (let startIdx = 0; startIdx < laps.length - 3; startIdx++) {
  //   hasWorkoutRecoveryPattern = hasWorkoutRecoveryPattern || patternReducer([true, false, true], workoutStructure.slice(startIdx)).matchCount > 0;
  // }

  // If the average speed of laps, when ordered by speed, has a big jump, it's probably a workout
  // Compare the sorted version of laps (instead of the as-it-happened order) to make the threshold as difficult as possible.
  // i.e. the slowest WO lap still has to be faster than the fastest recovery lap \
  //      and it reduces the delta between the laps on a recovery run if there's just a random fast lap

  const threshMax = 1.21; // Threshold for jump between second fastest and second slowest laps
  const threshSeq = 1.13; // Threshold for jump in sequential laps

  let foundSeqJump = false;
  let foundMaxJump = false;
  const lapsSortedBySpeed = [...laps].sort((a, b) => a.average_speed < b.average_speed ? -1 : 1);

  if (laps.length >= 4) {
    foundMaxJump = lapsSortedBySpeed[lapsSortedBySpeed.length - 2].average_speed / lapsSortedBySpeed[1].average_speed > threshMax;
  }

  let prevLap = lapsSortedBySpeed[0];
  for (const lap of lapsSortedBySpeed) {
    foundSeqJump = foundSeqJump || (lap.average_speed / prevLap.average_speed >= threshSeq);
    prevLap = lap;
  }

  const foundJump = foundSeqJump || foundMaxJump;

  // If there are any non km or non mile laps not including the very last lap, it's a sign it's probably a workout
  const withoutLastLap = laps.slice(0, -1);
  const allLapsAreStandard = withoutLastLap.reduce((allLapsStandard, curLap) => {
    const lapIsMile = Math.abs(1.0 - Helpers.metersToMiles(curLap.distance)) <= 0.02;
    const lapIsKilometer = Math.abs(1000.0 - curLap.distance) <= 32; // same as .02 miles

    return (allLapsStandard && (lapIsMile || lapIsKilometer));
  }, true);

  return (!allLapsAreStandard || foundJump || existsFastLap);
}

// TODO DISCARD SUPER SLOW LAPS AS STANDING REST, SO IT DOESN'T MESS WITH CLASSIFICATION OF NORMAL REST LAPS
function tagWorkoutLaps(laps) {
  // const minSpeed = Math.min(laps.map((lap) => lap.average_speed));
  const isWorkoutAssignments = runKnn(laps.map((lap) => {
    return {"features": [lap.average_speed]};
  }), 2);

  // Figure out which group is workouts
  const aGroup = isWorkoutAssignments.filter((item) => item.knn_temp_assignment === 0);
  const aAverage = aGroup.reduce((x, y) => x + y.features[0], 0) / aGroup.length;
  const bGroup = isWorkoutAssignments.filter((item) => item.knn_temp_assignment === 1);
  const bAverage = bGroup.reduce((x, y) => x + y.features[0], 0) / bGroup.length;

  const workoutClusterIndex = aAverage > bAverage ? 0 : 1;

  for (let idx = 0; idx < isWorkoutAssignments.length; idx++) {
    laps[idx].isWorkout = isWorkoutAssignments[idx].knn_temp_assignment === workoutClusterIndex;
  }

  // console.log(" ")
  // console.log("Workouts: " + laps.filter(lap => lap.isWorkout).map(lap => lap.lap_index))
  // console.log("NonWorkouts: " + laps.filter(lap => !lap.isWorkout).map(lap => lap.lap_index))
  // console.log(" ")

  return (laps);
}

function tagWorkoutTypes(laps) {
  const workouts = laps.filter((lap) => lap.isWorkout);

  // [start] K Means Clustering -based method

  // let workoutKnnInput = workouts.map(lap => {
  //     // return {"features": [lap.moving_time, lap.distance]}
  //     return {"features": [lap.distance]}
  // })
  // let wcssK = [99999] // Fill 0 with garbage so index lines up with k

  // for (let k = 1; k < 6; k++) {
  //     if (workouts.length < k) {
  //         break
  //     }
  //     let assignments = runKnn(workoutKnnInput, k)

  //     // Create an array of K lists containing the laps in each cluster
  //     let clusters = []
  //     for (let clusterIdx = 0; clusterIdx < k; clusterIdx++) {
  //         clusters.push(assignments.filter(lap => lap.knn_temp_assignment === clusterIdx))
  //     }

  //     let wcssPerCluster = clusters.map(cluster => computeWCSS(cluster.map(item => item.features)))
  //     let totalWCSS = wcssPerCluster.reduce((a, b) => a + b, 0)
  //     wcssK.push(totalWCSS)
  // }

  // print(wcssK)
  // [end]

  // [start] Heurstic based method
  if (workouts.length === 0) {
    return workouts;
  }

  const differenceThreshold = 1.2; //TODO Tune this
  const workoutsSortedByDistance = [...workouts].sort((a, b) => a.distance < b.distance ? -1 : 1);
  let workoutTypeCounter = 0;
  let prevWorkoutDistance = workoutsSortedByDistance[0].distance;
  for (const lap of workoutsSortedByDistance) {
    if ((lap.distance / prevWorkoutDistance) >= differenceThreshold) {
      workoutTypeCounter += 1;
    }

    prevWorkoutDistance = lap.distance;
    lap.workoutType = workoutTypeCounter;
  }
  // [end]

  // Tag each workout lap with its basis
  for (let workoutType = 0; workoutType <= workoutTypeCounter; workoutType++) {
    const correspondingLaps = laps.filter((lap) => lap.workoutType === workoutType);

    // [start] Standard Deviation based basis determination
    // let basis = computeBasis(correspondingLaps)
    // for (lap of correspondingLaps) {
    //     lap.workoutBasis = basis
    // }
    // [end]

    // [start] Closest known distance/time basis determination
    for (const lap of correspondingLaps) {
      assignNearestDistance(lap);
      assignNearestTime(lap);
    }

    const distanceDifferenceAverage = correspondingLaps.reduce((a, b) => a + b.closestDistanceDifference, 0) / correspondingLaps.length;
    const timeDifferenceAverage = correspondingLaps.reduce((a, b) => a + b.closestTimeDifference, 0) / correspondingLaps.length;

    for (const lap of correspondingLaps) {
      lap.workoutBasis = (distanceDifferenceAverage <= timeDifferenceAverage ? "DISTANCE" : "TIME");
    }
    // [end]
  }

  return laps;
}

// Expects an object with one property, `features`, that is an array of all features to be evaluated.
// Returns the inputs array (same order) with the cluster assignments added as property `knn_temp_assignment`
function runKnn(inputs, k) {
  // Initialize uniformly into clusters
  for (let idx = 0; idx < inputs.length; idx++) {
    inputs[idx].knn_temp_assignment = idx % k;
  }

  let isStable = false;

  do {
    const previousAssignments = [...inputs];

    for (const item of inputs) {
      const distances = []; // Distance to each cluster
      for (let clusterIdx = 0; clusterIdx < k; clusterIdx++ ) {
        distances.push(
            Helpers.averageDistanceToCluster(
                item.features,
                previousAssignments
                    .filter((item) => item.knn_temp_assignment === clusterIdx)
                    .map((item) => item.features),
            ),
        );
      }

      // Reassign
      const clusterAssignment = distances.indexOf(Math.min(...distances));
      item.knn_temp_assignment = clusterAssignment;
    }

    // Compare prev vs. new assignments
    const newAssignments = [...inputs];
    isStable = Helpers.arraysAreEqual(previousAssignments, newAssignments);

    // console.log(previousAssignments, newAssignments)
  } while (!isStable);

  return inputs;
}

function mergeAbutingLaps(laps) {
  const mergedLaps = [];

  let prevLap = laps[0];
  for (let lapIdx = 1; lapIdx < laps.length; lapIdx++ ) {
    // If two consequtive laps are the same type (workout vs. nonworkout), merge them
    if (prevLap.isWorkout === laps[lapIdx].isWorkout) {
      prevLap = mergeLaps(prevLap, laps[lapIdx]);
    } else { // If not the same type, add the previous lap to the result array
      mergedLaps.push(prevLap);
      prevLap = laps[lapIdx];
    }
  }

  // Include the last lap
  mergedLaps.push(prevLap);

  return mergedLaps;
}

// Combines the 'addition' lap into the base lap, preserves all component laps in a property called `component_laps`
function mergeLaps(base, addition) {
  const combinedElapsedTime = base.elapsed_time + addition.elapsed_time;
  const combinedMovingTime = base.moving_time + addition.moving_time;
  const combinedDistance = base.distance + addition.distance;
  const combinedEndIndex = Math.max(base.end_index, addition.end_index);
  const combinedTotalElevationGain = base.total_elevation_gain + addition.total_elevation_gain;
  const combinedAverageSpeed = (base.distance + addition.distance) / (combinedMovingTime);
  const combinedMaxSpeed = Math.max(base.max_speed, addition.max_speed);

  if ("component_laps" in base) {
    base.component_laps.push(addition);
  } else {
    base.component_laps = [base, addition];
  }

  base.elapsed_time = combinedElapsedTime;
  base.moving_time = combinedMovingTime;
  base.distance = combinedDistance;
  base.end_index = combinedEndIndex;
  base.total_elevation_gain = combinedTotalElevationGain;
  base.average_speed = combinedAverageSpeed;
  base.max_speed = combinedMaxSpeed;

  return base;
}

// Mutates the lap, stores the best guess distance, its difference, and the unit of the distance
function assignNearestDistance(lap) {
  // In meters
  const validDistancesMeters = [
    100,
    200,
    300,
    400,
    500,
    600,
    800,
    1000,
    1200,
    1500,
    // 1600,
    2000,
    3000,
    5000,
    10000,
  ];

  const validDistanceMiles = [
    1609.3, // 1 mile
    3218.7, // 2 miles
    4828, // 3 miles
    6437.4, // 4 miles
    8046.7, // 5 miles
    9654, // 6 miles
    11265.4, // 7 miles
    12874.8, // 8 miles
    14484.1, // 9 miles
    16090, // 10 miles
    17702.8, // 11 miles
    19312.1, // 12 miles
    20921.5, // 13 miles
    22530.8, // 14 miles
    24140.2, // 15 miles
    25749.5, // 16 miles
    27358.8, // 17 miles
    28968.2, // 18 miles
    30577.5, // 19 miles
    32186.9, // 20 miles
  ];

  // eslint-disable-next-line no-unused-vars
  const validDistanceMarathons = [
    21097.5, // half marathon
    42195, // marathon
  ];

  const lapDist = lap.distance;
  lap.closestDistance = 0;
  lap.closestDistanceDifference = 1;

  for (const guess of validDistancesMeters) {
    const difference = Math.abs(lapDist - guess) / guess;
    if (difference < lap.closestDistanceDifference) {
      assignDistanceGuess(lap, guess, difference, "m");
    }
  }

  for (const guess of validDistanceMiles) {
    const difference = Math.abs(lapDist - guess) / guess;
    if (difference < lap.closestDistanceDifference) {
      assignDistanceGuess(lap, Helpers.metersToMilesRounded(guess), difference, "mi");
    }
  }
}

function assignDistanceGuess(lap, distance, difference, unit) {
  lap.closestDistance = distance;
  // You don't pluralize the abbreviations for distance units (but you do for the full word)
  lap.closestDistanceUnit = unit //+ (distance > 1 ? "s" : "");
  lap.closestDistanceDifference = difference;
}

function assignNearestTime(lap) {
  // In seconds
  const validTimesSeconds = [
    15,
    20,
    30,
    45,
  ];

  const validTimesMinutes = [
    60,
    90,
    120, // 2
    150,
    180, // 3
    210,
    240, // 4
    270,
    300, // 5
    // 330,
    // 360, // 6
    // 390,
    // 420, // 7
    // 450,
    // 480, // 8
    // 510,
    // 540, // 9
    // 570,
    600, // 10
    // 660, // 11
    720, // 12
    // 780, // 13
    // 840, // 14
    900, // 15
    // 960, // 16
    // 1020, // 17
    // 1080, // 18
    // 1140, // 19
    1200, // 20
    1500, // 25
    1800, // 30
  ];

  const lapTime = lap.moving_time;
  lap.closestTime = 0;
  lap.closestTimeDifference = 1;

  for (const time of validTimesSeconds) {
    const difference = Math.abs(time - lapTime) / time;
    if (difference < lap.closestTimeDifference) {
      assignTimeGuess(lap, time, difference, "sec");
    }
  }

  for (const time of validTimesMinutes) {
    const difference = Math.abs(time - lapTime) / time;
    if (difference < lap.closestTimeDifference) {
      assignTimeGuess(lap, Helpers.secondsToMinutes(time), difference, "min");
    }
  }
}

function assignTimeGuess(lap, time, difference, unit) {
  lap.closestTime = time;
  lap.closestTimeUnit = unit + (time > 1 ? "s" : "");
  lap.closestTimeDifference = difference;
}

function patternReducer(pattern, list) {
  let patternIdx = 0;
  let listIdx = 0;
  let isMatching = pattern[0] === list[0];
  let matchesFound = 0;

  while (isMatching && listIdx < list.length) {
    if (pattern[patternIdx] === list[listIdx]) {
      listIdx += 1;
      patternIdx = (patternIdx + 1 ) % pattern.length;

      if (patternIdx === 0) {
        matchesFound += 1;
      }
    } else {
      isMatching = false;
    }
  }

  return {
    "matchCount": matchesFound,
    "unmatchedRemainder": list.slice(listIdx),
  };
}

function extractPatterns(laps) {
  let i = 0;
  const patterns = [];
  let patternLength = 1;

  while (i < laps.length) {
    const patternGuess = laps.slice(i, i + patternLength).map((lap) => lap.workoutType);
    const attemptedReduction = patternReducer(patternGuess, laps.slice(i + patternLength).map((lap) => lap.workoutType)); // start at `+ patternLength` to avoid matching the initial pattern

    if (attemptedReduction.matchCount > 0) {
      patterns.push({
        "pattern": patternGuess,
        "count": attemptedReduction.matchCount + 1, // + 1 to include the initial pattern
        "laps": laps.slice(i, i + (patternLength * (attemptedReduction.matchCount + 1))),
      });

      i += patternLength * (attemptedReduction.matchCount + 1); // + 1 to include the initial pattern
      patternLength = 1;
    } else {
      // Keep increasing the pattern length to try longer patterns
      if (patternLength < laps.length - i) {
        patternLength = patternLength + 1;
      } else {
        // If no pattern starting here is found, add as a single element and move on
        patterns.push({
          "pattern": [laps[i].workoutType],
          "count": 1,
          "laps": [laps[i]],
        });

        i += 1;
        patternLength = 1;
      }
    }
  }

  return patterns;
  // console.log("-------- " + laps)
  // console.log(patterns)
  // console.log(" ")
}

function determineSetName(set, multiRepSetsShouldHaveParen = false) {
  let setName = "";

  // List out each component of the set
  for (const workoutType of set.pattern) {
    const lap = set.laps.filter((lap) => lap.workoutType === workoutType)[0];
    const lapName = lap.workoutBasis === "DISTANCE" ?
      `${lap.closestDistance}${lap.closestDistanceUnit}` :
      `${lap.closestTime} ${lap.closestTimeUnit}`;

    setName += `${lapName}, `;
  }

  setName = setName.slice(0, -2); // slice to remove ending ", "

  // Add parenthesis if more than one component to the set (e.g. "(400m, 200m)")
  if (set.pattern.length > 1) {
    setName = `(${setName})`;
  }

  // Add reps if more than one rep
  if (set.count > 1) {
    setName = `${set.count} x ${setName}`;
    if (multiRepSetsShouldHaveParen) {
      setName = `(${setName})`
    }
  }

  return setName;
}

// function determineSetAverages(set) {
//   const setAverages = "";

//   for (const workoutType of set.pattern) {
//     const laps = set.laps.filter((lap) => lap.workoutType === workoutType);
//   }

//   setDescription += Helpers.indented((set.laps.length === 1 ? "" : "Avg. " ) + "Pace: " + Helpers.averagePaceOfSet(set) + "/mi");

//   if (set.laps[0].workoutBasis === "DISTANCE") {
//     setDescription += Helpers.indented((set.laps.length === 1 ? "" : "Avg. " ) + "Time: " + Helpers.averageTimeOfSetFormatted(set));
//   } else if (set.laps[0].workoutBasis === "TIME") {
//     setDescription += Helpers.indented((set.laps.length === 1 ? "" : "Avg. " ) + "Dist: " + Helpers.averageDistanceOfSetFormatted(set));
//   }
// }

const defaultPrintConfig = {
  "paceUnits": "MILE", // KM
  "shortDistanceAverageUnit": "TIME", // "PACE", "NONE"

};

function printSets(sets, printConfig=defaultPrintConfig) {
  let overallTitle = ""; // For the strava activity title, only contains the structure
  let description = ""; // Contains details, for the activity description

  for (const set of sets) {
    let setDescription = "";

    // Set name
    const setName = determineSetName(set, sets.length > 1);
    overallTitle += `${setName} + `;
    setDescription += `${setName} — `; // Don't add newline so average can go on the same line as the set title


    /* Set average

    If each rep is >=1mi, show average per-mile pace
    If each rep is <1mi, show the average time unless config overrides (`shortDistanceAverageUnit`, options: "PACE", "TIME")
      Unless the basis is time, in which show average per-mile pace. I don't know that anyone really gauges time-based interval performance off distance...

    */

    const tokenLap = set.laps[0];

    if (tokenLap.distance >= Helpers.milesToMeters(1.0) || tokenLap.workoutBasis === "TIME") {
      // Average per-mile pace
      setDescription += `Avg: ${Helpers.averagePaceOfSet(set)}/mi`;
    } else {
      switch (printConfig.shortDistanceAverageUnit) {
        case "TIME":
          setDescription += `Avg: ${Helpers.averageTimeOfSetFormatted(set)}`;
          break;
        case "PACE":
          setDescription += `Avg: ${Helpers.averagePaceOfSet(set)}/mi`;
          break;
        case "NONE":
          break;
        default:
          break;
      }
    }

    setDescription += "\n";

    // Individual laps
    if (set.laps.length > 1) {



      // Lap > 1mi: mile/km pace, depending on config
      // Lap < 1mi: time if basis DISTANCE, pace if basis TIME
      let setDetails = "";
      let lapDetails = "";

      let lapCounter = 0;
      for (const lap of set.laps) {
        if (tokenLap.closestDistanceUnit === "mile") {
          lapDetails += `${Helpers.pacePerMileFormatted(lap)}, `;
        } else {
          if (tokenLap.workoutBasis === "DISTANCE") {
            lapDetails += `${Helpers.secondsToTimeFormatted(lap.moving_time)}, `;
          } else if (tokenLap.workoutBasis === "TIME") {
            lapDetails += `${Helpers.pacePerMileFormatted(lap)}/mi, `;
          }
        }

        // If each rep consists of more than one component (e.g. 3 x 1,2,3,2,1), then list each rep on its own line
        
        // Every time we hit the end of a rep...
        if (set.pattern.length > 1 && (lapCounter % set.pattern.length) === set.pattern.length - 1) {
          // Prefix an indent and the rep number
          setDetails += `\t${Math.ceil(lapCounter / set.pattern.length)}. ${lapDetails.slice(0, -2)}\n`;  // slice to remove ending ", "
          lapDetails = "";
        } else if (set.pattern.length === 1 && lapCounter === set.count - 1) {
          setDetails = lapDetails.slice(0, -2);
        }

        lapCounter++;
      }

      setDescription += `⏱️ ${setDetails}`;
    } else if (set.laps.length === 1 && Helpers.metersToMiles(set.laps[0].distance) > 1) {
      // List the splits
      const tokenLap = set.laps[0];
      if ("component_laps" in tokenLap) {
        let splits = "";

        for (const lap of tokenLap.component_laps) {
          if (Helpers.metersToMiles(lap.distance) >= .5) {
            splits += `${Helpers.pacePerMileFormatted(lap)}/mi, `;
          }
        }

        setDescription += `⏱️ ${splits.slice(0, -2)}`;
      }
    }

    description += `${setDescription}\n`;
  }

  description += `\nWorkout summary generated by stravaworkout.com`;
  overallTitle = overallTitle.slice(0, -3);

  return {
    "title": overallTitle,
    "description": description,
  };
}

function print(x) {
  console.log(x);
}


runExamples();
// gradeWorkoutDetection();

parseWorkout(example, false, true);

module.exports = {parseWorkout};
