import { Service, PlatformAccessory } from 'homebridge';
import { HoneywellHomePlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { location, sensorAccessory, T9Thermostat, T9groups } from '../configTypes';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class RoomSensors {
  private service: Service;
  temperatureService?: any;
  occupancyService?: any;
  humidityService?: any;

  CurrentTemperature!: number;
  StatusLowBattery!: number;
  OccupancyDetected!: number;
  CurrentRelativeHumidity!: number;
  TemperatureDisplayUnits!: number;
  BatteryLevel!: number;
  accessoryId!: number;
  roomId!: number;

  SensorUpdateInProgress!: boolean;
  doSensorUpdate!: any;

  constructor(
    private readonly platform: HoneywellHomePlatform,
    private accessory: PlatformAccessory,
    public readonly locationId: location['locationID'],
    public device: T9Thermostat,
    public sensorAccessory: sensorAccessory,
    public readonly group: T9groups,
  ) {
    // default placeholders
    this.CurrentTemperature;
    this.StatusLowBattery;
    this.OccupancyDetected;
    this.CurrentRelativeHumidity;
    this.accessoryId = this.sensorAccessory.accessoryId;
    this.roomId = this.sensorAccessory.roomId;

    // this is subject we use to track when we need to POST changes to the Honeywell API
    this.doSensorUpdate = new Subject();
    this.SensorUpdateInProgress = false;

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Honeywell')
      .setCharacteristic(this.platform.Characteristic.Model, this.device.deviceModel)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.deviceID)
      .setCharacteristic(
        this.platform.Characteristic.FirmwareRevision,
        this.sensorAccessory.accessoryAttribute.softwareRevision,
      );

    // get the BatteryService service if it exists, otherwise create a new Battery service
    // you can create multiple services for each accessory
    (this.service =
      this.accessory.getService(this.platform.Service.BatteryService) ||
      this.accessory.addService(this.platform.Service.BatteryService)),
    `${this.sensorAccessory.accessoryAttribute.name} Room Sensor`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Battery, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      `${this.sensorAccessory.accessoryAttribute.name} Room Sensor`,
    );

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/

    // Do initial device parse
    this.parseStatus();

    // Set Charging State
    this.service.setCharacteristic(this.platform.Characteristic.ChargingState, 2);
    // Temperature Sensor Service
    this.temperatureService = accessory.getService(this.platform.Service.TemperatureSensor);
    if (!this.temperatureService && !this.platform.config.options?.roomsensor?.hide_temperature) {
      this.temperatureService = accessory.addService(
        this.platform.Service.TemperatureSensor,
        `${this.sensorAccessory.accessoryAttribute.name} Temperature Sensor`,
      );
    } else if (this.temperatureService && this.platform.config.options?.roomsensor?.hide_temperature) {
      accessory.removeService(this.temperatureService);
    }

    // Occupancy Sensor Service
    this.occupancyService = accessory.getService(this.platform.Service.OccupancySensor);
    if (!this.occupancyService && !this.platform.config.options?.roomsensor?.hide_occupancy) {
      this.occupancyService = accessory.addService(
        this.platform.Service.OccupancySensor,
        `${this.sensorAccessory.accessoryAttribute.name} Occupancy Sensor`,
      );
    } else if (this.occupancyService && this.platform.config.options?.roomsensor?.hide_occupancy) {
      accessory.removeService(this.occupancyService);
    }

    // Humidity Sensor Service
    this.humidityService = accessory.getService(this.platform.Service.HumiditySensor);
    if (!this.humidityService && !this.platform.config.options?.roomsensor?.hide_humidity) {
      this.humidityService = accessory.addService(
        this.platform.Service.HumiditySensor,
        `${this.sensorAccessory.accessoryAttribute.name} Humidity Sensor`,
      );
    } else if (this.humidityService && this.platform.config.options?.roomsensor?.hide_humidity) {
      accessory.removeService(this.humidityService);
    }

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.SensorUpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });

    // Watch for roomsensor change events
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
    // Set Room Sensor State
    if (this.sensorAccessory.accessoryValue.batteryStatus.startsWith('Ok')) {
      this.BatteryLevel = 100;
    } else {
      this.BatteryLevel = 10;
    }
    if (this.BatteryLevel < 15) {
      this.StatusLowBattery = 1;
    } else {
      this.StatusLowBattery = 0;
    }

    // Set Temperature Sensor State
    if (!this.platform.config.options?.roomsensor?.hide_temperature) {
      this.CurrentTemperature = this.toCelsius(this.sensorAccessory.accessoryValue.indoorTemperature);
    }

    // Set Occupancy Sensor State
    if (!this.platform.config.options?.roomsensor?.hide_occupancy) {
      if (this.sensorAccessory.accessoryValue.occupancyDet) {
        this.OccupancyDetected = 1;
      } else {
        this.OccupancyDetected = 0;
      }
    }

    // Set Humidity Sensor State
    if (!this.platform.config.options?.roomsensor?.hide_humidity) {
      this.CurrentRelativeHumidity = this.sensorAccessory.accessoryValue.indoorHumidity;
    }
    this.platform.log.debug(
      'Room Sensor %s - %s°c, %s%',
      this.accessory.displayName,
      this.CurrentTemperature,
      this.CurrentRelativeHumidity,
    );
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
    } catch (e) {
      this.platform.log.error(
        'RS - Failed to update status of',
        this.sensorAccessory.accessoryAttribute.name,
        this.sensorAccessory.accessoryAttribute.type,
        JSON.stringify(e.message),
        this.platform.log.debug('RS %s - ', this.accessory.displayName, JSON.stringify(e)),
      );
      this.apiError(e);
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
    this.service.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
    if (!this.platform.config.options?.roomsensor?.hide_temperature) {
      this.temperatureService?.updateCharacteristic(
        this.platform.Characteristic.CurrentTemperature,
        this.CurrentTemperature,
      );
    }
    if (!this.platform.config.options?.roomsensor?.hide_occupancy) {
      this.occupancyService?.updateCharacteristic(
        this.platform.Characteristic.OccupancyDetected,
        this.OccupancyDetected,
      );
    }
    if (!this.platform.config.options?.roomsensor?.hide_humidity) {
      this.humidityService?.updateCharacteristic(
        this.platform.Characteristic.CurrentRelativeHumidity,
        this.CurrentRelativeHumidity,
      );
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, e);
    this.service.updateCharacteristic(this.platform.Characteristic.BatteryLevel, e);
    if (!this.platform.config.options?.roomsensor?.hide_temperature) {
      this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    }
    if (!this.platform.config.options?.roomsensor?.hide_occupancy) {
      this.occupancyService.updateCharacteristic(this.platform.Characteristic.OccupancyDetected, e);
    }
    if (!this.platform.config.options?.roomsensor?.hide_humidity) {
      this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, e);
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
