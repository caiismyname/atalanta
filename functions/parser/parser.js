// import * as Helpers from './parser_helpers.js'
// import examples from './parser_testing/examples.json' assert {type: 'json'}

const Helpers = require("./parser_helpers.js");
const examples = require("./parser_testing/examples.json");

function runExamples() {
  for (const run of examples["examples"]) {
    const workoutsIdentifiedLaps = tagIsWorkout(run.laps);
    const mergedLaps = mergeAbutingLaps(workoutsIdentifiedLaps);
    tagWorkoutTypes(mergedLaps); // Mutates in place
    const sets = extractPatterns(mergedLaps.filter((lap) => lap.isWorkout));


    console.log("---------------- " + run.name);
    // for (set of sets) {
    //     if (set.laps[0].length === 0) {
    //         print(set)
    //     }
    // }


    print(printSets(sets));
    // for (let lap of mergedLaps) {
    //     console.log(lap.lap_index + " " + lap.distance + " " + lap.moving_time);

    //     if (lap.isWorkout) {
    //         if (lap.workoutBasis === "DISTANCE") {
    //             console.log( "              " +
    //                 (lap.isWorkout ? lap.closestDistance + " " + lap.closestDistanceUnit + " " : "")
    //             )
    //         } else {
    //              console.log(
    //                 "              " +
    //                 (lap.isWorkout ? lap.closestTime + " " + lap.closestTimeUnit + " " : "")
    //             );
    //         }
    //     }

    // (lap.isWorkout ? " W" : " ") +
    // (lap.isWorkout ? " " + lap.workoutType + " ": " ") +
    // (lap.isWorkout ? " " + lap.workoutBasis : "")


    // console.log( "              " +
    //     (lap.isWorkout ? lap.closestDistance + " " + lap.closestDistanceUnit + " " : "") +
    //     (lap.isWorkout ? lap.closestDistanceDifference + " " : "" )
    // )
    // console.log(
    //     "              " +
    //     (lap.isWorkout ? lap.closestTime + " " + lap.closestTimeUnit + " " : "") +
    //     (lap.isWorkout ? lap.closestTimeDifference + " " : "" )
    // );
    // }
    print(" ");
  }
}

// eslint-disable-next-line no-unused-vars
function parseWorkout(run, htmlMode=false) {
  const workoutsIdentifiedLaps = tagIsWorkout(run.laps);
  const mergedLaps = mergeAbutingLaps(workoutsIdentifiedLaps);
  tagWorkoutTypes(mergedLaps); // Mutates in place
  const sets = extractPatterns(mergedLaps.filter((lap) => lap.isWorkout));
  const output = printSets(sets);

  if (htmlMode) {
    output.replace("\n", "|  ");
  }

  console.log("---------------- " + run.name);
  print(output);
  print(" ");

  return (output);
}

// TODO DISCARD SUPER SLOW LAPS AS STANDING REST, SO IT DOESN'T MESS WITH CLASSIFICATION OF NORMAL REST LAPS
function tagIsWorkout(laps) {
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

  const workoutsSortedByDistance = [...workouts].sort((a, b) => a.distance < b.distance ? -1 : 1);
  let workoutTypeCounter = 0;
  let prevWorkoutDistance = workoutsSortedByDistance[0].distance;
  for (const lap of workoutsSortedByDistance) {
    if ((lap.distance / prevWorkoutDistance) > 1.5) {
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
    1609, // 1 mile
    3218.7, // 2 miles
    4828, // 3 miles
    6437.4, // 4 miles
    8046.7, // 5 miles
    16090, // 10 miles
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
      assignDistanceGuess(lap, guess, difference, "meter");
    }
  }

  for (const guess of validDistanceMiles) {
    const difference = Math.abs(lapDist - guess) / guess;
    if (difference < lap.closestDistanceDifference) {
      assignDistanceGuess(lap, Helpers.metersToMilesRounded(guess), difference, "mile");
    }
  }
}

function assignDistanceGuess(lap, distance, difference, unit) {
  lap.closestDistance = distance;
  lap.closestDistanceUnit = unit + (distance > 1 ? "s" : "");
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
    450,
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
      assignTimeGuess(lap, time, difference, "second");
    }
  }

  for (const time of validTimesMinutes) {
    const difference = Math.abs(time - lapTime) / time;
    if (difference < lap.closestTimeDifference) {
      assignTimeGuess(lap, Helpers.secondsToMinutes(time), difference, "minute");
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

function printSets(sets) {
  let output = "";
  for (const set of sets) {
    // Set name
    const tokenLap = set.laps[0];
    let setDescription = "";

    const lapName = tokenLap.workoutBasis === "DISTANCE" ?
            tokenLap.closestDistance + " " + tokenLap.closestDistanceUnit :
            tokenLap.closestTime + " " + tokenLap.closestTimeUnit;

    if (set.count === 1) {
      setDescription += lapName;
    } else {
      setDescription += set.count + " x " + lapName;
    }

    setDescription += "\n";
    setDescription += Helpers.indented((set.laps.length === 1 ? "" : "Avg. " ) + "Pace: " + Helpers.averagePaceOfSet(set) + "/mi");

    if (set.laps[0].workoutBasis === "DISTANCE") {
      setDescription += Helpers.indented((set.laps.length === 1 ? "" : "Avg. " ) + "Time: " + Helpers.averageTimeOfSetFormatted(set));
    } else if (set.laps[0].workoutBasis === "TIME") {
      setDescription += Helpers.indented((set.laps.length === 1 ? "" : "Avg. " ) + "Dist: " + Helpers.averageDistanceOfSetFormatted(set));
    }
    output += setDescription;

    if (set.laps.length > 1) {
      // List the individual laps
      // Lap > 1mi: mile pace
      // Lap < 1mi: time if basis DISTANCE, distance if basis TIME

      let lapDetails = "";

      if (tokenLap.closestDistanceUnit === "mile") {
        for (const lap of set.laps) {
          lapDetails += Helpers.pacePerMileFormatted(lap) + "/mi, ";
        }
      } else {
        if (tokenLap.workoutBasis === "DISTANCE") {
          for (const lap of set.laps) {
            lapDetails += Helpers.secondsToTimeFormatted(lap.moving_time) + ", ";
          }
        } else if (tokenLap.workoutBasis === "TIME") {
          for (const lap of set.laps) {
            lapDetails += (Math.round(lap.distance )) + "m, ";
          }
        }
      }

      output += Helpers.indented("Laps: " + lapDetails.slice(0, -2)); // slice to remove ending ", "
    } else if (set.laps.length === 1 && Helpers.metersToMiles(set.laps[0].distance) > 1) {
      // List the splits
      const tokenLap = set.laps[0];
      if ("component_laps" in tokenLap) {
        let splits = "";

        for (const lap of tokenLap.component_laps) {
          if (Helpers.metersToMiles(lap.distance) >= .5) {
            splits += Helpers.pacePerMileFormatted(lap) + "/mi, ";
          }
        }

        output += Helpers.indented("Splits: " + splits.slice(0, -2));
      }
    }

    output += "\n";
  }

  return output;
}

function print(x) {
  console.log(x);
}


runExamples();

module.exports = {parseWorkout};
