var assert = require('assert');
const {parseWorkout} = require("../parser/parser.js");
const Formatter = require("../parser/formatter.js");
const {defaultParserConfig, defaultFormatConfig} = require("../parser/defaultConfigs.js");

const testRuns = require("./test_runs.json");

describe('Formatter', function() {
    let printConfig = defaultFormatConfig;
    let parserConfig = defaultParserConfig;

    describe('Set Naming', function() {
        describe('Intervals', function() {
            it('Basic Interval — 4 x 1mi', function() {
                const run = testRuns["4 x 1mi"];
                const sets = parseWorkout({
                    run: run,
                    config: {
                        parser: parserConfig,
                        format: printConfig
                    },
                    returnSets: true,
                    verbose: false
                }).sets;

                assert.equal(Formatter.printSets(sets).title, "4 x 1mi");
            });

            it("Two Intervals — (4 x 1mi) + (4 x 400m)", function () {
                const run = testRuns["(4 x 1mi) + (4 x 400m)"];
                const sets = parseWorkout({
                    run: run,
                    config: {
                        parser: parserConfig,
                        format: printConfig
                    },
                    returnSets: true,
                    verbose: false
                }).sets;

                assert.equal(Formatter.printSets(sets).title, "(4 x 1mi) + (4 x 400m)");
            });

            it("Heterogeneous Intervals — 4 x (400m, 200m, 100m)", function () {
                const run = testRuns["4 x (400m, 200m, 100m)"];
                const sets = parseWorkout({
                    run: run,
                    config: {
                        parser: parserConfig,
                        format: printConfig
                    },
                    returnSets: true,
                    verbose: false
                }).sets;

                assert.equal(Formatter.printSets(sets).title, "4 x (400m, 200m, 100m)");
            });

            it("Heterogeneous Intervals with Tempo — (4 x (400m, 200m, 100m)) + 4mi", function () {
                const run = testRuns["(4 x (400m, 200m, 100m)) + 4mi"];
                const sets = parseWorkout({
                    run: run,
                    config: {
                        parser: parserConfig,
                        format: printConfig
                    },
                    returnSets: true,
                    verbose: false
                }).sets;

                assert.equal(Formatter.printSets(sets).title, "(4 x (400m, 200m, 100m)) + 4mi");
            });
        });

        describe('Fartleks', function() {
            it('Sub 90sec — 10 x 1:15', function() {
                const run = testRuns["10 x 75sec"];
                const sets = parseWorkout({
                    run: run,
                    config: {
                        parser: parserConfig,
                        format: printConfig
                    },
                    returnSets: true,
                    verbose: false
                }).sets;

                assert.equal(Formatter.printSets(sets).title, "10 x 1:15");
            });

            it('Greater than 90sec — 4 x 2:30', function() {
                const run = testRuns["4 x 2:30"];
                const sets = parseWorkout({
                    run: run,
                    config: {
                        parser: parserConfig,
                        format: printConfig
                    },
                    returnSets: true,
                    verbose: false
                }).sets;

                assert.equal(Formatter.printSets(sets).title, "4 x 2:30");
            });

            it('Whole minute value — 4 x 4 mins', function() {
                const run = testRuns["4 x 4 mins"];
                const sets = parseWorkout({
                    run: run,
                    config: {
                        parser: parserConfig,
                        format: printConfig
                    },
                    returnSets: true,
                    verbose: false
                }).sets;

                assert.equal(Formatter.printSets(sets).title, "4 x 4 mins");
            });

        })
    })
})