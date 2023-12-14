const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const firebase = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://atalanta-12c63-default-rtdb.firebaseio.com",
  // databaseURL: "http://127.0.0.1:9000/?ns=atalanta-12c63-default-rtdb",
});
const db = firebase.database();

db.ref(`users`).once("value", (snapshot) => {
  const allUsers = snapshot.val();
  const combinedConfigs = {};

  Object.keys(allUsers).forEach((userID) => {
    const userFormatConfig = allUsers[userID]["preferences"]["format"];
    const userParserConfig = allUsers[userID]["preferences"]["parser"];
    const userAccountSettings = allUsers[userID]["preferences"]["account"];

    for (const [option, value] of Object.entries(userFormatConfig)) {
      if (option in combinedConfigs) {
        if (value in combinedConfigs[option]) {
          combinedConfigs[option][value] += 1;
        } else {
          combinedConfigs[option][value] = 1;
        }
      } else {
        combinedConfigs[option] = {};
        combinedConfigs[option][value] = 1;
      }
    }

    for (const [option, value] of Object.entries(userParserConfig)) {
      if (option in combinedConfigs) {
        if (value in combinedConfigs[option]) {
          combinedConfigs[option][value] += 1;
        } else {
          combinedConfigs[option][value] = 1;
        }
      } else {
        combinedConfigs[option] = {};
        combinedConfigs[option][value] = 1;
      }
    }

    for (const [option, value] of Object.entries(userAccountSettings)) {
      if (option in combinedConfigs) {
        if (value in combinedConfigs[option]) {
          combinedConfigs[option][value] += 1;
        } else {
          combinedConfigs[option][value] = 1;
        }
      } else {
        combinedConfigs[option] = {};
        combinedConfigs[option][value] = 1;
      }
    }
  });

  console.log(JSON.stringify(combinedConfigs, null, 4));
  console.log(`Total user count: ${Object.keys(allUsers).length}`);
  firebase.delete(); // This terminates the process. Otherwise the script never ends
});
