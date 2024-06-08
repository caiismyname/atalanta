const OAuth = require('oauth');
const {defineString} = require("firebase-functions/params");

class GarminInterface {

    // Private
    static garminConfigDetails() {
        return {
            garminConsumerKey: 'yourConsumerKey',
            garminConsumerSecret: 'yourConsumerSecret',
            garminRequestTokenURL: 'https://connectapi.garmin.com/oauth-service/oauth/request_token',
            garminAccessTokenURL: 'https://connectapi.garmin.com/oauth-service/oauth/access_token'
        }
    }

    // Private
    static getOAuthHandler() {
        const config = this.garminConfigDetails();
        const oauth = new OAuth.OAuth(
            config.garminRequestTokenURL,
            config.garminAccessTokenURL,
            config.garminConsumerKey,
            config.garminConsumerSecret,
            '1.0',
            'http://workoutsplitz.com/garmin_oauth_redirect',
            'HMAC-SHA1'
        );

        return oauth;
    }

    // Calls Garmin for an initial request token + secret, 
    // which are then exchanged for an access token after the user grants permission on Garmin's UI.
    //
    // This call is not specific to a given user, but we pass the returned request token
    // as a param when redirecting the browser to Garmin's auth page. 
    //
    // Note that Garmin sometimes calls the request token the "oauth token" (distinct from the "access token")
    static getRequestToken(callback) {
        const oauth = getOAuthHandler();
        oauth.getOAuthRequestToken((error, requestToken, requestTokenSecret) => {
            if (error) {
                console.error('Error getting Garmin OAuth request token');
                callback({});
                return;
            }
            
            callback({
                "requestToken": requestToken,
                "requestTokenSecret": requestTokenSecret
            });
        });
    }

    static getAccessToken({
        callback =()=>{}, 
        requestToken = "", 
        requestTokenSecret = "",
        oauthVerifier = ""
    } = {}) {
        const oauth = getOAuthHandler();
        oauth.getOAuthAccessToken(
            requestToken, 
            requestTokenSecret, 
            oauthVerifier, 
            (error, oauthAccessToken, oauthAccessTokenSecret) => {
            if (error) {
              console.error(`Error exchanging request token for Garmin OAuth access token for user ${userID}`);
              callback({});
              return;
            }

            callback({
                oauthAccessToken: oauthAccessToken,
                oauthAccessTokenSecret: oauthAccessTokenSecret
            });
        });
    }

    static getGarminID(accessToken, callback) {
        const garminIDFetchURL = `https://apis.garmin.com/wellness-api/rest/user/id`;

        return "";
    }

    static acknowledgeWebhook(res) {
        res.status(200).send("EVENT_RECEIVED");
    }

    static getActivityFile({
        garminUserID = "",
        fileURL = ""
    } = {}) {

        return "";
    }

    static convertActivityFile(file) {
        return {}
    }

    
}

module.exports = {
    GarminInterface
};