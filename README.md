# homebridge-honeywell-home

<p align="left">
  <a href="https://github.com/actions/setup-node"><img alt="GitHub Actions status" src="https://github.com/donavanbecker/homebridge-honeywell-home/workflows/node/badge.svg"></a>
</p>

A [Honeywell Home](https://honeywellhome.com) plugin for [Homebridge](https://homebridge.io/).

At present this is read only,
tested only on the Honeywell [T9 Smart Thermostat](https://t9.honeywellhome.com/).
I assume it will work on t5/t6 Thermostats also.

If you would like to help out with this plugin you can reach out to me on [@slack](http://homebridgeteam.slack.com/)

Huge Thanks to [@mkellsy](https://github.com/mkellsy) and [@homespun](https://github.com/homespun) for getting this plugin to were it is. Also a big thank you to [@oznu](https://github.com/oznu) for implimenting his zero-config portal ui for homebridge-config-ui-x.

## Installation
Option 1: Install via Homebridge Config UI X:

Search for "Honeywell Home" in homebridge-config-ui-x and click Install.

Option 2: Manually Install:

npm install -g --unsafe-perm homebridge-honeywell-home

## Configuration
Option 1:
To configure [homebridge-honeywell-home](https://www.npmjs.com/package/homebridge-honeywell-home) you must also be running [homebridge-config-ui-x](https://github.com/oznu/homebridge-config-ui-x).

* Navigate to the Plugins page in homebridge-config-ui-x.
* Click the Settings button for the Homebridge Honeywell Home plugin.
* Click the Link Account button.
* Sign in with your HoneywellHome account.
* Your account is now linked.
* Restart Homebridge for the changes to take effect.
  
<img src='honeywell/01.png' />
<img src='honeywell/02.png' />
<img src='honeywell/03.png' />

Option 2: Manually Config:

There are four values you need to put into the `credentials` object below.

The [honeywell-api](https://github.com/d0n4v4nb3ck3r/honeywell-api) repository explains how to generate these.
If you're already running `homebridge` on your system,
then you already have a `~/.homebridge/config.json` file.

```json
"platforms": [
    {
        "platform": "HoneywellHome",
        "name": "HoneywellHome",
        "credentials": {
            "consumerKey": "...",
            "consumerSecret": "...",
            "accessToken": "...",
            "refreshToken": "..."
        }
    }
]
```

Otherwise,
you are going to add a new entry to the `platforms` array.

This is a "dynamic" platform plugin,
so it will automatically look for all devices accessible to your Honeywell Home account.

## Options

The `options` line may be omitted.

If present, `options.ttl` indicates the number of seconds between polls of the Honeywell Home service.
The default is `"ttl: 60"`.

```json
"platforms": [
    {
        "platform": "HoneywellHome",
        "name": "HoneywellHome",
        "credentials": {
            "consumerKey": "...",
            "consumerSecret": "...",
            "accessToken": "...",
            "refreshToken": "..."
        },
        "options": {
            "ttl": 600,
            "verboseP": false
        }
    }
]
```
