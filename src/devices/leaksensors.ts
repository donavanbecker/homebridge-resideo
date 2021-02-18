import { Service, PlatformAccessory, CharacteristicGetCallback, CharacteristicEventTypes } from 'homebridge';
import { HoneywellHomePlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { skipWhile } from 'rxjs/operators';
import { DeviceURL, location, LeakDevice } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class LeakSensor {
  private service: Service;
  temperatureService?: Service;
  humidityService?: Service;
  leakService?: Service;

  StatusActive!: boolean;
  LeakDetected!: number;
  CurrentTemperature!: number;
  CurrentRelativeHumidity!: number;
  BatteryLevel!: number;
  ChargingState!: number;
  StatusLowBattery!: number;

  SensorUpdateInProgress!: boolean;
  doSensorUpdate!: any;

  constructor(
    private readonly platform: HoneywellHomePlatform,
    private accessory: PlatformAccessory,
    public readonly locationId: location['locationID'],
    public device: LeakDevice,
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
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Honeywell')
      .setCharacteristic(this.platform.Characteristic.Model, device.deviceType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceID);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    (this.service =
      this.accessory.getService(this.platform.Service.BatteryService) ||
      this.accessory.addService(this.platform.Service.BatteryService)),
    `${device.userDefinedDeviceName} Sensor`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      `${device.userDefinedDeviceName} ${device.deviceType}`,
    );

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/

    // Do initial device parse
    this.parseStatus();

    // Set Charging State
    this.service.setCharacteristic(this.platform.Characteristic.ChargingState, 2);

    // Leak Sensor Service
    this.leakService = accessory.getService(this.platform.Service.LeakSensor);
    if (!this.leakService && !this.platform.config.options?.leaksensor?.hide_leak) {
      this.leakService = accessory.addService(
        this.platform.Service.LeakSensor,
        `${device.userDefinedDeviceName} Leak Sensor`,
      );
    } else if (this.leakService && this.platform.config.options?.leaksensor?.hide_leak) {
      accessory.removeService(this.leakService);
    }

    // Temperature Sensor Service
    this.temperatureService = accessory.getService(this.platform.Service.TemperatureSensor);
    if (!this.temperatureService && !this.platform.config.options?.leaksensor?.hide_temperature) {
      this.temperatureService = accessory.addService(
        this.platform.Service.TemperatureSensor,
        `${device.userDefinedDeviceName} Temperature Sensor`,
      );
      this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .setProps({
          minValue: -50,
          maxValue: 212,
          minStep: 0.1,
        })
        .on(CharacteristicEventTypes.GET, this.handleCurrentTemperatureGet.bind(this));
    } else if (this.temperatureService && this.platform.config.options?.leaksensor?.hide_temperature) {
      accessory.removeService(this.temperatureService);
    }

    // Humidity Sensor Service
    this.humidityService = accessory.getService(this.platform.Service.HumiditySensor);
    if (!this.humidityService && !this.platform.config.options?.leaksensor?.hide_humidity) {
      this.humidityService = accessory.addService(
        this.platform.Service.HumiditySensor,
        `${device.userDefinedDeviceName} Humidity Sensor`,
      );
      this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .setProps({
          minStep: 0.1,
        });
    } else if (this.humidityService && this.platform.config.options?.leaksensor?.hide_humidity) {
      accessory.removeService(this.humidityService);
    }

    // Retrieve initial values and updateHomekit
    // this.refreshStatus();
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
    // Set Sensor State
    this.StatusActive = this.device.hasDeviceCheckedIn;
    if (this.device.waterPresent === true) {
      this.LeakDetected = 1;
    } else {
      this.LeakDetected = 0;
    }

    // Temperature Sensor
    if (!this.platform.config.options?.leaksensor?.hide_temperature) {
      this.CurrentTemperature = this.device.currentSensorReadings.temperature;
    }

    // HumiditySensor
    if (!this.platform.config.options?.leaksensor?.hide_humidity) {
      this.CurrentRelativeHumidity = this.device.currentSensorReadings.humidity;
    }

    // Battery Service
    this.BatteryLevel = this.device.batteryRemaining;
    if (this.device.batteryRemaining < 15) {
      this.StatusLowBattery = 1;
    } else {
      this.StatusLowBattery = 0;
    }
    this.platform.log.debug(
      'LS %s - %s°, %s%',
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
      this.device = (
        await this.platform.axios.get(`${DeviceURL}/waterLeakDetectors/${this.device.deviceID}`, {
          params: {
            locationId: this.locationId,
          },
        })
      ).data;
      this.platform.log.debug('LS %s - ', this.accessory.displayName, JSON.stringify(this.device));
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e) {
      this.platform.log.error(
        'LS - Failed to update status of',
        this.device.userDefinedDeviceName,
        JSON.stringify(e.message),
        this.platform.log.debug('LS %s - ', this.accessory.displayName, JSON.stringify(e)),
      );
      this.apiError(e);
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    this.service.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
    this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
    if (!this.platform.config.options?.leaksensor?.hide_leak) {
      this.leakService?.updateCharacteristic(this.platform.Characteristic.LeakDetected, this.LeakDetected);
      this.leakService?.updateCharacteristic(this.platform.Characteristic.StatusActive, this.StatusActive);
    }
    if (!this.platform.config.options?.leaksensor?.hide_temperature) {
      this.temperatureService?.updateCharacteristic(
        this.platform.Characteristic.CurrentTemperature,
        this.CurrentTemperature,
      );
    }
    if (!this.platform.config.options?.leaksensor?.hide_humidity) {
      this.humidityService?.updateCharacteristic(
        this.platform.Characteristic.CurrentRelativeHumidity,
        this.CurrentRelativeHumidity,
      );
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.BatteryLevel, e);
    this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, e);
    if (!this.platform.config.options?.leaksensor?.hide_leak) {
      this.leakService?.updateCharacteristic(this.platform.Characteristic.LeakDetected, e);
      this.leakService?.updateCharacteristic(this.platform.Characteristic.StatusActive, e);
    }
    if (!this.platform.config.options?.leaksensor?.hide_temperature) {
      this.temperatureService?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    }
    if (!this.platform.config.options?.leaksensor?.hide_humidity) {
      this.humidityService?.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, e);
    }
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  handleCurrentTemperatureGet(callback: CharacteristicGetCallback) {
    if (!this.platform.config.options?.leaksensor?.hide_temperature) {
      this.platform.log.debug('LS %s - Get CurrentTemperature', this.accessory.displayName);

      const currentValue = this.CurrentTemperature;

      callback(null, currentValue);
      this.platform.log.debug('LS %s - CurrentTemperature: %s', this.accessory.displayName, currentValue);
    }
  }
}
