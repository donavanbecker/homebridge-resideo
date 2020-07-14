/* jshint asi: true, esversion: 6, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

const rp = require('request-promise-native')
const { Subject, interval } = require('rxjs');
const { debounceTime, skipWhile, tap } = require('rxjs/operators');

let Accessory, Service, Characteristic, UUIDGen;

module.exports = function (homebridge) {
  Accessory      = homebridge.platformAccessory
  Service        = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  UUIDGen        = homebridge.hap.uuid

  homebridge.registerPlatform('homebridge-honeywell-home', 'HoneywellHome', HoneywellHomePlatform)
}

class HoneywellHomePlatform {
  constructor(log, config, api) {
    // only load if configured
    if (!config) {
      return;
    }

    // set the class properties
    this.log = log;
    this.config = config;
    this.api = api;

    this.accessories = {};
    this.activeAccessories = [];

    // verify the config
    try {
      this.verifyConfig();
      this.debug('Config OK')
    } catch (e) {
      this.log.error(e.message);
      return;
    }

    // setup the default http request handler
    this.rp = rp.defaults({
      auth: {
        bearer: () => this.config.credentials.accessToken,
      },
      qs: {
        apikey: this.config.credentials.consumerKey,
      },
      json: true,
    });

    // start accessory discovery
    this.discoverDevices();

    // start access token interval (default access token expiry is 1800 seconds)
    interval((1800 / 3) * 1000).subscribe(async () => {
      try {
        await this.getAccessToken();
      } catch (e) {
        this.log.error('Failed to refresh access token.')
      }
    });
  }

  // Called when a cached accessory is loaded
  configureAccessory(accessory) {
    this.debug('Loaded cached accessory', accessory.displayName);
    this.accessories[accessory.UUID] = accessory;
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
      this.log.debug('TTL must be set to 1800 or higher unless you setup your own consumerSecret.')
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
    let result;
    if (this.config.credentials.consumerSecret) {
      result = await rp.post('https://api.honeywell.com/oauth2/token', {
        auth: {
          user: this.config.credentials.consumerKey,
          pass: this.config.credentials.consumerSecret,
        },
        form: {
          grant_type: 'refresh_token',
          refresh_token: this.config.credentials.refreshToken,
        },
        json: true,
      });
    } else {
      // if no consumerSecret is defined, attempt to use the shared consumerSecret
      try {
        result = await rp.post('https://homebridge-honeywell.iot.oz.nu/user/refresh', {
          json: {
            consumerKey: this.config.credentials.consumerKey,
            refresh_token: this.config.credentials.refreshToken,
          }
        });
      } catch (e) {
        this.log.error('Failed to exchange refresh token for an access token.', e.message);
        throw e;
      }
    }

    this.config.credentials.accessToken = result.access_token;
    this.debug('Got access token:', this.config.credentials.accessToken);

    // check if the refresh token has changed
    if (result.refresh_token !== this.config.credentials.refreshToken) {
      // need some way to store this???
      this.log.warn('New refresh token:', result.refresh_token);
    }
  }

  /**
   * Discoveres the users devices and registers them on the platform
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
    const locations = await this.rp.get('https://api.honeywell.com/v2/locations');

    this.debug(`Found ${locations.length} locations`);

    // get the devices at each location
    for (const location of locations) {
      this.debug(`Getting devices for ${location.name}...`);

      const devices = await this.rp.get('https://api.honeywell.com/v2/devices', {
        qs: {
          locationId: location.locationID,
        }
      });
      this.log.debug(devices);

      this.log.info(`Found ${devices.length} devices at ${location.name}.`)

      // check each device to see if it's a new accessory or an existing one
      for (const device of devices) {
        if (device.isAlive && device.isProvisioned && device.deviceClass === 'Thermostat') {
          const UUID = UUIDGen.generate(device.deviceID);

          // Mark the accessory as found so it will not be removed
          if (!this.activeAccessories.includes(UUID)) {
            this.activeAccessories.push(UUID);
          }

          if (!this.accessories[UUID]) {
            // this is a new accessory we haven't seen before
            this.log.info(`Registering new device: ${device.name} - ${device.deviceID}`);
            this.accessories[UUID] = new Accessory(device.name, UUID);
            this.startAccessory(this.accessories[UUID], device, location.locationID);
            this.startSensorAccessory(this.accessories[UUID], device, location.locationID);
            this.api.registerPlatformAccessories('homebridge-honeywell-home', 'HoneywellHome', [this.accessories[UUID]]);
          } else {
            // this is an existing accessory
            this.log.info(`Loading existing device: ${device.name} - ${device.deviceID}`);
            this.startAccessory(this.accessories[UUID], device, location.locationID);
            this.startSensorAccessory(this.accessories[UUID], device, location.locationID);
          }
        } else {
          this.debug(`Ignoring device named ${device.name} as it is offline.`)
        }
      }
    }
  }

  /**
   * Starts the accessory
   */
  startAccessory(accessory, device, locationId) {
    return new HoneywellHomePlatformThermostat(this.log, this, accessory, device, locationId);
  }

  /**
   * Starts the accessory
   */
  startSensorAccessory(accessory, device, locationId) {
    return new HoneywellHomePlatformRoomSensor(this.log, this, accessory, device, locationId);
  }

  /**
   * If debug level logging is turned on, log to log.info
   * Otherwise send debug logs to log.debug
   */
  debug(...log) {
    if (this.config.options.debug) {
      this.log.info('[DEBUG]', ...log);
    } else{
      this.log.debug(...log)
    }
  }

}

