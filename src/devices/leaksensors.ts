<<<<<<< Updated upstream
import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
=======
import { request } from 'undici';
>>>>>>> Stashed changes
import { interval, Subject } from 'rxjs';
import superStringify from 'super-stringify';
import { skipWhile, take } from 'rxjs/operators';
<<<<<<< Updated upstream
import { ResideoPlatform } from '../platform';
import * as settings from '../settings';
=======
import { ResideoPlatform } from '../platform.js';
import { Service, PlatformAccessory, CharacteristicValue, HAP, API, Logging } from 'homebridge';
import { DeviceURL, ResideoPlatformConfig, devicesConfig, location, resideoDevice } from '../settings.js';
>>>>>>> Stashed changes

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class LeakSensor {
<<<<<<< Updated upstream
=======
  public readonly api: API;
  public readonly log: Logging;
  public readonly config!: ResideoPlatformConfig;
  protected readonly hap: HAP;
>>>>>>> Stashed changes
  // Services
  service: Service;
  temperatureService?: Service;
  humidityService?: Service;
  leakService?: Service;

  // CharacteristicValue
  StatusActive!: CharacteristicValue;
  LeakDetected!: CharacteristicValue;
  BatteryLevel!: CharacteristicValue;
  ChargingState!: CharacteristicValue;
  StatusLowBattery!: CharacteristicValue;
  CurrentTemperature!: CharacteristicValue;
  CurrentRelativeHumidity!: CharacteristicValue;

  // Others
  action!: string;
  temperature!: number;
  hasDeviceCheckedIn!: boolean;
  humidity!: number;
  batteryRemaining!: number;
  waterPresent!: boolean;

  // Config
  deviceLogging!: string;
  deviceRefreshRate!: number;

  // Updates
  SensorUpdateInProgress!: boolean;
  doSensorUpdate!: Subject<void>;

  constructor(
    private readonly platform: ResideoPlatform,
<<<<<<< Updated upstream
    private accessory: PlatformAccessory,
    public readonly locationId: settings.location['locationID'],
    public device: settings.device & settings.devicesConfig,
  ) {
    this.logs(device);
    this.refreshRate(device);
    this.config(device);
=======
    private readonly accessory: PlatformAccessory,
    public readonly locationId: location['locationID'],
    public device: resideoDevice & devicesConfig,
  ) {
    this.api = this.platform.api;
    this.log = this.platform.log;
    this.config = this.platform.config;
    this.hap = this.api.hap;

    this.StatusActive = accessory.context.StatusActive || false;
    this.LeakDetected = accessory.context.LeakDetected || this.hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED;
    this.BatteryLevel = accessory.context.BatteryLevel || 100;
    this.ChargingState = accessory.context.ChargingState || this.hap.Characteristic.ChargingState.NOT_CHARGING;
    this.StatusLowBattery = accessory.context.StatusLowBattery || this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    this.CurrentTemperature = accessory.context.CurrentTemperature || 20;
    this.CurrentRelativeHumidity = accessory.context.CurrentRelativeHumidity || 50;
    accessory.context.FirmwareRevision = 'v2.0.0';

>>>>>>> Stashed changes
    // this is subject we use to track when we need to POST changes to the Resideo API
    this.doSensorUpdate = new Subject();
    this.SensorUpdateInProgress = false;

    // set accessory information
    accessory
<<<<<<< Updated upstream
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Resideo')
      .setCharacteristic(this.platform.Characteristic.Model, device.deviceType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceID)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.firmwareRevision)
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
      .updateValue(accessory.context.firmwareRevision);
=======
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.Manufacturer, 'Resideo')
      .setCharacteristic(this.hap.Characteristic.Model, device.deviceType)
      .setCharacteristic(this.hap.Characteristic.SerialNumber, device.deviceID)
      .setCharacteristic(this.hap.Characteristic.FirmwareRevision, accessory.context.firmwareRevision);
