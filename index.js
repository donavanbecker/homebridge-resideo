/* jshint asi: true, esversion: 6, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

// there is no known webhook/websocket to use for events, this results in very frequent polling under the push-sensor model...

var debug       = require('debug')('honeywell-home')
  , querystring = require('querystring')
  , roundTrip   = require('lib/roundtrip')
  , underscore  = require('underscore')
  , url         = require('url')


var Accessory
  , Service
  , Characteristic
  , UUIDGen

module.exports = function (homebridge) {
  Accessory      = homebridge.platformAccessory
  Service        = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  UUIDGen        = homebridge.hap.uuid

  homebridge.registerPlatform('homebridge-honeywell-home', 'HoneywellHome', HoneywellHome, true)
}

var HoneywellHome = function (log, config, api) {
  if (!(this instanceof HoneywellHome)) return new HoneywellHome(log, config, api)

  if (!config) return

  this.log = log
  this.config = config
  this.api = api

  this.oauth2 = this.config.credentials || {}
  if (!this.oauth2.consumerKey) throw new Error('missing consumerKey')
  if (!this.oauth2.consumerSecret) throw new Error('missing consumerSecret')
  // don't care about the accessToken...
  if (!this.oauth2.refreshToken) throw new Error('missing refreshToken')
  debug('OAuth2', this.oauth2)

  this.location = underscore.extend(underscore.pick(url.parse('https://api.honeywell.com'),
                                                    [ 'protocol', 'slashes', 'auth', 'host', 'port', 'hostname', 'hash',
                                                      'pathname', 'path' ]),
                                    { query: { apikey: this.oauth2.consumerKey }})
  this.location.href = url.format(this.location)
  debug('location', this.location)

  this.options = underscore.pick(underscore.defaults(this.config.options || {}, { ttl: 60, verboseP: false }),
                                 [ 'ttl', 'verboseP' ])
  if (this.options.ttl < 1) this.options.ttl = 60
  debug('options', this.options)

  this.discoveries = {}
  this.thermostats = {}

  debug('!!! HoneywellHome: apiP=' + (!!api))
  if (api) this.api.on('didFinishLaunching', this._didFinishLaunching.bind(this))
  else this._didFinishLaunching()
}

HoneywellHome.prototype._didFinishLaunching = function () {
  var self = this

  debug('!!! received didFinishLaunching')

  var poll = function() {
    self._poll(function (err) {
      if (err) {
        self.log.error('poll failed:' + err.toString())
        debug('recovery in 30 seconds')
        return setTimeout(recover, 30 * 1000)
      }
      
      debug('polling in ' + self.options.ttl + ' seconds')
      setTimeout(poll, self.options.ttl * 1000)
    })
  }

  var recover = function() {
    refresh((err) => {
      if (err) {
        self.log.error('poll failed:' + err.toString())
        debug('retrying in 30 seconds')
        return setTimeout(recover, 30 * 1000)
      }

      debug('recovered')
      poll()
    })
  }

  var refresh = function(callback) {
    roundTrip({ location: self.location, logger: self.log, verboseP: self.options.verboseP },
              { method : 'POST', path: '/oauth2/token',
                headers: { authorization : 'Basic ' + new Buffer(self.oauth2.consumerKey + ':'
                                                                + self.oauth2.consumerSecret).toString('base64')
                         , 'content-type': 'application/x-www-form-urlencoded; charset=utf-8'
                         },
                payload: querystring.encode({ grant_type: 'refresh_token', refresh_token: self.oauth2.refreshToken })
              },
              (err, response, result) => {
      if (!err) {
        if (!result.access_token) err = new Error('invalid response: ' + JSON.stringify(result))
        self.oauth2.accessToken = result.access_token

        if (self.oauth2.refreshToken !== result.refresh_token) self.log.warn('new refreshToken: ' + result.refreshToken)
      }

      callback(err)
    })
  }

  refresh(function (err) {
    if (err) return self.log.error('didFinishLaunching failed: ' + err.toString())

    self.log('didFinishLaunching')
    poll()    
  })
}

HoneywellHome.prototype._addAccessory = function (device) {
  var self = this

  var accessory = new Accessory(device.name, device.uuid)

  accessory.on('identify', function (paired, callback) {
    self.log(accessory.displayName, ': identify request')
    callback()
  })

  if (device.attachAccessory.bind(device)(accessory)) self.api.updatePlatformAccessories([ accessory ])

  debug('!!! addAccessory: ' + accessory.UUID + ' discoveries=' + JSON.stringify(self.discoveries, null, 2))
  if (!self.discoveries[accessory.UUID]) {
    self.api.registerPlatformAccessories('homebridge-honeywell-home', 'HoneywellHome', [ accessory ])
    self.log('addAccessory', underscore.pick(device, [ 'uuid', 'name', 'manufacturer', 'model', 'serialNumber' ]))
  }
}

HoneywellHome.prototype.configurationRequestHandler = function (context, request, callback) {/* jshint unused: false */
  this.log('configuration request', { context: context, request: request })
}

