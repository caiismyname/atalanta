const {EmailInterface} = require("./email_interface.js");
const {emailCampaignTriggerProperties} = require("./defaultConfigs.js");

function clearOldWorkouts() {

}

function sendStravaConnectionReminder(db) {
    db.ref(`users`)
        .orderByChild('stravaConnected')
        .equalTo(false)
        .once("value", (snapshot) => {
            const users = snapshot.val();
            for (let user of users) {
                EmailInterface.updateProperty(user.email, emailCampaignTriggerProperties.STRAVA_UNCONNECTED)
            }
        }
    );
}


module.exports = {
    clearOldWorkouts,
    sendStravaConnectionReminder
}