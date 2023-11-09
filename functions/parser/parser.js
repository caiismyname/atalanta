const Helpers = require("./parser_helpers.js");
const {Formatter} = require("./formatter.js");
const {defaultParserConfig, defaultFormatConfig} = require("./defaultConfigs.js");

// This is the entrypoint
// eslint-disable-next-line no-unused-vars
function parseWorkout({run, config={parser: defaultParserConfig, format: defaultFormatConfig}, verbose=false, returnSets=false, forceParse=false}) {
  const runIsWorkout = determineRunIsWorkout(run.laps, verbose) || forceParse;

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
  let laps = JSON.parse(JSON.stringify(run.laps));
  if (run.laps[run.laps.length - 1].distance < Helpers.milesToMeters(.03)) {
    laps = run.laps.slice(0, -1);
  }

  const workoutsIdentifiedLaps = tagWorkoutLaps(laps);
  const mergedLaps = mergeAbuttingLaps(workoutsIdentifiedLaps);
  const typeTaggedLaps = tagWorkoutTypes(mergedLaps);
  const valueAssignedLaps = tagWorkoutBasisAndValue(typeTaggedLaps, config.parser, verbose);
  const basisHomogeneityCheckedValueAssignedLaps = checkBasisHomogeneity(valueAssignedLaps, config.parser);
  const sets = extractPatterns(basisHomogeneityCheckedValueAssignedLaps.filter((lap) => lap.isWorkout));

  const formatter = new Formatter(config.format);
  const summary = formatter.printSets(sets);

  if (verbose) {
    console.log(`PARSING: ${run.name} (${run.id})`);
    print(summary.title);
    print(summary.description);
    print("\n\n");
  }

  const output = {
    "isWorkout": true,
    "summary": summary,
  };

  if (returnSets) {
    output.sets = sets;
  }

  return (output);
}

function determineRunIsWorkout(laps, debug=false) {
  // 1. Check if laps exist first. They won't exist on manual activities
  if (laps === undefined) {
    return (false);
  }

  // 2. Remove last lap because:
  //   - If there are strides, they are commonly at the end, and it'll read as a fast lap even though there's no lap data
  //   - Even if a workout has a workout lap as its last lap (unlikely), this will only be a problem if there's exactly one workout lap (and it's at the end)

  // First, slice off any super-short remnants
  if (laps[laps.length - 1].distance <= Helpers.milesToMeters(.05)) {
    laps = laps.slice(0, -1);
  }

  // Then slice off the last "real" lap
  if (laps.length > 3) {
    laps = laps.slice(0, -1);
  }

  winsorizeLapSpeeds(laps);

  // 3. If any lap's average pace is faster than 6min/mi, it's probably a workout
  // (regardless of the person. No one recovers at < 6min)
  const existsFastLap = laps.reduce((foundFastLap, curLap) => foundFastLap || (curLap.average_speed > Helpers.sixMinMileAsSpeed), false);

  // 4. If we find a jump in speed between the laps
  // If the average speed of laps, when ordered by speed, has a big jump, it's probably a workout
  // Compare the sorted version of laps (instead of the as-it-happened order) to make the threshold as difficult as possible.
  // i.e. the slowest WO lap still has to be faster than the fastest recovery lap \
  //      and it reduces the delta between the laps on a recovery run if there's just a random fast lap

  const threshMax = 1.21; // Threshold for jump between fastest and slowest laps
  const threshSeq = 1.13; // Threshold for jump in sequential laps

  let foundSeqJump = false;
  let foundMaxJump = false;
  const lapsSortedBySpeed = [...laps].sort((a, b) => a.average_speed < b.average_speed ? -1 : 1);

  // Check the global diff if there are enough laps
  if (laps.length >= 4) {
    foundMaxJump = lapsSortedBySpeed[lapsSortedBySpeed.length - 1].average_speed / lapsSortedBySpeed[0].average_speed >= threshMax;

    if (debug) {
      console.log(`Global diff: ${lapsSortedBySpeed[lapsSortedBySpeed.length - 1].average_speed / lapsSortedBySpeed[0].average_speed}`);
    }
  }

  // Look for a sequential jump
  let prevLap = lapsSortedBySpeed[0];
  for (let lapIdx = 0; lapIdx < lapsSortedBySpeed.length; lapIdx++ ) {
    const lap = lapsSortedBySpeed[lapIdx];
    const thisComparisonHasJump = lap.average_speed / prevLap.average_speed >= threshSeq;
    foundSeqJump = foundSeqJump || thisComparisonHasJump;

    if (debug) {
      console.log(`Sequntial ${lapIdx}: ${lap.average_speed / prevLap.average_speed}`);
      if (thisComparisonHasJump) {
        console.log(`Sequential jump found between ${lapIdx - 1} and ${lapIdx} of ${lap.average_speed / prevLap.average_speed}`);
      }
    }

    // // Don't count a jump if the only jump in the run is to the very last lap, and the lap is less than a km.
    // // This is a proxy for strides.
    // if (thisComparisonHasJump && !foundSeqJump) {
    //   if (lapIdx !== lapsSortedBySpeed.length - 1 && lap.distance > 1000) {
    //     foundSeqJump = foundSeqJump || thisComparisonHasJump
    //   }
    // }

    prevLap = lap;
  }

  const foundJump = foundSeqJump || foundMaxJump;

  // 5. If there are any non km or non mile laps not including the very last lap, it's a sign it's probably a workout
  const withoutLastLap = laps.slice(0, -1);
  const allLapsAreStandard = withoutLastLap.reduce((allLapsStandard, curLap) => {
    const lapIsMile = Math.abs(1.0 - Helpers.metersToMiles(curLap.distance)) <= 0.02;
    const lapIsKilometer = Math.abs(1000.0 - curLap.distance) <= 32; // same as .02 miles

    return (allLapsStandard && (lapIsMile || lapIsKilometer));
  }, true);

  return (!allLapsAreStandard || foundJump || existsFastLap);
}

