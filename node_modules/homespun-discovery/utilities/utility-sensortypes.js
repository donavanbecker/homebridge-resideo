/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

var readingAbove = function (value) {
    return { category : 'reading', condition : { operator : '>' , value  : value } }
}

var readingBelow = function (value) {
    return { category : 'reading', condition : { operator : '<' , value  : value } }
}

var readingEquals = function (value) {
    return { category : 'reading', condition : { operator : '==', value  : value } }
}

module.exports =
{ altitude        : { field     : 'altitude',        type : 'float',       units : 'meters'
                    , domain    : { lower : -130.0, upper : 10870.0 }                                }
, airflow         : { field     : 'airflow',         type : 'float',       units : 'meters/second'
                    , domain    : { lower :    0.0, upper : 135.0 }                                  }
, aqi             : { field     : 'aqi',             type : 'percentage'
                    , name      : 'AQ index'
                    , readings  : [ readingBelow(0.11), readingAbove(0.19) ]                         }
// most likely MQ-135
, 'aqi.σ'         : { field     : 'aqi.σ',           type : 'float',       units : 'sigmas'          }
, battery_level   : { field     : 'battery_level',   type : 'percentage'
                    , aggregate : 'none'                                                             }
, battery_low     : { field     : 'battery_low',     type : 'boolean'                                }
, brightness      : { field     : 'brightness',      type : 'percentage'                             }
, co              : { field     : 'co',              type : 'float',       units : 'ppm'
                    , name      : 'CO'
                    , domain    : { lower :    0.0, upper : 200.0 }
                    , readings  : [ readingAbove(5.0) ]                                              }
// most likely MQ-7
, 'co.σ'          : { field     : 'co.σ',            type : 'float',       units : 'sigmas'          }
, co2             : { field     : 'co2',             type : 'float',       units : 'ppm'
                    , name      : 'CO\u2082'
                    , domain    : { lower :    0.0, upper : 15000.0 }
                    , readings  : [ readingAbove(5000.0) ]                                           }
, 'co2.σ'         : { field     : 'co2.σ',           type : 'float',       units : 'sigmas'          }
, contact         : { field     : 'contact',         type : 'boolean'
                    , readings  : true                                                               }
, distance        : { field     : 'distance',        type : 'float',       units : 'meters'
                    , domain    : { lower :    0.0, upper : 50000.0 }                                }
, flame_detected  : { field     : 'flame_detected',  type : 'boolean'
                    , readings  : true                                                               }
, floodlight      : { field     : 'floodlight',      type : 'boolean'
                    , readings  : true                                                               }
, 'flow.σ'        : { field     : 'flow.σ',          type : 'float',       units : 'sigmas'          }
// most likely MQ-5 (LPG)
, 'gas.σ'         : { field     : 'gas.σ',           type : 'float',       units : 'sigmas'          }
, gustheading     : { field     : 'gustheading',     type : 'float',       units : 'degrees'
                    , domain    : { lower :    0.0, upper : 360.0 }                                  }
, gustvelocity    : { field     : 'gustvelocity',    type : 'float',       units : 'meters/second'
                    , domain    : { lower :    0.0, upper : 150.0 }                                  }

, hcho            : { field     : 'hcho',            type : 'float',       units : 'ppm'
                    , domain    : { lower :    0.0, upper : 20.0 }                                   }
, 'hcho.σ'        : { field     : 'hcho.σ',          type : 'float',       units : 'sigmas'          }
, humidity        : { field     : 'humidity',        type : 'percentage'
                    , readings  : [ readingBelow(0.45), readingAbove(0.55) ]                         }
, hydrogen        : { field     : 'hydrogen',        type : 'float',       units : 'ppm'             }
// most likely MQ-8
, 'hydrogen.σ'    : { field     : 'hydrogen.σ',      type : 'float',       units : 'sigmas'          }
, light           : { field     : 'light',           type : 'float',       units : 'lux'
                    , abbrev    : 'lx'                                                               }
, liquid_detected : { field     : 'liquid_detected', type : 'boolean'
                    , readings  : true                                                               }
, location        : { field     : 'location',        type : 'quad',        units : 'coordinates'     }
, methane         : { field     : 'methane',         type : 'float',       units : 'ppm'             }
// most likely MQ-5
, 'methane.σ'     : { field     : 'methane.σ',       type : 'float',       units : 'sigmas'          }
, moisture        : { field     : 'moisture',        type : 'percentage'                             }
, motion_detected : { field     : 'motion_detected', type : 'boolean'
                    , readings  : true                                                               }
, no              : { field     : 'no',              type : 'float',       units : 'ppm'
                    , name      : 'NO'                                                               }
, 'no.σ'          : { field     : 'no.σ',            type : 'float',       units : 'sigmas'          }
, no2             : { field     : 'no2',             type : 'float',       units : 'ppm'
                    , name      : 'NO\u2082'
                    , readings  : [ readingAbove(5.0) ]                                              }
, 'no2.σ'         : { field     : 'no2.σ',           type : 'float',       units : 'sigmas'          }
, noise           : { field     : 'noise',           type : 'float',       units : 'decibels'
                    , abbrev    : 'dB'
                    , readings  : [ readingAbove(60.0) ]                                             }
, o3              : { field     : 'o3',              type : 'float',       units : 'ppb'
                    , name      : 'ozone'
                    , readings  : [ readingAbove(100.0) ]                                            }
, opened          : { field     : 'opened',          type : 'boolean'
                    , readings  : true                                                               }
, 'particles.2_5' : { field     : 'particles.2_5',   type : 'float'
                    , units     : 'micrograms/cubicmeters'
                    , name      : 'particles μm'
                    , abbrev    : 'µg/m\u00B3'
                    , readings  : [ readingAbove(2.5) ]                                              }
, particulates    : { field     : 'particulates',    type : 'float'
                    , units     : 'particles/cubicmeters'                                            }
, pH              : { field     : 'pH',              type : 'float',       units : 'pH'
                    , domain    : { lower :    2.5, upper : 10.5 }                                   }
, powered         : { field     : 'powered',         type : 'boolean'                                }
, pressed         : { field     : 'pressed',         type : 'boolean'
                    , readings  : [ readingEquals(true) ]                                            }
, pressure        : { field     : 'pressure',        type : 'float',       units : 'millibars'
                    , domain    : { lower :  945.0, upper : 1081.0 }                                 }
, rainfall        : { field     : 'rainfall',        type : 'float',       units : 'millimeters'
                    , domain    : { lower :    0.0, upper : 1000.0 }                                 }
, ringing         : { field     : 'ringing',         type : 'boolean'
                    , readings  : true                                                               }
, signal          : { field     : 'signal',          type : 'percentage'
                    , aggregate : 'none'                                                             }
, smoke           : { field     : 'smoke',           type : 'float',       units : 'ppm'             }
, 'smoke.σ'       : { field     : 'smoke.σ',         type : 'float',       units : 'sigmas'          }
, so2             : { field     : 'so2',             type : 'float',       units : 'ppb'
                    , name      : 'SO\u2082'
                    , readings  : [ readingAbove(5000.0) ]                                           }
, sonority        : { field     : 'sonority',        type : 'percentage'                             }
, tamper_detected : { field     : 'tamper_detected', type : 'boolean'
                    , readings  : [ readingEquals(true) ]                                            }
, temperature     : { field     : 'temperature',     type : 'float',       units : 'celcius'
                    , abbrev    : '°C'
                    , domain    : { lower :    5.0, upper : 45.0 }
                    , readings  : [ readingBelow(10.0), readingAbove(35.0) ]                         }
, uvi             : { field     : 'uvi',             type : 'float',       units : 'uv-index'
                    , name      : 'UV index'
                    , domain    : { lower :    0.0, upper : 12.0 }                                   }
, vapor           : { field     : 'vapor',           type : 'float',       units : 'ppm'             }
// most likely MQ-3 (alcohol)
, 'vapor.σ'       : { field     : 'vapor.σ',         type : 'float',       units : 'sigmas'          }
, velocity        : { field     : 'velocity',        type : 'float',       units : 'meters/second'
                    , domain    : { lower :    0.0, upper : 135.0 }                                  }
, vibration       : { field     : 'vibration',       type : 'boolean'
                    , readings  : true                                                               }
, voc             : { field     : 'voc',             type : 'float',       units : 'ppb'
                    , name      : 'Volatile Organics'
                    , readings  : [ readingAbove(1.0) ]                                              }
, windheading     : { field     : 'windheading',     type : 'float',       units : 'degrees'
                    , domain    : { lower :    0.0, upper : 360.0 }                                  }
, windvelocity    : { field     : 'windvelocity',    type : 'float',       units : 'meters/second'
                    , domain    : { lower :    0.0, upper : 135.0 }                                  }
}
