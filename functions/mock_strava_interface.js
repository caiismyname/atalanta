const nock = require("nock");
const defaultTestRuns = require("./test/test_runs.json");

class MockStravaInterface {
  static initialize(inputDbInterface) {
    const dbInterface = inputDbInterface;

    this.userID = 123456789;
    this.stravaID = 987654321;
    this.activityID = 1111;

    dbInterface.isUserCreated(this.userID, (isCreated) => {
      if (!isCreated) {
        dbInterface.createNewUser({
          userID: this.userID,
          name: "Galen Rupp",
          email: "foobar@splitz.com",
        });

        console.log("Test user created");

        dbInterface.saveStravaCredentialsForUser(
            this.userID,
            this.stravaID,
            "fake_access_token",
            "fake_refresh_token",
            new Date("2030-12-31").getTime(),
        );

        console.log("Test user strava credentials saved");
      } else {
        console.log("Test user already created");
      }
    });
  }

  static sendNonWorkoutRun(processActivityFunc) {
    const res = defaultTestRuns["(4 x 1mi) + (4 x 400m)"];
    res.type = "Run";

    nock("https://www.strava.com")
        .get(`/api/v3/activities/${this.activityID}`)
        .reply(200, {
          foo: "bar",
          type: "Run",
        },
        );

    processActivityFunc({
      activityID: this.activityID,
      userStravaID: this.stravaID,
      isTest: false,
    });
    console.log("Mock non-workout sent");
  }

  static sendWorkoutRun(processActivityFunc) {
    const res = {...defaultTestRuns["(4 x 1mi) + (4 x 400m)"]};
    res.name = "Morning run";
    res.type = "Run";

    nock("https://www.strava.com")
        .get(`/api/v3/activities/${this.activityID}`)
        .reply(200, res);

    nock("https://www.strava.com")
        .put(`/api/v3/activities/${this.activityID}`)
        .reply(200, {});

    processActivityFunc({
      activityID: this.activityID,
      userStravaID: this.stravaID,
      isTest: false,
      forceParse: true,
    });
    console.log("Mock workout sent");
  }

  static sendBikeActivity(processActivityFunc) {
  }

  static sendActivityNameUpdate(processActivityFunc) {

  }
}

module.exports = {
  MockStravaInterface,
};
