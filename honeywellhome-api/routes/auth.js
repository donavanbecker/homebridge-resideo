var express = require('express');
var router = express.Router();
var exec = require('child_process').exec;
var urlencode = require('urlencode');

var honeywellApiHelper = require('../src/honeywell-api-helper');
var config = require('../config/options.global.js');

router.get('/', function(req, res, next) {
	var code = req.query.code;

	var curlString = '';
	curlString += 'curl -X POST ';
	curlString += '--header "Authorization: Basic ' + honeywellApiHelper.getAuthorization() + '" ';
	curlString += '--header "Accept: application/json" ';
	curlString += '--header "Content-Type: application/x-www-form-urlencoded" ';
	curlString += '-d "';
	curlString +=   'grant_type=authorization_code&';
	curlString +=   'code=' + code + '&';
	curlString +=   'redirect_uri=' + urlencode(config.callbackURL);
	curlString += '" ';
	curlString += '"https://api.honeywell.com/oauth2/token"';

	//console.log(curlString);
	var child = exec(
		curlString,
		function(error, stdout, stderr){
			//console.log('stdout: ' + stdout);
			//console.log('stderr: ' + stderr);
			console.log('');
			var response = JSON.parse(stdout);
			console.log('response: ', response);
			//console.log('Setting Access Token: ', response.access_token);
			res.cookie( 'access_token', response.access_token);
			res.cookie( 'refresh_token', response.refresh_token);
			//req.cookies.access_token = response.access_token;
			if(error !== null)
			{
				console.log('exec error: ' + error);
			}
			res.redirect('/');
		}
	);
});

router.get('/logout', function(req, res, next) {
	res.clearCookie( 'access_token');
	res.clearCookie( 'refresh_token');
	res.redirect('/');
});

module.exports = router;
