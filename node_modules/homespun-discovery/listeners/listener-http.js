/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

var EventEmitter = require('events').EventEmitter
  , underscore   = require('underscore')
  , os           = require('os')
  , url          = require('url')
  , util         = require('util')
  , uuid         = require('uuid')

var logger, http

var init = function (log) {
  logger = log || { error: console.error }
  if (http) done()

  http = new HTTP()
}

var singleton = function (options) {
  if (!http) init()

  http._options = underscore.clone(options || {})
  return http
}

var done = function () {
  if (!http) return

  http.destroy()
  http = null
}

var HTTP = function () {
  if (!(this instanceof HTTP)) return new HTTP()

  var self = this
  EventEmitter.call(self)

  self.eventNames = []
  self.servers = []

  var ifaces = os.networkInterfaces()
  underscore.keys(ifaces).forEach(function (ifname) {
    ifaces[ifname].forEach(function (ifentry) {
      if ((ifentry.internal) || (ifentry.family !== 'IPv4')) return

      ifentry.ifname = ifname
      self.server(ifentry)
    })
  })
  self.server({ ifname   : 'lo0'
              , address  : '127.0.0.1'
              , netmask  : '255.0.0.0'
              , family   : 'IPv4'
              , mac      : '00:00:00:00:00:00'
              , internal : true
              })
}
util.inherits(HTTP, EventEmitter)

HTTP.prototype.destroy = function () {
  this.server.forEach(function (entry) {
    try { entry.server.close() } catch (ex) {
      logger.error('HTTP close', ex)
    }
  })
}

HTTP.prototype.server = function (ifentry) {
  var self = this

  var server = require('http').createServer(function (request, response) {
    var options, x
      , address = request.socket.remoteAddress
      , body = ''
      , parts = url.parse(request.url)
      , eventName = request.method + ' ' + parts.pathname

    x = address.lastIndexOf(':')
    if (x !== -1) address = address.substring(x + 1)
    options = { address: address, port: request.socket.remotePort, eventName: eventName }

    if (self.eventNames.indexOf(eventName) === -1) {
      logger.error('HTTP 404', options)

      response.writeHead(404)
      response.end()
      return request.destroy()
    }

    request.on('data', function (chunk) {
      body += chunk.toString()
    }).on('end', function () {
      if (self._options.verboseP) {
        console.log('[ request from ' + address + ':' + request.socket.remotePort + ' ]')
        console.log('>>> ' + request.method + ' ' + request.url + ' HTTP/' + request.httpVersion)
        underscore.keys(request.headers).forEach(function (header) {
          console.log('>>> ' + header + ': ' + request.headers[header])
        })
        console.log('>>>')
        console.log('>>> ' + body.split('\n').join('\n>>> '))
      }

      self.emit(eventName, options, { url: request.url, headers: request.headers, body: body })
      response.writeHead(204)
      response.end()
    }).on('aborted', function () {
      logger.error('HTTP server close', { event: 'aborted' })
    }).on('close', function () {
      logger.error('HTTP server close', { event: 'close' })
    }).on('error', function (err) {
      logger.error('HTTP server', err)
    }).setEncoding('utf8')
  }).on('clientError', function (err, socket) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  }).on('listening', function () {
    var location = 'http://' + ifentry.address + ':' + this.address().port

    console.log('[ listening on ' + ifentry.ifname + ': ' + location + ' ]')
    self.servers.push({ ifentry: ifentry, location: location, server: server })
  })
  server.listen()
}

HTTP.prototype.addEvent = function (method) {
  var servers = []
  var path = '/' + uuid.v4()
  var eventName = method + ' ' + path

  this.eventNames.push(eventName)
  this.servers.forEach(function (server) { servers.push(underscore.pick(server, [ 'ifentry', 'location' ])) })
  return { eventName: eventName, path: path, servers: servers }
}


module.exports =
{ init      : init
, done      : done
, singleton : singleton
}
