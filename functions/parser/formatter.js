const Helpers = require("./parser_helpers.js");

function determineSetName(set, multiRepSetsShouldHaveParen = false) {
  let setName = "";

  // List out each component of the set
  for (const workoutType of set.pattern) {
    const lap = set.laps.filter((lap) => lap.workoutType === workoutType)[0];
    const lapName = lap.workoutBasis === "DISTANCE" ?
        `${lap.closestDistance}${lap.closestDistanceUnit}` :
        // `${lap.closestTime} ${lap.closestTimeUnit}`;
        `${Helpers.secondsToTimeFormatted(lap.closestTime, true)}`

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
      setName = `(${setName})`;
    }
  }

  return setName;
}

function determineSetSplits(set, printConfig=defaultPrintConfig) {
/* Set splits are generally formatted as:

line 1: workout (4 x 1 mile) — Avg: 5:12
line 2: splits for each rep (e.g. 5:23/mi, 5:12/mi, 5:00/mi, 4:59/mi)


If the set consists of only one rep, but is > 1 mile long, show the mile (or km) splits within the rep:
e.g.
line 1: 5mi — Avg: 5:12
line 2: 5:00, 5:01, 5:42, 5:20, 5:12


If the set consists of hetergenous distances (e.g. 4 x (400m, 200m)), split out each rep into a numbered line
e.g.
line 1: 4 x (400m, 200m) — Avg: asdlf
line 2:   1. 1:00, 30
line 3:   2. 1:01, 32
line 4:   3. 1:02, 31
line 5:   4. 1:00, 29
*/

  // First line (workout format)
  const setName = determineSetName(set, false);
  let setAverage = ``;
  let splits = ``;

  /* Set average

    If each rep is >=1mi, show average per-mile pace
    If each rep is <1mi, show the average time unless config overrides (`shortDistanceAverageUnit`, options: "PACE", "TIME")
    Unless the basis is time, in which show average per-mile pace. I don't know that anyone really gauges time-based interval performance off distance...

*/

  const tokenLap = set.laps[0];
  if (tokenLap.distance >= Helpers.milesToMeters(1.0) || tokenLap.workoutBasis === "TIME") {
    // Average per-mile pace
    setAverage += `Avg: ${Helpers.averagePaceOfSet(set)}/mi`;
  } else {
    switch (printConfig.shortDistanceAverageUnit) {
      case "TIME":
        setAverage += `Avg: ${Helpers.averageTimeOfSetFormatted(set)}`;
        break;
      case "PACE":
        setAverage += `Avg: ${Helpers.averagePaceOfSet(set)}/mi`;
        break;
      case "NONE":
        break;
      default:
        break;
    }
  }

  // Individual rep details
  if (set.laps.length > 1) {
    // Lap > 1mi: mile/km pace, depending on config
    // Lap < 1mi: time if basis DISTANCE, pace if basis TIME

    let repDetails = ``;
    let lapCounter = 0;
    for (const lap of set.laps) {
      if (tokenLap.closestDistanceUnit === "mile") {
        repDetails += `${Helpers.pacePerMileFormatted(lap)}, `;
      } else {
        if (tokenLap.workoutBasis === "DISTANCE") {
          repDetails += `${Helpers.secondsToTimeFormatted(lap.moving_time)}, `;
        } else if (tokenLap.workoutBasis === "TIME") {
          repDetails += `${Helpers.pacePerMileFormatted(lap)}/mi, `;
        }
      }

      // If each rep consists of more than one component (e.g. 3 x 1,2,3,2,1), then list each rep on its own line

      // Every time we hit the end of a rep...
      if (set.pattern.length > 1 && (lapCounter % set.pattern.length) === set.pattern.length - 1) {
        // Prefix an indent and the rep number
        splits += `\t${Math.ceil(lapCounter / set.pattern.length)}. ${repDetails.slice(0, -2)}`; // slice to remove ending ", "

        if (lapCounter < set.laps.length - 1) {
          splits += `\n`; // Only add newline if not on the last rep, to avoid an extra linebreak
          repDetails = "";
        }
      } else if (set.pattern.length === 1 && lapCounter === set.count - 1) { // Last rep, not a multi-component set
        splits += repDetails.slice(0, -2);
      }

      lapCounter++;
    }
  } else if (set.laps.length === 1 && Helpers.metersToMiles(set.laps[0].distance) > 1) { // List the splits if the lap is multiple miles
    const tokenLap = set.laps[0];
    if ("component_laps" in tokenLap) {
      for (const lap of tokenLap.component_laps) {
        if (Helpers.metersToMiles(lap.distance) >= .5) {
          splits += `${Helpers.pacePerMileFormatted(lap)}/mi, `;
        }
      }
      splits = splits.slice(0, -2);
    }
  }

  let output = `⏱️ ${setName} — ${setAverage}`;
  if (splits !== ``) {
    output += `\n${splits}`;
  }
  return output;
}

const defaultPrintConfig = {
  "paceUnits": "MILE", // KM
  "shortDistanceAverageUnit": "TIME", // "PACE", "NONE"
};

function printSets(sets, printConfig=defaultPrintConfig) {
  let fullTitle = ""; // For the strava activity title, only contains the structure
  let fullDescription = ""; // Contains details, for the activity description

  for (const set of sets) {
    const setName = determineSetName(set, sets.length > 1);
    fullTitle += `${setName} + `;

    const setSplits = determineSetSplits(set);
    fullDescription += `${setSplits}\n\n`;
  }

  fullDescription += `Workout summary generated by stravaworkout.com`;
  fullTitle = fullTitle.slice(0, -3);

  return {
    "title": fullTitle,
    "description": fullDescription,
  };
}

module.exports = {
  printSets,
};
