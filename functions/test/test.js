const assert = require("assert");
const {parseWorkout} = require("../parser/parser.js");
const Formatter = require("../parser/formatter.js");
const {FormatPrinter} = require("../parser/formatter_helpers.js");
const {defaultParserConfig, defaultFormatConfig} = require("../parser/defaultConfigs.js");

const testRuns = require("./test_runs.json");

function outputIsTime(output) {
  return output.includes(":") && !output.includes("/km") && !output.includes("/mi");
}

describe("Formatter", () => {
  describe("Set Naming", () => {
    describe("Intervals", () => {
      it("Basic Interval — 4 x 1mi", () => {
        const run = testRuns["4 x 1mi"];
        const sets = parseWorkout({
          run: run,
          config: {
            parser: defaultParserConfig,
            format: defaultFormatConfig,
          },
          returnSets: true,
          verbose: false,
        }).sets;

        assert.equal(Formatter.printSets(sets).title, "4 x 1mi");
      });

      it("Two Intervals — (4 x 1mi) + (4 x 400m)", () => {
        const run = testRuns["(4 x 1mi) + (4 x 400m)"];
        const sets = parseWorkout({
          run: run,
          config: {
            parser: defaultParserConfig,
            format: defaultFormatConfig,
          },
          returnSets: true,
          verbose: false,
        }).sets;

        assert.equal(Formatter.printSets(sets).title, "(4 x 1mi) + (4 x 400m)");
      });

      it("Heterogeneous Intervals — 4 x (400m, 200m, 100m)", () => {
        const run = testRuns["4 x (400m, 200m, 100m)"];
        const sets = parseWorkout({
          run: run,
          config: {
            parser: defaultParserConfig,
            format: defaultFormatConfig,
          },
          returnSets: true,
          verbose: false,
        }).sets;

        assert.equal(Formatter.printSets(sets).title, "4 x (400m, 200m, 100m)");
      });

      it("Heterogeneous Intervals with Tempo — (4 x (400m, 200m, 100m)) + 4mi", () => {
        const run = testRuns["(4 x (400m, 200m, 100m)) + 4mi"];
        const sets = parseWorkout({
          run: run,
          config: {
            parser: defaultParserConfig,
            format: defaultFormatConfig,
          },
          returnSets: true,
          verbose: false,
        }).sets;

        assert.equal(Formatter.printSets(sets).title, "(4 x (400m, 200m, 100m)) + 4mi");
      });
    });

    describe("Fartleks", () => {
      it("Sub 90sec — 10 x 1:15", () => {
        const run = testRuns["10 x 75sec"];
        const sets = parseWorkout({
          run: run,
          config: {
            parser: defaultParserConfig,
            format: defaultFormatConfig,
          },
          returnSets: true,
          verbose: false,
        }).sets;

        assert.equal(Formatter.printSets(sets).title, "10 x 1:15");
      });

      it("Greater than 90sec — 4 x 2:30", () => {
        const run = testRuns["4 x 2:30"];
        const sets = parseWorkout({
          run: run,
          config: {
            parser: defaultParserConfig,
            format: defaultFormatConfig,
          },
          returnSets: true,
          verbose: false,
        }).sets;

        assert.equal(Formatter.printSets(sets).title, "4 x 2:30");
      });

      it("Whole minute value — 4 x 4 mins", () => {
        const run = testRuns["4 x 4 mins"];
        const sets = parseWorkout({
          run: run,
          config: {
            parser: defaultParserConfig,
            format: defaultFormatConfig,
          },
          returnSets: true,
          verbose: false,
        }).sets;

        assert.equal(Formatter.printSets(sets).title, "4 x 4 mins");
      });
    });
  });

  describe("Average formatting", () => {
    it("Heterogeneous Intervals — No average", () => {
      const run = testRuns["4 x (400m, 200m, 100m)"];
      const sets = parseWorkout({
        run: run,
        config: {
          parser: defaultParserConfig,
          format: defaultFormatConfig,
        },
        returnSets: true,
        verbose: false,
      }).sets;

      assert.equal(Formatter.determineSetAverage(sets[0]), "");
    });

    it("No splits for component laps — don't include 'Avg'", () => {
      const run = testRuns["1 mile"];

      const formatPrinter = new FormatPrinter(defaultFormatConfig.paceUnits, defaultFormatConfig.sub90SecFormat);
      const sets = parseWorkout({
        run: run,
        config: {
          parser: defaultParserConfig,
          format: defaultFormatConfig,
        },
        returnSets: true,
        verbose: false,
      }).sets;

      assert.ok(!Formatter.determineSetAverage(sets[0], formatPrinter, defaultFormatConfig).includes("— Avg:"));
    });

    it("Show mile repeats as time, not pace", () => {
      const run = testRuns["4 x 1mi"];

      const formatConfig = {...defaultFormatConfig};
      formatConfig.paceUnits = "KM"; // ensure it's not using pace
      const formatPrinter = new FormatPrinter(formatConfig.paceUnits, formatConfig.sub90SecFormat);
      const sets = parseWorkout({
        run: run,
        config: {
          parser: defaultParserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      }).sets;

      const averageOutput = Formatter.determineSetAverage(sets[0], formatPrinter, formatConfig);
      assert.ok(outputIsTime(averageOutput));
      assert.equal(averageOutput, "— Avg: 5:21.5"); // Don't know how else to ensure it's using the mile value
    });

    it("Show km repeats as time, not pace", () => {
      const run = testRuns["4 x 1km"];

      const formatConfig = {...defaultFormatConfig};
      formatConfig.paceUnits = "MILE"; // ensure it's not using pace
      const formatPrinter = new FormatPrinter(formatConfig.paceUnits, formatConfig.sub90SecFormat);
      const sets = parseWorkout({
        run: run,
        config: {
          parser: defaultParserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      }).sets;

      const averageOutput = Formatter.determineSetAverage(sets[0], formatPrinter, formatConfig);
      assert.ok(outputIsTime(averageOutput));
      assert.equal(averageOutput, "— Avg: 3:23.8");
    });

    it("Show time for sub-mile distances with default config", () => {
      const run = testRuns["4 x 400m"];
      const formatPrinter = new FormatPrinter(defaultFormatConfig.paceUnits, defaultFormatConfig.sub90SecFormat);
      const sets = parseWorkout({
        run: run,
        config: {
          parser: defaultParserConfig,
          format: defaultFormatConfig,
        },
        returnSets: true,
        verbose: false,
      }).sets;

      const averageOutput = Formatter.determineSetAverage(sets[0], formatPrinter, defaultFormatConfig);
      assert.ok(outputIsTime(averageOutput));
    });

    it("Show pace for sub-mile distances when config'd", () => {
      const run = testRuns["4 x 400m"];

      const formatConfig = {...defaultFormatConfig};
      formatConfig.subMileDistanceValue = "PACE";
      const formatPrinter = new FormatPrinter(formatConfig.paceUnits, formatConfig.sub90SecFormat);
      const sets = parseWorkout({
        run: run,
        config: {
          parser: defaultParserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      }).sets;

      const averageOutput = Formatter.determineSetAverage(sets[0], formatPrinter, formatConfig);
      assert.ok(!outputIsTime(averageOutput));
      assert.ok(averageOutput.includes("/mi"));
    });

    it("Show pace for greater-than-mile distances with default config", () => {
      const run = testRuns["4 x 2mi"];

      const formatPrinter = new FormatPrinter(defaultFormatConfig.paceUnits, defaultFormatConfig.sub90SecFormat);
      const sets = parseWorkout({
        run: run,
        config: {
          parser: defaultParserConfig,
          format: defaultFormatConfig,
        },
        returnSets: true,
        verbose: false,
      }).sets;

      const averageOutput = Formatter.determineSetAverage(sets[0], formatPrinter, defaultFormatConfig);
      console.log(averageOutput);
      assert.ok(!outputIsTime(averageOutput));
      assert.ok(averageOutput.includes("/mi"));
      assert.equal(averageOutput, "— Avg: 5:30/mi");
    });

    it("Show time for greater-than-mile distances when config'd", () => {
      const run = testRuns["4 x 2mi"];

      const formatConfig = {...defaultFormatConfig};
      formatConfig.greaterThanMileDistanceValue = "TIME";
      const formatPrinter = new FormatPrinter(formatConfig.paceUnits, formatConfig.sub90SecFormat);
      const sets = parseWorkout({
        run: run,
        config: {
          parser: defaultParserConfig,
          format: formatConfig,
        },
        returnSets: true,
        verbose: false,
      }).sets;

      const averageOutput = Formatter.determineSetAverage(sets[0], formatPrinter, formatConfig);
      console.log(averageOutput);
      assert.ok(outputIsTime(averageOutput));
      assert.equal(averageOutput, "— Avg: 11:00");
    });
  });
});
