import { Service, PlatformAccessory, CharacteristicValue, HAPStatus } from 'homebridge';
import { HoneywellHomePlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { skipWhile } from 'rxjs/operators';
import { location, sensorAccessory, device, devicesConfig, T9groups } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class RoomSensors {
  // Services
  private service: Service;
  temperatureService?: Service;
  occupancyService?: Service;
  humidityService?: Service;

  // CharacteristicValue
  StatusLowBattery!: CharacteristicValue;
  OccupancyDetected!: CharacteristicValue;
  CurrentTemperature!: CharacteristicValue;
  CurrentRelativeHumidity!: CharacteristicValue;
  TemperatureDisplayUnits!: CharacteristicValue;

  // Others
  accessoryId!: number;
  roomId!: number;
  action!: string;

  // Updates
  SensorUpdateInProgress!: boolean;
  doSensorUpdate!: Subject<void>;

  constructor(
    private readonly platform: HoneywellHomePlatform,
    private accessory: PlatformAccessory,
    public readonly locationId: location['locationID'],
    public device: device & devicesConfig,
    public sensorAccessory: sensorAccessory,
    public readonly group: T9groups,
  ) {
    // default placeholders
    this.CurrentTemperature;
    this.StatusLowBattery;
    this.OccupancyDetected;
    this.CurrentRelativeHumidity;
    this.accessoryId = sensorAccessory.accessoryId;
    this.roomId = sensorAccessory.roomId;

    // this is subject we use to track when we need to POST changes to the Honeywell API
    this.doSensorUpdate = new Subject();
    this.SensorUpdateInProgress = false;

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Honeywell')
      .setCharacteristic(this.platform.Characteristic.Model, sensorAccessory.accessoryAttribute.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, sensorAccessory.deviceID)
      .setCharacteristic(
        this.platform.Characteristic.FirmwareRevision, accessory.context.firmwareRevision)
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision).updateValue(accessory.context.firmwareRevision);

    // get the BatteryService service if it exists, otherwise create a new Battery service
    // you can create multiple services for each accessory
    (this.service =
      this.accessory.getService(this.platform.Service.Battery) ||
      this.accessory.addService(this.platform.Service.Battery)), `${accessory.displayName} Battery`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Battery, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/

    // Do initial device parse
    this.parseStatus();

    // Set Charging State
    this.service.setCharacteristic(this.platform.Characteristic.ChargingState, 2);

    // Temperature Sensor Service
    if (this.device.roomsensor?.hide_temperature) {
      this.platform.device(`Room Sensor: ${accessory.displayName} Removing Temperature Sensor Service`);
      this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor);
      accessory.removeService(this.temperatureService!);
    } else if (!this.temperatureService) {
      this.platform.device(`Room Sensor: ${accessory.displayName} Add Temperature Sensor Service`);
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
        .onGet(() => {
          return this.CurrentTemperature;
        });
    } else {
      this.platform.device(`Room Sensor: ${accessory.displayName} Temperature Sensor Service Not Added`);
    }

    // Occupancy Sensor Service
    if (this.device.roomsensor?.hide_occupancy) {
      this.platform.device(`Room Sensor: ${accessory.displayName} Removing Occupancy Sensor Service`);
      this.occupancyService = this.accessory.getService(this.platform.Service.OccupancySensor);
      accessory.removeService(this.occupancyService!);
    } else if (!this.occupancyService) {
      this.platform.device(`Room Sensor: ${accessory.displayName} Add Occupancy Sensor Service`);
      (this.occupancyService =
        this.accessory.getService(this.platform.Service.OccupancySensor) ||
        this.accessory.addService(this.platform.Service.OccupancySensor)), `${accessory.displayName} Occupancy Sensor`;

      this.occupancyService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Occupancy Sensor`);

    } else {
      this.platform.device(`Room Sensor: ${accessory.displayName} Occupancy Sensor Service Not Added`);
    }

    // Humidity Sensor Service
    if (this.device.roomsensor?.hide_humidity) {
      this.platform.device(`Room Sensor: ${accessory.displayName} Removing Humidity Sensor Service`);
      this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor);
      accessory.removeService(this.humidityService!);
    } else if (!this.humidityService) {
      this.platform.device(`Room Sensor: ${accessory.displayName} Add Humidity Sensor Service`);
      (this.humidityService =
        this.accessory.getService(this.platform.Service.HumiditySensor) ||
        this.accessory.addService(this.platform.Service.HumiditySensor)), `${accessory.displayName} Humidity Sensor`;

      this.humidityService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Humidity Sensor`);

      this.humidityService
        .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .setProps({
          minStep: 0.1,
        })
        .onGet(() => {
          return this.CurrentRelativeHumidity;
        });
    } else {
      this.platform.device(`Room Sensor: ${accessory.displayName} Humidity Sensor Service Not Added`);
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
    // Set Room Sensor State
    if (this.sensorAccessory.accessoryValue.batteryStatus.startsWith('Ok')) {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    } else {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    }
    this.platform.device(`Room Sensor: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);

    // Set Temperature Sensor State
    if (!this.device.roomsensor?.hide_temperature) {
      this.CurrentTemperature = this.toCelsius(this.sensorAccessory.accessoryValue.indoorTemperature);
    }
    this.platform.device(`Room Sensor: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}°c`);

    // Set Occupancy Sensor State
    if (!this.device.roomsensor?.hide_occupancy) {
      if (this.sensorAccessory.accessoryValue.occupancyDet) {
        this.OccupancyDetected = 1;
      } else {
        this.OccupancyDetected = 0;
      }
    }

    // Set Humidity Sensor State
    if (!this.device.roomsensor?.hide_humidity) {
      this.CurrentRelativeHumidity = this.sensorAccessory.accessoryValue.indoorHumidity;
    }
    this.platform.device(`Room Sensor: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}%`);
  }

  /**
   * Asks the Honeywell Home API for the latest device information
   */
  async refreshStatus() {
    try {
      const roomsensors = await this.platform.getCurrentSensorData(this.device, this.group, this.locationId);
      this.sensorAccessory = roomsensors[this.roomId][this.accessoryId];
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
    if (this.StatusLowBattery === undefined) {
      this.platform.debug(`Room Sensor: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
      this.platform.device(`Room Sensor: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
    }
    if (
      this.device.roomsensor?.hide_temperature || this.CurrentTemperature === undefined
      && Number.isNaN(this.CurrentTemperature)
    ) {
      this.platform.debug(`Room Sensor: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
    } else {
      this.temperatureService?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
      this.platform.device(`Room Sensor: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
    }
    if (this.device.roomsensor?.hide_occupancy || this.OccupancyDetected === undefined) {
      this.platform.debug(`Room Sensor: ${this.accessory.displayName} OccupancyDetected: ${this.OccupancyDetected}`);
    } else {
      this.occupancyService?.updateCharacteristic(this.platform.Characteristic.OccupancyDetected, this.OccupancyDetected);
      this.platform.device(`Room Sensor: ${this.accessory.displayName} updateCharacteristic OccupancyDetected: ${this.OccupancyDetected}`);
    }
    if (this.device.roomsensor?.hide_humidity || this.CurrentRelativeHumidity === undefined) {
      this.platform.debug(`Room Sensor: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    } else {
      this.humidityService?.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
      this.platform.device(`Room Sensor: ${this.accessory.displayName}`
        + ` updateCharacteristic CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    }
  }

  public apiError() {
    throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  public honeywellAPIError(e: any) {
    if (e.message.includes('400')) {
      this.platform.log.error(`Room Sensor: ${this.accessory.displayName} failed to ${this.action}, Bad Request`);
      this.platform.debug('The client has issued an invalid request. This is commonly used to specify validation errors in a request payload.');
    } else if (e.message.includes('401')) {
      this.platform.log.error(`Room Sensor: ${this.accessory.displayName} failed to ${this.action}, Unauthorized Request`);
      this.platform.debug('Authorization for the API is required, but the request has not been authenticated.');
    } else if (e.message.includes('403')) {
      this.platform.log.error(`Room Sensor: ${this.accessory.displayName} failed to ${this.action}, Forbidden Request`);
      this.platform.debug('The request has been authenticated but does not have appropriate permissions, or a requested resource is not found.');
    } else if (e.message.includes('404')) {
      this.platform.log.error(`Room Sensor: ${this.accessory.displayName} failed to ${this.action}, Requst Not Found`);
      this.platform.debug('Specifies the requested path does not exist.');
    } else if (e.message.includes('406')) {
      this.platform.log.error(`Room Sensor: ${this.accessory.displayName} failed to ${this.action}, Request Not Acceptable`);
      this.platform.debug('The client has requested a MIME type via the Accept header for a value not supported by the server.');
    } else if (e.message.includes('415')) {
      this.platform.log.error(`Room Sensor: ${this.accessory.displayName} failed to ${this.action}, Unsupported Requst Header`);
      this.platform.debug('The client has defined a contentType header that is not supported by the server.');
    } else if (e.message.includes('422')) {
      this.platform.log.error(`Room Sensor: ${this.accessory.displayName} failed to ${this.action}, Unprocessable Entity`);
      this.platform.debug('The client has made a valid request, but the server cannot process it.'
        + ' This is often used for APIs for which certain limits have been exceeded.');
    } else if (e.message.includes('429')) {
      this.platform.log.error(`Room Sensor: ${this.accessory.displayName} failed to ${this.action}, Too Many Requests`);
      this.platform.debug('The client has exceeded the number of requests allowed for a given time window.');
    } else if (e.message.includes('500')) {
      this.platform.log.error(`Room Sensor: ${this.accessory.displayName} failed to ${this.action}, Internal Server Error`);
      this.platform.debug('An unexpected error on the SmartThings servers has occurred. These errors should be rare.');
    } else {
      this.platform.log.error(`Room Sensor: ${this.accessory.displayName} failed to ${this.action},`);
    }
    if (this.platform.config.options?.debug === 'device') {
      this.platform.log.error(`Room Sensor: ${this.accessory.displayName} failed to pushChanges, Error Message: ${JSON.stringify(e.message)}`);
    }
    if (this.platform.config.options?.debug === 'debug' || this.platform.debugMode) {
      this.platform.log.error(`Room Sensor: ${this.accessory.displayName} Error: ${JSON.stringify(e)}`);
    }
  }

  /**
   * Converts the value to celsius if the temperature units are in Fahrenheit
   */
  toCelsius(value: number) {
    if (this.TemperatureDisplayUnits === this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS) {
      return value;
    }

    // celsius should be to the nearest 0.5 degree
    return Math.round((5 / 9) * (value - 32) * 2) / 2;
  }
}
