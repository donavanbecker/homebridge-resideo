import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME, HoneywellUrl, UIurl } from './settings';
import { ThermostatPlatformAccessory } from './platformAccessory';
import { interval } from 'rxjs';
import axios from 'axios';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class HoneywellThermostatPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  axios: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance: any;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);
    // only load if configured
    if (!config) {
      return;
    }

    // set the class properties
    this.log = log;
    this.config = config;
    this.api = api;
    

    // verify the config
    try {
      this.verifyConfig();
      this.log.debug('Config OK');
    } catch (e) {
      this.log.error(e.message);
      return;
    }
 
    const instance = axios.create({
      headers: {
        auth: {
          bearer: () => this.config.credentials.accessToken,
        },
        qs: {
          apikey: this.config.credentials.consumerKey,
        },
        json: true,
      }});
    this.instance = instance;

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();

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
    this.config.options.debug = this.config.options.debug || false; // default false

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    if (this.config.credentials.consumerSecret) {
      result = await axios.get(`${HoneywellUrl}/oauth2/token`, {
        auth: {
          username: this.config.credentials.consumerKey,
          password: this.config.credentials.consumerSecret,
        },
        data: {
          grant_type: 'refresh_token',
          refresh_token: this.config.credentials.refreshToken,
        },
        responseType: 'json',
      });
    } else {
      // if no consumerSecret is defined, attempt to use the shared consumerSecret
      try {
        result = await axios.post(UIurl, {
          json: {
            consumerKey: this.config.credentials.consumerKey,
            refresh_token: this.config.credentials.refreshToken,
          },
        });
      } catch (e) {
        this.log.error('Failed to exchange refresh token for an access token.', e.message);
        throw e;
      }
    }

    this.config.credentials.accessToken = result.access_token;
    this.config.warn('Got access token:', this.config.credentials.accessToken);

    // check if the refresh token has changed
    if (result.refresh_token !== this.config.credentials.refreshToken) {
      // need some way to store this???
      this.log.warn('New refresh token:', result.refresh_token);
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
    const locations = await this.instance.get(`${HoneywellUrl}/v2/locations`);

    this.log.warn(`Found ${locations.length} locations`);

    // get the devices at each location
    for (const location of locations) {
      this.log.warn(`Getting devices for ${location.name}...`);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const locationId = location.locationID;
      this.log.warn(locationId);
      this.log.warn(location);  
      const devices = await this.instance.get(`${HoneywellUrl}/v2/devices`, {
        qs: {
          locationId: location.locationID,
        },
      });
      this.log.warn(devices);
      this.log.warn(`Found ${devices.length} devices at ${location.name}.`);

      // loop over the discovered devices and register each one if it has not already been registered
      for (const device of devices) {

        // generate a unique id for the accessory this should be generated from
        // something globally unique, but constant, for example, the device serial
        // number or MAC address
        if (device.isAlive && device.deviceClass === 'Thermostat') {
          const uuid = this.api.hap.uuid.generate(device.deviceID);

          // see if an accessory with the same uuid has already been registered and restored from
          // the cached devices we stored in the `configureAccessory` method above
          const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

          if (existingAccessory) {
            // the accessory already exists
            this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
            this.log.warn(`Registering new device: ${device.name} - ${device.deviceID}`);
            // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
            //existingAccessory.context.device = device;
            //this.api.updatePlatformAccessories([existingAccessory]);

            // create the accessory handler for the restored accessory
            // this is imported from `platformAccessory.ts`
            new ThermostatPlatformAccessory(this, existingAccessory, locationId, device);

          } else {
            // the accessory does not yet exist, so we need to create it
            this.log.info('Adding new accessory:', device.exampleDisplayName);

            // create a new accessory
            const accessory = new this.api.platformAccessory(device.exampleDisplayName, uuid);

            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;

            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new ThermostatPlatformAccessory(this, accessory, locationId, device);

            // link the accessory to your platform
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          }

        } else {
          // eslint-disable-next-line max-len
          this.log.warn(`Ignoring device named ${device.name} - ${device.deviceID}  as it is offline. Alive: ${device.isAlive}, Provisioned: ${device.isProvisioned}, Class: ${device.deviceClass}`);
        }
      }
    }
  }

  /**
   * If debug level logging is turned on, log to log.info
   * Otherwise send debug logs to log.debug
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug(log: any) {
    if (this.config.options.debug) {
      this.log.info('[HONEYWELL DEBUG]', ...log);
    } else{
      this.log.debug('[DEBUG]', ...log);
    }
  }
}
