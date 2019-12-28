/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

var querystring = require('querystring')
var underscore  = require('underscore')

module.exports = function (options, params, callback) {
  var request, timeoutP
    , client = options.location.protocol === 'https:' ? require('https') : require('http')

  params = underscore.extend(underscore.pick(options.location, [ 'protocol', 'hostname', 'port' ]), params)
  params.method = params.method || 'GET'
  if ((params.method !== 'GET') && (params.method !== 'DELETE')
         && (params.method !== 'SUBSCRIBE') && (params.method !== 'UNSUBSCRIBE')) {
    params.headers = underscore.defaults(params.headers || {},
                                         { 'content-type': 'application/json; charset=utf-8', 'accept-encoding': '' })
  }
  if (options.location.query) params.path += '?' + querystring.stringify(options.location.query)

  request = client.request(underscore.omit(params, [ 'useProxy', 'payload', 'rawP' ]), function (response) {
    var body = ''

    if (timeoutP) return
    response.on('data', function (chunk) {
      body += chunk.toString()
    }).on('end', function () {
      var payload
        , okP = Math.floor(response.statusCode / 100) === 2

      if (params.timeout) request.setTimeout(0)

      if (options.verboseP) {
        console.log('[ response for ' + params.method + ' ' + params.protocol + '//' + params.hostname + params.path + ' ]')
        console.log('>>> HTTP/' + response.httpVersionMajor + '.' + response.httpVersionMinor + ' ' + response.statusCode +
                   ' ' + (response.statusMessage || ''))
        underscore.keys(response.headers).forEach(function (header) {
          console.log('>>> ' + header + ': ' + response.headers[header])
        })
        console.log('>>>')
        try {
          payload = (params.rawP) ? body : (body && JSON.stringify(JSON.parse(body), null, 2))
        } catch (ex) {
          payload = body
        }
        console.log('>>> ' + payload.split('\n').join('\n>>> '))
      }

      try {
        payload = (params.rawP) ? body : ((response.statusCode !== 204) && body) ? JSON.parse(body) : null
      } catch (ex) {
        if (okP) return callback(ex, response, body)

        payload = body
      }

      if (!okP) {
        options.logger.error('_roundTrip error: HTTP response ' + response.statusCode + ' ' + (response.statusMessage || ''))
        return callback(new Error('HTTP response ' + response.statusCode + ' ' + (response.statusMessage || '')),
                        response, payload)
      }

      try {
        callback(null, response, payload)
      } catch (err0) {
        if (options.verboseP) console.log('callback: ' + err0.toString() + '\n' + err0.stack)
      }
    }).setEncoding('utf8')
  }).on('error', function (err) {
    callback(err)
  }).on('timeout', function () {
    timeoutP = true
    callback(new Error('timeout'))
  })
  if (params.payload) request.write(typeof params.payload !== 'string' ? JSON.stringify(params.payload) : params.payload)
  request.end()

  if (!options.verboseP) return

  console.log('<<< ' + params.method + ' ' + params.protocol + '//' + params.hostname + params.path)
  underscore.keys(params.headers).forEach(function (header) { console.log('<<< ' + header + ': ' + params.headers[header]) })
  console.log('<<<')
  if (params.payload) {
    console.log('<<< ' + (typeof params.payload !== 'string' ? JSON.stringify(params.payload, null, 2)
                                                             : params.payload).split('\n').join('\n<<< '))
  }
}
