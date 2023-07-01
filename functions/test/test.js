const assert = require("assert");
const {parseWorkout, determineRunIsWorkout, mergeAbutingLaps, tagWorkoutLaps, tagWorkoutTypes, tagWorkoutBasisAndValue} = require("../parser/parser.js");
const {Formatter} = require("../parser/formatter.js");
const {FormatPrinter} = require("../parser/format_printer.js");
const {defaultParserConfig, defaultFormatConfig} = require("../parser/defaultConfigs.js");
const {generateAndReturnWorkout} = require("./generateFakeWorkout.js");

const defaultTestRuns = require("./test_runs.json");

// Set these as global
let parserConfig = {...defaultParserConfig};
let formatConfig = {...defaultFormatConfig};
let testRuns = JSON.parse(JSON.stringify(defaultTestRuns));


// Call this at the start of every test to reset the configs back to defaults.
// Then modify individual settings as needed on the global vars (not the default ones)
function resetConfigs() {
  parserConfig = {...defaultParserConfig};
  formatConfig = {...defaultFormatConfig};
  testRuns = JSON.parse(JSON.stringify(defaultTestRuns));
}

function outputIsTime(output) {
  return output.includes(":") && !output.includes("/km") && !output.includes("/mi");
}

function outputIsPace(output) {
  return output.includes("/mi") || output.includes("/km");
}

function countOccurances(search, whole) {
  let count = 0;
  let lastSeen = -2;

  while (lastSeen !== -1) {
    lastSeen = whole.indexOf(search);
    if (lastSeen !== -1 ) {
      count += 1;
      whole = whole.slice(lastSeen + 1);
    }
  }

  return (count);
}

