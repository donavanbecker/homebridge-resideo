/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

/*
 * based on sonos 0.6.1's lib/events/subscriber.js
 */

var listener, roundTrip
  , EventEmitter = require('events').EventEmitter
  , underscore   = require('underscore')
  , url          = require('url')
  , util         = require('util')
  , uuid         = require('uuid')
  , xml2js       = require('xml2js')


var logger, subscribers

var init = function (log) {
  logger = log || { error: console.error }
  subscribers = []
}

var done = function () {
  (subscribers || []).forEach(function (subscriber) { subscriber.destroy.bind(subscriber)() })
}

var once = function (directory) {
  listener = directory.listeners.http
  roundTrip = directory.utilities.roundtrip
}

var Subscribe = function (options) {
  if (!(this instanceof Subscribe)) return new Subscribe(options)

  var self = this
  EventEmitter.call(self)

  var http
  var onMessage = function(options, message) { self.emit('message', options, message) }
  var onError = function (err) { self.emit('error', err) }

  self._options = underscore.clone(options)
  if (!self._options.host) throw new Error('options.host is missing')
  if (!self._options.port) throw new Error('options.port is missing')
  if (!self._options.endPoint) throw new Error('options.endPoint is missing')
  self._options._path = '/' + uuid.v4()
  self._options._eventName = 'NOTIFY ' + self._options._path

  http = listener.singleton(self._options)
  http.eventNames.push(self._options._eventName)
  self._listener = (new Listener(http, self._options, onMessage)).on('message', onMessage).on('error', onError)

  subscribers.push(self)
}
util.inherits(Subscribe, EventEmitter)

Subscribe.prototype.destroy = function () {
  var self = this

  var i = underscore.findIndex(subscribers, function(subscriber) { return (subscriber === self) })

  if (i !== -1) subscribers.splice(i, 1)
  self.emit('end', self._options)

  self._listener.stop()
}

var Listener = function (upnp, options, onMessage) {
  if (!(this instanceof Listener)) return new Listener(upnp, options, onMessage)

  EventEmitter.call(this)

  if (typeof options === 'function') {
    onMessage = options
    options = {}
  }

  this._options = underscore.defaults(underscore.clone(options),
                                      { location : url.parse('http://' + options.host + ':' + options.port)
                                      , logger   : logger
                                      })
  this._upnp = upnp

  if (onMessage) this.on(this._options._eventName, onMessage)

  this.start()
}
util.inherits(Listener, EventEmitter)

Listener.prototype.start = function () {
  var self = this

  if (self._onMessage) return

  self._onMessage = function (options, message) {
    xml2js.parseString(message.body, function(err, payload) {
      if (err) return self.emit('error', err)

      message.payload = payload
      self.emit('message', options, message)
    })
  }
  self._onError = function (err) { self.emit('error', err) }

  self._upnp.on(self._options._eventName, self._onMessage).on('error', self._onError)

  self.update()
}

Listener.prototype.stop = function () {
  if (!this._onMessage) return

  this._upnp.removeListener(this._options._eventName, this._onMessage)
  this._onMessage = null

  this._upnp.removeListener('error', this._onError)

  if (this._timer) clearTimeout(this._timer)
  roundTrip(this._options, { method     : 'UNSUBSCRIBE'
                           , headers    :
                             { sid      : this._sid
                             , Host     : this._options.host + ':' + this._options.port
                             }
                           , path       : this._options.endPoint }, function (err, response, result) {/* jshint unused: false */
    if (err) logger.error('unsubscribe error: ' + err.toString())
  })
}

Listener.prototype.update = function () {
  var self = this

  var location

  if (self._upnp.servers.length === 0) return setTimeout(self.update.bind(self), 100)

  location = self._upnp.servers[0].location
  self._upnp.servers.forEach(function (server) {
    if (server.location === self._options.location.hostname) location = server.location
  })
  roundTrip(this._options, { method     : 'SUBSCRIBE'
                           , headers    :
                             { callback : '<' + location + self._options._path + '>'
                             , Host     : this._options.host + ':' + this._options.port
                             , NT       : 'upnp:event'
                             , Timeout  : 'Second-3600'
                             }
                           , path       : self._options.endPoint }, function (err, response, result) {/* jshint unused: false */
    var seconds, timeout

    if (err) {
      logger.error('subscribe error: ' + err.toString())
      return self.emit('error', err)
    }

    self._sid = response.headers.sid

    timeout = response.headers.timeout
    if ((!!timeout) && (timeout.indexOf('Second-') === 0)) timeout = timeout.substr(7)
    seconds = (((!!timeout) && (!isNaN(timeout))) ? parseInt(timeout, 10) : 3600) - 15
         if (seconds <   0) seconds =  15
    else if (seconds > 300) seconds = 300
    setTimeout(self.update.bind(self), seconds * 1000)
  })
}


module.exports =
{ init      : init
, done      : done
, once      : once
, Subscribe : Subscribe
}
