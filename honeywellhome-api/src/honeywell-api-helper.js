var base64 = require('base-64');
var exec = require('child_process').exec;

var config = require('../config/options.global');

var HoneywellApiHelper = {

	getAuthorization: function(){
		var authorization =
			base64.encode(
				config.consumerKey + ':' + config.consumerSecret
			);
		return authorization;
	},

	getLocations: function(apikey, callback){
		var curlString = '';
		curlString += 'curl -H "Authorization: Bearer ' + apikey + '" ';
		curlString += 'https://api.honeywell.com/v1/locations?apikey=' + config.consumerKey;

		//console.log(curlString);
		var child = exec(
			curlString,
			function(error, stdout, stderr){
				//console.log('stdout: ' + stdout);
				//console.log('stderr: ' + stderr);
				var response = JSON.parse(stdout);
				//console.log('Setting Access Token: ', response.access_token);
				//req.cookies.access_token = response.access_token;
				if(error !== null)
				{
					console.log('exec error: ' + error);
				}
				callback( null, response);
			}
		);
	},

	getDevices: function(apikey, locationId, callback){
		var curlString = '';
		curlString += 'curl -H "Authorization: Bearer ' + apikey + '" ';
		curlString += '--header "Content-Type: application/x-www-form-urlencoded" ';
		curlString += '--header "Accept: application/json" ';
		curlString += '-G https://api.honeywell.com/v2/devices ';
		curlString += '-d locationId=' + locationId + ' ';
		curlString += '-d apikey=' + config.consumerKey;
		console.log(curlString);
		var child = exec(
			curlString,
			function(error, stdout, stderr){
				//console.log('stdout: ' + stdout);
				//console.log('stderr: ' + stderr);
				var response = JSON.parse(stdout);
				//console.log('Setting Access Token: ', response.access_token);
				//req.cookies.access_token = response.access_token;
				if(error !== null)
				{
					console.log('exec error: ' + error);
				}
				callback( null, response);
			}
		);
	},

	getThermostats: function(apikey, locationId, deviceId, callback){
		var curlString = '';
		curlString += 'curl -H "Authorization: Bearer ' + apikey + '" ';
		curlString += 'https://api.honeywell.com/v2/devices/termostats/' + deviceId +'?';
		curlString += 'apikey=' + config.consumerKey + '&';
		curlString += 'locationId=' + locationId;

		//console.log(curlString);
		var child = exec(
			curlString,
			function(error, stdout, stderr){
				//console.log('stdout: ' + stdout);
				//console.log('stderr: ' + stderr);
				var response = JSON.parse(stdout);
				//console.log('Setting Access Token: ', response.access_token);
				//req.cookies.access_token = response.access_token;
				if(error !== null)
				{
					console.log('exec error: ' + error);
				}
				callback( null, response);
			}
		);
	}

};
module.exports = HoneywellApiHelper;
