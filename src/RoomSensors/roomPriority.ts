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
export class RoomPriority {
  private service: Service;

  RoomUpdateInProgress!: boolean;
  doRoomUpdate!: any;
  RoomOn!: number;
  roompriority!: configTypes.Priority;
  selectedRooms!: any;

  constructor(
    private readonly platform: HoneywellHomePlatform,
    private accessory: PlatformAccessory,
    public readonly locationId: configTypes.location['locationID'],
    public device: configTypes.T9Thermostat,
    public rooms: configTypes.Room,
    public currentPriority: configTypes.CurrentPriority, 
    public priorityrooms: configTypes.Room['accessories'],
  ) {
    
    // default placeholders
    this.RoomOn;
    this.selectedRooms;

    // this is subject we use to track when we need to POST changes to the Honeywell API
    this.doRoomUpdate = new Subject();
    this.RoomUpdateInProgress = false;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Honeywell')
      .setCharacteristic(this.platform.Characteristic.Model, 'Room Priority')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.deviceID)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.rooms.id);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch), `${this.rooms.roomName} Priority`;

    this.refreshStatus();

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name,
      `${this.rooms.roomName} Priority`);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/

    // Do initial device parse
    this.parseStatus();

    // create handlers for required characteristics
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .on('get', this.handleOnGet.bind(this))
      .on('set', this.handleOnSet.bind(this));

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // Start an update interval
    interval(this.platform.config.options.ttl * 1000).pipe(skipWhile(() => this.RoomUpdateInProgress)).subscribe(() => {
      this.refreshStatus();
    });

    // Watch for thermostat change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doRoomUpdate.pipe(tap(() => {
      this.RoomUpdateInProgress = true;
    }), debounceTime(100)).subscribe(async () => {
      try {
        await this.pushChanges();
      } catch (e) {
        this.platform.log.error(e.message);
      }
      this.RoomUpdateInProgress = false;
    });

  }

  /**
   * Parse the device status from the honeywell api
   */
  parseStatus() {
    // Set Room Priority
    this.platform.log.warn(JSON.stringify(this.selectedRooms));
    this.platform.log.error(JSON.stringify(this.rooms.id));
    this.platform.log.warn(JSON.stringify(this.RoomOn));
    this.RoomOn === this.rooms.id;
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
      this.platform.log.debug(JSON.stringify(roompriority));
      for (const selectedRooms of roompriority.currentPriority.selectedRooms) {
        this.selectedRooms = selectedRooms;
      }
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e) {
      this.platform.log.error(`Failed to update status of ${this.device.name}`, e.message);
    }
  }

  /**
 * Pushes the requested changes to the Honeywell API
 */
  async pushChanges() {
    const payload = {
      currentPriority: {
        priorityType: 'PickARoom',
        selectedRooms: [this.RoomOn],
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
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    this.service.updateCharacteristic(this.platform.Characteristic.On, this.selectedRooms);
  }

  /**
   * Handle requests to get the current value of the "On" characteristic
   */
  handleOnGet(callback: (arg0: null, arg1: number) => void) {
    this.platform.log.warn(`Get Room Priority of Room: ${this.rooms.id}`);
    this.doRoomUpdate.next();
    callback(null, this.RoomOn);
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  handleOnSet(value: any, callback: (arg0: null) => void) {
    this.platform.log.warn(`Set Room Priority to Room: ${value}`);
    value = this.rooms.id;
    this.RoomOn = value;
    this.doRoomUpdate.next();
    callback(null);
  }

}