/* eslint-disable @typescript-eslint/no-explicit-any */
import { Service, PlatformAccessory } from 'homebridge';

import { HoneywellHomePlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { DeviceURL } from '../settings';
import * as configTypes from '../configTypes';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class LeakSensor {
  private service: Service;
  temperatureService: any;
  humidityService: any;
  leakService: any;

  StatusActive: any;
  LeakDetected: any;
  CurrentTemperature: any;
  TempStatusActive: any;
  CurrentRelativeHumidity: any;
  HumidityStatusActive: any;
  BatteryLevel: any;
  ChargingState: any;
  StatusLowBattery: any;
  sensor!: any;

  SensorUpdateInProgress!: boolean;
  doSensorUpdate!: any;
  TemperatureDisplayUnits!: number;

  constructor(
    private readonly platform: HoneywellHomePlatform,
    private accessory: PlatformAccessory,
    public readonly locationId: configTypes.location['locationID'],
    public device: configTypes.LeakDevice,
  ) {
    // default placeholders
    this.StatusActive;
    this.LeakDetected;
    this.CurrentTemperature;
    this.TempStatusActive;
    this.CurrentRelativeHumidity;
    this.HumidityStatusActive;
    this.BatteryLevel;
    this.ChargingState;
    this.StatusLowBattery;

    // this is subject we use to track when we need to POST changes to the Honeywell API
    this.doSensorUpdate = new Subject();
    this.SensorUpdateInProgress = false;

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Honeywell')
      .setCharacteristic(
        this.platform.Characteristic.Model,
        this.device.deviceType,
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        this.device.deviceID,
      );

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    (this.service =
      this.accessory.getService(this.platform.Service.BatteryService) ||
      this.accessory.addService(this.platform.Service.BatteryService)),
    `${this.device.userDefinedDeviceName} Sensor`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      `${this.device.userDefinedDeviceName} ${this.device.deviceType}`,
    );

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/

    // Do initial device parse
    this.parseStatus();

    // Set Battery Level
    this.service
      .getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .on('get', this.handleBatteryLevelGet.bind(this));

    // Set Charging State
    this.service.setCharacteristic(
      this.platform.Characteristic.ChargingState,
      2,
    );

    // Set Status Low Battery
    this.service
      .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .on('get', this.handleStatusLowBatteryGet.bind(this));

    // Leak Sensor
    this.leakService = accessory.getService(this.platform.Service.LeakSensor);
    if (
      !this.leakService &&
      !this.platform.config.options.leaksensor.hide_leak
    ) {
      this.leakService = accessory.addService(
        this.platform.Service.LeakSensor,
        `${this.device.userDefinedDeviceName} Leak Sensor`,
      );

      // Set Humidity Sensor Current Relative Humidity
      this.leakService
        .getCharacteristic(this.platform.Characteristic.LeakDetected)
        .on('get', this.handleLeakDetectedGet.bind(this));

      // Set Humidity Sensor Current Relative Humidity
      this.leakService
        .getCharacteristic(this.platform.Characteristic.StatusActive)
        .on('get', this.handleLeakStatusActiveGet.bind(this));
    } else if (
      this.leakService &&
      this.platform.config.options.leaksensor.hide_leak
    ) {
      accessory.removeService(this.leakService);
    }

    // Temperature Sensor
    this.temperatureService = accessory.getService(
      this.platform.Service.TemperatureSensor,
    );
    if (
      !this.temperatureService &&
      !this.platform.config.options.leaksensor.hide_temperature
    ) {
      this.temperatureService = accessory.addService(
        this.platform.Service.TemperatureSensor,
        `${this.device.userDefinedDeviceName} Temperature Sensor`,
      );

      // Set Temperature Sensor - Current Temperature
      this.temperatureService
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .on('get', this.handleCurrentTemperatureGet.bind(this));

      // Set Temperature Sensor - Status Active
      this.temperatureService
        .getCharacteristic(this.platform.Characteristic.StatusActive)
        .on('get', this.handleTempStatusActiveGet.bind(this));
    } else if (
      this.temperatureService &&
      this.platform.config.options.leaksensor.hide_temperature
    ) {
      accessory.removeService(this.temperatureService);
    }

    // Humidity Sensor
    this.humidityService = accessory.getService(
      this.platform.Service.HumiditySensor,
    );
    if (
      !this.humidityService &&
      !this.platform.config.options.leaksensor.hide_humidity
    ) {
      this.humidityService = accessory.addService(
        this.platform.Service.HumiditySensor,
        `${this.device.userDefinedDeviceName} Humidity Sensor`,
      );

      // Set Humidity Sensor Current Relative Humidity
      this.humidityService
        .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .on('get', this.handleCurrentRelativeHumidityGet.bind(this));

      // Set Humidity Sensor Current Relative Humidity
      this.humidityService
        .getCharacteristic(this.platform.Characteristic.StatusActive)
        .on('get', this.handleHumidityStatusActiveGet.bind(this));
    } else if (
      this.humidityService &&
      this.platform.config.options.leaksensor.hide_humidity
    ) {
      accessory.removeService(this.humidityService);
    }

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // Start an update interval
    interval(this.platform.config.options.ttl * 1000)
      .pipe(skipWhile(() => this.SensorUpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });

    // Watch for thermostat change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doSensorUpdate
      .pipe(
        tap(() => {
          this.SensorUpdateInProgress = true;
        }),
        debounceTime(100),
      )
      .subscribe(async () => {
        this.SensorUpdateInProgress = false;
      });
  }

  /**
   * Parse the device status from the honeywell api
   */
  parseStatus() {
    // Set Sensor State
    this.StatusActive = this.device.hasDeviceCheckedIn;
    if (this.device.waterPresent === true) {
      this.LeakDetected = 1;
    } else {
      this.LeakDetected = 0;
    }

    // Temperature Sensor
    if (!this.platform.config.options.leaksensor.hide_temperature) {
      this.CurrentTemperature = this.device.currentSensorReadings.temperature;
      this.TempStatusActive = this.device.hasDeviceCheckedIn;
    }

    // HumiditySensor
    if (!this.platform.config.options.leaksensor.hide_humidity) {
      this.CurrentRelativeHumidity = this.device.currentSensorReadings.humidity;
      this.HumidityStatusActive = this.device.hasDeviceCheckedIn;
    }

    // Battery Service
    this.BatteryLevel = this.device.batteryRemaining;
    if (this.device.batteryRemaining < 30) {
      this.StatusLowBattery = 1;
    } else if (this.device.batteryRemaining > 30) {
      this.StatusLowBattery = 0;
    }
  }

  /**
   * Asks the Honeywell Home API for the latest device information
   */
  async refreshStatus() {
    try {
      /*  this.log.debug(JSON.stringify(device.deviceType));
          const sensor = (await this.axios.get(`${DeviceURL}/waterLeakDetectors`, {
            params: {
              locationId: location.locationID,
            },
          })).data;
          this.log.debug(JSON.stringify(sensor));*/
      const sensor = (
        await this.platform.axios.get(DeviceURL, {
          params: {
            locationId: this.locationId,
          },
        })
      ).data;
      this.platform.log.debug(JSON.stringify(sensor));
      this.sensor = sensor;
      this.device;
      this.platform.log.debug(JSON.stringify(this.device));
      this.platform.log.debug(
        JSON.stringify(this.device.currentSensorReadings),
      );
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e) {
      this.platform.log.error(
        `Failed to update status of ${this.device.userDefinedDeviceName}`,
        JSON.stringify(e.message),
        this.platform.log.debug(JSON.stringify(e)),
      );
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    this.service.updateCharacteristic(
      this.platform.Characteristic.BatteryLevel,
      this.BatteryLevel,
    );
    this.service.updateCharacteristic(
      this.platform.Characteristic.StatusLowBattery,
      this.StatusLowBattery,
    );
    if (!this.platform.config.options.leaksensor.hide_leak) {
      this.leakService.updateCharacteristic(
        this.platform.Characteristic.StatusActive,
        this.StatusActive,
      );
      this.leakService.updateCharacteristic(
        this.platform.Characteristic.LeakDetected,
        this.LeakDetected,
      );
    }
    if (!this.platform.config.options.leaksensor.hide_temperature) {
      this.temperatureService.updateCharacteristic(
        this.platform.Characteristic.CurrentTemperature,
        this.CurrentTemperature,
      );
      this.temperatureService.updateCharacteristic(
        this.platform.Characteristic.StatusActive,
        this.TempStatusActive,
      );
    }
    if (!this.platform.config.options.leaksensor.hide_humidity) {
      this.humidityService.updateCharacteristic(
        this.platform.Characteristic.CurrentRelativeHumidity,
        this.CurrentRelativeHumidity,
      );
      this.humidityService.updateCharacteristic(
        this.platform.Characteristic.StatusActive,
        this.HumidityStatusActive,
      );
    }
  }

  /**
   * Handle requests to get the current value of the "Tempeture Sensor" characteristics
   */
  handleLeakDetectedGet(callback: (arg0: null, arg1: any) => void) {
    this.platform.log.debug(`Update Leak Detected: ${this.LeakDetected}`);

    // set this to a valid value for StatusLowBattery
    const currentValue = this.LeakDetected;

    this.doSensorUpdate.next();
    callback(null, currentValue);
  }

  handleLeakStatusActiveGet(callback: (arg0: null, arg1: any) => void) {
    this.platform.log.debug(`Update Leak Status Active: ${this.StatusActive}`);

    // set this to a valid value for StatusLowBattery
    const currentValue = this.StatusActive;

    this.doSensorUpdate.next();
    callback(null, currentValue);
  }

  /**
   * Handle requests to get the current value of the "Occupancy Sensor" characteristics
   */
  handleCurrentTemperatureGet(callback: (arg0: null, arg1: any) => void) {
    this.platform.log.debug(
      `Update Current Temperature: ${this.CurrentTemperature}`,
    );

    // set this to a valid value for OccupancyDetected
    const currentValue = this.CurrentTemperature;

    this.doSensorUpdate.next();
    callback(null, currentValue);
  }

  handleTempStatusActiveGet(callback: (arg0: null, arg1: any) => void) {
    this.platform.log.debug(
      `Update Temperature Sensor Status Active: ${this.TempStatusActive}`,
    );

    // set this to a valid value for OccupancyDetected
    const currentValue = this.TempStatusActive;

    this.doSensorUpdate.next();
    callback(null, currentValue);
  }

  /**
   * Handle requests to get the current value of the "Humidity Sensor" characteristics
   */
  handleCurrentRelativeHumidityGet(callback: (arg0: null, arg1: any) => void) {
    this.platform.log.debug(
      `Update Current Relative Humidity: ${this.CurrentRelativeHumidity}`,
    );

    // set this to a valid value for CurrentRelativeHumidity
    const currentValue = this.CurrentRelativeHumidity;

    this.doSensorUpdate.next();
    callback(null, currentValue);
  }

  /**
   * Handle requests to get the current value of the "Humidity Sensor" characteristics
   */
  handleHumidityStatusActiveGet(callback: (arg0: null, arg1: any) => void) {
    this.platform.log.debug(
      `Update Humidity Status Active: ${this.HumidityStatusActive}`,
    );

    // set this to a valid value for CurrentRelativeHumidity
    const currentValue = this.HumidityStatusActive;

    this.doSensorUpdate.next();
    callback(null, currentValue);
  }

  /**
   * Handle requests to get the current value of the "Motion Sensor" characteristics
   */
  handleBatteryLevelGet(callback: (arg0: null, arg1: any) => void) {
    this.platform.log.debug(`Update Battery Level: ${this.BatteryLevel}`);

    // set this to a valid value for Motion Detected
    const currentValue = this.BatteryLevel;

    this.doSensorUpdate.next();
    callback(null, currentValue);
  }

  /**
   * Handle requests to get the current value of the "Motion Sensor" characteristics
   */
  handleStatusLowBatteryGet(callback: (arg0: null, arg1: any) => void) {
    this.platform.log.debug(
      `Update Low Battery Status: ${this.StatusLowBattery}`,
    );

    // set this to a valid value for Motion Detected
    const currentValue = this.StatusLowBattery;

    this.doSensorUpdate.next();
    callback(null, currentValue);
  }

  /**
   * Converts the value to celsius if the temperature units are in Fahrenheit
   */
  toCelsius(value: number) {
    if (
      this.TemperatureDisplayUnits ===
      this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS
    ) {
      return value;
    }

    // celsius should be to the nearest 0.5 degree
    return Math.round((5 / 9) * (value - 32) * 2) / 2;
  }

  /**
   * Converts the value to fahrenheit if the temperature units are in Fahrenheit
   */
  toFahrenheit(value: number) {
    if (
      this.TemperatureDisplayUnits ===
      this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS
    ) {
      return value;
    }

    return Math.round((value * 9) / 5 + 32);
  }
}
