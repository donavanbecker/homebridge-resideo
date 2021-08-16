import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, Service, Characteristic } from 'homebridge';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as qs from 'querystring';
import { readFileSync, writeFileSync } from 'fs';
import {
  PLATFORM_NAME,
  PLUGIN_NAME,
  AuthURL,
  LocationURL,
  DeviceURL,
  UIurl,
  location,
  sensorAccessory,
  accessoryAttribute,
  Thermostat,
  T9groups,
  LeakDevice,
  inBuiltSensorState,
  Settings,
  HoneywellPlatformConfig,
} from './settings';
import { Thermostats } from './devices/thermostats';
import { LeakSensor } from './devices/leaksensors';
import { RoomSensors } from './devices/roomsensors';
import { RoomSensorThermostat } from './devices/roomsensorthermostats';

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

  locations?: any;
  firmware!: accessoryAttribute['softwareRevision'];
  sensorAccessory!: sensorAccessory;
  version = require('../package.json').version // eslint-disable-line @typescript-eslint/no-var-requires

  public sensorData = [];
  private refreshInterval;
  debugMode!: boolean;

  constructor(public readonly log: Logger, public readonly config: HoneywellPlatformConfig, public readonly api: API) {
    this.log.debug('Finished initializing platform:', this.config.name);
    // only load if configured
    if (!this.config) {
      return;
    }

    // HOOBS notice
    if (__dirname.includes('hoobs')) {
      this.log.warn('This plugin has not been tested under HOOBS, it is highly recommended that ' +
        'you switch to Homebridge: https://git.io/Jtxb0');
    }

    // verify the config
    try {
      this.verifyConfig();
      this.log.debug('Config OK');
    } catch (e) {
      this.log.error(JSON.stringify(e.message));
      this.log.debug(JSON.stringify(e));
      return;
    }

    this.debugMode = process.argv.includes('-D') || process.argv.includes('--debug');

    // setup axios interceptor to add headers / api key to each request
    this.axios.interceptors.request.use((request: AxiosRequestConfig) => {
      request.headers.Authorization = `Bearer ${this.config.credentials?.accessToken}`;
      request.params = request.params || {};
      request.params.apikey = this.config.credentials?.consumerKey;
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
      await this.refreshAccessToken();
      try {
        this.locations = await this.discoverlocations();
      } catch (e) {
        this.log.error('Failed to Discover Locations,', JSON.stringify(e.message));
        this.log.debug(JSON.stringify(e));
      }
      try {
        this.discoverDevices();
      } catch (e) {
        this.log.error('Failed to Discover Devices,', JSON.stringify(e.message));
        this.log.debug(JSON.stringify(e));
      }
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
    /**
     * Hidden Device Discovery Option
     * This will disable adding any device and will just output info.
     */
    this.config.devicediscovery;
    this.config.disablePlugin;

    this.config.options = this.config.options || {};

    // Hide Devices by DeviceID
    this.config.options.hide_device = this.config.options.hide_device || [];

    // Thermostat Config Options
    this.config.options.thermostat = this.config.options.thermostat || {};
    this.config.options.thermostat.hide_fan;
    this.config.options.thermostat.thermostatSetpointStatus = this.config.options.thermostat.thermostatSetpointStatus || 'PermanentHold';

    // Leak Sensor Config Options
    this.config.options.leaksensor = this.config.options.leaksensor || {};
    this.config.options.leaksensor.hide_humidity;
    this.config.options.leaksensor.hide_temperature;
    this.config.options.leaksensor.hide_leak;

    // Room Sensor Config Options
    this.config.options.roomsensor = this.config.options.roomsensor || {};
    this.config.options.roomsensor.hide_temperature;
    this.config.options.roomsensor.hide_occupancy;
    this.config.options.roomsensor.hide_humidity;


    // Room Priority Config Options
    this.config.options.roompriority = this.config.options.roompriority || {};
    this.config.options.roompriority.thermostat;
    this.config.options.roompriority.priorityType = this.config.options.roompriority.priorityType || 'PickARoom';


    if (this.config.options!.refreshRate! < 120) {
      throw new Error('Refresh Rate must be above 120 (2 minutes).');
    }

    if (this.config.disablePlugin) {
      this.log.error('Plugin is disabled.');
    }

    if (!this.config.options.refreshRate && !this.config.disablePlugin) {
      // default 900 seconds (15 minutes)
      this.config.options!.refreshRate! = 900;
      this.log.warn('Using Default Refresh Rate.');
    }

    if (!this.config.options.pushRate && !this.config.disablePlugin) {
      // default 100 milliseconds
      this.config.options!.pushRate! = 0.1;
      this.log.warn('Using Default Push Rate.');

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

  async refreshAccessToken() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    this.refreshInterval = setInterval(() => this.getAccessToken(), (1800 / 3) * 1000);
    await this.getAccessToken();
  }

  /**
   * Exchange the refresh token for an access token
   */
  async getAccessToken() {
    try {
      let result: { access_token: string; refresh_token: string; };

      if (this.config.credentials!.consumerSecret) {
        result = (
          await axios({
            url: AuthURL,
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            auth: {
              username: this.config.credentials!.consumerKey,
              password: this.config.credentials!.consumerSecret,
            },
            data: qs.stringify({
              grant_type: 'refresh_token',
              refresh_token: this.config.credentials!.refreshToken,
            }),
            responseType: 'json',
          })
        ).data;
      } else {
        this.log.warn('Please re-link your account in the Homebridge UI.');
        // if no consumerSecret is defined, attempt to use the shared consumerSecret
        try {
          result = (
            await axios.post(UIurl, {
              consumerKey: this.config.credentials!.consumerKey,
              refresh_token: this.config.credentials!.refreshToken,
            })
          ).data;
        } catch (e) {
          this.log.error('Failed to exchange refresh token for an access token.', JSON.stringify(e.message));
          this.log.debug(JSON.stringify(e));
          throw e;
        }
      }

      this.config.credentials!.accessToken = result.access_token;
      if (this.debugMode) {
        this.log.warn('Got access token:', this.config.credentials!.accessToken);
      }
      // check if the refresh token has changed
      if (result.refresh_token !== this.config.credentials!.refreshToken) {
        if (this.debugMode) {
          this.log.warn('New refresh token:', result.refresh_token);
        }
        await this.updateRefreshToken(result.refresh_token);
      }

      this.config.credentials!.refreshToken = result.refresh_token;
    } catch (e) {
      this.log.error('Failed to refresh access token.', JSON.stringify(e.message));
      this.log.debug(JSON.stringify(e));
    }
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
      const pluginConfig = currentConfig.platforms.find((x: { platform: string }) => x.platform === PLATFORM_NAME);

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
      if (this.debugMode) {
        this.log.warn('Homebridge config.json has been updated with new refresh token.');
      }
    } catch (e) {
      this.log.error('Failed to update refresh token in config:', JSON.stringify(e.message));
      this.log.debug(JSON.stringify(e));
    }
  }

  /**
   * this method discovers the Locations
   */
  async discoverlocations() {
    const locations = (await this.axios.get(LocationURL)).data;
    this.log.info('Total Locations Found:', locations.length);
    return locations;
  }

  /**
   * this method discovers the rooms at each location
   */
  public async getCurrentSensorData(device: Thermostat, group: T9groups, locationId: location['locationID']) {
    if (!this.sensorData[device.deviceID] || this.sensorData[device.deviceID].timestamp < Date.now()) {
      const response = await this.axios.get(`${DeviceURL}/thermostats/${device.deviceID}/group/${group.id}/rooms`, {
        params: {
          locationId: locationId,
        },
      });
      this.sensorData[device.deviceID] = {
        timestamp: Date.now() + 45000,
        data: this.normalizeSensorDate(response.data),
      };
    } else {
      if (this.debugMode) {
        this.log.warn(
          'getCurrentSensorData Cache %s %s - %s',
          device.deviceType,
          device.deviceModel,
          device.userDefinedDeviceName,
        );
      }
    }
    return this.sensorData[device.deviceID].data;
  }

  private normalizeSensorDate(sensorRoomData: { rooms: any; }) {
    const normalized = [] as any;
    for (const room of sensorRoomData.rooms) {
      normalized[room.id] = [] as any;
      for (const sensorAccessory of room.accessories) {
        sensorAccessory.roomId = room.id;
        normalized[room.id][sensorAccessory.accessoryId] = sensorAccessory;
      }
    }
    return normalized;
  }

  /**
   * this method discovers the firmware Veriosn for T9 Thermostats
   */
  public async getSoftwareRevision(locationId: location['locationID'], device: Thermostat) {
    if (device.deviceModel.startsWith('T9') && device.groups) {
      for (const group of device.groups) {
        const roomsensors = await this.getCurrentSensorData(device, group, locationId);
        if (this.config.options?.roompriority?.thermostat) {
          this.log.info('Total Rooms Found:', roomsensors.length);
        }
        for (const accessories of roomsensors) {
          if (accessories) {
            for (const key in accessories) {
              const sensorAccessory = accessories[key];
              if (
                sensorAccessory.accessoryAttribute &&
                sensorAccessory.accessoryAttribute.type &&
                sensorAccessory.accessoryAttribute.type.startsWith('Thermostat')
              ) {
                this.log.debug(
                  'Software Revision',
                  group.id,
                  sensorAccessory.roomId,
                  sensorAccessory.accessoryId,
                  sensorAccessory.accessoryAttribute.name,
                  JSON.stringify(sensorAccessory.accessoryAttribute.softwareRevision),
                );
                return sensorAccessory.accessoryAttribute.softwareRevision;
              } else {
                this.log.info('No Thermostat', device, group, locationId);
              }
            }
          } else {
            this.log.info('No accessories', device, group, locationId);
          }
        }
      }
    } else {
      this.log.info('Not a T9 Thermostat', device.deviceModel.startsWith('T9'), device.groups);
    }
  }

  /**
   * This method is used to discover the your location and devices.
   * Accessories are registered by either their DeviceClass, DeviceModel, or DeviceID
   */
  private async discoverDevices() {
    if (this.locations) {
      // get the devices at each location
      for (const location of this.locations) {
        this.log.info('Total Devices Found at', location.name, ':', location.devices.length);
        const locationId = location.locationID;
        this.locationinfo(location);
        for (const device of location.devices) {
          this.deviceinfo(device);
          switch (device.deviceClass) {
            case 'LeakDetector':
              if (this.config.devicediscovery) {
                this.log.info('Discovered %s - %s', device.deviceType, location.name, device.userDefinedDeviceName);
              }
              this.Leak(device, locationId);
              break;
            case 'Thermostat':
              if (this.config.devicediscovery) {
                this.log.info(
                  'Discovered %s %s - %s',
                  device.deviceType,
                  device.deviceModel,
                  location.name,
                  device.userDefinedDeviceName,
                );
              }
              await this.createThermostat(location, device, locationId);
              if (device.deviceModel.startsWith('T9')) {
                try {
                  await this.discoverRoomSensors(location.locationID, device);
                } catch (e) {
                  this.log.error('Failed to Find Room Sensor(s).', JSON.stringify(e.message));
                  this.log.debug(JSON.stringify(e));
                }
              }
              break;
            default:
              this.log.info(
                'Unsupported Device found, enable `"devicediscovery": true`',
                'Please open Feature Request Here: https://git.io/JURLY',
              );
          }
        }
      }
    } else {
      this.log.error('Failed to Discover Locations. Re-Link Your Honeywell Home Account.');
    }
  }

  private async discoverRoomSensors(locationId: location['locationID'], device: Thermostat) {
    // get the devices at each location
    this.roomsensordisplaymethod(device);
    if (device.groups) {
      for (const group of device.groups) {
        const roomsensors = await this.getCurrentSensorData(device, group, locationId);
        for (const accessories of roomsensors) {
          if (accessories) {
            for (const key in accessories) {
              const sensorAccessory = accessories[key];
              if (sensorAccessory.accessoryAttribute) {
                if (sensorAccessory.accessoryAttribute.type) {
                  if (sensorAccessory.accessoryAttribute.type.startsWith('IndoorAirSensor')) {
                    if (this.config.devicediscovery) {
                      this.log.info(
                        'Discovered Room Sensor groupId: %s, roomId: %s, accessoryId: %s',
                        group.id,
                        sensorAccessory.roomId,
                        sensorAccessory.accessoryId,
                        sensorAccessory.accessoryAttribute.name,
                      );
                    }
                    if (sensorAccessory.accessoryAttribute.model === '0') {
                      sensorAccessory.accessoryAttribute.model = '4352';
                    }
                    sensorAccessory.deviceID = `${sensorAccessory.accessoryId}${sensorAccessory.roomId}${sensorAccessory.accessoryAttribute.model}`;
                    this.createRoomSensors(device, locationId, sensorAccessory, group);
                    this.createRoomSensorThermostat(device, locationId, sensorAccessory, group);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  private roomsensordisplaymethod(device: Thermostat) {
    if (this.config.options?.roompriority) {
      /**
       * Room Priority
       * This will display what room priority option that has been selected.
       */
      if (
        this.config.options.roompriority.thermostat &&
        !this.config.options?.hide_device.includes(device.deviceID) &&
        !this.config.disablePlugin
      ) {
        this.log.warn('Displaying Thermostat(s) for Each Room Sensor(s).');
      }
      if (
        !this.config.options.roompriority.thermostat &&
        !this.config.options?.hide_device.includes(device.deviceID) &&
        !this.config.disablePlugin
      ) {
        this.log.warn('Only Displaying Room Sensor(s).');
      }
    }
  }

  private async createThermostat(location: location, device: Thermostat, locationId: location['locationID']) {
    const uuid = this.api.hap.uuid.generate(`${device.name}-${device.deviceID}-${device.deviceModel}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (
        !this.config.options?.hide_device.includes(device.deviceID) &&
        device.isAlive &&
        !this.config.disablePlugin
      ) {
        this.log.info(
          'Restoring existing accessory from cache:',
          existingAccessory.displayName,
          'DeviceID:',
          device.deviceID,
        );

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        await this.thermostatFirmwareExistingAccessory(device, existingAccessory, location);
        existingAccessory.context.device = device;
        existingAccessory.context.deviceID = device.deviceID;
        existingAccessory.context.model = device.deviceModel;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Thermostats(this, existingAccessory, locationId, device);
        this.log.debug(`Thermostat UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (
      !this.config.options?.hide_device.includes(device.deviceID) &&
      device.isAlive &&
      !this.config.disablePlugin
    ) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(
        'Adding new accessory:',
        device.name,
        'Thermostat',
        device.deviceModel,
        device.deviceType,
        'DeviceID:',
        device.deviceID,
      );

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.name} ${device.deviceType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      await this.thermostatFirmwareNewAccessory(device, accessory, location);
      accessory.context.device = device;
      accessory.context.deviceID = device.deviceID;
      accessory.context.model = device.deviceModel;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Thermostats(this, accessory, locationId, device);
      this.log.debug(`Thermostat UDID: ${device.name}-${device.deviceID}-${device.deviceModel}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      if (this.config.devicediscovery) {
        this.log.error(
          'Unable to Register new device:',
          device.name,
          'Thermostat',
          device.deviceModel,
          device.deviceType,
          'DeviceID:',
          device.deviceID,
        );
        this.log.error('Check Config to see if DeviceID is being Hidden.');
      }
    }
  }

  private Leak(device: LeakDevice, locationId: location['locationID']) {
    const uuid = this.api.hap.uuid.generate(`${device.userDefinedDeviceName}-${device.deviceID}-${device.deviceClass}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options?.hide_device.includes(device.deviceID) && device.isAlive && !this.config.disablePlugin) {
        this.log.info(
          'Restoring existing accessory from cache:',
          existingAccessory.displayName,
          'DeviceID:',
          device.deviceID,
        );

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.displayName = device.userDefinedDeviceName;
        existingAccessory.context.deviceID = device.deviceID;
        existingAccessory.context.model = device.deviceClass;
        existingAccessory.context.firmwareRevision = this.version;
        this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new LeakSensor(this, existingAccessory, locationId, device);
        this.log.debug(`Leak Sensor UDID: ${device.userDefinedDeviceName}-${device.deviceID}-${device.deviceClass}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (
      !this.config.options?.hide_device.includes(device.deviceID) &&
      device.isAlive &&
      !this.config.disablePlugin
    ) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(
        'Adding new accessory:',
        device.userDefinedDeviceName,
        device.deviceClass,
        'DeviceID:',
        device.deviceID,
      );

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.userDefinedDeviceName} ${device.deviceClass}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceID = device.deviceID;
      accessory.context.model = device.deviceClass;
      accessory.context.firmwareRevision = this.version;

      // accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
      // create the accessory handler for the newly create accessory
      // this is imported from `/Sensors/leakSensors.ts`
      new LeakSensor(this, accessory, locationId, device);
      this.log.debug(`Leak Sensor UDID: ${device.userDefinedDeviceName}-${device.deviceID}-${device.deviceClass}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      if (this.config.devicediscovery) {
        this.log.error(
          'Unable to Register new device:',
          device.userDefinedDeviceName,
          device.deviceClass,
          'DeviceID:',
          device.deviceID,
        );
        this.log.error('Check Config to see if DeviceID is being Hidden.');
      }
    }
  }

  private createRoomSensors(
    device: Thermostat,
    locationId: location['locationID'],
    sensorAccessory: sensorAccessory,
    group: T9groups,
  ) {
    // Room Sensor(s)
    // this.log.info('createRoomSensors', device, locationId, sensorAccessory, group);
    const uuid = this.api.hap.uuid.generate(
      `${sensorAccessory.accessoryAttribute.name}-${sensorAccessory.accessoryAttribute.type}-${sensorAccessory.accessoryId}-RoomSensor`,
    );
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (
        !this.config.options?.hide_device.includes(sensorAccessory.deviceID) &&
        device.isAlive &&
        !this.config.disablePlugin
      ) {
        this.log.info(
          'Restoring existing accessory from cache:',
          existingAccessory.displayName,
          'DeviceID:',
          sensorAccessory.deviceID,
        );

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.deviceID = sensorAccessory.deviceID;
        existingAccessory.context.model = sensorAccessory.accessoryAttribute.model;
        existingAccessory.context.firmwareRevision = sensorAccessory.accessoryAttribute.softwareRevision || this.version;
        this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new RoomSensors(this, existingAccessory, locationId, device, sensorAccessory, group);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (
      !this.config.options?.hide_device.includes(sensorAccessory.deviceID) &&
      device.isAlive &&
      !this.config.disablePlugin
    ) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(
        'Adding new accessory:',
        sensorAccessory.accessoryAttribute.name,
        sensorAccessory.accessoryAttribute.type,
        'DeviceID:',
        sensorAccessory.deviceID,
      );

      // create a new accessory
      const accessory = new this.api.platformAccessory(
        `${sensorAccessory.accessoryAttribute.name} ${sensorAccessory.accessoryAttribute.type}`,
        uuid,
      );

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.deviceID = sensorAccessory.deviceID;
      accessory.context.model = sensorAccessory.accessoryAttribute.model;
      accessory.context.firmwareRevision = sensorAccessory.accessoryAttribute.softwareRevision || this.version;

      // create the accessory handler for the newly create accessory
      // this is imported from `roomSensor.ts`
      new RoomSensors(this, accessory, locationId, device, sensorAccessory, group);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      if (this.config.devicediscovery) {
        this.log.error(
          'Unable to Register new device:',
          sensorAccessory.accessoryAttribute.name,
          sensorAccessory.accessoryAttribute.type,
          'DeviceID:',
          sensorAccessory.deviceID,
        );
        this.log.error('Check Config to see if DeviceID is being Hidden.');
      }
    }
  }

  private createRoomSensorThermostat(
    device: Thermostat,
    locationId: location['locationID'],
    sensorAccessory: sensorAccessory,
    group: T9groups,
  ) {
    const uuid = this.api.hap.uuid.generate(
      // eslint-disable-next-line max-len
      `${sensorAccessory.accessoryAttribute.name}-${sensorAccessory.accessoryAttribute.type}-${sensorAccessory.accessoryId}-RoomSensorThermostat-${device.deviceID}`,
    );

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory: { UUID }) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (
        device.isAlive &&
        this.config.options?.roompriority?.thermostat &&
        !this.config.options?.hide_device.includes(sensorAccessory.deviceID) &&
        !this.config.disablePlugin
      ) {
        this.log.info(
          'Restoring existing accessory from cache:',
          existingAccessory.displayName,
          'Thermostat,',
          'DeviceID:',
          sensorAccessory.deviceID,
        );

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.deviceID = sensorAccessory.deviceID;
        existingAccessory.context.model = sensorAccessory.accessoryAttribute.model;
        existingAccessory.context.firmwareRevision = sensorAccessory.accessoryAttribute.softwareRevision || this.version;
        this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new RoomSensorThermostat(this, existingAccessory, locationId, device, sensorAccessory, group);
        this.log.debug(
          // eslint-disable-next-line max-len
          `Room Sensor Thermostat UDID: ${sensorAccessory.accessoryAttribute.name}-${sensorAccessory.accessoryAttribute.type}-${sensorAccessory.accessoryId}-RoomSensorThermostat-${device.deviceID}`,
        );
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (
      device.isAlive &&
      this.config.options?.roompriority?.thermostat &&
      !this.config.options?.hide_device.includes(sensorAccessory.deviceID) &&
      !this.config.disablePlugin
    ) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(
        'Adding new accessory:',
        sensorAccessory.accessoryAttribute.name,
        sensorAccessory.accessoryAttribute.type,
        device.deviceClass,
        'DeviceID:',
        sensorAccessory.deviceID,
      );

      // create a new accessory
      const accessory = new this.api.platformAccessory(
        `${sensorAccessory.accessoryAttribute.name} ${sensorAccessory.accessoryAttribute.type} ${device.deviceClass}`,
        uuid,
      );

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.deviceID = sensorAccessory.deviceID;
      accessory.context.model = sensorAccessory.accessoryAttribute.model;
      accessory.context.firmwareRevision = sensorAccessory.accessoryAttribute.softwareRevision || this.version;

      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new RoomSensorThermostat(this, accessory, locationId, device, sensorAccessory, group);
      this.log.debug(
        // eslint-disable-next-line max-len
        `Room Sensor Thermostat UDID: ${sensorAccessory.accessoryAttribute.name}-${sensorAccessory.accessoryAttribute.type}-${sensorAccessory.accessoryId}-RoomSensorThermostat-${device.deviceID}`,
      );

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      if (this.config.devicediscovery) {
        this.log.warn(
          'Room Priority is not set, New device will not be Registered: ',
          sensorAccessory.accessoryAttribute.name,
          sensorAccessory.accessoryAttribute.type,
          'Thermostat',
          'DeviceID:',
          sensorAccessory.deviceID,
        );
      }
    }
  }

  public async thermostatFirmwareNewAccessory(device: Thermostat, accessory: PlatformAccessory, location: any) {
    if (device.deviceModel.startsWith('T9')) {
      try {
        accessory.context.firmwareRevision = await this.getSoftwareRevision(location.locationID, device);
      } catch (e) {
        this.log.error('Failed to Get T9 Firmware Version.', JSON.stringify(e.message));
        this.log.debug(JSON.stringify(e));
      }
    } else if (
      device.deviceModel.startsWith('Round') ||
      device.deviceModel.startsWith('Unknown') ||
      device.deviceModel.startsWith('D6')
    ) {
      accessory.context.firmwareRevision = device.thermostatVersion;
    } else {
      accessory.context.firmwareRevision = '9.0.0';
    }
  }

  public async thermostatFirmwareExistingAccessory(
    device: Thermostat,
    existingAccessory: PlatformAccessory,
    location: any,
  ) {
    if (device.deviceModel.startsWith('T9')) {
      try {
        existingAccessory.context.firmwareRevision = await this.getSoftwareRevision(location.locationID, device);
      } catch (e) {
        this.log.error('Failed to Get T9 Firmware Version.', JSON.stringify(e.message));
        this.log.debug(JSON.stringify(e));
      }
    } else if (
      device.deviceModel.startsWith('Round') ||
      device.deviceModel.startsWith('Unknown') ||
      device.deviceModel.startsWith('D6')
    ) {
      existingAccessory.context.firmwareRevision = device.thermostatVersion;
    } else {
      existingAccessory.context.firmwareRevision = this.version;
    }
  }

  public unregisterPlatformAccessories(existingAccessory: PlatformAccessory) {
    // remove platform accessories when no longer present
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
    this.log.warn('Removing existing accessory from cache:', existingAccessory.displayName);
  }

  public locationinfo(location: location) {
    if (this.config.devicediscovery) {
      if (location) {
        this.log.warn(JSON.stringify(location));
      }
    }
  }

  public deviceinfo(device: {
    deviceID: string;
    deviceType: string;
    deviceClass: string;
    deviceModel: string;
    priorityType: string;
    settings: Settings;
    inBuiltSensorState: inBuiltSensorState;
    groups: Thermostat['groups'];
  }) {
    if (this.config.devicediscovery) {
      this.log.warn(JSON.stringify(device));
      if (device.deviceID) {
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
          if (device.settings.fan.changeableValues) {
            this.log.warn(JSON.stringify(device.settings.fan.changeableValues));
            this.log.error(`Device Fan Changeable Values: ${device.settings.fan.changeableValues}`);
          }
        }
      }
      if (device.inBuiltSensorState) {
        this.log.warn(JSON.stringify(device.inBuiltSensorState));
        if (device.inBuiltSensorState.roomId) {
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