HoneywellHome.prototype.configureAccessory = function (accessory) {
  var self = this

  accessory.on('identify', function (paired, callback) {
    self.log(accessory.displayName, ': identify request')
    callback()
  })

  debug('!!! configureAccessory: ' + accessory.UUID + ' discoveries=' + JSON.stringify(self.discoveries, null, 2))
  self.discoveries[accessory.UUID] = accessory
  self.log('configureAccessory', underscore.pick(accessory, [ 'UUID', 'displayName' ]))
}

HoneywellHome.prototype._poll = function (callback) {
  var self = this

  roundTrip({ location: self.location, logger: self.log, verboseP: self.options.verboseP },
            { path: '/v2/locations', headers: { Authorization: 'Bearer ' + self.oauth2.accessToken } },
            (err, response, locations) => {
    var serialNumbers = []

    if ((!err) && (!Array.isArray(locations))) err = new Error('invalid response: ' + JSON.stringify(locations))
    if (err) {
      self.log.error('roundTrip locations: ' + err.toString())
      if (locations && (locations.fault || locations.message)) self.log.error('details', locations)
      return callback(err)
    }

    locations.forEach((location) => {
      var locationId = location.locationID
        , devices    = location.devices

      if (!Array.isArray(devices)) return self.log.error('roundTrip devices: ' + JSON.stringify(devices))

      devices.forEach((device) => {
        var deviceId     = device.deviceID
          , serialNumber = deviceId.toString()
          , thermostat   = self.thermostats[deviceId]

        if ((device.deviceClass !== 'Thermostat') || (device.deviceType !== 'Thermostat')) {
          return debug('skipping', underscore.pick(device, [ 'name', 'deviceClass', 'deviceType' ]))
        }

        if (!thermostat) {
          var properties = { name             : device.userDefinedDeviceName || device.name
                           , manufacturer     : 'Honeywell'
                           , model            : device.deviceModel
                           , serialNumber     : serialNumber
                           , firmwareRevision : device.thermostatVersion
                           , hardwareRevision : ''
                           }

          debug('thermostat', { properties: properties })

          thermostat = new Thermostat(self, serialNumber, { locationId: locationId, properties: properties })
          self.thermostats[deviceId] = thermostat
        }

        thermostat._update.bind(thermostat)(device)

        serialNumbers.push(serialNumber)
      })

      underscore.keys(self.thermostats).forEach((deviceId) => {
        var thermostat = self.thermostats[deviceId]
          , accessory  = thermostat.accessory

        if (serialNumbers.indexOf(thermostat.serialNumber) !== -1) return

        if (accessory) {
          self.api.registerPlatformAccessories('homebridge-honeywell-home', 'HoneywellHome', [ accessory ])
          self.log('removeAccessory', underscore.pick(thermostat, [ 'uuid', 'name', 'manufacturer', 'model', 'serialNumber' ]))
        }

        delete self.thermostats[deviceId]
      })

    })

    callback()
  })
}


var Thermostat = function (platform, deviceId, service) {
  var accessory

  if (!(this instanceof Thermostat)) return new Thermostat(platform, deviceId, service)

  this.platform = platform
  this.deviceId = deviceId
  this.locationId = service.locationId

  this.uuid =UUIDGen.generate(deviceId)
  this.name = service.properties.name
  this.manufacturer = service.properties.manufacturer
  this.model = service.properties.model
  this.serialNumber = service.properties.serialNumber
  this.properties = {}

  if (this.accessory) return

  debug('!!! thermstat: ' + this.uuid + ' action=' + ((!!this.platform.discoveries[this.uuid] ? 're-attach' : 'add')) +
        ' discoveries=' + JSON.stringify(this.platform.discoveries, null, 2))
  accessory = this.platform.discoveries[this.uuid]
  if (!accessory) return this.platform._addAccessory(this)

  delete this.platform.discoveries[this.uuid]
  this.attachAccessory(accessory)
  accessory.updateReachability(true)  
}


Thermostat.prototype.attachAccessory = function (accessory) {
  this.accessory = accessory
  this._setServices(accessory)
  this.platform.log('attachAccessory', underscore.pick(this, [ 'uuid', 'name', 'manufacturer', 'model', 'serialNumber' ]))
}