function shuffleList(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

describe("Formatter", () => {
  describe("SET NAMING", () => {
    describe("Distance Intervals", () => {
      it("Basic Interval — 4 x 1mi", () => {
        resetConfigs();
        const run = testRuns["4 x 1mi"];
        const title = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: false,
          verbose: false,
        }).summary.title;

        assert.equal(title, "4 x 1mi");
      });

      it("Two Intervals — (4 x 1mi) + (4 x 400m)", () => {
        resetConfigs();
        const run = testRuns["(4 x 1mi) + (4 x 400m)"];
        const title = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: false,
          verbose: false,
        }).summary.title;

        assert.equal(title, "(4 x 1mi) + (4 x 400m)");
      });

      it("Heterogeneous Intervals — 4 x (400m, 200m, 100m)", () => {
        resetConfigs();
        const run = testRuns["4 x (400m, 200m, 100m)"];
        const title = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: false,
          verbose: false,
        }).summary.title;

        assert.equal(title, "4 x (400m, 200m, 100m)");
      });

      it("Heterogeneous Intervals with Tempo — (4 x (400m, 200m, 100m)) + 4mi", () => {
        resetConfigs();
        const run = testRuns["(4 x (400m, 200m, 100m)) + 4mi"];
        const title = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: false,
          verbose: false,
        }).summary.title;

        assert.equal(title, "(4 x (400m, 200m, 100m)) + 4mi");
      });
    });

    describe("Fartleks", () => {
      it("Sub 90sec — 10 x 1:15", () => {
        resetConfigs();
        const run = testRuns["10 x 75sec"];
        const title = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: false,
          verbose: false,
        }).summary.title;

        assert.equal(title, "10 x 1:15");
      });

      it("Greater than 90sec — 4 x 2:30", () => {
        resetConfigs();
        const run = testRuns["4 x 2:30"];
        const title = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: false,
          verbose: false,
        }).summary.title;

        assert.equal(title, "4 x 2:30");
      });

      it("Whole minute value — 4 x 4 mins", () => {
        resetConfigs();
        const run = testRuns["4 x 4 mins"];
        const title = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: false,
          verbose: false,
        }).summary.title;

        assert.equal(title, "4 x 4 mins");
      });
    });
  });

  describe("AVERAGE FORMATTING", () => {
    it("Heterogeneous Intervals — No average", () => {
      resetConfigs();
      const run = testRuns["4 x (400m, 200m, 100m)"];
      const formatter = new Formatter(formatConfig);
      const sets = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      }).sets;

      assert.equal(formatter.determineSetAverage(sets[0]), "");
    });

    it("No splits for component laps — don't include 'Avg'", () => {
      resetConfigs();
      const run = testRuns["1 mile"];
      const formatter = new Formatter(formatConfig);
      const sets = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      }).sets;

      assert.ok(!formatter.determineSetAverage(sets[0]).includes("— Avg:"));
    });

    it("Show mile repeats as time, not pace", () => {
      resetConfigs();
      const run = testRuns["4 x 1mi"];

      formatConfig.paceUnits = "KM"; // ensure it's not using pace
      const formatter = new Formatter(formatConfig);
      const sets = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      }).sets;

      const averageOutput = formatter.determineSetAverage(sets[0]);
      assert.ok(outputIsTime(averageOutput));
      assert.equal(averageOutput, "— Avg: 5:21.5"); // Don't know how else to ensure it's using the mile value
    });

    it("Show km repeats as time, not pace", () => {
      resetConfigs();
      const run = testRuns["4 x 1km"];

      formatConfig.paceUnits = "MILE"; // ensure it's not using pace
      const formatter = new Formatter(formatConfig);
      const sets = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      }).sets;

      const averageOutput = formatter.determineSetAverage(sets[0]);
      assert.ok(outputIsTime(averageOutput));
      assert.equal(averageOutput, "— Avg: 3:23.8");
    });

    it("Show time for sub-mile distances with default config", () => {
      resetConfigs();
      const run = testRuns["4 x 400m"];
      const formatter = new Formatter(formatConfig);
      const sets = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      }).sets;

      const averageOutput = formatter.determineSetAverage(sets[0]);
      assert.ok(outputIsTime(averageOutput));
    });

    it("Show pace for sub-mile distances when config'd", () => {
      resetConfigs();
      const run = testRuns["4 x 400m"];

      formatConfig.subMileDistanceValue = "PACE";
      const formatter = new Formatter(formatConfig);
      const sets = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      }).sets;

      const averageOutput = formatter.determineSetAverage(sets[0]);
      assert.ok(outputIsPace(averageOutput));
      assert.ok(averageOutput.includes("/mi"));
    });

    it("Show pace for greater-than-mile distances (intervals) with default config", () => {
      resetConfigs();
      const run = {...testRuns["4 x 2mi"]};

      const formatter = new Formatter(formatConfig);
      const sets = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      }).sets;
      const averageOutput = formatter.determineSetAverage(sets[0]);

      assert.ok(outputIsPace(averageOutput));
      assert.ok(averageOutput.includes("/mi"));
      assert.equal(averageOutput, "— Avg: 5:32/mi");
    });

    it("Show time for greater-than-mile distances (intervals) when config'd", () => {
      resetConfigs();
      const run = testRuns["4 x 2mi"];

      formatConfig.greaterThanMileDistanceValue = "TIME";
      const formatter = new Formatter(formatConfig);
      const sets = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      }).sets;


      const averageOutput = formatter.determineSetAverage(sets[0]);
      assert.ok(outputIsTime(averageOutput));
      assert.ok(averageOutput.includes("— Avg: 11:0"));
    });

    it("Show pace for greater-than-mile distances (contineous) with default config", () => {
      resetConfigs();
      const run = testRuns["4mi"];
      const formatter = new Formatter(formatConfig);
      const res = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      });

      const averageOutput = formatter.determineSetAverage(res.sets[0]);

      assert.ok(outputIsPace(averageOutput));
      assert.ok(averageOutput.includes("5:30"));
    });

    it("Show time for greater-than-mile distances (contineous) when config'd", () => {
      resetConfigs();
      const run = testRuns["4mi"];
      formatConfig.greaterThanMileDistanceValue = "TIME";
      const formatter = new Formatter(formatConfig);
      const res = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      });

      const averageOutput = formatter.determineSetAverage(res.sets[0]);
      assert.ok(outputIsTime(averageOutput));
      assert.ok(averageOutput.includes("21:"));
    });
  });

  describe("SPLITS FORMATTING", () => {
    describe("Splits", () => {
      it("Single-split laps without components should not show splits", () => {
        resetConfigs();
        const run = testRuns["800m"];

        const formatter = new Formatter(formatConfig);
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(formatter.determineSetDetails(res.sets[0]), "");
      });

      it("Single-split laps with components should show splits", () => {
        resetConfigs();
        const run = testRuns["4mi"];

        const formatter = new Formatter(formatConfig);
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const splits = formatter.determineSetDetails(res.sets[0]);

        assert.notEqual(splits, "");
        assert.ok(countOccurances(", ", splits), 3);
      });

      it("Heterogeneous rep splits formatting", () => {
        resetConfigs();
        const run = testRuns["4 x (400m, 200m, 100m)"];

        const formatter = new Formatter(formatConfig);
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const splits = formatter.determineSetDetails(res.sets[0]);

        ["1.", "2.", "3.", "4."].forEach((x) => {
          assert.ok(splits.includes(x));
        });
        assert.ok(countOccurances("\n", splits), 3);
        assert.ok(splits.includes("1. 1:20, 42, 20\n"));
      });
    });


    describe("Seconds", () => {
      it("Default — minute:second", () => {
        resetConfigs();

        const run = testRuns["4 x 400m"];
        const formatter = new Formatter(formatConfig);
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const splits = formatter.determineSetSplits(res.sets[0]);
        assert.ok(splits.includes("1:"));
      });

      it("Seconds for times under 90", () => {
        resetConfigs();

        const run = testRuns["4 x 400m"];
        formatConfig.sub90SecFormat = "SECONDS";
        const formatter = new Formatter(formatConfig);
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const splits = formatter.determineSetSplits(res.sets[0]);
        assert.ok(!splits.includes("1:"));
        assert.ok(splits.includes(80));
      });

      it("Times over 90 are unaffected", () => {
        resetConfigs();

        let run = testRuns["4 x 2mi"];
        let formatter = new Formatter(formatConfig);
        const defaultRes = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const defaultSplits = formatter.determineSetSplits(defaultRes.sets[0]);

        resetConfigs();
        run = testRuns["4 x 2mi"];
        formatConfig.sub90SecFormat = "SECONDS";
        formatter = new Formatter(formatConfig);
        const secondsRes = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const secondsSplits = formatter.determineSetSplits(secondsRes.sets[0]);
        assert.equal(defaultSplits, secondsSplits);
      });
    });

    describe("Condensed", () => {
      it("4 x 2mi default (non-condensed)", () => {
        resetConfigs();

        let run = testRuns["4 x 2mi"];
        let formatter = new Formatter(formatConfig);
        const defaultRes = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const defaultSplits = formatter.determineSetSplits(defaultRes.sets[0]);

        resetConfigs();

        run = testRuns["4 x 2mi"];
        formatConfig.splitsFormat = "CONDENSED";
        formatter = new Formatter(formatConfig);
        const condensedRes = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const condensedSplits = formatter.determineSetSplits(condensedRes.sets[0]);

        assert.notEqual(condensedSplits, defaultSplits);
        assert.equal(countOccurances(":", defaultSplits), 4);
        assert.ok(outputIsPace(defaultSplits));
      });

      it("4 x 2mi condensed (paces)", () => {
        resetConfigs();

        const run = testRuns["4 x 2mi"];
        formatConfig.splitsFormat = "CONDENSED";
        const formatter = new Formatter(formatConfig);
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const splits = formatter.determineSetSplits(res.sets[0]);
        assert.equal(countOccurances(":", splits), 1);
        assert.ok(outputIsPace(splits));
      });

      it("4 x 2mi condensed (times)", () => {
        resetConfigs();

        const run = testRuns["4 x 2mi"];
        formatConfig.splitsFormat = "CONDENSED";
        formatConfig.greaterThanMileDistanceValue = "TIME";
        const formatter = new Formatter(formatConfig);
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const splits = formatter.determineSetSplits(res.sets[0]);
        assert.equal(countOccurances(":", splits), 3);
        assert.equal(splits, "11:08,00,10:47,11:22");
        assert.ok(outputIsTime(splits));
      });

      it("4 x 400m default (non-condensed)", () => {
        resetConfigs();

        let run = testRuns["4 x 400m"];
        let formatter = new Formatter(formatConfig);
        const defaultRes = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const defaultSplits = formatter.determineSetSplits(defaultRes.sets[0]);


        resetConfigs();

        run = testRuns["4 x 400m"];
        formatConfig.splitsFormat = "CONDENSED";
        formatter = new Formatter(formatConfig);
        const condensedRes = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const condensedSplits = formatter.determineSetSplits(condensedRes.sets[0]);

        assert.notEqual(defaultSplits, condensedSplits);
        assert.equal(countOccurances(":", defaultSplits), 4);
        assert.ok(outputIsTime(defaultSplits));
      });

      it("4 x 400m condensed", () => {
        resetConfigs();

        const run = testRuns["4 x 400m"];
        formatConfig.splitsFormat = "CONDENSED";
        const formatter = new Formatter(formatConfig);
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const splits = formatter.determineSetSplits(res.sets[0]);
        assert.equal(countOccurances(":", splits), 1);
        assert.ok(outputIsTime(splits));
      });

      it("4 x 400m condensed (seconds)", () => {
        resetConfigs();

        const run = testRuns["4 x 400m"];
        formatConfig.splitsFormat = "CONDENSED";
        formatConfig.sub90SecFormat = "SECONDS";
        const formatter = new Formatter(formatConfig);
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const splits = formatter.determineSetSplits(res.sets[0]);
        assert.equal(countOccurances(" ", splits), 0);
        assert.equal(splits, "86,84,80,85");
      });

      it("4 x 400m condensed (pace)", () => {
        resetConfigs();

        const run = testRuns["4 x 400m"];
        formatConfig.splitsFormat = "CONDENSED";
        formatConfig.subMileDistanceValue = "PACE";
        const formatter = new Formatter(formatConfig);
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const splits = formatter.determineSetSplits(res.sets[0]);
        assert.equal(countOccurances(":", splits), 1);
        assert.ok(outputIsPace(splits));
      });

      it("Heterogenous sets shouldn't condense", () => {
        resetConfigs();

        const run = testRuns["4 x (400m, 200m, 100m)"];
        formatConfig.splitsFormat = "CONDENSED";
        let formatter = new Formatter(formatConfig);
        const condensedRes = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const condensedSplits = formatter.determineSetSplits(condensedRes.sets[0]);


        // Compare it against the default config to show nothing's changed
        resetConfigs();
        formatter = new Formatter(formatConfig);
        const defaultRes = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const defaultSplits = formatter.determineSetSplits(defaultRes.sets[0]);

        assert.equal(defaultSplits, condensedSplits);

        // Other heuristics
        assert.equal(countOccurances(":", condensedSplits), 4);
        assert.equal(countOccurances(" ", condensedSplits), 12);
        assert.ok(outputIsTime(condensedSplits));
      });
    });

    describe("Ranges", () => {
      it("4 x 2mi default (splits, not ranges)", () => {
        resetConfigs();

        let run = testRuns["4 x 2mi"];
        let formatter = new Formatter(formatConfig);
        const defaultRes = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const defaultSplits = formatter.determineSetDetails(defaultRes.sets[0]);

        resetConfigs();
        run = testRuns["4 x 2mi"];
        formatConfig.detailsMode = "RANGE";
        formatter = new Formatter(formatConfig);
        const rangeRes = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const rangeSplits = formatter.determineSetDetails(rangeRes.sets[0]);

        assert.notEqual(rangeSplits, defaultSplits);
        assert.equal(countOccurances(":", defaultSplits), 4);
        assert.equal(countOccurances(", ", defaultSplits), 3);
        assert.equal(countOccurances("—", defaultSplits), 0);
        assert.ok(outputIsPace(defaultSplits));
      });

      it("4 x 2mi range (paces)", () => {
        resetConfigs();

        const run = testRuns["4 x 2mi"];
        formatConfig.detailsMode = "RANGE";
        const formatter = new Formatter(formatConfig);
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const splits = formatter.determineSetDetails(res.sets[0]);
        assert.equal(countOccurances(":", splits), 2);
        assert.equal(countOccurances("—", splits), 1);
        assert.ok(outputIsPace(splits));
      });

      it("4 x 2mi range (time)", () => {
        resetConfigs();

        const run = testRuns["4 x 2mi"];
        formatConfig.detailsMode = "RANGE";
        formatConfig.greaterThanMileDistanceValue = "TIME";
        const formatter = new Formatter(formatConfig);
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const splits = formatter.determineSetDetails(res.sets[0]);
        assert.equal(countOccurances(":", splits), 2);
        assert.equal(countOccurances("—", splits), 1);
        assert.ok(splits.includes("10"));
        assert.ok(splits.includes("11"));
        assert.ok(outputIsTime(splits));
      });

      it("4 x 400m default (splits, not ranges)", () => {
        resetConfigs();

        let run = testRuns["4 x 400m"];
        let formatter = new Formatter(formatConfig);
        const defaultRes = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const defaultSplits = formatter.determineSetDetails(defaultRes.sets[0]);

        resetConfigs();
        run = testRuns["4 x 400m"];
        formatConfig.detailsMode = "RANGE";
        formatter = new Formatter(formatConfig);
        const rangeRes = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const rangeSplits = formatter.determineSetDetails(rangeRes.sets[0]);

        assert.notEqual(rangeSplits, defaultSplits);
        assert.equal(countOccurances(":", defaultSplits), 4);
        assert.equal(countOccurances(", ", defaultSplits), 3);
        assert.equal(countOccurances("—", defaultSplits), 0);
        assert.ok(outputIsTime(defaultSplits));
      });

      it("4 x 400m range (times)", () => {
        resetConfigs();

        const run = testRuns["4 x 400m"];
        formatConfig.detailsMode = "RANGE";
        const formatter = new Formatter(formatConfig);
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const splits = formatter.determineSetDetails(res.sets[0]);

        assert.equal(countOccurances(":", splits), 2);
        assert.equal(countOccurances(", ", splits), 0);
        assert.equal(countOccurances("—", splits), 1);
        assert.ok(outputIsTime(splits));
      });

      it("4 x 400m range (times, seconds)", () => {
        resetConfigs();

        const run = testRuns["4 x 400m"];
        formatConfig.detailsMode = "RANGE";
        formatConfig.sub90SecFormat = "SECONDS";
        const formatter = new Formatter(formatConfig);
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const splits = formatter.determineSetDetails(res.sets[0]);

        assert.equal(countOccurances(":", splits), 0);
        assert.equal(countOccurances(", ", splits), 0);
        assert.equal(countOccurances("—", splits), 1);
      });

      it("4 x 400m range (paces)", () => {
        resetConfigs();

        const run = testRuns["4 x 400m"];
        formatConfig.detailsMode = "RANGE";
        formatConfig.subMileDistanceValue = "PACE";
        const formatter = new Formatter(formatConfig);
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const splits = formatter.determineSetDetails(res.sets[0]);

        assert.equal(countOccurances(":", splits), 2);
        assert.equal(countOccurances(", ", splits), 0);
        assert.equal(countOccurances("—", splits), 1);
        assert.ok(outputIsPace(splits));
      });

      it("Heterogenous sets shouldn't use range", () => {
        resetConfigs();

        let run = testRuns["4 x (400m, 200m, 100m)"];
        formatConfig.detailsMode = "RANGE";
        let formatter = new Formatter(formatConfig);
        const condensedRes = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const condensedSplits = formatter.determineSetSplits(condensedRes.sets[0]);


        // Compare it against the default config to show nothing's changed
        resetConfigs();
        run = testRuns["4 x (400m, 200m, 100m)"];
        formatter = new Formatter(formatConfig);
        const defaultRes = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const defaultSplits = formatter.determineSetSplits(defaultRes.sets[0]);

        assert.equal(defaultSplits, condensedSplits);

        // Other heuristics
        assert.equal(countOccurances(":", condensedSplits), 4);
        assert.equal(countOccurances(" ", condensedSplits), 12);
        assert.ok(outputIsTime(condensedSplits));
      });
    });
  });

  describe("DEFAULTS FALLTHROUGH", () => {
    const testRunNames = ["4 x 2mi", "4 x 400m", "(4 x (400m, 200m, 100m)) + 4mi", "4 x 2:30"];
    Object.keys(defaultFormatConfig).forEach((configOption) => {
      describe(`${configOption}`, () => {
        testRunNames.forEach((runName) => {
          it(`${runName}`, () => {
            resetConfigs();

            let run = testRuns[runName];
            const defaultRes = parseWorkout({
              run: run,
              config: {
                parser: parserConfig,
                format: formatConfig,
              },
              returnSets: true,
              verbose: false,
            });


            resetConfigs();
            run = testRuns[runName];
            delete formatConfig[configOption];

            const removeRes = parseWorkout({
              run: run,
              config: {
                parser: parserConfig,
                format: formatConfig,
              },
              returnSets: true,
              verbose: false,
            });

            assert.equal(defaultRes.summary.title, removeRes.summary.title);
            assert.equal(defaultRes.summary.description, removeRes.summary.description);
          });

          it(`${runName} — range`, () => {
            resetConfigs();

            let run = testRuns[runName];
            formatConfig.detailsMode = "RANGE";
            const defaultRes = parseWorkout({
              run: run,
              config: {
                parser: parserConfig,
                format: formatConfig,
              },
              returnSets: true,
              verbose: false,
            });


            resetConfigs();
            run = testRuns[runName];
            delete formatConfig[configOption];
            formatConfig.detailsMode = "RANGE";

            const removeRes = parseWorkout({
              run: run,
              config: {
                parser: parserConfig,
                format: formatConfig,
              },
              returnSets: true,
              verbose: false,
            });

            assert.equal(defaultRes.summary.title, removeRes.summary.title);
            assert.equal(defaultRes.summary.description, removeRes.summary.description);
          });
        });
      });
    });
  });
});


