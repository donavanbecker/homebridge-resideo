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
export class RoomPriority {
  private service: Service;

  RoomUpdateInProgress!: boolean;
  doRoomUpdate!: any;
  RoomOn: any;
  roompriority: any;

  constructor(
    private readonly platform: HoneywellHomePlatform,
    private accessory: PlatformAccessory,
    public readonly locationId: string,
    public device: any,
    public readonly room: any,
  ) {

    // default placeholders
    this.RoomOn;

    // this is subject we use to track when we need to POST changes to the Honeywell API
    this.doRoomUpdate = new Subject();
    this.RoomUpdateInProgress = false;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Honeywell')
      .setCharacteristic(this.platform.Characteristic.Model, 'Room Priority')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.deviceID);
    // .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.firmwareRevision);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch), `Room ${this.room} Priority`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name,
      `Room ${this.room} Priority`);

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
    if (!this.platform.config.options.roompriority.hide) {
      if (this.RoomOn) {
        this.platform.log.warn(`${JSON.stringify(this.RoomOn)}`);
        if (this.RoomOn === this.room) {
          this.RoomOn = this.platform.Characteristic.On;
        } else if (this.RoomOn !== this.room) {
          this.RoomOn = !this.platform.Characteristic.On;
        }
      }
    }
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
      this.platform.log.warn(roompriority);
      this.roompriority = roompriority;
      this.platform.log.warn(JSON.stringify(this.roompriority));
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
    let payload = {
      currentPriority: {
        priorityType: 'PickARoom',
        selectedRooms: [0],
      },
    };
    if (!this.platform.config.options.roompriority.hide) {
      this.platform.log.debug(`RoomOn:' ${this.RoomOn}`);

      if (this.RoomOn === this.platform.Characteristic.On) {
        payload = {
          currentPriority: {
            priorityType: 'PickARoom',
            selectedRooms: [0],
          },
        };
      } else if (this.RoomOn === !this.platform.Characteristic.On) {
        payload = {
          currentPriority: {
            priorityType: 'PickARoom',
            selectedRooms: [this.room],
          },
        };
      }
    }
    this.platform.log.info(`Sending request to Honeywell API. Room Priority: ${payload.currentPriority.selectedRooms}`);
    this.platform.log.warn(JSON.stringify(payload));

    // Make the API request
    const put = (await this.platform.axios.put(`${DeviceURL}/thermostats/${this.device.deviceID}/priority`, payload, {
      params: {
        locationId: this.locationId,
      },
    })).data;
    this.platform.log.warn(JSON.stringify(put));
    // Refresh the status from the API
    await this.refreshStatus();
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (!this.platform.config.options.roompriority.hide) {
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.RoomOn);
    }
  }

  /**
   * Handle requests to get the current value of the "On" characteristic
   */
  handleOnGet(callback: (arg0: null, arg1: number) => void) {
    this.platform.log.debug('Trigger GET On');

    // set this to a valid value for On
    const currentValue = this.RoomOn;
    this.doRoomUpdate.next();
    callback(null, currentValue);
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  handleOnSet(value: any, callback: (arg0: null) => void) {
    this.platform.log.debug(`Trigger SET On: ${value}`);
    this.doRoomUpdate.next();
    callback(null);
  }

}