import { PlatformConfig } from 'homebridge';

//Config
export interface HoneywellPlatformConfig extends PlatformConfig {
  credentials?: credentials;
  devicediscovery?: boolean;
  options?: options;
}

export type credentials = {
  accessToken?: any;
  consumerKey?: any;
  consumerSecret?: any;
  refreshToken?: any;
};

export type options = {
  ttl?: number;
  thermostat?: thermostat;
  leaksensor?: leaksensor;
  roomsensor?: roomsensor;
  roompriority?: roompriority;
};

export type thermostat = {
  hide?: boolean;
  hide_fan?: boolean;
  thermostatSetpointStatus?: string;
};

export type leaksensor = {
  hide?: boolean;
  hide_humidity?: boolean;
  hide_temperature?: boolean;
  hide_leak?: boolean;
};

export type roomsensor = {
  hide?: boolean;
  hide_temperature: boolean;
  hide_occupancy: boolean;
  hide_motion: boolean;
  hide_humidity: boolean;
};

export type roompriority = {
  thermostat?: boolean;
  priorityType?: string;
};

// Location
export type location = {
  locationID: number;
  name: string;
  devices: T9Thermostat | T5Device | LeakDevice | TCCDevice | RoundDevice;
};

// T9 Thermostat
export type T9Thermostat = {
  groups: Array<T9groups>;
  inBuiltSensorState: inBuiltSensorState;
  settings: Settings;
  deviceClass: string;
  deviceType: string;
  deviceID: string;
  userDefinedDeviceName: string;
  name: string;
  isAlive: boolean;
  priorityType: string;
  units: string;
  indoorTemperature: number;
  allowedModes: string;
  minHeatSetpoint: number;
  maxHeatSetpoint: number;
  minCoolSetpoint: number;
  maxCoolSetpoint: number;
  changeableValues: T9changeableValues;
  operationStatus: OperationStatusT9;
  indoorHumidity: number;
  deviceModel: string;
};

export type OperationStatusT9 = {
  mode: string;
  fanRequest: boolean;
  circulationFanRequest: boolean;
};

export type T9groups = {
  id: number;
};

export type inBuiltSensorState = {
  roomId: number;
  roomName: string;
};

export type T9changeableValues = {
  mode: string;
  autoChangeoverActive: boolean;
  heatSetpoint: number;
  coolSetpoint: number;
  thermostatSetpointStatus: string;
  nextPeriodTime: string;
  endHeatSetpoint: number;
  endCoolSetpoint: number;
  heatCoolMode: string;
};

// T5 Thermostat
export type T5Device = {
  displayedOutdoorHumidity: number;
  scheduleStatus: string;
  allowedTimeIncrements: number;
  settings: Settings;
  deviceClass: string;
  deviceType: string;
  deviceID: string;
  userDefinedDeviceName: string;
  name: string;
  isAlive: boolean;
  isUpgrading: boolean;
  isProvisioned: boolean;
  macID: string;
  dataSyncStatus: string;
  units: string;
  indoorTemperature: number;
  outdoorTemperature: number;
  allowedModes: string;
  deadband: number;
  hasDualSetpointStatus: boolean;
  minHeatSetpoint: number;
  maxHeatSetpoint: number;
  minCoolSetpoint: number;
  maxCoolSetpoint: number;
  changeableValues: T5ChangeableValues;
  operationStatus: OperationStatusT5;
  deviceModel: string;
};

export type T5ChangeableValues = {
  mode: string;
  autoChangeoverActive: boolean;
  heatSetpoint: number;
  coolSetpoint: number;
  thermostatSetpointStatus: string;
  heatCoolMode: string;
};

export type OperationStatusT5 = {
  mode: string;
  fanRequest: boolean;
  circulationFanRequest: boolean;
};

// TCC (Unknown) Thermostat
export type TCCDevice = {
  thermostatVersion: string;
  scheduleStatus: string;
  settings: Settings;
  deviceClass: string;
  deviceType: string;
  deviceID: string;
  userDefinedDeviceName: string;
  name: string;
  isAlive: boolean;
  isUpgrading: boolean;
  isProvisioned: boolean;
  macID: string;
  parentDeviceId: number;
  service: Service;
  units: string;
  indoorTemperature: number;
  outdoorTemperature: number;
  allowedModes: string;
  hasDualSetpointStatus: boolean;
  minHeatSetpoint: number;
  maxHeatSetpoint: number;
  minCoolSetpoint: number;
  maxCoolSetpoint: number;
  changeableValues: TCC_ChangeableValues;
  operationStatus: OperationStatusTCC;
  indoorHumidity: number;
  deviceModel: string;
};

export type OperationStatusTCC = {
  mode: string;
};

