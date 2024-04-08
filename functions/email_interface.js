const axios = require("axios");
const functions = require("firebase-functions");
const {emailCampaigns} = require("./defaultConfigs.js");
const {getDatestamp} = require("./analytics.js");

class EmailInterface {
  constructor(db) {
    this.db = db;
  }

  getConfig() {
    return {
      auth: {
        username: "api",
        password: functions.config().mailgun.api_key,
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    };
  }

  sendEmail(
      {
        userID = "123",
        name = "John",
        emailAddress = "caiismyname2012@gmail.com",
        template = "fakeCampaign",
      } = {}) {
    this.verifyEmailIsEligible(userID, template, (isEligible) => {
      if (isEligible) {
        // actual email sending logic
        const domain = "workoutsplitz.com";
        const requestData = {
          "from": "David from Splitz <hello@workoutsplitz.com>",
          "to": `${name} <${`caiismyname2012@gmail.com`}>`,
          "template": template,
          "h:X-Mailgun-Variables": JSON.stringify({name: `${name} [${emailAddress}] - [${userID}]`}),
        };

        axios.post(`https://api.mailgun.net/v3/${domain}/messages`, requestData, this.getConfig())
            .then((response) => {
              console.log(`User ${userID} was sent email [${template}]. ID: ${response.data.id}`);
              this.logEmailSent(userID, template, EMAIL_STATUS.SENT);
            })
            .catch((error) => {
              console.error("\tError sending email:", error.response.data);
            });
      } else {
        console.log(`User ${userID} not eligible to be sent email [${template}]`);
        this.logEmailSent(userID, template, EMAIL_STATUS.BLOCKED);
      }
    });
  }

  verifyEmailIsEligible(userID, emailID, callback) {
    this.db.ref(`users/${userID}/preferences/account`).once("value", (settingsSnapshot) => {
      const optedIn = settingsSnapshot.val().emailOptIn;
      this.db.ref(`emailCampaigns/${emailID}/${userID}`).once("value", (emailsSnapshot) => {
        const hasNotAlreadyReceivedEmail = emailsSnapshot.val() === EMAIL_STATUS.NOT_SENT;

        callback(optedIn && hasNotAlreadyReceivedEmail);
      });
    });
  }

  logEmailSent(userID, emailID, status) {
    this.db.ref(`emailCampaigns/${emailID}`).update(
        {[userID]: status},
        (error) => {
          console.error(error);
        },
    );
  }

  runDailyTriggerDaemon() {
    /*
      Iterates through all Email Campaigns.
      For each campaign, filter to the NOT_SENT users and check if they meet the send condition.
        If so, add them to a "bulk send" list that is sent at the end.
        If they hit a condition such that the campaign is no longer relevant, mark them as blocked.
        No-op if they haven't hit the condition.
    */

    console.log(`Running email trigger daemon for ${getDatestamp()}`);

    this.db.ref(`emailCampaigns`).once("value", (emailCampaignsSnapshot) => {
      this.db.ref(`users`).once("value", (usersSnapshot) => {
        this.db.ref(`userEvents`).once("value", (userEventsSnapshot) => {
          const allCampaigns = emailCampaignsSnapshot.val();
          const allUsers = usersSnapshot.val();
          const userEvents = userEventsSnapshot.val();

          const emailsToSend = [];
          let totalRegisteredForCampaign = 0;
          let totalNotSentForCampaign = 0;
          let totalEligibleForSend = 0;

          //
          // Monetization campaign
          //
          totalRegisteredForCampaign = Object.keys(allCampaigns[emailCampaigns.MONETIZATION_1]).length;
          const workoutCountThreshold = 20;
          const eligibleUsersMonetizationOne = Object.keys(
              Object.fromEntries(
                  Object.entries(allCampaigns[emailCampaigns.MONETIZATION_1])
                      .filter(([_, status]) => status === EMAIL_STATUS.NOT_SENT),
              ),
          );

          for (const userID of eligibleUsersMonetizationOne) {
            totalNotSentForCampaign++;
            if (userID in userEvents) {
              const user = allUsers[userID];
              const userWorkoutCount = userEvents[userID].workout_count;
              if (userWorkoutCount === workoutCountThreshold || userWorkoutCount === workoutCountThreshold + 1) {
                emailsToSend.push({
                  userID: userID,
                  email: user.email,
                  template: emailCampaigns.MONETIZATION_1,
                  name: user.name,
                });
                totalEligibleForSend++;
              } else if (userWorkoutCount > workoutCountThreshold) {
                allCampaigns[emailCampaigns.MONETIZATION_1][userID] = EMAIL_STATUS.BLOCKED; // Shouldn't occur, but writing this as a safety fallthrough
              }
            }
          }

          console.log(`${emailCampaigns.MONETIZATION_1}: ${totalEligibleForSend} eligible users of ${totalNotSentForCampaign} not sent (${totalRegisteredForCampaign} total)`);


          //
          // Strava Connection campaign
          //
          totalRegisteredForCampaign = Object.keys(allCampaigns[emailCampaigns.STRAVA_CONNECTION_REMINDER]).length;
          totalNotSentForCampaign = 0;
          totalEligibleForSend = 0;

          const daysAfterSignup = 2;
          const eligibleUsersStravaConnection = Object.keys(
              Object.fromEntries(
                  Object.entries(allCampaigns[emailCampaigns.STRAVA_CONNECTION_REMINDER])
                      .filter(([_, status]) => status === EMAIL_STATUS.NOT_SENT),
              ),
          );

          for (const userID of eligibleUsersStravaConnection) {
            totalNotSentForCampaign++;
            const user = allUsers[userID];
            const today = new Date(getDatestamp());
            const createDate = new Date(user.createDate);
            if ((today - createDate) / (1000 * 60 * 60 * 24) === daysAfterSignup) { // Datestamps are all day granularity so time is not a consideration
              if (!user.stravaConnected) {
                emailsToSend.push({
                  userID: userID,
                  email: user.email,
                  template: emailCampaigns.STRAVA_CONNECTION_REMINDER,
                  name: user.name,
                });
                totalEligibleForSend++;
              } else {
                allCampaigns[emailCampaigns.STRAVA_CONNECTION_REMINDER][userID] = EMAIL_STATUS.BLOCKED;
              }
            }
          }

          console.log(`${emailCampaigns.STRAVA_CONNECTION_REMINDER}: ${totalEligibleForSend} eligible users of ${totalNotSentForCampaign} not sent (${totalRegisteredForCampaign} total)`);

          //
          // Perform campaign updates / email sends
          //
          this.db.ref(`emailCampaigns`).update(allCampaigns)
              .then(() => {
                for (const task of emailsToSend) {
                  this.sendEmail(task);
                }
              });
        });
      });
    });
  }
}

const EMAIL_STATUS = {
  SENT: "SENT",
  NOT_SENT: "NOT_SENT",
  BLOCKED: "BLOCKED", // Hit send condition but not sent alternate reason. Do not re-send.
};


module.exports = {EmailInterface, EMAIL_STATUS};
