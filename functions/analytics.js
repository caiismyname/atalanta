const ANALYTICS_EVENTS = {
  INBOUND_WEBHOOK: "inbound_webhook",
  ACTIVITY_IS_ELIGIBLE: "activity_is_eligible",
  WORKOUT_DETECTED: "workout_detected",
  WORKOUT_WRITTEN: "workout_written",
  RACE_DETECTED: "race_detected",
  RACE_WRITTEN: "race_written",
  USER_STRAVA_CONNECTION: "user_strava_connection",
  USER_STRAVA_DEACTIVATION: "user_strava_deactivation",
  USER_ACCOUNT_SIGNUP: "user_account_signup",
  USER_ACCOUNT_DELETION: "user_account_deletion",
  TEST: "test_event",
};

const USER_EVENTS = {
  WEBHOOK: "webhook_count",
  RUN: "run_count",
  WORKOUT: "workout_count",
  MOST_RECENT_WORKOUT: "most_recent_workout",
  MOST_RECENT_WEBHOOK: "most_recent_webhook",
};

function getDatestamp() {
  const now = new Date();
  const datestamp = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  return datestamp;
}

function logAnalytics(event, db) {
  const datestamp = getDatestamp();
  const eventRef = db.ref(`analytics/${datestamp}/${event}`);
  eventRef.transaction((currentValue) => {
    return (currentValue || 0) + 1; // Initalize if null, then increment
  });
}

function logUserEvent(event, userID, db) {
  const eventRef = db.ref(`userEvents/${userID}/${event}`);
  switch (event) {
    case USER_EVENTS.WEBHOOK:
    case USER_EVENTS.RUN:
    case USER_EVENTS.WORKOUT:
      eventRef.transaction((currentValue) => {
        return (currentValue || 0) + 1; // Initalize if null, then increment
      });
      break;

    case USER_EVENTS.MOST_RECENT_WEBHOOK:
    case USER_EVENTS.MOST_RECENT_WORKOUT:
      eventRef.transaction((currentValue) => {
        return (getDatestamp());
      });
      break;
    default:
      console.log(`Unknown user event: [${event}]`);
  }
}

module.exports = {
  ANALYTICS_EVENTS,
  USER_EVENTS,
  logAnalytics,
  logUserEvent,
  getDatestamp,
};
