import { Service, PlatformAccessory } from 'homebridge';

import { HoneywellHomePlatform } from './platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { DeviceURL } from './settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class RoomSensors {
  private service: Service;
  temperatureService: any;
  occupancyService: any;
  humidityService: any;
  motionService: any;

  CurrentTemperature: any;
  StatusLowBattery: any;
  OccupancyDetected: any;
  CurrentRelativeHumidity: any;
  MotionDetected!: any;
  sensor!: any;

  SensorUpdateInProgress!: boolean;
  doSensorUpdate!: any;
  TemperatureDisplayUnits!: number;


  constructor(
    private readonly platform: HoneywellHomePlatform,
    private accessory: PlatformAccessory,
    public readonly locationId: string,
    public device: any,
    public findaccessories: any,
    public readonly group: any,
  ) {

    // default placeholders
    this.CurrentTemperature;
    this.StatusLowBattery;
    this.OccupancyDetected;
    this.CurrentRelativeHumidity;
    this.MotionDetected;

    // this is subject we use to track when we need to POST changes to the Honeywell API
    this.doSensorUpdate = new Subject();
    this.SensorUpdateInProgress = false;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Honeywell')
      .setCharacteristic(this.platform.Characteristic.Model, this.findaccessories.accessoryAttribute.type)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.deviceID)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.firmwareRevision);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.BatteryService) ||
      this.accessory.addService(this.platform.Service.BatteryService),
    `${this.findaccessories.accessoryAttribute.name} Room Sensor`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name,
      `${this.findaccessories.accessoryAttribute.name} Room Sensor`);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/

    // Do initial device parse
    this.parseStatus();
      
    // Set Charging State
    this.service.setCharacteristic(this.platform.Characteristic.ChargingState, 2);

    // Set Low Battery
    this.service.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .on('get', this.handeStatusLowBatteryGet.bind(this));

    // Temperature Sensor  
    this.temperatureService = accessory.getService(this.platform.Service.TemperatureSensor);  
    if (!this.temperatureService && !this.platform.config.options.hide_temperature) {
      this.temperatureService = accessory.addService(this.platform.Service.TemperatureSensor,
        `${this.findaccessories.accessoryAttribute.name} Occupancy Sensor`);

      // Set Temperature Sensor  
      this.temperatureService
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .on('get', this.handleCurrentTemperatureGet.bind(this));
    } else if (this.temperatureService && this.platform.config.options.hide_temperature) {
      accessory.removeService(this.temperatureService);
    }
      
    // Occupancy Sensor  
    this.occupancyService = accessory.getService(this.platform.Service.OccupancySensor);  
    if (!this.occupancyService && !this.platform.config.options.hide_occupancy) {
      this.occupancyService = accessory.addService(this.platform.Service.OccupancySensor,
        `${this.findaccessories.accessoryAttribute.name} Occupancy Sensor`);

      // Set Occupancy Sensor  
      this.occupancyService
        .getCharacteristic(this.platform.Characteristic.OccupancyDetected)
        .on('get', this.handleOccupancyDetectedGet.bind(this));
    } else if (this.occupancyService && this.platform.config.options.hide_occupancy) {
      accessory.removeService(this.occupancyService);
    }

    // Humidity Sensor
    this.humidityService = accessory.getService(this.platform.Service.HumiditySensor);
    if (!this.humidityService && !this.platform.config.options.hide_humidity) {
      this.humidityService = accessory.addService(this.platform.Service.HumiditySensor,
        `${this.findaccessories.accessoryAttribute.name} Humidity Sensor`);

      // Set Humidity Sensor Current Relative Humidity
      this.humidityService
        .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .on('get', this.handleCurrentRelativeHumidityGet.bind(this));
    } else if (this.humidityService && this.platform.config.options.hide_humidity) {
      accessory.removeService(this.humidityService);
    }
    
    // Motion Sensor
    this.motionService = accessory.getService(this.platform.Service.MotionSensor);
    if (!this.motionService && !this.platform.config.options.hide_motion) {
      this.motionService = accessory.addService(this.platform.Service.MotionSensor,
        `${this.findaccessories.accessoryAttribute.name} Motion Sensor`);

      // Set Motion Sensor Detected
      this.motionService
        .getCharacteristic(this.platform.Characteristic.MotionDetected)
        .on('get', this.handleMotionDetectedGet.bind(this));
    } else if (this.motionService && this.platform.config.options.hide_motion) {
      accessory.removeService(this.motionService);
    }

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // Start an update interval
    interval(this.platform.config.options.ttl * 1000).pipe(skipWhile(() => this.SensorUpdateInProgress)).subscribe(() => {
      this.refreshStatus();
    });

    // Watch for thermostat change events
    // We put in a debounce of 100ms so we don't make duplicate calls
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
    // Set Room Sensor State
    if (this.findaccessories.accessoryValue.batteryStatus === 'Ok') {
      this.StatusLowBattery = 0;
    } else if (this.findaccessories.accessoryValue.batteryStatus !== 'Ok') {
      this.StatusLowBattery = 1;
    }

    // Set Temperature Sensor State
    if (!this.platform.config.options.hide_temperature) {
      this.CurrentTemperature = this.toCelsius(this.findaccessories.accessoryValue.indoorTemperature);
    }

    // Set Occupancy Sensor State
    if (!this.platform.config.options.hide_occupancy) {
      if (this.findaccessories.accessoryValue.occupancyDet === true) {
        this.OccupancyDetected = 1;
      } else if (this.findaccessories.accessoryValue.occupancyDet === false) {
        this.OccupancyDetected = 0;
      }
    }

    // Set Humidity Sensor State
    if (!this.platform.config.options.hide_humidity) {
      this.CurrentRelativeHumidity = this.findaccessories.accessoryValue.indoorHumidity;
    }

    // Set Motion Sensor State
    if (!this.platform.config.options.hide_motion) {
      this.MotionDetected = this.findaccessories.accessoryValue.motionDet;
      if (this.findaccessories.accessoryValue.motionDet === false) {
        this.MotionDetected = true;
      } else if (this.findaccessories.accessoryValue.motionDet === true) {
        this.MotionDetected = false;
      }
    }
  }

  /**
   * Asks the Honeywell Home API for the latest device information
   */
  async refreshStatus() {
    try {
      const sensor = (await this.platform.axios.get(`${DeviceURL}/thermostats/${this.device.deviceID}/group/${this.group.id}/rooms`, {
        params: {
          locationId: this.locationId,
        },
      })).data;
      this.platform.log.debug(sensor);
      this.sensor = sensor;
      this.findaccessories;
      this.platform.log.debug(this.findaccessories);
      this.platform.log.debug(JSON.stringify(this.findaccessories.accessoryValue));
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e) {
      this.platform.log.error(`Failed to update status of ${this.device.name}`, e.message);
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
    if (!this.platform.config.options.hide_temperature){
      this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
    }
    if (!this.platform.config.options.hide_occupancy) {
      this.occupancyService.updateCharacteristic(this.platform.Characteristic.OccupancyDetected, this.OccupancyDetected);
    }
    if (!this.platform.config.options.hide_humidity) {
      this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
    }
    if (!this.platform.config.options.hide_motion) {
      this.motionService.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.MotionDetected);
    }
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