module.exports = (api) => {
    api.registerAccessory('homebridge-honeywell-home', HoneywellHomePlatformRoomSensor);
  };
  
  /**
   * An instance of this class is created for each room sensor discovered
   */
  class HoneywellHomePlatformRoomSensor {
    constructor(log, platform, accessory, device, locationId, api) {
      this.log = log;
      this.platform = platform;
      this.accessory = accessory;
      this.device = device;
      this.locationId = locationId;
      this.api = api;
  
      // default placeholders
      this.CurrentTemperature;
      this.TemperatureStatusLowBattery;
      this.TemperatureActive;
      this.OccupancyDetected
      this.OccupancyActive;
      this.HumidityActive;
      this.CurrentRelativeHumidity;
  
      // this is subject we use to track when we need to POST changes to the Honeywell API
      this.doThermostatUpdate = new Subject();
      this.thermostatUpdateInProgress = false;
      this.doFanUpdate = new Subject();
      this.fanUpdateInProgress = false;
  
      // setup or get the base service
      this.service = accessory.getService(Service.TemperatureSensor) ?
        accessory.getService(Service.TemperatureSensor) : accessory.addService(Service.TemperatureSensor, this.device.name);
  
      // Temperature Sensor Accessory Information
      this.accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Name, device.name)
        .setCharacteristic(Characteristic.Manufacturer, 'Honeywell')
        .setCharacteristic(Characteristic.Model, device.deviceModel)
        .setCharacteristic(Characteristic.SerialNumber, device.deviceID)
        .setCharacteristic(Characteristic.FirmwareRevision, device.softwareRevision);
  
        // Set Name
        this.service.setCharacteristic(Characteristic.Name, this.device.name);
  
        // Do initial device parse
        this.parseStatus();
  
        // Set Active
        this.service.getCharacteristic(Characteristic.Active)
          .on('get', this.handleTemperatureActiveGet.bind(this));
  
        // Set Low Battery
        this.service.getCharacteristic(Characteristic.StatusLowBattery)
          .on('get', this.handeTemperatureStatusLowBatteryGet.bind(this));
  
        // Set Current Temperature
        this.service.getCharacteristic(Characteristic.CurrentTemperature)
          .on('get', this.handleCurrentTemperatureGet.bind(this));
  
      // Occupancy Sensor
      this.occupancyService = accessory.getService(Service.OccupancySensor) ?
        accessory.getService(Service.OccupancySensor) : accessory.addService(Service.OccupancySensor, `${this.device.name} Fan`);
  
        // Set Occupancy Sensor Active
        this.occupancyService
          .getCharacteristic(Characteristic.Active)
          .on('get', this.handleOccupancyActiveGet.bind(this));
  
        // Set Occupancy Sensor  
        this.occupancyService
          .getCharacteristic(Characteristic.OccupancyDetected)
          .on('get', this.handleOccupancyDetectedGet.bind(this));
  
      // Humidity Sensor
      this.humidityService = accessory.getService(Service.HumiditySensor) ?
        accessory.getService(Service.HumiditySensor) : accessory.addService(Service.HumiditySensor, `${this.device.name} Fan`);
  
        // Set Humidity Sensor Active
        this.humidityService
          .getCharacteristic(Characteristic.Active)
          .on('get', this.handleHumidityActiveGet.bind(this));
  
        // Set Humidity Sensor Current Relative Humidity
        this.humidityService
          .getCharacteristic(Characteristic.CurrentRelativeHumidity)
          .on('get', this.handleCurrentRelativeHumidityGet.bind(this));

      // Motion Sensor
      this.motionService = accessory.getService(Service.HumiditySensor) ?
        accessory.getService(Service.HumiditySensor) : accessory.addService(Service.HumiditySensor, `${this.device.name} Fan`);
  
        // Set Motion Sensor Active
        this.motionService
          .getCharacteristic(Characteristic.StatusActive)
          .on('get', this.handleMotionStatusActiveGet.bind(this));
  
        // Set Motion Sensor Detected
        this.motionService
          .getCharacteristic(Characteristic.MotionDetected)
          .on('get', this.handleMotionDetectedGet.bind(this));    
 
        // ---------------------------------------------------------------------------          
          
        // Retrieve initial values and updateHomekit
        this.refreshSensorStatus();

        // Start an update interval
        interval(this.platform.config.options.ttl * 1000).pipe(skipWhile(() => this.thermostatUpdateInProgress)).subscribe(() => {
          this.refreshSensorStatus();
        })

        // Watch for thermostat change events
        // We put in a debounce of 100ms so we don't make duplicate calls
        this.doThermostatUpdate.pipe(tap(() => {this.thermostatUpdateInProgress = true}), debounceTime(100)).subscribe(async () => {
          await this.pushChanges();
          this.thermostatUpdateInProgress = false;
        })

        this.doFanUpdate.pipe(tap(() => {this.fanUpdateInProgress = true}), debounceTime(100)).subscribe(async () => {
          await this.pushFanChanges();
          this.fanUpdateInProgress = false;
        })
        }

        /**
        * Parse the device status from the honeywell api
        */
        parseStatus() {
        this.TemperatureDisplayUnits = this.device.units === 'Fahrenheit' ? Characteristic.TemperatureDisplayUnits.FAHRENHEIT : Characteristic.TemperatureDisplayUnits.CELSIUS;
        this.TemperatureDisplayUnits = this.device.units === 'Fahrenheit' ? Characteristic.TemperatureDisplayUnits.FAHRENHEIT : Characteristic.TemperatureDisplayUnits.CELSIUS;

        this.CurrentTemperature = this.toCelsius(this.device.indoorTemperature);
        this.CurrentRelativeHumidity = this.device.indoorHumidity;

        if (this.device.changeableValues.heatSetpoint > 0) {
          this.HeatingThresholdTemperature = this.toCelsius(this.device.changeableValues.heatSetpoint);
        }

        if (this.device.changeableValues.coolSetpoint > 0) {
          this.CoolingThresholdTemperature = this.toCelsius(this.device.changeableValues.coolSetpoint);
        }

        this.TargetHeatingCoolingState = this.modes[this.device.changeableValues.mode];

        // If auto the CurrentHeatingCoolingState is either 'Heat' or 'Cool'
        if (this.device.changeableValues.mode === 'Auto') {
          this.CurrentHeatingCoolingState = this.modes[this.device.changeableValues.heatCoolMode];
        } else {
          this.CurrentHeatingCoolingState = this.modes[this.device.changeableValues.mode];
        }

        // Set the TargetTemperature value based on the current mode
        if (this.TargetHeatingCoolingState === Characteristic.TargetHeatingCoolingState.HEAT) {
          if (this.device.changeableValues.heatSetpoint > 0) {
            this.TargetTemperature = this.toCelsius(this.device.changeableValues.heatSetpoint);
          }
        } else {
          if (this.device.changeableValues.coolSetpoint > 0) {
            this.TargetTemperature = this.toCelsius(this.device.changeableValues.coolSetpoint);
          }
        }

        // Set the Target Fan State

        if (this.deviceFan) {
          this.platform.debug(`${JSON.stringify(this.deviceFan)}`);

          if (this.deviceFan.mode === 'Auto') {
            this.TargetFanState = Characteristic.TargetFanState.AUTO;
            this.Active = Characteristic.Active.INACTIVE;
          } else if (this.deviceFan.mode === 'On') {
            this.TargetFanState = Characteristic.TargetFanState.MANUAL;
            this.Active = Characteristic.Active.ACTIVE;
          } else if (this.deviceFan.mode === 'Circulate') {
            this.TargetFanState = Characteristic.TargetFanState.MANUAL;
            this.Active = Characteristic.Active.INACTIVE;
          }
        }
        }

        /**
        * Asks the Honeywell Home API for the latest device information
        */
        async refreshSensorStatus() {
        try {
          const device = await this.platform.rp.get(`https://api.honeywell.com/v2/devices/thermostats/${this.device.deviceID}`, {
            qs: {
              locationId: this.locationId
            }
          });
          const devicefan = await this.platform.rp.get(`https://api.honeywell.com/v2/devices/thermostats/${this.device.deviceID}/fan`, {
            qs: {
              locationId: this.locationId
            }
          });
          const FirmwareRevision = await this.platform.rp.get(`https://api.honeywell.com/v2/devices/thermostats/${this.device.deviceID}/group/0/rooms`, {
            qs: {
              locationId: this.locationId
            }
          });
          this.FirmwareRevision = FirmwareRevision;
          this.platform.debug(JSON.stringify(this.FirmwareRevision.rooms[0].accessories[0].accessoryAttribute.softwareRevision));
          this.platform.debug(`Fetched update for ${this.device.name} from Honeywell API: ${JSON.stringify(this.device.changeableValues)} and Fan: ${JSON.stringify(devicefan)}`);
          this.device = device;
          this.deviceFan = devicefan;
          this.platform.debug(JSON.stringify(this.device.changeableValues.mode));
          this.parseStatus();
          this.updateHomeKitCharacteristics();
        } catch (e) {
          this.log.error(`Failed to update status of ${this.device.name}`, e.message);
        }
        }

        /**
        * Pushes the requested changes to the Honeywell API
        */
        async pushChanges() {
        const payload = {
          mode: this.honeywellMode[this.TargetHeatingCoolingState],
          thermostatSetpointStatus: 'TemporaryHold',
          autoChangeoverActive: this.device.changeableValues.autoChangeoverActive,
        }

        // Set the heat and cool set point value based on the selected mode
        if (this.TargetHeatingCoolingState === Characteristic.TargetHeatingCoolingState.HEAT) {
          payload.heatSetpoint = this.toFahrenheit(this.TargetTemperature);
          payload.coolSetpoint = this.toFahrenheit(this.CoolingThresholdTemperature);
        } else if (this.TargetHeatingCoolingState === Characteristic.TargetHeatingCoolingState.COOL) {
          payload.coolSetpoint = this.toFahrenheit(this.TargetTemperature);
          payload.heatSetpoint = this.toFahrenheit(this.HeatingThresholdTemperature);
        } else if (this.TargetHeatingCoolingState === Characteristic.TargetHeatingCoolingState.AUTO) {
          payload.coolSetpoint = this.toFahrenheit(this.CoolingThresholdTemperature);
          payload.heatSetpoint = this.toFahrenheit(this.HeatingThresholdTemperature);
        } else {
          payload.coolSetpoint = this.toFahrenheit(this.CoolingThresholdTemperature);
          payload.heatSetpoint = this.toFahrenheit(this.HeatingThresholdTemperature);
        }

        this.log.info(`Sending request to Honeywell API. mode: ${payload.mode}, coolSetpoint: ${payload.coolSetpoint}, heatSetpoint: ${payload.heatSetpoint}`);
        this.platform.debug(JSON.stringify(payload));

        // Make the API request
        await this.platform.rp.post(`https://api.honeywell.com/v2/devices/thermostats/${this.device.deviceID}`, {
          qs: {
            locationId: this.locationId,
          },
          json: payload,
        });

        // Refresh the status from the API
        await this.refreshSensorStatus();
        }
      }
          
      // ---------------------------------------------------------------------------

      // Push the values to Homekit
      this.updateHomeKitCharacteristics();
      this.updateHomeKitOccupancyCharacteristics();
      this.updateHomeKitHumidityCharacteristics();
      this.updateHomeKitMotionharacteristics();
  
     /**
     * Updates the status for each of the HomeKit Characteristics for Temperature
     */
    updateHomeKitCharacteristics() ;{
      this.service.updateCharacteristic(Characteristic.Active, this.TemperatureActive);
      this.service.updateCharacteristic(Characteristic.StatusLowBattery, this.TemperatureStatusLowBattery);
      this.service.updateCharacteristic(Characteristic.CurrentTemperature, this.CurrentTemperature);
    }
  
    /**
     * Updates the status for each of the HomeKit Characteristics for Occupancy
     */
    updateHomeKitOccupancyCharacteristics() ;{
      this.occupancyService.updateCharacteristic(Characteristic.Active, this.OccupancyActive);
      this.occupancyService.updateCharacteristic(Characteristic.OccupancyDetected, this.OccupancyDetected);
    }
  
    /**
     * Updates the status for each of the HomeKit Characteristics for Humidity
     */
    updateHomeKitHumidityCharacteristics() ;{
      this.humidityService.updateCharacteristic(Characteristic.Active, this.HumidityActive);
      this.humidityService.updateCharacteristic(Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
    }

    /**
     * Updates the status for each of the HomeKit Characteristics for Motion
     */
    updateHomeKitMotionharacteristics() ;{
      this.motionService.updateCharacteristic(Characteristic.StatusActive, this.MotionActive);
      this.motionService.updateCharacteristic(Characteristic.MotionDetected, this.MotionDetected);
    }
  
    /**
     * Handle requests to get the current value of the "Current Temperature" characteristic
     */
    
    handleCurrentTemperatureGet(callback) ;{
      this.platform.debug('Triggered GET CurrentTemperature');
  
      // set this to a valid value for CurrentTemperature
      const currentValue = 1;
  
      callback(null, currentValue);
    }
  
    handeTemperatureStatusLowBatteryGet(callback) ;{
      this.platform.debug('Triggered GET Status Low Battery');
  
      // set this to a valid value for StatusLowBattery
      const currentValue = 1;
  
      callback(null, currentValue);
    }
  
    handleTemperatureActiveGet(callback) ;{
      this.platform.debug('Triggered GET Status Active');
  
      // set this to a valid value for StatusLowBattery
      const currentValue = 1;
  
      callback(null, currentValue);
    }
  
    /**
     * Handle requests to get the current value of the "Occupancy Sensor" characteristics
     */
    handleOccupancyDetectedGet(callback) ;{
      this.platform.debug('Triggered GET OccupancyDetected');
  
      // set this to a valid value for OccupancyDetected
      const currentValue = 1;
  
      callback(null, currentValue);
    }
  
    handleOccupancyActiveGet(callback) ;{
      this.platform.debug('Triggered GET Occupancy Status Active');
  
      // set this to a valid value for Occupancy Active
      const currentValue = 1;
  
      callback(null, currentValue);
    }
  
    /**
     * Handle requests to get the current value of the "Humidity Sensor" characteristics
     */
    handleCurrentRelativeHumidityGet(callback) ;{
      this.platform.debug('Triggered GET CurrentRelativeHumidity');
  
      // set this to a valid value for CurrentRelativeHumidity
      const currentValue = 1;
  
      callback(null, currentValue);
    }
  
    handleHumidityActiveGet(callback) ;{
      this.platform.debug('Triggered GET CurrentRelativeHumidity');
  
      // set this to a valid value for CurrentRelativeHumidity
      const currentValue = 1;
  
      callback(null, currentValue);
    }

    /**
     * Handle requests to get the current value of the "Motion Sensor" characteristics
     */
    handleMotionDetectedGet(callback) ;{
      this.platform.debug('Triggered GET Motion Detected');
  
      // set this to a valid value for Motion Detected
      const currentValue = 1;
  
      callback(null, currentValue);
    }
  
    handleMotionStatusActiveGet(callback) ;{
      this.platform.debug('Triggered GET Motion Active Status');
  
      // set this to a valid value for Motion Active Status
      const currentValue = 1;
  
      callback(null, currentValue);
    }
  }