import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { interval } from 'rxjs';
import axios, { AxiosInstance } from 'axios';
import * as qs from 'querystring';
import { readFileSync, writeFileSync } from 'fs';

import { PLATFORM_NAME, PLUGIN_NAME, AuthURL, LocationURL, DeviceURL, UIurl } from './settings';
import { ThermostatLCCPlatformAccessory } from './platformLCCAccessory';
import { ThermostatTCCPlatformAccessory } from './platformTCCAccessory';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class HoneywellHomeThermostatPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public axios: AxiosInstance = axios.create({
    responseType: 'json',
  });

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);
    // only load if configured
    if (!this.config) {
      return;
    }

    // verify the config
    try {
      this.verifyConfig();
      this.log.debug('Config OK');
    } catch (e) {
      this.log.error(e.message);
      return;
    }

    // setup axios interceptor to add headers / api key to each request
    this.axios.interceptors.request.use((request) => {
      request.headers.Authorization = 'Bearer ' + this.config.credentials.accessToken;
      request.params = request.params || {};
      request.params.apikey = this.config.credentials.consumerKey;
      request.headers['Content-Type'] = 'application/json';
      return request;
    });

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', async () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      try {
        await this.discoverDevices();
      } catch (e) {
        this.log.error('Failed to refresh access token.', e.message);
      }

      interval((1800 / 3) * 1000).subscribe(async () => {
        try {
          await this.getAccessToken();
        } catch (e) {
          this.log.error('Failed to refresh access token.');
        }
      });
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * Verify the config passed to the plugin is valid
   */
  verifyConfig() {
    if (!this.config.options || typeof this.config.options !== 'object') {
      this.config.options = {};
    }

    this.config.options.ttl = this.config.options.ttl || 1800; // default 1800 seconds

    if (!this.config.credentials.consumerSecret && this.config.options.ttl < 1800) {
      this.log.debug('TTL must be set to 1800 or higher unless you setup your own consumerSecret.');
      this.config.options.ttl = 1800;
    }

    if (!this.config.credentials) {
      throw new Error('Missing Credentials');
    }
    if (!this.config.credentials.consumerKey) {
      throw new Error('Missing consumerKey');
    }
    if (!this.config.credentials.refreshToken) {
      throw new Error('Missing refreshToken');
    }
  }

  /**
   * Exchange the refresh token for an access token
   */
  async getAccessToken() {
    let result: any;

    if (this.config.credentials.consumerSecret) {
      result = (await axios({
        url: AuthURL,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        auth: {
          username: this.config.credentials.consumerKey,
          password: this.config.credentials.consumerSecret,
        },
        data: qs.stringify({
          grant_type: 'refresh_token',
          refresh_token: this.config.credentials.refreshToken,
        }),
        responseType: 'json',
      })).data;
    } else {
      this.log.warn('Please re-link your account in the Homebridge UI.');
      // if no consumerSecret is defined, attempt to use the shared consumerSecret
      try {
        result = (await axios.post(UIurl,
          {
            consumerKey: this.config.credentials.consumerKey,
            refresh_token: this.config.credentials.refreshToken,
          },
        )).data;
      } catch (e) {
        this.log.error('Failed to exchange refresh token for an access token.', e.message);
        throw e;
      }
    }

    this.config.credentials.accessToken = result.access_token;
    this.log.warn('Got access token:', this.config.credentials.accessToken);

    // check if the refresh token has changed
    if (result.refresh_token !== this.config.credentials.refreshToken) {
      this.log.warn('New refresh token:', result.refresh_token);
      await this.updateRefreshToken(result.refresh_token);
    }

    this.config.credentials.refreshToken = result.refresh_token;
  }

  /**
   * The refresh token will periodically change.
   * This method saves the updated refresh token in the config.json file
   * @param newRefreshToken 
   */
  async updateRefreshToken(newRefreshToken: string) {
    try {
      // check the new token was provided
      if (!newRefreshToken) {
        throw new Error('New token not provided');
      }

      // load in the current config
      const currentConfig = JSON.parse(readFileSync(this.api.user.configPath(), 'utf8'));

      // check the platforms section is an array before we do array things on it
      if (!Array.isArray(currentConfig.platforms)) {
        throw new Error('Cannot find platforms array in config');
      }

      // find this plugins current config
      const pluginConfig = currentConfig.platforms.find(x => x.platform === PLATFORM_NAME);

      if (!pluginConfig) {
        throw new Error(`Cannot find config for ${PLATFORM_NAME} in platforms array`);
      }

      // check the .credentials is an object before doing object things with it
      if (typeof pluginConfig.credentials !== 'object') {
        throw new Error('pluginConfig.credentials is not an object');
      }

      // set the refresh token
      pluginConfig.credentials.refreshToken = newRefreshToken;

      // save the config, ensuring we maintain pretty json
      writeFileSync(this.api.user.configPath(), JSON.stringify(currentConfig, null, 4));

      this.log.warn('Homebridge config.json has been updated with new refresh token.');

    } catch (e) {
      this.log.error(`Failed to update refresh token in config: ${e.message}`);
    }
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    // try and get the access token. If it fails stop here.
    try {
      await this.getAccessToken();
    } catch (e) {
      this.log.error('Could not discover devices.', e.message);
      return;
    }

    // get the locations
    const locations = (await this.axios.get(LocationURL)).data;

    this.log.info(`# of Locations Found: ${locations.length}.`);

    // get the devices at each location
    for (const location of locations) {
      this.log.info(`Getting devices for ${location.name}...`);

      const locationId = location.locationID;
      this.log.debug(locationId);
      this.log.debug(location);
      this.log.debug(`# of Thermostats Found at ${location.name}: ${location.devices.length}.`);
      for (const device of location.devices) {
        this.log.debug(device);
        this.log.debug(device.deviceID);

        // LLC Devices
        if ((device.deviceID.startsWith('LCC')) === true) {
          for (const group of device.groups) {
            this.log.debug(`Found ${device.groups.length} Group(s)`);
            this.log.debug(group);
            this.log.debug(group.id);
            for (const room of group.rooms) {
              this.log.debug(`Found Room ${room}`);
              this.log.debug(group.rooms);
              this.log.debug(room);
            }
            {
              const accessory = (await this.axios.get(`${DeviceURL}/thermostats/${device.deviceID}/group/${group.id}/rooms`, {
                params: {
                  locationId: location.locationID,
                },
              })).data;
              for (const roomaccessories of group.rooms) {
                this.log.debug(`Found ${accessory.rooms.length} accessory.rooms`);
                this.log.debug(group.rooms);
                this.log.debug(roomaccessories);
              }
              for (const accessories of accessory.rooms) {
                this.log.debug(accessory.rooms);
                this.log.debug(accessories);
                for (const findaccessories of accessories.accessories) {
                  this.log.debug(`Found ${accessories.accessories.length} accessories.accessories`);
                  this.log.debug(accessories.accessories);
                  this.log.debug(findaccessories);
                  this.log.debug(findaccessories.accessoryAttribute.type);

                  // generate a unique id for the accessory this should be generated from
                  // something globally unique, but constant, for example, the device serial
                  // number or MAC address
                  if (findaccessories.accessoryAttribute.type === 'Thermostat'
                    && device.isAlive && device.deviceClass === 'Thermostat') {
                    // eslint-disable-next-line max-len
                    this.log.debug(`LLC UDID: ${accessories.name}${findaccessories.accessoryAttribute.type}${findaccessories.accessoryAttribute.serialNumber}${device.deviceID}`);
                    // eslint-disable-next-line max-len
                    const uuid = this.api.hap.uuid.generate(`${accessories.name}${findaccessories.accessoryAttribute.type}${findaccessories.accessoryAttribute.serialNumber}${device.deviceID}`);

                    // see if an accessory with the same uuid has already been registered and restored from
                    // the cached devices we stored in the `configureAccessory` method above
                    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

                    if (existingAccessory) {
                      // the accessory already exists
                      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                      // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                      existingAccessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
                      this.api.updatePlatformAccessories([existingAccessory]);

                      // create the accessory handler for the restored accessory
                      // this is imported from `platformAccessory.ts`
                      new ThermostatLCCPlatformAccessory(this, existingAccessory, locationId, device);

                    } else {
                      // the accessory does not yet exist, so we need to create it
                      this.log.info('Adding new accessory:', accessories.name);
                      this.log.debug(`Registering new device: ${accessories.name} - ${device.deviceID}`);

                      // create a new accessory
                      const accessory = new this.api.platformAccessory(accessories.name, uuid);

                      // store a copy of the device object in the `accessory.context`
                      // the `context` property can be used to store any data about the accessory you may need
                      accessory.context.device = device;
                      accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;

                      // create the accessory handler for the newly create accessory
                      // this is imported from `platformAccessory.ts`
                      new ThermostatLCCPlatformAccessory(this, accessory, locationId, device);

                      // link the accessory to your platform
                      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                    }
                  } else if (findaccessories.accessoryAttribute.type === 'IndoorAirSensor') {
                    // eslint-disable-next-line max-len
                    this.log.info(`An ${findaccessories.accessoryAttribute.type} was found. If you haven't already installed homebridge-honeywell-home-roomesensors plugin, install it to be able to view this room sensor inside HomeKit.`);
                  } else {
                    // eslint-disable-next-line max-len
                    this.log.info(`Ignoring device named ${accessories.name} - ${findaccessories.accessoryAttribute.type}, Alive Status: ${device.isAlive}`);
                  }
                }
              }
            }
          } //TCC Devices
        } else if ((device.deviceID.startsWith('TCC')) === true) {
          // generate a unique id for the accessory this should be generated from
          // something globally unique, but constant, for example, the device serial
          // number or MAC address
          const devices = (await this.axios.get(DeviceURL, {
            params: {
              locationId: location.locationID,
            },
          })).data;
          for (const device of devices) {
            this.log.debug(device);
            this.log.debug(device.deviceID);
            if (device.isAlive && device.deviceClass === 'Thermostat') {
              // eslint-disable-next-line max-len
              this.log.debug(`TCC UDID: ${device.name}${device.deviceID}`);
              // eslint-disable-next-line max-len
              const uuid = this.api.hap.uuid.generate(`${device.name}${device.deviceID}`);

              // see if an accessory with the same uuid has already been registered and restored from
              // the cached devices we stored in the `configureAccessory` method above
              const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

              if (existingAccessory) {
                // the accessory already exists
                this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.firmwareRevision = device.thermostatVersion;
                this.api.updatePlatformAccessories([existingAccessory]);

                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new ThermostatTCCPlatformAccessory(this, existingAccessory, locationId, device);

              } else {
                // the accessory does not yet exist, so we need to create it
                this.log.info('Adding new accessory:', device.name);
                this.log.debug(`Registering new device: ${device.name} - ${device.deviceID}`);

                // create a new accessory
                const accessory = new this.api.platformAccessory(device.name, uuid);

                // store a copy of the device object in the `accessory.context`
                // the `context` property can be used to store any data about the accessory you may need
                accessory.context.device = device;
                accessory.context.firmwareRevision = device.thermostatVersion;

                // create the accessory handler for the newly create accessory
                // this is imported from `platformAccessory.ts`
                new ThermostatTCCPlatformAccessory(this, accessory, locationId, device);

                // link the accessory to your platform
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
              }
            } else {
              // eslint-disable-next-line max-len
              this.log.info(`Ignoring device named ${device.name} - ${device.deviceID}, Alive Status: ${device.isAlive}`);
            }
          }
        } else {
          this.log.info('A Device was found with a Device ID that didn\'t starts with LCC or TCC.');
        }
      }
    }
  }
}