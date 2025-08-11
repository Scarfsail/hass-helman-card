import type { LovelaceCardConfig } from "../hass-frontend/src/data/lovelace/config/card";
import { HouseDeviceConfig, GridDeviceConfig, BatteryDeviceConfig, SolarDeviceConfig } from "./DeviceConfig";

export interface HelmanCardConfig extends LovelaceCardConfig {
    sources_title?: string;
    consumers_title?: string;
    groups_title?: string;
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
    // Nested mapping: Category -> (Label -> Emoji/Text)
    device_label_text?: Record<string, Record<string, string>>;
    // Show groups even if they contain no devices
    show_empty_groups?: boolean;
    // Include an "Others" group with devices not matching any label in the chosen category (default true)
    show_others_group?: boolean;
    // Custom label for the Others group (default "Others")
    others_group_label?: string;
}
