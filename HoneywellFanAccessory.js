/**
   * Create Fan Accessory for Thermostat
   */
class HoneywellFanAccessory {

  constructor(log, config, api) {
    this.log = log;
    this.platform = platform;
    this.accessory = accessory;
    this.device = device;
    this.locationId = locationId;

    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    // extract name from config
    this.name = config.name;

    // create a new Fanv2 service
    this.service = new this.Service(this.Service.Fanv2);

    // create handlers for required characteristics
    this.service.getCharacteristic(this.Characteristic.Active)
      .on('get', this.handleActiveGet.bind(this))
      .on('set', this.handleActiveSet.bind(this));

    // create handlers for optional characteristics
    this.service.getCharacteristic(this.Characteristic.TargetFanState)
      .on('get', this.handleTargetFanStateGet.bind(this))
      .on('set', this.handleTargetFanStateSet.bind(this));

  }

  /**
   * Handle requests to get the current value of the "Active" characteristic
   */
  handleActiveGet(callback) {
    this.log.debug('Triggered GET Active');

    // set this to a valid value for Active
    const currentValue = 1;

    callback(null, currentValue);
  }

  /**
   * Handle requests to set the "Active" characteristic
   */
  handleActiveSet(value, callback) {
    this.log.debug('Triggered SET Active:', value);

    callback(null);
  }

  /**
   * Handle requests to get the current value of the "Active" characteristic
   */
  handleTargetFanStateGet(callback) {
    this.log.debug('Triggered GET Active');

    // set this to a valid value for Active
    const currentValue = 1;

    callback(null, currentValue);
  }

  /**
   * Handle requests to set the "Active" characteristic
   */
  handleTargetFanStateSet(value, callback) {
    this.log.debug('Triggered SET Active:', value);

    callback(null);
  }
}
