# homebridge-honeywell-home
A [Honeywell Home](https://honeywellhome.com) plugin for [Homebridge](https://homebridge.io/).

At present,
tested only on the Honeywell [T9 Smart Thermostat](https://t9.honeywellhome.com/). I assume it will work on t5/t6 Thermostats also.

# Installation
Run these commands:

    % sudo npm install -g homebridge
    % sudo npm install -g homebridge-honeywell-home

On Linux and install is not successful, run these commands

    % sudo apt-get install libpcap-dev
    % sudo npm install -g homebridge-honeywell-home

If you installed homebridge with --unsafe-perm (or want to) then install like this:

    sudo npm install -g --unsafe-perm homebridge
    sudo npm install -g --unsafe-perm homebridge-honeywell-home

If you are still experiencing issues, You may have to install git and then re-run install with root

    sudo -i
    sudo apt-get install git-core
    sudo npm install -g --unsafe-perm homebridge-honeywell-home
    
If in the end you are still experiencing issues, 

    sudo npm install -g -f --unsafe-perm homebridge-honeywell-home    
    *note* that -f is a force isntall and not recommended if you dont' have too.

# Configuration
If you're already running `homebridge` on your system,
then you already have a `~/.homebridge/config.json` file.


    "platforms"            :
      [
        { "platform"         : "homebridge-honeywell-home.HoneywellHome",
          "name"             : "HoneywellHome",
          "credentials"      :
          { "consumerKey"    : "..."
          , "consumerSecret" : "..."
          , "accessToken"    : "..."
          , "refreshToken"   : "..."
          }
      ]


Otherwise,
you are going to add a new entry to the `"platforms"` array.

This is a "dynamic" platform plugin,
so it will automatically look for all devices accessible to your Honeywell Home account.

## Credentials
There are four values you need to put into the `"credentials"` object above.
The [honeywell-js-setup](https://github.com/homespun/honeywell-js-setup) repository explains how to generate these.

## Options
The `options` line may be omitted.

If present, `options.ttl` indicates the number of seconds between polls of the Honeywell Home service.
The default is `"ttl: 60"`.



    "platforms"            :
      [
        { "platform"         : "homebridge-honeywell-home.HoneywellHome",
          "name"             : "HoneywellHome",
          "credentials"      :
          { "consumerKey"    : "..."
          , "consumerSecret" : "..."
          , "accessToken"    : "..."
          , "refreshToken"   : "..."
          },
          "options"          : { "ttl": 600, "verboseP" : false }
        }
      ]