/**
 * An instance of this class is created for each thermostat discovered
 */
class HoneywellHomePlatformThermostat {
  constructor(log, platform, accessory, device, locationId) {
    this.log = log;
    this.platform = platform;
    this.accessory = accessory;
    this.device = device;
    this.locationId = locationId;

    // Map Honeywell Modes to HomeKit Modes
    this.modes = {
      'Off': Characteristic.TargetHeatingCoolingState.OFF,
      'Heat': Characteristic.TargetHeatingCoolingState.HEAT,
      'Cool': Characteristic.TargetHeatingCoolingState.COOL,
      'Auto': Characteristic.TargetHeatingCoolingState.AUTO,
    }

    // Map HomeKit Modes to Honeywell Modes
    // Don't change the order of these!
    this.honeywellMode = ['Off', 'Heat', 'Cool', 'Auto'];

    // default placeholders
    this.CurrentTemperature;
    this.TargetTemperature;
    this.CurrentHeatingCoolingState;
    this.TargetHeatingCoolingState;
    this.CoolingThresholdTemperature;
    this.HeatingThresholdTemperature;
    this.CurrentRelativeHumidity;
    this.TemperatureDisplayUnits;
    this.Active;
    this.TargetFanState;
    this.fanMode;
    this.rooms;

    // this is subject we use to track when we need to POST changes to the Honeywell API
    this.doThermostatUpdate = new Subject();
    this.thermostatUpdateInProgress = false;
    this.doFanUpdate = new Subject();
    this.fanUpdateInProgress = false;

    // setup or get the base service
    this.service = accessory.getService(Service.Thermostat) ?
      accessory.getService(Service.Thermostat) : accessory.addService(Service.Thermostat, this.device.name);

    // Thermostat Accessory Information
    this.accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Name, device.name)
      .setCharacteristic(Characteristic.Manufacturer, 'Honeywell')
      .setCharacteristic(Characteristic.Model, device.deviceModel)
      .setCharacteristic(Characteristic.SerialNumber, device.deviceID);
      
    this.updateFirmwareInfo();

    // Set Name
    this.service.setCharacteristic(Characteristic.Name, this.device.name);

    // Do initial device parse
    this.parseStatus();

