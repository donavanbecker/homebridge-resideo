# homebridge-honeywell-home

A [Honeywell Home](https://honeywellhome.com) plugin for [Homebridge](https://homebridge.io/).

At present,
tested only on the Honeywell [T9 Smart Thermostat](https://t9.honeywellhome.com/). I assume it will work on t5/t6 Thermostats also.

## Installation

Run these commands:

    npm install -g --unsafe-perm homebridge-honeywell-home

## Configuration

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

## Credentials

There are four values you need to put into the `credentials` object above.
The [honeywell-js-setup](https://github.com/d0n4v4nb3ck3r/honeywell-js-setup) repository explains how to generate these.

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
