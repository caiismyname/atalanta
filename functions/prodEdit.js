const fs = require("fs");
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const firebase = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://atalanta-12c63-default-rtdb.firebaseio.com",
});
const db = firebase.database();

function saveBackup(content, callback) {
  const jsonContent = JSON.stringify(content, null, 4);
  fs.writeFile("backup.json", jsonContent, "utf8", (err) => {
    if (err) {
      console.log("An error occured while writing JSON Object to file.");
      return console.log(err);
    }

    console.log(`backup.json saved`);
    callback();
  });
}


//
// ENTRYPOINT
//

db.ref(`users`).once("value", (snapshot) => {
  const allUsers = snapshot.val();
  saveBackup(allUsers, () => {
    Object.keys(allUsers).forEach((userID) => {
      console.log(userID);
      update(userID, false);
    });

    console.log("Finished all users");
  });
});


function update(userID, dryRun = true) {
  if (!dryRun) {
    db.ref(`users/${userID}/preferences/format`).update({
      "subMileDistanceValue": "TIME",
      "greaterThanMileDistanceValue": "PACE",
    }).then(() => {
      db.ref(`users/${userID}/preferences/format/subMileDistanceAverageUnit`).remove().then(() => {
        db.ref(`users/${userID}/preferences/format/greaterThanMileDistanceAverageUnit`).remove().then(() => {
          console.log("\tDone");
        });
      });
    });
  }
}