    // Set Min and Max
    this.service.getCharacteristic(Characteristic.TargetTemperature)
      .setProps({
        minValue: this.toCelsius(device.minCoolSetpoint),
        maxCoolSetpoint: this.toCelsius(device.maxCoolSetpoint),
        minStep: 0.5
      });

    // Set control bindings
    this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .on('set', this.setTargetHeatingCoolingState.bind(this));

    this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .on('set', this.setHeatingThresholdTemperature.bind(this));

    this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
      .on('set', this.setCoolingThresholdTemperature.bind(this));

    this.service.getCharacteristic(Characteristic.TargetTemperature)
      .on('set', this.setTargetTemperature.bind(this));

    this.service.getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .on('set', this.setTemperatureDisplayUnits.bind(this));


    // Fan Controls
    this.fanService = accessory.getService(Service.Fanv2) ?
      accessory.getService(Service.Fanv2) : accessory.addService(Service.Fanv2, `${this.device.name} Fan`);

      this.fanService
        .getCharacteristic(Characteristic.Active)
        .on('set', this.setActive.bind(this));

      this.fanService
        .getCharacteristic(Characteristic.TargetFanState)
        .on('set', this.setTargetFanState.bind(this));

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // Start an update interval
    interval(this.platform.config.options.ttl * 1000).pipe(skipWhile(() => this.thermostatUpdateInProgress)).subscribe(() => {
      this.refreshStatus();
    })

