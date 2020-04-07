var express = require('express');
var router = express.Router();
var urlencode = require('urlencode');
var config = require('../config/options.global.js');

router.get('/', function(req, res, next) {

	if(req.cookies.access_token){
		//Logged in! Show the landing page
		res.render(
			'landing',
			{
				title: 'Testing Honeywell Home API',
				credentials: JSON.stringify(req.cookies, null, 2)
			}
		);
	} else {
		//Not logged in
		var oathLink = getAuthLink();
		res.render(
			'login',
			{
				title: 'Honeywell Home API Login',
				oathLink: oathLink
			}
		);
	}
});

var getAuthLink = function(){
	var oathLink = 'https://api.honeywell.com/oauth2/authorize?';
	oathLink += 'response_type=code&';
	oathLink += 'redirect_uri=' + urlencode(config.callbackURL) + '&';
	oathLink += 'client_id=' +  config.consumerKey;
	return oathLink;
};

module.exports = router;
