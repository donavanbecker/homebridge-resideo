var express = require('express');
var router = express.Router();

var apiVersion = '/v1.0';

var honeywellApiHelper = require('../src/honeywell-api-helper');

router.get('/', function(req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});

router.get( apiVersion + '/locations', function(req, res, next) {
	if(!req.cookies.access_token) {
		return res.send(403);
	}

	honeywellApiHelper.getLocations(
		req.cookies.access_token,
		function(error, locations){
			if(error){
				//todo some error handling here
			}
			console.log(JSON.stringify(req.cookies, null, 2));
			res.json(locations);
		}
	);
});

router.get( apiVersion + '/devices/:locationId', function(req, res, next) {
	if(!req.cookies.access_token) {
		return res.send(403);
	}
	console.log('req.params.locationId: ', req.params.locationId);
	honeywellApiHelper.getDevices(
		req.cookies.access_token,
		req.params.locationId,
		function(error, devices){
			if(error){
				//todo some error handling here
			}
			res.json(devices);
		}
	);
});

router.get( apiVersion + '/devices/thermostats/:locationId/:deviceId', function(req, res, next) {
	if(!req.cookies.access_token) {
		return res.send(403);
	}

	honeywellApiHelper.getThermostats(
		req.cookies.access_token,
		req.params.deviceId,
		function(error, devices){
			if(error){
				//todo some error handling here
			}
			res.json(devices);
		}
	);
});


module.exports = router;
