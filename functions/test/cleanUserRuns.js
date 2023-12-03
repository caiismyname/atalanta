const fs = require("fs");

const input = require("../parser/parser_testing_examples/workout_detection_false_negative.json");

function cleanStravaActivity(activity) {
  const keysToSave = [
    "name",
    "description",
    "distance",
    "moving_time",
    "elapsed_time",
    "total_elevation_gain",
    "workout_type",
    "id",
    "start_date",
    "average_speed",
    "max_speed",
    "has_heartrate",
    "average_heartrate",
    "max_heartrate",
  ];

  const cleanedActivity = {};

  for (const key of keysToSave) {
    cleanedActivity[key] = activity[key];
  }

  cleanedActivity.laps = [];
  for (const lap of activity.laps) {
    // eslint-disable-next-line no-unused-vars
    const {athlete: _, activity: __, ...rest} = lap;
    cleanedActivity.laps.push(rest);
  }

  return cleanedActivity;
}

// eslint-disable-next-line no-unused-vars
function save(output) {
  const jsonContent = JSON.stringify(output, null, 4);
  fs.writeFile("./output.json", jsonContent, "utf8", (err) => {
    if (err) {
      console.log("An error occured while writing JSON Object to File.");
      return console.log(err);
    }

    console.log(` saved.`);
  });
}

const res = {};

for (const run of input["examples"]) {
  const fixed = cleanStravaActivity(run);
  res[fixed.name] = fixed;
}

// save(res);

