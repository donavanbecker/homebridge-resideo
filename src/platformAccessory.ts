import { Service, PlatformAccessory } from 'homebridge';

import { HoneywellThermostatPlatform } from './platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { HoneywellUrl } from './settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class ThermostatPlatformAccessory {
  private service: Service;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private exampleStates = {
    On: false,
    Brightness: 100,
  }

  private modes: { Off: number; Heat: number; Cool: number; Auto: number; };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CurrentTemperature: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TargetTemperature: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CurrentHeatingCoolingState: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TargetHeatingCoolingState: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CoolingThresholdTemperature: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  HeatingThresholdTemperature!: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CurrentRelativeHumidity!: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TemperatureDisplayUnits!: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Active!: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TargetFanState!: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fanMode: any;
  thermostatUpdateInProgress!: boolean;
  
  fanUpdateInProgress!: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doThermostatUpdate!: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doFanUpdate!: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deviceFan!: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log!: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fanService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  honeywellMode: any;
  

  constructor(
    private readonly platform: HoneywellThermostatPlatform,
    private accessory: PlatformAccessory,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public device: any,
    public readonly locationId: string,
  ) {
    this.platform = platform;
    this.accessory = accessory;
    this.device = device;
    this.locationId = locationId;

    // Map Honeywell Modes to HomeKit Modes
    this.modes = {
      'Off': platform.Characteristic.TargetHeatingCoolingState.OFF,
      'Heat': platform.Characteristic.TargetHeatingCoolingState.HEAT,
      'Cool': platform.Characteristic.TargetHeatingCoolingState.COOL,
      'Auto': platform.Characteristic.TargetHeatingCoolingState.AUTO,
    };
      
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

    // this is subject we use to track when we need to POST changes to the Honeywell API
    this.doThermostatUpdate = new Subject();
    this.thermostatUpdateInProgress = false;
    this.doFanUpdate = new Subject();
    this.fanUpdateInProgress = false;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Honeywell')
      .setCharacteristic(this.platform.Characteristic.Model, this.device.deviceModel)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.deviceID);

    // set accessory firmware
    this.updateFirmwareInfo();  


    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Thermostat) || 
    this.accessory.addService(this.platform.Service.Thermostat), this.device.name;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, this.device.name);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Thermostat

    // Do initial device parse
    this.parseStatus();

    // Set Min and Max
    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .setProps({
        minValue: this.toCelsius(device.minCoolSetpoint),
        maxValue: this.toCelsius(device.maxCoolSetpoint),
        minStep: 0.5,
      });

    // Set control bindings
    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .on('set', this.setTargetHeatingCoolingState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .on('set', this.setHeatingThresholdTemperature.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .on('set', this.setCoolingThresholdTemperature.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .on('set', this.setTargetTemperature.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .on('set', this.setTemperatureDisplayUnits.bind(this));


    // Fan Controls
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const fanService = accessory.getService(this.platform.Service.Fanv2) ?
      accessory.getService(this.platform.Service.Fanv2) : accessory.addService(this.platform.Service.Fanv2, `${this.device.name} Fan`);

    this.fanService
      .getCharacteristic(this.platform.Characteristic.Active)
      .on('set', this.setActive.bind(this));

    this.fanService
      .getCharacteristic(this.platform.Characteristic.TargetFanState)
      .on('set', this.setTargetFanState.bind(this));

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // Start an update interval
    interval(this.platform.config.options.ttl * 1000).pipe(skipWhile(() => this.thermostatUpdateInProgress)).subscribe(() => {
      this.refreshStatus();
    });

    // Watch for thermostat change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doThermostatUpdate.pipe(tap(() => {
      this.thermostatUpdateInProgress = true;
    }), debounceTime(100)).subscribe(async () => {
      await this.pushChanges();
      this.thermostatUpdateInProgress = false;
    });

    this.doFanUpdate.pipe(tap(() => {
      this.fanUpdateInProgress = true;
    }), debounceTime(100)).subscribe(async () => {
      await this.pushFanChanges();
      this.fanUpdateInProgress = false;
    });
  }

  /**
   * Parse the device status from the honeywell api
   */
  parseStatus() {
    this.TemperatureDisplayUnits = this.device.units === 'Fahrenheit' ? this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT : 
      this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;
    this.TemperatureDisplayUnits = this.device.units === 'Fahrenheit' ? this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT : 
      this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;

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
    if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
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
        this.TargetFanState = this.platform.Characteristic.TargetFanState.AUTO;
        this.Active = this.platform.Characteristic.Active.INACTIVE;
      } else if (this.deviceFan.mode === 'On') {
        this.TargetFanState = this.platform.Characteristic.TargetFanState.MANUAL;
        this.Active = this.platform.Characteristic.Active.ACTIVE;
      } else if (this.deviceFan.mode === 'Circulate') {
        this.TargetFanState = this.platform.Characteristic.TargetFanState.MANUAL;
        this.Active = this.platform.Characteristic.Active.INACTIVE;
      }
    }
  }

  /**
   * Asks the Honeywell Home API for the latest device information
   */
  async refreshStatus() {
    try {
      const device = await this.platform.axios.get(`${HoneywellUrl}/v2/devices/thermostats/${this.device.deviceID}`, {
        qs: {
          locationId: this.locationId,
        },
      });
      const devicefan = await this.platform.axios.get(`${HoneywellUrl}/v2/devices/thermostats/${this.device.deviceID}/fan`, {
        qs: {
          locationId: this.locationId,
        },
      });
      // eslint-disable-next-line max-len
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
    const rooms = await this.platform.axios.get(`${HoneywellUrl}/v2/devices/thermostats/${this.device.deviceID}/group/0/rooms`, {
      qs: {
        locationId: this.locationId,
      },
    });
    this.accessory.context.firmwareRevision = rooms.rooms[0].accessories[0].accessoryAttribute.softwareRevision;
    this.platform.debug(`Fetched Thermostat FirmwareRevision: ${this.accessory.context.firmwareRevision}`); 
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.accessory.context.firmwareRevision);
  }

  /**
   * Pushes the requested changes to the Honeywell API
   */
  async pushChanges() {
    const payload = {
      mode: this.honeywellMode[this.TargetHeatingCoolingState],
      thermostatSetpointStatus: 'TemporaryHold',
      autoChangeoverActive: this.device.changeableValues.autoChangeoverActive,
    };
    this.log.warn(payload);
    

    // Set the heat and cool set point value based on the selected mode
    if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
      payload.mode.heatSetpoint = this.toFahrenheit(this.TargetTemperature);
      payload.mode.coolSetpoint = this.toFahrenheit(this.CoolingThresholdTemperature);
    } else if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.COOL) {
      payload.mode.coolSetpoint = this.toFahrenheit(this.TargetTemperature);
      payload.mode.heatSetpoint = this.toFahrenheit(this.HeatingThresholdTemperature);
    } else if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.AUTO) {
      payload.mode.coolSetpoint = this.toFahrenheit(this.CoolingThresholdTemperature);
      payload.mode.heatSetpoint = this.toFahrenheit(this.HeatingThresholdTemperature);
    } else {
      payload.mode.coolSetpoint = this.toFahrenheit(this.CoolingThresholdTemperature);
      payload.mode.heatSetpoint = this.toFahrenheit(this.HeatingThresholdTemperature);
    }

    // eslint-disable-next-line max-len
    this.log.info(`Sending request to Honeywell API. mode: ${payload.mode}, coolSetpoint: ${payload.mode.coolSetpoint}, heatSetpoint: ${payload.mode.heatSetpoint}`);
    this.platform.debug(JSON.stringify(payload));

    // Make the API request
    await this.platform.axios.post(`https://api.honeywell.com/v2/devices/thermostats/${this.device.deviceID}`, {
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
    this.service.updateCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, this.TemperatureDisplayUnits);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.TargetTemperature);
    this.service.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, this.HeatingThresholdTemperature);
    this.service.updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, this.CoolingThresholdTemperature);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState, this.TargetHeatingCoolingState);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.CurrentHeatingCoolingState);
    this.fanService.updateCharacteristic(this.platform.Characteristic.TargetFanState, this.TargetFanState);
    this.fanService.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setTargetHeatingCoolingState(value: any, callback: (arg0: null) => void) {
    this.platform.debug(`Set TargetHeatingCoolingState: ${value}`);

    this.TargetHeatingCoolingState = value;

    // Set the TargetTemperature value based on the selected mode
    if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
      this.TargetTemperature = this.toCelsius(this.device.changeableValues.heatSetpoint);
    } else {
      this.TargetTemperature = this.toCelsius(this.device.changeableValues.coolSetpoint);
    }
    this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.TargetTemperature);

    this.doThermostatUpdate.next();
    callback(null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setHeatingThresholdTemperature(value: any, callback: (arg0: null) => void) {
    this.platform.debug(`Set HeatingThresholdTemperature: ${value}`);
    this.HeatingThresholdTemperature = value;
    this.doThermostatUpdate.next();
    callback(null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setCoolingThresholdTemperature(value: any, callback: (arg0: null) => void) {
    this.platform.debug(`Set CoolingThresholdTemperature: ${value}`);
    this.CoolingThresholdTemperature = value;
    this.doThermostatUpdate.next();
    callback(null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setTargetTemperature(value: any, callback: (arg0: null) => void) {
    this.platform.debug(`Set TargetTemperature:': ${value}`);
    this.TargetTemperature = value;
    this.doThermostatUpdate.next();
    callback(null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setTemperatureDisplayUnits(value: any, callback: (arg0: null) => void) {
    this.platform.debug(`Set TemperatureDisplayUnits: ${value}`);
    this.log.warn('Changing the Hardware Display Units from HomeKit is not supported.');

    // change the temp units back to the one the Honeywell API said the thermostat was set to
    setTimeout(() => {
      this.service.updateCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, this.TemperatureDisplayUnits);
    }, 100);

    callback(null);
  }

  /**
   * Converts the value to celsius if the temperature units are in Fahrenheit
   */
  toCelsius(value: number) {
    if (this.TemperatureDisplayUnits === this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS) {
      return value;
    }

    // celsius should be to the nearest 0.5 degree
    return Math.round(((5 / 9) * (value - 32)) * 2) / 2;
  }

  /**
   * Converts the value to fahrenheit if the temperature units are in Fahrenheit
   */
  toFahrenheit(value: number) {
    if (this.TemperatureDisplayUnits === this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS) {
      return value;
    }

    return Math.round((value * 9 / 5) + 32);
  }

  /**
   * Pushes the requested changes to the Honeywell API
   */
  async pushFanChanges() {
    let payload = {
      mode: 'Auto'}; // default to Auto

    this.platform.debug(`TargetFanState' ${this.TargetFanState} 'Active' ${this.Active}`);

    if (this.TargetFanState === this.platform.Characteristic.TargetFanState.AUTO) {
      payload = {
        mode: 'Auto',
      };
    } else if (this.TargetFanState === this.platform.Characteristic.TargetFanState.MANUAL && 
      this.Active === this.platform.Characteristic.Active.ACTIVE) {
      payload = {
        mode: 'On',
      };
    } else if (this.TargetFanState === this.platform.Characteristic.TargetFanState.MANUAL && 
      this.Active === this.platform.Characteristic.Active.INACTIVE) {
      payload = {
        mode: 'Circulate',
      };
    }

    this.log.info(`Sending request to Honeywell API. Fan Mode: ${payload.mode}`);
    this.platform.debug(JSON.stringify(payload));

    // Make the API request
    await this.platform.axios.post(`https://api.honeywell.com/v2/devices/thermostats/${this.device.deviceID}/fan`, {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setActive(value: any, callback: (arg0: null) => void) {
    this.platform.debug(`Set Active State: ${value}`);
    this.Active = value;
    this.doFanUpdate.next();
    callback(null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setTargetFanState(value: any, callback: (arg0: null) => void) {
    this.platform.debug(`Set Target Fan State: ${value}`);
    this.TargetFanState = value;
    this.doFanUpdate.next();
    callback(null);
  }

}
