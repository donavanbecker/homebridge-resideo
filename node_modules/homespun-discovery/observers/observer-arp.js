/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

var EventEmitter = require('events').EventEmitter
  , arpa         = require('arp-a')
  , os           = require('os')
  , pcap         = require('pcap')
  , underscore   = require('underscore')
  , util         = require('util')


var arp, logger, observers

var init = function (log) {
  logger = log || { error: console.error }
  if (arp) return

  arp = new ARP()
  observers = []
}

var done = function () {
  if (!arp) return

  (observers || []).forEach(function (observer) { observer.destroy.bind(observer)() })
  arp.destroy()
  arp = null
}


var Observe = function (options) {    /* { ouis: [ '01:23:45' ... ] } */
  if (!(this instanceof Observe)) return new Observe(options)

  var self = this
  EventEmitter.call(self)

  var ouis = []
  var onUp = function(entry) { self.emit('up', self._options, entry) }
  var onDown = function(entry) { self.emit('down', self._options, entry) }
  var onError = function(entry) { self.emit('error', self._options, entry) }

  self._options = underscore.clone(options)
  if (!self._options.ouis) throw new Error('options.oui is missing')
  if (!util.isArray(self._options.ouis)) throw new Error('options.oui not an array')
  self._options.ouis.forEach(function (oui) {
    var prefix = oui.split('-').join('').split(':').join('').toLowerCase()

    if ((prefix.length !== 6) || (!prefix.matches("[0-9a-f]+"))) throw new Error('invalid oui: ' + oui)

    ouis.push(prefix.match(/.{2}/g).join(':'))
  })
  self._options.ouis = ouis

  self._browser = arp.find(self._options, onUp).on('up', onUp).on('down', onDown).on('error', onError)

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


var ARP = function () {
  if (!(this instanceof ARP)) return new ARP()

  var self = this
  EventEmitter.call(self)

  self.ifaces = underscore.clone(os.networkInterfaces())
  self._ifaces = {}
  underscore.keys(self.ifaces).forEach(function (ifname) {
    var ifaddrs, iface

    if (ifname.indexOf('v') === 0) return

    ifaddrs = self.ifaces[ifname]
    ifaddrs =  underscore.filter(self.ifaces[ifname], function (entry) {
      return ((!entry.internal) && (entry.family === 'IPv4'))
    })
    if (ifaddrs.length === 0) {
      delete self.ifaces[ifname]
      return
    }

    self.ifaces[ifname] = { addresses: ifaddrs, arp: {} }

    iface = new IFace(self, ifname)
    if (iface.session) self._ifaces[ifname] = iface
  })

  if (underscore.keys(self._ifaces).length === 0) {
    if (underscore.keys(self.ifaces.length) === 0) return logger.error('ARP iface', new Error('no interfaces'))

    logger.error('ARP iface', new Error('nothing to listen on'))
    return logger.error('hint: ' + 
                        { darwin : '$ sudo sh -c "chmod g+r /dev/bpf*; chgrp ' + process.getgid() + ' /dev/bpf*'
                        , linux  : '$ sudo sh -c "for IF in ' + underscore.keys(self.ifaces)
                                     + ' ; do ifconfig $IF promisc; done"'
                        }[os.platform()] || 'ask Google or Bing about how to configure your NIC to go into "promiscuous" mode')
  }

  arpa.table(function(err, entry) {
    var packet

    if (err) return logger.error('ARP table', err)

    if ((!entry) || (!self.ifaces[entry.ifname])) return

    packet = { sender_ha : entry.mac, sender_pa : entry.ip, target_ha : entry.mac, target_pa : entry.ip }
    self.ifaces[entry.ifname].arp[entry.mac] = packet

    self.update(entry.ifname, packet)
  })
}
util.inherits(ARP, EventEmitter)

ARP.prototype.destroy = function () {
  underscore.keys(this._ifaces).forEach(function (ifname) { this._ifaces[ifname].destroy() })
  delete this._ifaces
}

ARP.prototype.find = function (options, onUp) {
  return new Browser(this, options, onUp)
}

ARP.prototype.update = function (ifname, packet) {
  this.emit('packet', ifname, packet)
}

var IFace = function (arp, ifname) {
  if (!(this instanceof IFace)) return new IFace(arp, ifname)

  var self = this

  try {
    self.session = new pcap.Session(ifname, { filter: 'arp' }).on('packet', function(raw) {
      var frame = pcap.decode.packet(raw)
        , packet = frame && frame.link && frame.link.arp

      if ((!packet)
            && frame
            && (frame.link_type === 'LINKTYPE_ETHERNET')
            && frame.payload
            && frame.payload.ethertype === 2054
            && frame.payload.payload) {
        packet = frame.payload.payload
        if (packet.sender_ha && packet.sender_ha.addr) packet.sender_ha = new Buffer(packet.sender_ha.addr).toString('hex')
        if (packet.sender_pa && packet.sender_pa.addr) packet.sender_pa = packet.sender_pa.addr.join('.')
        if (packet.target_ha && packet.target_ha.addr) packet.target_ha = new Buffer(packet.target_ha.addr).toString('hex')
        if (packet.target_pa && packet.target_pa.addr) packet.target_pa = packet.target_pa.addr.join('.')
      }
      if ((!packet) || (!packet.sender_ha) || (!packet.sender_pa)) return

      packet.sender_ha = self.normalize(packet.sender_ha)
      packet.target_ha = self.normalize(packet.target_ha)
      arp.ifaces[ifname].arp[packet.sender_ha] = packet
      arp.ifaces[ifname].arp[packet.target_ha] = packet

      arp.update(ifname, packet)
    })
  } catch(ex) {
    logger.error('ARP iface ' + ifname, underscore.extend(ex, { ifname: ifname }))
  }
}

IFace.prototype.destroy = function () {
  this.session.close()
}

IFace.prototype.normalize = function (ha) {
  return ha.split('-').join('').split(':').join('').toLowerCase().match(/.{2}/g).join(':')
}

var Browser = function (arp, options, onUp) {
  if (!(this instanceof Browser)) return new Browser(arp, options, onUp)

  EventEmitter.call(this)

  if (typeof options === 'function') {
    onUp = options
    options = {}
  }

  this._options = underscore.clone(options)
  this._arp = arp

  if (onUp) this.on('up', onUp)

  this.start()
}
util.inherits(Browser, EventEmitter)

Browser.prototype.start = function () {
  var self = this

  var ifaces = self._arp.ifaces

  if (self._onPacket) return

  self._onPacket = function (ifname, packet) {
    if ((self._options.ouis.indexOf(packet.sender_ha.substring(0, 8)) !== -1)
            || (self._options.ouis.indexOf(packet.target_ha.substring(0, 8)) !== -1)) {
      self.emit('up', { ifname: ifname, packet: packet })
    }
  }
  self._onError = function (err) { self.emit('error', err) }

  self._arp.on('packet', self._onPacket).on('error', self._onError)

  underscore.keys(ifaces).forEach(function (ifname) {
    underscore.values(ifaces[ifname].arp).forEach(function (ha) { self._onPacket(ifname, ifaces[ifname].arp[ha]) })
  })
}

Browser.prototype.stop = function () {
  if (!this._onPacket) return

  this._arp.removeListener('packet', this._onPacket)
  this._onPacket = null

  this._snmp.removeListener('error', this._onError)
}


module.exports =
{ init    : init
, done    : done
, Observe : Observe
}
