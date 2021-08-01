/* eslint-disable no-console */
/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
/* jshint node: true,esversion: 9, -W014, -W033 */
/* eslint-disable new-cap */
'use strict';

const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const exec = require('child_process').exec;
const fs = require('fs');
const http = require('http');
const url = require('url');

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    /*
      A native method getCachedAccessories() was introduced in config-ui-x v4.37.0
      The following is for users who have a lower version of config-ui-x
    */

    this.onRequest('/startServer', () => {
      const runningServer = http.createServer(function (req, res) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        const urlParts = url.parse(req.url, true);
        const pathArr = urlParts.pathname.split('?');
        const action = pathArr[0].replace('/', '');
        const query = urlParts.query;
        switch (action) {
          case 'start': {
            this.key = urlParts[2];
            this.secret = urlParts[3];
            const url = 'https://api.honeywell.com/oauth2/authorize?' +
              'response_type=code&redirect_uri=' + encodeURI('http://127.0.0.1:64911/auth') + '&' +
              'client_id=' + query.key;
            res.end('<script>window.location.replace(\'' + url + '\');</script>');
            break;
          }
          case 'auth': {
            if (query.code) {
              const code = query.code;
              const auth = Buffer.from(this.key + ':' + this.secret).toString('base64');
              let curlString = '';
              curlString += 'curl -X POST ';
              curlString += '--header "Authorization: Basic ' + auth + '" ';
              curlString += '--header "Accept: application/json" ';
              curlString += '--header "Content-Type: application/x-www-form-urlencoded" ';
              curlString += '-d "';
              curlString += 'grant_type=authorization_code&';
              curlString += 'code=' + code + '&';
              curlString += 'redirect_uri=' + encodeURI('http://127.0.0.1:64911/auth');
              curlString += '" ';
              curlString += '"https://api.honeywell.com/oauth2/token"';

              console.log(curlString);
              console.log(query);
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              exec(curlString, (error, stdout, stderr) => {
                const response = JSON.parse(stdout);
                console.log(JSON.stringify(response));
                if (response.access_token) {
                  this.pushEvent('creds-received', {
                    access: response.access_token,
                    refresh: response.refresh_token,
                  });
                } else {
                  this.pushEvent('creds-received', {
                    error: JSON.stringify(response),
                  });
                }

                if (error !== null) {
                  console.log('exec error: ' + JSON.stringify(error));
                }
                if (stderr !== null) {
                  console.log('exec stderr: ' + JSON.stringify(stderr));
                }

                res.end(JSON.stringify(response));
                if (error) {
                  res.end('error - ' + JSON.stringify(error));
                }
                console.log(JSON.stringify(res));
                console.log(JSON.stringify(response));
              });
              res.end('not sure how we get here');
            } else {
              res.end('an error occurred. close this window and try again.');
            }
            break;
          }
          default: {
            // should never happen
            res.end('welcome to the server');
            break;
          }
        }
      });
      runningServer.listen(64911, err => {
        if (err) {
          Console.log(err);
        }
      });

      setTimeout(() => {
        runningServer.close();
      }, 300000);
    });

    /*
      A native method getCachedAccessories() was introduced in config-ui-x v4.37.0
      The following is for users who have a lower version of config-ui-x
    */

    this.onRequest('/getCachedAccessories', async () => {
      try {
        // Define the plugin and create the array to return
        const plugin = 'homebridge-honeywell-home';
        const devicesToReturn = [];

        // The path and file of the cached accessories
        const accFile = this.homebridgeStoragePath + '/accessories/cachedAccessories';

        // Check the file exists
        if (fs.existsSync(accFile)) {
          // Read the cached accessories file
          let cachedAccessories = await fs.promises.readFile(accFile);

          // Parse the JSON
          cachedAccessories = JSON.parse(cachedAccessories);

          // We only want the accessories for this plugin
          cachedAccessories
            .filter(accessory => accessory.plugin === plugin)
            .forEach(accessory => devicesToReturn.push(accessory));
        }

        // Return the array
        return devicesToReturn;
      } catch (err) {
        // Just return an empty accessory list in case of any errors
        return [];
      }
    });
    this.ready();
  }
}

(() => new PluginUiServer())();
