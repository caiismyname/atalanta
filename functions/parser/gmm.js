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

function generateMeanAndVarianceForCluster(cluster) {
  const singularityAvoidance = 1e-6;

  const averageSpeed = cluster.reduce((a, b) => a + b.speed, 0) / cluster.length;
  const averageDistance = cluster.reduce((a, b) => a + b.distance, 0) / cluster.length;
  const varianceSpeed = cluster.reduce((a, b) => a + (averageSpeed - b.speed)**2, 0) / cluster.length;
  const varianceDistance = cluster.reduce((a, b) => a + (averageDistance - b.distance)**2, 0) / cluster.length;
  const covariance = cluster.reduce((a, b) => {
    const speedDeviation = b.speed - averageSpeed;
    const distDeviation = b.distance - averageDistance;

    return a + (speedDeviation * distDeviation);
  }, 0) / cluster.length;

  return {
    "mean": [averageSpeed, averageDistance],
    "covarianceMatrix": [
      [varianceSpeed + singularityAvoidance, covariance],
      [covariance, varianceDistance + singularityAvoidance],
    ],
  };
}

function initialGMMParams(laps) {
  const kmeansLaps = laps.map((lap) => {
    return {
      "features": [lap[0]],
      "speed": lap[0],
      "distance": lap[1],
    };
  });
  const kmeansClustered = runKmeans(kmeansLaps, 2);

  const slowLaps = kmeansClustered.filter((lap) => lap.knn_temp_assignment === 0);
  slowLaps.sort((a, b) => a.speed - b.speed);
  const cluster0 = [];
  const cluster1 = [];
  for (let idx = 0; idx < slowLaps.length; idx++) {
    if (idx < slowLaps.length / 2) {
      cluster0.push(slowLaps[idx]);
    } else {
      cluster1.push(slowLaps[idx]);
    }
  }
  const cluster2 = kmeansClustered.filter((lap) => lap.knn_temp_assignment === 1);

  const cluster0Values = generateMeanAndVarianceForCluster(cluster0);
  const cluster1Values = generateMeanAndVarianceForCluster(cluster1);
  const cluster2Values = generateMeanAndVarianceForCluster(cluster2);

  const initialMeans = [cluster0Values.mean, cluster1Values.mean, cluster2Values.mean];
  const initialCovariance = [cluster0Values.covarianceMatrix, cluster1Values.covarianceMatrix, cluster2Values.covarianceMatrix];

  return {
    "mean": initialMeans,
    "covariance": initialCovariance,
    "weight": [cluster0.length / laps.length, cluster1.length / laps.length, cluster2.length / laps.length],
  };
}

function formatLapForGMM(lap, minSpeed, maxSpeed, minDistance, maxDistance ) {
  const normSpeed = (lap.average_speed - minSpeed) / (maxSpeed - minSpeed);
  const normDist = (lap.distance - minDistance) / (maxDistance - minDistance);

  return [normSpeed, normDist];
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
  let maxSpeed = laps.reduce((a, b) => Math.max(a, b.average_speed), 0);
  const minSpeed = laps.reduce((a, b) => Math.min(a, b.average_speed), 999999);
  if (minSpeed === maxSpeed) {
    maxSpeed *= 1.02;
  }

  let maxDistance = laps.reduce((a, b) => Math.max(a, b.distance), 0);
  const minDistance = laps.reduce((a, b) => Math.min(a, b.distance), 999999);
  if (minDistance === maxDistance) {
    maxDistance *= 1.02;
  }

  const gmmFormattedLaps = laps.map((lap) => formatLapForGMM(lap, minSpeed, maxSpeed, minDistance, maxDistance));

  const initialParams = initialGMMParams(gmmFormattedLaps);
  //   console.log("mean", initialParams.mean);
  //   console.log("covar", initialParams.covariance);
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

    for (const lap of laps) {
      const probNorm = gmm.predictNormalize(formatLapForGMM(lap, minSpeed, maxSpeed, minDistance, maxDistance));
      lap.gmm_assignment = probNorm.indexOf(Math.max(...probNorm));
    //   console.log(lap.gmm_assignment);
    }

    // console.log("mean", gmm.means);
    // console.log("covar", gmm.covariances);
  }

  return laps;
}

// const run = userTestRuns["known_good"]["10x_alternating_miles"];

// runGMM(userTestRuns["known_good"]["4mi_with_long_warmup"].laps.slice(0, -1));
// runGMM(userTestRuns["known_good"]["2mi_8x300"].laps);
// runGMM(userTestRuns["known_good"]["3x2mi"].laps);
// runGMM(userTestRuns["known_good"]["2x(1,2,3,2,1min)"].laps);
// runGMM(defaultTestRuns["4mi"].laps);


// runGMM(run.laps);


module.exports = {
  runGMM,
};
