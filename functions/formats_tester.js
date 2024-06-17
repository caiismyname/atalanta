const {parseWorkout} = require("./parser/parser.js");
const {Formatter} = require("./parser/formatter.js");
const {FormatPrinter} = require("./parser/format_printer.js");
const {defaultParserConfig, defaultFormatConfig} = require("./defaultConfigs.js");
const {generateAndReturnWorkout} = require("./test/generateFakeWorkout.js");

const defaultTestRuns = require("./test/test_runs.json");
const userTestRuns = require("./test/user_test_runs.json");

// Set these as global
let parserConfig = {...defaultParserConfig};
let formatConfig = {...defaultFormatConfig};
let testRuns = JSON.parse(JSON.stringify(defaultTestRuns));
let userRuns = JSON.parse(JSON.stringify(userTestRuns));


function resetConfigs() {
    parserConfig = {...defaultParserConfig};
    formatConfig = {...defaultFormatConfig};
    testRuns = JSON.parse(JSON.stringify(defaultTestRuns));
}

function display(res) {
    console.log(res.summary.title);
    console.log("---");
    console.log(res.summary.description);
    console.log("=====================================================");
}

for (let run of Object.values(testRuns)) {
    resetConfigs();
    const res = parseWorkout({
        run: run,
        config: {
        parser: parserConfig,
        format: formatConfig,
        },
        returnSets: false,
        verbose: false,
    });

    display(res);
}

for (let key of ["track_correction", "pattern_reducer", "workout_lap_tagger", "incorrect_basis", "formatting", "general_irl_examples"]) {
    for (let run of Object.values(userRuns[key])) {
        resetConfigs();
        const res = parseWorkout({
            run: run,
            config: {
            parser: parserConfig,
            format: formatConfig,
            },
            returnSets: false,
            verbose: false,
        });

        display(res);
    }
}