    // Watch for thermostat change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doThermostatUpdate.pipe(tap(() => {this.thermostatUpdateInProgress = true}), debounceTime(100)).subscribe(async () => {
      await this.pushChanges();
      this.thermostatUpdateInProgress = false;
    })

    this.doFanUpdate.pipe(tap(() => {this.fanUpdateInProgress = true}), debounceTime(100)).subscribe(async () => {
      await this.pushFanChanges();
      this.fanUpdateInProgress = false;
    })
  }

  /**
   * Parse the device status from the honeywell api
   */
  parseStatus() {
    this.TemperatureDisplayUnits = this.device.units === 'Fahrenheit' ? Characteristic.TemperatureDisplayUnits.FAHRENHEIT : Characteristic.TemperatureDisplayUnits.CELSIUS;
    this.TemperatureDisplayUnits = this.device.units === 'Fahrenheit' ? Characteristic.TemperatureDisplayUnits.FAHRENHEIT : Characteristic.TemperatureDisplayUnits.CELSIUS;

    this.CurrentTemperature = this.toCelsius(this.device.indoorTemperature);
    this.CurrentRelativeHumidity = this.device.indoorHumidity;

    if (this.device.changeableValues.heatSetpoint > 0) {
      this.HeatingThresholdTemperature = this.toCelsius(this.device.changeableValues.heatSetpoint);
    }

    if (this.device.changeableValues.coolSetpoint > 0) {
      this.CoolingThresholdTemperature = this.toCelsius(this.device.changeableValues.coolSetpoint);
    }

    this.TargetHeatingCoolingState = this.modes[this.device.changeableValues.mode];

    // If auto the CurrentHeatingCoolingState is either 'Heat' or 'Cool'
    if (this.device.changeableValues.mode === 'Auto') {
      this.CurrentHeatingCoolingState = this.modes[this.device.changeableValues.heatCoolMode];
    } else {
      this.CurrentHeatingCoolingState = this.modes[this.device.changeableValues.mode];
    }

    // Set the TargetTemperature value based on the current mode
    if (this.TargetHeatingCoolingState === Characteristic.TargetHeatingCoolingState.HEAT) {
      if (this.device.changeableValues.heatSetpoint > 0) {
        this.TargetTemperature = this.toCelsius(this.device.changeableValues.heatSetpoint);
      }
    } else {
      if (this.device.changeableValues.coolSetpoint > 0) {
        this.TargetTemperature = this.toCelsius(this.device.changeableValues.coolSetpoint);
      }
    }

    // Set the Target Fan State

    if (this.deviceFan) {
      this.platform.debug(`${JSON.stringify(this.deviceFan)}`);

      if (this.deviceFan.mode === 'Auto') {
        this.TargetFanState = Characteristic.TargetFanState.AUTO;
        this.Active = Characteristic.Active.INACTIVE;
      } else if (this.deviceFan.mode === 'On') {
        this.TargetFanState = Characteristic.TargetFanState.MANUAL;
        this.Active = Characteristic.Active.ACTIVE;
      } else if (this.deviceFan.mode === 'Circulate') {
        this.TargetFanState = Characteristic.TargetFanState.MANUAL;
        this.Active = Characteristic.Active.INACTIVE;
      }
    }
  }

  /**
   * Asks the Honeywell Home API for the latest device information
   */
  async refreshStatus() {
    try {
      const device = await this.platform.rp.get(`https://api.honeywell.com/v2/devices/thermostats/${this.device.deviceID}`, {
        qs: {
          locationId: this.locationId
        }
      });
      const devicefan = await this.platform.rp.get(`https://api.honeywell.com/v2/devices/thermostats/${this.device.deviceID}/fan`, {
        qs: {
          locationId: this.locationId
        }
      });
      this.platform.debug(`Fetched update for ${this.device.name} from Honeywell API: ${JSON.stringify(this.device.changeableValues)} and Fan: ${JSON.stringify(devicefan)}`);
      this.device = device;
      this.deviceFan = devicefan;
      this.platform.debug(JSON.stringify(this.device.changeableValues.mode));
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e) {
      this.log.error(`Failed to update status of ${this.device.name}`, e.message);
    }
  }
  
  /**
   * Asks the Honeywell Home API for the firmware version information
   */
  async updateFirmwareInfo() {
    const rooms = await this.platform.rp.get(`https://api.honeywell.com/v2/devices/thermostats/${this.device.deviceID}/group/0/rooms`, {
      qs: {
        locationId: this.locationId
      }
    });
    this.log.debug(rooms);
    this.rooms = rooms;
    this.accessory.context.firmwareRevision = this.rooms.rooms[0].accessories[0].accessoryAttribute.softwareRevision
    this.platform.debug(`Fetched Thermostat FirmwareRevision: ${this.accessory.context.firmwareRevision}`);
    this.accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.FirmwareRevision, this.accessory.context.firmwareRevision);
  }

  /**
   * Pushes the requested changes to the Honeywell API
   */
  async pushChanges() {
    const payload = {
      mode: this.honeywellMode[this.TargetHeatingCoolingState],
      thermostatSetpointStatus: 'TemporaryHold',
      autoChangeoverActive: this.device.changeableValues.autoChangeoverActive,
    }

    // Set the heat and cool set point value based on the selected mode
    if (this.TargetHeatingCoolingState === Characteristic.TargetHeatingCoolingState.HEAT) {
      payload.heatSetpoint = this.toFahrenheit(this.TargetTemperature);
      payload.coolSetpoint = this.toFahrenheit(this.CoolingThresholdTemperature);
    } else if (this.TargetHeatingCoolingState === Characteristic.TargetHeatingCoolingState.COOL) {
      payload.coolSetpoint = this.toFahrenheit(this.TargetTemperature);
      payload.heatSetpoint = this.toFahrenheit(this.HeatingThresholdTemperature);
    } else if (this.TargetHeatingCoolingState === Characteristic.TargetHeatingCoolingState.AUTO) {
      payload.coolSetpoint = this.toFahrenheit(this.CoolingThresholdTemperature);
      payload.heatSetpoint = this.toFahrenheit(this.HeatingThresholdTemperature);
    } else {
      payload.coolSetpoint = this.toFahrenheit(this.CoolingThresholdTemperature);
      payload.heatSetpoint = this.toFahrenheit(this.HeatingThresholdTemperature);
    }

    this.log.info(`Sending request to Honeywell API. mode: ${payload.mode}, coolSetpoint: ${payload.coolSetpoint}, heatSetpoint: ${payload.heatSetpoint}`);
    this.platform.debug(JSON.stringify(payload));

    // Make the API request
    await this.platform.rp.post(`https://api.honeywell.com/v2/devices/thermostats/${this.device.deviceID}`, {
      qs: {
        locationId: this.locationId,
      },
      json: payload,
    });

    // Refresh the status from the API
    await this.refreshStatus();
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    this.service.updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.TemperatureDisplayUnits);
    this.service.updateCharacteristic(Characteristic.CurrentTemperature, this.CurrentTemperature);
    this.service.updateCharacteristic(Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
    this.service.updateCharacteristic(Characteristic.TargetTemperature, this.TargetTemperature);
    this.service.updateCharacteristic(Characteristic.HeatingThresholdTemperature, this.HeatingThresholdTemperature);
    this.service.updateCharacteristic(Characteristic.CoolingThresholdTemperature, this.CoolingThresholdTemperature);
    this.service.updateCharacteristic(Characteristic.TargetHeatingCoolingState, this.TargetHeatingCoolingState);
    this.service.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, this.CurrentHeatingCoolingState);
    this.fanService.updateCharacteristic(Characteristic.TargetFanState, this.TargetFanState);
    this.fanService.updateCharacteristic(Characteristic.Active, this.Active);
  }

  setTargetHeatingCoolingState(value, callback) {
    this.platform.debug('Set TargetHeatingCoolingState:', value);

    this.TargetHeatingCoolingState = value;

    // Set the TargetTemperature value based on the selected mode
    if (this.TargetHeatingCoolingState === Characteristic.TargetHeatingCoolingState.HEAT) {
      this.TargetTemperature = this.toCelsius(this.device.changeableValues.heatSetpoint)
    } else {
      this.TargetTemperature = this.toCelsius(this.device.changeableValues.coolSetpoint)
    }
    this.service.updateCharacteristic(Characteristic.TargetTemperature, this.TargetTemperature);

    this.doThermostatUpdate.next();
    callback(null);
  }

  setHeatingThresholdTemperature(value, callback) {
    this.platform.debug('Set HeatingThresholdTemperature:', value);
    this.HeatingThresholdTemperature = value;
    this.doThermostatUpdate.next();
    callback(null);
  }

  setCoolingThresholdTemperature(value, callback) {
    this.platform.debug('Set CoolingThresholdTemperature:', value);
    this.CoolingThresholdTemperature = value;
    this.doThermostatUpdate.next();
    callback(null);
  }

  setTargetTemperature(value, callback) {
    this.platform.debug('Set TargetTemperature:', value);
    this.TargetTemperature = value;
    this.doThermostatUpdate.next();
    callback(null);
  }

  setTemperatureDisplayUnits(value, callback) {
    this.platform.debug('Set TemperatureDisplayUnits', value);
    this.log.warn('Changing the Hardware Display Units from HomeKit is not supported.');

    // change the temp units back to the one the Honeywell API said the thermostat was set to
    setTimeout(() => {
      this.service.updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.TemperatureDisplayUnits);
    }, 100);

    callback(null);
  }

  /**
   * Converts the value to celsius if the temperature units are in Fahrenheit
   */
  toCelsius(value) {
    if (this.TemperatureDisplayUnits === Characteristic.TemperatureDisplayUnits.CELSIUS) {
      return value;
    }

    // celsius should be to the nearest 0.5 degree
    return Math.round(((5 / 9) * (value - 32)) * 2) / 2;
  }

  /**
   * Converts the value to fahrenheit if the temperature units are in Fahrenheit
   */
  toFahrenheit(value) {
    if (this.TemperatureDisplayUnits === Characteristic.TemperatureDisplayUnits.CELSIUS) {
      return value;
    }

    return Math.round((value * 9 / 5) + 32);
  }

  /**
   * Pushes the requested changes to the Honeywell API
   */
  async pushFanChanges() {
    var payload = {
      mode: 'Auto'
    }; // default to Auto

    this.platform.debug("TargetFanState", this.TargetFanState, "Active", this.Active);

    if (this.TargetFanState === Characteristic.TargetFanState.AUTO) {
      payload = {
        mode: 'Auto'
      };
    } else if (this.TargetFanState === Characteristic.TargetFanState.MANUAL && this.Active === Characteristic.Active.ACTIVE) {
      payload = {
        mode: 'On'
      };
    } else if (this.TargetFanState === Characteristic.TargetFanState.MANUAL && this.Active === Characteristic.Active.INACTIVE) {
      payload = {
        mode: 'Circulate'
      };
    }

    this.log.info(`Sending request to Honeywell API. Fan Mode: ${payload.mode}`);
    this.platform.debug(JSON.stringify(payload));

    // Make the API request
    await this.platform.rp.post(`https://api.honeywell.com/v2/devices/thermostats/${this.device.deviceID}/fan`, {
      qs: {
        locationId: this.locationId
      },
      json: payload
    });

    // Refresh the status from the API
    await this.refreshStatus();
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */

  setActive(value, callback) {
    this.platform.debug('Set Active State:', value);
    this.Active = value;
    this.doFanUpdate.next();
    callback(null);
  }

  setTargetFanState(value, callback) {
    this.platform.debug('Set Target Fan State:', value);
    this.TargetFanState = value;
    this.doFanUpdate.next();
    callback(null);
  }
}

