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
import { RoomPriority } from './RoomSensors/roomPriority';

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
  public rooms: any;
  public locations: any;
  public accessory: any;

  public axios: AxiosInstance = axios.create({
    responseType: 'json',
  });

  location: any;
  //accessory: any;
  

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
      this.locations = this.discoverlocations();
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
    this.config.options.roompriority.thermostat;
    this.config.options.roompriority.switch;
    this.config.options.roompriority.roomsensor;
    if (!this.config.options.roompriority.thermostat && !this.config.options.roompriority.switch && !this.config.options.roompriority.roomsensor) {
      this.config.options.roompriority.roomsensor = true;
    }
    if (this.config.options.roompriority.thermostat && this.config.options.roompriority.switch) {
      this.multipleRoomPriority();
    }
    if (this.config.options.roompriority.thermostat && this.config.options.roompriority.roomsensor) {
      this.multipleRoomPriority();
    }
    if (this.config.options.roompriority.switch && this.config.options.roompriority.roomsensor) {
      this.multipleRoomPriority();
    }
    if (this.config.options.roompriority.thermostat && this.config.options.roompriority.switch && this.config.options.roompriority.roomsensor) {
      this.multipleRoomPriority();
    }

    
    

    // Hidden Device Discovery Option
    // This will disable adding any device and will just output info.
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

  private multipleRoomPriority() {
    throw new Error('You can only have 1 Room Priority Option Selected');
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
   * this method discovers the Locations
   */
  public async discoverlocations() {
    // try and get the access token. If it fails stop here.
    try {
      await this.getAccessToken();
    } catch (e) {
      this.log.error('Could not discover locations.', e.message);
      return;
    }
    const locations = (await this.axios.get(LocationURL)).data;
    this.log.info(`Total Locations Found: ${locations.length}`);
    return locations;
  }

  /**
   * this method discovers the Locations
   */
  public async findrooms(device: { deviceID: string; deviceModel: string; groups: any[]; isAlive: any; deviceClass: string; }, group: { rooms: any[]; id: any; }, location: { locationID: any; devices: (arg0: (device: any) => void) => void; }) {
    const accessory = (await this.axios.get(`${DeviceURL}/thermostats/${device.deviceID}/group/${group.id}/rooms`, {
      params: {
        locationId: location.locationID,
      },
    }).data
    return accessory
  }


  /**
   * This method is used to discover the your location and devices.
   * Accessories are registered by either their DeviceClass, DeviceModel, or DeviceID
   */
  async discoverThermostats() {
    // get the devices at each location
    this.log.info(`Getting devices for ${this.location.name}...`);
    this.locations.forEach((location: { name: any; devices: any[]; locationID: any; }) => {
      this.log.info(`Getting devices for ${location.name}...`);
      this.log.info(`Total Devices Found at ${location.name}: ${location.devices.length}`);
      const locationId = location.locationID;
      location.devices.forEach(async (device: { isAlive: any; deviceClass: string; deviceID: string; deviceModel: string; DeviceModel: any; }) => {
        if (!device.isAlive && device.deviceClass === 'LeakDetector') {
          this.deviceinfo(device);
          this.Leak({ device, locationId });
        } else if (device.isAlive && device.deviceClass === 'Thermostat') {
          if ((device.deviceID.startsWith('LCC'))) {
            if (device.deviceModel.startsWith('T9')) {
              this.deviceinfo(device);
              this.T9(device, locationId);
              try {
                await this.discoverRoomSensors();
              } catch (e) {
                this.log.error('Failed to refresh access token.', e.message);
              }
              try {
                await this.discoverRoomSensorThermostat();
              } catch (e) {
                this.log.error('Failed to refresh access token.', e.message);
              }
              try {
                await this.discoverRoomPriority();
              } catch (e) {
                this.log.error('Failed to refresh access token.', e.message);
              }
            } else if (device.deviceModel.startsWith('T5')) {
              this.deviceinfo(device);
              this.T5({ device, locationId });
            } else if (!device.DeviceModel) {
              this.log.info('A LLC Device has been discovered with a deviceModel that doessn\'t start with T5 or T9');
            }
          } else if ((device.deviceID.startsWith('TCC'))) {
            if (device.deviceModel.startsWith('Round')) {
              this.deviceinfo(device);
              this.Round({ device, locationId });
            } else if (device.deviceModel.startsWith('Unknown')) {
              this.deviceinfo(device);
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

  private T9(device: any, locationId: any) {
    const uuid = this.api.hap.uuid.generate(`${device.name}-${device.deviceID}-${device.deviceModel}`);

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
        this.log.debug(`T9 UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);

      } else if (!device.isAlive || this.config.options.thermostat.hide) {
        this.unregisterPlatformAccessories(existingAccessory);
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
      this.log.debug(`T9 UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private T5({ device, locationId }: { device: any; locationId: any; }) {
    const uuid = this.api.hap.uuid.generate(`${device.name}-${device.deviceID}-${device.deviceModel}`);

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
        this.log.debug(`T5 UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);
        
      } else if (!device.isAlive || this.config.options.thermostat.hide) {
        this.unregisterPlatformAccessories(existingAccessory);
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
      this.log.debug(`T5 UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private Round({ device, locationId }: { device: any; locationId: any; }) {
    const uuid = this.api.hap.uuid.generate(`${device.name}-${device.deviceID}-${device.deviceModel}`);

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
        this.log.debug(`Round UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);
        
      } else if (!device.isAlive || this.config.options.thermostat.hide) {
        this.unregisterPlatformAccessories(existingAccessory);
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
      this.log.debug(`Round UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private TCC({ device, locationId }: { device: any; locationId: any; }) {
    const uuid = this.api.hap.uuid.generate(`${device.name}-${device.deviceID}-${device.deviceModel}`);

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
        this.log.debug(`TCC UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);

      } else if (!device.isAlive || this.config.options.thermostat.hide) {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!this.config.options.thermostat.hide) {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', `${device.name} TCC(${device.deviceModel}) ${device.deviceType}`);
      this.log.debug(`Registering new device: ${device.name} TCC(${device.deviceModel}) ${device.deviceType} - ${device.deviceID}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.name} ${device.deviceType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      // accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new TCC(this, accessory, locationId, device);
      this.log.debug(`TCC UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private Leak({ device, locationId }: { device: any; locationId: any; }) {
    const uuid = this.api.hap.uuid.generate(`${device.name}-${device.deviceID}-${device.deviceClass}`);

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
        this.log.debug(`Leak Sensor UDID: ${device.name}-${device.deviceID}-${device.deviceClass}`);

      } else if (!device.isAlive || this.config.options.leaksensor.hide) {
        this.unregisterPlatformAccessories(existingAccessory);
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
      // this is imported from `/Sensors/leakSensors.ts`
      new LeakSensor(this, accessory, locationId, device);
      this.log.debug(`Leak Sensor UDID: ${device.name}-${device.deviceID}-${device.deviceClass}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  async discoverRoomSensors() {

    this.locations.forEach((location: { locationID: any; devices: any; }) => {
      const locationId = location.locationID;
      location.devices.forEach((device: { deviceID: any; deviceModel: any; groups: any; isAlive: any; deviceClass: any; }) => {
        if ((device.deviceID.startsWith('LCC'))) {
          if (device.deviceModel.startsWith('T9')) {
            if (device.groups) {
              device.groups.forEach(async (group: { rooms: any[]; id: any; }) => {
                group.rooms.forEach((room: any) => {
                  room;
                });
                {
                  group.rooms.forEach((roomaccessories: any) => {
                    roomaccessories;
                  });
                  this.accessory.rooms.forEach((accessories: { accessories: any[]; name: string; }) => {
                    accessories.accessories.forEach(findaccessories => {
                      this.log.info(JSON.stringify(findaccessories));
                      if (findaccessories.accessoryAttribute.type === 'IndoorAirSensor') {
                        const uuid = this.api.hap.uuid.generate(`${accessories.name}-${findaccessories.accessoryAttribute.type}-${findaccessories.accessoryAttribute.serialNumber}`);
                        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
                        if (existingAccessory) {
                          // the accessory already exists
                          if (device.isAlive && this.config.options.roompriority.roomsensor) {
                            this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                            // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                            existingAccessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
                            this.api.updatePlatformAccessories([existingAccessory]);

                            // create the accessory handler for the restored accessory
                            // this is imported from `platformAccessory.ts`
                            new RoomSensors(this, existingAccessory, locationId, device, findaccessories, group);
                            this.log.debug(`Room Sensors UDID: ${accessories.name}-${findaccessories.accessoryAttribute.type}-${findaccessories.accessoryAttribute.serialNumber}`);
                            this.log.info(`${group.rooms.length} Rooms Found.`);

                          } else if (!device.isAlive || this.config.options.roompriority.switch || this.config.options.roompriority.thermostat) {
                            this.unregisterPlatformAccessories(existingAccessory);
                          }
                        } else if (device.isAlive && this.config.options.roompriority.roomsensor) {
                          // the accessory does not yet exist, so we need to create it
                          this.log.info(`Adding new accessory: ${accessories.name} ${findaccessories.accessoryAttribute.type}`);
                          this.log.debug(`Registering new device: ${accessories.name} ${findaccessories.accessoryAttribute.type} - ${device.deviceID}`);

                          // create a new accessory
                          const accessory = new this.api.platformAccessory(`${accessories.name} ${findaccessories.accessoryAttribute.type}`, uuid);

                          // store a copy of the device object in the `accessory.context`
                          // the `context` property can be used to store any data about the accessory you may need
                          accessory.context.device = device;
                          accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;

                          // create the accessory handler for the newly create accessory
                          // this is imported from `roomSensor.ts`
                          new RoomSensors(this, accessory, locationId, device, findaccessories, group);
                          this.log.debug(`Room Sensors UDID: ${accessories.name}-${findaccessories.accessoryAttribute.type}-${findaccessories.accessoryAttribute.serialNumber}`);
                          this.log.info(`${group.rooms.length} Rooms Found.`);

                          // link the accessory to your platform
                          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                        }

                      } else if (findaccessories.accessoryAttribute.type === 'Thermostat') {
                        this.log.info(`Thermostat linked to Room Sensor: ${accessories.name} ${findaccessories.accessoryAttribute.type}`);
                      } else {
                        this.log.info(`Ignoring device named ${accessories.name} - ${findaccessories.accessoryAttribute.type}, Alive Status: ${device.isAlive}`);
                      }
                    });
                  });
                }
              });
            } 
          }
        }
      });
    });
  }

  async discoverRoomSensorThermostat() {  
    // get the devices at each location  
    this.locations.forEach((location: { locationID: any; devices: any; }) => {
      const locationId = location.locationID;
      location.devices.forEach((device: { deviceID: any; deviceModel: any; groups: any; isAlive: any; deviceClass: any; }) => {
        if ((device.deviceID.startsWith('LCC'))) {
          if (device.deviceModel.startsWith('T9')) {
            if (device.groups) {
              device.groups.forEach(async (group: { rooms: any[]; id: any; }) => {
                group.rooms.forEach((rooms: any) => {
                  this.rooms = rooms;
                });
                {
                  group.rooms.forEach((roomaccessories: any) => {
                    roomaccessories;
                  });
                  this.accessory.rooms.forEach((accessories: { accessories: any[]; name: any; }) => {
                    accessories.accessories.forEach((findaccessories: { accessoryAttribute: { type: string; serialNumber: any; softwareRevision: any; }; }) => {
                      if (findaccessories.accessoryAttribute.type === 'IndoorAirSensor') {
                        const uuid = this.api.hap.uuid.generate(`${accessories.name}-${findaccessories.accessoryAttribute.type}-${findaccessories.accessoryAttribute.serialNumber}`);

                        // see if an accessory with the same uuid has already been registered and restored from
                        // the cached devices we stored in the `configureAccessory` method above
                        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

                        if (existingAccessory) {
                          // the accessory already exists
                          if (device.isAlive && this.config.options.roompriority.thermostat) {
                            this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                            // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                            existingAccessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
                            this.api.updatePlatformAccessories([existingAccessory]);

                            // create the accessory handler for the restored accessory
                            // this is imported from `platformAccessory.ts`
                            new RoomSensorThermostat(this, existingAccessory, locationId, device, findaccessories, group, this.rooms);
                            this.log.debug(`Room Sensor Thermostat UDID: ${accessories.name}-${findaccessories.accessoryAttribute.type}-${findaccessories.accessoryAttribute.serialNumber}`);
                            this.log.info(`${group.rooms.length} Rooms Found.`);

                          } else if (!device.isAlive || this.config.options.roompriority.switch || this.config.options.roompriority.roomsensor) {
                            this.unregisterPlatformAccessories(existingAccessory);
                          }
                        } else if (device.isAlive && this.config.options.roompriority.thermostat) {
                          // the accessory does not yet exist, so we need to create it
                          this.log.info('Adding new accessory:', `${accessories.name} ${findaccessories.accessoryAttribute.type} Thermostat`);
                          this.log.debug(`Registering new device: ${accessories.name} ${findaccessories.accessoryAttribute.type} Thermostat - ${device.deviceID}`);

                          // create a new accessory
                          const accessory = new this.api.platformAccessory(`${accessories.name} ${findaccessories.accessoryAttribute.type} Thermostat`, uuid);

                          // store a copy of the device object in the `accessory.context`
                          // the `context` property can be used to store any data about the accessory you may need
                          accessory.context.device = device;
                          accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;

                          // create the accessory handler for the newly create accessory
                          // this is imported from `platformAccessory.ts`
                          new RoomSensorThermostat(this, accessory, locationId, device, findaccessories, group, this.rooms);
                          this.log.debug(`Room Sensor Thermostat UDID: ${accessories.name}-${findaccessories.accessoryAttribute.type}-${findaccessories.accessoryAttribute.serialNumber}`);
                          this.log.info(`${group.rooms.length} Rooms Found.`);

                          // link the accessory to your platform
                          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                        }

                      } else if (findaccessories.accessoryAttribute.type === 'Thermostat') {
                        this.log.info(`Thermostat linked to Room Sensor: ${accessories.name} ${findaccessories.accessoryAttribute.type}`);
                      } else {
                        this.log.info(`Ignoring device named ${accessories.name} - ${findaccessories.accessoryAttribute.type}, Alive Status: ${device.isAlive}`);
                      }
                    });
                  });
                }
              });
            }
          }
        } 
      });
    });
  }

  async discoverRoomPriority() {    
    // get the devices at each location
    this.locations.forEach((location: { locationID: any; devices: any[]; }) => {
      const locationId = location.locationID;
      location.devices.forEach((device: { name: string; deviceID: string; deviceModel: string; groups: any[]; isAlive: any; }) => {
        // T9 Thermostats
        if ((device.deviceID.startsWith('LCC'))) {
          if (device.deviceModel.startsWith('T9')) {
            if (device.groups) {
              device.groups.forEach((group: { rooms: any[]; }) => {
                group.rooms.forEach((rooms: any) => {
                  // Room Priority Switches
                  const uuid = this.api.hap.uuid.generate(`${rooms}${device.name}${device.deviceID}`);
                  
                  // see if an accessory with the same uuid has already been registered and restored from
                  // the cached devices we stored in the `configureAccessory` method above
                  const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

                  if (existingAccessory) {
                  // the accessory already exists
                    if (device.isAlive && this.config.options.roompriority.switch) {
                      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                      // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                      // this.api.updatePlatformAccessories([existingAccessory]);

                      // create the accessory handler for the restored accessory
                      // this is imported from `platformAccessory.ts`
                      new RoomPriority(this, existingAccessory, locationId, device, rooms);
                      this.log.debug(`Room Priority Switch UDID: ${rooms}${device.deviceID}`);
                      this.log.info(`${group.rooms.length} Rooms Found.`);

                    } else if (!device.isAlive || this.config.options.roompriority.thermostat || this.config.options.roompriority.roomsensor) {
                      this.unregisterPlatformAccessories(existingAccessory);
                    }
                  } else if (this.config.options.roompriority.switch && device.isAlive) {
                  // the accessory does not yet exist, so we need to create it
                    this.log.info('Adding new accessory:', `Room: ${rooms} Priority Switch`);
                    this.log.debug(`Registering new device: Room: ${rooms} Priority Switch`);

                    // create a new accessory
                    const accessory = new this.api.platformAccessory(`Room: ${rooms} Priority Switch`, uuid);

                    // store a copy of the device object in the `accessory.context`
                    // the `context` property can be used to store any data about the accessory you may need
                    accessory.context.device = device;

                    // create the accessory handler for the newly create accessory
                    // this is imported from `platformAccessory.ts`
                    new RoomPriority(this, accessory, locationId, device, rooms);
                    this.log.debug(`Room Priority Switch UDID: ${rooms}-${device.deviceID}`);
                    this.log.info(`${group.rooms.length} Rooms Found.`);

                    // link the accessory to your platform
                    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                  }
                });
              });
            }
          }
        }
      });
    });
  }

  private unregisterPlatformAccessories(existingAccessory: PlatformAccessory) {
    // remove platform accessories when no longer present
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
    this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
  }      

  private deviceinfo(device: any) {
    if (this.config.devicediscovery) {
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
}