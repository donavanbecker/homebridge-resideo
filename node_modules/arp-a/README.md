node-arp-a
==========

A node.js native implementation (when possible) of "arp -a"

Why not use [the arp module](https://github.com/teknopaul/arp)?
I dislike parsing programmatic output (which can change at any time),
and prefer using API-based approaches. That's possible for Linux and Mac OS.

Also, I wanted a node.js module that returns the entire ARP table.


Install
-------

    npm install arp-a


API
---

    var arp = require('arp-a')
      , tbl = { ipaddrs: {}, ifnames : {} }
      ;

    arp.table(function(err, entry) {
      if (!!err) return console.log('arp: ' + err.message);
      if (!entry) return;

      tbl.ipaddrs[entry.ip] = entry.mac;
      if (!tbl.ifnames[entry.ifname]) tbl.ifnames[entry.ifname] = {};
      tbl.ifnames[entry.ifname][entry.mac] = entry.ip;
    });

License
=======

[MIT](http://en.wikipedia.org/wiki/MIT_License) license. Freely have you received, freely give.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
