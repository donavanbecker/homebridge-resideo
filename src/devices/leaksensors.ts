import { Service, PlatformAccessory, CharacteristicValue, HAPStatus } from 'homebridge';
import { HoneywellHomePlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { skipWhile } from 'rxjs/operators';
import { DeviceURL, location, device, devicesConfig } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class LeakSensor {
  // Services
  private service: Service;
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

  // Updates
  SensorUpdateInProgress!: boolean;
  doSensorUpdate!: Subject<void>;

  constructor(
    private readonly platform: HoneywellHomePlatform,
    private accessory: PlatformAccessory,
    public readonly locationId: location['locationID'],
    public device: device & devicesConfig,
  ) {
    // default placeholders
    this.StatusActive;
    this.LeakDetected;
    this.CurrentTemperature;
    this.CurrentRelativeHumidity;
    this.BatteryLevel;
    this.ChargingState;
    this.StatusLowBattery;

    // this is subject we use to track when we need to POST changes to the Honeywell API
    this.doSensorUpdate = new Subject();
    this.SensorUpdateInProgress = false;

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Honeywell')
      .setCharacteristic(this.platform.Characteristic.Model, device.deviceType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceID)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.firmwareRevision)
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision).updateValue(accessory.context.firmwareRevision);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    (this.service =
      this.accessory.getService(this.platform.Service.Battery) ||
      this.accessory.addService(this.platform.Service.Battery)), `${accessory.displayName} Battery`;

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
      this.platform.device(`Leak Sensor: ${accessory.displayName} Removing Leak Sensor Service`);
      this.leakService = this.accessory.getService(this.platform.Service.LeakSensor);
      accessory.removeService(this.leakService!);
    } else if (!this.leakService) {
      this.platform.device(`Leak Sensor: ${accessory.displayName} Add Leak Sensor Service`);
      (this.leakService =
        this.accessory.getService(this.platform.Service.LeakSensor) ||
        this.accessory.addService(this.platform.Service.LeakSensor)), `${accessory.displayName} Leak Sensor`;

      this.leakService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Leak Sensor`);

    } else {
      this.platform.device(`Leak Sensor: ${accessory.displayName} Leak Sensor Service Not Added`);
    }

    // Temperature Sensor Service
    if (this.device.leaksensor?.hide_temperature) {
      this.platform.device(`Leak Sensor: ${accessory.displayName} Removing Temperature Sensor Service`);
      this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor);
      accessory.removeService(this.temperatureService!);
    } else if (!this.temperatureService) {
      this.platform.device(`Leak Sensor: ${accessory.displayName} Add Temperature Sensor Service`);
      (this.temperatureService =
        this.accessory.getService(this.platform.Service.TemperatureSensor) ||
        this.accessory.addService(this.platform.Service.TemperatureSensor)), `${accessory.displayName} Temperature Sensor`;

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
      this.platform.device(`Leak Sensor: ${accessory.displayName} Temperature Sensor Service Not Added`);
    }

    // Humidity Sensor Service
    if (this.device.leaksensor?.hide_humidity) {
      this.platform.device(`Leak Sensor: ${accessory.displayName} Removing Humidity Sensor Service`);
      this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor);
      accessory.removeService(this.humidityService!);
    } else if (!this.humidityService) {
      this.platform.device(`Leak Sensor: ${accessory.displayName} Add Humidity Sensor Service`);
      (this.humidityService =
        this.accessory.getService(this.platform.Service.HumiditySensor) ||
        this.accessory.addService(this.platform.Service.HumiditySensor)), `${accessory.displayName} Humidity Sensor`;

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
      this.platform.device(`Leak Sensor: ${accessory.displayName} Humidity Sensor Service Not Added`);
    }

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.SensorUpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });
  }

  /**
   * Parse the device status from the honeywell api
   */
  parseStatus() {
    // Leak Service
    this.StatusActive = this.device.hasDeviceCheckedIn;
    if (this.device.waterPresent === true) {
      this.LeakDetected = 1;
    } else {
      this.LeakDetected = 0;
    }
    this.platform.device(`Leak Sensor: ${this.accessory.displayName} LeakDetected: ${this.LeakDetected}`);

    // Temperature Service
    if (!this.device.leaksensor?.hide_temperature) {
      this.CurrentTemperature = this.device.currentSensorReadings.temperature;
      this.platform.device(`Leak Sensor: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}°`);
    }

    // Humidity Service
    if (!this.device.leaksensor?.hide_humidity) {
      this.CurrentRelativeHumidity = this.device.currentSensorReadings.humidity;
      this.platform.device(`Leak Sensor: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}%`);
    }

    // Battery Service
    this.BatteryLevel = Number(this.device.batteryRemaining);
    this.service.getCharacteristic(this.platform.Characteristic.BatteryLevel).updateValue(this.BatteryLevel);
    if (this.device.batteryRemaining < 15) {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.platform.device(`Leak Sensor: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel},`
      + ` StatusLowBattery: ${this.StatusLowBattery}`);
  }

  /**
   * Asks the Honeywell Home API for the latest device information
   */
  async refreshStatus() {
    try {
      const device: any = (await this.platform.axios.get(`${DeviceURL}/waterLeakDetectors/${this.device.deviceID}`, {
        params: {
          locationId: this.locationId,
        },
      })).data;
      this.device = device;
      this.platform.device(`Leak Sensor: ${this.accessory.displayName} device: ${JSON.stringify(this.device)}`);
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.action = 'refreshStatus';
      this.honeywellAPIError(e);
      this.apiError();
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (this.BatteryLevel === undefined) {
      this.platform.debug(`Leak Sensor: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
      this.platform.device(`Leak Sensor: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
    }
    if (this.StatusLowBattery === undefined) {
      this.platform.debug(`Leak Sensor: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
      this.platform.device(`Leak Sensor: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
    }
    if (!this.device.leaksensor?.hide_leak) {
      if (this.LeakDetected === undefined) {
        this.platform.debug(`Leak Sensor: ${this.accessory.displayName} LeakDetected: ${this.LeakDetected}`);
      } else {
        this.leakService?.updateCharacteristic(this.platform.Characteristic.LeakDetected, this.LeakDetected);
        this.platform.device(`Leak Sensor: ${this.accessory.displayName} updateCharacteristic LeakDetected: ${this.LeakDetected}`);
      }
      if (this.StatusActive === undefined) {
        this.platform.debug(`Leak Sensor: ${this.accessory.displayName} StatusActive: ${this.StatusActive}`);
      } else {
        this.leakService?.updateCharacteristic(this.platform.Characteristic.StatusActive, this.StatusActive);
        this.platform.device(`Leak Sensor: ${this.accessory.displayName} updateCharacteristic StatusActive: ${this.StatusActive}`);
      }
    }
    if (this.device.leaksensor?.hide_temperature && this.CurrentTemperature === undefined) {
      this.platform.debug(`Leak Sensor: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
    } else {
      this.temperatureService?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
      this.platform.device(`Leak Sensor: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
    }
    if (this.device.leaksensor?.hide_humidity && this.CurrentRelativeHumidity === undefined) {
      this.platform.debug(`Leak Sensor: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    } else {
      this.humidityService?.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
      this.platform.device(`Leak Sensor: ${this.accessory.displayName}`
        + ` updateCharacteristic CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    }
  }

  public apiError() {
    throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  public honeywellAPIError(e: any) {
    if (e.message.includes('400')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Bad Request`);
      this.platform.debug('The client has issued an invalid request. This is commonly used to specify validation errors in a request payload.');
    } else if (e.message.includes('401')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Unauthorized Request`);
      this.platform.debug('Authorization for the API is required, but the request has not been authenticated.');
    } else if (e.message.includes('403')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Forbidden Request`);
      this.platform.debug('The request has been authenticated but does not have appropriate permissions, or a requested resource is not found.');
    } else if (e.message.includes('404')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Requst Not Found`);
      this.platform.debug('Specifies the requested path does not exist.');
    } else if (e.message.includes('406')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Request Not Acceptable`);
      this.platform.debug('The client has requested a MIME type via the Accept header for a value not supported by the server.');
    } else if (e.message.includes('415')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Unsupported Requst Header`);
      this.platform.debug('The client has defined a contentType header that is not supported by the server.');
    } else if (e.message.includes('422')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Unprocessable Entity`);
      this.platform.debug('The client has made a valid request, but the server cannot process it.'
        + ' This is often used for APIs for which certain limits have been exceeded.');
    } else if (e.message.includes('429')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Too Many Requests`);
      this.platform.debug('The client has exceeded the number of requests allowed for a given time window.');
    } else if (e.message.includes('500')) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action}, Internal Server Error`);
      this.platform.debug('An unexpected error on the SmartThings servers has occurred. These errors should be rare.');
    } else {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to ${this.action},`);
    }
    if (this.platform.config.options?.debug === 'device') {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} failed to pushChanges, Error Message: ${JSON.stringify(e.message)}`);
    }
    if (this.platform.config.options?.debug === 'debug' || this.platform.debugMode) {
      this.platform.log.error(`Leak Sensor: ${this.accessory.displayName} Error: ${JSON.stringify(e)}`);
    }
  }
}
