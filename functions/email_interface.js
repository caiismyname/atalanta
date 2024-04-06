const axios = require("axios");
const functions = require("firebase-functions");
const {emailCampaigns, emailCampaignTriggerProperties} = require("./defaultConfigs.js");
const {getDatestamp} = require("./analytics.js");

class EmailInterface {
  constructor(db) {
    this.db = db;
  }

  // static getConfig() {
  //   const config = {
  //     auth: {
  //       username: functions.config().mailjet.api_key,
  //       password: functions.config().mailjet.api_secret,
  //     },
  //     headers: {
  //       "Content-Type": "application/json",
  //     },
  //   };

  //   return config;
  // }

  // static createUser(person) {
  //   const createApiPath = `https://api.mailjet.com/v3/REST/contact`;
  //   const propertiesApiPath = `https://api.mailjet.com/v3/REST/contactdata`;
  //   const listApiPath = `https://api.mailjet.com/v3/REST/listrecipient`;

  //   const createData = {
  //     Name: person.firstName,
  //     Email: person.email,
  //   };

  //   // Create the user
  //   axios.post(createApiPath, createData, this.getConfig())
  //       .then((res) => {
  //       //   const mailjetID = res.data.Data[0].ID;
  //         const propertiesData = [
  //           {
  //             "Name": "first_name",
  //             "Value": person.firstName,
  //           },
  //         ];

  //         // Set all default properties to false
  //         for (const prop of Object.values(emailCampaignTriggerProperties)) {
  //           propertiesData.push({
  //             "Name": prop,
  //             "Value": false,
  //           });
  //         }

  //         axios.put(`${propertiesApiPath}/${person.email}`, {"Data": propertiesData}, this.getConfig())
  //             .then((_) => {
  //               // Add them to the list that workflows pull from
  //               // const listID = 10409313; // PROD
  //               const listID = 10404001; // TEST
  //               const listData = {
  //                 "ListID": listID,
  //                 "ContactAlt": person.email,
  //               };

  //               axios.post(listApiPath, listData, this.getConfig())
  //                   .catch((error) => {
  //                     console.error(error);
  //                   });
  //             })
  //             .catch((error) => {
  //               console.error(error);
  //             });
  //       })
  //       .catch((error) => {
  //         console.error(error);
  //       });
  // }

  // static updateProperty(email, prop, callback) {
  //   console.log(`Updated property called for ${email}, overriding with davidcai2012@gmail.com`);
  //   email = "davidcai2012@gmail.com";
  //   const propertiesApiPath = `https://api.mailjet.com/v3/REST/contactdata`;
  //   const propertiesData = [
  //     {
  //       "Name": prop,
  //       "Value": true,
  //     },
  //   ];
  //   axios.put(`${propertiesApiPath}/${email}`, {"Data": propertiesData}, this.getConfig())
  //       .then((_)=>{
  //         setTimeout(() => {
  //           axios.put(`${propertiesApiPath}/${email}`, {"Data": [{
  //             "Name": prop,
  //             "Value": false,
  //           }]}, this.getConfig())
  //               .then((_) => {
  //                 console.log(`\tReverted the prop`);
  //               })
  //               .catch((error) => {
  //                 console.error(error);
  //               });
  //         }, 10000);

  //         callback();
  //       })
  //       .catch((error) => {
  //         console.error(error);
  //       });
  // }

  sendEmail(userID, emailAddress, emailID) {
    this.verifyEmailIsEligible(userID, emailID, (isEligible) => {
      if (isEligible) {
        // actual email sending logic

        console.log(`User ${userID} was sent email [${emailID}]`);
        this.logEmailSent(userID, emailID, EMAIL_STATUS.SENT);
      } else {
        console.log(`User ${userID} not eligible to be sent email [${emailID}]`);
        this.logEmailSent(userID, emailID, EMAIL_STATUS.BLOCKED);
      }
    });
  }

  verifyEmailIsEligible(userID, emailID, callback) {
    this.db.ref(`users/${userID}/preferences/account`).once("value", (settingsSnapshot) => {
      const optedIn = settingsSnapshot.val().emailOptIn;
      this.db.ref(`emailCampaigns/${emailID}/${userID}`).once("value", (emailsSnapshot) => {
        const hasNotAlreadyReceivedEmail = emailsSnapshot.val() == EMAIL_STATUS.NOT_SENT;

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


  emailTriggerDaemon() {
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
              if (userWorkoutCount <= workoutCountThreshold) {
                emailsToSend.push({
                  userID: userID,
                  email: user.email,
                  campaign: emailCampaigns.MONETIZATION_1,
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
            if ((today - createDate) / (1000 * 60 * 60 * 24) > daysAfterSignup) { // Datestamps are all day granularity so time is not a consideration
              if (!user.stravaConnected) {
                emailsToSend.push({
                  userID: userID,
                  email: user.email,
                  campaign: emailCampaigns.STRAVA_CONNECTION_REMINDER,
                });
                totalEligibleForSend++;
              } else {
                allCampaigns[emailCampaigns.STRAVA_CONNECTION_REMINDER][userID] = EMAIL_STATUS.BLOCKED;
              }
            }
          }

          console.log(`${emailCampaigns.STRAVA_CONNECTION_REMINDER}: ${totalEligibleForSend} eligible users of ${totalNotSentForCampaign} not sent (${totalRegisteredForCampaign} total)`);

          //
          // Update the campaigns for the BLOCKED users
          //
          this.db.ref(`emailCampaigns`).update(allCampaigns)
              .then(() => {
                for (const task of emailsToSend) {
                  this.sendEmail(task.userID, task.email, task.campaign);
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