Thermostat.prototype._setServices = function (accessory) {
  var self = this

  var findOrCreateService = function (P, callback) {
    var newP
    var service = accessory.getService(P)

    if (!service) {
      newP = true
      service = new P()
    }
    callback(service)

    if (newP) accessory.addService(service, self.name)
  }

  findOrCreateService(Service.AccessoryInformation, function (service) {
    service.setCharacteristic(Characteristic.Name, self.name)
           .setCharacteristic(Characteristic.Manufacturer, self.manufacturer)
           .setCharacteristic(Characteristic.Model, self.model)
           .setCharacteristic(Characteristic.SerialNumber, self.serialNumber)
  })

  findOrCreateService(Service.Thermostat, function (service) {
    service.setCharacteristic(Characteristic.Name, self.name + ' Thermostat')
    service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
/* awaiting feedback from the folks at Honeywell...
           .on('set', self.setCoolingThresholdTemperature.bind(self))
    service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
           .on('set', self.setHeatingThresholdTemperature.bind(self))
    service.getCharacteristic(Characteristic.TargetTemperature)
           .on('set', self.setTargetTemperature.bind(self))
    service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
           .on('set', self.setTargetHeatingCoolingState.bind(self))

 */
  })

  findOrCreateService(Service.Fanv2, function (service) {
    service.setCharacteristic(Characteristic.Name, self.name + ' Fan')
/* awaiting feedback from the folks at Honeywell...
    service.getCharacteristic(Characteristic.TargetFanState).on('set', self.setTargetFanState.bind(self))
 */
  })
}

Thermostat.prototype.setCoolingThresholdTemperature = function (value, callback) {
  this._roundTrip({ coolSetpoint: this._normalizeTemperature(value) }, callback)
}

Thermostat.prototype.setHeatingThresholdTemperature = function (value, callback) {
  this._roundTrip({ heatSetpoint: this._normalizeTemperature(value) }, callback)
}

Thermostat.prototype.setTargetTemperature = function (value, callback) {
  var temperature = this._normalizeTemperature(value)
  var payload

  payload = (this.properties.mode === Characteristic.CurrentHeatingCoolingState.COOL) ? { coolSetpoint: temperature }
          : (this.properties.mode === Characteristic.CurrentHeatingCoolingState.HEAT) ? { heatSetpoint: temperature }
          : { coolSetpoint: temperature, heatSetpoint: temperature }
  this._roundTrip(payload, callback)
}

Thermostat.prototype.setTargetHeatingCoolingState = function (value, callback) {
  var mode = this._normalizeMode(value)

  if ((!mode) || (mode === 'Auto')) return callback(new Error('invalid TargetHeatingCoolingState=' + value))

  this.properties.mode = value
  this._roundTrip({ mode: mode }, callback)
}

Thermostat.prototype._update = function (readings) {
  var self = this

  var sThermostat = self.accessory.getService(Service.Thermostat)
  var sFan = self.accessory.getService(Service.Fanv2)

  var c = (value) => {
    return ((readings.units.charAt(0).toLowerCase() === 'f') ? (value - 32) * 5 / 9 : value)
  }

  var f =
      { changeableValues: (key, value) => {
        var coolSetpoint = c(parseFloat(value.coolSetpoint))
          , heatSetpoint = c(parseFloat(value.heatSetpoint))

        debug('changeableValues', value)

        if (isNaN(coolSetpoint)) coolSetpoint = 22
        debug('update CoolingThresholdTemperature: ' + coolSetpoint)
        sThermostat.getCharacteristic(Characteristic.CoolingThresholdTemperature).updateValue(coolSetpoint)
       
        if (isNaN(heatSetpoint)) heatSetpoint = coolSetpoint
        debug('update HeatingThresholdTemperature: ' + heatSetpoint)
        sThermostat.getCharacteristic(Characteristic.HeatingThresholdTemperature).updateValue(heatSetpoint)

        underscore.extend(self.properties, { changeableValues: { coolSetpoint: coolSetpoint, heatSetpoint: heatSetpoint } })
      }

    , settings: (key, value) => {
        var fan = value.fan

        debug('update Active: ' + fan.fanRunning)
        sFan.getCharacteristic(Characteristic.Active)
            .updateValue(fan.fanRunning ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE)

        debug('update CurrentFanState: ' + fan.fanRunning)
        sFan.getCharacteristic(Characteristic.CurrentFanState)
            .updateValue(fan.fanRunning ? Characteristic.CurrentFanState.BLOWING_AIR : Characteristic.CurrentFanState.IDLE)
    }

    , indoorHumidity: (key, value) => {
        value = parseFloat(value)

        if (isNaN(value)) return

        debug('update CurrentRelativeHumidity: ' + value)
        sThermostat.getCharacteristic(Characteristic.CurrentRelativeHumidity).updateValue(parseFloat(value))
      }
        
    , indoorTemperature: (key, value) => {
        value = c(parseFloat(value))

        if (isNaN(value)) return

        debug('update CurrentTemperature: ' + value)
        sThermostat.getCharacteristic(Characteristic.CurrentTemperature).updateValue(value)
      }

    , operationStatus: (key, value) => {
        var mode = 
          { c: Characteristic.CurrentHeatingCoolingState.COOL
          , h: Characteristic.CurrentHeatingCoolingState.HEAT
          , a: Characteristic.CurrentHeatingCoolingState.AUTO
          }[value.mode.charAt(0).toLowerCase()] || Characteristic.CurrentHeatingCoolingState.OFF

        debug('update CurrentHeatingCoolingState: ' + mode)
        sThermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(mode)

        underscore.extend(self.properties, { mode: mode })
      }
        
    , units: (key, value) => {
        value =
          { c: Characteristic.TemperatureDisplayUnits.CELSIUS
          }[value.charAt(0).toLowerCase()] || Characteristic.TemperatureDisplayUnits.FAHRENHEIT

        debug('update TemperatureDisplayUnits: ' + value)
        sThermostat.getCharacteristic(Characteristic.TemperatureDisplayUnits).updateValue(value)

        underscore.extend(self.properties, { units: value })
      }
    }

  underscore.keys(readings).forEach((key) => {
    var p = f[key]

    if (p) p(key, readings[key])
  })
}

