const axios = require("axios");
const functions = require("firebase-functions");
const {emailCampaignTriggerProperties} = require("./defaultConfigs.js")

class EmailInterface {
    static getConfig() {
        const config = {
            auth: {
                username: functions.config().mailjet.api_key,
                password: functions.config().mailjet.api_secret
            },
            headers: {
                'Content-Type': 'application/json'
            }
        }
        
        return config;
    }

    static createUser(person, callback) {
        const createApiPath = `https://api.mailjet.com/v3/REST/contact`;
        const propertiesApiPath = `https://api.mailjet.com/v3/REST/contactdata`;
        const listApiPath = `https://api.mailjet.com/v3/REST/listrecipient`;

        const createData = {
            Name: person.firebaseID,
            Email: person.email
        }

        // Create the user
        axios.post(createApiPath, createData, this.getConfig())
            .then(res => {
                const mailjetID = res.data.Data[0].ID
                const propertiesData = [
                    {
                        "Name": "first_name",
                        "Value": person.firstName
                    }
                ];
                
                // Set all default properties to false
                for (let prop of emailCampaignTriggerProperties) {
                    propertiesData.push({
                        "Name": prop,
                        "Value": false
                    });
                }

                axios.put(`${propertiesApiPath}/${mailjetID}`, {"Data": propertiesData}, this.getConfig())
                    .then(_ => {
                        // Add them to the list that workflows pull from
                        // const listID = 10409313; // PROD
                        const listID = 10404001; // TEST 
                        const listData = {
                            "ListID": listID,
                            "ContactID": mailjetID
                        };

                        axios.post(listApiPath, listData, this.getConfig())
                            .then(_ => {
                                // Pass Mailjet contact ID to callback to store in Firebase
                                callback(mailjetID);
                            })
                            .catch(error => {
                                console.error(error);
                                callback(-3);
                            })
                    })
                    .catch(error => {
                        console.error(error);
                        callback(-2);
                    });
            })
            .catch(error => {
                console.error(error);
                callback(-1);
            });
    }
}

module.exports = {EmailInterface}