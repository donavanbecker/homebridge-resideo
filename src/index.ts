import { API } from 'homebridge';
import { HoneywellHomePlatform } from './platform';
import { PLATFORM_NAME } from './settings';

/**
 * This method registers the platform with Homebridge
 */
export = (api: API): void => {
  api.registerPlatform(PLATFORM_NAME, HoneywellHomePlatform);
};
