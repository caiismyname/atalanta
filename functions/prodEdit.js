const fs = require("fs");
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const firebase = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // databaseURL: "https://atalanta-12c63-default-rtdb.firebaseio.com",
  // databaseURL: "http://127.0.0.1:9000",
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

function migrateConfigKey(oldKey, newKey, commit = false) {
  db.ref(`users`).once("value", (snapshot) => {
    const allUsers = snapshot.val();
    var updatedUserCount = 0;

    saveBackup(allUsers, () => {
      Object.keys(allUsers).forEach((userID) => {
        var updated = false;
        const prefs = allUsers[userID]["preferences"];
        const allConfigs = ["format", "parser", "account"];

        allConfigs.forEach(configName => {
          Object.keys(prefs[configName]).forEach(key => {
            if (key === oldKey) {
              const existingValue = prefs[configName][oldKey];

              if (commit) {
                // Create the new key with the existing value
                let updateObj = {};
                updateObj[newKey] = existingValue

                db.ref(`users/${userID}/preferences/${configName}`).update(updateObj).then(() => {
                });
              }

              console.log(`\t${commit ? "" : "DRY RUN — "}Migrated ${configName}/${oldKey} to ${configName}/${newKey}: ${existingValue} for ${userID}`);
              updated = true;
            }
          });
        });

        if (updated) {
          updatedUserCount++;
        }
      });
 
      console.log(`Updated ${updatedUserCount} users`);
      firebase.delete();
    });
  });
}

function deleteConfigKey(toDelete, commit = false) {
  db.ref(`users`).once("value", (snapshot) => {
    const allUsers = snapshot.val();
    var updatedUserCount = 0;

    saveBackup(allUsers, () => {
      Object.keys(allUsers).forEach((userID) => {
        var updated = false;
        const prefs = allUsers[userID]["preferences"];
        const allConfigs = ["format", "parser", "account"];

        allConfigs.forEach(configName => {
          Object.keys(prefs[configName]).forEach(key => {
            if (key === toDelete) {
              const existingValue = prefs[configName][toDelete];

              if (commit) {
                  db.ref(`users/${userID}/preferences/${configName}/${toDelete}`).remove();
              }

              console.log(`\t${commit ? "" : "DRY RUN — "}Deleted ${configName}/${toDelete} for ${userID}`);
              updated = true;
            }
          });
        });

        if (updated) {
          updatedUserCount++;
        }
      });
 
      console.log(`Updated ${updatedUserCount} users`);
      firebase.delete();
    });
  });
}

// migrateConfigKey("", "", true);
// deleteConfigKey("", true);
