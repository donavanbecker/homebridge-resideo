    var arp  = require('./index')
      , tbl  = { ipaddrs: {}, ifnames : {} }
      , util = require('util')
      ;

    arp.arpTable(function(err, entry) {
      if (err) console.log('arp: ' + err.message);
      if (!entry) return console.log(util.inspect(tbl, { depth: null }));

      tbl.ipaddrs[entry.ip] = { ifname : entry.ifname, mac: entry.mac };
      if (!tbl.ifnames[entry.ifname]) tbl.ifnames[entry.ifname] = {};
      tbl.ifnames[entry.ifname][entry.mac] = entry.ip;
    });
