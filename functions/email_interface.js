const axios = require("axios");
const functions = require("firebase-functions");
const {emailCampaignTriggerProperties} = require("./defaultConfigs.js");

class EmailInterface {
  static getConfig() {
    const config = {
      auth: {
        username: functions.config().mailjet.api_key,
        password: functions.config().mailjet.api_secret,
      },
      headers: {
        "Content-Type": "application/json",
      },
    };

    return config;
  }

  static createUser(person) {
    const createApiPath = `https://api.mailjet.com/v3/REST/contact`;
    const propertiesApiPath = `https://api.mailjet.com/v3/REST/contactdata`;
    const listApiPath = `https://api.mailjet.com/v3/REST/listrecipient`;

    const createData = {
      Name: person.firstName,
      Email: person.email,
    };

    // Create the user
    axios.post(createApiPath, createData, this.getConfig())
        .then((res) => {
        //   const mailjetID = res.data.Data[0].ID;
          const propertiesData = [
            {
              "Name": "first_name",
              "Value": person.firstName,
            },
          ];

          // Set all default properties to false
          for (const prop of Object.values(emailCampaignTriggerProperties)) {
            propertiesData.push({
              "Name": prop,
              "Value": false,
            });
          }

          axios.put(`${propertiesApiPath}/${person.email}`, {"Data": propertiesData}, this.getConfig())
              .then((_) => {
                // Add them to the list that workflows pull from
                // const listID = 10409313; // PROD
                const listID = 10404001; // TEST
                const listData = {
                  "ListID": listID,
                  "ContactAlt": person.email,
                };

                axios.post(listApiPath, listData, this.getConfig())
                    .catch((error) => {
                      console.error(error);
                    });
              })
              .catch((error) => {
                console.error(error);
              });
        })
        .catch((error) => {
          console.error(error);
        });
  }

  static updateProperty(email, prop, callback) {
    console.log(`Updated property called for ${email}, overriding with davidcai2012@gmail.com`);
    email = "davidcai2012@gmail.com";
    const propertiesApiPath = `https://api.mailjet.com/v3/REST/contactdata`;
    const propertiesData = [
      {
        "Name": prop,
        "Value": true,
      },
    ];
    axios.put(`${propertiesApiPath}/${email}`, {"Data": propertiesData}, this.getConfig())
        .then((_)=>{
          setTimeout(() => {
            axios.put(`${propertiesApiPath}/${email}`, {"Data": {
              "Name": prop,
              "Value": false,
            }}, this.getConfig());
            console.log(`\tReverted the prop`);
          }, 10000);

          callback();
        })
        .catch((error) => {
          console.error(error);
        });
  }
}

module.exports = {EmailInterface};
