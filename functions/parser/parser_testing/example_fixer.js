const readline = require("readline");
const examples = require("./amy_examples.json");
// const output = require("./output.json");
const Helpers = require("./parser_helpers.js");
const fs = require("fs");

const fixedExamples = [];

// eslint-disable-next-line no-unused-vars
function printIsWorkout(workouts) {
  for (const workout of workouts) {
    console.log(workout.workout_type);
  }
}

// eslint-disable-next-line no-unused-vars
function saveJSON(content) {
  const jsonContent = JSON.stringify(content);
  fs.writeFile("output.json", jsonContent, "utf8", (err) => {
    if (err) {
      console.log("An error occured while writing JSON Object to File.");
      return console.log(err);
    }

    console.log("JSON file has been saved.");
  });
}

// eslint-disable-next-line no-unused-vars
function getDayOfWeek(dateStr) {
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const date = new Date(dateStr);
  const dayOfWeekIndex = date.getDay();
  const dayOfWeek = daysOfWeek[dayOfWeekIndex];
  return dayOfWeek;
}

// Define a function to prompt the user and modify the object
async function promptAndModify(workout) {
  console.log(`Name: ${workout.name}`);
  console.log(`Dist: ${Helpers.metersToMiles(workout.distance)}`);
  console.log(`Date: ${getDayOfWeek(workout.start_date_local)}`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question("Is this a workout? (y/n)", (answer) => {
      resolve(answer);
      rl.close();
    });
  });

  if (answer === "y") {
    workout.workout_type = 3;
    console.log(`\tSet as workout: ${workout.name}`);
  } else if (answer === "n") {
    workout.workout_type = 0;
  }

  fixedExamples.push(workout);
}

// Iterate through the list of objects and call the promptAndModify function
async function main() {
  for (const workout of examples["examples"]) {
    await promptAndModify(workout);
  }

  saveJSON(fixedExamples);
}

// Call the main function to start the program
main();
