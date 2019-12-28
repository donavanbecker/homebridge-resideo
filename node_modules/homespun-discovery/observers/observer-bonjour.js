/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

var EventEmitter = require('events').EventEmitter
  , underscore   = require('underscore')
  , util         = require('util')


var bonjour, logger, observers

var init = function (log) {
  logger = log || { error: console.error }
  if (bonjour) return

  bonjour = require('bonjour')()
  observers = []
}

var done = function () {
  if (!bonjour) return

  (observers || []).forEach(function (observer) { observer.destroy.bind(observer)() })
  bonjour.destroy()
  bonjour = null
}


var Observe = function (options) {    /* { type: 'http', protocol: 'tcp', name: '...', txt: '...' } */
  if (!(this instanceof Observe)) return new Observe(options)

  var self = this
  EventEmitter.call(self)

  var onUp = function(service) { self.emit('up', self._options, service) }
  var onDown = function(service) { self.emit('down', self._options, service) }
  var onError = function(service) { self.emit('error', self._options, service) }

  self._options = underscore.clone(options)

  self._browser = bonjour.find(self._options, onUp).on('up', onUp).on('down', onDown).on('error', onError)

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


module.exports =
{ init    : init
, done    : done
, Observe : Observe
}
