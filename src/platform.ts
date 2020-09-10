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
import * as configTypes from './configTypes';

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

  locations!: configTypes.location | any;
  firmware!: configTypes.accessoryAttribute['softwareRevision'];
  sensoraccessory: any;

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
        this.locations = await this.discoverlocations();
      } catch (e) {
        this.log.error('Failed to Discover Locations.', e.message);
      }
      try {
        this.discoverDevices();
      } catch (e) {
        this.log.error('Failed to Discover Thermostats.', e.message);
      }
      interval((1800 / 3) * 1000).subscribe(async () => {
        try {
          await this.getAccessToken();
        } catch (e) {
          this.log.error('Failed to refresh access token.', e.message);
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

    /**
     * Room Priority Errors
     * This will only error if multiple optioins have been set to true
     */
    if (!this.config.options.roompriority.thermostat && !this.config.options.roompriority.switch && !this.config.options.roompriority.roomsensor) {
      this.config.options.roompriority.roomsensor = true;
    }
    if (this.config.options.roompriority.thermostat && this.config.options.roompriority.switch) {
      this.multipleRoomPriority();
      this.config.options.roompriority.roomsensor = true;
    }
    if (this.config.options.roompriority.thermostat && this.config.options.roompriority.roomsensor) {
      this.multipleRoomPriority();
      this.config.options.roompriority.roomsensor = true;
    }
    if (this.config.options.roompriority.switch && this.config.options.roompriority.roomsensor) {
      this.multipleRoomPriority();
      this.config.options.roompriority.roomsensor = true;
    }
    if (this.config.options.roompriority.thermostat && this.config.options.roompriority.switch && this.config.options.roompriority.roomsensor) {
      this.multipleRoomPriority();
      this.config.options.roompriority.roomsensor = true;
    }
    if (this.config.options.roompriority.switch) {
      this.log.warn('Switch Room Priority has been selected. You can set your Thermostat\'s Priroty to the desired Room with the flick/touch of a Switch.');
    }
    if (this.config.options.roompriority.thermsotat) {
      this.log.warn('Thermostat Room Priority has been selected. You will have a Thermostat for Each Room Sensor so that you can set the priority of that Room.');
    }
    if (this.config.options.roompriority.roomsensor) {
      this.log.warn('Room Sensors will only display as Room Sensors.');
    }

    /**
     * Hidden Device Discovery Option
     * This will disable adding any device and will just output info.
     */
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
    throw new Error('You can only have 1 Room Priority Option Selected. Room Sensors will be treated only as Room Sensors');
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
  async discoverlocations() {
    // try and get the access token. If it fails stop here.
    try {
      await this.getAccessToken();
    } catch (e) {
      this.log.error('Failed to refresh access token.', e.message);
      return;
    }
    const locations = (await this.axios.get(LocationURL)).data;
    this.log.info(`Total Locations Found: ${locations.length}`);
    return locations;
  }

  /**
   * this method discovers the rooms at each location
   */
  private async Sensors(device: configTypes.T9Thermostat, group: configTypes.groups, locationId: configTypes.location['locationID']) {
    return (await this.axios.get(`${DeviceURL}/thermostats/${device.deviceID}/group/${group.id}/rooms`, {
      params: {
        locationId: locationId,
      },
    })).data;
  }

  /**
   * this method discovers the sesnors at each location
   */
  private async Priority(device: configTypes.T9Thermostat, locationId: configTypes.location['locationID']) {
    return (await this.axios.get(`${DeviceURL}/thermostats/${device.deviceID}/priority`, {
      params: {
        locationId: locationId,
      },
    })).data;
  }

  /**
   * this method discovers the firmware Veriosn for T9 Thermostats
   */
  public async Firmware() {
    // get the devices at each location
    for (const location of this.locations) {
      const locationId = location.locationID;
      for (const device of location.devices) {
        if ((device.deviceID.startsWith('LCC'))) {
          if (device.deviceModel.startsWith('T9')) {
            if (device.groups) {
              const groups = device.groups;
              for (const group of groups) {
                const roomsensors = await this.Sensors(device, group, locationId);
                if (roomsensors.rooms){
                  const rooms = roomsensors.rooms;
                  if (this.config.options.roompriority.roomsensor || this.config.options.roompriority.thermostat) {
                    this.log.info(`Total Rooms Found: ${rooms.length}`);
                  }
                  for (const accessories of rooms) {
                    if (accessories){
                      for (const accessory of accessories.accessories){
                        const sensoraccessory = accessory;
                        if (sensoraccessory.accessoryAttribute) {
                          if (sensoraccessory.accessoryAttribute.type) {
                            if (sensoraccessory.accessoryAttribute.type.startsWith('Thermostat')){
                              this.log.debug(JSON.stringify(sensoraccessory.accessoryAttribute.softwareRevision));
                              const softwareRevision = sensoraccessory.accessoryAttribute.softwareRevision;
                              return softwareRevision;
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * This method is used to discover the your location and devices.
   * Accessories are registered by either their DeviceClass, DeviceModel, or DeviceID
   */
  private async discoverDevices() {
    // get the devices at each location
    for (const location of this.locations) {
      this.log.info(`Getting devices for ${location.name}...`);
      this.log.info(`Total Devices Found at ${location.name}: ${location.devices.length}`);
      const locationId = location.locationID;
      this.locationinfo(location);
      for (const device of location.devices) {
        if (device.isAlive && device.deviceClass === 'LeakDetector') {
          this.deviceinfo(device);
          this.Leak(device, locationId);
        } else if (device.isAlive && device.deviceClass === 'Thermostat') {
          if ((device.deviceID.startsWith('LCC'))) {
            if (device.deviceModel.startsWith('T9')) {
              this.deviceinfo(device);
              try {
                this.firmware = await this.Firmware();
              } catch (e){
                this.log.error('Failed to Get Firmware Version.', e.message);
              }
              this.T9(device, locationId, this.firmware);
              try {
                this.discoverRoomSensors();
              } catch (e) {
                this.log.error('Failed to Find Room Sesnors.', e.message);
              }
              try {
                this.discoverRoomPriority();
              } catch (e) {
                this.log.error('Failed to Find Room Priority.', e.message);
              }
            } else if (device.deviceModel.startsWith('T5')) {
              this.deviceinfo(device);
              this.T5(device, locationId);
            } else if (!device.DeviceModel) {
              this.log.info('A LLC Device has been discovered with a deviceModel that doesn\'t start with T5 or T9');
            }
          } else if ((device.deviceID.startsWith('TCC'))) {
            if (device.deviceModel.startsWith('Round')) {
              this.deviceinfo(device);
              this.Round(device, locationId);
            } else if (device.deviceModel.startsWith('Unknown')) {
              this.deviceinfo(device);
              this.TCC(device, locationId);
            } else if (!device.deviceModel) {
              this.log.info('A TCC Device has been discovered with a deviceModel that doesn\'t start with Round or Unknown');
            }
          } else {
            this.log.info('Your Device isn\'t supported, Please open Feature Request');
          }
        }
      }
    }
  }

  private async discoverRoomSensors() {
    // get the devices at each location
    for (const location of this.locations) {
      const locationId = location.locationID;
      for (const device of location.devices) {
        if ((device.deviceID.startsWith('LCC'))) {
          if (device.deviceModel.startsWith('T9')) {
            if (device.groups) {
              const groups = device.groups;
              for (const group of groups) {
                const roomsensors = await this.Sensors(device, group, locationId);
                if (roomsensors.rooms){
                  const rooms = roomsensors.rooms;
                  this.log.debug(JSON.stringify(roomsensors));
                  if (this.config.options.roompriority.roomsensor || this.config.options.roompriority.thermostat) {
                    this.log.info(`Total Rooms Found: ${rooms.length}`);
                  }
                  for (const accessories of rooms) {
                    if (accessories){
                      this.log.debug(JSON.stringify(accessories));
                      for (const accessory of accessories.accessories){
                        this.sensoraccessory = accessory;
                        if (this.sensoraccessory.accessoryAttribute) {
                          if (this.sensoraccessory.accessoryAttribute.type) {
                            if (this.sensoraccessory.accessoryAttribute.type.startsWith('IndoorAirSensor')){
                              this.log.debug(JSON.stringify(this.sensoraccessory));
                              this.log.debug(JSON.stringify(this.sensoraccessory.accessoryAttribute.softwareRevision));
                              this.RoomSensors(device, locationId, accessories, roomsensors, this.sensoraccessory, group);
                              this.RoomSensorThermostat(device, locationId, accessories, roomsensors, this.sensoraccessory, rooms, group);
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  private async discoverRoomPriority() {
    // get the devices at each location
    for (const location of this.locations) {
      const locationId = location.locationID;
      for (const device of location.devices) {
        if ((device.deviceID.startsWith('LCC'))) {
          if (device.deviceModel.startsWith('T9')) {
            const priority = await this.Priority(device, locationId);
            if (priority.currentPriority){
              if (priority.currentPriority.rooms){
                const currentPriority = priority.currentPriority.rooms;
                this.log.debug(JSON.stringify(currentPriority));
                if (this.config.options.roompriority.switch){
                  this.log.info(`Total Rooms Found: ${currentPriority.length}`);
                }
                for (const rooms of currentPriority) {
                  this.log.debug(JSON.stringify(rooms));
                  if (rooms.accessories){
                    const priorityrooms = rooms.accessories;
                    this.log.debug(JSON.stringify(priorityrooms));
                    if (this.config.options.roompriority.switch) {
                      this.log.info(`Total Accessories Found in Room (${rooms.id}): ${priorityrooms.length}`);
                    }
                    for (const accessories of priorityrooms) {
                      this.log.debug(JSON.stringify(accessories));
                      this.RoomPriority(device, locationId, accessories, currentPriority, priorityrooms, rooms);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  private async T9(device: configTypes.T9Thermostat, locationId: configTypes.location['locationID'], firmware: string) {
    const uuid = this.api.hap.uuid.generate(`${device.name}-${device.deviceID}-${device.deviceModel}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options.thermostat.hide && device.isAlive) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.firmwareRevision = firmware;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new T9(this, existingAccessory, locationId, device);
        this.log.debug(`T9 UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);

      } else if (!device.isAlive || this.config.options.thermostat.hide) {
        this.unregisterPlatformAccessories(existingAccessory, uuid);
      }
    } else if (!this.config.options.thermostat.hide) {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', `${device.name} ${device.deviceModel} ${device.deviceType}`);
      this.log.debug(`Registering new device: ${device.name} ${device.deviceModel} ${device.deviceType} - ${device.deviceID}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.name} ${device.deviceType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.firmwareRevision = firmware;
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

  private T5(device: configTypes.T5Device, locationId: configTypes.location['locationID']) {
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
        this.unregisterPlatformAccessories(existingAccessory, uuid);
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

  private Round(device: configTypes.RoundDevice, locationId: configTypes.location['locationID']) {
    const uuid = this.api.hap.uuid.generate(`${device.name}-${device.deviceID}-${device.deviceModel}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options.thermostat.hide && device.isAlive) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.firmwareRevision = device.thermostatVersion;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Round(this, existingAccessory, locationId, device);
        this.log.debug(`Round UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);
        
      } else if (!device.isAlive || this.config.options.thermostat.hide) {
        this.unregisterPlatformAccessories(existingAccessory, uuid);
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
      accessory.context.firmwareRevision = device.thermostatVersion;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Round(this, accessory, locationId, device);
      this.log.debug(`Round UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private TCC(device: configTypes.TCCDevice, locationId: configTypes.location['locationID']) {
    const uuid = this.api.hap.uuid.generate(`${device.name}-${device.deviceID}-${device.deviceModel}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options.thermostat.hide && device.isAlive) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.firmwareRevision = device.thermostatVersion;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new TCC(this, existingAccessory, locationId, device);
        this.log.debug(`TCC UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);

      } else if (!device.isAlive || this.config.options.thermostat.hide) {
        this.unregisterPlatformAccessories(existingAccessory, uuid);
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
      accessory.context.firmwareRevision = device.thermostatVersion;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new TCC(this, accessory, locationId, device);
      this.log.debug(`TCC UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private Leak(device: configTypes.LeakDevice, locationId: configTypes.location['locationID']) {
    const uuid = this.api.hap.uuid.generate(`${device.userDefinedDeviceName}-${device.deviceID}-${device.deviceClass}`);

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
        this.log.debug(`Leak Sensor UDID: ${device.userDefinedDeviceName}-${device.deviceID}-${device.deviceClass}`);

      } else if (!device.isAlive || this.config.options.leaksensor.hide) {
        this.unregisterPlatformAccessories(existingAccessory, uuid);
      }
    } else if (!this.config.options.leaksensor.hide) {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', `${device.userDefinedDeviceName}  ${device.deviceClass}`);
      this.log.debug(`Registering new device: ${device.userDefinedDeviceName} ${device.deviceClass} - ${device.deviceID}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.userDefinedDeviceName} ${device.deviceClass}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      // accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
      // create the accessory handler for the newly create accessory
      // this is imported from `/Sensors/leakSensors.ts`
      new LeakSensor(this, accessory, locationId, device);
      this.log.debug(`Leak Sensor UDID: ${device.userDefinedDeviceName}-${device.deviceID}-${device.deviceClass}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }
  
  private RoomSensors(device: configTypes.T9Thermostat, locationId: configTypes.location['locationID'], accessories: configTypes.rooms, roomsensors: configTypes.roomsensor, sensoraccessory: configTypes.sensoraccessory, group: configTypes.groups) {
    const uuid = this.api.hap.uuid.generate(`${accessories.name}-${sensoraccessory.accessoryAttribute.type}-${accessories.id}-RoomSensor`);
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
    if (existingAccessory) {
      // the accessory already exists
      if (device.isAlive && (this.config.options.roompriority.roomsensor || this.config.options.roompriority.switch)) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.firmwareRevision = sensoraccessory.accessoryAttribute.softwareRevision;
        existingAccessory.context.name = sensoraccessory.accessoryAttribute.name;
        existingAccessory.context.type = sensoraccessory.accessoryAttribute.type;
        this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new RoomSensors(this, existingAccessory, locationId, device, accessories, roomsensors, sensoraccessory, group);
        this.log.debug(`Room Sensors UDID: ${accessories.name}-${sensoraccessory.accessoryAttribute.type}-${accessories.id}-RoomSensor`);

      } else if (!device.isAlive && this.config.options.roompriority.thermostat) {
        this.unregisterPlatformAccessories(existingAccessory, uuid);
      }
    } else if (device.isAlive && (this.config.options.roompriority.roomsensor || this.config.options.roompriority.switch)) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${accessories.name} ${sensoraccessory.accessoryAttribute.type}`);
      this.log.debug(`Registering new device: ${accessories.name} ${sensoraccessory.accessoryAttribute.type} - ${device.deviceID}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${accessories.name} ${sensoraccessory.accessoryAttribute.type}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.name = sensoraccessory.accessoryAttribute.name;
      accessory.context.type = sensoraccessory.accessoryAttribute.type;
      accessory.context.firmwareRevision = sensoraccessory.accessoryAttribute.softwareRevision;

      // create the accessory handler for the newly create accessory
      // this is imported from `roomSensor.ts`
      new RoomSensors(this, accessory, locationId, device, accessories, roomsensors, sensoraccessory, group);
      this.log.debug(`Room Sensors UDID: ${accessories.name}-${sensoraccessory.accessoryAttribute.type}-${accessories.id}-RoomSensor`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    } 
  }

  private RoomSensorThermostat(device: configTypes.T9Thermostat, locationId: configTypes.location['locationID'], accessories: configTypes.rooms, roomsensors: configTypes.roomsensor, sensoraccessory: configTypes.sensoraccessory, rooms: { accessoryValue: configTypes.accessoryValue; accessoryAttribute: configTypes.accessoryAttribute; }, group: configTypes.groups) {
    const uuid = this.api.hap.uuid.generate(`${accessories.name}-${sensoraccessory.accessoryAttribute.type}-${accessories.id}-RoomSensorThermostat-${device.deviceID}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory: { UUID: any; }) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (device.isAlive && this.config.options.roompriority.thermostat) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.firmwareRevision = sensoraccessory.accessoryAttribute.softwareRevision;
        existingAccessory.context.name = sensoraccessory.accessoryAttribute.name;
        existingAccessory.context.type = sensoraccessory.accessoryAttribute.type;
        this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new RoomSensorThermostat(this, existingAccessory, locationId, device, accessories, roomsensors, sensoraccessory, rooms, group);
        this.log.debug(`Room Sensor Thermostat UDID: ${accessories.name}-${sensoraccessory.accessoryAttribute.type}-${accessories.id}-RoomSensorThermostat-${device.deviceID}`);

      } else if (!device.isAlive && !this.config.options.roompriority.thermostat) {
        this.unregisterPlatformAccessories(existingAccessory, uuid);
      }
    } else if (device.isAlive && this.config.options.roompriority.thermostat) {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', `${accessories.name} ${sensoraccessory.accessoryAttribute.type} Thermostat`);
      this.log.debug(`Registering new device: ${accessories.name} ${sensoraccessory.accessoryAttribute.type} Thermostat - ${device.deviceID}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${accessories.name} ${sensoraccessory.accessoryAttribute.type} Thermostat`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.name = sensoraccessory.accessoryAttribute.name;
      accessory.context.type = sensoraccessory.accessoryAttribute.type;
      accessory.context.firmwareRevision = sensoraccessory.accessoryAttribute.softwareRevision;

      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new RoomSensorThermostat(this, accessory, locationId, device, accessories, roomsensors, sensoraccessory, rooms, group);
      this.log.debug(`Room Sensor Thermostat UDID: ${accessories.name}-${sensoraccessory.accessoryAttribute.type}-${accessories.id}-RoomSensorThermostat-${device.deviceID}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

  } 

  private RoomPriority(device: configTypes.T9Thermostat, locationId: configTypes.location['locationID'], accessories: configTypes.Accessory, currentPriority: configTypes.CurrentPriority, priorityrooms: configTypes.Room['accessories'], rooms: configTypes.Room) {
    // Room Priority Switches
    const uuid = this.api.hap.uuid.generate(`${rooms.roomName}-${rooms.id}-${accessories.type}-${accessories.id}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory: { UUID: any; }) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (device.isAlive && this.config.options.roompriority.switch) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        // this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new RoomPriority(this, existingAccessory, locationId, device, rooms, currentPriority, priorityrooms);
        this.log.debug(`Room Priority Switch UDID: ${rooms.roomName}-${rooms.id}-${accessories.type}-${accessories.id}`);

      } else if (!device.isAlive || !this.config.options.roompriority.switch) {
        this.unregisterPlatformAccessories(existingAccessory, uuid);
      }
    } else if (device.isAlive && this.config.options.roompriority.switch) {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', `${rooms.roomName} ${accessories.type} Room Priority Switch`);
      this.log.debug(`Registering new device: ${rooms.roomName} ${accessories.type} Room Priority Switch - ${device.deviceID}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${rooms.roomName} ${accessories.type} Room Priority Switch`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;

      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new RoomPriority(this, accessory, locationId, device, rooms, currentPriority, priorityrooms);
      this.log.debug(`Room Priority Switch UDID: ${rooms.roomName}-${rooms.id}-${accessories.type}-${accessories.id}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  public unregisterPlatformAccessories(existingAccessory: PlatformAccessory, uuid) {
    // remove platform accessories when no longer present
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
    this.log.info('Removing existing accessory from cache:', `${existingAccessory.displayName}-${uuid}`);
  }

  public locationinfo(location: configTypes.location) {
    if (this.config.devicediscovery) {
      if (location) {
        // this.log.warn(JSON.stringify(location));
      }
    }
  }

  public deviceinfo(device: { deviceID: string; deviceType: string; deviceClass: string; deviceModel: string; priorityType: string; settings: { fan: { allowedModes: string[]; changeableValues: any; }; }; inBuiltSensorState: { roomId: number; roomName: string; }; groups: configTypes.T9Thermostat['groups']; }) {
    if (this.config.devicediscovery) {
      if (device) {
        this.log.warn(JSON.stringify(device));
      }
      if (device.deviceID){
        this.log.warn(JSON.stringify(device.deviceID));
        this.log.error(`Device ID: ${device.deviceID}`);
      }
      if (device.deviceType) {
        this.log.warn(JSON.stringify(device.deviceType));
        this.log.error(`Device Type: ${device.deviceType}`);
      }
      if (device.deviceClass) {
        this.log.warn(JSON.stringify(device.deviceClass));
        this.log.error(`Device Class: ${device.deviceClass}`);
      }
      if (device.deviceModel) {
        this.log.warn(JSON.stringify(device.deviceModel));
        this.log.error(`Device Model: ${device.deviceModel}`);
      
      }
      if (device.priorityType) {
        this.log.warn(JSON.stringify(device.priorityType));
        this.log.error(`Device Priority Type: ${device.priorityType}`);
      }
      if (device.settings) {
        this.log.warn(JSON.stringify(device.settings));
        if (device.settings.fan) {
          this.log.warn(JSON.stringify(device.settings.fan));
          this.log.error(`Device Fan Settings: ${device.settings.fan}`);
          if (device.settings.fan.allowedModes) {
            this.log.warn(JSON.stringify(device.settings.fan.allowedModes));
            this.log.error(`Device Fan Allowed Modes: ${device.settings.fan.allowedModes}`);
          }
          if (device.settings.fan.changeableValues){
            this.log.warn(JSON.stringify(device.settings.fan.changeableValues));
            this.log.error(`Device Fan Changeable Values: ${device.settings.fan.changeableValues}`);
          }
        }
      }
      if (device.inBuiltSensorState) {
        this.log.warn(JSON.stringify(device.inBuiltSensorState));
        if (device.inBuiltSensorState.roomId){
          this.log.warn(JSON.stringify(device.inBuiltSensorState.roomId));
          this.log.error(`Device Built In Sensor Room ID: ${device.inBuiltSensorState.roomId}`);
        }
        if (device.inBuiltSensorState.roomName) {
          this.log.warn(JSON.stringify(device.inBuiltSensorState.roomName));
          this.log.error(`Device Built In Sensor Room Name: ${device.inBuiltSensorState.roomName}`);
        }
      }
      if (device.groups) {
        this.log.warn(JSON.stringify(device.groups));
        
        for (const group of device.groups) {
          this.log.error(`Group: ${group.id}`);
        }
      }
    }
  }
}