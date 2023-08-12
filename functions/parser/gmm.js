const GMM = require('gaussian-mixture-model');
const userTestRuns = require("../test/user_test_runs.json");

// Expects an object with one property, `features`, that is an array of all features to be evaluated.
// Returns the inputs array (same order) with the cluster assignments added as property `knn_temp_assignment`
function runKmeans(inputs, k) {
  // Initialize uniformly into clusters
  for (let idx = 0; idx < inputs.length; idx++) {
    inputs[idx].knn_temp_assignment = idx % k;
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

    // console.log(previousAssignments, newAssignments)
  } while (!isStable);

  return inputs;
}

function generateRunInputs() {
    const testRuns = userTestRuns["known_good"];
    const res = [];
    for (const [name, run] of Object.entries(testRuns)) {
        res.push({
            "name": name,
            "laps": run.laps.map(lap => {
                return [lap.average_speed, lap.distance];
            })
        });
    }

    return res;
}


function runGMM(laps) {
    // https://github.com/lukapopijac/gaussian-mixture-model
    
    console.log(laps)
    
    // initialize model
    var gmm = new GMM({
        weights: [0.5, 0.5],
        means: [[8, 1600], [2, 1600]],
        covariances: [
            [[4000,0],[0,4000]],
            [[4000,0],[0,4000]]
        ]
    });

    // add data points to the model
    laps.forEach(p => gmm.addPoint(p));

    console.log(gmm)

    // run 5 iterations of EM algorithm
    gmm.runEM(1);

    console.log(gmm)

    for (const lap in laps) {
        var prob = gmm.predict(lap);     
        // predict and normalize cluster probabilities for point [-5, 25]
        var probNorm = gmm.predictNormalize(lap);  // [0.8161537535012295, 0.18384624649877046]

        console.log(prob);
    }

        // initialize model
    var gmm = new GMM({
        weights: [0.5, 0.5],
        means: [[-25, 40], [-60, -30]],
        covariances: [
            [[400,0],[0,400]],
            [[400,0],[0,400]]
        ]
    });

    // create some data points
    var data = [
        [11,42],[19,45],[15,36],[25,38],[24,33],
        [-24,3],[-31,-4],[-34,-14],[-25,-5],[-16,7]
    ];

    // add data points to the model
    data.forEach(p => gmm.addPoint(p));

    console.log(gmm)

    // run 5 iterations of EM algorithm
    gmm.runEM(5);

    console.log(gmm)

    // predict cluster probabilities for point [-5, 25]
    var prob = gmm.predict([-5, 25]);  // [0.000009438559331418772, 0.000002126123537376676]

    // predict and normalize cluster probabilities for point [-5, 25]
    var probNorm = gmm.predictNormalize([-5, 25]);  // [0.8161537535012295, 0.18384624649877046]

    console.log(prob, probNorm)
    
}

const testRuns = generateRunInputs();
for (const test of testRuns) {
    console.log(test.name);
    runGMM(test.laps);
}