>>>>>>> Stashed changes

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    (this.service = this.accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery)),
    `${accessory.displayName} Battery`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/

    // Do initial device parse
    this.parseStatus();

    // Set Charging State
    this.service.setCharacteristic(this.platform.Characteristic.ChargingState, 2);

    // Leak Sensor Service
    if (this.device.leaksensor?.hide_leak) {
<<<<<<< Updated upstream
      this.debugLog(`Leak Sensor: ${accessory.displayName} Removing Leak Sensor Service`);
      this.leakService = this.accessory.getService(this.platform.Service.LeakSensor);
      accessory.removeService(this.leakService!);
    } else if (!this.leakService) {
      this.debugLog(`Leak Sensor: ${accessory.displayName} Add Leak Sensor Service`);
      (this.leakService = this.accessory.getService(this.platform.Service.LeakSensor) || this.accessory.addService(this.platform.Service.LeakSensor)),
      `${accessory.displayName} Leak Sensor`;
=======
      this.log.debug(`Leak Sensor: ${accessory.displayName} Removing Leak Sensor Service`);
      this.leakService = this.accessory.getService(this.hap.Service.LeakSensor);
      accessory.removeService(this.leakService!);
    } else if (!this.leakService) {
      this.log.debug(`Leak Sensor: ${accessory.displayName} Add Leak Sensor Service`);
      (this.leakService = this.accessory.getService(this.hap.Service.LeakSensor)
        || this.accessory.addService(this.hap.Service.LeakSensor)), `${accessory.displayName} Leak Sensor`;
>>>>>>> Stashed changes

      this.leakService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Leak Sensor`);
    } else {
      this.log.debug(`Leak Sensor: ${accessory.displayName} Leak Sensor Service Not Added`);
    }

    // Temperature Sensor Service
    if (this.device.leaksensor?.hide_temperature) {
<<<<<<< Updated upstream
      this.debugLog(`Leak Sensor: ${accessory.displayName} Removing Temperature Sensor Service`);
      this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor);
=======
      this.log.debug(`Leak Sensor: ${accessory.displayName} Removing Temperature Sensor Service`);
      this.temperatureService = this.accessory.getService(this.hap.Service.TemperatureSensor);
>>>>>>> Stashed changes
      accessory.removeService(this.temperatureService!);
    } else if (!this.temperatureService) {
      this.log.debug(`Leak Sensor: ${accessory.displayName} Add Temperature Sensor Service`);
      (this.temperatureService =
        this.accessory.getService(this.platform.Service.TemperatureSensor) || this.accessory.addService(this.platform.Service.TemperatureSensor)),
      `${accessory.displayName} Temperature Sensor`;

      this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Temperature Sensor`);

      this.temperatureService
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .setProps({
          minValue: -273.15,
          maxValue: 100,
          minStep: 0.1,
        })
        .onGet(async () => {
          return this.CurrentTemperature;
        });
    } else {
      this.log.debug(`Leak Sensor: ${accessory.displayName} Temperature Sensor Service Not Added`);
    }

    // Humidity Sensor Service
    if (this.device.leaksensor?.hide_humidity) {
<<<<<<< Updated upstream
      this.debugLog(`Leak Sensor: ${accessory.displayName} Removing Humidity Sensor Service`);
      this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor);
=======
      this.log.debug(`Leak Sensor: ${accessory.displayName} Removing Humidity Sensor Service`);
      this.humidityService = this.accessory.getService(this.hap.Service.HumiditySensor);
