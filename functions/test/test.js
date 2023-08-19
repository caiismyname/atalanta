const assert = require("assert");
const {parseWorkout} = require("../parser/parser.js");
const {Formatter} = require("../parser/formatter.js");
const {FormatPrinter} = require("../parser/format_printer.js");
const {defaultParserConfig, defaultFormatConfig} = require("../parser/defaultConfigs.js");
const {generateAndReturnWorkout} = require("./generateFakeWorkout.js");

const defaultTestRuns = require("./test_runs.json");
const userTestRuns = require("./user_test_runs.json");

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
        formatConfig.detailsLength = "CONDENSED";
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
        formatConfig.detailsLength = "CONDENSED";
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
        formatConfig.detailsLength = "CONDENSED";
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
        formatConfig.detailsLength = "CONDENSED";
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
        formatConfig.detailsLength = "CONDENSED";
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
        formatConfig.detailsLength = "CONDENSED";
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
        assert.equal(countOccurances(":", splits), 0);
      });

      it("4 x 400m condensed (seconds)", () => {
        resetConfigs();

        const run = testRuns["4 x 400m"];
        formatConfig.detailsLength = "CONDENSED";
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
        formatConfig.detailsLength = "CONDENSED";
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
        formatConfig.detailsLength = "CONDENSED";
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
        formatConfig.detailsStructure = "RANGE";
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
        formatConfig.detailsStructure = "RANGE";
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
        assert.equal(countOccurances("/mi", splits), 1); // We should only place the `/mi` on the second time
      });

      it("4 x 2mi range (time)", () => {
        resetConfigs();

        const run = testRuns["4 x 2mi"];
        formatConfig.detailsStructure = "RANGE";
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
        formatConfig.detailsStructure = "RANGE";
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
        formatConfig.detailsStructure = "RANGE";
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
        formatConfig.detailsStructure = "RANGE";
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
        formatConfig.detailsStructure = "RANGE";
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
        assert.equal(countOccurances("/mi", splits), 1);
      });

      it("Condensed range (paces)", () => {
        resetConfigs();

        const run = testRuns["4 x 2mi"];
        formatConfig.detailsStructure = "RANGE";
        formatConfig.detailsLength = "CONDENSED";
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
        assert.equal(countOccurances(":", splits), 1);
        assert.equal(countOccurances("—", splits), 1);
        assert.ok(outputIsPace(splits));
        assert.equal(countOccurances("/mi", splits), 1);
      });

      it("Condensed range (seconds)", () => {
        resetConfigs();

        const run = testRuns["4 x 400m"];
        formatConfig.detailsStructure = "RANGE";
        formatConfig.detailsLength = "CONDENSED";
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
        assert.equal(countOccurances("—", splits), 1);
        // TODO outputIsSeconds
      });

      it("Heterogenous sets shouldn't use range", () => {
        resetConfigs();

        let run = testRuns["4 x (400m, 200m, 100m)"];
        formatConfig.detailsStructure = "RANGE";
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
            formatConfig.detailsStructure = "RANGE";
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
            formatConfig.detailsStructure = "RANGE";

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
    }

    const seconds = [15, 30, 45];
    const minutes = [90, 150, 210, 270];
    for (let i = 1; i <= 15; i++) {
      minutes.push(i * 60);
    }

    resetConfigs();
    const printer = new FormatPrinter(formatConfig);

    // Values that should parse consistently regardless of config
    for (const dominentWorkoutType of dominentWorkoutTypes) {
      describe(`${dominentWorkoutType}`, () => {
        for (const distance of meters) {
          it(`${distance}m`, () => {
            resetConfigs();

            parserConfig.dominantWorkoutType = dominentWorkoutType;
            const run = generateAndReturnWorkout([[distance, "METERS", true]]);

            const res = parseWorkout({
              run: run,
              config: {
                parser: parserConfig,
                format: formatConfig,
              },
              returnSets: true,
              verbose: false,
            });

            const tokenLap = res.sets[0].laps[0];

            assert.equal(tokenLap.workoutBasis, "DISTANCE");
            assert.equal(tokenLap.closestDistanceUnit, "m");
          });
        }

        for (const distance of kilometers) {
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
        }

        for (const distance of miles) {
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
        }

        for (const time of seconds) {
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
        }

        for (const time of minutes) {
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
        }
      });
    }

    describe("IRL Examples of Incorrect Basis", () => {
      it("800m misparsed as 3min", () => {
        resetConfigs();

        const run = userTestRuns["incorrect_basis"]["3min_vs_800m"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.ok(res.summary.title.includes("800m"));
        assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
      });

      it("400m misparsed as 69sec", () => {
        resetConfigs();

        parserConfig.dominantWorkoutType = "DISTANCE";

        const run = userTestRuns["incorrect_basis"]["69sec_vs_400m"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(res.sets.length, 3);
        const targetSet = res.sets[1];
        assert.equal(targetSet.laps[0].workoutBasis, "DISTANCE");
        assert.equal(targetSet.laps[0].closestDistance, 400);
        assert.equal(targetSet.laps[0].closestDistanceUnit, "m");
      });

      it("2mi misparsed as 12min", () => {
        resetConfigs();

        const run = userTestRuns["incorrect_basis"]["2mi_vs_12min"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const targetLap = res.sets[0].laps[0];
        assert.equal(targetLap.workoutBasis, "DISTANCE");
        assert.equal(targetLap.closestDistance, "2");
        assert.equal(targetLap.closestDistanceUnit, "mi");
      });
    });

    describe("IRL Examples of Incorrect Value", () => {
      it("2km misparsed as 1.5mi", () => {
        resetConfigs();

        const run = userTestRuns["incorrect_basis"]["2km_vs_1.5mi"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const targetLaps = res.sets[0].laps;
        for (const lap of targetLaps) {
          assert.equal(lap.workoutBasis, "DISTANCE");
          assert.equal(lap.closestDistance, 2);
          assert.equal(lap.closestDistanceUnit, "km");
        }
      });
    });
  });

  describe("WORKOUT TYPE TAGGING", () => {
    it("Greater than 50%, descending", () => {
      resetConfigs();
      const inputDistances = [10000, 5000, 1609, 800, 500, 300, 200, 100]; // Descending to ensure we're properly sorting
      const laps = [];
      for (const distance of inputDistances) {
        laps.push([distance, "METERS", true]);
        laps.push([distance, "METERS", false]);
      }

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

    it("Greater than 50%, non-sequential multiples", () => {
      resetConfigs();
      const inputDistances = [10000, 5000, 1609, 800, 500, 300, 200, 10000, 100, 5000, 1609, 500, 800, 300, 200, 100]; // Should all be parsed as singles
      const laps = [];
      for (const distance of inputDistances) {
        laps.push([distance, "METERS", true]);
        laps.push([distance, "METERS", false]);
      }

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
      const inputDistances = [100, 400, 1609, 10000];
      const laps = [];
      const repeatCount = 3;
      for (const distance of inputDistances) {
        for (let i = 0; i < repeatCount; i++) {
          laps.push([distance, "METERS", true]);
          laps.push([distance, "METERS", false]);
        }
      }

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
      assert.equal(res.sets[0].laps.length, repeatCount);
    });
  });

  describe("IS LAP A WORKOUT LAP TAGGING", () => {
    it("8x3min", () => {
      resetConfigs();

      const run = userTestRuns["workout_lap_tagger"]["8x3min"];
      const res = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      });

      assert.equal(res.sets.length, 1);

      assert.equal(res.sets[0].count, 8);
      assert.equal(res.sets[0].laps[0].workoutBasis, "TIME");
      assert.equal(res.sets[0].laps[0].closestTime, 180);
    });

    it("2mi", () => {
      resetConfigs();

      const run = userTestRuns["workout_lap_tagger"]["2mi"];
      const res = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      });


      assert.equal(res.sets.length, 1);

      assert.equal(res.sets[0].count, 1);
      assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
      assert.equal(res.sets[0].laps[0].closestDistance, 2);
      assert.equal(res.sets[0].laps[0].closestDistanceUnit, "mi");

      // Incorrectly added a nonworkout 0.21mi lap into the 2mi set
      assert.equal(res.sets[0].laps[0].component_laps.length, 2);
      assert.equal(res.sets[0].laps[0].component_laps[0].distance, 1609.34);
      assert.equal(res.sets[0].laps[0].component_laps[1].distance, 1609.34);
    });

    it("8x800m", () => {
      resetConfigs();

      const run = userTestRuns["workout_lap_tagger"]["8x800m"];
      const res = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      });

      // console.log(res.summary);

      assert.equal(res.sets.length, 1);

      // Incorrectly missed the first workout rep
      assert.equal(res.sets[0].count, 8);
      assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
      assert.equal(res.sets[0].laps[0].closestDistance, 800);
      assert.equal(res.sets[0].laps[0].closestDistanceUnit, "m");
    });

    it("6x200m", () => {
      resetConfigs();

      const run = userTestRuns["workout_lap_tagger"]["6x200m"];
      const res = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      });

      // console.log(res.summary);

      // Incorrectly tagged a 5k in the beginning as warmup
      assert.equal(res.sets.length, 1);

      assert.equal(res.sets[0].count, 6);
      assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
      assert.equal(res.sets[0].laps[0].closestDistance, 200);
      assert.equal(res.sets[0].laps[0].closestDistanceUnit, "m");
    });

    it("6x1km_2x300m", () => {
      resetConfigs();

      const run = userTestRuns["workout_lap_tagger"]["6x1km_2x300m"];
      const res = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      });

      // Incorrectly tagged 2mi in the beginning and 1mi at the end
      assert.equal(res.sets.length, 2);

      assert.equal(res.sets[0].count, 6);
      assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
      assert.equal(res.sets[0].laps[0].closestDistance, 1);
      assert.equal(res.sets[0].laps[0].closestDistanceUnit, "km");

      assert.equal(res.sets[1].count, 2);
      assert.equal(res.sets[1].laps[0].workoutBasis, "DISTANCE");
      assert.equal(res.sets[1].laps[0].closestDistance, 300);
      assert.equal(res.sets[1].laps[0].closestDistanceUnit, "m");
    });
  });

  describe("TRACK AUTOLAP CORRECTION", () => {
    it("Track correction IRL 1", () => {
      resetConfigs();

      const run = userTestRuns["track_correction"]["1"];
      const res = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      });

      // Error is that the first set (1mi) had an extra split from the component
      assert.ok(!("component_laps" in res.sets[0].laps[0]));
      assert.equal(countOccurances(",", res.summary.description.split("\n")[0]), 0);
      assert.ok(res.sets[0].laps.reduce((a, b) => a && !("component_laps" in b), true)); // No rep has component laps
    });

    it("Track correction generated 2 — continuous 5k (km)", () => {
      resetConfigs();

      const run = userTestRuns["track_correction"]["2"];
      const res = parseWorkout({
        run: run,
        config: {
          parser: parserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      });

      assert.equal(res.sets[0].laps[0].component_laps.length, 5);
      assert.equal(countOccurances(",", res.summary.description.split("\n")[1]), 4);
      assert.ok(res.summary.description.split("\n")[1].split(",").reduce((a, b) => a && b.includes(":"), true)); // Ensure every element has a ":", imply there are no seconds, which means we didn't display any correction components
    });

    it("Track correction generated 3 — 5 x 1mi (mile)", () => {
      resetConfigs();
      const errorMargin = 0.038;

      const laps = [];
      for (let i = 0; i < 5; i++) {
        laps.push([1609.3, "METERS", true]);
        laps.push([1609.3 * errorMargin, "METERS", true]);
        laps.push([157, "METERS", false]);
      }
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

      assert.equal(res.sets.length, 1);
      assert.equal(countOccurances(",", res.summary.description.split("\n")[1]), 4);
      assert.ok(res.summary.description.split("\n")[1].split(",").reduce((a, b) => a && b.includes(":"), true));
      assert.ok(res.sets[0].laps.reduce((a, b) => a && !("component_laps" in b), true)); // No rep has component laps
    });
  });

  describe("IRL WORKOUTS", () => {
    describe("Known-good workouts", () => {
      it("2mi_8x300", () => {
        resetConfigs();

        const run = userTestRuns["known_good"]["2mi_8x300"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(res.sets.length, 2);

        assert.equal(res.sets[0].count, 1);
        assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[0].laps[0].closestDistance, 2);
        assert.equal(res.sets[0].laps[0].closestDistanceUnit, "mi");

        assert.equal(res.sets[1].count, 8);
        assert.equal(res.sets[1].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[1].laps[0].closestDistance, 300);
        assert.equal(res.sets[1].laps[0].closestDistanceUnit, "m");
      });

      it("4mi_with_long_warmup", () => {
        resetConfigs();

        const run = userTestRuns["known_good"]["4mi_with_long_warmup"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(res.sets.length, 1);

        assert.equal(res.sets[0].count, 1);
        assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[0].laps[0].closestDistance, 4);
        assert.equal(res.sets[0].laps[0].closestDistanceUnit, "mi");
      });

      it("10x_alternating_miles", () => {
        resetConfigs();

        const run = userTestRuns["known_good"]["10x_alternating_miles"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(res.sets.length, 1);

        assert.equal(res.sets[0].count, 10);
        assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[0].laps[0].closestDistance, 1);
        assert.equal(res.sets[0].laps[0].closestDistanceUnit, "mi");
      });

      it("3x2mi", () => {
        resetConfigs();
        const run = userTestRuns["known_good"]["3x2mi"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(res.sets.length, 1);

        assert.equal(res.sets[0].count, 3);
        assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[0].laps[0].closestDistance, 2);
        assert.equal(res.sets[0].laps[0].closestDistanceUnit, "mi");
      });

      it("10x1km", () => {
        resetConfigs();
        const run = userTestRuns["known_good"]["10x1km"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(res.sets.length, 1);

        assert.equal(res.sets[0].count, 10);
        assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[0].laps[0].closestDistance, 1);
        assert.equal(res.sets[0].laps[0].closestDistanceUnit, "km");
      });

      it("4x1.5mi", () => {
        resetConfigs();
        const run = userTestRuns["known_good"]["4x1.5mi"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(res.sets.length, 1);

        assert.equal(res.sets[0].count, 4);
        assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[0].laps[0].closestDistance, 1.5);
        assert.equal(res.sets[0].laps[0].closestDistanceUnit, "mi");
      });

      it("10x800m", () => {
        resetConfigs();
        const run = userTestRuns["known_good"]["10x800m"];

        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(res.sets.length, 1);

        assert.equal(res.sets[0].count, 10);
        assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[0].laps[0].closestDistance, 800);
        assert.equal(res.sets[0].laps[0].closestDistanceUnit, "m");
      });

      it("6x1km_3x400m", () => {
        resetConfigs();
        const run = userTestRuns["known_good"]["6x1km_3x400m"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(res.sets.length, 2);

        assert.equal(res.sets[0].count, 6);
        assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[0].laps[0].closestDistance, 1);
        assert.equal(res.sets[0].laps[0].closestDistanceUnit, "km");

        assert.equal(res.sets[1].count, 3);
        assert.equal(res.sets[1].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[1].laps[0].closestDistance, 400);
        assert.equal(res.sets[1].laps[0].closestDistanceUnit, "m");
      });

      it("6x1mi_6x200m", () => {
        resetConfigs();
        const run = userTestRuns["known_good"]["6x1mi_6x200m"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(res.sets.length, 2);

        assert.equal(res.sets[0].count, 6);
        assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[0].laps[0].closestDistance, 1);
        assert.equal(res.sets[0].laps[0].closestDistanceUnit, "mi");

        assert.equal(res.sets[1].count, 6);
        assert.equal(res.sets[1].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[1].laps[0].closestDistance, 200);
        assert.equal(res.sets[1].laps[0].closestDistanceUnit, "m");
      });

      it("3mi_3x1mi_3mi", () => {
        resetConfigs();
        const run = userTestRuns["known_good"]["3mi_3x1mi_3mi"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(res.sets.length, 3);

        assert.equal(res.sets[0].count, 1);
        assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[0].laps[0].closestDistance, 3);
        assert.equal(res.sets[0].laps[0].closestDistanceUnit, "mi");

        assert.equal(res.sets[1].count, 3);
        assert.equal(res.sets[1].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[1].laps[0].closestDistance, 1);
        assert.equal(res.sets[1].laps[0].closestDistanceUnit, "mi");

        assert.equal(res.sets[2].count, 1);
        assert.equal(res.sets[2].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[2].laps[0].closestDistance, 3);
        assert.equal(res.sets[2].laps[0].closestDistanceUnit, "mi");
      });

      it("4mi_3x1mi_4mi", () => {
        resetConfigs();
        const run = userTestRuns["known_good"]["4mi_3x1mi_4mi"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(res.sets.length, 3);

        assert.equal(res.sets[0].count, 1);
        assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[0].laps[0].closestDistance, 4);
        assert.equal(res.sets[0].laps[0].closestDistanceUnit, "mi");

        assert.equal(res.sets[1].count, 3);
        assert.equal(res.sets[1].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[1].laps[0].closestDistance, 1);
        assert.equal(res.sets[1].laps[0].closestDistanceUnit, "mi");

        assert.equal(res.sets[2].count, 1);
        assert.equal(res.sets[2].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[2].laps[0].closestDistance, 4);
        assert.equal(res.sets[2].laps[0].closestDistanceUnit, "mi");
      });

      it("2x(1000,800,400)", () => {
        resetConfigs();
        const run = userTestRuns["known_good"]["2x(1000,800,400)"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        // assert.equal(res.sets.length, 1);

        assert.equal(res.sets[0].count, 2);
        assert.equal(String(res.sets[0].pattern), String([2, 1, 0])); // Dunno why the list equality doesn't pass
        assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[0].laps[0].closestDistance, 1);
        assert.equal(res.sets[0].laps[0].closestDistanceUnit, "km");
        assert.equal(res.sets[0].laps[1].workoutBasis, "DISTANCE");
        assert.equal(res.sets[0].laps[1].closestDistance, 800);
        assert.equal(res.sets[0].laps[1].closestDistanceUnit, "m");
        assert.equal(res.sets[0].laps[2].workoutBasis, "DISTANCE");
        assert.equal(res.sets[0].laps[2].closestDistance, 400);
        assert.equal(res.sets[0].laps[2].closestDistanceUnit, "m");
      });

      it("7x5min", () => {
        resetConfigs();
        const run = userTestRuns["known_good"]["7x5min"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(res.sets.length, 1);

        assert.equal(res.sets[0].count, 7);
        assert.equal(res.sets[0].laps[0].workoutBasis, "TIME");
        assert.equal(res.sets[0].laps[0].closestTime, 300);
      });

      it("2x(1,2,3,2,1min)", () => {
        resetConfigs();
        const run = userTestRuns["known_good"]["2x(1,2,3,2,1min)"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(res.sets.length, 1);

        assert.equal(res.sets[0].count, 2);
        assert.equal(String(res.sets[0].pattern), String([0, 1, 2, 1, 0])); // Dunno why the list equality doesn't pass
        assert.equal(res.sets[0].laps[0].workoutBasis, "TIME");
        assert.equal(res.sets[0].laps[0].closestTime, 60);
        assert.equal(res.sets[0].laps[1].workoutBasis, "TIME");
        assert.equal(res.sets[0].laps[1].closestTime, 120);
        assert.equal(res.sets[0].laps[2].workoutBasis, "TIME");
        assert.equal(res.sets[0].laps[2].closestTime, 180);
        assert.equal(res.sets[0].laps[3].workoutBasis, "TIME");
        assert.equal(res.sets[0].laps[3].closestTime, 120);
        assert.equal(res.sets[0].laps[4].workoutBasis, "TIME");
        assert.equal(res.sets[0].laps[4].closestTime, 60);
      });

      it("16x400m", () => {
        resetConfigs();

        const run = userTestRuns["known_good"]["16x400m"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(res.sets.length, 1);
        assert.equal(res.sets[0].count, 16);
        assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[0].laps[0].closestDistance, 400);
        assert.equal(res.sets[0].laps[0].closestDistanceUnit, "m");
      });
    });


    describe("Basis tagging", () => {
      it("Vicente 15/30 second sprints", () => {
        resetConfigs();

        const run = userTestRuns["pattern_reducer"]["vicente_1"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        const intervals = res.sets[1];

        // Should be 4 x (15sec, 30sec)
        assert.equal(intervals.pattern.length, 2);
        assert.equal(intervals.count, 4);
      });

      it("Moderately fast warmup lap combined into workout to make 6x1k misparse as 1mi + 5x1k", () => {
        resetConfigs();

        const run = userTestRuns["workout_lap_tagger"]["6x1k"];
        const res = parseWorkout({
          run: run,
          config: {
            parser: parserConfig,
            format: formatConfig,
          },
          returnSets: true,
          verbose: false,
        });

        assert.equal(res.sets.length, 1);
        assert.equal(res.sets[0].count, 6);
        assert.equal(res.sets[0].laps[0].workoutBasis, "DISTANCE");
        assert.equal(res.sets[0].laps[0].closestDistance, 1);
        assert.equal(res.sets[0].laps[0].closestDistanceUnit, "km");
      });
    });
  });

  describe("FALSE POSITIVES", () => {

  });
});
