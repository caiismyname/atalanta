// const Helpers = require("./parser_helpers.js");
const {FormatPrinter} = require("./format_printer.js");
const {defaultFormatConfig} = require("./defaultConfigs.js");
const {isMile, isKilometer, compareToMile} = require("./parser_helpers.js");

class Formatter {
  constructor(formatConfig = defaultFormatConfig) {
    this.formatConfig = formatConfig;
    this.printer = new FormatPrinter(this.formatConfig);
  }

  determineSetName(set, multiRepSetsShouldHaveParen = false) {
    let setName = "";

    // List out each component of the set
    for (const workoutType of set.pattern) {
      const lap = set.laps.filter((lap) => lap.workoutType === workoutType)[0];
      const lapName = lap.workoutBasis === "DISTANCE" ?
          `${lap.closestDistance}${lap.closestDistanceUnit}` :
          `${this.printer.secondsToTimeFormatted(lap.closestTime, true, true)}`;

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

  determineSetAverage(set) {
    /* Set average

      If each rep is >=1mi, show average per-mile pace unless config overrides (`greaterThanMileDistanceValue`, options: "PACE" (default), "TIME")
      If each rep is <1mi, show the average time unless config overrides (`shortDistanceAverageUnit`, options: "PACE", "TIME" (default))
      Unless the basis is time, in which show average per-mile pace. I don't know that anyone really gauges time-based interval performance off distance...

    */

    let setAverage = `— Avg: `;
    if (set.count === 1 && set.laps[0].component_laps === undefined) {
      setAverage = `— `; // Remove the `Avg: ` if the set has no splits
    }

    if (set.pattern.length === 1) { // Only show average for homogeneous sets.
      const tokenLap = set.laps[0]; // For ease of reference, since the set is homogenous

      if (tokenLap.workoutBasis === "DISTANCE") {
        if (isKilometer(tokenLap.distance)) { // Hard coded override for km repeats
          setAverage += `${this.printer.averageTimeOfSetFormatted(set)}`; // Just show the time, not lapPaceFormatted to avoid the `/km` suffix
        } else {
          switch (compareToMile(tokenLap.distance)) {
            case "LESS":
              switch (this.formatConfig.subMileDistanceValue) {
                case "TIME":
                  if (set.count === 1) {
                    setAverage = `— `;
                  }
                  setAverage += `${this.printer.averageTimeOfSetFormatted(set)}`;
                  break;
                case "PACE":
                  setAverage += `${this.printer.averagePaceOfSet(set)}`;
                  break;
                case "NONE":
                  break;
                default:
                  setAverage += `${this.printer.averageTimeOfSetFormatted(set)}`;
                  break;
              }
              break;
            case "EQUALS":
              setAverage += `${this.printer.averageTimeOfSetFormatted(set)}`; // Just show the time, not lapPaceFormatted to avoid the `/mi` suffix
              break;
            case "MORE":
              switch (this.formatConfig.greaterThanMileDistanceValue) {
                case "TIME":
                  if (set.count === 1) {
                    setAverage = `— `;
                  }
                  setAverage += `${this.printer.averageTimeOfSetFormatted(set)}`;
                  break;
                case "PACE":
                  setAverage += `${this.printer.averagePaceOfSet(set)}`;
                  break;
                case "NONE":
                  break;
                default:
                  setAverage += `${this.printer.averagePaceOfSet(set)}`;
                  break;
              }
              break;
            default:
              break;
          }
        }
      } else if (tokenLap.workoutBasis === "TIME") { // Ignore config on time b/c showing total time on a time-based rep is pointless
        setAverage += `${this.printer.averagePaceOfSet(set)}`;
      }
    } else {
      setAverage = ``; // If not a single-split lap or homogenous laps, remove since there's no average for heterogenous sets
    }

    return setAverage;
  }

  determineSetSplits(set) {
  /* Set splits are generally formatted as:

  line 1: workout + average (4 x 1 mile) — Avg: 5:12
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

    let splits = ``;

    // Individual rep details
    if (set.laps.length > 1) {
      // Lap > 1mi: mile/km pace, depending on config
      // Lap < 1mi: time if basis DISTANCE, pace if basis TIME

      let repDetails = ``;
      let lapCounter = 0;
      for (const lap of set.laps) {
        if (lap.workoutBasis === "DISTANCE") {
          switch (compareToMile(lap.distance)) {
            case "LESS":
              switch (this.formatConfig.subMileDistanceValue) {
                case "TIME":
                  repDetails += `${this.printer.secondsToTimeFormatted(lap.moving_time)}, `;
                  break;
                case "PACE":
                  repDetails += `${this.printer.lapPaceFormatted(lap)}, `;
                  break;
                case "NONE":
                  break;
                default:
                  repDetails += `${this.printer.lapPaceFormatted(lap)}, `;
                  break;
              }
              break;
            case "EQUALS":
              repDetails += `${this.printer.secondsToTimeFormatted(lap.moving_time)}, `; // Just show the time, not lapPaceFormatted to avoid the `/mi` suffix
              break;
            case "MORE":
              switch (this.formatConfig.greaterThanMileDistanceValue) {
                case "TIME":
                  repDetails += `${this.printer.secondsToTimeFormatted(lap.moving_time)}, `;
                  break;
                case "PACE":
                  repDetails += `${this.printer.lapPaceFormatted(lap)}, `;
                  break;
                case "NONE":
                  break;
                default:
                  repDetails += `${this.printer.lapPaceFormatted(lap)}, `;
                  break;
              }
              break;
            default:
              break;
          }
        } else if (lap.workoutBasis === "TIME") { // Ignore config on time b/c showing total time on a time-based rep is pointless
          repDetails += `${this.printer.lapPaceFormatted(lap)}, `;
        }
        // }

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
    } else if (set.laps.length === 1 &&this.printer.metersToMiles(set.laps[0].distance) > 1) { // List the splits if the lap is multiple miles
      const tokenLap = set.laps[0];
      if ("component_laps" in tokenLap) {
        for (const lap of tokenLap.component_laps) {
          if (isKilometer(lap.distance) || isMile(lap.distance)) {
            splits += `${this.printer.secondsToTimeFormatted(lap.moving_time)}, `; // force KM  / mile as the split if the component laps are in KM / mile
          } else {
            // TODO look at config for this
            splits += `${this.printer.secondsToTimeFormatted(lap.moving_time)}, `;
          }
        }
        splits = splits.slice(0, -2);
      }
    }

    if (this.formatConfig.splitsFormat === "CONDENSED") {
      return this.condenseSetSplits(splits);
    }
    return splits;
    // if (splits !== ``) {
    //   output += `\n${splits}`;
    // }
    // return output;
  }

  condenseSetSplits(nonCondensedSplits) {
    const lines = nonCondensedSplits.split("\n");
    const outputLines = [];

    for (const line of lines) {
      const components = line.split(",");

      if (components.length <= 1) {
        outputLines.push(line);
        continue;
      }

      // Ensure all items in the line are the same (pace vs time), otherwise don't condense
      const allTimes = components.reduce((a, b) => a && !(b.includes("/km") || b.includes("/mi")), true);
      const allPerMile = components.reduce((a, b) => a && b.includes("/mi"), true);
      const allPerKm = components.reduce((a, b) => a && b.includes("/km"), true);

      if (!(allTimes || allPerMile || allPerKm)) {
        outputLines.push(line);
        continue;
      }

      if (components[0].includes("/mi") || components[0].includes("/km")) {
        // Paces
        const unit = components[0].split("/")[1];
        const condensed = this.condenserHelper(components.map((time) => time.slice(0, -3))); // remove the pace suffix
        outputLines.push(`${condensed} /${unit}`);
      } else {
        // Times
        outputLines.push(this.condenserHelper(components));
      }
    }

    return outputLines.join("\n");
  }

  condenserHelper(components) {
    let condensed = `${components[0]}`;
    let prevMinuteBasis;

    if (components[0].includes(". ")) { // It's part of a heterogenous set so we need to filter out the number-bullet prefix
      prevMinuteBasis = components[0].split(". ")[1].split(":")[0];
    } else {
      prevMinuteBasis = components[0].split(":")[0];
    }

    for (let time of components.slice(1)) { // Start from second element since we print the first one in full
      time = time.replace(/\s/g, ""); // remove whitespace
      const minuteBasis = time.split(":")[0];

      if (prevMinuteBasis === minuteBasis) {
        if (time.includes(":")) {
          const seconds = time.split(":")[1];
          condensed = `${condensed},${seconds}`;
        } else {
          condensed = `${condensed},${time}`; // `time` is already in seconds
        }
      } else {
        condensed = `${condensed},${time}`;
      }

      prevMinuteBasis = minuteBasis;
    }

    return condensed;
  }

  setEligibleForRange(set) {
    return set.pattern.length === 1;
  }

  determineSetRange(set) {
    // For now, we only do ranges if the set is homogeneous
    const lap = set.laps[0];

    if (lap.workoutBasis === "DISTANCE") {
      switch (compareToMile(lap.distance)) {
        case "LESS":
          switch (this.formatConfig.subMileDistanceValue) {
            case "TIME":
              return this.printer.setTimeRangeFormatted(set);
            case "PACE":
              return this.printer.setPaceRangeFormatted(set);
            case "NONE":
              return "";
            default:
              return this.printer.setTimeRangeFormatted(set);
          }
        case "EQUALS":
          return this.printer.setTimeRangeFormatted(set);
        case "MORE":
          switch (this.formatConfig.greaterThanMileDistanceValue) {
            case "TIME":
              return this.printer.setTimeRangeFormatted(set);
            case "PACE":
              return this.printer.setPaceRangeFormatted(set);
            case "NONE":
              return "";
            default:
              return this.printer.setPaceRangeFormatted(set);
          }
        default:
          return "";
      }
    } else if (lap.workoutBasis === "TIME") { // Ignore config on time b/c showing total time on a time-based rep is pointless
      return this.printer.setPaceRangeFormatted(set);
    }
  }

  printSets(sets) {
    let fullTitle = ""; // For the strava activity title, only contains the structure
    let fullDescription = ""; // Contains details, for the activity description

    for (const set of sets) {
      const setName = this.determineSetName(set, sets.length > 1);
      fullTitle += `${setName} + `;

      const setNameForAverage = this.determineSetName(set, false); // don't include parens
      const setAverage = this.determineSetAverage(set);
      let setSplits;

      switch (this.formatConfig.detailsMode) {
        case "SPLITS":
          setSplits = this.determineSetSplits(set);
          break;
        case "RANGE":
          if (this.setEligibleForRange(set)) {
            setSplits = this.determineSetRange(set);
          } else {
            setSplits = this.determineSetSplits(set);
          }
          break;
        default:
          setSplits = this.determineSetSplits(set);
          break;
      }

      fullDescription += `⏱️ ${setNameForAverage} ${setAverage}${setSplits === `` ? "" : "\n"}${setSplits}\n\n`;
    }

    fullDescription += `Workout summary generated by workoutsplitz.com`;
    fullTitle = fullTitle.slice(0, -3);

    return {
      "title": fullTitle,
      "description": fullDescription,
    };
  }
}

module.exports = {
  Formatter,
};
