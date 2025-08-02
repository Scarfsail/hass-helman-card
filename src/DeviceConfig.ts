interface PowerDeviceConfigBase {
    entity_id: string;
    source_name?: string;
    consumption_name?: string;
    power_sensor_label?: string;
    power_switch_label?: string;
}
export interface SolarDeviceConfig extends PowerDeviceConfigBase {
}

export interface GridDeviceConfig extends PowerDeviceConfigBase {
}

export interface HouseDeviceConfig extends PowerDeviceConfigBase {
    unmeasured_power_title?: string;
}

export interface BatteryDeviceConfig extends PowerDeviceConfigBase {
    battery_capacity_entity_id?: string;
    battery_min_soc_entity_id?: string;
    battery_max_soc_entity_id?: string;
    battery_remaining_energy_entity_id?:string;
    
}

export type DeviceConfig = SolarDeviceConfig | GridDeviceConfig | HouseDeviceConfig | BatteryDeviceConfig;
