const assert = require("assert");
const {parseWorkout} = require("../parser/parser.js");
const {Formatter} = require("../parser/formatter.js");
// const {FormatPrinter} = require("../parser/format_printer.js");
const {defaultParserConfig, defaultFormatConfig} = require("../parser/defaultConfigs.js");

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

describe("Formatter", () => {
  describe("Set Name Formatting", () => {
    describe("Intervals", () => {
      it("Basic Interval — 4 x 1mi", () => {
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

  describe("Average Formatting", () => {
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
});