/**
 * An instance of this class is created for each Room Sensor discovered
 */
class HoneywellHomePlatformRoomSensor {
  constructor(log, platform, accessory, device, locationId) {
    this.log = log;
    this.platform = platform;
    this.accessory = accessory;
    this.device = device;
    this.locationId = locationId;
    this.rooms = rooms;

    // default placeholders
    this.CurrentTemperature;
    this.TemperatureStatusLowBattery;
    this.TemperatureActive;
    this.OccupancyDetected
    this.OccupancyActive;
    this.HumidityActive;
    this.CurrentRelativeHumidity;
    this.MotionDetected
    this.MotionActive
    this.TemperatureStatusLowBattery;

    // this is subject we use to track when we need to POST changes to the Honeywell API
    this.doSenosrUpdate = new Subject();
    this.SensorUpdateInProgress = false;

    // setup or get the base service
    this.service = accessory.getService(Service.TemperatureSensor) ?
      accessory.getService(Service.TemperatureSensor) : accessory.addService(Service.TemperatureSensor, `${this.device.name} Room Sensor`);

    // Temperature Sensor Accessory Information
    this.accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Name, device.name)
      .setCharacteristic(Characteristic.Manufacturer, 'Honeywell')
      .setCharacteristic(Characteristic.Model, device.deviceModel)
      .setCharacteristic(Characteristic.SerialNumber, device.deviceID)
 
