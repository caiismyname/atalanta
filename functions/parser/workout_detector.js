const Helpers = require("./parser_helpers.js");

function isWorkout(laps, debug=false) {
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

  Helpers.winsorizeLapSpeeds(laps);

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

function verifyIsWorkout(laps, sets, parserConfig, debug=false) {
    const workoutLaps = laps.filter(x => x.isWorkout);

    var allDistanceLapsCloseToActual = true;
    var workoutLapsUnderWorkoutPaceThreshold = true;

    /*
      So it turns out causes a bunch of false flags.
    */

    // Check that the distance guesses are within 5% of the actual distance
    // for (let lap of workoutLaps) {
    //     if (lap.workoutBasis === "DISTANCE") {
    //         if (lap.closestDistanceDifference > 0.05) {
    //             allDistanceLapsCloseToActual = false;
    //         }
    //     }
    // }

    // Check workout laps are close to or under the stated workout pace threshold
    // Workout pace is specified as the slowest pace that they consider a workout, in minutes
    const paceThreshold = parserConfig.workoutPace * 60;

    for (let lap of workoutLaps) {
      const perMilePace = Helpers.secondsPerMile(lap);
      if (perMilePace >= paceThreshold) { // If the workout lap is slower
        workoutLapsUnderWorkoutPaceThreshold = false;
      }
    }
  
    return allDistanceLapsCloseToActual && workoutLapsUnderWorkoutPaceThreshold;
}

module.exports = {
  isWorkout,
  verifyIsWorkout,
};
