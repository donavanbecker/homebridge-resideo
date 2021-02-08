<span align="center">

<a href="https://github.com/homebridge/verified/blob/master/verified-plugins.json"><img alt="homebridge-verified" src="https://raw.githubusercontent.com/donavanbecker/homebridge-honeywell-home/master/honeywell/Homebridge_x_Honeywell.svg?sanitize=true" width="500px"></a>

# Homebridge Honeywell Home

<a href="https://www.npmjs.com/package/homebridge-honeywell-home"><img title="npm version" src="https://badgen.net/npm/v/homebridge-honeywell-home" ></a>
<a href="https://www.npmjs.com/package/homebridge-honeywell-home"><img title="npm downloads" src="https://badgen.net/npm/dt/homebridge-honeywell-home" ></a>

<p>The Homebridge <a href="https://honeywellhome.com">Honeywell Home</a> 
plugin allows you to access your Honeywell Home Thermostat(s) from HomeKit.
  <a href="https://homebridge.io">Homebridge</a>. 
</p>

</span>

## Installation

1. Search for "Honeywell Home" on the plugin screen of [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x).
2. Click **Install**.

## Configuration

1. Login / create an account at https://developer.honeywellhome.com/user
    - Your Honeywell Home Developer Account, this account is different then your Honeywell Home Account that you log into the Honeywell Home App with
2. Click **Create New App**
3. Give your application a name, and enter the Callback URL as `https://homebridge-honeywell.iot.oz.nu/link-account`
4. Enter the generated consumer key and secret into the plugin settings screen of [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x)
5. Click **Link Account**

<p align="center">

<img src="https://user-images.githubusercontent.com/3979615/88920827-d5b97680-d2b0-11ea-9002-15209eebd995.png" width="600px">

</p>

6. Login to your [https://www.honeywellhome.com](https://account.honeywellhome.com).
7. Click Allow
8. Select Devices
    - I would recommend selecting all devices since you can restrict the devices you don't want in the Home app later, by DeviceID.
9. Click Connect
10. Click Confirm
11. Click Save
12. Restart Homebridge
