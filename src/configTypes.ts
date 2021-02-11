import { PlatformConfig } from 'homebridge';

//Config
export interface HoneywellPlatformConfig extends PlatformConfig {
  credentials?: credentials;
  devicediscovery?: boolean;
  options?: options | Record<string, never>;
}

export type credentials = {
  accessToken?: any;
  consumerKey?: any;
  consumerSecret?: any;
  refreshToken?: any;
};

export type options = {
  refreshRate?: number;
  pushRate?: number;
  hide_device: string[];
  thermostat?: thermostat;
  leaksensor?: leaksensor;
  roomsensor?: roomsensor;
  roompriority?: roompriority;
};

export type thermostat = {
  hide_fan?: boolean;
  thermostatSetpointStatus?: string;
};

export type leaksensor = {
  hide_humidity?: boolean;
  hide_temperature?: boolean;
  hide_leak?: boolean;
};

export type roomsensor = {
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
  devices: Thermostat;
};

export type Thermostat = {
  groups?: Array<T9groups>;
  inBuiltSensorState?: inBuiltSensorState;
  settings: Settings;
  deviceClass: string;
  deviceType: string;
  deviceID: string;
  userDefinedDeviceName: string;
  name: string;
  isAlive: boolean;
  priorityType?: string;
  units: string;
  indoorTemperature: number;
  allowedModes: string;
  minHeatSetpoint: number;
  maxHeatSetpoint: number;
  minCoolSetpoint: number;
  maxCoolSetpoint: number;
  changeableValues: ChangeableValues;
  operationStatus: OperationStatus;
  indoorHumidity?: number;
  deviceModel: string;
  displayedOutdoorHumidity?: number;
  scheduleStatus?: string;
  allowedTimeIncrements?: number;
  isUpgrading?: boolean;
  isProvisioned?: boolean;
  macID?: string;
  dataSyncStatus?: string;
  outdoorTemperature?: number;
  deadband?: number;
  hasDualSetpointStatus?: boolean;
  thermostatVersion?: string;
  parentDeviceId?: number;
  service?: Service;
  deviceSettings?: Record<string, unknown>;
};

export type T9groups = {
  id: number;
};

export type inBuiltSensorState = {
  roomId: number;
  roomName: string;
};

// Fan Settings
export type Settings = {
  homeSetPoints?: HomeSetPoints;
  awaySetPoints?: AwaySetPoints;
  fan: Fan;
  temperatureMode?: TemperatureMode;
  specialMode?: SpecialMode;
};

export type ChangeableValues = {
  mode: string;
  autoChangeoverActive?: boolean;
  heatSetpoint: number;
  coolSetpoint: number;
  thermostatSetpointStatus?: string;
  nextPeriodTime?: string;
  endHeatSetpoint?: number;
  endCoolSetpoint?: number;
  heatCoolMode: string;
  emergencyHeatActive?: boolean;
};

export type OperationStatus = {
  mode: string;
  fanRequest?: boolean;
  circulationFanRequest?: boolean;
};

export type Service = {
  mode: string;
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
export type sensorAccessory = {
  accessoryId: number;
  accessoryAttribute: accessoryAttribute;
  accessoryValue: accessoryValue;
  roomId: number;
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
