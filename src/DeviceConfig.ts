interface PowerDeviceConfigBase {
    entities: {
        power: string;
    }
    source_name?: string;
    consumption_name?: string;
    power_sensor_label?: string;
    power_switch_label?: string;
}
export interface SolarDeviceConfig extends PowerDeviceConfigBase {
    entities:{
        power: string;
        today_energy?: string;
        remaining_today_energy_forecast?: string;
    }
}

export interface GridDeviceConfig extends PowerDeviceConfigBase {
}

export interface HouseDeviceConfig extends PowerDeviceConfigBase {
    unmeasured_power_title?: string;
}

export interface BatteryDeviceConfig extends PowerDeviceConfigBase {
    entities: {
        power: string;
        capacity?: string;
        min_soc?: string;
        max_soc?: string;
        remaining_energy?: string;
    }
}

export type DeviceConfig = SolarDeviceConfig | GridDeviceConfig | HouseDeviceConfig | BatteryDeviceConfig;
