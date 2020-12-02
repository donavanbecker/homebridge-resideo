import { Service, PlatformAccessory } from 'homebridge';
import { HoneywellHomePlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { location, sensoraccessory, T9Thermostat, T9groups } from '../configTypes';

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
  motionService?: Service;

  CurrentTemperature!: number;
  StatusLowBattery!: number;
  OccupancyDetected!: number;
  CurrentRelativeHumidity!: number;
  MotionDetected!: any;

  SensorUpdateInProgress!: boolean;
  doSensorUpdate!: any;
  TemperatureDisplayUnits!: number;
  BatteryLevel!: number;

  constructor(
    private readonly platform: HoneywellHomePlatform,
    private accessory: PlatformAccessory,
    public readonly locationId: location['locationID'],
    public device: T9Thermostat,
    public sensoraccessory: sensoraccessory,
    public readonly group: T9groups,
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
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Honeywell')
      .setCharacteristic(this.platform.Characteristic.Model, this.device.deviceModel)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.deviceID)
      .setCharacteristic(
        this.platform.Characteristic.FirmwareRevision,
        this.sensoraccessory.accessoryAttribute.softwareRevision,
      );

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    (this.service =
      this.accessory.getService(this.platform.Service.BatteryService) ||
      this.accessory.addService(this.platform.Service.BatteryService)),
    `${this.sensoraccessory.accessoryAttribute.name} Room Sensor`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      `${this.sensoraccessory.accessoryAttribute.name} Room Sensor`,
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
        `${this.sensoraccessory.accessoryAttribute.name} Temperature Sensor`,
      );
    } else if (this.temperatureService && this.platform.config.options?.roomsensor?.hide_temperature) {
      accessory.removeService(this.temperatureService);
    }

    // Occupancy Sensor Service
    this.occupancyService = accessory.getService(this.platform.Service.OccupancySensor);
    if (!this.occupancyService && !this.platform.config.options?.roomsensor?.hide_occupancy) {
      this.occupancyService = accessory.addService(
        this.platform.Service.OccupancySensor,
        `${this.sensoraccessory.accessoryAttribute.name} Occupancy Sensor`,
      );
    } else if (this.occupancyService && this.platform.config.options?.roomsensor?.hide_occupancy) {
      accessory.removeService(this.occupancyService);
    }

    // Humidity Sensor Service
    this.humidityService = accessory.getService(this.platform.Service.HumiditySensor);
    if (!this.humidityService && !this.platform.config.options?.roomsensor?.hide_humidity) {
      this.humidityService = accessory.addService(
        this.platform.Service.HumiditySensor,
        `${this.sensoraccessory.accessoryAttribute.name} Humidity Sensor`,
      );
    } else if (this.humidityService && this.platform.config.options?.roomsensor?.hide_humidity) {
      accessory.removeService(this.humidityService);
    }

    // Motion Sensor Service
    this.motionService = accessory.getService(this.platform.Service.MotionSensor);
    if (!this.motionService && !this.platform.config.options?.roomsensor?.hide_motion) {
      this.motionService = accessory.addService(
        this.platform.Service.MotionSensor,
        `${this.sensoraccessory.accessoryAttribute.name} Motion Sensor`,
      );
    } else if (this.motionService && this.platform.config.options?.roomsensor?.hide_motion) {
      accessory.removeService(this.motionService);
    }

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // Start an update interval
    interval(this.platform.config.options!.ttl! * 1000)
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
    // Set Room Sensor State
    if (this.sensoraccessory.accessoryValue.batteryStatus.startsWith('Ok')) {
      this.BatteryLevel = 100;
    } else {
      this.BatteryLevel = 10;
    }
    if (this.BatteryLevel > 15 ) {
      this.StatusLowBattery = 0;
    } else {
      this.StatusLowBattery = 1;
    }

    // Set Temperature Sensor State
    if (!this.platform.config.options?.roomsensor?.hide_temperature) {
      this.CurrentTemperature = this.toCelsius(this.sensoraccessory.accessoryValue.indoorTemperature);
    }

    // Set Occupancy Sensor State
    if (!this.platform.config.options?.roomsensor?.hide_occupancy) {
      if (this.sensoraccessory.accessoryValue.occupancyDet) {
        this.OccupancyDetected = 1;
      } else {
        this.OccupancyDetected = 0;
      }
    }

    // Set Humidity Sensor State
    if (!this.platform.config.options?.roomsensor?.hide_humidity) {
      this.CurrentRelativeHumidity = this.sensoraccessory.accessoryValue.indoorHumidity;
    }

    // Set Motion Sensor State
    if (!this.platform.config.options?.roomsensor?.hide_motion) {
      this.MotionDetected !== this.sensoraccessory.accessoryValue.motionDet;
    }
  }

  /**
   * Asks the Honeywell Home API for the latest device information
   */
  async refreshStatus() {
    try {
      if (this.device.deviceID.startsWith('LCC')) {
        if (this.device.deviceModel.startsWith('T9')) {
          if (this.device.groups) {
            const groups = this.device.groups;
            for (const group of groups) {
              const roomsensors = await this.platform.Sensors(this.device, group, this.locationId);
              if (roomsensors.rooms) {
                const rooms = roomsensors.rooms;
                this.platform.log.debug(JSON.stringify(roomsensors));
                for (const accessories of rooms) {
                  if (accessories) {
                    this.platform.log.debug(JSON.stringify(accessories));
                    for (const accessory of accessories.accessories) {
                      if (accessory.accessoryAttribute) {
                        if (accessory.accessoryAttribute.type) {
                          if (accessory.accessoryAttribute.type.startsWith('IndoorAirSensor')) {
                            this.sensoraccessory = accessory;
                            this.platform.log.debug(JSON.stringify(this.sensoraccessory));
                            this.platform.log.debug(JSON.stringify(this.sensoraccessory));
                            this.platform.log.debug(
                              JSON.stringify(this.sensoraccessory.accessoryAttribute.softwareRevision),
                            );
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e) {
      this.platform.log.error(
        `Failed to update status of ${this.sensoraccessory.accessoryAttribute.name} ${this.sensoraccessory.accessoryAttribute.type}`,
        JSON.stringify(e.message),
        this.platform.log.debug(JSON.stringify(e)),
      );
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
    if (!this.platform.config.options?.roomsensor?.hide_motion) {
      this.motionService?.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.MotionDetected);
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

  /**
   * Converts the value to fahrenheit if the temperature units are in Fahrenheit
   */
  toFahrenheit(value: number) {
    if (this.TemperatureDisplayUnits === this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS) {
      return value;
    }

    return Math.round((value * 9) / 5 + 32);
  }
}