>>>>>>> Stashed changes
      accessory.removeService(this.humidityService!);
    } else if (!this.humidityService) {
      this.log.debug(`Leak Sensor: ${accessory.displayName} Add Humidity Sensor Service`);
      (this.humidityService =
        this.accessory.getService(this.platform.Service.HumiditySensor) || this.accessory.addService(this.platform.Service.HumiditySensor)),
      `${accessory.displayName} Humidity Sensor`;

      this.humidityService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Humidity Sensor`);

      this.humidityService
        .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .setProps({
          minStep: 0.1,
        })
        .onGet(async () => {
          return this.CurrentRelativeHumidity;
        });
    } else {
      this.log.debug(`Leak Sensor: ${accessory.displayName} Humidity Sensor Service Not Added`);
    }

    // Retrieve initial values and updateHomekit
    this.refreshStatus();
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.SensorUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });
  }

  /**
   * Parse the device status from the Resideo api
   */
  async parseStatus(): Promise<void> {
    // Active
    this.StatusActive = this.hasDeviceCheckedIn;
    // Leak Service
    if (this.waterPresent === true) {
      this.LeakDetected = 1;
    } else {
      this.LeakDetected = 0;
    }
    this.log.debug(`Leak Sensor: ${this.accessory.displayName} LeakDetected: ${this.LeakDetected}`);

    // Temperature Service
    if (!this.device.leaksensor?.hide_temperature) {
      this.CurrentTemperature = this.temperature;
      this.log.debug(`Leak Sensor: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}°`);
    }

    // Humidity Service
    if (!this.device.leaksensor?.hide_humidity) {
      this.CurrentRelativeHumidity = this.humidity;
      this.log.debug(`Leak Sensor: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}%`);
    }

    // Battery Service
    this.BatteryLevel = Number(this.device.batteryRemaining);
    this.service.getCharacteristic(this.platform.Characteristic.BatteryLevel).updateValue(this.BatteryLevel);
    if (this.device.batteryRemaining < 15) {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.log.debug(`Leak Sensor: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel},` + ` StatusLowBattery: ${this.StatusLowBattery}`);
  }

  /**
   * Asks the Resideo Home API for the latest device information
   */
  async refreshStatus(): Promise<void> {
    try {
<<<<<<< Updated upstream
      const device: any = (
        await this.platform.axios.get(`${settings.DeviceURL}/waterLeakDetectors/${this.device.deviceID}`, {
=======
      const { body, statusCode, headers } = await request(`${DeviceURL}/waterLeakDetectors/${this.device.deviceID}`, {
        query: {
          locationId: this.locationId,
        },
        method: 'GET',
        headers: { 'content-type': 'application/json' },
      });
      this.log.debug(`body: ${JSON.stringify(body)}`);
      this.log.debug(`statusCode: ${statusCode}`);
      this.log.debug(`headers: ${JSON.stringify(headers)}`);
      const device: any = await body.json();
      this.log.debug(`Location: ${JSON.stringify(device)}`);
      this.log.debug(`Location StatusCode: ${device.statusCode}`);
      /*const device: any = (
        await this.platform.axios.get(`${DeviceURL}/waterLeakDetectors/${this.device.deviceID}`, {
>>>>>>> Stashed changes
          params: {
            locationId: this.locationId,
          },
        })
      ).data;*/
      this.device = device;
      this.batteryRemaining = Number(device.batteryRemaining);
      this.waterPresent = device.waterPresent;
      this.humidity = device.currentSensorReadings.humidity;
      this.hasDeviceCheckedIn = device.hasDeviceCheckedIn;
      this.temperature = device.currentSensorReadings.temperature;
      this.log.debug(`Leak Sensor: ${this.accessory.displayName} device: ${JSON.stringify(this.device)}`);
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.action = 'refreshStatus';
      this.resideoAPIError(e);
      this.apiError(e);
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.BatteryLevel === undefined) {
      this.log.debug(`Leak Sensor: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
    } else {
<<<<<<< Updated upstream
      this.service.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
      this.debugLog(`Leak Sensor: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
=======
      this.service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, this.BatteryLevel);
      this.log.debug(`Leak Sensor: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
>>>>>>> Stashed changes
    }
    if (this.StatusLowBattery === undefined) {
      this.log.debug(`Leak Sensor: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
    } else {
<<<<<<< Updated upstream
      this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
      this.debugLog(`Leak Sensor: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
=======
      this.service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, this.StatusLowBattery);
      this.log.debug(`Leak Sensor: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
>>>>>>> Stashed changes
    }
    if (!this.device.leaksensor?.hide_leak) {
      if (this.LeakDetected === undefined) {
        this.log.debug(`Leak Sensor: ${this.accessory.displayName} LeakDetected: ${this.LeakDetected}`);
      } else {
<<<<<<< Updated upstream
        this.leakService?.updateCharacteristic(this.platform.Characteristic.LeakDetected, this.LeakDetected);
        this.debugLog(`Leak Sensor: ${this.accessory.displayName} updateCharacteristic LeakDetected: ${this.LeakDetected}`);
=======
        this.leakService?.updateCharacteristic(this.hap.Characteristic.LeakDetected, this.LeakDetected);
        this.log.debug(`Leak Sensor: ${this.accessory.displayName} updateCharacteristic LeakDetected: ${this.LeakDetected}`);
>>>>>>> Stashed changes
      }
      if (this.StatusActive === undefined) {
        this.log.debug(`Leak Sensor: ${this.accessory.displayName} StatusActive: ${this.StatusActive}`);
      } else {
<<<<<<< Updated upstream
        this.leakService?.updateCharacteristic(this.platform.Characteristic.StatusActive, this.StatusActive);
        this.debugLog(`Leak Sensor: ${this.accessory.displayName} updateCharacteristic StatusActive: ${this.StatusActive}`);
=======
        this.leakService?.updateCharacteristic(this.hap.Characteristic.StatusActive, this.StatusActive);
        this.log.debug(`Leak Sensor: ${this.accessory.displayName} updateCharacteristic StatusActive: ${this.StatusActive}`);
>>>>>>> Stashed changes
      }
    }
    if (this.device.leaksensor?.hide_temperature || this.CurrentTemperature === undefined) {
      if (!this.device.leaksensor?.hide_temperature) {
        this.log.debug(`Leak Sensor: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
      }
    } else {
<<<<<<< Updated upstream
      this.temperatureService?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
      this.debugLog(`Leak Sensor: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
=======
      this.temperatureService?.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, this.CurrentTemperature);
      this.log.debug(`Leak Sensor: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
>>>>>>> Stashed changes
    }
    if (this.device.leaksensor?.hide_humidity || this.CurrentRelativeHumidity === undefined) {
      if (!this.device.leaksensor?.hide_humidity) {
        this.log.debug(`Leak Sensor: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
      }
    } else {
<<<<<<< Updated upstream
      this.humidityService?.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
      this.debugLog(`Leak Sensor: ${this.accessory.displayName}` + ` updateCharacteristic CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
=======
      this.humidityService?.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
      this.log.debug(`Leak Sensor: ${this.accessory.displayName}` + ` updateCharacteristic CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
>>>>>>> Stashed changes
    }
  }

  async apiError(e: any): Promise<void> {
    this.service.updateCharacteristic(this.platform.Characteristic.BatteryLevel, e);
    this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, e);
    if (!this.device.leaksensor?.hide_leak) {
      this.leakService?.updateCharacteristic(this.platform.Characteristic.LeakDetected, e);
      this.leakService?.updateCharacteristic(this.platform.Characteristic.StatusActive, e);
    }
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  async resideoAPIError(e: any): Promise<void> {
    if (this.device.retry) {
      if (this.action === 'refreshStatus') {
        // Refresh the status from the API
        interval(5000)
          .pipe(skipWhile(() => this.SensorUpdateInProgress))
          .pipe(take(1))
          .subscribe(async () => {
            await this.refreshStatus();
          });
      }
    }
    if (e.message.includes('400')) {
<<<<<<< Updated upstream
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Bad Request`);
      this.debugLog('The client has issued an invalid request. This is commonly used to specify validation errors in a request payload.');
    } else if (e.message.includes('401')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Unauthorized Request`);
      this.debugLog('Authorization for the API is required, but the request has not been authenticated.');
    } else if (e.message.includes('403')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Forbidden Request`);
      this.debugLog('The request has been authenticated but does not have appropriate permissions, or a requested resource is not found.');
    } else if (e.message.includes('404')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Requst Not Found`);
      this.debugLog('Specifies the requested path does not exist.');
    } else if (e.message.includes('406')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Request Not Acceptable`);
      this.debugLog('The client has requested a MIME type via the Accept header for a value not supported by the server.');
    } else if (e.message.includes('415')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Unsupported Requst Header`);
      this.debugLog('The client has defined a contentType header that is not supported by the server.');
    } else if (e.message.includes('422')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Unprocessable Entity`);
      this.debugLog(
=======
      this.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Bad Request`);
      this.log.debug('The client has issued an invalid request. This is commonly used to specify validation errors in a request payload.');
    } else if (e.message.includes('401')) {
      this.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Unauthorized Request`);
      this.log.debug('Authorization for the API is required, but the request has not been authenticated.');
    } else if (e.message.includes('403')) {
      this.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Forbidden Request`);
      this.log.debug('The request has been authenticated but does not have appropriate permissions, or a requested resource is not found.');
    } else if (e.message.includes('404')) {
      this.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Requst Not Found`);
      this.log.debug('Specifies the requested path does not exist.');
    } else if (e.message.includes('406')) {
      this.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Request Not Acceptable`);
      this.log.debug('The client has requested a MIME type via the Accept header for a value not supported by the server.');
    } else if (e.message.includes('415')) {
      this.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Unsupported Requst Header`);
      this.log.debug('The client has defined a contentType header that is not supported by the server.');
    } else if (e.message.includes('422')) {
      this.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Unprocessable Entity`);
      this.log.debug(
>>>>>>> Stashed changes
        'The client has made a valid request, but the server cannot process it.' +
          ' This is often used for APIs for which certain limits have been exceeded.',
      );
    } else if (e.message.includes('429')) {
<<<<<<< Updated upstream
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Too Many Requests`);
      this.debugLog('The client has exceeded the number of requests allowed for a given time window.');
    } else if (e.message.includes('500')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Internal Server Error`);
      this.debugLog('An unexpected error on the SmartThings servers has occurred. These errors should be rare.');
    } else {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action},`);
    }
    if (this.deviceLogging.includes('debug')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to pushChanges, Error Message: ${superStringify(e.message)}`);
    }
  }

  async config(device: settings.device & settings.devicesConfig): Promise<void> {
    let config = {};
    if (device.leaksensor) {
      config = device.leaksensor;
    }
    if (device.logging !== undefined) {
      config['logging'] = device.logging;
    }
    if (device.refreshRate !== undefined) {
      config['refreshRate'] = device.refreshRate;
    }
    if (Object.entries(config).length !== 0) {
      this.infoLog(`Leak Sensor: ${this.accessory.displayName} Config: ${superStringify(config)}`);
    }
  }

  async refreshRate(device: settings.device & settings.devicesConfig): Promise<void> {
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
      this.debugLog(`Leak Sensor: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      this.debugLog(`Leak Sensor: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    }
  }

  async logs(device: settings.device & settings.devicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`Leak Sensor: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`Leak Sensor: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`Leak Sensor: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`Leak Sensor: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
    }
  }

  /**
   * Logging for Device
   */
  infoLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.info(String(...log));
    }
  }

  warnLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.warn(String(...log));
    }
  }

  debugWarnLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging?.includes('debug')) {
        this.platform.log.warn('[DEBUG]', String(...log));
      }
    }
  }

  errorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.error(String(...log));
    }
  }

  debugErrorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging?.includes('debug')) {
        this.platform.log.error('[DEBUG]', String(...log));
      }
    }
  }

  debugLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging === 'debug') {
        this.platform.log.info('[DEBUG]', String(...log));
      } else {
        this.platform.log.debug(String(...log));
      }
    }
  }

  enablingDeviceLogging(): boolean {
    return this.deviceLogging.includes('debug') || this.deviceLogging === 'standard';
=======
      this.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Too Many Requests`);
      this.log.debug('The client has exceeded the number of requests allowed for a given time window.');
    } else if (e.message.includes('500')) {
      this.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Internal Server Error`);
      this.log.debug('An unexpected error on the SmartThings servers has occurred. These errors should be rare.');
    } else {
      this.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action},`);
    }
    if (this.deviceLogging.includes('debug')) {
      this.log.error(`Leak Sensor: ${this.accessory.displayName} failed to pushChanges, Error Message: ${JSON.stringify(e.message)}`);
    }
  }

  async statusCode(statusCode: number): Promise<void> {
    /**
    * Meater API Status Codes (https://github.com/apption-labs/meater-cloud-public-rest-api)
    *
    * Standard Response Codes: 200(OK), 201(Created), 204(No Content)
    * https://github.com/apption-labs/meater-cloud-public-rest-api#standard-response
    *
    * Error Response: 400(Bad Request), 401(Unauthorized), 404(Not Found), 429(Too Many Requests), 500(Internal Server Error)
    * https://github.com/apption-labs/meater-cloud-public-rest-api#error-response
    **/
    switch (statusCode) {
      case 200:
        this.log.debug(`${this.accessory.displayName} Standard Response, statusCode: ${statusCode}`);
        break;
      case 400:
        this.log.error(`${this.accessory.displayName} Bad Request, statusCode: ${statusCode}`);
        break;
      case 401:
        this.log.error(`${this.accessory.displayName} Unauthorized, statusCode: ${statusCode}`);
        break;
      case 404:
        this.log.error(`${this.accessory.displayName} Not Found, statusCode: ${statusCode}`);
        break;
      case 429:
        this.log.error(`${this.accessory.displayName} Too Many Requests, statusCode: ${statusCode}`);
        break;
      case 500:
        this.log.error(`${this.accessory.displayName} Internal Server Error (Meater Server), statusCode: ${statusCode}`);
        break;
      default:
        this.log.info(
          `${this.accessory.displayName} Unknown statusCode: ${statusCode}, Report Bugs Here: https://bit.ly/homebridge-meater-bug-report`);
    }
>>>>>>> Stashed changes
  }
}
