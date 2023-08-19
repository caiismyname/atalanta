const GMM = require("gaussian-mixture-model");
const userTestRuns = require("../test/user_test_runs.json");
const defaultTestRuns = require("../test/test_runs.json");
const Helpers = require("./parser_helpers.js");

// Expects an object with one property, `features`, that is an array of all features to be evaluated.
// Returns the inputs array (same order) with the cluster assignments added as property `knn_temp_assignment`
function runKmeans(inputs, k) {
  // Initialize uniformly into clusters
//   for (let idx = 0; idx < inputs.length; idx++) {
//     inputs[idx].knn_temp_assignment = idx % k;
//   }

  // Initialize into slow and fast clusters
  const mean = inputs.reduce((a, b) => a + b.features[0], 0) / inputs.length;
  for (let idx = 0; idx < inputs.length; idx++) {
    inputs[idx].knn_temp_assignment = inputs[idx].features[0] < mean ? 0 : 1;
  }

  let isStable = false;

  do {
    const previousAssignments = [...inputs];

    for (const item of inputs) {
      const distances = []; // Distance to each cluster
      for (let clusterIdx = 0; clusterIdx < k; clusterIdx++ ) {
        distances.push(
            Helpers.averageDistanceToCluster(
                item.features,
                previousAssignments
                    .filter((item) => item.knn_temp_assignment === clusterIdx)
                    .map((item) => item.features),
            ),
        );
      }

      // Reassign
      const clusterAssignment = distances.indexOf(Math.min(...distances));
      item.knn_temp_assignment = clusterAssignment;
    }

    // Compare prev vs. new assignments
    const newAssignments = [...inputs];
    isStable = Helpers.arraysAreEqual(previousAssignments, newAssignments);
  } while (!isStable);

  return inputs;
}

function initialGMMParams(laps) {
  const kmeansLaps = laps.map((lap) => {
    return {
      "features": [lap[0]],
      "speed": lap[0],
      "distance": lap[1],
    };
  });
  const kmeansClustered = runKmeans(kmeansLaps, 3);
  const singularityAvoidance = 1e-6;

  let cluster0 = kmeansClustered.filter((lap) => lap.knn_temp_assignment === 0);
  const cluster0SlowestSpeed = Math.min(...cluster0.map((x) => x.speed));
  const cluster1 = kmeansClustered.filter((lap) => lap.knn_temp_assignment === 1);

  const cluster0AverageSpeed = cluster0.reduce((a, b) => a + b.speed, 0) / cluster0.length;
  const cluster0AverageDistance = cluster0.reduce((a, b) => a + b.distance, 0) / cluster0.length;
  const cluster0VarianceSpeed = cluster0.reduce((a, b) => a + (cluster0AverageSpeed - b.speed)**2, 0) / cluster0.length;
  const cluster0VarianceDistance = cluster0.reduce((a, b) => a + (cluster0AverageDistance - b.distance)**2, 0) / cluster0.length;
  const cluster0Covariance = cluster0.reduce((a, b) => {
    const speedDeviation = b.speed - cluster0AverageSpeed;
    const distDeviation = b.distance - cluster0AverageDistance;

    return a + (speedDeviation * distDeviation);
  }, 0) / cluster0.length;


  const cluster1AverageSpeed = cluster1.reduce((a, b) => a + b.speed, 0) / cluster1.length;
  const cluster1AverageDistance = cluster1.reduce((a, b) => a + b.distance, 0) / cluster1.length;
  const cluster1VarianceSpeed = cluster1.reduce((a, b) => a + (cluster1AverageSpeed - b.speed)**2, 0) / cluster1.length;
  const cluster1VarianceDistance = cluster1.reduce((a, b) => a + (cluster1AverageDistance - b.distance)**2, 0) / cluster1.length;
  const cluster1Covariance = cluster1.reduce((a, b) => {
    const speedDeviation = b.speed - cluster1AverageSpeed;
    const distDeviation = b.distance - cluster1AverageDistance;

    return a + (speedDeviation * distDeviation);
  }, 0) / cluster1.length;


  const initialMeans = [[cluster0AverageSpeed, cluster0AverageDistance], [cluster1AverageSpeed, cluster1AverageDistance], [cluster0SlowestSpeed, cluster0AverageDistance]];

  const initialCovariance = [
    [[cluster0VarianceSpeed + singularityAvoidance, cluster0Covariance], [cluster0Covariance, cluster0VarianceDistance + singularityAvoidance]],
    [[cluster1VarianceSpeed + singularityAvoidance, cluster1Covariance], [cluster1Covariance, cluster1VarianceDistance + singularityAvoidance]],
    [[(cluster0VarianceSpeed * 2) + singularityAvoidance, cluster0Covariance], [cluster0Covariance, cluster0VarianceDistance + singularityAvoidance]],
  ];

  return {
    "mean": initialMeans,
    "covariance": initialCovariance,
    "weight": [(cluster0.length - 1) / laps.length, cluster1.length / laps.length, 1 / laps.length],
  };
}

