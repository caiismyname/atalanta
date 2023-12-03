const fs = require("fs");
const falsePositiveTestRuns = require("./false_positive_test_runs.json");


const ids = [10311087585, 10107597674, 10095673270, 10085144069, 10078104948, 10054718896, 9975109172, 9936566462, 9923312013, 9912811330];

for (const runId of Object.keys(falsePositiveTestRuns["brian_l"]["unknown"])) {
  const run = falsePositiveTestRuns["brian_l"]["unknown"][runId];

  // const res = parseWorkout({run: run, verbose: false});

  // console.log(`${res.isWorkout} — ${run.name}`);
  // if (res.isWorkout) {
  //     // console.log(`\t ${res.summary.title}`);
  //     console.log(`\t ${runId}`)
  // }

  if (ids.includes(Number(runId))) {
    falsePositiveTestRuns["brian_l"]["isWorkout"][runId] = run;
  } else {
    falsePositiveTestRuns["brian_l"]["notWorkout"][runId] = run;
  }
}

falsePositiveTestRuns["brian_l"]["unknown"] = {};

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
