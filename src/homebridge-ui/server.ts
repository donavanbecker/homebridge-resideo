/* eslint-disable no-console */
import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
import { AuthorizeURL, TokenURL } from '../settings.js';
import { request } from 'undici';
import { createServer } from 'http';
import fs from 'fs';
import url from 'node:url';

class PluginUiServer extends HomebridgePluginUiServer {
  public port!: string;
  public key!: string;
  public secret!: string;
  public hostname!: string;

  constructor(
  ) {
    super();

    this.onRequest('Start Resideo Login Server', (): any => {

      const runningServer = createServer(async (req, res) => {
        try {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          const urlParts = url.parse(req.url || '', true);
          const pathArr = urlParts.pathname ? urlParts.pathname.split('?') : [];
          const action = pathArr[0].replace('/', '');
          const query = urlParts.query;
          switch (action) {
            case 'start': {
              this.key = query.key as string;
              this.secret = query.secret as string;
              this.hostname = query.host as string;
              this.port = query.port as string || '8585';
              const url = AuthorizeURL + '?response_type=code&redirect_uri=' + encodeURI('http://' + this.hostname
                + `:${this.port}/auth`) + '&' + 'client_id=' + this.key;
              res.end('<script>window.location.replace(\'' + url + '\');</script>');
              break;
            }
            case 'auth': {
              if (query.code) {
                try {
                  const code = query.code;
                  const auth = Buffer.from(this.key + ':' + this.secret).toString('base64');

                  const { body, statusCode } = await request(TokenURL, {
                    body: JSON.stringify({
                      'code': code,
                      'grant_type': 'authorization_code',
                      'redirect_uri': encodeURI('http://' + this.hostname + `:${this.port}/auth`),
                    }),
                    headers: {
                      'Accept': 'application/json',
                      'Authorization': `Bearer ${auth}`,
                      'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    method: 'POST',
                  });
                  const response: any = await body.json();
                  console.log(`(Token) ${response}: ${JSON.stringify(response)}, statusCode: ${statusCode}`);
                  if (response.access_token) {
                    this.pushEvent('creds-received', {
                      access: response.access_token,
                      key: this.key,
                      refresh: response.refresh_token,
                      secret: this.secret,
                    });
                    res.end('Success. You can close this window now.');
                  } else {
                    res.end('oops.');
                  }
                } catch (err) {
                  res.end('<strong>An error occurred:</strong><br>' + JSON.stringify(err) + '<br><br>Close this window and start again');
                }
              } else {
                res.end('<strong>An error occurred:</strong><br>no code received<br><br>Close this window and start again');
              }
              break;
            } default: {
              // should never happen
              res.end('welcome to the server');
              break;
            }
          }// end switch
        } catch (err) {
          console.log(err);
        }
      });
      runningServer.listen(this.port, () => {
        console.log('Server is running');
      });
      setTimeout(() => {
        runningServer.close();
      }, 300000);
    });



    /*
  A native method getCachedAccessories() was introduced in config-ui-x v4.37.0
  The following is for users who have a lower version of config-ui-x
*/


    this.onRequest('getCachedAccessories', () => {
      try {
        const plugin = 'homebridge-resideo';
        const devicesToReturn = [];

        // The path and file of the cached accessories
        const accFile = this.homebridgeStoragePath + '/accessories/cachedAccessories';

        // Check the file exists
        if (fs.existsSync(accFile)) {
        // read the cached accessories file
          const cachedAccessories: any[] = JSON.parse(fs.readFileSync(accFile, 'utf8'));

          cachedAccessories.forEach((accessory: any) => {
          // Check the accessory is from this plugin
            if (accessory.plugin === plugin) {
            // Add the cached accessory to the array
              devicesToReturn.push(accessory.accessory as never);
            }
          });
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

function startPluginUiServer(): PluginUiServer {
  return new PluginUiServer();
}

startPluginUiServer();