function fuzz(value) {
  return value;
  //   const direction = Math.random() > 0.5 ? 1 : -1;
  const direction = 1;

  const fuzzMax = 0.03;
  const fuzzMin= 0.01;
  const fuzzPercentage = (Math.random() * (fuzzMax - fuzzMin)) + fuzzMin;

  return Math.round(((fuzzPercentage * direction * value) + value) * 100) / 100;
}

function formatLapForGMM(lap, minSpeed, maxSpeed ) {
  return;
}

// https://github.com/lukapopijac/gaussian-mixture-model
function runGMM(laps) {
  const isWorkoutAssignments = runKmeans(laps.map((lap) => {
    return {"features": [lap.average_speed]};
  }), 2);
  if (laps.length <= 3) {
    return isWorkoutAssignments;
  }


  // Normalize laps
  for (const lap of laps) {
    lap.original_average_speed = lap.average_speed;
    lap.original_distance = lap.distance;

    lap.average_speed = fuzz(lap.average_speed);
    lap.distance = fuzz(lap.distance);
  }

  let maxSpeed = laps.reduce((a, b) => Math.max(a, b.average_speed), 0);
  const minSpeed = laps.reduce((a, b) => Math.min(a, b.average_speed), 999999);
  if (minSpeed === maxSpeed) {
    maxSpeed += 1;
  }

  let maxDistance = laps.reduce((a, b) => Math.max(a, b.distance), 0);
  const minDistance = laps.reduce((a, b) => Math.min(a, b.distance), 999999);
  if (minDistance === maxDistance) {
    maxDistance += 800;
  }

  const gmmFormattedLaps = laps.map((lap) => {
    const normSpeed = (lap.average_speed - minSpeed) / (maxSpeed - minSpeed);
    const normDist = (lap.distance - minDistance) / (maxDistance - minDistance);

    return [normSpeed, normDist];
  });

  const initialParams = initialGMMParams(gmmFormattedLaps);
  console.log("mean", initialParams.mean);
  console.log("covar", initialParams.covariance);
  // console.log("weight", initialParams.weight);
  const gmm = new GMM({
    weights: initialParams.weight,
    means: initialParams.mean,
    covariances: initialParams.covariance,
  });

  gmmFormattedLaps.forEach((p) => gmm.addPoint(p));

  for (let i = 0; i < 2; i++) {
    gmm.runEM(1);
    if (gmm.singularity !== null) {
      return isWorkoutAssignments;
    }

    const predictions = {0: [], 1: [], 2: []};
    for (const lap of laps) {
      const formattedLap = [fuzz((lap.average_speed - minSpeed) / (maxSpeed - minSpeed)), (lap.distance - minDistance) / (maxDistance - minDistance)];
      console.log(formattedLap);

      const probNorm = gmm.predictNormalize(formattedLap);
      console.log(probNorm);
      lap.gmm_assignment = probNorm.indexOf(Math.max(...probNorm));
    //   predictions[probNorm.indexOf(Math.max(probNorm))].push(lap.average_speed);
    }

    // console.log("mean", gmm.means)
    // console.log("covar", gmm.covariances)
  }

  for (const lap of laps) {
    lap.average_speed = lap.original_average_speed;
    lap.distance = lap.original_distance;
  }
  return laps;
}

// const run = userTestRuns["known_good"]["10x_alternating_miles"];

// runGMM(userTestRuns["known_good"]["4mi_with_long_warmup"].laps.slice(0, -1));
// runGMM(userTestRuns["known_good"]["2mi_8x300"].laps);
// runGMM(userTestRuns["known_good"]["3x2mi"].laps);
// runGMM(userTestRuns["known_good"]["2x(1,2,3,2,1min)"].laps);
// runGMM(defaultTestRuns["4mi"].laps);

// const res = parseWorkout({
//   run: run,
//   config: {
//     parser: defaultParserConfig,
//     format: defaultFormatConfig,
//   },
//   returnSets: true,
//   verbose: false,
// });


// runGMM(run.laps);
// console.log(res.summary);


module.exports = {
  runGMM,
};
