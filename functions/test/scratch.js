const fs = require("fs");
const falsePositiveTestRuns = require("./false_positive_test_runs.json");
// const {parseWorkout} = require("../parser/parser.js");
const personKey = "";


const ids = [];

for (const runId of Object.keys(falsePositiveTestRuns[personKey]["unknown"])) {
  const run = falsePositiveTestRuns[personKey]["unknown"][runId];
  //   const res = parseWorkout({run: run, verbose: false});

  //   console.log(`${res.isWorkout} — ${run.name}`);
  //   if (res.isWorkout) {
  // console.log(`\t ${res.summary.title}`);
  //   console.log(`strava.com/activities/${runId}`)
  //   }

  if (ids.includes(Number(runId))) {
    falsePositiveTestRuns[personKey]["isWorkout"][runId] = run;
  } else {
    falsePositiveTestRuns[personKey]["notWorkout"][runId] = run;
  }
}

falsePositiveTestRuns[personKey]["unknown"] = {};
writeToJSON(falsePositiveTestRuns, "./false_positive_test_runs.json");


function writeToJSON(run, path) {
  const jsonContent = JSON.stringify(run, null, 4);
  fs.writeFile(path, jsonContent, "utf8", (err) => {
    if (err) {
      console.log("An error occured while writing JSON Object to File.");
      return console.log(err);
    }

    console.log(`${path} has been saved.`);
  });
}
