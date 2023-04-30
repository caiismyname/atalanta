const isEmulator = process.env.FUNCTIONS_EMULATOR;
const ANALYTICS_EVENTS = {
  INBOUND_WEBHOOK: "inbound_webhook",
  ACTIVITY_IS_ELIGIBLE: "activity_is_eligible",
  WORKOUT_DETECTED: "workout_detected",
  WORKOUT_WRITTEN: "workout_written",
  USER_STRAVA_CONNECTION: "user_strava_connection",
  USER_STRAVA_DEACTIVATION: "user_strava_deactivation",
  USER_ACCOUNT_SIGNUP: "user_account_signup",
  USER_ACCOUNT_DELETION: "user_account_deletion",
  TEST: "test_event",
};

function logAnalytics(event, db) {
  const now = new Date();
  const datestamp = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

  if (!isEmulator) {
    const eventRef = db.ref(`analytics/${datestamp}/${event}`);
    eventRef.transaction((currentValue) => {
      return (currentValue || 0) + 1; // Initalize if null, then increment
    });
  } else {
    console.log(`ANALYTICS NOT SAVED B/C EMULATOR: ${datestamp} | ${event}`);
  }
}

module.exports = {
  ANALYTICS_EVENTS,
  logAnalytics,
};
