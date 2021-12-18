import { Service, PlatformAccessory, CharacteristicValue, HAPStatus } from 'homebridge';
import { HoneywellHomePlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import { DeviceURL, location, device, FanChangeableValues, devicesConfig, modes, payload } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Thermostats {
  private service!: Service;
  fanService?: Service;
  humidityService?: Service;

  // Thermostat Characteristics
  TargetTemperature!: CharacteristicValue;
  CurrentTemperature!: CharacteristicValue;
  CurrentRelativeHumidity?: CharacteristicValue;
  TemperatureDisplayUnits!: CharacteristicValue;
  TargetHeatingCoolingState!: CharacteristicValue;
  CurrentHeatingCoolingState!: CharacteristicValue;
  CoolingThresholdTemperature!: CharacteristicValue;
  HeatingThresholdTemperature!: CharacteristicValue;

  // Fan Characteristics
  Active!: CharacteristicValue;
  TargetFanState!: CharacteristicValue;

  // Others
  modes: modes;
  action!: string;
  heatSetpoint!: number;
  coolSetpoint!: number;
  thermostatSetpointStatus!: string;
  honeywellMode!: Array<string>;
  fanMode!: FanChangeableValues;

  // Others - T9 Only
  roompriority!: any;

  // Thermostat Updates
  thermostatUpdateInProgress!: boolean;
  doThermostatUpdate!: Subject<void>;

  // Fan Updates
  fanUpdateInProgress!: boolean;
  doFanUpdate!: Subject<void>;

  // Room Updates - T9 Only
  roomUpdateInProgress!: boolean;
  doRoomUpdate!: Subject<void>;

  constructor(
    private readonly platform: HoneywellHomePlatform,
    private accessory: PlatformAccessory,
    public readonly locationId: location['locationID'],
    public device: device & devicesConfig,
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
    if (this.device.thermostat?.thermostatSetpointStatus) {
      this.thermostatSetpointStatus = this.device.thermostat.thermostatSetpointStatus;
      this.platform.device(`Thermostat: ${this.accessory.displayName} thermostatSetpointStatus config set to `
        + `${this.thermostatSetpointStatus},`);
    } else {
      this.thermostatSetpointStatus = 'PermanentHold';
      this.platform.device(`Thermostat: ${this.accessory.displayName} thermostatSetpointStatus config not set`);
    }

    // this is subject we use to track when we need to POST changes to the Honeywell API for Room Changes - T9 Only
    this.doRoomUpdate = new Subject();
    this.roomUpdateInProgress = false;
    // this is subject we use to track when we need to POST changes to the Honeywell API
    this.doThermostatUpdate = new Subject();
    this.thermostatUpdateInProgress = false;
    this.doFanUpdate = new Subject();
    this.fanUpdateInProgress = false;

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Honeywell')
      .setCharacteristic(this.platform.Characteristic.Model, device.deviceModel)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceID)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.firmwareRevision)
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision).updateValue(accessory.context.firmwareRevision);

    //Thermostat Service
    (this.service =
      this.accessory.getService(this.platform.Service.Thermostat) ||
      this.accessory.addService(this.platform.Service.Thermostat)), accessory.displayName;

    //Service Name
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
    //Required Characteristics" see https://developers.homebridge.io/#/service/Thermostat

    //Initial Device Parse
    this.parseStatus();

    // Set Min and Max
    if (device.changeableValues!.heatCoolMode === 'Heat') {
      this.platform.device(`Thermostat: ${accessory.displayName} is in "${device.changeableValues!.heatCoolMode}" mode`);
      this.service
        .getCharacteristic(this.platform.Characteristic.TargetTemperature)
        .setProps({
          minValue: this.toCelsius(device.minHeatSetpoint!),
          maxValue: this.toCelsius(device.maxHeatSetpoint!),
          minStep: 0.1,
        })
        .onGet(() => {
          return this.TargetTemperature!;
        });
    } else {
      this.platform.device(`Thermostat: ${accessory.displayName} is in "${device.changeableValues!.heatCoolMode}" mode`);
      this.service
        .getCharacteristic(this.platform.Characteristic.TargetTemperature)
        .setProps({
          minValue: this.toCelsius(device.minCoolSetpoint!),
          maxValue: this.toCelsius(device.maxCoolSetpoint!),
          minStep: 0.1,
        })
        .onGet(() => {
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
      .onSet(this.setTargetHeatingCoolingState.bind(this));

    this.service.setCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.CurrentHeatingCoolingState);

    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).onSet(this.setHeatingThresholdTemperature.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).onSet(this.setCoolingThresholdTemperature.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature).onSet(this.setTargetTemperature.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onSet(this.setTemperatureDisplayUnits.bind(this));

    // Fan Controls
    if (device.thermostat?.hide_fan) {
      this.platform.device(`Thermostat: ${accessory.displayName} Removing Fanv2 Service`);
      this.fanService = this.accessory.getService(this.platform.Service.Fanv2);
      accessory.removeService(this.fanService!);
    } else if (!this.fanService && device.settings?.fan) {
      this.platform.device(`Thermostat: ${accessory.displayName} Add Fanv2 Service`);
      this.platform.device(`Thermostat: ${accessory.displayName} Available Fan Settings ${JSON.stringify(device.settings.fan)}`);
      (this.fanService =
        this.accessory.getService(this.platform.Service.Fanv2) ||
        this.accessory.addService(this.platform.Service.Fanv2)), `${accessory.displayName} Fan`;

      this.fanService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Fan`);

      this.fanService
        .getCharacteristic(this.platform.Characteristic.Active)
        .onSet(this.setActive.bind(this));

      this.fanService
        .getCharacteristic(this.platform.Characteristic.TargetFanState)
        .onSet(this.setTargetFanState.bind(this));
    } else {
      this.platform.device(`Thermostat: ${accessory.displayName} Fanv2 Service Not Added`);
    }

    // Humidity Sensor Service
    if (device.thermostat?.hide_humidity) {
      this.platform.device(`Thermostat: ${accessory.displayName} Removing Humidity Sensor Service`);
      this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor);
      accessory.removeService(this.humidityService!);
    } else if (!this.humidityService && device.indoorHumidity) {
      this.platform.device(`Thermostat: ${accessory.displayName} Add Humidity Sensor Service`);
      (this.humidityService =
        this.accessory.getService(this.platform.Service.HumiditySensor) ||
        this.accessory.addService(this.platform.Service.HumiditySensor)), `${device.name} Humidity Sensor`;

      this.humidityService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Humidity Sensor`);

      this.humidityService
        .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .setProps({
          minStep: 0.1,
        })
        .onGet(() => {
          return this.CurrentRelativeHumidity!;
        });
    } else {
      this.platform.device(`Thermostat: ${accessory.displayName} Humidity Sensor Service Not Added`);
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
    if (device.thermostat?.roompriority?.deviceType === 'Thermostat' && device.deviceModel === 'T9-T10') {
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
          } catch (e: any) {
            this.action = 'refreshRoomPriority';
            this.honeywellAPIError(e);
            this.platform.refreshAccessToken();
            this.apiError();
          }
          try {
            await this.pushRoomChanges();
          } catch (e: any) {
            this.action = 'pushRoomChanges';
            this.honeywellAPIError(e);
            this.platform.refreshAccessToken();
            this.apiError();
          }
          this.roomUpdateInProgress = false;
          // Refresh the status from the API
          interval(5000)
            .pipe(skipWhile(() => this.thermostatUpdateInProgress))
            .pipe(take(1))
            .subscribe(() => {
              this.refreshStatus();
            });
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
        } catch (e: any) {
          this.action = 'pushChanges';
          this.honeywellAPIError(e);
          this.platform.refreshAccessToken();
          this.apiError();
        }
        this.thermostatUpdateInProgress = false;
        // Refresh the status from the API
        interval(15000)
          .pipe(skipWhile(() => this.thermostatUpdateInProgress))
          .pipe(take(1))
          .subscribe(() => {
            this.refreshStatus();
          });
      });
    if (device.settings?.fan && !device.thermostat?.hide_fan) {
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
          } catch (e: any) {
            this.action = 'pushFanChanges';
            this.honeywellAPIError(e);
            this.platform.refreshAccessToken();
            this.apiError();
          }
          this.fanUpdateInProgress = false;
          // Refresh the status from the API
          interval(5000)
            .pipe(skipWhile(() => this.thermostatUpdateInProgress))
            .pipe(take(1))
            .subscribe(() => {
              this.refreshStatus();
            });
        });
    }
  }

  /**
   * Parse the device status from the honeywell api
   */
  parseStatus() {
    this.platform.device(`Thermostat: ${this.accessory.displayName} parseStatus`);
    if (this.device.units === 'Fahrenheit') {
      this.TemperatureDisplayUnits = this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT;
      this.platform.device(`Thermostat: ${this.accessory.displayName} parseStatus`
        + ` TemperatureDisplayUnits: ${this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT}`);
    }
    if (this.device.units === 'Celsius') {
      this.TemperatureDisplayUnits = this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;
      this.platform.device(`Thermostat: ${this.accessory.displayName} parseStatus`
        + ` TemperatureDisplayUnits: ${this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS}`);
    }

    this.CurrentTemperature = this.toCelsius(this.device.indoorTemperature!);
    this.platform.device(`Thermostat: ${this.accessory.displayName} parseStatus`
      + ` CurrentTemperature: ${this.toCelsius(this.device.indoorTemperature!)}`);

    if (this.device.indoorHumidity) {
      this.CurrentRelativeHumidity = this.device.indoorHumidity;
      this.platform.device(`Thermostat: ${this.accessory.displayName} parseStatus`
        + ` CurrentRelativeHumidity: ${this.device.indoorHumidity}`);
    }

    if (this.device.changeableValues!.heatSetpoint > 0) {
      this.HeatingThresholdTemperature = this.toCelsius(this.device.changeableValues!.heatSetpoint);
      this.platform.device(`Thermostat: ${this.accessory.displayName} parseStatus`
        + ` HeatingThresholdTemperature: ${this.toCelsius(this.device.changeableValues!.heatSetpoint)}`);
    }

    if (this.device.changeableValues!.coolSetpoint > 0) {
      this.CoolingThresholdTemperature = this.toCelsius(this.device.changeableValues!.coolSetpoint);
      this.platform.device(`Thermostat: ${this.accessory.displayName} parseStatus`
        + ` CoolingThresholdTemperature: ${this.toCelsius(this.device.changeableValues!.coolSetpoint)}`);
    }

    this.TargetHeatingCoolingState = this.modes[this.device.changeableValues!.mode];
    this.platform.device(`Thermostat: ${this.accessory.displayName} parseStatus`
      + ` TargetHeatingCoolingState: ${this.modes[this.device.changeableValues!.mode]}`);

    /**
     * The CurrentHeatingCoolingState is either 'Heat', 'Cool', or 'Off'
     * CurrentHeatingCoolingState =  OFF = 0, HEAT = 1, COOL = 2
     */
    switch (this.device.operationStatus!.mode) {
      case 'Heat':
        this.CurrentHeatingCoolingState = 1;
        this.platform.device(`Thermostat: ${this.accessory.displayName}`
          + ` parseStatus Currently Mode (HEAT): ${this.device.operationStatus!.mode}(${this.CurrentHeatingCoolingState})`);
        break;
      case 'Cool':
        this.CurrentHeatingCoolingState = 2;
        this.platform.device(`Thermostat: ${this.accessory.displayName}`
          + ` parseStatus Currently Mode (COOL): ${this.device.operationStatus!.mode}(${this.CurrentHeatingCoolingState})`);
        break;
      default:
        this.CurrentHeatingCoolingState = 0;
        this.platform.device(`Thermostat: ${this.accessory.displayName}`
          + ` parseStatus Currently Mode (OFF): ${this.device.operationStatus!.mode}(${this.CurrentHeatingCoolingState})`);
    }

    // Set the TargetTemperature value based on the current mode
    if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
      if (this.device.changeableValues!.heatSetpoint > 0) {
        this.TargetTemperature = this.toCelsius(this.device.changeableValues!.heatSetpoint);
        this.platform.device(`Thermostat: ${this.accessory.displayName}`
          + ` parseStatus TargetTemperature (HEAT): ${this.toCelsius(this.device.changeableValues!.heatSetpoint)})`);
      }
    } else {
      if (this.device.changeableValues!.coolSetpoint > 0) {
        this.TargetTemperature = this.toCelsius(this.device.changeableValues!.coolSetpoint);
        this.platform.device(`Thermostat: ${this.accessory.displayName}`
          + ` parseStatus TargetTemperature (OFF/COOL): ${this.toCelsius(this.device.changeableValues!.coolSetpoint)})`);
      }
    }

    // Set the Target Fan State
    if (this.device.settings?.fan && !this.device.thermostat?.hide_fan) {
      if (this.fanMode) {
        this.platform.device(`Thermostat: ${this.accessory.displayName} Fan: ${JSON.stringify(this.fanMode)}`);
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
      const device: any = (await this.platform.axios.get(`${DeviceURL}/thermostats/${this.device.deviceID}`, {
        params: {
          locationId: this.locationId,
        },
      })).data;
      this.device = device;
      this.platform.device(`Thermostat: ${this.accessory.displayName} device: ${JSON.stringify(this.device)}`);
      this.platform.device(`Thermostat: ${this.accessory.displayName} Fetched update for ${this.device.name}
       from Honeywell API: ${JSON.stringify(this.device.changeableValues)}`);
      await this.refreshRoomPriority();
      if (this.device.settings?.fan && !device.thermostat?.hide_fan) {
        const fanMode: any = (await this.platform.axios.get(`${DeviceURL}/thermostats/${this.device.deviceID}/fan`, {
          params: {
            locationId: this.locationId,
          },
        })).data;
        this.fanMode = fanMode;
        this.platform.device(`Thermostat: ${this.accessory.displayName} fanMode: ${JSON.stringify(this.fanMode)}`);
        this.platform.device(`Thermostat: ${this.accessory.displayName} Fan Fetched update for ${this.device.name}
        from Honeywell Fan API: ${JSON.stringify(this.fanMode)}`);
      }
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.action = 'refreshStatus';
      this.honeywellAPIError(e);
      this.apiError();
    }
  }

  public async refreshRoomPriority() {
    if (this.device.thermostat?.roompriority?.deviceType === 'Thermostat' && this.device.deviceModel === 'T9-T10') {
      this.roompriority = (
        await this.platform.axios.get(`${DeviceURL}/thermostats/${this.device.deviceID}/priority`, {
          params: {
            locationId: this.locationId,
          },
        })
      ).data;
      this.platform.device(`Thermostat: ${this.accessory.displayName} Priority: ${JSON.stringify(this.roompriority.data)}`);
    }
  }

  /**
   * Pushes the requested changes to the Honeywell API
   */
  async pushChanges() {
    try {
      const payload = {} as payload;

      // Only include mode on certain models
      switch (this.device.deviceModel) {
        case 'Unknown':
          this.platform.device(`Thermostat: ${this.accessory.displayName} didn't send TargetHeatingCoolingState,`
            + ` Model:  ${this.device.deviceModel}`);
          break;
        default:
          payload.mode = this.honeywellMode[Number(this.TargetHeatingCoolingState)];
          this.platform.device(`Thermostat: ${this.accessory.displayName} send TargetHeatingCoolingState`
            + ` mode: ${this.honeywellMode[Number(this.TargetHeatingCoolingState)]}`);
      }

      // Only include thermostatSetpointStatus on certain models
      switch (this.device.deviceModel) {
        case 'Round':
          this.platform.device(`Thermostat: ${this.accessory.displayName} didn't send thermostatSetpointStatus,`
            + ` Model: ${this.device.deviceModel}`);
          break;
        default:
          payload.thermostatSetpointStatus = this.thermostatSetpointStatus;
          this.platform.device(`Thermostat: ${this.accessory.displayName} send thermostatSetpointStatus: `
            + `${payload.thermostatSetpointStatus}, Model: ${this.device.deviceModel}`);
      }

      switch (this.device.deviceModel) {
        case 'Round':
        case 'D6':
          if (this.platform.config.options?.debug) {
            this.platform.log.warn(`Thermostat: ${this.accessory.displayName} set autoChangeoverActive, Model: ${this.device.deviceModel}`);
          }
          // for Round  the 'Auto' feature is enabled via the special mode so only flip this bit when
          // the heating/cooling state is set to  `Auto
          if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.AUTO) {
            payload.autoChangeoverActive = true;
            this.platform.device(`Thermostat: ${this.accessory.displayName} Heating/Cooling state set to Auto for`
              + ` Model: ${this.device.deviceModel}, Force autoChangeoverActive: ${payload.autoChangeoverActive}`);
          } else {
            payload.autoChangeoverActive = this.device.changeableValues?.autoChangeoverActive;
            this.platform.device(`Thermostat: ${this.accessory.displayName} Heating/cooling state not set to Auto for`
              + ` Model: ${this.device.deviceModel}, Using device setting`
              + ` autoChangeoverActive: ${this.device.changeableValues!.autoChangeoverActive}`);
          }
          break;
        case 'Unknown':
          this.platform.device(`Thermostat: ${this.accessory.displayName} do not send autoChangeoverActive,`
            + ` Model: ${this.device.deviceModel}`);
          break;
        default:
          payload.autoChangeoverActive = this.device.changeableValues!.autoChangeoverActive;
          this.platform.device(`Thermostat: ${this.accessory.displayName} set autoChangeoverActive to `
            + `${this.device.changeableValues!.autoChangeoverActive} for Model: ${this.device.deviceModel}`);
      }

      switch (this.device.deviceModel) {
        case 'Unknown':
          this.platform.log.error(JSON.stringify(this.device));
          payload.thermostatSetpoint = this.toFahrenheit(Number(this.TargetTemperature));
          switch (this.device.units) {
            case 'Fahrenheit':
              payload.unit = 'Fahrenheit';
              break;
            case 'Celsius':
              payload.unit = 'Celsius';
              break;
          }
          this.platform.log.info(`Thermostat: ${this.accessory.displayName} sent request to Honeywell API thermostatSetpoint:`
            + ` ${payload.thermostatSetpoint}, unit: ${payload.unit}, thermostatSetpointStatus: ${payload.thermostatSetpointStatus}`);

          break;
        default:
          // Set the heat and cool set point value based on the selected mode
          switch (this.TargetHeatingCoolingState) {
            case this.platform.Characteristic.TargetHeatingCoolingState.HEAT:
              payload.heatSetpoint = this.toFahrenheit(Number(this.TargetTemperature));
              payload.coolSetpoint = this.toFahrenheit(Number(this.CoolingThresholdTemperature));
              this.platform.device(`Thermostat: ${this.accessory.displayName} TargetHeatingCoolingState (HEAT): ${this.TargetHeatingCoolingState},`
                + ` TargetTemperature: ${this.toFahrenheit(Number(this.TargetTemperature))} heatSetpoint,`
                + ` CoolingThresholdTemperature: ${this.toFahrenheit(Number(this.CoolingThresholdTemperature))} coolSetpoint`);
              break;
            case this.platform.Characteristic.TargetHeatingCoolingState.COOL:
              payload.coolSetpoint = this.toFahrenheit(Number(this.TargetTemperature));
              payload.heatSetpoint = this.toFahrenheit(Number(this.HeatingThresholdTemperature));
              this.platform.device(`Thermostat: ${this.accessory.displayName} TargetHeatingCoolingState (COOL): ${this.TargetHeatingCoolingState},`
                + ` TargetTemperature: ${this.toFahrenheit(Number(this.TargetTemperature))} coolSetpoint,`
                + ` CoolingThresholdTemperature: ${this.toFahrenheit(Number(this.HeatingThresholdTemperature))} heatSetpoint`);
              break;
            case this.platform.Characteristic.TargetHeatingCoolingState.AUTO:
              payload.coolSetpoint = this.toFahrenheit(Number(this.CoolingThresholdTemperature));
              payload.heatSetpoint = this.toFahrenheit(Number(this.HeatingThresholdTemperature));
              this.platform.device(`Thermostat: ${this.accessory.displayName} TargetHeatingCoolingState (AUTO): ${this.TargetHeatingCoolingState},`
                + ` CoolingThresholdTemperature: ${this.toFahrenheit(Number(this.CoolingThresholdTemperature))} coolSetpoint,`
                + ` HeatingThresholdTemperature: ${this.toFahrenheit(Number(this.HeatingThresholdTemperature))} heatSetpoint`);
              break;
            default:
              payload.coolSetpoint = this.toFahrenheit(Number(this.CoolingThresholdTemperature));
              payload.heatSetpoint = this.toFahrenheit(Number(this.HeatingThresholdTemperature));
              this.platform.device(`Thermostat: ${this.accessory.displayName} TargetHeatingCoolingState (OFF): ${this.TargetHeatingCoolingState},`
                + ` CoolingThresholdTemperature: ${this.toFahrenheit(Number(this.CoolingThresholdTemperature))} coolSetpoint,`
                + ` HeatingThresholdTemperature: ${this.toFahrenheit(Number(this.HeatingThresholdTemperature))} heatSetpoint`);
          }
          this.platform.log.info(`Room Sensor Thermostat: ${this.accessory.displayName} set request (${JSON.stringify(payload)}) to Honeywell API.`);
      }

      // Attempt to make the API request
      await this.platform.axios.post(`${DeviceURL}/thermostats/${this.device.deviceID}`, payload, {
        params: {
          locationId: this.locationId,
        },
      });
      this.platform.device(`Thermostat: ${this.accessory.displayName} pushChanges: ${JSON.stringify(payload)}`);
    } catch (e: any) {
      this.action = 'pushChanges';
      this.honeywellAPIError(e);
      this.apiError();
    }
  }

  /**
   * Pushes the requested changes for Room Priority to the Honeywell API
   */
  async pushRoomChanges() {
    this.platform.device(`Thermostat Room Priority for ${this.accessory.displayName}
     Current Room: ${JSON.stringify(this.roompriority.currentPriority.selectedRooms)},
     Changing Room: [${this.device.inBuiltSensorState!.roomId}]`);
    if (`[${this.device.inBuiltSensorState!.roomId}]` !== `[${this.roompriority.currentPriority.selectedRooms}]`) {
      const payload = {
        currentPriority: {
          priorityType: this.device.thermostat?.roompriority?.priorityType,
        },
      } as any;

      if (this.device.thermostat?.roompriority?.priorityType === 'PickARoom') {
        payload.currentPriority.selectedRooms = [this.device.inBuiltSensorState!.roomId];
      }

      /**
       * For "LCC-" devices only.
       * "NoHold" will return to schedule.
       * "TemporaryHold" will hold the set temperature until "nextPeriodTime".
       * "PermanentHold" will hold the setpoint until user requests another change.
       */
      if (this.device.thermostat?.roompriority?.deviceType === 'Thermostat') {
        if (this.device.priorityType === 'FollowMe') {
          this.platform.log.info(`Sending request for ${this.accessory.displayName} to Honeywell API Priority Type:`
            + ` ${this.device.priorityType}, Built-in Occupancy Sensor(s) Will be used to set Priority Automatically`);
        } else if (this.device.priorityType === 'WholeHouse') {
          this.platform.log.info(`Sending request for ${this.accessory.displayName} to Honeywell API Priority Type:`
            + ` ${this.device.priorityType}`);
        } else if (this.device.priorityType === 'PickARoom') {
          this.platform.log.info(`Sending request for ${this.accessory.displayName} to Honeywell API Room Priority:`
            + ` ${this.device.inBuiltSensorState!.roomName}, Priority Type: ${this.device.thermostat?.roompriority.priorityType}`);
        }
        // Make the API request
        await this.platform.axios.put(`${DeviceURL}/thermostats/${this.device.deviceID}/priority`, payload, {
          params: {
            locationId: this.locationId,
          },
        });
        this.platform.device(`Thermostat: ${this.accessory.displayName} pushRoomChanges: ${JSON.stringify(payload)}`);
      }
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (this.TemperatureDisplayUnits === undefined) {
      this.platform.debug(`Thermostat: ${this.accessory.displayName} TemperatureDisplayUnits: ${this.TemperatureDisplayUnits}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, this.TemperatureDisplayUnits);
      this.platform.device(`Thermostat: ${this.accessory.displayName} updateCharacteristic TemperatureDisplayUnits: ${this.TemperatureDisplayUnits}`);
    }
    if (this.CurrentTemperature === undefined) {
      this.platform.debug(`Thermostat: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
      this.platform.device(`Thermostat: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
    }
    if (!this.device.indoorHumidity || this.device.thermostat?.hide_humidity ||
      this.CurrentRelativeHumidity === undefined) {
      this.platform.debug(`Thermostat: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    } else {
      this.humidityService!.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
      this.platform.device(`Thermostat: ${this.accessory.displayName} updateCharacteristic CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    }
    if (this.TargetTemperature === undefined) {
      this.platform.debug(`Thermostat: ${this.accessory.displayName} TargetTemperature: ${this.TargetTemperature}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.TargetTemperature);
      this.platform.device(`Thermostat: ${this.accessory.displayName} updateCharacteristic TargetTemperature: ${this.TargetTemperature}`);
    }
    if (this.HeatingThresholdTemperature === undefined) {
      this.platform.debug(`Thermostat: ${this.accessory.displayName} HeatingThresholdTemperature: ${this.HeatingThresholdTemperature}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, this.HeatingThresholdTemperature);
      this.platform.device(`Thermostat: ${this.accessory.displayName} updateCharacteristic`
        + ` HeatingThresholdTemperature: ${this.HeatingThresholdTemperature}`);
    }
    if (this.CoolingThresholdTemperature === undefined) {
      this.platform.debug(`Thermostat: ${this.accessory.displayName} CoolingThresholdTemperature: ${this.CoolingThresholdTemperature}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, this.CoolingThresholdTemperature);
      this.platform.device(`Thermostat: ${this.accessory.displayName} updateCharacteristic`
        + ` CoolingThresholdTemperature: ${this.CoolingThresholdTemperature}`);
    }
    if (this.TargetHeatingCoolingState === undefined) {
      this.platform.debug(`Thermostat: ${this.accessory.displayName} TargetHeatingCoolingState: ${this.TargetHeatingCoolingState}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState, this.TargetHeatingCoolingState);
      this.platform.device(`Thermostat: ${this.accessory.displayName} updateCharacteristic`
        + ` TargetHeatingCoolingState: ${this.TargetHeatingCoolingState}`);
    }
    if (this.CurrentHeatingCoolingState === undefined) {
      this.platform.debug(`Thermostat: ${this.accessory.displayName} CurrentHeatingCoolingState: ${this.CurrentHeatingCoolingState}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.CurrentHeatingCoolingState);
      this.platform.device(`Thermostat: ${this.accessory.displayName} updateCharacteristic`
        + ` CurrentHeatingCoolingState: ${this.TargetHeatingCoolingState}`);
    }
    if (this.device.settings?.fan && !this.device.thermostat?.hide_fan) {
      if (this.TargetFanState === undefined) {
        this.platform.debug(`Thermostat Fan: ${this.accessory.displayName} TargetFanState: ${this.TargetFanState}`);
      } else {
        this.fanService?.updateCharacteristic(this.platform.Characteristic.TargetFanState, this.TargetFanState);
        this.platform.device(`Thermostat Fan: ${this.accessory.displayName} updateCharacteristic TargetFanState: ${this.TargetFanState}`);
      }
      if (this.Active === undefined) {
        this.platform.debug(`Thermostat Fan: ${this.accessory.displayName} Active: ${this.Active}`);
      } else {
        this.fanService?.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
        this.platform.device(`Thermostat Fan: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
      }
    }
  }

  public apiError() {
    throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  public honeywellAPIError(e: any) {
    if (e.message.includes('400')) {
      this.platform.log.error(`Thermostat: ${this.accessory.displayName} failed to ${this.action}, Bad Request`);
      this.platform.debug('The client has issued an invalid request. This is commonly used to specify validation errors in a request payload.');
    } else if (e.message.includes('401')) {
      this.platform.log.error(`Thermostat: ${this.accessory.displayName} failed to ${this.action}, Unauthorized Request`);
      this.platform.debug('Authorization for the API is required, but the request has not been authenticated.');
    } else if (e.message.includes('403')) {
      this.platform.log.error(`Thermostat: ${this.accessory.displayName} failed to ${this.action}, Forbidden Request`);
      this.platform.debug('The request has been authenticated but does not have appropriate permissions, or a requested resource is not found.');
    } else if (e.message.includes('404')) {
      this.platform.log.error(`Thermostat: ${this.accessory.displayName} failed to ${this.action}, Requst Not Found`);
      this.platform.debug('Specifies the requested path does not exist.');
    } else if (e.message.includes('406')) {
      this.platform.log.error(`Thermostat: ${this.accessory.displayName} failed to ${this.action}, Request Not Acceptable`);
      this.platform.debug('The client has requested a MIME type via the Accept header for a value not supported by the server.');
    } else if (e.message.includes('415')) {
      this.platform.log.error(`Thermostat: ${this.accessory.displayName} failed to ${this.action}, Unsupported Requst Header`);
      this.platform.debug('The client has defined a contentType header that is not supported by the server.');
    } else if (e.message.includes('422')) {
      this.platform.log.error(`Thermostat: ${this.accessory.displayName} failed to ${this.action}, Unprocessable Entity`);
      this.platform.debug('The client has made a valid request, but the server cannot process it.'
        + ' This is often used for APIs for which certain limits have been exceeded.');
    } else if (e.message.includes('429')) {
      this.platform.log.error(`Thermostat: ${this.accessory.displayName} failed to ${this.action}, Too Many Requests`);
      this.platform.debug('The client has exceeded the number of requests allowed for a given time window.');
    } else if (e.message.includes('500')) {
      this.platform.log.error(`Thermostat: ${this.accessory.displayName} failed to ${this.action}, Internal Server Error`);
      this.platform.debug('An unexpected error on the SmartThings servers has occurred. These errors should be rare.');
    } else {
      this.platform.log.error(`Thermostat: ${this.accessory.displayName} failed to ${this.action},`);
    }
    if (this.platform.config.options?.debug === 'device') {
      this.platform.log.error(`Thermostat: ${this.accessory.displayName} failed to pushChanges, Error Message: ${JSON.stringify(e.message)}`);
    }
    if (this.platform.config.options?.debug === 'debug' || this.platform.debugMode) {
      this.platform.log.error(`Thermostat: ${this.accessory.displayName} Error: ${JSON.stringify(e)}`);
    }
  }

  private setTargetHeatingCoolingState(value: CharacteristicValue) {
    this.platform.device(`Thermostat: ${this.accessory.displayName} Set TargetHeatingCoolingState: ${value}`);

    this.TargetHeatingCoolingState = value;

    // Set the TargetTemperature value based on the selected mode
    if (this.TargetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
      this.TargetTemperature = this.toCelsius(this.device.changeableValues!.heatSetpoint);
    } else {
      this.TargetTemperature = this.toCelsius(this.device.changeableValues!.coolSetpoint);
    }
    this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.TargetTemperature);
    if (this.device.thermostat?.roompriority?.deviceType === 'Thermostat' && this.device.deviceModel === 'T9-T10') {
      this.doRoomUpdate.next();
    }
    if (this.TargetHeatingCoolingState !== this.modes[this.device.changeableValues!.mode]) {
      this.doThermostatUpdate.next();
    }
  }

  private setHeatingThresholdTemperature(value: CharacteristicValue) {
    this.platform.device(`Thermostat: ${this.accessory.displayName} Set HeatingThresholdTemperature: ${value}`);
    this.HeatingThresholdTemperature = value;
    this.doThermostatUpdate.next();
  }

  private setCoolingThresholdTemperature(value: CharacteristicValue) {
    this.platform.device(`Thermostat: ${this.accessory.displayName} Set CoolingThresholdTemperature: ${value}`);
    this.CoolingThresholdTemperature = value;
    this.doThermostatUpdate.next();
  }

  private setTargetTemperature(value: CharacteristicValue) {
    this.platform.device(`Thermostat: ${this.accessory.displayName} Set TargetTemperature: ${value}`);
    this.TargetTemperature = value;
    this.doThermostatUpdate.next();
  }

  private setTemperatureDisplayUnits(value: CharacteristicValue) {
    this.platform.device(`Thermostat: ${this.accessory.displayName} Set TemperatureDisplayUnits: ${value}`);
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
    if (this.device.settings?.fan && !this.device.thermostat?.hide_fan) {
      this.platform.device(`Thermostat: ${this.accessory.displayName} TargetFanState: ${this.TargetFanState}, Active: ${this.Active}`);

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

      this.platform.log.info(`Sending request for ${this.accessory.displayName} to Honeywell API Fan Mode: ${payload.mode}`);
      // Make the API request
      await this.platform.axios.post(`${DeviceURL}/thermostats/${this.device.deviceID}/fan`, payload, {
        params: {
          locationId: this.locationId,
        },
      });
      this.platform.device(`Thermostat: ${this.accessory.displayName} pushChanges: ${JSON.stringify(payload)}`);
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  private setActive(value: CharacteristicValue) {
    this.platform.device(`Thermostat: ${this.accessory.displayName} Set Active: ${value}`);
    this.Active = value;
    this.doFanUpdate.next();
  }

  private setTargetFanState(value: CharacteristicValue) {
    this.platform.device(`Thermostat: ${this.accessory.displayName} Set TargetFanState: ${value}`);
    this.TargetFanState = value;
    this.doFanUpdate.next();
  }

  private TargetState() {
    this.platform.device(`Thermostat: ${this.accessory.displayName} allowedModes: ${this.device.allowedModes}`);

    const TargetState = [4];
    TargetState.pop();
    if (this.device.allowedModes?.includes('Cool')) {
      TargetState.push(this.platform.Characteristic.TargetHeatingCoolingState.COOL);
    }
    if (this.device.allowedModes?.includes('Heat')) {
      TargetState.push(this.platform.Characteristic.TargetHeatingCoolingState.HEAT);
    }
    if (this.device.allowedModes?.includes('Off')) {
      TargetState.push(this.platform.Characteristic.TargetHeatingCoolingState.OFF);
    }
    if (this.device.allowedModes?.includes('Auto')) {
      TargetState.push(this.platform.Characteristic.TargetHeatingCoolingState.AUTO);
    }
    this.platform.device(`Thermostat: ${this.accessory.displayName} Only Show These Modes: ${JSON.stringify(TargetState)}`);
    return TargetState;
  }
}
