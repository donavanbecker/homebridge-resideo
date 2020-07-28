# Changelog

All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/)

## [Version 6.0.0](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v5.1.1...v6.0.0) (2020-07-28)

### Major Changes

- Converted project to Typscript.
- Changed the way that devices are found.

### Other Changes
- Created a plugin that can add T9 Thermostat: [homebridge-honeywell-home-roomsensors](https://github.com/donavanbecker/homebridge-honeywell-home-roomsensors).
- Find firmware of device at startup and add to accessory context.
- removed provisioning criteria for Honeywell Round Thermostats to be added to plugin.

## [Version 5.1.1](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v5.1.0...v5.1.1) (2020-07-15)

### Changes

- Added more logging for offline devices

  - now displays deviceID.
  - now displays if device is Alive, Provisioned, and Class `Thermostat`.

## [Version 5.1.0](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v5.0.7...v5.1.0) (2020-07-14)

#### Feature Change

- Added Support for Fan Control: `Auto`, `Circulate`, and `On`.
  - If Target Fan Mode is `MANUAL` and Active is `ACTIVE` in Homekit, then the fan will be set to Honywell Mode `On`.
  - If Target Fan Mode is `MANUAL` and Active is `INACTIVE` in Homekit, then the fan will be set to Honywell Mode `Circulate`.
  - If Target Fan Mode is `AUTO` and Active is `INACTIVE` in Homekit, then the fan will be set to Honywell Mode `Auto`.
  - If Target Fan Mode is `AUTO` and Active is `ACTIVE` in Homekit, then the fan will be set to Honywell Mode `Auto`.

## [Version 5.0.7](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v5.0.6...v5.0.7) (2020-07-07)

#### Changes

- update dependencies

## [Version 5.0.6](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v5.0.5...v5.0.6) (2020-05-13)

#### Changes

- repo updates, no new features or bug fixes.

## [Version 5.0.5](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v5.0.4...v5.0.5) (2020-04-11)

#### Changes

- update engine dependencies

## [Version 5.0.4](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v5.0.3...v5.0.4) (2020-04-11)

#### Changes

- remove devDependencies for homebridge-config-ui-x and homebridge
- update node engine dependencies

## [Version 5.0.3](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v5.0.2...v5.0.3) (2020-04-08)

#### Changes

- Update devDependencies for homebridge-config-ui-x and homebridge

## [Version 5.0.2](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v5.0.1...v5.0.2) (2020-03-30)

#### Changes

- Pin dependencies [\#140](https://github.com/donavanbecker/homebridge-honeywell-home/pull/140) ([renovate[bot]](https://github.com/apps/renovate))

## [Version 5.0.1](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v5.0.0...5.0.1) (2020-03-26)

#### Changes

- Honeywell - "rate limit has been exhausted" [\#106](https://github.com/donavanbecker/homebridge-honeywell-home/issues/106)
- 5.0.1 [\#131](https://github.com/donavanbecker/homebridge-honeywell-home/pull/131) ([donavanbecker](https://github.com/donavanbecker))
- Update angularcli monorepo [\#130](https://github.com/donavanbecker/homebridge-honeywell-home/pull/130) ([renovate[bot]](https://github.com/apps/renovate))
- Update angularcli monorepo [\#129](https://github.com/donavanbecker/homebridge-honeywell-home/pull/129) ([renovate[bot]](https://github.com/apps/renovate))
- Update angularcli monorepo [\#128](https://github.com/donavanbecker/homebridge-honeywell-home/pull/128) ([renovate[bot]](https://github.com/apps/renovate))
- Update angularcli monorepo [\#127](https://github.com/donavanbecker/homebridge-honeywell-home/pull/127) ([renovate[bot]](https://github.com/apps/renovate))
- Update angularcli monorepo [\#126](https://github.com/donavanbecker/homebridge-honeywell-home/pull/126) ([renovate[bot]](https://github.com/apps/renovate))
- Labeler - Workflow [\#125](https://github.com/donavanbecker/homebridge-honeywell-home/pull/125) ([donavanbecker](https://github.com/donavanbecker))
- Stale - Workflow [\#124](https://github.com/donavanbecker/homebridge-honeywell-home/pull/124) ([donavanbecker](https://github.com/donavanbecker))
- Update angular monorepo to v9.1.0 [\#123](https://github.com/donavanbecker/homebridge-honeywell-home/pull/123) ([renovate[bot]](https://github.com/apps/renovate))
- Update dependency @types/node to v12.12.31 [\#122](https://github.com/donavanbecker/homebridge-honeywell-home/pull/122) ([renovate[bot]](https://github.com/apps/renovate))
- Update dependency helmet to v3.22.0 [\#121](https://github.com/donavanbecker/homebridge-honeywell-home/pull/121) ([renovate[bot]](https://github.com/apps/renovate))
- Update dependency @types/jasmine to v3.5.10 [\#120](https://github.com/donavanbecker/homebridge-honeywell-home/pull/120) ([renovate[bot]](https://github.com/apps/renovate))
- Merge from Master [\#119](https://github.com/donavanbecker/homebridge-honeywell-home/pull/119) ([donavanbecker](https://github.com/donavanbecker))
- Merge From Master [\#118](https://github.com/donavanbecker/homebridge-honeywell-home/pull/118) ([donavanbecker](https://github.com/donavanbecker))

## [Version 5.0.0](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v4.4.4...5.0.0) (2020-03-22)

#### Features

- workflow to beta [\#113](https://github.com/donavanbecker/homebridge-honeywell-home/pull/113) ([donavanbecker](https://github.com/donavanbecker))
- Secrets, Minimum TTL, Logging, Update Readme, and Changelog.md [\#112](https://github.com/donavanbecker/homebridge-honeywell-home/pull/112) ([donavanbecker](https://github.com/donavanbecker))
- Secrets, Minimum TTL and Logging [\#110](https://github.com/donavanbecker/homebridge-honeywell-home/pull/110) ([oznu](https://github.com/oznu))

#### Dependency Updates

- Update dependency ts-node to v8.8.1 [\#114](https://github.com/donavanbecker/homebridge-honeywell-home/pull/114) ([renovate[bot]](https://github.com/apps/renovate))
- Update dependency ts-node to v8.8.0 [\#111](https://github.com/donavanbecker/homebridge-honeywell-home/pull/111) ([renovate[bot]](https://github.com/apps/renovate))

## [Version 4.4.4](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v4.4.3...v4.4.4) (2020-03-20)

#### Dependency Updates

- Update angularcli monorepo [#109](https://github.com/donavanbecker/homebridge-honeywell-home/pull/109)
- Update dependency ts-node to v8.7.0 [#108](https://github.com/donavanbecker/homebridge-honeywell-home/pull/108)
- Update angular monorepo to v9.0.7 [#107](https://github.com/donavanbecker/homebridge-honeywell-home/pull/107)
- Update dependency zone.js to v0.10.3 [#105](https://github.com/donavanbecker/homebridge-honeywell-home/pull/105)

## [Version 4.4.3](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v4.4.2...v4.4.3) (2020-03-16)

#### Security Update

- Minimist Vulnerability Update from 1.2.0 to 1.2.5

## [Version 4.4.2](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v4.4.1...v4.4.2) (2020-03-14)

#### Dependency Updates

- Security Bump - minimist from 1.2.0 to 1.2.5 [#104](https://github.com/donavanbecker/homebridge-honeywell-home/pull/104)
- Update dependency @types/node to v12.12.30 [#103](https://github.com/donavanbecker/homebridge-honeywell-home/pull/103)
- Update dependency tslint to v6 [#101](https://github.com/donavanbecker/homebridge-honeywell-home/pull/101)
- Update angularcli monorepo [#100](https://github.com/donavanbecker/homebridge-honeywell-home/pull/100)
- Update angular monorepo to v9.0.6 [#99](https://github.com/donavanbecker/homebridge-honeywell-home/pull/99)
- Update dependency @types/jasmine to v3.5.9 [#98](https://github.com/donavanbecker/homebridge-honeywell-home/pull/98)

## [Version 4.4.1](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v4.4.0...v4.4.1) (2020-03-06)

#### Update to Config Schema to Support [Version 4.4.0](https://github.com/donavanbecker/homebridge-honeywell-home/releases/tag/v4.4.0) Rate limit Update

- Please refrain from setting your optional `ttl` config lower then 1800, to better support everyone that uses this plugin.

## [Version 4.4.0](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v4.3.2...v4.4.0) (2020-03-06)

#### Honeywell Rate Limit

##### Made a [change](https://github.com/donavanbecker/homebridge-honeywell-home/blob/0ab08b50288b84faf40263952a85f3f5727f8e0e/index.js#L80) to the rate limit to better serve all users of this plugin that use it with [Config UI X](https://github.com/oznu/homebridge-config-ui-x)

- Hopefully this will help lower the `rate limit has been exhausted` log you may be getting.
- Please change your configs and `ttl` setting to be 1800 or more if you are setting it in options.

## [Version 4.3.2](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v4.3.1...v4.3.2) (2020-03-05)

#### Dependency Updates

- Update dependency @types/jasmine to v3.5.8 [#97](https://github.com/donavanbecker/homebridge-honeywell-home/pull/97)
- Update angularcli monorepo [#96](https://github.com/donavanbecker/homebridge-honeywell-home/pull/96)
- Update angular monorepo to v9.0.5 [#95](https://github.com/donavanbecker/homebridge-honeywell-home/pull/95)
- Update dependency typescript to v3.8.3 [#94](https://github.com/donavanbecker/homebridge-honeywell-home/pull/94)
- Update dependency @types/node to v12.12.29 [#93](https://github.com/donavanbecker/homebridge-honeywell-home/pull/93)
- Update angularcli monorepo [#92](https://github.com/donavanbecker/homebridge-honeywell-home/pull/92)
- Update angular monorepo to v9.0.4 [#91](https://github.com/donavanbecker/homebridge-honeywell-home/pull/91)
- Update dependency @types/jasmine to v3.5.7 [#90](https://github.com/donavanbecker/homebridge-honeywell-home/pull/90)
- Update dependency helmet to v3.21.3 [#89](https://github.com/donavanbecker/homebridge-honeywell-home/pull/89)

## [Version 4.3.1](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v4.3.0...v4.3.1) (2020-02-21)

#### Dependency Updates

- Update dependency typescript to v3.8.2 [#87](https://github.com/donavanbecker/homebridge-honeywell-home/pull/87)
- Update angularcli monorepo [#86](https://github.com/donavanbecker/homebridge-honeywell-home/pull/86)
- Update angular monorepo to v9.0.2 [#85](https://github.com/donavanbecker/homebridge-honeywell-home/pull/85)
- Update dependency @types/node to v12.12.28 [#84](https://github.com/donavanbecker/homebridge-honeywell-home/pull/84)
- Update dependency @types/jasmine to v3.5.6 [#83](https://github.com/donavanbecker/homebridge-honeywell-home/pull/83)

## [Version 4.3.0](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v4.2.0...v4.3.0) (2020-02-15)

#### Major Dependency Updates

- Update dependency @types/jasmine to v3.5.4 [#81](https://github.com/donavanbecker/homebridge-honeywell-home/pull/81)
- Update angularcli monorepo [#80](https://github.com/donavanbecker/homebridge-honeywell-home/pull/80)
- Update angular monorepo to v9.0.1 [79](https://github.com/donavanbecker/homebridge-honeywell-home/pull/79)
- Update dependency @types/node to v12.12.27 [78](https://github.com/donavanbecker/homebridge-honeywell-home/pull/78)
- Update dependency request to v2.88.2 [77](https://github.com/donavanbecker/homebridge-honeywell-home/pull/77)
- Bump request from 2.88.0 to 2.88.2 [76](https://github.com/donavanbecker/homebridge-honeywell-home/pull/76)
- Update dependency rimraf to v3.0.2 [75](https://github.com/donavanbecker/homebridge-honeywell-home/pull/75)
- Update dependency @auth0/angular-jwt to v4 [74](https://github.com/donavanbecker/homebridge-honeywell-home/pull/74)

## [Version 4.2.0](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v4.1.1...v4.2.0) (2020-02-06)

#### Major Dependency Updates

- Update dependency @types/jasmine to v3.5.3 [#70](https://github.com/donavanbecker/homebridge-honeywell-home/pull/70)
- Update dependency @angular-devkit/build-angular to v0.900.1 [#71](https://github.com/donavanbecker/homebridge-honeywell-home/pull/71)
- Update dependency @angular/cli to v9 [#72](https://github.com/donavanbecker/homebridge-honeywell-home/pull/72)
- Update angular monorepo to v9 (major) [#73](https://github.com/donavanbecker/homebridge-honeywell-home/pull/73)

## [Version 4.1.1](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v4.1.0...v4.1.1) (2020-01-23)

- Update API Refresh to 10 minute minimum so that all users don't get refresh token errors.
- Updated Dependencies

## [Version 4.1.0](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v4.0.4...v4.1.0) (2020-01-18)

- Updated the API refresh so that it is to Honeywell's standards.

## [Version 4.0.4](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v4.0.3...v4.0.4) (2020-01-17)

- Update Dependencies.

## [Version 4.0.3](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v4.0.2...v4.0.3) (2020-01-16)


- Update dependencies and working on adding Changelog.

## [Version 4.0.2](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v4.0.1...v4.0.2) (2020-01-10)

- Update on dependencies.

## [Version 4.0.1](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v4.0.0...v4.0.1) (2020-01-09) 

- Updated dependencies and wiki link on Readme.

## [Version 4.0.0](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v3.0.5...v4.0.0) (2020-01-07)

- Updated Readme
- Adds the capability to write to the Honeywell Home API

## [Version 3.0.5](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v3.0.4...v3.0.5) (2020-01-04)

- Update dependencies and add node_module cache to github Publish

## [Version 3.0.4](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v3.0.3...v3.0.4) (2020-01-04)

- Updated Dependencies

## [Version 3.0.3](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v3.0.2...v3.0.3) (2020-01-03)

- Update Plugin Title

## [Version 3.0.2](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v3.0.1...v3.0.2) (2020-01-03)

- Just updated the Readme with Badges

## [Version 3.0.1](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v3.0.0...v3.0.1) (2020-01-02)

- Fixed GitHub Link and removed platform.config.json

## [Version 3.0.0](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v2.6.1...v3.0.0) (2020-01-02)

- Adds [@oznu](https://github.com/oznu)‘s zero-config portal ui for [homebridge-config-ui-x](https://github.com/oznu/homebridge-config-ui-x)

## [Version 2.6.1](https://github.com/donavanbecker/homebridge-honeywell-home/compare/v2.3.0...v2.6.1) (2020-01-01)

- Added GitHub Action to Publish to NPM

## [Version 2.3.0](https://github.com/donavanbecker/homebridge-honeywell-home/compare/d302603ed1...v2.3.0) (2019-12-31)

- Updated Platform Name to HoneywellHome

## Before 2.3.0

### No Changelog

- No Changelog before 2.3.0
