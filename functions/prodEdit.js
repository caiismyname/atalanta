const fs = require("fs");
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const firebase = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // databaseURL: "https://atalanta-12c63-default-rtdb.firebaseio.com",
  databaseURL: "http://127.0.0.1:9000/?ns=atalanta-12c63-default-rtdb",
});
const db = firebase.database();
const {EMAIL_STATUS} = require("./email_interface.js");

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

// eslint-disable-next-line no-unused-vars
function migrateConfigKey(oldKey, newKey, commit = false) {
  const allPromises = [];
  db.ref(`users`).once("value", (snapshot) => {
    const allUsers = snapshot.val();
    let updatedUserCount = 0;

    saveBackup(allUsers, () => {
      Object.keys(allUsers).forEach((userID) => {
        allPromises.push(new Promise((resolve, reject) => {
          let updated = false;
          const prefs = allUsers[userID]["preferences"];
          const allConfigs = ["format", "parser", "account"];

          allConfigs.forEach((configName) => {
            Object.keys(prefs[configName]).forEach((key) => {
              if (key === oldKey) {
                const existingValue = prefs[configName][oldKey];

                if (commit) {
                  // Create the new key with the existing value
                  const updateObj = {};
                  updateObj[newKey] = existingValue;

                  db.ref(`users/${userID}/preferences/${configName}`).update(updateObj).then(() => {
                    console.log(`\t${commit ? "" : "DRY RUN — "}Migrated ${configName}/${oldKey} to ${configName}/${newKey}: ${existingValue} for ${userID}`);
                    resolve();
                  });
                } else {
                  console.log(`\t${commit ? "" : "DRY RUN — "}Migrated ${configName}/${oldKey} to ${configName}/${newKey}: ${existingValue} for ${userID}`);
                  resolve;
                }
                updated = true;
              }
            });
          });

          if (updated) {
            updatedUserCount++;
          } else {
            resolve();
          }
        }));
      });

      Promise.all(allPromises)
          .then((result) => {
            console.log(`Updated ${updatedUserCount} users`);
            firebase.delete();
          })
          .catch((error) => {
            console.error(`ERROR ${error}`);
            firebase.delete();
          });
    });
  });
}

// eslint-disable-next-line no-unused-vars
function deleteConfigKey(toDelete, commit = false) {
  const allPromises = [];
  db.ref(`users`).once("value", (snapshot) => {
    const allUsers = snapshot.val();
    let updatedUserCount = 0;

    saveBackup(allUsers, () => {
      Object.keys(allUsers).forEach((userID) => {
        allPromises.push(new Promise((resolve, reject) => {
          const prefs = allUsers[userID]["preferences"];
          const allConfigs = ["format", "parser", "account"];
          let updated = false;

          allConfigs.forEach((configName) => {
            Object.keys(prefs[configName]).forEach((key) => {
              if (key === toDelete) {
                if (commit) {
                  db.ref(`users/${userID}/preferences/${configName}/${toDelete}`).remove().then(() => {
                    console.log(`\t${commit ? "" : "DRY RUN — "}Deleted ${configName}/${toDelete} for ${userID}`);
                    updatedUserCount++;
                    resolve();
                  });
                } else {
                  console.log(`\t${commit ? "" : "DRY RUN — "}Deleted ${configName}/${toDelete} for ${userID}`);
                  updatedUserCount++;
                  resolve();
                }
                updated = true;
              }
            });
          });

          if (!updated) {
            resolve();
          }
        }));
      });

      Promise.all(allPromises)
          .then((results) => {
            console.log(`Updated ${updatedUserCount} users`);
            firebase.delete();
          })
          .catch((error) => {
            console.error(`ERROR ${error}`);
            firebase.delete();
          });
    });
  });
}

// eslint-disable-next-line no-unused-vars
function addNewConfigKey(configName, newKey, defaultVal, commit = false) {
  const updateObj = {};
  updateObj[newKey] = defaultVal;

  db.ref(`users`).once("value", (snapshot) => {
    const allUsers = snapshot.val();
    const allPromises = [];
    let updatedUserCount = 0;

    saveBackup(allUsers, () => {
      Object.keys(allUsers).forEach((userID) => {
        allPromises.push(
            new Promise((resolve, reject) => {
              if (!(newKey in allUsers[userID]["preferences"][configName])) {
                if (commit) {
                  db.ref(`users/${userID}/preferences/${configName}`).update(updateObj).then(() => {
                    console.log(`\t${commit ? "" : "DRY RUN — "}Added ${configName}/${newKey} = ${defaultVal} for ${userID}`);
                    updatedUserCount++;
                    resolve();
                  });
                } else {
                  console.log(`\t${commit ? "" : "DRY RUN — "}Added ${configName}/${newKey} = ${defaultVal} for ${userID}`);
                  updatedUserCount++;
                  resolve();
                }
              } else {
                resolve();
              }
            }),
        );
      });

      Promise.all(allPromises)
          .then((results) => {
            console.log(`Updated ${updatedUserCount} users`);
            firebase.delete();
          })
          .catch((error) => {
            console.error(`Error ${error}`);
            firebase.delete();
          });
    });
  });
}

// eslint-disable-next-line no-unused-vars
function createNewEmailCampaign({
  emailID = "",
  includeAllExistingUsers = false,
  commit = false,
} = {}) {
  db.ref(`users`).once("value", (snapshot) => {
    const allUsers = snapshot.val();
    const updateObj = {};
    updateObj[emailID] = {"KbYurtn3oDSZkAldrrvVivAMC4v2": EMAIL_STATUS.NOT_SENT}; // Seed it with caiismyname so it's not an empty object

    if (includeAllExistingUsers) {
      for (const userID of Object.keys(allUsers)) {
        updateObj[emailID][userID] = EMAIL_STATUS.NOT_SENT;
      }
    }

    if (commit) {
      db.ref(`emailCampaigns`).once("value", (snapshot) => {
        saveBackup(snapshot.val(), () => {
          db.ref(`emailCampaigns`).update(updateObj).then(() => {
            console.log(`\t${commit ? "" : "DRY RUN — "}Created campaign ${emailID} with ${Object.keys(updateObj[emailID]).length} initial recipients`);
            firebase.delete();
          });
        });
      });
    } else {
      console.log(`\t${commit ? "" : "DRY RUN — "}Created campaign ${emailID} with ${Object.keys(updateObj[emailID]).length} initial recipients`);
      firebase.delete();
    }
  });
}

// migrateConfigKey("", "", false);
// deleteConfigKey("", false);
// addNewConfigKey("", "", "", false);
createNewEmailCampaign({
  emailID: "strava_connection_reminder",
  includeAllExistingUsers: false,
  commit: true,
});
