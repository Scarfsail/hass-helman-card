import type { LovelaceCardConfig } from "../hass-frontend/src/data/lovelace/config/card";
import { HouseDeviceConfig, GridDeviceConfig, BatteryDeviceConfig, SolarDeviceConfig } from "./DeviceConfig";

export interface HelmanCardConfig extends LovelaceCardConfig {
    sources_title?: string;
    consumers_title?: string;
    max_power?:number;
    power_devices: {
        house?: HouseDeviceConfig;
        grid?: GridDeviceConfig;
        battery?: BatteryDeviceConfig;
        solar?: SolarDeviceConfig;
    };
    power_sensor_name_cleaner_regex?: string;
    history_buckets: number;
    history_bucket_duration: number;
    device_label_text?: Record<string, string>;
}