    this.updateFirmwareInfo();

      // Set Name
      this.service.setCharacteristic(Characteristic.Name, this.rooms.rooms[1].name);

      // Do initial device parse
      this.parseStatus();

      // Set Active
      this.service.getCharacteristic(Characteristic.Active)
      .on('get', this.handleTemperatureActiveGet.bind(this));

      // Set Low Battery
      this.service.getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.handeTemperatureStatusLowBatteryGet.bind(this));

      // Set Current Temperature
      this.service.getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', this.handleCurrentTemperatureGet.bind(this));

    // Occupancy Sensor
    this.occupancyService = accessory.getService(Service.OccupancySensor) ?
      accessory.getService(Service.OccupancySensor) : accessory.addService(Service.OccupancySensor, `${this.device.name} Fan`);

      // Set Occupancy Sensor Active
      this.occupancyService
        .getCharacteristic(Characteristic.Active)
        .on('get', this.handleOccupancyActiveGet.bind(this));

      // Set Occupancy Sensor  
      this.occupancyService
        .getCharacteristic(Characteristic.OccupancyDetected)
        .on('get', this.handleOccupancyDetectedGet.bind(this));

    // Humidity Sensor
    this.humidityService = accessory.getService(Service.HumiditySensor) ?
      accessory.getService(Service.HumiditySensor) : accessory.addService(Service.HumiditySensor, `${this.device.name} Fan`);

      // Set Humidity Sensor Active
      this.humidityService
        .getCharacteristic(Characteristic.Active)
        .on('get', this.handleHumidityActiveGet.bind(this));

      // Set Humidity Sensor Current Relative Humidity
      this.humidityService
        .getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .on('get', this.handleCurrentRelativeHumidityGet.bind(this));

    // Motion Sensor
    this.motionService = accessory.getService(Service.HumiditySensor) ?
      accessory.getService(Service.HumiditySensor) : accessory.addService(Service.HumiditySensor, `${this.device.name} Fan`);

      // Set Motion Sensor Active
      this.motionService
        .getCharacteristic(Characteristic.StatusActive)
        .on('get', this.handleMotionStatusActiveGet.bind(this));

      // Set Motion Sensor Detected
      this.motionService
        .getCharacteristic(Characteristic.MotionDetected)
        .on('get', this.handleMotionDetectedGet.bind(this));

    // Retrieve initial values and updateHomekit
    this.refreshSensorStatus();

    // Start an update interval
    interval(this.platform.config.options.ttl * 1000).pipe(skipWhile(() => this.SensorUpdateInProgress)).subscribe(() => {
      this.refreshSensorStatus();
    })

    // Watch for thermostat change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doSenosrUpdate.pipe(tap(() => {this.SensorUpdateInProgress = true}), debounceTime(100)).subscribe(async () => {
      await this.pushChanges();
      this.SensorUpdateInProgress = false;
    })

  }

  /**
   * Parse the device status from the honeywell api
   */
  parseStatus() {
    // Set Temperature Sensor State
    this.TemperatureActive = this.rooms.rooms[0].accessories[0].accessoryValue.status;
    this.CurrentTemperature = this.rooms.rooms[0].accessories[0].accessoryValue.indoorTemperature;
    this.TemperatureStatusLowBattery = this.rooms.rooms[0].accessories[0].accessoryValue.batteryStatus;
    
    // Set Occupancy Sensor State
    this.OccupancyActive = this.rooms.rooms[0].accessories[0].accessoryValue.status;
    this.OccupancyDetected = this.rooms.rooms[0].accessories[0].accessoryValue.occupancyDet;
    
    // Set Humidity Sensor State
    this.HumidityActive = this.rooms.rooms[0].accessories[0].accessoryValue.status;
    this.CurrentRelativeHumidity = this.rooms.rooms[0].accessories[0].accessoryValue.indoorHumidity;
    
    // Set Motion Sensor State
    this.MotionActive = this.rooms.rooms[0].accessories[0].accessoryValue.status;
    this.MotionDetected = this.rooms.rooms[0].accessories[0].accessoryValue.motionDet;
    
  }

  /**
   * Asks the Honeywell Home API for the latest device information
   */
  async refreshSensorStatus() {
    try {
      const rooms = await this.platform.rp.get(`https://api.honeywell.com/v2/devices/thermostats/${this.device.deviceID}/group/0/rooms`, {
        qs: {
          locationId: this.locationId
        }
      });
      this.rooms = rooms;
      this.platform.debug(`Found ${this.rooms.length} Rooms`);
      this.platform.debug(JSON.stringify(this.rooms.rooms[0].accessories[0].accessoryValue));
      this.device = rooms.deviceId;
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e) {
      this.log.error(`Failed to update status of ${this.device.name}`, e.message);
    }
  }
  
  /**
   * Asks the Honeywell Home API for the firmware version information
   */
  async updateFirmwareInfo() {
    const rooms = await this.platform.rp.get(`https://api.honeywell.com/v2/devices/thermostats/${this.device.deviceID}/group/0/rooms`, {
      qs: {
        locationId: this.locationId
      }
    });
    this.rooms = rooms;
    this.accessory.context.firmwareRevision = this.rooms.rooms[1].accessories[0].accessoryAttribute.softwareRevision;
    this.platform.debug(`Fetched Room Sensor FirmwareRevision: ${this.accessory.context.firmwareRevision}`);
    this.accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.FirmwareRevision, this.accessory.context.firmwareRevision);
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    this.service.updateCharacteristic(Characteristic.Active, this.TemperatureActive);
    this.service.updateCharacteristic(Characteristic.StatusLowBattery, this.TemperatureStatusLowBattery);
    this.service.updateCharacteristic(Characteristic.CurrentTemperature, this.CurrentTemperature);
    this.occupancyService.updateCharacteristic(Characteristic.Active, this.OccupancyActive);
    this.occupancyService.updateCharacteristic(Characteristic.OccupancyDetected, this.OccupancyDetected);
    this.humidityService.updateCharacteristic(Characteristic.Active, this.HumidityActive);
    this.humidityService.updateCharacteristic(Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
    this.motionService.updateCharacteristic(Characteristic.StatusActive, this.MotionActive);
    this.motionService.updateCharacteristic(Characteristic.MotionDetected, this.MotionDetected);
  }

  /**
   * Handle requests to get the current value of the "Tempeture Sensor" characteristics
   */
  handleCurrentTemperatureGet(callback) {
    this.platform.debug('Triggered GET CurrentTemperature');

    // set this to a valid value for CurrentTemperature
    const currentValue = this.CurrentTemperature;

    callback(null, currentValue);
  }

  handeTemperatureStatusLowBatteryGet(callback) {
    this.platform.debug('Triggered GET Status Low Battery');

    // set this to a valid value for StatusLowBattery
    const currentValue = this.TemperatureStatusLowBattery;

    callback(null, currentValue);
  }

  handleTemperatureActiveGet(callback) {
    this.platform.debug('Triggered GET Status Active');

    // set this to a valid value for StatusLowBattery
    const currentValue = this.TemperatureActive;

    callback(null, currentValue);
  }

  /**
   * Handle requests to get the current value of the "Occupancy Sensor" characteristics
   */
  handleOccupancyDetectedGet(callback) {
    this.platform.debug('Triggered GET OccupancyDetected');

    // set this to a valid value for OccupancyDetected
    const currentValue = this.OccupancyDetected;

    callback(null, currentValue);
  }

  handleOccupancyActiveGet(callback) {
    this.platform.debug('Triggered GET Occupancy Status Active');

    // set this to a valid value for Occupancy Active
    const currentValue = this.OccupancyActive;

    callback(null, currentValue);
  }

  /**
   * Handle requests to get the current value of the "Humidity Sensor" characteristics
   */
  handleCurrentRelativeHumidityGet(callback) {
    this.platform.debug('Triggered GET CurrentRelativeHumidity');

    // set this to a valid value for CurrentRelativeHumidity
    const currentValue = this.CurrentRelativeHumidity;

    callback(null, currentValue);
  }

  handleHumidityActiveGet(callback) {
    this.platform.debug('Triggered GET CurrentRelativeHumidity');

    // set this to a valid value for CurrentRelativeHumidity
    const currentValue = this.HumidityActive;

    callback(null, currentValue);
  }

  /**
   * Handle requests to get the current value of the "Motion Sensor" characteristics
   */
  handleMotionDetectedGet(callback) {
    this.platform.debug('Triggered GET Motion Detected');

    // set this to a valid value for Motion Detected
    const currentValue = this.MotionDetected;

    callback(null, currentValue);
  }

  handleMotionStatusActiveGet(callback) {
    this.platform.debug('Triggered GET Motion Active Status');

    // set this to a valid value for Motion Active Status
    const currentValue = this.MotionActive;

    callback(null, currentValue);
  }
}