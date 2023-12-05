const fs = require("fs");
const falsePositiveTestRuns = require("./false_positive_test_runs.json");
const {parseWorkout} = require("../parser/parser.js");
const personKey = "sergio_i";


const ids = [10322228001, 10018407096, 9984606690, 10087111776, 10284906238, 10066404017, 10308953607, 10118621313, 10222318016, 10294704248, 9974837118, 9971985735, 10072110268, 10095285725, 9965197008, 10135715793, 10058321572, 10077720122, 10292581635];


// maybe:
// [10278790993, 10000149515]

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