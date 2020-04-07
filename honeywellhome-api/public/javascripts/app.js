$(document).ready(function(){
	$.ajax({
		url: '/api/v1.0/locations',
		success: function(locations){
			async.eachLimit(locations, 1, function(location, locationCallback){
				//console.log('Location: ', location);
				$.ajax({
					url: '/api/v1.0/devices/' + location.locationID,
					success: function(devices){
						//console.log('Devices @ ' + location.locationID);
						async.eachLimit(
							devices,
							1,
							function( device, deviceCallback){
								console.log('Device: ', device);
								$('#locations').append(
									'<div class="location">' +
										'Location: ' + location.locationID + '<br/>' +
										'Device ID: ' + device.deviceID + '<br/>' +
										'Indoor Temp: ' + device.indoorTemperature + ' ' + device.units + '<br/>' +
										'Outdoor Temp: ' + device.outdoorTemperature + ' ' + device.units +
									'</div>'
								);
								deviceCallback();
							},
							function(){
								locationCallback();
							}
						);
					}
				})
			});
		}
	})
});

function getCookie(cname) {
	var name = cname + "=";
	var decodedCookie = decodeURIComponent(document.cookie);
	var ca = decodedCookie.split(';');
	for(var i = 0; i <ca.length; i++) {
		var c = ca[i];
		while (c.charAt(0) == ' ') {
			c = c.substring(1);
		}
		if (c.indexOf(name) == 0) {
			return c.substring(name.length, c.length);
		}
	}
	return "";
}