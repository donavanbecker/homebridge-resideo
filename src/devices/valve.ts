<<<<<<< Updated upstream
import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { interval, Subject } from 'rxjs';
import superStringify from 'super-stringify';
import { skipWhile, take } from 'rxjs/operators';
import { ResideoPlatform } from '../platform';
import * as settings from '../settings';
=======
import { request } from 'undici';
import { interval, Subject } from 'rxjs';
import { skipWhile, take } from 'rxjs/operators';
import { ResideoPlatform } from '../platform.js';
import { API, HAP, CharacteristicValue, PlatformAccessory, Service, Logging } from 'homebridge';
import { devicesConfig, DeviceURL, location, resideoDevice, ResideoPlatformConfig } from '../settings.js';
>>>>>>> Stashed changes

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Valve {
<<<<<<< Updated upstream
=======
  public readonly api: API;
  public readonly log: Logging;
  public readonly config!: ResideoPlatformConfig;
  protected readonly hap: HAP;
>>>>>>> Stashed changes
  // Services
  service: Service;

  // CharacteristicValue
  Active!: CharacteristicValue;
  InUse!: CharacteristicValue;
  ValveType!: CharacteristicValue;

  // Others
  action!: string;
  isAlive!: boolean;
  valveStatus!: string;

  // Config
  deviceLogging!: string;
  deviceRefreshRate!: number;
  valvetype!: number;

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
    this.valveType(device);
=======
    private readonly accessory: PlatformAccessory,
    public readonly locationId: location['locationID'],
    public device: resideoDevice & devicesConfig,
  ) {
    this.api = this.platform.api;
    this.log = this.platform.log;
    this.config = this.platform.config;
    this.hap = this.api.hap;

    this.Active = accessory.context.StatusActive || this.hap.Characteristic.Active.ACTIVE;
    this.InUse = accessory.context.StatusInUse || this.hap.Characteristic.InUse.NOT_IN_USE;
    if (accessory.context.ValveType === undefined) {
      switch (device.valve?.valveType) {
        case 1:
          this.valvetype = this.hap.Characteristic.ValveType.IRRIGATION;
          break;
        case 2:
          this.valvetype = this.hap.Characteristic.ValveType.SHOWER_HEAD;
          break;
        case 3:
          this.valvetype = this.hap.Characteristic.ValveType.WATER_FAUCET;
          break;
        default:
          this.valvetype = this.hap.Characteristic.ValveType.GENERIC_VALVE;
      }
    } else {
      this.valvetype = accessory.context.ValveType;
    }
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

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    (this.service = this.accessory.getService(this.platform.Service.Valve) || this.accessory.addService(this.platform.Service.Valve)),
    `${accessory.displayName}`;
=======
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.Manufacturer, 'Resideo')
      .setCharacteristic(this.hap.Characteristic.Model, device.deviceType)
      .setCharacteristic(this.hap.Characteristic.SerialNumber, device.deviceID)
      .setCharacteristic(this.hap.Characteristic.FirmwareRevision, accessory.context.firmwareRevision);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    (this.service = this.accessory.getService(this.hap.Service.Valve)
      || this.accessory.addService(this.hap.Service.Valve)), `${accessory.displayName}`;
