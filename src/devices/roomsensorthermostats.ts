import { Service, PlatformAccessory, CharacteristicValue, HAPStatus } from 'homebridge';
import { HoneywellHomePlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { DeviceURL, location, sensorAccessory, Thermostat, T9groups, FanChangeableValues } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class RoomSensorThermostat {
  private service: Service;

  private modes: { Off: number; Heat: number; Cool: number; Auto: number };

  CurrentTemperature!: CharacteristicValue;
  TargetTemperature!: CharacteristicValue;
  CurrentHeatingCoolingState!: CharacteristicValue;
  TargetHeatingCoolingState!: CharacteristicValue;
  CoolingThresholdTemperature!: CharacteristicValue;
  HeatingThresholdTemperature!: CharacteristicValue;
  CurrentRelativeHumidity!: CharacteristicValue;
  TemperatureDisplayUnits!: CharacteristicValue;
  honeywellMode!: Array<string>;
  roompriority: any;
  deviceFan!: FanChangeableValues;

  roomUpdateInProgress!: boolean;
  doRoomUpdate;
  thermostatUpdateInProgress!: boolean;
  doThermostatUpdate;
  fanUpdateInProgress!: boolean;
  doFanUpdate;

  constructor(
    private readonly platform: HoneywellHomePlatform,
    private accessory: PlatformAccessory,
    public readonly locationId: location['locationID'],
    public device: Thermostat,
    public sensorAccessory: sensorAccessory,
    public readonly group: T9groups,
  ) {
    // Map Honeywell Modes to HomeKit Modes
    this.modes = {
      Off: platform.Characteristic.TargetHeatingCoolingState.OFF,
      Heat: platform.Characteristic.TargetHeatingCoolingState.HEAT,
      Cool: platform.Characteristic.TargetHeatingCoolingState.COOL,
      Auto: platform.Characteristic.TargetHeatingCoolingState.AUTO,
    };

    // Map HomeKit Modes to Honeywell Modes
    // Don't change the order of these!
    this.honeywellMode = ['Off', 'Heat', 'Cool', 'Auto'];

    // default placeholders
    this.CurrentTemperature;
    this.TargetTemperature;
    this.CurrentHeatingCoolingState;
    this.TargetHeatingCoolingState;
    this.CoolingThresholdTemperature;
    this.HeatingThresholdTemperature;
    this.CurrentRelativeHumidity;
    this.TemperatureDisplayUnits;

    // this is subject we use to track when we need to POST changes to the Honeywell API
    this.doRoomUpdate = new Subject();
    this.roomUpdateInProgress = false;
    this.doThermostatUpdate = new Subject();
    this.thermostatUpdateInProgress = false;

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Honeywell')
      .setCharacteristic(this.platform.Characteristic.Model, sensorAccessory.accessoryAttribute.model || '1100')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, sensorAccessory.deviceID)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.firmwareRevision)
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision).updateValue(accessory.context.firmwareRevision);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    (this.service =
      this.accessory.getService(this.platform.Service.Thermostat) ||
      this.accessory.addService(this.platform.Service.Thermostat)), accessory.displayName;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      `${sensorAccessory.accessoryAttribute.name} ${sensorAccessory.accessoryAttribute.type} Thermostat`,
    );

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Thermostat

    // Do initial device parse
    this.parseStatus();

    // Set Min and Max
    if (device.changeableValues.heatCoolMode === 'Heat') {
      this.platform.log.debug('RST %s - ', this.accessory.displayName, 'Device is in "Heat" mode');
      this.service
        .getCharacteristic(this.platform.Characteristic.TargetTemperature)
        .setProps({
          minValue: this.toCelsius(device.minHeatSetpoint),
          maxValue: this.toCelsius(device.maxHeatSetpoint),
          minStep: 0.5,
        })
        .onGet(() => {
          return this.TargetTemperature;
        });
    } else {
      this.platform.log.debug('RST %s - ', this.accessory.displayName, 'Device is in "Cool" mode');
      this.service
        .getCharacteristic(this.platform.Characteristic.TargetTemperature)
        .setProps({
          minValue: this.toCelsius(device.minCoolSetpoint),
          maxValue: this.toCelsius(device.maxCoolSetpoint),
          minStep: 0.5,
        })
        .onGet(() => {
          return this.TargetTemperature;
        });
    }

    // The value property of TargetHeaterCoolerState must be one of the following:
    //AUTO = 3; HEAT = 1; COOL = 2; OFF = 0;
    // Set control bindings
    const TargetState = this.TargetState();
    this.service
      .getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .setProps({
        validValues: TargetState,
      })
      .onSet(this.setTargetHeatingCoolingState.bind(this));

    this.service.setCharacteristic(
      this.platform.Characteristic.CurrentHeatingCoolingState,
      this.CurrentHeatingCoolingState,
    );

    this.service
      .getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .onSet(this.setHeatingThresholdTemperature.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .onSet(this.setCoolingThresholdTemperature.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onSet(this.setTargetTemperature.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onSet(this.setTemperatureDisplayUnits.bind(this));

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.thermostatUpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
        this.refreshSensorStatus();
      });

    // Watch for thermostat change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    if (this.platform.config.options?.roompriority?.thermostat) {
      this.doRoomUpdate
        .pipe(
          tap(() => {
            this.roomUpdateInProgress = true;
          }),
          debounceTime(this.platform.config.options!.pushRate! * 500),
        )
        .subscribe(async () => {
          try {
            await this.refreshRoomPriority();
            await this.pushRoomChanges();
          } catch (e) {
            this.platform.log.error(JSON.stringify(e.message));
            this.platform.log.debug('RST %s - ', this.accessory.displayName, JSON.stringify(e));
            this.apiError(e);
          }
          this.roomUpdateInProgress = false;
        });
    }
    this.doThermostatUpdate
      .pipe(
        tap(() => {
          this.thermostatUpdateInProgress = true;
        }),
        debounceTime(this.platform.config.options!.pushRate! * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e) {
          this.platform.log.error(JSON.stringify(e.message));
          this.platform.log.debug('RST %s - ', this.accessory.displayName, JSON.stringify(e));
          this.apiError(e);
        }
        this.thermostatUpdateInProgress = false;
      });
  }

  /**
   * Parse the device status from the honeywell api
   */
  parseStatus() {
    if (this.device.units === 'Fahrenheit') {
      this.TemperatureDisplayUnits = this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT;
    }
    if (this.device.units === 'Celsius') {
      this.TemperatureDisplayUnits = this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;
    }
    /*this.TemperatureDisplayUnits = this.device.units === 'Fahrenheit' ? this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT :
      this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;
    this.TemperatureDisplayUnits = this.device.units === 'Fahrenheit' ? this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT :
      this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;*/

    this.CurrentTemperature = this.toCelsius(this.sensorAccessory.accessoryValue.indoorTemperature);
    this.CurrentRelativeHumidity = this.sensorAccessory.accessoryValue.indoorHumidity;

    if (this.device.changeableValues.heatSetpoint > 0) {
      this.HeatingThresholdTemperature = this.toCelsius(this.device.changeableValues.heatSetpoint);
    }

    if (this.device.changeableValues.coolSetpoint > 0) {
      this.CoolingThresholdTemperature = this.toCelsius(this.device.changeableValues.coolSetpoint);
    }

    this.TargetHeatingCoolingState = this.modes[this.device.changeableValues.mode];

    /**
     * The CurrentHeatingCoolingState is either 'Heat', 'Cool', or 'Off'
     * CurrentHeatingCoolingState =  OFF = 0, HEAT = 1, COOL = 2
     */
    switch (this.device.operationStatus.mode) {
      case 'Heat':
        this.CurrentHeatingCoolingState = 1;
        break;
      case 'Cool':
        this.CurrentHeatingCoolingState = 2;
        break;
      default:
        this.CurrentHeatingCoolingState = 0;
    }
    this.platform.log.debug(
      'T9 %s Heat -',
      this.accessory.displayName,
      'Device is Currently: ',
      this.CurrentHeatingCoolingState,
    );

    // Set the TargetTemperature value based on the current mode
    if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
      if (this.device.changeableValues.heatSetpoint > 0) {
        this.TargetTemperature = this.toCelsius(this.device.changeableValues.heatSetpoint);
      }
    } else {
      if (this.device.changeableValues.coolSetpoint > 0) {
        this.TargetTemperature = this.toCelsius(this.device.changeableValues.coolSetpoint);
      }
    }
  }

  /**
   * Asks the Honeywell Home API for the latest device information
   */
  async refreshStatus() {
    try {
      this.device = (
        await this.platform.axios.get(`${DeviceURL}/thermostats/${this.device.deviceID}`, {
          params: {
            locationId: this.locationId,
          },
        })
      ).data;
      this.platform.log.debug(
        'RST %s - ',
        this.accessory.displayName,
        'Fetched update for',
        this.device.name,
        'from Honeywell API:',
        JSON.stringify(this.device.changeableValues),
      );
      // this.platform.log.debug('RST %s - ', this.accessory.displayName, JSON.stringify(this.device));
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e) {
      this.platform.log.error(
        'RST - Failed to update status of %s %s Thermostat',
        this.sensorAccessory.accessoryAttribute.name,
        this.sensorAccessory.accessoryAttribute.type,
        JSON.stringify(e.message),
        this.platform.log.debug('RST %s - ', this.accessory.displayName, JSON.stringify(e)),
      );
      this.apiError(e);
    }
  }

  /**
   * Asks the Honeywell Home API for the latest device information
   */
  async refreshSensorStatus() {
    try {
      if (this.platform.config.options?.roompriority?.thermostat) {
        if (this.device.deviceID.startsWith('LCC')) {
          if (this.device.deviceModel.startsWith('T9')) {
            if (this.device.groups) {
              const groups = this.device.groups;
              for (const group of groups) {
                const roomsensors = await this.platform.getCurrentSensorData(this.device, group, this.locationId);
                if (roomsensors.rooms) {
                  const rooms = roomsensors.rooms;
                  this.platform.log.debug('RST %s - ', this.accessory.displayName, JSON.stringify(roomsensors));
                  for (const accessories of rooms) {
                    if (accessories) {
                      this.platform.log.debug('RST %s - ', this.accessory.displayName, JSON.stringify(accessories));
                      for (const accessory of accessories.accessories) {
                        if (accessory.accessoryAttribute) {
                          if (accessory.accessoryAttribute.type) {
                            if (accessory.accessoryAttribute.type.startsWith('IndoorAirSensor')) {
                              this.sensorAccessory = accessory;
                              this.platform.log.debug(
                                'RST %s - ',
                                this.accessory.displayName,
                                JSON.stringify(this.sensorAccessory),
                              );
                              this.platform.log.debug(
                                'RST %s - ',
                                this.accessory.displayName,
                                JSON.stringify(this.sensorAccessory.accessoryAttribute.name),
                              );
                              this.platform.log.debug(
                                'RST %s - ',
                                this.accessory.displayName,
                                JSON.stringify(this.sensorAccessory.accessoryAttribute.softwareRevision),
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
      }
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e) {
      this.platform.log.error(
        'RST - Failed to update status of %s %s Thermostat',
        this.sensorAccessory.accessoryAttribute.name,
        this.sensorAccessory.accessoryAttribute.type,
        JSON.stringify(e.message),
        this.platform.log.debug('RST %s - ', this.accessory.displayName, JSON.stringify(e)),
      );
      this.apiError(e);
    }
  }

  public async refreshRoomPriority() {
    if (this.platform.config.options?.roompriority?.thermostat) {
      this.roompriority = (
        await this.platform.axios.get(`${DeviceURL}/thermostats/${this.device.deviceID}/priority`, {
          params: {
            locationId: this.locationId,
          },
        })
      ).data;
      this.platform.log.debug('RST %s priority -', this.accessory.displayName, JSON.stringify(this.roompriority));
    }
  }

  /**
   * Pushes the requested changes for Room Priority to the Honeywell API
   */
  async pushRoomChanges() {
    this.platform.log.debug(
      'RST Room Priority %s Current Room: %s, Changing Room: %s',
      this.accessory.displayName,
      JSON.stringify(this.roompriority.currentPriority.selectedRooms),
      `[${this.sensorAccessory.accessoryId}]`,
    );
    if (`[${this.sensorAccessory.accessoryId}]` !== `[${this.roompriority.currentPriority.selectedRooms}]`) {
      const payload = {
        currentPriority: {
          priorityType: this.platform.config.options?.roompriority?.priorityType,
        },
      } as any;

      if (this.platform.config.options?.roompriority?.priorityType === 'PickARoom') {
        payload.currentPriority.selectedRooms = [this.sensorAccessory.accessoryId];
      }

      /**
       * For "LCC-" devices only.
       * "NoHold" will return to schedule.
       * "TemporaryHold" will hold the set temperature until "nextPeriodTime".
       * "PermanentHold" will hold the setpoint until user requests another change.
       */
      if (this.platform.config.options?.roompriority?.thermostat) {
        if (this.platform.config.options.roompriority.priorityType === 'FollowMe') {
          this.platform.log.info(
            'Sending request to Honeywell API. Priority Type:',
            this.platform.config.options.roompriority.priorityType,
            ', Built-in Occupancy Sensor(s) Will be used to set Priority Automatically.',
          );
        } else if (this.platform.config.options.roompriority.priorityType === 'WholeHouse') {
          this.platform.log.info(
            'Sending request to Honeywell API. Priority Type:',
            this.platform.config.options.roompriority.priorityType,
          );
        } else if (this.platform.config.options.roompriority.priorityType === 'PickARoom') {
          this.platform.log.info(
            'Sending request to Honeywell API. Room Priority:',
            this.sensorAccessory.accessoryAttribute.name,
            ' Priority Type:',
            this.platform.config.options.roompriority.priorityType,
          );
        }
        this.platform.log.debug('RST %s - ', this.accessory.displayName, JSON.stringify(payload));

        // Make the API request
        await this.platform.axios.put(`${DeviceURL}/thermostats/${this.device.deviceID}/priority`, payload, {
          params: {
            locationId: this.locationId,
          },
        });
      }
      // Refresh the status from the API
      await this.refreshSensorStatus();
    }
  }

  /**
   * Pushes the requested changes to the Honeywell API
   */
  async pushChanges() {
    const payload = {
      mode: this.honeywellMode[Number(this.TargetHeatingCoolingState)],
      thermostatSetpointStatus: this.platform.config.options?.thermostat?.thermostatSetpointStatus,
      autoChangeoverActive: this.device.changeableValues.autoChangeoverActive,
    } as any;

    // Set the heat and cool set point value based on the selected mode
    if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
      payload.heatSetpoint = this.toFahrenheit(Number(this.TargetTemperature));
      payload.coolSetpoint = this.toFahrenheit(Number(this.CoolingThresholdTemperature));
    } else if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.COOL) {
      payload.coolSetpoint = this.toFahrenheit(Number(this.TargetTemperature));
      payload.heatSetpoint = this.toFahrenheit(Number(this.HeatingThresholdTemperature));
    } else if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.AUTO) {
      payload.coolSetpoint = this.toFahrenheit(Number(this.CoolingThresholdTemperature));
      payload.heatSetpoint = this.toFahrenheit(Number(this.HeatingThresholdTemperature));
    } else {
      payload.coolSetpoint = this.toFahrenheit(Number(this.CoolingThresholdTemperature));
      payload.heatSetpoint = this.toFahrenheit(Number(this.HeatingThresholdTemperature));
    }

    this.platform.log.info(
      'Sending request for',
      this.accessory.displayName,
      'to Honeywell API. mode:',
      payload.mode,
      'coolSetpoint:',
      payload.coolSetpoint,
      'heatSetpoint:',
      payload.heatSetpoint,
      'thermostatSetpointStatus:',
      this.platform.config.options?.thermostat?.thermostatSetpointStatus,
    );
    this.platform.log.debug('RST %s - ', this.accessory.displayName, JSON.stringify(payload));

    // Make the API request
    await this.platform.axios.post(`${DeviceURL}/thermostats/${this.device.deviceID}`, payload, {
      params: {
        locationId: this.locationId,
      },
    });
    // Refresh the status from the API
    await this.refreshStatus();
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (this.TemperatureDisplayUnits !== undefined) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.TemperatureDisplayUnits,
        this.TemperatureDisplayUnits,
      );
    }
    if (this.CurrentTemperature !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
    }
    if (this.CurrentRelativeHumidity !== undefined) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.CurrentRelativeHumidity,
        this.CurrentRelativeHumidity,
      );
    }
    if (this.TargetTemperature !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.TargetTemperature);
    }
    if (this.HeatingThresholdTemperature !== undefined) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.HeatingThresholdTemperature,
        this.HeatingThresholdTemperature,
      );
    }
    if (this.CoolingThresholdTemperature !== undefined) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.CoolingThresholdTemperature,
        this.CoolingThresholdTemperature,
      );
    }
    if (this.TargetHeatingCoolingState !== undefined) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.TargetHeatingCoolingState,
        this.TargetHeatingCoolingState,
      );
    }
    if (this.CurrentHeatingCoolingState !== undefined) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.CurrentHeatingCoolingState,
        this.CurrentHeatingCoolingState,
      );
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, e);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, e);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, e);
    this.service.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, e);
    this.service.updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, e);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState, e);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, e);
    throw new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
  }

  private setTargetHeatingCoolingState(value: CharacteristicValue) {
    this.platform.log.debug('RST %s - ', this.accessory.displayName, `Set TargetHeatingCoolingState: ${value}`);

    this.TargetHeatingCoolingState = value;

    // Set the TargetTemperature value based on the selected mode
    if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
      this.TargetTemperature = this.toCelsius(this.device.changeableValues.heatSetpoint);
    } else {
      this.TargetTemperature = this.toCelsius(this.device.changeableValues.coolSetpoint);
    }
    this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.TargetTemperature);
    if (this.TargetHeatingCoolingState !== this.modes[this.device.changeableValues.mode]) {
      this.doRoomUpdate.next();
      this.doThermostatUpdate.next();
    }
  }

  private setHeatingThresholdTemperature(value: CharacteristicValue) {
    this.platform.log.debug('RST %s - ', this.accessory.displayName, `Set HeatingThresholdTemperature: ${value}`);
    this.HeatingThresholdTemperature = value;
    this.doThermostatUpdate.next();
  }

  private setCoolingThresholdTemperature(value: CharacteristicValue) {
    this.platform.log.debug('RST %s - ', this.accessory.displayName, `Set CoolingThresholdTemperature: ${value}`);
    this.CoolingThresholdTemperature = value;
    this.doThermostatUpdate.next();
  }

  private setTargetTemperature(value: CharacteristicValue) {
    this.platform.log.debug('RST %s - ', this.accessory.displayName, `Set TargetTemperature:': ${value}`);
    this.TargetTemperature = value;
    this.doThermostatUpdate.next();
  }

  private setTemperatureDisplayUnits(value: CharacteristicValue) {
    this.platform.log.debug('RST %s - ', this.accessory.displayName, `Set TemperatureDisplayUnits: ${value}`);
    this.platform.log.warn('Changing the Hardware Display Units from HomeKit is not supported.');

    // change the temp units back to the one the Honeywell API said the thermostat was set to
    setTimeout(() => {
      this.service.updateCharacteristic(
        this.platform.Characteristic.TemperatureDisplayUnits,
        this.TemperatureDisplayUnits,
      );
    }, 100);
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

  private TargetState() {
    this.platform.log.debug('RST %s - ', this.accessory.displayName, this.device.allowedModes);

    const TargetState = [4];
    TargetState.pop();
    if (this.device.allowedModes.includes('Cool')) {
      TargetState.push(this.platform.Characteristic.TargetHeatingCoolingState.COOL);
    }
    if (this.device.allowedModes.includes('Heat')) {
      TargetState.push(this.platform.Characteristic.TargetHeatingCoolingState.HEAT);
    }
    if (this.device.allowedModes.includes('Off')) {
      TargetState.push(this.platform.Characteristic.TargetHeatingCoolingState.OFF);
    }
    if (this.device.allowedModes.includes('Auto')) {
      TargetState.push(this.platform.Characteristic.TargetHeatingCoolingState.AUTO);
    }
    this.platform.log.debug(
      'RST %s - ',
      this.accessory.displayName,
      'Only Show These Modes:',
      JSON.stringify(TargetState),
    );
    return TargetState;
  }
}
