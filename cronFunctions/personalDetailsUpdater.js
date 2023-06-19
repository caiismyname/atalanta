const fs = require("fs");
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const firebase = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://atalanta-12c63-default-rtdb.firebaseio.com",
});
const db = firebase.database();

db.ref(`users`).once("value", (snapshot) => {
  const allUsers = snapshot.val();
  saveBackup(allUsers);
  Object.keys(allUsers).forEach( (userID) => {
    updateNameAndEmail(userID);
  });
});


function getCurrentNameAndEmail(userID, callback) {
  db.ref(`users/${userID}`).once("value", (snapshot) => {
    const user = snapshot.val();
    callback({email: user.email, name: user.name});
  });
}

function updateNameAndEmail(userID, dryRun = true) {
  getCurrentNameAndEmail(userID, (oldInfo) => {
    firebase.auth().getUser(userID).then((userRecord) => {
      const fullInfo = userRecord.toJSON();
      const updatedEmail = fullInfo.email;
      const updatedName = fullInfo.displayName;

      let log = `UPDATED ${userID}:\n\t${oldInfo.name} —> ${updatedName}\n\t${oldInfo.email} -> ${updatedEmail}`;

      if (!dryRun) {
        db.ref(`users/${userID}`).update({
          email: updatedEmail,
          name: updatedName,
        });
      } else {
        log = `DRY RUN ${log}`;
      }

      console.log(log);
    });
  });
}

function saveBackup(content, fileName="backup.json") {
  const jsonContent = JSON.stringify(content, null, 4);
  fs.writeFile(fileName, jsonContent, "utf8", (err) => {
    if (err) {
      console.log("An error occured while writing JSON Object to file.");
      return console.log(err);
    }

    console.log(`JSON file ${fileName} has been saved.`);
  });
}