Thermostat.prototype._roundTrip = function (payload, callback) {
  var self = this

  var platform  = self.platform
    , query     = underscore.defaults({ locationId: this.locationId }, platform.location.query)
    , location  = underscore.defaults({ query: query }, platform.location)
    , setpoints = self.properties.changeableValues

  debug('desired:', payload)
  debug('defaults:', self.properties)
  payload = underscore.defaults(payload,
                                { coolSetpoint: self._normalizeTemperature(setpoints.coolSetpoint)
                                , heatSetpoint: self._normalizeTemperature(setpoints.heatSetpoint)
                                },
                                { mode: this._normalizeMode(this.properties.mode) },
                                (this.deviceId.substr(0, 3) === 'TCC') ? { autoChangeoverActive: true }
                                                                       : { thermostatSetpointStatus: 'TemporaryHold' })
  debug('request:', payload)

/* honeywell API service expects *exactly* 'application/json' (nothing more nor less) */
  roundTrip({ location: location, logger: platform.log, verboseP: platform.options.verboseP },
            { method : 'POST', path: '/v2/devices/thermostats/' + this.deviceId,
              headers: { Authorization   : 'Bearer ' + platform.oauth2.accessToken
                       , 'content-type'  : 'application/json'
                       },
              payload: JSON.stringify(payload, null, 2)
            },
            (err, response, result) => {/* jshint unused: false */
    if (err) {
      platform.log.error('roundTrip POST thermostat: ' + err.toString())
      platform.log.error('payload: ' + JSON.stringify(payload))
      if (result && (result.fault || result.message)) platform.log.error('details:', result)

      /* could be a 401 (accessToken expired), but we don't care... */
      return callback(err)
    }

    roundTrip({ location: location, logger: platform.log, verboseP: platform.options.verboseP },
              { path: '/v2/devices/thermostats/' + this.deviceId,
                headers: { Authorization : 'Bearer ' + platform.oauth2.accessToken }
              },
              (err, response, result) => {/* jshint unused: false */
      if (err) {
        platform.log.error('roundTrip GET thermostat: ' + err.toString())
        if (result && (result.fault || result.message)) platform.log.error('details', result)
      } else {
        self._update.bind(self)(result)
      }

      callback(err)
    })
  })
}

Thermostat.prototype._normalizeMode = function (value) {
  var modes = { Off : Characteristic.TargetHeatingCoolingState.OFF
              , Heat: Characteristic.TargetHeatingCoolingState.HEAT
              , Cool: Characteristic.TargetHeatingCoolingState.COOL
              , Auto: Characteristic.TargetHeatingCoolingState.AUTO
              }

  return underscore.invert(modes)[value]
}

Thermostat.prototype._normalizeTemperature = function (value) {
/*
    if mode is fahrenheight, use whole numbers
    if mode is celsius, use .0 or .5 (seriously!)
 */

  var diff, whole

  if (this.properties.units === Characteristic.TemperatureDisplayUnits.FAHRENHEIT) return Math.round((value * 9 / 5) + 32)

  whole = Math.floor(value)
  diff = value - whole
  value = whole + ((diff < (1 / 3)) ? 0 : (diff < (2 / 3)) ? 0.5 : 1)
  
  return value.toFixed(1)
}