>>>>>>> Stashed changes

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

    // create handlers for required characteristics
    this.service.getCharacteristic(this.platform.Characteristic.Active).onSet(this.setActive.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.InUse)
      .onGet(() => {
        return this.InUse!;
      });

    // Set Valve Type
    this.service.setCharacteristic(this.platform.Characteristic.ValveType, this.valvetype);

    // Retrieve initial values and updateHomekit
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
    if (this.isAlive) {
      this.Active = this.platform.Characteristic.Active.ACTIVE;
    } else {
      this.Active = this.platform.Characteristic.Active.INACTIVE;
    }

    // InUse
    if (this.valveStatus === 'Open') {
      this.InUse = this.platform.Characteristic.InUse.IN_USE;
    } else {
      this.InUse = this.platform.Characteristic.InUse.NOT_IN_USE;
    }
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
      this.isAlive = device.isAlive;
      this.valveStatus = device.actuatorValve.valveStatus;
      this.log.debug(`Valve: ${this.accessory.displayName} device: ${JSON.stringify(this.device)}`);
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
    if (this.Active === undefined) {
      this.log.debug(`Valve: ${this.accessory.displayName} Active: ${this.Active}`);
    } else {
<<<<<<< Updated upstream
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
      this.debugLog(`Valve: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
=======
      this.service.updateCharacteristic(this.hap.Characteristic.Active, this.Active);
      this.log.debug(`Valve: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
>>>>>>> Stashed changes
    }
    if (this.InUse === undefined) {
      this.log.debug(`Valve: ${this.accessory.displayName} InUse: ${this.InUse}`);
    } else {
<<<<<<< Updated upstream
      this.service.updateCharacteristic(this.platform.Characteristic.InUse, this.InUse);
      this.debugLog(`Valve: ${this.accessory.displayName} updateCharacteristic InUse: ${this.InUse}`);
=======
      this.service.updateCharacteristic(this.hap.Characteristic.InUse, this.InUse);
      this.log.debug(`Valve: ${this.accessory.displayName} updateCharacteristic InUse: ${this.InUse}`);
>>>>>>> Stashed changes
    }
  }

  /**
   * Handle requests to set the "Active" characteristic
   */
  setActive(value) {
    this.log.debug('Triggered SET Active:', value);
  }

  /**
   * Handle requests to get the current value of the "In Use" characteristic
   */
  handleInUseGet() {
    this.log.debug('Triggered GET InUse');

    // set this to a valid value for InUse
    const currentValue = this.platform.Characteristic.InUse.NOT_IN_USE;

    return currentValue;
  }

  async apiError(e: any): Promise<void> {
    this.service.updateCharacteristic(this.platform.Characteristic.Active, e);
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
      this.platform.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Bad Request`);
      this.debugLog('The client has issued an invalid request. This is commonly used to specify validation errors in a request payload.');
    } else if (e.message.includes('401')) {
      this.platform.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Unauthorized Request`);
      this.debugLog('Authorization for the API is required, but the request has not been authenticated.');
    } else if (e.message.includes('403')) {
      this.platform.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Forbidden Request`);
      this.debugLog('The request has been authenticated but does not have appropriate permissions, or a requested resource is not found.');
    } else if (e.message.includes('404')) {
      this.platform.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Requst Not Found`);
      this.debugLog('Specifies the requested path does not exist.');
    } else if (e.message.includes('406')) {
      this.platform.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Request Not Acceptable`);
      this.debugLog('The client has requested a MIME type via the Accept header for a value not supported by the server.');
    } else if (e.message.includes('415')) {
      this.platform.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Unsupported Requst Header`);
      this.debugLog('The client has defined a contentType header that is not supported by the server.');
    } else if (e.message.includes('422')) {
      this.platform.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Unprocessable Entity`);
      this.debugLog(
=======
      this.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Bad Request`);
      this.log.debug('The client has issued an invalid request. This is commonly used to specify validation errors in a request payload.');
    } else if (e.message.includes('401')) {
      this.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Unauthorized Request`);
      this.log.debug('Authorization for the API is required, but the request has not been authenticated.');
    } else if (e.message.includes('403')) {
      this.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Forbidden Request`);
      this.log.debug('The request has been authenticated but does not have appropriate permissions, or a requested resource is not found.');
    } else if (e.message.includes('404')) {
      this.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Requst Not Found`);
      this.log.debug('Specifies the requested path does not exist.');
    } else if (e.message.includes('406')) {
      this.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Request Not Acceptable`);
      this.log.debug('The client has requested a MIME type via the Accept header for a value not supported by the server.');
    } else if (e.message.includes('415')) {
      this.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Unsupported Requst Header`);
      this.log.debug('The client has defined a contentType header that is not supported by the server.');
    } else if (e.message.includes('422')) {
      this.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Unprocessable Entity`);
      this.log.debug(
>>>>>>> Stashed changes
        'The client has made a valid request, but the server cannot process it.' +
        ' This is often used for APIs for which certain limits have been exceeded.',
      );
    } else if (e.message.includes('429')) {
<<<<<<< Updated upstream
      this.platform.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Too Many Requests`);
      this.debugLog('The client has exceeded the number of requests allowed for a given time window.');
    } else if (e.message.includes('500')) {
      this.platform.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Internal Server Error`);
      this.debugLog('An unexpected error on the SmartThings servers has occurred. These errors should be rare.');
    } else {
      this.platform.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action},`);
    }
    if (this.deviceLogging.includes('debug')) {
      this.platform.log.error(`Valve: ${this.accessory.displayName} failed to pushChanges, Error Message: ${superStringify(e.message)}`);
    }
  }

  async valveType(device: settings.device & settings.devicesConfig): Promise<void> {
    if (device.valve?.valveType === 1) {
      this.valvetype = this.platform.Characteristic.ValveType.IRRIGATION;
    } else if (device.valve?.valveType === 2){
      this.valvetype = this.platform.Characteristic.ValveType.SHOWER_HEAD;
    } else if (device.valve?.valveType === 3) {
      this.valvetype = this.platform.Characteristic.ValveType.WATER_FAUCET;
    } else {
      this.valvetype = this.platform.Characteristic.ValveType.GENERIC_VALVE;
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
      this.infoLog(`Valve: ${this.accessory.displayName} Config: ${superStringify(config)}`);
    }
  }

  async refreshRate(device: settings.device & settings.devicesConfig): Promise<void> {
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
      this.debugLog(`Valve: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      this.debugLog(`Valve: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    }
  }

  async logs(device: settings.device & settings.devicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`Valve: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`Valve: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`Valve: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`Valve: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
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
  }
=======
      this.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Too Many Requests`);
      this.log.debug('The client has exceeded the number of requests allowed for a given time window.');
    } else if (e.message.includes('500')) {
      this.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action}, Internal Server Error`);
      this.log.debug('An unexpected error on the SmartThings servers has occurred. These errors should be rare.');
    } else {
      this.log.error(`Valve: ${this.accessory.displayName} failed to ${this.action},`);
    }
    if (this.deviceLogging.includes('debug')) {
      this.log.error(`Valve: ${this.accessory.displayName} failed to pushChanges, Error Message: ${JSON.stringify(e.message)}`);
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
  }
>>>>>>> Stashed changes
}