export type TCC_ChangeableValues = {
  mode: string;
  heatSetpoint: number;
  coolSetpoint: number;
  thermostatSetpointStatus: string;
  nextPeriodTime: string;
  heatCoolMode: string;
};

export type Service = {
  mode: string;
};

// Round Thermostat
export type RoundDevice = {
  thermostatVersion: string;
  settings: RoundSettings;
  deviceClass: string;
  deviceType: string;
  deviceID: string;
  userDefinedDeviceName: string;
  name: string;
  isAlive: boolean;
  macID: string;
  deviceSettings: Record<string, unknown>;
  service: Service;
  units: string;
  indoorTemperature: number;
  outdoorTemperature: number;
  allowedModes: string;
  hasDualSetpointStatus: boolean;
  minHeatSetpoint: number;
  maxHeatSetpoint: number;
  minCoolSetpoint: number;
  maxCoolSetpoint: number;
  changeableValues: RoundChangeableValues;
  operationStatus: OperationStatusTCC;
  indoorHumidity: number;
  deviceModel: string;
};

export type RoundChangeableValues = {
  mode: string;
  autoChangeoverActive: boolean;
  emergencyHeatActive: boolean;
  heatSetpoint: number;
  coolSetpoint: number;
  heatCoolMode: string;
};

export type RoundSettings = {
  homeSetPoints: HomeSetPoints;
  awaySetPoints: AwaySetPoints;
  fan: Fan;
  temperatureMode: TemperatureMode;
  specialMode: SpecialMode;
};

export type AwaySetPoints = {
  awayHeatSP: number;
  awayCoolSP: number;
  smartCoolSP: number;
  smartHeatSP: number;
  useAutoSmart: boolean;
  units: string;
};

export type HomeSetPoints = {
  homeHeatSP: number;
  homeCoolSP: number;
  units: string;
};

export type TemperatureMode = {
  feelsLike: boolean;
  air: boolean;
};

export type SpecialMode = {
  autoChangeoverActive: boolean;
  emergencyHeatActive: boolean;
};

// Fan Settings
export type Settings = {
  fan: Fan;
};

export type Fan = {
  allowedModes: string;
  changeableValues: FanChangeableValues;
  fanRunning: boolean;
};

export type FanChangeableValues = {
  mode: string;
};

// Leak Sensor
export type LeakDevice = {
  waterPresent: boolean;
  currentSensorReadings: CurrentSensorReadings;
  batteryRemaining: number;
  isRegistered: boolean;
  hasDeviceCheckedIn: boolean;
  isDeviceOffline: boolean;
  deviceClass: string;
  deviceType: string;
  deviceID: string;
  userDefinedDeviceName: string;
  isAlive: boolean;
  deviceSettings: DeviceSettings;
  service: Service;
};

export type DeviceSettings = {
  temp: Temp;
  humidity: Humidity;
  userDefinedName: string;
  buzzerMuted: boolean;
  checkinPeriod: number;
  currentSensorReadPeriod: number;
};

export type Humidity = {
  high: Record<string, unknown>;
  low: Record<string, unknown>;
};

export type CurrentSensorReadings = {
  temperature: number;
  humidity: number;
};

export type Temp = {
  high: Record<string, unknown>;
  low: Record<string, unknown>;
};

// T9 Room Sensors
export type sensoraccessory = {
  accessoryId: number;
  accessoryAttribute: accessoryAttribute;
  accessoryValue: accessoryValue;
};

export type accessoryAttribute = {
  type: string;
  connectionMethod: string;
  name: string;
  model: string;
  serialNumber: string;
  softwareRevision: string;
  hardwareRevision: string;
};

export type accessoryValue = {
  coolSetpoint: number;
  heatSetpoint: number;
  indoorHumidity: number;
  indoorTemperature: number;
  motionDet: boolean;
  occupancyDet: boolean;
  excludeTemp: boolean;
  excludeMotion: boolean;
  pressure: number;
  occupancyTimeout: number;
  status: string;
  batteryStatus: string;
  rssiAverage: number;
  occupancySensitivity: string;
};

// T9 Room Priority
export type Priority = {
  deviceId: string;
  status: string;
  currentPriority: CurrentPriority;
};

export type CurrentPriority = {
  priorityType: string;
  selectedRooms: Record<string, unknown>;
  rooms: PriorityRooms[];
};

export type PriorityRooms = {
  rooms: PriorityRoom;
};

export type PriorityRoom = {
  id: number;
  roomName: string;
  roomAvgTemp: number;
  roomAvgHumidity: number;
  overallMotion: boolean;
  accessories: Accessory[];
};

export type Accessory = {
  id: number;
  type: string;
  excludeTemp: boolean;
  excludeMotion: boolean;
  temperature: number;
  status: string;
  detectMotion: boolean;
};

export interface AxiosRequestConfig {
  params?: Record<string, unknown>;
  headers?: any;
}