function tagWorkoutLaps(laps) {
  winsorizeLapSpeeds(laps);

  // //
  // // Start experiment — speed as percentage of min and max paces found, instead of actual speeds
  // //

  // const max_speed = laps.reduce((a, b) => Math.max(a, b.average_speed), 0);
  // const min_speed = laps.reduce((a, b) => Math.min(a, b.average_speed), 9999);
  // const speed_range = max_speed - min_speed;
  // for (const lap of laps) {
  //   lap.average_speed_percentile = (lap.average_speed - min_speed) / speed_range;
  //   // console.log(lap.average_speed_percentile);
  // }

  // // const isWorkoutAssignments = runKnn(
  // //   laps
  // //     .filter(lap => lap.average_speed_percentile >= 0.1)
  // //     .map((lap) => {
  // //       return {"features": [lap.average_speed_percentile]};
  // //     }
  // // ), 2);


  // //
  // // End experiment
  // //


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

function mergeAbuttingLaps(laps) {
  const mergedLaps = [];

  let prevLap = laps[0];
  for (let lapIdx = 1; lapIdx < laps.length; lapIdx++ ) {
    // If two consequtive laps are the same type (workout vs. nonworkout), merge them
    if (prevLap.isWorkout === laps[lapIdx].isWorkout) {
      prevLap = mergeLapsHelper(prevLap, laps[lapIdx]);
    } else { // If not the same type, add the previous lap to the result array
      mergedLaps.push(prevLap);
      prevLap = laps[lapIdx];
    }
  }

  // Include the last lap
  mergedLaps.push(prevLap);

  // Remove stub workout laps after merging
  const stubRemovedLaps = removeStubLaps(mergedLaps);

  return stubRemovedLaps;
}

function removeStubLaps(laps) {
  // After abutting workout laps have been merged, any workout laps under 10 sec (the shortest valid lap assuming you ran a 100m in 10 sec) are removed
  const SHORTEST_ALLOWED_TIME = 10; // seconds

  return laps.filter((lap) => {
    return !(lap.isWorkout && (lap.moving_time < SHORTEST_ALLOWED_TIME));
  });
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

  const differenceThreshold = 1.2; // TODO Tune this


  /*
  Try out the threshold system on both distances and times.
  We haven't assigned basises yet, so this will proxy for the true basis.
  By taking the basis that generates the fewest distinct workout types, we guard against pace variance, which manifests as
  time variance on distance based reps, and distance variance on time based reps
  */

  const workoutsSortedByDistance = [...workouts].sort((a, b) => a.distance < b.distance ? -1 : 1);
  const workoutsSortedByTime = [...workouts].sort((a, b) => a.moving_time < b.moving_time ? -1 : 1);

  let workoutTypeCounterDistance = 0;
  let workoutTypeCounterTime = 0;

  let prevWorkoutDistance = workoutsSortedByDistance[0].distance;
  for (const lap of workoutsSortedByDistance) {
    if ((lap.distance / prevWorkoutDistance) >= differenceThreshold) {
      workoutTypeCounterDistance += 1;
    }

    prevWorkoutDistance = lap.distance;
    lap.workoutType_d = workoutTypeCounterDistance;
  }

  let prevWorkoutTime = workoutsSortedByTime[0].moving_time;
  for (const lap of workoutsSortedByTime) {
    if ((lap.moving_time / prevWorkoutTime) >= differenceThreshold) {
      workoutTypeCounterTime += 1;
    }

    prevWorkoutTime = lap.moving_time;
    lap.workoutType_t = workoutTypeCounterTime;
  }


  // Take the system that generates the FEWEST distinct workout types
  if (workoutTypeCounterTime > workoutTypeCounterDistance) {
    for (const lap of workouts) {
      lap.workoutType = lap.workoutType_d;
    }
  } else {
    for (const lap of workouts) {
      lap.workoutType = lap.workoutType_t;
    }
  }

  // [end]

  return laps;
}

// HELPER
function lapsByWorkoutType(laps) {
  const groupedLaps = [];
  const maxWorkoutType = laps.map((lap) => lap.workoutType === undefined ? 0 : lap.workoutType).reduce((a, b) => Math.max(a, b), 0);

  for (let workoutType = 0; workoutType <= maxWorkoutType; workoutType++) {
    const correspondingLaps = laps.filter((lap) => lap.workoutType === workoutType);
    groupedLaps.push(correspondingLaps);
  }

  return groupedLaps;
}

function tagWorkoutBasisAndValue(laps, parserConfig, verbose = false) {
  const MAX_TIME_DIFF = 5; // The maximum difference allowed between a lap's total time and the guessed time and have it still be considered TIME basis, in seconds.
  const groupedByWorkoutType = lapsByWorkoutType(laps);

  for (const correspondingLaps of groupedByWorkoutType) {
    // [start] Closest known distance/time basis determination

    // 1. Guess the closest value of each basis for each lap
    for (const lap of correspondingLaps) {
      assignNearestDistance(lap);
      assignNearestTime(lap);
    }

    // To smooth differences across the laps, average their values and make the determinations on the aggregate lap
    const aggregateLap = {};
    aggregateLap.moving_time = correspondingLaps.reduce((a, b) => a + b.moving_time, 0) / correspondingLaps.length;
    aggregateLap.distance = correspondingLaps.reduce((a, b) => a + b.distance, 0) / correspondingLaps.length;
    assignNearestDistance(aggregateLap);
    assignNearestTime(aggregateLap);

    if (verbose) {
      console.log(aggregateLap);
    }

    let aggregateBasis = "";

    // If we know one format is more common, apply the biasFactor to make for a higher threshold before we categorize a workout's basis as the un-common format.
    // The differences are normalized (essentially percentages) so the scale is equivalent across time and distance

    let distanceDisadvantageFactor = 1.0; // Increase the `closest[Distance/Time]Difference` value by this factor to give an advantage to the _other_ basis
    let timeDisadvantageFactor = 1.0;


    const biasFactor = 2.0;

    switch (parserConfig.dominantWorkoutType) {
      case "DISTANCE":
        timeDisadvantageFactor *= biasFactor;
        // aggregateBasis = (aggregateLap.closestDistanceDifference <= (biasFactor * aggregateLap.closestTimeDifference) ? "DISTANCE" : "TIME");
        break;
      case "TIME":
        distanceDisadvantageFactor *= biasFactor;
        // aggregateBasis = (aggregateLap.closestTimeDifference <= (biasFactor * aggregateLap.closestDistanceDifference) ? "TIME" : "DISTANCE");
        break;
      case "BALANCED":
        // aggregateBasis = (aggregateLap.closestDistanceDifference <= aggregateLap.closestTimeDifference ? "DISTANCE" : "TIME");
        break;
      default: // Same as balanced
        aggregateBasis = (aggregateLap.closestDistanceDifference <= aggregateLap.closestTimeDifference ? "DISTANCE" : "TIME");
        break;
    }

    if (parserConfig.homogeneityAdvantageDirection != undefined) {
      switch (parserConfig.homogeneityAdvantageDirection) {
        case "DISTANCE":
          timeDisadvantageFactor *= parserConfig.homogeneityAdvantageValue;
          // aggregateBasis = (aggregateLap.closestDistanceDifference <= (biasFactor * aggregateLap.closestTimeDifference) ? "DISTANCE" : "TIME");
          break;
        case "TIME":
          distanceDisadvantageFactor *= parserConfig.homogeneityAdvantageValue;
          // aggregateBasis = (aggregateLap.closestTimeDifference <= (biasFactor * aggregateLap.closestDistanceDifference) ? "TIME" : "DISTANCE");
          break;
        default:
          break;
      }
    }

    aggregateBasis = (aggregateLap.closestDistanceDifference * distanceDisadvantageFactor) <= (aggregateLap.closestTimeDifference * timeDisadvantageFactor) ? "DISTANCE" : "TIME";

    // 2. Pick the closest basis

    // Because the guesses are inherantly limited because they're compared against a pre-defined list of valid distances/times, it's possible to see a new value that's not on the list. This is guarded for by checking the standard deviation and, if 0, taking that value instead.

    const distanceDifferenceAverage = correspondingLaps.reduce((a, b) => a + b.closestDistanceDifference, 0) / correspondingLaps.length;
    const timeDifferenceAverage = correspondingLaps.reduce((a, b) => a + b.closestTimeDifference, 0) / correspondingLaps.length;

    let distanceStdDev = 999; // Initialize StdDevs to a very large value so they don't override the difference averages by default
    let timeStdDev = 999;

    distanceStdDev = Math.sqrt(correspondingLaps.reduce((a, b) => a + Math.pow(b.closestDistanceDifference - distanceDifferenceAverage, 2), 0) / correspondingLaps.length).toFixed(4);
    timeStdDev = Math.sqrt(correspondingLaps.reduce((a, b) => a + Math.pow(b.closestTimeDifference - timeDifferenceAverage, 2), 0) / correspondingLaps.length).toFixed(4);

    // console.log(aggregateLap)
    // console.log(`diff: ${distanceDifferenceAverage}, ${timeDifferenceAverage}`);
    // console.log(`std : ${distanceStdDev}, ${timeStdDev}`);

    // If the opposite basis has zero std dev (even if the value isn't recognized), it's likely intentional
    if (correspondingLaps.length > 1) {
      if (distanceStdDev === 0.0.toFixed(4) && aggregateBasis === "TIME") {
        aggregateBasis = "DISTANCE";
        aggregateLap.closestDistance = correspondingLaps[0].distance;
        aggregateLap.closestDistanceUnit = "m";
      } else if (
        timeStdDev === 0.0.toFixed(4) &&
          aggregateBasis === "DISTANCE" &&
          correspondingLaps[0].moving_time % 5 === 0 // Check that the time ends in a 0 or 5, which is more likely to be an intentional time interval
      ) {
        aggregateBasis = "TIME";
        aggregateLap.closestTime = correspondingLaps[0].moving_time; // B/c the formatter pulls from `closestTime`, not `movingTime`
      }
    }

    let tooNotCloseCount = 0;
    let shouldFlipGroupBasis = false;
    for (const lap of correspondingLaps) {
      // Give each lap the basis + value determined on the aggregate lap
      lap.workoutBasis = aggregateBasis;
      lap.closestTime = aggregateLap.closestTime; // Assign values for both basises so we can simply flip the `workoutBasis` value later if needed
      lap.closestDistance = aggregateLap.closestDistance; // Assign values for both basises so we can simply flip the `workoutBasis` value later if needed
      lap.closestDistanceUnit = aggregateLap.closestDistanceUnit;

      // Saving for ease of debugging
      lap.aggregateClosestDistanceDifference = aggregateLap.closestDistanceDifference;
      lap.aggregateClosestTimeDifference = aggregateLap.closestTimeDifference;

      // Double check that time-based laps are reasonably close to the actual time, but only if it's matched to a known time

      if (lap.workoutBasis === "TIME" && timeStdDev !== 0.0) {
        if (Math.abs(lap.closestTime - lap.moving_time) > MAX_TIME_DIFF) {
          tooNotCloseCount++;
        }
      }
    }

    if (correspondingLaps.length >= 4) { // Arbitrary limit for how many laps quality for slight leniency
      shouldFlipGroupBasis = tooNotCloseCount >= 2;
    } else {
      shouldFlipGroupBasis = tooNotCloseCount > 0;
    }

    if (shouldFlipGroupBasis) {
      if (aggregateBasis === "TIME") {
        aggregateBasis = "DISTANCE";
      } else if (aggregateBasis === "DISTANCE") {
        aggregateBasis = "TIME";
      }

      for (const lap of correspondingLaps) {
        lap.workoutBasis = aggregateBasis;
      }
    }

    // print(`timeAvg: ${timeDifferenceAverage}, distAvg: ${distanceDifferenceAverage}`);
    // print(`timeStd: ${timeStdDev}, distStd: ${distanceStdDev}`);

    // [end]
  }

  return laps;
}

function extractPatterns(laps) {
  let i = 0;
  const patterns = [];

  while (i < laps.length) {
    let longestFoundPattern = {
      "pattern": [laps[i].workoutType],
      "count": 1,
      "laps": [laps[i]],
    };

    let patternLength = 1;
    while (patternLength < laps.length - i) {
      const patternGuess = laps.slice(i, i + patternLength).map((lap) => lap.workoutType);
      const attemptedReduction = patternReducer(patternGuess, laps.slice(i + patternLength).map((lap) => lap.workoutType)); // start at `+ patternLength` to avoid matching the initial pattern
      // attemptedReduction.matchCount returns the count not including the original pattern, fyi


      const totalElementsCovered = (attemptedReduction.matchCount + 1) * patternLength;
      if (attemptedReduction.matchCount >= 1 && totalElementsCovered > (longestFoundPattern.pattern.length * longestFoundPattern.count)) {
        longestFoundPattern = {
          "pattern": patternGuess,
          "count": attemptedReduction.matchCount + 1, // + 1 to include the initial pattern
          "laps": laps.slice(i, i + (patternLength * (attemptedReduction.matchCount + 1))),
        };
      }

      patternLength++;
    }

    patterns.push(longestFoundPattern);
    i += longestFoundPattern.pattern.length * (longestFoundPattern.count); // + 1 to include the initial pattern
  }

  return patterns;
  // console.log("-------- " + laps)
  // console.log(patterns)
  // console.log(" ")
}

/*
*
*
* HELPERS
* HELPERS
* HELPERS
* HELPERS
*
*
*/

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


// Combines the 'addition' lap into the base lap, preserves all component laps in a property called `component_laps`
function mergeLapsHelper(base, addition) {
  // Determine if the addition is actually a track vs. GPS error, by the heuristic:
  // If the addition is < 4% of the previous lap's distance, and that distance is an auto-lapped distance (km or mile)

  const trackMargin = 0.038;
  const baseLapDistance = ("component_laps" in base) ? base.component_laps[base.component_laps.length - 1].distance : base.distance;
  const autolapCount = ("component_laps" in base) ?
    base.component_laps.reduce((a, b) => {
      if (!b.trackErrorAdjusted && Helpers.isAutolap(b)) {
        return a + 1;
      }
      return a;
    }, 0) :
    1;
  const isTrackError = Helpers.isAutolap({distance: baseLapDistance}) && addition.distance <= baseLapDistance * autolapCount * trackMargin;

  // console.log(isTrackError, addition.distance, (baseLapDistance * autolapCount) * trackMargin)

  if (isTrackError) {
    // Split the error across all previous auto-lappable-distance laps.
    // Note that we only need to check the base since we're moving forward through the list, so if auto-lap triggered multiple times without being corrected (e.g. track 5k with km mode), the previous auto-lap laps will have already been merged into base by the time we reach the track addition

    // Deterine if there are multiple laps to split the addition across
    if ("component_laps" in base) {
      base.component_laps.forEach((lap) => {
        if (!lap.trackErrorAdjusted) {
          lap.elapsed_time += addition.elapsed_time / autolapCount;
          lap.moving_time += addition.moving_time / autolapCount;
          lap.total_elevation_gain += addition.total_elevation_gain / autolapCount;
          lap.trackErrorAdjusted = true; // Only adjust for error once, in case of a [lap, trackerror, lap, trackerror, rest] pattern

          // Note, don't the addition to the distance, since the premise is that the GPS is under-reporting the distance, so by adding in the time, we'll make it an accurate distance-time match (since distance presumably is based on the track).
        }
      });
    } else {
      base.trackErrorAdjusted = true;
      // Noop on splitting the addition because we only need to combine the addition into base stats, which happens outside the isTrackError block
    }
  } else { // Do not add the track error lap as its own component, otherwise the splits for the combined lap will look wrong
    if ("component_laps" in base) {
      base.component_laps.push({...addition});
    } else {
      base.component_laps = [{...base}, {...addition}]; // Spread notation prevents a circular reference
    }
  }

  const combinedElapsedTime = base.elapsed_time + addition.elapsed_time;
  const combinedMovingTime = base.moving_time + addition.moving_time;
  const combinedDistance = base.distance + addition.distance;
  const combinedEndIndex = Math.max(base.end_index, addition.end_index);
  const combinedTotalElevationGain = base.total_elevation_gain + addition.total_elevation_gain;
  const combinedAverageSpeed = (base.distance + addition.distance) / (combinedMovingTime);
  const combinedMaxSpeed = Math.max(base.max_speed, addition.max_speed);

  base.elapsed_time = combinedElapsedTime;
  base.moving_time = combinedMovingTime;
  if (!isTrackError) {
    base.distance = combinedDistance;
  }
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
    1200,
    1500,
    // 1600,
    // 2400,
    2800,
    // 3200
  ];

  // Separate from meters for display purposes
  const validDistancesKilometers = [
    1000,
    2000,
    3000,
    4000,
    5000,
    6000,
    8000,
    10000,
  ];

  const validDistancesMiles = [
    1609.3, // 1 mile
    2414, // 1.5 miles
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

  const lapDist = lap.distance;
  lap.closestDistance = 0;
  lap.closestDistanceDifference = 2; // This is a ratio, and if the actual distance is < the smallest distance we recognize, it may be more than 100% off

  for (const guess of validDistancesMeters) {
    const difference = Math.abs(lapDist - guess) / lapDist; // Divide by lapDist for a consistent denominator across guesses
    if (difference < lap.closestDistanceDifference) {
      assignDistanceGuess(lap, guess, difference, "m");
    }
  }

  for (const guess of validDistancesKilometers) {
    const difference = Math.abs(lapDist - guess) / lapDist; // Divide by lapDist for a consistent denominator across guesses
    if (difference < lap.closestDistanceDifference) {
      assignDistanceGuess(lap, guess / 1000, difference, "km");
    }
  }

  for (const guess of validDistancesMiles) {
    const difference = Math.abs(lapDist - guess) / lapDist; // Divide by lapDist for a consistent denominator across guesses
    if (difference < lap.closestDistanceDifference) {
      assignDistanceGuess(lap, Helpers.metersToMilesRounded(guess), difference, "mi");
    }
  }
}

function assignDistanceGuess(lap, distance, difference, unit) {
  lap.closestDistance = distance;
  // You don't pluralize the abbreviations for distance units (but you do for the full word)
  lap.closestDistanceUnit = unit; // + (distance > 1 ? "s" : "");
  lap.closestDistanceDifference = difference;
}

function assignNearestTime(lap) {
  const validTimes = [
    15,
    20,
    30,
    45,
    60,
    90,
    120, // 2
    // 150,
    180, // 3
    // 210,
    240, // 4
    // 270,
    300, // 5
    // 330,
    // 360, // 6
    // 390,
    420, // 7
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

  for (const time of validTimes) {
    const difference = Math.abs(time - lapTime) / lapTime; // Divide by lapTime for a consistent denominator across guesses
    if (difference < lap.closestTimeDifference) {
      assignTimeGuess(lap, time, difference);
    }
  }
}

function assignTimeGuess(lap, time, difference) {
  lap.closestTime = time;
  lap.closestTimeDifference = difference;
}

function checkBasisHomogeneity(laps, parserConfig) {
  // If all sets except one are of a particular basis, re-parse that set with an increased threshold

  const groupedByWorkoutType = lapsByWorkoutType(laps);
  if (groupedByWorkoutType.length <= 2) { // Need more than two types of workout to establish a majority
    return laps;
  }

  let timeCount = 0;
  let distCount = 0;

  for (const correspondingLaps of groupedByWorkoutType) {
    const groupTimeCount = correspondingLaps.reduce((count, lap) => count + (lap.workoutBasis === "TIME" ? 1 : 0), 0);
    const groupDistCount = correspondingLaps.reduce((count, lap) => count + (lap.workoutBasis === "DISTANCE" ? 1 : 0), 0);

    if (groupTimeCount === 0 && groupDistCount > 0) {
      distCount++;
    } else if (groupTimeCount > 0 && groupDistCount === 0) {
      timeCount++;
    } else {
      console.error(`Laps within workout type ${correspondingLaps[0].workoutType} do not have the same basis.`);
      return laps;
    }
  }

  if (timeCount + distCount !== groupedByWorkoutType.length) {
    console.error(`Basis homogeneity check missed a workout type`);
    return laps;
  }

  const homogeneityAdjustmentFactor = 2.0;
  if (timeCount === 1) {
    const modifiedParserConfig = {...parserConfig};
    modifiedParserConfig.homogeneityAdvantageDirection = "DISTANCE";
    modifiedParserConfig.homogeneityAdvantageValue = distCount * homogeneityAdjustmentFactor; // The more of the other one there is, the more likely this is a mistake

    const retagged = tagWorkoutBasisAndValue(laps, modifiedParserConfig);
    return retagged;
  } else if (distCount === 1) {
    const modifiedParserConfig = {...parserConfig};
    modifiedParserConfig.homogeneityAdvantageDirection = "TIME";
    modifiedParserConfig.homogeneityAdvantageValue = timeCount * homogeneityAdjustmentFactor;

    const retagged = tagWorkoutBasisAndValue(laps, modifiedParserConfig);
    return retagged;
  } else { // No outlier basis detected
    return laps;
  }
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

function winsorizeLapSpeeds(laps) {
  const maxSlowness = Helpers.milesToMeters(6) / (60.0 * 60.0); // 10 minute mile, in m/s
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

function lapIsNotTooFast(lap) {
  const worldRecordSpeed = 100 / 9.58; // Bolt's 100m record
  const lapSpeed = lap.distance / lap.moving_time;

  return lapSpeed < worldRecordSpeed;
}

function print(x) {
  console.log(x);
}

module.exports = {
  parseWorkout,
  determineRunIsWorkout,
  mergeAbutingLaps: mergeAbuttingLaps,
  tagWorkoutLaps,
  tagWorkoutTypes,
  tagWorkoutBasisAndValue,
};
