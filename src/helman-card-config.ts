import type { LovelaceCardConfig } from "../hass-frontend/src/data/lovelace/config/card";

export interface PowerEntityConfig {
    entity_id: string;
    source_name?: string;
    consumption_name?: string;
    power_sensor_label?: string;
    power_switch_label?: string;
    unmeasured_power_title?: string;
}
export interface BatteryPowerEntityConfig extends PowerEntityConfig {
    battery_capacity_entity_id?: string;
}

export interface HelmanCardConfig extends LovelaceCardConfig {
    sources_title?: string;
    consumers_title?: string;
    power_entities: {
        house?: PowerEntityConfig;
        grid?: PowerEntityConfig;
        battery?: BatteryPowerEntityConfig;
        solar?: PowerEntityConfig;
    };
    power_sensor_name_cleaner_regex?: string;
    history_buckets: number;
    history_bucket_duration: number;
}
