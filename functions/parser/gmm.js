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

function swapEnds(a, b) {
  const swap = a[a.length -1];

  let bIdx = 0;
  let isDifferent = swap.speed !== b[bIdx].speed;
  while (!isDifferent && bIdx < b.length) {
    isDifferent = swap.speed !== b[bIdx].speed;
    bIdx++;
  }

  if (bIdx === b.length) { // reached the end and both are still the same
    a[a.length -1].speed += 1e-6;
    b[b.length -1].speed += 2e-6;
  } else { // swap the first element of B that's not the same as the last value in A
    a[a.length - 1] = b[bIdx];
    b[bIdx] = swap;
  }
}

function fuzzWhenAllSame(cluster) {
  const addition = JSON.parse(JSON.stringify(cluster[0]));
  addition.speed -= .05;
  addition.apeed *= .99;

  for (let i = 0; i < cluster.length / 2; i++) {
    cluster.push(addition);
  }
}

function allValuesEqual(cluster) {
  const average = cluster.reduce((a, b) => a + b, 0) / cluster.length;
  return (cluster[0] === average);
}

function initialGMMParams(laps, numClusters) {
  const isDebugging = true;
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
  if (numClusters === 3) {
    let slowLapsAverage = slowLaps.reduce((a, b) => a + b.speed, 0) / slowLaps.length;
    const cluster0 = [];
    const cluster1 = [];
    for (let idx = 0; idx < slowLaps.length; idx++) {
      if (slowLaps[idx].speed <= slowLapsAverage) {
      // if (idx < slowLaps.length / 2) {
        cluster0.push(slowLaps[idx]);
      } else {
        cluster1.push(slowLaps[idx]);
      }
    }

    // If the slowlaps are all the same speed (thus equal to average), then it's a 2-cluster situation
    if (cluster1.length === 0) {
      console.log('setting to 2')
      numClusters = 2
    }

    // // If both slowlap groups are homogenous, then it's a 2 cluster situation
    // if (allValuesEqual(cluster0.map((x) => x.speed)) && allValuesEqual(cluster1.map((x) => x.speed))) {
    //   numClusters = 2;
    // } 

    const cluster2 = kmeansClustered.filter((lap) => lap.knn_temp_assignment === 1);

    cluster0.sort((a, b) => a.speed - b.speed);
    cluster1.sort((a, b) => a.speed - b.speed);
    cluster2.sort((a, b) => a.speed - b.speed);

    if (isDebugging) {
      console.debug("Pre balancing")
      console.debug(cluster0.map((x) => x.speed));
      console.debug(cluster1.map((x) => x.speed));
      console.debug(cluster2.map((x) => x.speed));
    }
    
    if (numClusters === 3) { // short circuit
      if (allValuesEqual(cluster0.map((x) => x.speed))) {
        // swapEnds(cluster0, cluster1);
        fuzzWhenAllSame(cluster1);
      }

      let swappedFast = false;

      if (allValuesEqual(cluster1.map((x) => x.speed))) {
        // swapEnds(cluster1, cluster2);
        fuzzWhenAllSame(cluster1);
        swappedFast = true;
      }

      if (allValuesEqual(cluster2.map((x) => x.speed))) {
        fuzzWhenAllSame(cluster2);
      }

      if (!swappedFast) {
        // Force increased variance in cluster 1, which is what will catch fast warmups if there are any
        cluster1.push(cluster2[Math.round(cluster2.length / 2)]);
      }

      if (isDebugging) {
        console.debug("Post balancing")
        console.debug(cluster0.map((x) => x.speed));
        console.debug(cluster1.map((x) => x.speed));
        console.debug(cluster2.map((x) => x.speed));
      }

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
  }

  if (numClusters === 2) {
    console.log("2 cluster size")
    const cluster2 = kmeansClustered.filter((lap) => lap.knn_temp_assignment === 1);

    slowLaps.sort((a, b) => a.speed - b.speed);
    cluster2.sort((a, b) => a.speed - b.speed);

    if (allValuesEqual(slowLaps.map((x) => x.speed)) || allValuesEqual(cluster2.map((x) => x.speed))) {
      swapEnds(slowLaps, cluster2);
    }

    // Force increased variance in cluster 1, which is what will catch fast warmups if there are any
    slowLaps.push(cluster2[Math.floor(cluster2.length / 2)]);

    const cluster0Values = generateMeanAndVarianceForCluster(slowLaps);
    const cluster2Values = generateMeanAndVarianceForCluster(cluster2);

    const initialMeans = [cluster0Values.mean, cluster2Values.mean];
    const initialCovariance = [cluster0Values.covarianceMatrix, cluster2Values.covarianceMatrix];

    return {
      "mean": initialMeans,
      "covariance": initialCovariance,
      "weight": [slowLaps.length / laps.length, cluster2.length / laps.length],
    };
  }
}

function formatLapForGMM(lap, minSpeed, maxSpeed, minDistance, maxDistance ) {
  const normSpeed = (lap.average_speed - minSpeed) / (maxSpeed - minSpeed);
  const normDist = (lap.distance - minDistance) / (maxDistance - minDistance);

  return [normSpeed, normDist];
}

// https://github.com/lukapopijac/gaussian-mixture-model
function runGMM(laps) {
  const isDebugging = true;
  let succeededWithoutSingularity = true;
  let startedWithSingularity = false;

  const isWorkoutAssignments = runKmeans(laps.map((lap) => {
    return {"features": [lap.average_speed]};
  }), 2);

  // If there aren't enough laps, the GMM won't have enough data to work
  if (laps.length <= 5) {
    if (isDebugging) {
      console.debug("Too few laps, using KMEANs instead");
    }
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

  let initialParams = initialGMMParams(gmmFormattedLaps, 3);
  if (isDebugging) {
    // console.log(gmmFormattedLaps);
    console.log("INITIAL mean", initialParams.mean);
    console.log("INITIAL covar", initialParams.covariance);
    console.log("INITIAL weight", initialParams.weight);
  }
  let gmm = new GMM({
    weights: initialParams.weight,
    means: initialParams.mean,
    covariances: initialParams.covariance,
  });

  gmmFormattedLaps.forEach((p) => gmm.addPoint(p));

  for (let i = 0; i < 2; i++) {
    gmm.runEM(1);

    if (gmm.singularity !== null && i > 0) {
      succeededWithoutSingularity = false;
    } else if (gmm.singularity !== null && i === 0) {
      startedWithSingularity = true;
    }

    for (const lap of laps) {
      const probNorm = gmm.predictNormalize(formatLapForGMM(lap, minSpeed, maxSpeed, minDistance, maxDistance));
      lap.gmm_assignment = probNorm.indexOf(Math.max(...probNorm));

      if (isDebugging) {
        console.log("LAP", formatLapForGMM(lap, minSpeed, maxSpeed, minDistance, maxDistance));
        console.log("PROB", probNorm);
        console.log(lap.gmm_assignment);
      }
    }

    if (isDebugging) {
      const cluster0 = laps.filter((lap) => lap.gmm_assignment === 0);
      const cluster1 = laps.filter((lap) => lap.gmm_assignment === 1);
      const cluster2 = laps.filter((lap) => lap.gmm_assignment === 2);

      console.log(
          cluster0.map((x) => formatLapForGMM(x, minSpeed, maxSpeed, minDistance, maxDistance)[0]),
          cluster1.map((x) => formatLapForGMM(x, minSpeed, maxSpeed, minDistance, maxDistance)[0]),
          cluster2.map((x) => formatLapForGMM(x, minSpeed, maxSpeed, minDistance, maxDistance)[0]),
      );

      console.log("mean", gmm.means);
      console.log("covar", gmm.covariances);
    }
  }

  if (succeededWithoutSingularity || startedWithSingularity) {
    return laps;
  }


  //
  // TRY AGAIN WITH 2 CLUSTERS
  //
  initialParams = initialGMMParams(gmmFormattedLaps, 2);
  gmm = new GMM({
    weights: initialParams.weight,
    means: initialParams.mean,
    covariances: initialParams.covariance,
  });

  if (isDebugging) {
    console.log("STARTING OVER==============================");
    console.log("INITIAL mean", initialParams.mean);
    console.log("INITIAL covar", initialParams.covariance);
    console.log("INITIAL weight", initialParams.weight);
  }

  gmmFormattedLaps.forEach((p) => gmm.addPoint(p));

  for (let i = 0; i < 2; i++) {
    gmm.runEM(1);

    for (const lap of laps) {
      const probNorm = gmm.predictNormalize(formatLapForGMM(lap, minSpeed, maxSpeed, minDistance, maxDistance));
      lap.gmm_assignment = probNorm.indexOf(Math.max(...probNorm));

      if (isDebugging) {
        console.log("LAP", formatLapForGMM(lap, minSpeed, maxSpeed, minDistance, maxDistance));
        console.log("PROB", probNorm);
        console.log(lap.gmm_assignment);
      }
    }

    if (isDebugging) {
      const cluster0 = laps.filter((lap) => lap.gmm_assignment === 0);
      const cluster1 = laps.filter((lap) => lap.gmm_assignment === 1);

      console.log(
          cluster0.map((x) => formatLapForGMM(x, minSpeed, maxSpeed, minDistance, maxDistance)[0]),
          cluster1.map((x) => formatLapForGMM(x, minSpeed, maxSpeed, minDistance, maxDistance)[0]),
      );
    }
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
