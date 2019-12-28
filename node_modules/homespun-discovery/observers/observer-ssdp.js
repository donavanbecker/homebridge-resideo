/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

var dgram        = require('dgram')
  , EventEmitter = require('events').EventEmitter
  , underscore   = require('underscore')
  , util         = require('util')


var logger, observers, ssdp

var init = function (log) {
  logger = log || { error: console.error }
  if (ssdp) return

  ssdp = new SSDP()
  observers = []
}

var done = function () {
  if (!ssdp) return

  (observers || []).forEach(function (observer) { observer.destroy.bind(observer)() })
  ssdp.destroy()
  ssdp = null
}


var Observe = function (options) {    /* { contains: 'string' } */
  if (!(this instanceof Observe)) return new Observe(options)

  var self = this
  EventEmitter.call(self)

  var onUp = function(options, service) { self.emit('up', self._options, service) }
  var onDown = function(service) { self.emit('down', self._options, service) }
  var onError = function(options, err) { self.emit('error', self._options, err) }

  self._options = underscore.clone(options)
  if (!self._options.contains) throw new Error('options.contains is missing')
  if (typeof self._options.contains !== 'string') throw new Error('options.contains not a string')

  self._browser = ssdp.find(self._options, onUp).on('up', onUp).on('down', onDown).on('error', onError)

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


var SSDP_IPADDR = '239.255.255.250'
  , SSDP_PORTNO = 1900
  , SSDP_TTL = 10
  , SSDP_SEARCH = new Buffer([
      'M-SEARCH * HTTP/1.1'
    , 'HOST: ' + SSDP_IPADDR + ':' + SSDP_PORTNO
    , 'ST: ssdp:all'
    , 'MAN: "ssdp:discover"'
    , 'MX: ' + SSDP_TTL
    , ''
    , ''
].join('\r\n'))

var SSDP = function () {
  if (!(this instanceof SSDP)) return new SSDP()

  var self = this
  EventEmitter.call(self)

  self.usns = {}
  self._socket = dgram.createSocket('udp4').on('error', function (err) {
    logger.error('SSDP socket', err)
    self.emit('error', err)
  }).on('message', function (buffer, rinfo) {
    var i, seconds
      , text = buffer.toString()
      , response =
        { host : rinfo.address
        , port : rinfo.port
        , ssdp : {}
        , text : text
        }
      , lines = text.split('\r\n')

    lines.forEach(function (line) {
      var x = line.indexOf(':')

      if (x !== -1) response.ssdp[line.substring(0, x).toLowerCase()] = line.substring(x + 1).trim()
    })

    if ((response.ssdp.usn) && (response.ssdp['cache-control'])) {
      i = response.ssdp['cache-control'].indexOf('max-age')
      if (i !== -1) {
        seconds = response.ssdp['cache-control'].substr(i + 7).trim()
        seconds = (seconds.indexOf('=') === 0) ? parseInt(seconds.substr(1), 10) : null
      }
      if (!seconds) seconds = 1800

      self.usns[response.ssdp.usn] = { response: response, expires: underscore.now() + (seconds * 1000) }
    }

    self.emit('response', response)
  }).on('listening', function () {
    self._socket.addMembership(SSDP_IPADDR)
    self._socket.setMulticastLoopback(true)
    self._socket.setMulticastTTL(SSDP_TTL)
    self.update.bind(self)()

    self._timer = setInterval(self.update.bind(self), 30 * 1000)
  })

  self._socket.bind()
}
util.inherits(SSDP, EventEmitter)

SSDP.prototype.destroy = function () {
  try { this._socket.close() } catch (ex) {
    logger.error('SSDP close', ex)
  }

  if (this._timer) {
    clearInterval(this._timer)
    this._timer = null
  }
}

SSDP.prototype.find = function (options, onUp) {
  return new Browser(this, options, onUp)
}

SSDP.prototype.update = function () {
  try {
    this._socket.send(SSDP_SEARCH, 0, SSDP_SEARCH.length, SSDP_PORTNO, SSDP_IPADDR)
  } catch (ex) {
    logger.error('SSDP search', ex)
  }
}

var Browser = function (ssdp, options, onUp) {
  if (!(this instanceof Browser)) return new Browser(ssdp, options, onUp)

  EventEmitter.call(this)

  if (typeof options === 'function') {
    onUp = options
    options = {}
  }

  this._options = underscore.clone(options)
  this._ssdp = ssdp

  if (onUp) this.on('up', onUp)

  this.start()
}
util.inherits(Browser, EventEmitter)

Browser.prototype.start = function () {
  var self = this

  var now = underscore.now()

  if (self._onResponse) return

  self._onResponse = function (response) {
    if (response.text.indexOf(self._options.contains) !== -1) self.emit('up', self._options, response)
  }
  self._onError = function (err) { self.emit('error', err) }

  self._ssdp.on('response', self._onResponse).on('error', self._onError)

  underscore.keys(self._ssdp.usns).forEach(function (usn) {
    var entry = self._ssdp.usns[usn]

console.log('usn=' + usn + ' expires<=now=' + (entry.expires <= now))
    if (entry.expires <= now) return self._onResponse(entry.response)

    delete self._ssdp.usns[usn]
  })

  self.update()
}

Browser.prototype.stop = function () {
  if (!this._onResponse) return

  this._ssdp.removeListener('response', this._onResponse)
  this._onResponse = null

  this._ssdp.removeListener('error', this._onError)
}

Browser.prototype.update = function () {
  this._ssdp.update.bind(this._ssdp)()
}


module.exports =
{ init    : init
, done    : done
, Observe : Observe
}
