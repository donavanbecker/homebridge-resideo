import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { HoneywellHomePlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { DeviceURL, location, Thermostat, FanChangeableValues } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Thermostats {
  private service: Service;
  fanService?: Service;
  humidityService?: Service;

  private modes: { Off: number; Heat: number; Cool: number; Auto: number };

  //Thermostat Characteristics
  CurrentTemperature!: CharacteristicValue;
  TargetTemperature!: CharacteristicValue;
  CurrentHeatingCoolingState!: CharacteristicValue;
  TargetHeatingCoolingState!: CharacteristicValue;
  CoolingThresholdTemperature!: CharacteristicValue;
  HeatingThresholdTemperature!: CharacteristicValue;
  CurrentRelativeHumidity?: CharacteristicValue;
  TemperatureDisplayUnits!: CharacteristicValue;
  //Fan Characteristics
  Active!: CharacteristicValue;
  TargetFanState!: CharacteristicValue;
  //Modes
  honeywellMode!: Array<string>;
  fanMode!: FanChangeableValues;
  //Setpoints
  heatSetpoint!: number;
  coolSetpoint!: number;
  //T9 Only
  roompriority!: any;
  //Thermostat Updates
  thermostatUpdateInProgress!: boolean;
  doThermostatUpdate!: Subject<unknown>;
  //Fan Updates
  fanUpdateInProgress!: boolean;
  doFanUpdate!: Subject<unknown>;
  //Room updates - T9 Only
  roomUpdateInProgress!: boolean;
  doRoomUpdate!: Subject<unknown>;

  constructor(
    private readonly platform: HoneywellHomePlatform,
    private accessory: PlatformAccessory,
    public readonly locationId: location['locationID'],
    public device: Thermostat,
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
    this.Active = this.platform.Characteristic.Active.INACTIVE;
    this.TargetFanState = this.platform.Characteristic.TargetFanState.MANUAL;

    // this is subject we use to track when we need to POST changes to the Honeywell API for Room Changes - T9 Only
    this.doRoomUpdate = new Subject();
    this.roomUpdateInProgress = false;
    // this is subject we use to track when we need to POST changes to the Honeywell API
    this.doThermostatUpdate = new Subject();
    this.thermostatUpdateInProgress = false;
    this.doFanUpdate = new Subject();
    this.fanUpdateInProgress = false;

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Honeywell')
      .setCharacteristic(this.platform.Characteristic.Model, device.deviceModel)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceID)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.firmwareRevision);

    //Thermostat Service
    (this.service =
      this.accessory.getService(this.platform.Service.Thermostat) ||
      this.accessory.addService(this.platform.Service.Thermostat)),
    `${device.name} ${device.deviceClass}`;

    //Service Name
    this.service.setCharacteristic(this.platform.Characteristic.Name, `${device.name} ${device.deviceClass}`);
    //Required Characteristics" see https://developers.homebridge.io/#/service/Thermostat

    //Initial Device Parse
    this.parseStatus();

    // Set Min and Max
    if (device.changeableValues.heatCoolMode === 'Heat') {
      this.platform.log.debug('Thermostat %s -', this.accessory.displayName, 'Device is in "Heat" mode');
      this.service
        .getCharacteristic(this.platform.Characteristic.TargetTemperature)
        .setProps({
          minValue: this.toCelsius(device.minHeatSetpoint),
          maxValue: this.toCelsius(device.maxHeatSetpoint),
          minStep: 0.1,
        })
        .onGet(async () => {
          return this.TargetTemperature!;
        });
    } else {
      this.platform.log.debug('Thermostat %s -', this.accessory.displayName, 'Device is in "Cool" mode');
      this.service
        .getCharacteristic(this.platform.Characteristic.TargetTemperature)
        .setProps({
          minValue: this.toCelsius(device.minCoolSetpoint),
          maxValue: this.toCelsius(device.maxCoolSetpoint),
          minStep: 0.1,
        })
        .onGet(async () => {
          return this.TargetTemperature!;
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
      .onSet(async (value: CharacteristicValue) => {
        this.setTargetHeatingCoolingState(value);
      });

    this.service.setCharacteristic(
      this.platform.Characteristic.CurrentHeatingCoolingState,
      this.CurrentHeatingCoolingState,
    );

    this.service
      .getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .onSet(async (value: CharacteristicValue) => {
        this.setHeatingThresholdTemperature(value);
      });

    this.service
      .getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .onSet(async (value: CharacteristicValue) => {
        this.setCoolingThresholdTemperature(value);
      });

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onSet(async (value: CharacteristicValue) => {
        this.setTargetTemperature(value);
      });

    this.service
      .getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onSet(async (value: CharacteristicValue) => {
        this.setTemperatureDisplayUnits(value);
      });

    // Fan Controls
    this.fanService = accessory.getService(this.platform.Service.Fanv2);
    if (device.settings?.fan && !this.platform.config.options?.thermostat?.hide_fan) {
      this.platform.log.debug(
        'Thermostat %s -',
        this.accessory.displayName,
        'Available FAN settings',
        JSON.stringify(device.settings.fan),
      );
      this.fanService =
        accessory.getService(this.platform.Service.Fanv2) ||
        accessory.addService(this.platform.Service.Fanv2, `${device.name} ${device.deviceClass} Fan`);

      this.fanService
        .getCharacteristic(this.platform.Characteristic.Active)
        .onSet(async (value: CharacteristicValue) => {
          this.setActive(value);
        });

      this.fanService
        .getCharacteristic(this.platform.Characteristic.TargetFanState)
        .onSet(async (value: CharacteristicValue) => {
          this.setTargetFanState(value);
        });
    } else if (this.fanService && this.platform.config.options?.thermostat?.hide_fan) {
      accessory.removeService(this.fanService);
    }

    // Humidity Sensor Service
    this.humidityService = accessory.getService(this.platform.Service.HumiditySensor);
    if (device.indoorHumidity && !this.humidityService && !this.platform.config.options?.thermostat?.hide_humidity) {
      this.humidityService =
        accessory.getService(this.platform.Service.HumiditySensor) ||
        accessory.addService(
          this.platform.Service.HumiditySensor,
          `${device.name} ${device.deviceClass} Humidity Sensor`,
        );
      this.humidityService
        .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .setProps({
          minStep: 0.1,
        })
        .onGet(async () => {
          return this.CurrentRelativeHumidity!;
        });
    } else if (this.humidityService && this.platform.config.options?.thermostat?.hide_humidity) {
      accessory.removeService(this.humidityService);
    }

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.thermostatUpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });

    // Watch for thermostat change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    if (this.platform.config.options?.roompriority?.thermostat && device.deviceModel === 'T9-T10') {
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
            this.platform.log.debug('Thermostat %s -', this.accessory.displayName, JSON.stringify(e));
            this.platform.refreshAccessToken();
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
          this.platform.log.debug('Thermostat %s -', this.accessory.displayName, JSON.stringify(e));
          this.platform.refreshAccessToken();
          this.apiError(e);
        }
        this.thermostatUpdateInProgress = false;
      });
    if (device.settings?.fan && !this.platform.config.options?.thermostat?.hide_fan) {
      this.doFanUpdate
        .pipe(
          tap(() => {
            this.fanUpdateInProgress = true;
          }),
          debounceTime(this.platform.config.options!.pushRate! * 1000),
        )
        .subscribe(async () => {
          try {
            await this.pushFanChanges();
          } catch (e) {
            this.platform.log.error(JSON.stringify(e.message));
            this.platform.log.debug('Thermostat %s -', this.accessory.displayName, JSON.stringify(e));
            this.platform.refreshAccessToken();
            this.apiError(e);
          }
          this.fanUpdateInProgress = false;
        });
    }
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

    this.CurrentTemperature = this.toCelsius(this.device.indoorTemperature);

    if (this.device.indoorHumidity) {
      this.CurrentRelativeHumidity = this.device.indoorHumidity;
    }

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
      'Thermostat %s Heat -',
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

    // Set the Target Fan State
    if (this.device.settings?.fan && !this.platform.config.options?.thermostat?.hide_fan) {
      if (this.fanMode) {
        this.platform.log.debug('Thermostat %s Fan -', this.accessory.displayName, `${JSON.stringify(this.fanMode)}`);
        if (this.fanMode.mode === 'Auto') {
          this.TargetFanState = this.platform.Characteristic.TargetFanState.AUTO;
          this.Active = this.platform.Characteristic.Active.INACTIVE;
        } else if (this.fanMode.mode === 'On') {
          this.TargetFanState = this.platform.Characteristic.TargetFanState.MANUAL;
          this.Active = this.platform.Characteristic.Active.ACTIVE;
        } else if (this.fanMode.mode === 'Circulate') {
          this.TargetFanState = this.platform.Characteristic.TargetFanState.MANUAL;
          this.Active = this.platform.Characteristic.Active.INACTIVE;
        }
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
        'Thermostat %s -',
        this.accessory.displayName,
        'Fetched update for',
        this.device.name,
        'from Honeywell API:',
        JSON.stringify(this.device.changeableValues),
      );
      await this.refreshRoomPriority();
      if (this.device.settings?.fan && !this.platform.config.options?.thermostat?.hide_fan) {
        this.fanMode = (
          await this.platform.axios.get(`${DeviceURL}/thermostats/${this.device.deviceID}/fan`, {
            params: {
              locationId: this.locationId,
            },
          })
        ).data;
        this.platform.log.debug(
          'Thermostat %s Fan -',
          this.accessory.displayName,
          'Fetched update for',
          this.device.name,
          'from Honeywell Fan API:',
          JSON.stringify(this.fanMode),
        );
      }
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e) {
      this.platform.log.error(
        'Thermostat - Failed to update status of',
        this.device.name,
        JSON.stringify(e.message),
        this.platform.log.debug('Thermostat %s -', this.accessory.displayName, JSON.stringify(e)),
      );
      this.platform.refreshAccessToken();
      this.apiError(e);
    }
  }

  public async refreshRoomPriority() {
    if (this.platform.config.options?.roompriority?.thermostat && this.device.deviceModel === 'T9-T10') {
      this.roompriority = (
        await this.platform.axios.get(`${DeviceURL}/thermostats/${this.device.deviceID}/priority`, {
          params: {
            locationId: this.locationId,
          },
        })
      ).data;
      this.platform.log.debug(
        'Thermostat %s priority -',
        this.accessory.displayName,
        JSON.stringify(this.roompriority),
      );
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
    this.platform.log.debug('Thermostat %s pushChanges -', this.accessory.displayName, JSON.stringify(payload));

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
   * Pushes the requested changes for Room Priority to the Honeywell API
   */
  async pushRoomChanges() {
    this.platform.log.debug(
      'Thermostat Room Priority %s Current Room: %s, Changing Room: %s',
      this.accessory.displayName,
      JSON.stringify(this.roompriority.currentPriority.selectedRooms),
      `[${this.device.inBuiltSensorState!.roomId}]`,
    );
    if (`[${this.device.inBuiltSensorState!.roomId}]` !== `[${this.roompriority.currentPriority.selectedRooms}]`) {
      const payload = {
        currentPriority: {
          priorityType: this.platform.config.options?.roompriority?.priorityType,
        },
      } as any;

      if (this.platform.config.options?.roompriority?.priorityType === 'PickARoom') {
        payload.currentPriority.selectedRooms = [this.device.inBuiltSensorState!.roomId];
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
            'Sending request for',
            this.accessory.displayName,
            'to Honeywell API. Priority Type:',
            this.platform.config.options.roompriority.priorityType,
            ', Built-in Occupancy Sensor(s) Will be used to set Priority Automatically.',
          );
        } else if (this.platform.config.options.roompriority.priorityType === 'WholeHouse') {
          this.platform.log.info(
            'Sending request for',
            this.accessory.displayName,
            'to Honeywell API. Priority Type:',
            this.platform.config.options.roompriority.priorityType,
          );
        } else if (this.platform.config.options.roompriority.priorityType === 'PickARoom') {
          this.platform.log.info(
            'Sending request for',
            this.accessory.displayName,
            'to Honeywell API. Room Priority:',
            this.device.inBuiltSensorState!.roomName,
            ', Priority Type:',
            this.platform.config.options.roompriority.priorityType,
          );
        }
        this.platform.log.debug('Thermostat %s pushRoomChanges -', this.accessory.displayName, JSON.stringify(payload));

        // Make the API request
        await this.platform.axios.put(`${DeviceURL}/thermostats/${this.device.deviceID}/priority`, payload, {
          params: {
            locationId: this.locationId,
          },
        });
      }
      // Refresh the status from the API
      await this.refreshStatus();
    }
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
    if (
      this.device.indoorHumidity &&
      !this.platform.config.options?.thermostat?.hide_humidity &&
      this.CurrentRelativeHumidity !== undefined
    ) {
      this.humidityService!.updateCharacteristic(
        this.platform.Characteristic.CurrentRelativeHumidity,
        this.CurrentRelativeHumidity!,
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
    if (this.device.settings?.fan && !this.platform.config.options?.thermostat?.hide_fan) {
      if (this.TargetFanState !== undefined) {
        this.fanService?.updateCharacteristic(this.platform.Characteristic.TargetFanState, this.TargetFanState);
      }
      if (this.Active !== undefined) {
        this.fanService?.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
      }
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, e);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    if (this.device.indoorHumidity && !this.platform.config.options?.thermostat?.hide_humidity) {
      this.humidityService!.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, e);
    }
    this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, e);
    this.service.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, e);
    this.service.updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, e);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState, e);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, e);
    if (this.device.settings?.fan && !this.platform.config.options?.thermostat?.hide_fan) {
      this.fanService?.updateCharacteristic(this.platform.Characteristic.TargetFanState, e);
      this.fanService?.updateCharacteristic(this.platform.Characteristic.Active, e);
    }
  }

  private setTargetHeatingCoolingState(value: CharacteristicValue) {
    this.platform.log.debug('Thermostat %s -', this.accessory.displayName, 'Set TargetHeatingCoolingState:', value);

    this.TargetHeatingCoolingState = value;

    // Set the TargetTemperature value based on the selected mode
    if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
      this.TargetTemperature = this.toCelsius(this.device.changeableValues.heatSetpoint);
    } else {
      this.TargetTemperature = this.toCelsius(this.device.changeableValues.coolSetpoint);
    }
    this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.TargetTemperature);
    if (this.platform.config.options?.roompriority?.thermostat && this.device.deviceModel === 'T9-T10') {
      this.doRoomUpdate.next();
    }
    this.platform.log.warn('1');
    this.doThermostatUpdate.next();
  }

  private setHeatingThresholdTemperature(value: CharacteristicValue) {
    this.platform.log.debug('Thermostat %s -', this.accessory.displayName, 'Set HeatingThresholdTemperature:', value);
    this.HeatingThresholdTemperature = value;
    this.platform.log.warn('2');
    this.doThermostatUpdate.next();
  }

  private setCoolingThresholdTemperature(value: CharacteristicValue) {
    this.platform.log.debug('Thermostat %s -', this.accessory.displayName, 'Set CoolingThresholdTemperature:', value);
    this.CoolingThresholdTemperature = value;
    this.platform.log.warn('3');
    this.doThermostatUpdate.next();
  }

  private setTargetTemperature(value: CharacteristicValue) {
    this.platform.log.debug('Thermostat %s -', this.accessory.displayName, 'Set TargetTemperature:', value);
    this.TargetTemperature = value;
    this.platform.log.warn('4');
    this.doThermostatUpdate.next();
  }

  private setTemperatureDisplayUnits(value: CharacteristicValue) {
    this.platform.log.debug('Thermostat %s -', this.accessory.displayName, 'Set TemperatureDisplayUnits:', value);
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

  /**
   * Pushes the requested changes for Fan to the Honeywell API
   */
  async pushFanChanges() {
    let payload = {
      mode: 'Auto', // default to Auto
    };
    if (this.device.settings?.fan && !this.platform.config.options?.thermostat?.hide_fan) {
      this.platform.log.debug(
        'Thermostat %s -',
        this.accessory.displayName,
        'TargetFanState',
        this.TargetFanState,
        'Active',
        this.Active,
      );

      if (this.TargetFanState === this.platform.Characteristic.TargetFanState.AUTO) {
        payload = {
          mode: 'Auto',
        };
      } else if (
        this.TargetFanState === this.platform.Characteristic.TargetFanState.MANUAL &&
        this.Active === this.platform.Characteristic.Active.ACTIVE
      ) {
        payload = {
          mode: 'On',
        };
      } else if (
        this.TargetFanState === this.platform.Characteristic.TargetFanState.MANUAL &&
        this.Active === this.platform.Characteristic.Active.INACTIVE
      ) {
        payload = {
          mode: 'Circulate',
        };
      }

      this.platform.log.info(
        'Sending request for',
        this.accessory.displayName,
        'to Honeywell API. Fan Mode:',
        payload.mode,
      );
      this.platform.log.debug('Thermostat %s Fan Mode -', this.accessory.displayName, JSON.stringify(payload));

      // Make the API request
      await this.platform.axios.post(`${DeviceURL}/thermostats/${this.device.deviceID}/fan`, payload, {
        params: {
          locationId: this.locationId,
        },
      });
    }
    // Refresh the status from the API
    await this.refreshStatus();
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  private setActive(value: CharacteristicValue) {
    this.platform.log.debug('Thermostat %s -', this.accessory.displayName, 'Set Active State:', value);
    this.Active = value;
    this.doFanUpdate.next();
  }

  private setTargetFanState(value: CharacteristicValue) {
    this.platform.log.debug('Thermostat %s -', this.accessory.displayName, 'Set Target Fan State:', value);
    this.TargetFanState = value;
    this.doFanUpdate.next();
  }

  private TargetState() {
    this.platform.log.debug('Thermostat %s -', this.accessory.displayName, this.device.allowedModes);

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
      'Thermostat %s -',
      this.accessory.displayName,
      'Only Show These Modes:',
      JSON.stringify(TargetState),
    );
    return TargetState;
  }
}