describe("Parser", () => {
  describe("DEFAULTS FALLTHROUGH", () => {
    it("dominantWorkoutType", () => {
      resetConfigs();

      let run = testRuns["4 x 2mi"];
      const defaultRes = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      });


      resetConfigs();
      run = testRuns["4 x 2mi"];
      delete parserConfig["dominantWorkoutType"];

      const removeRes = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      });

      assert.equal(defaultRes.summary.title, removeRes.summary.title);
      assert.equal(defaultRes.summary.description, removeRes.summary.description);
    });
  });

  describe("BASIS AND VALUE", () => {
    const dominentWorkoutTypes = ["BALANCED", "DISTANCE", "TIME"];
    const meters = [100, 200, 300, 400, 500, 600, 800, 1500];
    const kilometers = [1000, 2000, 3000, 5000, 10000];
    const miles = [];
    for (let i = 1; i <= 10; i++) {
      miles.push(i * 1609);
    };

    const seconds = [15, 30, 45];
    const minutes = [90, 150, 210, 270];
    for (let i = 1; i <= 15; i++) {
      minutes.push(i * 60);
    }

    resetConfigs();
    let printer = new FormatPrinter(formatConfig);

    // Values that should parse consistently regardless of config
    for (let dominentWorkoutType of dominentWorkoutTypes) {
      describe(`${dominentWorkoutType}`, () => {
        for (let distance of meters) {
          it(`${distance}m`, () => {
            resetConfigs();
            
            parserConfig.dominantWorkoutType = dominentWorkoutType;
            const run = generateAndReturnWorkout([[distance, "METERS", true]]);

            const sets = parseWorkout({
              run: run,
              config: {
                parser: parserConfig,
                format: formatConfig,
              },
              returnSets: true,
              verbose: false,
            }).sets;

            const tokenLap = sets[0].laps[0];

            assert.equal(tokenLap.workoutBasis, "DISTANCE");
            assert.equal(tokenLap.closestDistanceUnit, "m");
          });
        };

        for (let distance of kilometers) {
          it(`${distance}km`, () => {
            resetConfigs();
            
            parserConfig.dominantWorkoutType = dominentWorkoutType;
            const run = generateAndReturnWorkout([[distance, "METERS", true]]);

            const sets = parseWorkout({
              run: run,
              config: {
                parser: parserConfig,
                format: formatConfig,
              },
              returnSets: true,
              verbose: false,
            }).sets;

            const tokenLap = sets[0].laps[0];

            assert.equal(tokenLap.workoutBasis, "DISTANCE");
            assert.equal(tokenLap.closestDistanceUnit, "km");
          });
        };

        for (let distance of miles) {
          it(`${distance / 1609}mi`, () => {
            resetConfigs();
            
            parserConfig.dominantWorkoutType = dominentWorkoutType;
            const run = generateAndReturnWorkout([[distance, "METERS", true]]);

            const sets = parseWorkout({
              run: run,
              config: {
                parser: parserConfig,
                format: formatConfig,
              },
              returnSets: true,
              verbose: false,
            }).sets;

            const tokenLap = sets[0].laps[0];

            assert.equal(tokenLap.workoutBasis, "DISTANCE");
            assert.equal(tokenLap.closestDistanceUnit, "mi");
          });
        };

        for (let time of seconds) {
          it(`${printer.secondsToTimeFormatted(time)}sec`, () => {
            resetConfigs();
            
            parserConfig.dominantWorkoutType = dominentWorkoutType;
            const inputLaps = [];
            for (let i = 1; i < 5; i++) {
              inputLaps.push([time, "SECONDS", true]);
              inputLaps.push([time, "SECONDS", false]);
            }
            const run = generateAndReturnWorkout(inputLaps);

            const sets = parseWorkout({
              run: run,
              config: {
                parser: parserConfig,
                format: formatConfig,
              },
              returnSets: true,
              verbose: false,
            }).sets;

            const tokenLap = sets[0].laps[0];

            assert.equal(tokenLap.workoutBasis, "TIME");
          });
        };

        for (let time of minutes) {
          it(`${printer.secondsToTimeFormatted(time)} min`, () => {
            resetConfigs();
            
            parserConfig.dominantWorkoutType = dominentWorkoutType;
            const inputLaps = [];
            for (let i = 1; i < 5; i++) {
              inputLaps.push([time, "SECONDS", true]);
              inputLaps.push([time, "SECONDS", false]);
            }
            const run = generateAndReturnWorkout(inputLaps);

            const sets = parseWorkout({
              run: run,
              config: {
                parser: parserConfig,
                format: formatConfig,
              },
              returnSets: true,
              verbose: false,
            }).sets;

            const tokenLap = sets[0].laps[0];

            assert.equal(tokenLap.workoutBasis, "TIME");
          });
        };
      });
    }

    // Values that should parse differently depending on config

  });

  describe("WORKOUT TYPE TAGGING", () => {
    it("Greater than 50%, descending", () => {
      resetConfigs();
      const inputDistances = [10000, 5000, 1609, 800, 500, 300, 200, 100]; // Descending to ensure we're properly sorting
      const laps = [];
      for (let distance of inputDistances) {
        laps.push([distance, "METERS", true]);
        laps.push([distance, "METERS", false]);
      };

      const run = generateAndReturnWorkout(laps);
      const res = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      });
      console.log(res.summary.title);

      assert.equal(res.sets.length, inputDistances.length);
    });

    it("Greater than 50%, non-sequential multiples", () => {
      resetConfigs();
      let inputDistances = [10000, 5000, 1609, 800, 500, 300, 200, 10000, 100, 5000, 1609, 500, 800, 300, 200, 100]; // Should all be parsed as singles
      let laps = [];
      for (let distance of inputDistances) {
        laps.push([distance, "METERS", true]);
        laps.push([distance, "METERS", false]);
      };

      const run = generateAndReturnWorkout(laps);
      const res = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      });
      assert.equal(res.sets.length, inputDistances.length);
    });

    it("Greater than 50%, sequential multiples", () => {
      resetConfigs();
      let inputDistances = [100, 400, 1609, 10000];
      let laps = [];
      const repeatCount = 3;
      for (let distance of inputDistances) {
        for (i = 0; i < repeatCount; i++) {
          laps.push([distance, "METERS", true]);
          laps.push([distance, "METERS", false]);
        }
      };

      const run = generateAndReturnWorkout(laps);
      const res = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      });

      assert.equal(res.sets.length, inputDistances.length);
      assert.equal(res.sets[0].laps.length, repeatCount)
    });
  });
});
