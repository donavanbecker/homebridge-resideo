// Location
export type location = {
    locationID: number;
    name: string;
    devices: T9Thermostat;
  }
  
// T9 Thermostat
export type T9Thermostat = {
    groups: Array<groups>;
    inBuiltSensorState: inBuiltSensorState;
    settings: settings;
    deviceClass: string;
    deviceType: string;
    deviceID: string;
    userDefinedDeviceName: string;
    name: string;
    isAlive: boolean;
    priorityType: string;
    units: string;
    indoorTemperature: number;
    allowedModes: Array<string>;
    minHeatSetpoint: number;
    maxHeatSetpoint: number;
    minCoolSetpoint: number;
    maxCoolSetpoint: number;
    changeableValues: T9changeableValues;
    indoorHumidity: number;
    deviceModel: string;
  }
  
export type groups = {
    id: number;
    name: string;
    rooms: Array<number>
  }
  
export type inBuiltSensorState = {
    roomId: number;
    roomName: string;
  }
  
export type settings = {
    fan: fan;
    }

export type fan = {
    allowedModes: string;
    changeableValues: FanchangeableValues;
    }    
  
export type FanchangeableValues = {
    mode: string;
  }
  
export type T9changeableValues = {
    mode: string;
    autoChangeoverActive: boolean,
    heatSetpoint: number;
    coolSetpoint: number;
    thermostatSetpointStatus: string;
    nextPeriodTime: string;
    endHeatSetpoint: number;
    endCoolSetpoint: number;
    heatCoolMode: string;
  }

// T9 Room Sensors
export type roomsensor = {
  deviceId: string;
  groupId: number;
  rooms: rooms;
}

export type rooms = {
    id: number;
    name: string;
    type: string;
    avgTemperature: number;
    avgHumidity: number;
    accessories: accessories;
}

export type accessories = {
  accessories: Array<sensoraccessory>;
}

export type sensoraccessory = {
    accessoryId: 0;
    accessoryAttribute: accessoryAttribute;
    accessoryValue: accessoryValue;
}

export type accessoryAttribute = {
    type: string;
    name: string;
    model: string;
    serialNumber: string;
    softwareRevision: string;
    hardwareRevision: string;
}

export type accessoryValue = {
    coolSetpoint: number;
    heatSetpoint: number;
    indoorHumidity: number;
    indoorTemperature: number;
    motionDet: boolean;
    occupancyDet: boolean;
    status: string;
    batteryStatus: string;
}
