/* eslint-disable max-len */
import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { interval } from 'rxjs';
import axios, { AxiosInstance } from 'axios';
import * as qs from 'querystring';
import { readFileSync, writeFileSync } from 'fs';

import { PLATFORM_NAME, PLUGIN_NAME, AuthURL, LocationURL, DeviceURL, UIurl } from './settings';
import { T9 } from './Thermostats/T9';
import { T5 } from './Thermostats/T5';
import { Round } from './Thermostats/Round';
import { TCC } from './Thermostats/TCC';
import { LeakSensor } from './Sensors/leakSensors';
import { RoomSensors } from './RoomSensors/roomSensors';
import { RoomSensorThermostat } from './RoomSensors/roomSensorThermostat';
import { RoomPriority } from './RoomSensors/RoomPriority';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class HoneywellHomePlatform implements DynamicPlatformPlugin {
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
    if (!this.config.options.thermostat || typeof this.config.options.thermostat !== 'object') {
      this.config.options.thermostat = {};
    }
    if (!this.config.options.leaksensor || typeof this.config.options.leaksensor !== 'object') {
      this.config.options.leaksensor = {};
    }
    if (!this.config.options.roomsensor || typeof this.config.options.roomsensor !== 'object') {
      this.config.options.roomsensor = {};
    }
    if (!this.config.options.roompriority || typeof this.config.options.roompriority !== 'object') {
      this.config.options.roompriority = {};
    }
    // Thermostat Config Options
    this.config.options.thermostat.hide;
    this.config.options.thermostat.hide_fan;

    // Leak Sensor Config Options
    this.config.options.leaksensor.hide;
    this.config.options.leaksensor.hide_humidity;
    this.config.options.leaksensor.hide_temperature;
    this.config.options.leaksensor.hide_leak;

    // Room Sensor Config Options
    this.config.options.roomsensor.hide;
    this.config.options.roomsensor.hide_temperature;
    this.config.options.roomsensor.hide_occupancy;
    this.config.options.roomsensor.hide_motion;
    this.config.options.roomsensor.hide_humidity;

    // Room Priority Config Options
    this.config.options.roompriority.kind;

    // Room Priority Config Options
    this.config.devicediscovery;

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
      const pluginConfig = currentConfig.platforms.find((x: { platform: string; }) => x.platform === PLATFORM_NAME);

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
   * This method is used to discover the your location and devices.
   * Accessories are registered by either their DeviceClass, DeviceModel, or DeviceID
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
    this.log.info(`Total Locations Found: ${locations.length}`);

    // get the devices at each location
    locations.forEach((location) => {
      this.log.info(`Getting devices for ${location.name}...`);
      this.log.info(`Total Devices Found at ${location.name}: ${location.devices.length}`);
      const locationId = location.locationID;

      location.devices.forEach(async (device) => {
        if (!device.isAlive && device.deviceClass === 'LeakDetector') {
          this.devicediscovery(device);
          this.Leak({ device, locationId });
        } else if (device.isAlive && device.deviceClass === 'Thermostat') {
          if ((device.deviceID.startsWith('LCC'))) {
            if (device.deviceModel.startsWith('T9')) {
              this.devicediscovery(device);
              // Add T9 Thermostat
              this.T9(device, locationId);
              // Add RoomSensors
              this.RoomSensors();
              this.RoomSensorsSwitches();
            } else if (device.deviceModel.startsWith('T5')) {
              this.devicediscovery(device);
              this.T5({ device, locationId });
            } else if (!device.DeviceModel) {
              this.log.info('A LLC Device has been discovered with a deviceModel that doessn\'t start with T5 or T9');
            }
          } else if ((device.deviceID.startsWith('TCC'))) {
            if (device.deviceModel.startsWith('Round')) {
              this.devicediscovery(device);
              this.Round({ device, locationId });
            } else if (device.deviceModel.startsWith('Unknown')) {
              this.devicediscovery(device);
              this.TCC({ device, locationId });
            } else if (!device.deviceModel) {
              this.log.info('A TCC Device has been discovered with a deviceModel that doessn\'t start with Round or Unknown');
            }
          } else {
            this.log.info('Your Device isn\'t supported, Please open Feature Request');
          }
        }
      });
    });
  }

  /**
   * Exchange the refresh token for an access token if ((device.deviceID.startsWith('LCC'))
   */
  private T9(device: any, locationId: any) {
    this.log.debug(`T9 UDID: ${device.name}${device.deviceID}${device.deviceModel}`);
    const uuid = this.api.hap.uuid.generate(`${device.name}${device.deviceID}${device.deviceModel}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options.thermostat.hide && device.isAlive) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        //existingAccessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
        //this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new T9(this, existingAccessory, locationId, device);
      } else if (this.config.options.thermostat.hide || !device.isAlive) {
        // remove platform accessories when no longer present
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      }
    } else if (!this.config.options.thermostat.hide) {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', `${device.name} ${device.deviceModel} ${device.deviceType}`);
      this.log.debug(`Registering new device: ${device.name} ${device.deviceModel} ${device.deviceType} - ${device.deviceID}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.name} ${device.deviceType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      // accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new T9(this, accessory, locationId, device);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private T5({ device, locationId }: { device: any; locationId: any; }) {
    this.log.debug(`T5 UDID: ${device.name}${device.deviceID}${device.deviceModel}`);
    const uuid = this.api.hap.uuid.generate(`${device.name}${device.deviceID}${device.deviceModel}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options.thermostat.hide && device.isAlive) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        //existingAccessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
        //this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new T5(this, existingAccessory, locationId, device);
      } else if (this.config.options.thermostat.hide || !device.isAlive) {
        // remove platform accessories when no longer present
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      }
    } else if (!this.config.options.thermostat.hide) {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', `${device.name} ${device.deviceModel} ${device.deviceType}`);
      this.log.debug(`Registering new device: ${device.name} ${device.deviceModel} ${device.deviceType} - ${device.deviceID}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.name} ${device.deviceType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      // accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new T5(this, accessory, locationId, device);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private Round({ device, locationId }: { device: any; locationId: any; }) {
    this.log.debug(`T5 UDID: ${device.name}${device.deviceID}${device.deviceModel}`);
    const uuid = this.api.hap.uuid.generate(`${device.name}${device.deviceID}${device.deviceModel}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options.thermostat.hide && device.isAlive) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        //existingAccessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
        //this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Round(this, existingAccessory, locationId, device);
      } else if (this.config.options.thermostat.hide || !device.isAlive) {
        // remove platform accessories when no longer present
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      }
    } else if (!this.config.options.thermostat.hide) {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', `${device.name} ${device.deviceModel} ${device.deviceType}`);
      this.log.debug(`Registering new device: ${device.name} ${device.deviceModel} ${device.deviceType} - ${device.deviceID}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.name} ${device.deviceType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      // accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Round(this, accessory, locationId, device);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private TCC({ device, locationId }: { device: any; locationId: any; }) {
    this.log.debug(`TCC UDID: ${device.name}${device.deviceID}${device.deviceModel}`);
    const uuid = this.api.hap.uuid.generate(`${device.name}${device.deviceID}${device.deviceModel}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options.thermostat.hide && device.isAlive) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        //existingAccessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
        //this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new TCC(this, existingAccessory, locationId, device);
      } else if (this.config.options.thermostat.hide || !device.isAlive) {
        // remove platform accessories when no longer present
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      }
    } else if (!this.config.options.thermostat.hide) {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', `${device.name} ${device.deviceModel} ${device.deviceType}`);
      this.log.debug(`Registering new device: ${device.name} ${device.deviceModel} ${device.deviceType} - ${device.deviceID}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.name} ${device.deviceType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      // accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new TCC(this, accessory, locationId, device);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private Leak({ device, locationId }: { device: any; locationId: any; }) {
    this.log.debug(`Leak Sensor UDID: ${device.name}${device.deviceID}${device.deviceClass}`);
    const uuid = this.api.hap.uuid.generate(`${device.name}${device.deviceID}${device.deviceClass}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options.leaksensor.hide && device.isAlive) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        //existingAccessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
        //this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new LeakSensor(this, existingAccessory, locationId, device);
      } else if (this.config.options.leaksensor.hide || !device.isAlive) {
        // remove platform accessories when no longer present
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      }
    } else if (!this.config.options.leaksensor.hide) {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', `${device.name}  ${device.deviceClass}`);
      this.log.debug(`Registering new device: ${device.name} ${device.deviceClass} - ${device.deviceID}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.name} ${device.deviceClass}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      // accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new LeakSensor(this, accessory, locationId, device);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private async RoomSensors() {
    if (this.config.options.roompriority.kind === 'hide' || this.config.options.roompriority.kind === 'thermostat') {// get the locations
      const locations = (await this.axios.get(LocationURL)).data;
      // get the devices at each location
      locations.forEach((location) => {
        const locationId = location.locationID;
        location.devices.forEach(async (device) => {
        // T9 Thermostat Room Sensors
          if ((device.deviceID.startsWith('LCC'))) {
            if (device.deviceModel){
              if ((device.deviceModel.startsWith('T9')) === true) {
                const priority = (await this.axios.get(`${DeviceURL}/thermostats/${device.deviceID}/priority`, {
                  params: {
                    locationId: location.locationID,
                  },
                })).data;
                this.log.info(JSON.stringify(priority));

                this.log.info(`# of Rooms Found: ${priority.currentPriority.rooms.length}`);
                priority.currentPriority.rooms.forEach((rooms) => {
                  this.log.info(rooms.roomName);
                  rooms.accessories.forEach((roomsensor) => {
                    // generate a unique id for the accessory this should be generated from
                    // something globally unique, but constant, for example, the device serial
                    // number or MAC address
                    {
                      if (roomsensor.type === 'IndoorAirSensor' && device.isAlive && device.deviceClass === 'Thermostat') {
                        this.log.debug(`Room Sensor UDID: ${rooms.roomName}${roomsensor.type}${priority.deviceID}`);
                        const uuid = this.api.hap.uuid.generate(`${rooms.roomName}${roomsensor.type}${priority.deviceID}`);
                  
                        // see if an accessory with the same uuid has already been registered and restored from
                        // the cached devices we stored in the `configureAccessory` method above
                        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
                
                        this.log.debug('Existing Room Sensor:', (this.config.options.roompriority.kind === 'switches' || this.config.options.roompriority.kind === 'hide') && !this.config.options.thermostat.hide && !this.config.options.roomsensor.hide && device.isAlive);
                        this.log.debug('Existing Room Sensor Thermostat:', this.config.options.roompriority.kind === 'thermostat' && (!this.config.options.thermostat.hide || this.config.options.thermostat.hide) && (this.config.options.roomsensor.hide || !this.config.options.roomsensor.hide) && device.isAlive);
                        this.log.debug('New Room Sensor:', this.config.options.roompriority.kind !== 'thermostat' && !this.config.options.roomsensor.hide && device.isAlive);
                        this.log.debug('New Room Sensor Thermostat:', this.config.options.roompriority.kind === 'thermostat' && device.isAlive);
                        this.log.debug('Remove Devices:', this.config.options.roompriority.kind === 'hide' || this.config.options.thermostat.hide || this.config.options.roomsensor.hide || this.config.options.roompriority.kind === 'switches' || this.config.options.roompriority.kind !== 'thermostat' || !device.isAlive);
                        this.log.debug(this.config.options.roompriority.kind);

                        if (existingAccessory) {
                        // the accessory already exists
                          if ((this.config.options.roompriority.kind === 'switches' || this.config.options.roompriority.kind === 'hide') && !this.config.options.thermostat.hide && !this.config.options.roomsensor.hide && device.isAlive) {
                            this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                            // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                            // existingAccessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
                            // this.api.updatePlatformAccessories([existingAccessory]);
                            // create the accessory handler for the restored accessory
                            // this is imported from `platformAccessory.ts`
                            new RoomSensors(this, existingAccessory, locationId, device, rooms, roomsensor);
                          } else if (this.config.options.roompriority.kind === 'thermostat' && (!this.config.options.thermostat.hide || this.config.options.thermostat.hide) && (this.config.options.roomsensor.hide || !this.config.options.roomsensor.hide) && device.isAlive) {
                            this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                            // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                            //existingAccessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
                            //this.api.updatePlatformAccessories([existingAccessory]);
                            // create the accessory handler for the restored accessory
                            // this is imported from `platformAccessory.ts`
                            new RoomSensorThermostat(this, existingAccessory, locationId, device, rooms, roomsensor);
                          } else if (this.config.options.roompriority.kind === 'hide' || this.config.options.thermostat.hide || this.config.options.roomsensor.hide || this.config.options.roompriority.kind === 'switches' || this.config.options.roompriority.kind !== 'thermostat' || device.isAlive) {
                          // remove platform accessories when no longer present
                            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
                            this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
                          }
                        } else if (this.config.options.roompriority.kind !== 'thermostat' && !this.config.options.roomsensor.hide && device.isAlive) {
                        // the accessory does not yet exist, so we need to create it
                          this.log.info('Adding new accessory:', `${rooms.roomName} ${roomsensor.type}`);
                          this.log.debug(`Registering new device: ${rooms.roomName} ${roomsensor.type} - ${priority.deviceId}`);

                          // create a new accessory
                          const accessory = new this.api.platformAccessory(`${rooms.roomName} RoomSensor`, uuid);

                          // store a copy of the device object in the `accessory.context`
                          // the `context` property can be used to store any data about the accessory you may need
                          accessory.context.device = device;
                          // accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;

                          // create the accessory handler for the newly create accessory
                          // this is imported from `platformAccessory.ts`
                          new RoomSensors(this, accessory, locationId, device, rooms, roomsensor);

                          // link the accessory to your platform
                          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                        } else if (this.config.options.roompriority.kind === 'thermostat' && device.isAlive) {
                        // the accessory does not yet exist, so we need to create it
                          this.log.info('Adding new accessory:', `${rooms.roomName} ${roomsensor.type} Thermostat`);
                          this.log.debug(`Registering new device: ${rooms.roomName} ${roomsensor.type} Thermostat - ${priority.deviceId}`);

                          // create a new accessory
                          const accessory = new this.api.platformAccessory(`${roomsensor.name} Thermostat`, uuid);

                          // store a copy of the device object in the `accessory.context`
                          // the `context` property can be used to store any data about the accessory you may need
                          accessory.context.device = device;
                          // accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;

                          // create the accessory handler for the newly create accessory
                          // this is imported from `platformAccessory.ts`
                          new RoomSensorThermostat(this, accessory, locationId, device, rooms, roomsensor);

                          // link the accessory to your platform
                          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                        } else if (this.config.options.roompriority.kind === 'switches') {
                          this.log.info('Room Priority will be displayed as Switches');
                        }
                      } else if (roomsensor.type === 'Thermostat' ) {
                        this.log.info(`Thermostat Linked to Room Sensor: ${rooms.roomName} - ${roomsensor.type}`);
                      } else {
                        this.log.debug(`Ignored device: ${rooms.roomName} ${priority.deviceId} - ${roomsensor.type}`);
                      }
                    }
                  });
                });  
              }
            }
          }
        });
      });
    }
  }
    
  
  private async RoomSensorsSwitches() {
    if (this.config.options.roompriority.kind === 'switches') {
      const locations = (await this.axios.get(LocationURL)).data;
      // get the devices at each location
      for (const location of locations) {
        const locationId = location.locationID;
        for (const device of location.devices) {
        // T9 Thermostats
          if (device.deviceModel){
            if ((device.deviceModel.startsWith('T9')) === true) {
              for (const group of device.groups) {
                this.log.info(`# of Rooms Found: ${group.rooms.length}`);
                for (const rooms of group.rooms) {
                // Room Priority Switches
                  this.log.debug(`Room Priority Switch UDID: ${rooms}${device.deviceID}`);
                  const uuid = this.api.hap.uuid.generate(`${rooms}${device.deviceID}`);
                  this.log.debug('Existing Switches:', this.config.options.roompriority.kind === 'switches' && (!this.config.options.thermostat.hide || this.config.options.thermostat.hide) && this.config.options.roompriority.kind !== 'hide' && device.isAlive);
                  this.log.debug('New Switches:', this.config.options.roompriority.kind === 'switches' && (!this.config.options.thermostat.hide || this.config.options.thermostat.hide) && this.config.options.roompriority.kind !== 'hide' && device.isAlive);
                  this.log.debug('Remove Devices:', this.config.options.roompriority.kind === 'thermostat' || this.config.options.roompriority.kind === 'hide' || !device.isAlive);
                  this.log.debug(this.config.options.roompriority.kind);
                  
                  // see if an accessory with the same uuid has already been registered and restored from
                  // the cached devices we stored in the `configureAccessory` method above
                  const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

                  if (existingAccessory) {
                    // the accessory already exists
                    if (this.config.options.roompriority.kind === 'switches' && (!this.config.options.thermostat.hide || this.config.options.thermostat.hide) && this.config.options.roompriority.kind !== 'hide' && device.isAlive) {
                      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                      // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                      // this.api.updatePlatformAccessories([existingAccessory]);

                      // create the accessory handler for the restored accessory
                      // this is imported from `platformAccessory.ts`
                      new RoomPriority(this, existingAccessory, locationId, device, rooms);
                    } else if (this.config.options.roompriority.kind === 'thermostat' || this.config.options.roompriority.kind === 'hide' || !device.isAlive) {
                      // remove platform accessories when no longer present
                      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
                      this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
                    }
                  } else if (this.config.options.roompriority.kind === 'switches' && (!this.config.options.thermostat.hide || this.config.options.thermostat.hide) && this.config.options.roompriority.kind !== 'hide' && device.isAlive) {
                    // the accessory does not yet exist, so we need to create it
                    this.log.info('Adding new accessory:', `Room: ${rooms}`);
                    this.log.debug(`Registering new device: Room: ${rooms}`);

                    // create a new accessory
                    const accessory = new this.api.platformAccessory(`Room: ${rooms}`, uuid);

                    // store a copy of the device object in the `accessory.context`
                    // the `context` property can be used to store any data about the accessory you may need
                    accessory.context.device = device;

                    // create the accessory handler for the newly create accessory
                    // this is imported from `platformAccessory.ts`
                    new RoomPriority(this, accessory, locationId, device, rooms);

                    // link the accessory to your platform
                    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                  }
                }
              }
            }
          }
        }
      }
    }       
  }

  private devicediscovery(device: any) {
    if (this.config.devicediscovery) {
      this.deviceinfo(device);
    }
  }

  private deviceinfo(device: any) {
    if (device) {
      this.log.info(JSON.stringify(device));
    }
    if (device.deviceID){
      this.log.info(JSON.stringify(device.deviceID));
      this.log.info(`Device ID: ${device.deviceID}`);
    }
    if (device.deviceType) {
      this.log.info(JSON.stringify(device.deviceType));
      this.log.debug(`Device Type: ${device.deviceType}`);
    }
    if (device.deviceClass) {
      this.log.info(JSON.stringify(device.deviceClass));
      this.log.info(`Device Class: ${device.deviceClass}`);
    }
    if (device.deviceModel) {
      this.log.info(JSON.stringify(device.deviceModel));
      this.log.info(`Device Model: ${device.deviceModel}`);
      
    }
    if (device.priorityType) {
      this.log.info(JSON.stringify(device.priorityType));
      this.log.info(`Device Priority Type: ${device.priorityType}`);
    }
    if (device.settings) {
      this.log.info(JSON.stringify(device.settings));
      this.log.info(`Device Settings: ${device.settings}`);
      if (device.settings.fan) {
        this.log.info(JSON.stringify(device.settings.fan));
        this.log.info(`Device Fan Settings: ${device.settings.fan}`);
        if (device.settings.fan.allowedModes) {
          this.log.info(JSON.stringify(device.settings.fan.allowedModes));
          this.log.info(`Device Fan Allowed Modes: ${device.settings.fan.allowedModes}`);
        }
        if (device.settings.fan.changeableValues){
          this.log.info(JSON.stringify(device.settings.fan.changeableValues));
          this.log.info(`Device Fan Changeable Values: ${device.settings.fan.changeableValues}`);
        }
      }
    }
    if (device.inBuiltSensorState) {
      this.log.info(JSON.stringify(device.inBuiltSensorState));
      if (device.inBuiltSensorState.roomId){
        this.log.info(JSON.stringify(device.inBuiltSensorState.roomId));
        this.log.info(`Device Built In Sensor Room ID: ${device.inBuiltSensorState.roomId}`);
      }
      if (device.inBuiltSensorState.roomName) {
        this.log.info(JSON.stringify(device.inBuiltSensorState.roomName));
        this.log.info(`Device Built In Sensor Room Name: ${device.inBuiltSensorState.roomName}`);
      }
    }
    if (device.groups) {
      this.log.info(JSON.stringify(device.groups));
      device.groups.forEach((group: any) => {
        this.log.info(`Group: ${group.id}`);
      });
    }
  }
}
/*
            const rooms = (await this.axios.get(`${DeviceURL}/thermostats/${device.deviceID}/group/${this.group.id}/rooms`, {
              params: {
                locationId: location.locationID,
              },
            })).data;
            this.log.debug(JSON.stringify(rooms));*/