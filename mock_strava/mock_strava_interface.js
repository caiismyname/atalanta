const functions = require("firebase-functions");
const express = require("express");
const axios = require("axios");
const {DbInterface} = require("./db_interface.js");

const mockStravaApp = express();

class MockStravaInterface {
    static initialize(db) {
        this.userID = 123456789;
        this.stravaID = 987654321
        this.activityID = 1111;

        const dbInterface = new DbInterface(db);

        dbInterface.createNewUser({
            userID: this.userID,
            name: "Galen Rupp",
            email: "foobar@splitz.com",
        })

        dbInterface.saveStravaCredentialsForUser(
            this.userID,
            this.stravaID,
            "fake_access_token",
            "fake_refresh_token",
            new Date("2030-12-31")
        );

        this.sendNonWorkoutRunWebhook();
    }

    static sendNonWorkoutRunWebhook() {
        let req = {
            "object_type": "activity",
            "aspect_type": "create",
            "object_id": this.activityID,
            "owner_id": this.stravaID
        }

        axios({
            method: "post",
            url: `http://localhost:5002/strava_webhook`,
            headers: "application/json",
            data: req
          }).then((res) => {
            console.log("Sent mock non workout run webhook")
          });
    }
  
    static sendWorkoutRun() {
  
    }
  
    static sendBikeActivity() {
      let req = {
        "body": {
          "object_type": "",
          "aspect_type": "",
  
        }
      }
    }
  
    static sendActivityNameUpdate() {
        
    }  

    static returnNonWorkoutRun() {
        return {
            "type": "Run",
            "laps": []
        }
    }
}

exports.mockStravaApp = functions.https.onRequest(mockStravaApp); // Exporting the app for Firebase

  
module.exports = {
    MockStravaInterface
}