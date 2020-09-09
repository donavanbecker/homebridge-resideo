/* eslint-disable max-len */
import { Service, PlatformAccessory } from 'homebridge';

import { HoneywellHomePlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { DeviceURL } from '../settings';
//import { } from '../configTypes';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class RoomSensorThermostat {
  private service: Service;
  batteryService: any;
  temperatureService: any;
  occupancyService: any;
  humidityService: any;
  motionService: any;

  private modes: { Off: number; Heat: number; Cool: number; Auto: number; };

  TargetTemperature: any;
  CurrentHeatingCoolingState: any;
  TargetHeatingCoolingState: any;
  CoolingThresholdTemperature: any;
  HeatingThresholdTemperature!: any;
  TemperatureDisplayUnits!: number;
  CurrentTemperature: any;
  StatusLowBattery: any;
  OccupancyDetected: any;
  CurrentRelativeHumidity: any;
  MotionDetected!: any;
  roompriority!: any;
  batteryStatus!: string;
  indoorTemperature!: number;
  occupancyDet: any;
  indoorHumidity: any;
  motionDet: any;

  roomUpdateInProgress!: boolean;
  doRoomUpdate!: any;
  thermostatUpdateInProgress!: boolean;
  doThermostatUpdate!: any;
  honeywellMode: any;
  SensorUpdateInProgress!: boolean;
  doSensorUpdate!: any;

  constructor(
    private readonly platform: HoneywellHomePlatform,
    private accessory: PlatformAccessory,
    public readonly locationId,
    public device,
    public accessories,
    public sensoraccessory,
    public rooms,
    public readonly group,
  ) {

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
    this.StatusLowBattery;
    this.OccupancyDetected;
    this.CurrentRelativeHumidity;
    this.MotionDetected;
    this.TargetTemperature;
    this.CurrentHeatingCoolingState;
    this.TargetHeatingCoolingState;
    this.CoolingThresholdTemperature;
    this.HeatingThresholdTemperature;
    this.TemperatureDisplayUnits;
    this.batteryStatus;
    this.indoorTemperature;
    this.occupancyDet;
    this.indoorHumidity;
    this.motionDet;

    // this is subject we use to track when we need to POST changes to the Honeywell API
    this.doRoomUpdate = new Subject();
    this.roomUpdateInProgress = false;
    this.doThermostatUpdate = new Subject();
    this.thermostatUpdateInProgress = false;
    this.doSensorUpdate = new Subject();
    this.SensorUpdateInProgress = false;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Honeywell')
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.type)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.deviceID)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.firmwareRevision);

    // get the Thermostat service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Thermostat) ||
      this.accessory.addService(this.platform.Service.Thermostat),
    `${this.accessory.context.name} Room Sensor Thermostat`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name,
      `${this.accessory.context.name} Room Sensor Thermostat`);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/

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

    this.batteryService = this.accessory.getService(this.platform.Service.BatteryService);
    if (!this.batteryService && !this.platform.config.options.roomsensor.hide_battery) {
      this.batteryService = accessory.addService(this.platform.Service.BatteryService,
        `${this.accessory.context.name} Battery`);

      // Set Charging State
      this.batteryService
        .setCharacteristic(this.platform.Characteristic.ChargingState, 2);

      // Set Low Battery
      this.batteryService
        .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
        .on('get', this.handeStatusLowBatteryGet.bind(this));
    } else if (this.batteryService && this.platform.config.options.roomsensor.hide_battery) {
      accessory.removeService(this.batteryService);
    }

    // Temperature Sensor  
    this.temperatureService = accessory.getService(this.platform.Service.TemperatureSensor);
    if (!this.temperatureService && !this.platform.config.options.roomsensor.hide_temperature) {
      this.temperatureService = accessory.addService(this.platform.Service.TemperatureSensor,
        `${this.accessory.context.name} Occupancy Sensor`);

      // Set Temperature Sensor  
      this.temperatureService
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .on('get', this.handleCurrentTemperatureGet.bind(this));
    } else if (this.temperatureService && this.platform.config.options.roomsensor.hide_temperature) {
      accessory.removeService(this.temperatureService);
    }

    // Occupancy Sensor  
    this.occupancyService = accessory.getService(this.platform.Service.OccupancySensor);
    if (!this.occupancyService && !this.platform.config.options.roomsensor.hide_occupancy) {
      this.occupancyService = accessory.addService(this.platform.Service.OccupancySensor,
        `${this.accessory.context.name} Occupancy Sensor`);

      // Set Occupancy Sensor  
      this.occupancyService
        .getCharacteristic(this.platform.Characteristic.OccupancyDetected)
        .on('get', this.handleOccupancyDetectedGet.bind(this));
    } else if (this.occupancyService && this.platform.config.options.roomsensor.hide_occupancy) {
      accessory.removeService(this.occupancyService);
    }

    // Humidity Sensor
    this.humidityService = accessory.getService(this.platform.Service.HumiditySensor);
    if (!this.humidityService && !this.platform.config.options.roomsensor.hide_humidity) {
      this.humidityService = accessory.addService(this.platform.Service.HumiditySensor,
        `${this.accessory.context.name} Humidity Sensor`);

      // Set Humidity Sensor Current Relative Humidity
      this.humidityService
        .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .on('get', this.handleCurrentRelativeHumidityGet.bind(this));
    } else if (this.humidityService && this.platform.config.options.roomsensor.hide_humidity) {
      accessory.removeService(this.humidityService);
    }

    // Motion Sensor
    this.motionService = accessory.getService(this.platform.Service.MotionSensor);
    if (!this.motionService && !this.platform.config.options.roomsensor.hide_motion) {
      this.motionService = accessory.addService(this.platform.Service.MotionSensor,
        `${this.accessory.context.name} Motion Sensor`);

      // Set Motion Sensor Detected
      this.motionService
        .getCharacteristic(this.platform.Characteristic.MotionDetected)
        .on('get', this.handleMotionDetectedGet.bind(this));
    } else if (this.motionService && this.platform.config.options.roomsensor.hide_motion) {
      accessory.removeService(this.motionService);
    }

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // Start an update interval
    interval(this.platform.config.options.ttl * 1000).pipe(skipWhile(() => this.roomUpdateInProgress)).subscribe(() => {
      this.refreshStatus();
    });
    interval(this.platform.config.options.ttl * 1000).pipe(skipWhile(() => this.thermostatUpdateInProgress)).subscribe(() => {
      this.refreshStatus();
    });
    interval(this.platform.config.options.ttl * 1000).pipe(skipWhile(() => this.SensorUpdateInProgress)).subscribe(() => {
      this.refreshStatus();
    });

    // Watch for thermostat change events
    // We put in a debounce of 100ms so we don't make duplicate calls    
    this.doRoomUpdate.pipe(tap(() => {
      this.roomUpdateInProgress = true;
    }), debounceTime(100)).subscribe(async () => {
      try {
        await this.pushRoomChanges();
      } catch (e) {
        this.platform.log.error(e.message);
      }
      this.roomUpdateInProgress = false;
    });
    this.doThermostatUpdate.pipe(tap(() => {
      this.thermostatUpdateInProgress = true;
    }), debounceTime(100)).subscribe(async () => {
      try {
        await this.pushChanges();
      } catch (e) {
        this.platform.log.error(e.message);
      }
      this.thermostatUpdateInProgress = false;
    });
    this.doSensorUpdate.pipe(tap(() => {
      this.SensorUpdateInProgress = true;
    }), debounceTime(100)).subscribe(async () => {
      this.SensorUpdateInProgress = false;
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

    this.CurrentTemperature = this.toCelsius(this.indoorTemperature);
    this.CurrentRelativeHumidity = this.indoorHumidity;

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

    if (!this.platform.config.options.roomsensor.hide_battery) {// Set Room Sensor State
      if (this.batteryStatus === 'Ok') {
        this.StatusLowBattery = 0;
      } else if (this.batteryStatus !== 'Ok') {
        this.StatusLowBattery = 1;
      }
    }

    // Set Temperature Sensor State
    if (!this.platform.config.options.roomsensor.hide_temperature) {
      this.CurrentTemperature = this.toCelsius(this.indoorTemperature);
    }

    // Set Occupancy Sensor State
    if (!this.platform.config.options.roomsensor.hide_occupancy) {
      if (this.occupancyDet === true) {
        this.OccupancyDetected = 1;
      } else if (this.occupancyDet === false) {
        this.OccupancyDetected = 0;
      }
    }

    // Set Humidity Sensor State
    if (!this.platform.config.options.roomsensor.hide_humidity) {
      this.CurrentRelativeHumidity = this.indoorHumidity;
    }

    // Set Motion Sensor State
    if (!this.platform.config.options.roomsensor.hide_motion) {
      this.MotionDetected = this.motionDet;
      if (this.motionDet === false) {
        this.MotionDetected = true;
      } else if (this.motionDet === true) {
        this.MotionDetected = false;
      }
    }
  }

  /**
   * Asks the Honeywell Home API for the latest device information
   */
  async refreshStatus() {
    try {
      const roompriority = (await this.platform.axios.get(`${DeviceURL}/thermostats/${this.device.deviceID}/priority`, {
        params: {
          locationId: this.locationId,
        },
      })).data;
      const sensoraccessory = (await this.platform.axios.get(`${DeviceURL}/thermostats/${this.device.deviceID}/group/${this.group.id}/rooms`, {
        params: {
          locationId: this.locationId,
        },
      })).data;
      this.platform.log.debug(JSON.stringify(roompriority));
      this.roompriority = roompriority;
      this.platform.log.debug(JSON.stringify(sensoraccessory));
      this.sensoraccessory = sensoraccessory;
      this.platform.log.debug(JSON.stringify(sensoraccessory.accessoryValue));
      this.batteryStatus = sensoraccessory.accessoryValue.batteryStatus;
      this.platform.log.warn(JSON.stringify(sensoraccessory.accessoryValue.batteryStatus));
      this.indoorTemperature = sensoraccessory.accessoryValue.indoorTemperature;
      this.platform.log.warn(JSON.stringify(sensoraccessory.accessoryValue.indoorTemperature));
      this.occupancyDet = sensoraccessory.accessoryValue.occupancyDet;
      this.platform.log.warn(JSON.stringify(sensoraccessory.accessoryValue.occupancyDet));
      this.indoorHumidity = sensoraccessory.accessoryValue.indoorHumidity;
      this.platform.log.warn(JSON.stringify(sensoraccessory.accessoryValue.indoorHumidity));
      this.motionDet = sensoraccessory.accessoryValue.motionDet;
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e) {
      this.platform.log.error(`Failed to update status of ${this.device.name}`, e.message);
    }
  }

  /**
   * Pushes the requested changes for Fan to the Honeywell API 
   */
  async pushRoomChanges() {
    const payload = {
      currentPriority: {
        priorityType: 'PickARoom',
        selectedRooms: [this.rooms.id],
      },
    };

    this.platform.log.info(`Sending request to Honeywell API. Room Priority: ${payload.currentPriority.selectedRooms}`);
    this.platform.log.debug(JSON.stringify(payload));

    // Make the API request
    const pushRoomChanges = (await this.platform.axios.put(`${DeviceURL}/thermostats/${this.device.deviceID}/priority`, payload, {
      params: {
        locationId: this.locationId,
      },
    })).data;
    pushRoomChanges;
    // Refresh the status from the API
    await this.refreshStatus();
  }

  /**
 * Pushes the requested changes to the Honeywell API
 */
  async pushChanges() {
    const payload = {
      mode: this.honeywellMode[this.TargetHeatingCoolingState],
      thermostatSetpointStatus: 'TemporaryHold',
      autoChangeoverActive: this.device.changeableValues.autoChangeoverActive,
    } as any;

    // Set the heat and cool set point value based on the selected mode
    if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
      payload.heatSetpoint = this.toFahrenheit(this.TargetTemperature);
      payload.coolSetpoint = this.toFahrenheit(this.CoolingThresholdTemperature);
    } else if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.COOL) {
      payload.coolSetpoint = this.toFahrenheit(this.TargetTemperature);
      payload.heatSetpoint = this.toFahrenheit(this.HeatingThresholdTemperature);
    } else if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.AUTO) {
      payload.coolSetpoint = this.toFahrenheit(this.CoolingThresholdTemperature);
      payload.heatSetpoint = this.toFahrenheit(this.HeatingThresholdTemperature);
    } else {
      payload.coolSetpoint = this.toFahrenheit(this.CoolingThresholdTemperature);
      payload.heatSetpoint = this.toFahrenheit(this.HeatingThresholdTemperature);
    }

    this.platform.log.info(`Sending request to Honeywell API. mode: ${payload.mode}, coolSetpoint: ${payload.coolSetpoint}, heatSetpoint: ${payload.heatSetpoint}`);
    this.platform.log.debug(JSON.stringify(payload));

    // Make the API request
    await this.platform.axios.post(`${DeviceURL}/thermostats/${this.device.deviceID}`, payload, {
      params: {
        locationId: this.locationId,
      },
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
    if (!this.platform.config.options.roomsensor.hide_battery) {
      this.batteryService.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
    }
    if (!this.platform.config.options.roomsensor.hide_temperature) {
      this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
    }
    if (!this.platform.config.options.roomsensor.hide_occupancy) {
      this.occupancyService.updateCharacteristic(this.platform.Characteristic.OccupancyDetected, this.OccupancyDetected);
    }
    if (!this.platform.config.options.roomsensor.hide_humidity) {
      this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
    }
    if (!this.platform.config.options.roomsensor.hide_motion) {
      this.motionService.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.MotionDetected);
    }
  }

  setTargetHeatingCoolingState(value: any, callback: (arg0: null) => void) {
    this.platform.log.debug(`Set TargetHeatingCoolingState: ${value}`);
    this.TargetHeatingCoolingState = value;

    // Set the TargetTemperature value based on the selected mode
    if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
      this.TargetTemperature = this.toCelsius(this.device.changeableValues.heatSetpoint);
    } else {
      this.TargetTemperature = this.toCelsius(this.device.changeableValues.coolSetpoint);
    }
    this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.TargetTemperature);
    this.doRoomUpdate.next();
    this.doThermostatUpdate.next();
    callback(null);
  }

  setHeatingThresholdTemperature(value: any, callback: (arg0: null) => void) {
    this.platform.log.debug(`Set HeatingThresholdTemperature: ${value}`);
    this.HeatingThresholdTemperature = value;
    this.doThermostatUpdate.next();
    callback(null);
  }

  setCoolingThresholdTemperature(value: any, callback: (arg0: null) => void) {
    this.platform.log.debug(`Set CoolingThresholdTemperature: ${value}`);
    this.CoolingThresholdTemperature = value;
    this.doThermostatUpdate.next();
    callback(null);
  }

  setTargetTemperature(value: any, callback: (arg0: null) => void) {
    this.platform.log.debug(`Set TargetTemperature:': ${value}`);
    this.TargetTemperature = value;
    this.doThermostatUpdate.next();
    callback(null);
  }

  setTemperatureDisplayUnits(value: any, callback: (arg0: null) => void) {
    this.platform.log.debug(`Set TemperatureDisplayUnits: ${value}`);
    this.platform.log.warn('Changing the Hardware Display Units from HomeKit is not supported.');

    // change the temp units back to the one the Honeywell API said the thermostat was set to
    setTimeout(() => {
      this.service.updateCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, this.TemperatureDisplayUnits);
    }, 100);

    callback(null);
  }

  /**
 * Handle requests to get the current value of the "Tempeture Sensor" characteristics
 */
  handeStatusLowBatteryGet(callback: (arg0: null, arg1: any) => void) {
    this.platform.log.debug(`Update Battery Status: ${this.StatusLowBattery}`);

    // set this to a valid value for StatusLowBattery
    const currentValue = this.StatusLowBattery;

    this.doSensorUpdate.next();
    callback(null, currentValue);
  }

  handleCurrentTemperatureGet(callback: (arg0: null, arg1: any) => void) {
    this.platform.log.debug(`Update Current Temperature: ${this.CurrentTemperature}`);

    // set this to a valid value for CurrentTemperature
    const currentValue = this.CurrentTemperature;

    this.doSensorUpdate.next();
    callback(null, currentValue);
  }

  /**
 * Handle requests to get the current value of the "Occupancy Sensor" characteristics
 */
  handleOccupancyDetectedGet(callback: (arg0: null, arg1: any) => void) {
    this.platform.log.debug(`Update Occupancy: ${this.OccupancyDetected}`);

    // set this to a valid value for OccupancyDetected
    const currentValue = this.OccupancyDetected;

    this.doSensorUpdate.next();
    callback(null, currentValue);
  }

  /**
 * Handle requests to get the current value of the "Humidity Sensor" characteristics
 */
  handleCurrentRelativeHumidityGet(callback: (arg0: null, arg1: any) => void) {
    this.platform.log.debug(`Update Current Relative Humidity: ${this.CurrentRelativeHumidity}`);

    // set this to a valid value for CurrentRelativeHumidity
    const currentValue = this.CurrentRelativeHumidity;

    this.doSensorUpdate.next();
    callback(null, currentValue);
  }

  /**
 * Handle requests to get the current value of the "Motion Sensor" characteristics
 */
  handleMotionDetectedGet(callback: (arg0: null, arg1: any) => void) {
    this.platform.log.debug(`Update Motion: ${this.MotionDetected}`);

    // set this to a valid value for Motion Detected
    const currentValue = this.MotionDetected;

    this.doSensorUpdate.next();
    callback(null, currentValue);
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

}