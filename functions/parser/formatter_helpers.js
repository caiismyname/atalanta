class FormatPrinter {
  constructor(paceUnits, sub90SecFormat) {
    this.paceUnits = paceUnits;
    this.sub90SecFormat = sub90SecFormat;
    this.sixMinMileAsSpeed = 4.47;
  }

  //
  // Running time/dist. helpers
  //

  // eslint-disable-next-line no-unused-vars
  metersToMiles(meters) {
    return meters * 0.000621371;
  }

  // eslint-disable-next-line no-unused-vars
  metersToMilesRounded(meters) {
    const res = Math.round(this.metersToMiles(meters) * 10) / 10;
    if (res % 1 === 0) {
      return Math.round(res); // Cut off the `.0` if it's a whole number
    } else {
      return res;
    }
  }

  milesToMeters(miles) {
    return miles * 1609.34;
  }

  // eslint-disable-next-line no-unused-vars
  secondsToMinutes(seconds) {
    if (seconds % 60 === 30) { // half minute
      return Math.round((seconds - 30) / 60) + 0.5;
    } else {
      return Math.round(seconds / 60);
    }
  }

  // eslint-disable-next-line no-unused-vars
  secondsPerMile(lap) {
    const distanceMiles = this.metersToMiles(lap.distance);
    const secondsPerMile = lap.moving_time / distanceMiles;

    return secondsPerMile;
  }

  // eslint-disable-next-line no-unused-vars
  secondsPerKilometer(lap) {
    const secondsPerKilometer = lap.moving_time / (lap.distance / 1000.0); // lap distance is in meters

    return secondsPerKilometer;
  }

  // eslint-disable-next-line no-unused-vars
  secondsFormatter(input, shouldRound) {
    let rounded;

    if (shouldRound) {
      rounded = Math.round(input);
    } else {
      rounded = input.toFixed(1);
    }


    if (rounded === 0) {
      return {
        seconds: "00",
        minuteDiff: 0,
      };
    } else if (rounded < 10) {
      return {
        seconds: `0${rounded}`,
        minuteDiff: 0,
      };
    } else if (rounded === 60) {
      return {
        seconds: "00",
        minuteDiff: 1,
      };
    }

    return {
      seconds: rounded,
      minuteDiff: 0,
    };
  }

  // eslint-disable-next-line no-unused-vars
  secondsToTimeFormatted(seconds, displayWholeMinutes = false, roundSeconds = true) {
    const secondsCutoff = 90;
    const minutes = Math.floor(seconds / 60);
    const secondsRes = this.secondsFormatter(seconds % 60, roundSeconds); // shouldRound defaults to true b/c strava doesn't give decimals for laps

    // First check if we want to format as only seconds
    if (seconds <= secondsCutoff && this.sub90SecFormat === "SECONDS") {
      return `${(minutes * 60) + Number.parseFloat(secondsRes.seconds)}${displayWholeMinutes ? " sec" : ""}`;
    }

    if (minutes + secondsRes.minuteDiff === 0) {
      return `${secondsRes.seconds}${displayWholeMinutes ? " sec" : ""}`;
    } else {
      if (secondsRes.seconds === "00" && displayWholeMinutes) {
        return `${minutes} min${minutes === 1 ? "" : "s"}`;
      } else {
        return `${minutes + secondsRes.minuteDiff}:${secondsRes.seconds}`;
      }
    }
  }

  // eslint-disable-next-line no-unused-vars
  averagePaceOfSet(set) {
    const totalTime = set.laps.reduce((a, b) => a + b.moving_time, 0.0);
    const totalDistance = set.laps.reduce((a, b) => a + b.distance, 0.0);

    if (this.paceUnits === "KM") {
      return this.pacePerKilometerFormatted({"distance": totalDistance, "moving_time": totalTime});
    } else if (this.paceUnits === "MILE") {
      return this.pacePerMileFormatted({"distance": totalDistance, "moving_time": totalTime});
    }
  }

  //
  // Printing helpers
  //

  // eslint-disable-next-line no-unused-vars
  pacePerMileFormatted(lap) {
    return `${this.secondsToTimeFormatted(this.secondsPerMile(lap))}/mi`;
  }

  // eslint-disable-next-line no-unused-vars
  pacePerKilometerFormatted(lap) {
    return `${this.secondsToTimeFormatted(this.secondsPerKilometer(lap))}/km`;
  }

  // eslint-disable-next-line no-unused-vars
  lapPaceFormatted(lap) {
    if (this.paceUnits === "KM") {
      return this.pacePerKilometerFormatted(lap);
    } else if (this.paceUnits === "MILE") {
      return this.pacePerMileFormatted(lap);
    } else {
      return ``;
    }
  }

  // eslint-disable-next-line no-unused-vars
  averageTimeOfSetFormatted(set) {
    const averageSeconds = set.laps.reduce((a, b) => a + b.moving_time, 0.0) / set.laps.length;
    return this.secondsToTimeFormatted(averageSeconds, false, false); // second false is "roundSeconds", which we shouldn't do b/c the average is likely a decimal
  }

  // eslint-disable-next-line no-unused-vars
  averageDistanceOfSetFormatted(set) {
    const averageDistance = set.laps.reduce((a, b) => a + b.distance, 0) / set.laps.length;
    const roundedMiles = this.metersToMiles(averageDistance).toFixed(2);

    return roundedMiles;
  }

  setTimeRangeFormatted(set) {
    let laps = set.laps;

    if (laps.length === 1) {
      if ("component_laps" in laps[0]) {
        laps = laps[0].component_laps;
      } else {
        return this.secondsToTimeFormatted(set.laps[0].moving_time);
      }
    }

    let min = 99999999999;
    let max = 0;

    for (const lap of laps) {
      min = Math.min(lap.moving_time, min);
      max = Math.max(lap.moving_time, max);
    }

    return `${this.secondsToTimeFormatted(min)} — ${this.secondsToTimeFormatted(max)}`;
  }

  setPaceRangeFormatted(set) {
    const laps = set.laps;

    if (laps.length === 1) {
      if ("component_laps" in laps[0]) {
        // If we're iterating over components of a single-lap set, treat as a time range.
        return this.setTimeRangeFormatted(set);
      } else {
        return this.lapPaceFormatted(set.laps[0]);
      }
    }

    let min = 99999999999;
    let max = 0;

    if (this.paceUnits === "MILE") {
      for (const lap of laps) {
        min = Math.min(this.secondsPerMile(lap), min);
        max = Math.max(this.secondsPerMile(lap), max);
      }
    } else if (this.paceUnits === "KM") {
      for (const lap of laps) {
        min = Math.min(this.secondsPerKilometer(lap), min);
        max = Math.max(this.secondsPerKilometer(lap), max);
      }
    }

    const paceUnitAbbrv = this.paceUnits === "KM" ? "/km" : "/mi";

    return `${this.secondsToTimeFormatted(min)}${paceUnitAbbrv} — ${this.secondsToTimeFormatted(max)}${paceUnitAbbrv}`;
  }

  setDistanceRangeFormatted(set) {

  }

  // eslint-disable-next-line no-unused-vars
  indented(input, indentLevel = 1) {
    return `${"  ".repeat(indentLevel)}${input}\n`;
  }
}

module.exports = {FormatPrinter};
