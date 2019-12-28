/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

var dgram        = require('dgram')
  , EventEmitter = require('events').EventEmitter
  , snmpn        = require('snmp-native')
  , underscore   = require('underscore')
  , util         = require('util')


var logger, observers, snmp

var init = function (log) {
  logger = log || { error: console.error }
  if (snmp) return

  snmp = new SNMP()
  observers = []
}

var done = function () {
  if (!snmp) return

  (observers || []).forEach(function (observer) { observer.destroy.bind(observer)() })
  snmp.destroy()
  snmp = null
}


var Observe = function (options) {    /* { sysObjectIDs: ['1.3.6.1....' ... ] } */
  if (!(this instanceof Observe)) return new Observe(options)

  var self = this
  EventEmitter.call(self)

  var onUp = function(options, service) { self.emit('up', self._options, service) }
  var onError = function(options, err) { self.emit('error', self._options, err) }

  self._options = underscore.clone(options)
  if (!self._options.sysObjectIDs) throw new Error('options.sysObjectIDs is missing')
  if (!util.isArray(self._options.sysObjectIDs)) throw new Error('options.sysObjectIDs not an array')
  self._options.sysObjectIDs.forEach(function (sysObjectID) {
    sysObjectID.split('.').forEach(function (n) {
      if (typeof n === 'string') n = parseInt(n, 10)
      if ((n < 0) || (!Number.isFinite(n))) throw new Error('invalid sysObjectID: ' + sysObjectID)
    })
  })

  self._browser = snmp.find(self._options, onUp).on('up', onUp).on('error', onError)

  observers.push(self)
}
util.inherits(Observe, EventEmitter)

Observe.prototype.destroy = function () {
  var self = this

  var i = underscore.findIndex(observers, function(observer) { return (observer === self) })

  if (i !== -1) observers.splice(i, 1)
  self.emit('end', self._options)

  self._browser.stop()
}

Observe.prototype.oidS = function (b) { return underscore.map(b, function (n) { return n.toString() }).join('.') }

Observe.prototype.oidI = function (s) { return underscore.map(s.split('.'), function (n) { return +n }) }


var SNMP_IPADDR = '255.255.255.255'
  , SNMP_PORTNO = 161
  , SNMP_TTL = 10

var SNMP = function () {
  if (!(this instanceof SNMP)) return new SNMP()

  var self = this
  EventEmitter.call(self)

  self._socket = dgram.createSocket('udp4').on('error', function (err) {
    logger.error('SNMP socket', err)
    self.emit('error', err)
  }).on('message', function (buffer, rinfo) {
    var bindings
      , oidS = Observe.prototype.oidS
      , packet = snmpn.parse(buffer)
      , response = { host: rinfo.address, port: rinfo.port, packet: packet }

    if ((!packet.pdu) || (packet.pdu.type !== 2) || (packet.pdu.error !== 0)
            || (!util.isArray(packet.pdu.varbinds)) || (packet.pdu.varbinds.length !== 3)) return

    bindings = packet.pdu.varbinds
    if (bindings[1].type !== 6) return

    bindings.forEach(function (binding) {
      binding.oid = oidS(binding.oid)
      if (binding.type === 6) binding.value = oidS(binding.value)
      delete binding.valueHex
      delete binding.valueRaw
    })

    self.emit('response', response)
  }).on('listening', function () {
    self._socket.setBroadcast(true)
    self._socket.setTTL(SNMP_TTL)
    self.update.bind(self)()

    self._timer = setInterval(self.update.bind(self), 30 * 1000)
  })

  self._socket.bind()
}
util.inherits(SNMP, EventEmitter)

SNMP.prototype.destroy = function () {
  try { this._socket.close() } catch (ex) {
    logger.error('SNMP close', ex)
  }

  if (this._timer) {
    clearInterval(this._timer)
    this._timer = null
  }
}

SNMP.prototype.find = function (options, onUp) {
  return new Browser(this, options, onUp)
}

SNMP.prototype.update = function () {
  var data
    , oidI = Observe.prototype.oidI
    , packet = new snmpn.Packet()


  // sysDescr.0, sysObjectID.0, and sysName.0
  packet.pdu.varbinds[0].oid = oidI('1.3.6.1.2.1.1.1.0')
  packet.pdu.varbinds[1] = underscore.extend({}, packet.pdu.varbinds[0], { oid : oidI('1.3.6.1.2.1.1.2.0') } )
  packet.pdu.varbinds[2] = underscore.extend({}, packet.pdu.varbinds[0], { oid : oidI('1.3.6.1.2.1.1.5.0') } )
  data = snmpn.encode(packet)

  this._socket.send(data, 0, data.length, SNMP_PORTNO, SNMP_IPADDR, function (err, bytes) {/* jshint unused: false */
    if (err) return logger.error('SNMP send', err)
  })
}

var Browser = function (snmp, options, onUp) {
  if (!(this instanceof Browser)) return new Browser(snmp, options, onUp)

  EventEmitter.call(this)

  if (typeof options === 'function') {
    onUp = options
    options = {}
  }

  this._options = underscore.clone(options)
  this._snmp = snmp

  if (onUp) this.on('up', onUp)

  this.start()
}
util.inherits(Browser, EventEmitter)

Browser.prototype.start = function () {
  var self = this

  if (self._onResponse) return

  self._onResponse = function (response) {
    if (self._options.sysObjectIDs.indexOf(response.packet.pdu.varbinds[1].value) !== -1) {
      self.emit('up', self._options, response)
    }
  }
  self._onError = function (err) { self.emit('error', self._options, err) }

  self._snmp.on('response', self._onResponse).on('error', self._onError)

  self.update()
}

Browser.prototype.stop = function () {
  if (!this._onResponse) return

  this._snmp.removeListener('response', this._onResponse)
  this._onResponse = null

  this._snmp.removeListener('error', this._onError)
}

Browser.prototype.update = function () {
  this._snmp.update.bind(this._snmp)()
}


module.exports =
{ init    : init
, done    : done
, Observe : Observe
}
