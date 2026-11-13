import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Google Maps on Android needs an API key in the build; without one, opening a map crashes the app. */
export const mapsReady = Platform.OS !== 'android' || Constants.expoConfig?.extra?.androidMaps === true;
