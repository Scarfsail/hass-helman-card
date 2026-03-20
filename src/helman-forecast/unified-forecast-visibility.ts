import type { HelmanForecastSectionVisibility } from "./HelmanForecastCardConfig";

export interface UnifiedForecastOverviewConfig {
    solarGauge: boolean;
    solarChart: boolean;
    batteryGauge: boolean;
    batteryChart: boolean;
    consumptionGauge: boolean;
    consumptionChart: boolean;
    priceChart: boolean;
}

export type UnifiedForecastOverviewPreset = "solar" | "grid" | "house" | "battery";

const EMPTY_UNIFIED_FORECAST_OVERVIEW_CONFIG: UnifiedForecastOverviewConfig = {
    solarGauge: false,
    solarChart: false,
    batteryGauge: false,
    batteryChart: false,
    consumptionGauge: false,
    consumptionChart: false,
    priceChart: false,
};

const UNIFIED_FORECAST_OVERVIEW_PRESETS: Record<UnifiedForecastOverviewPreset, UnifiedForecastOverviewConfig> = {
    solar: {
        solarGauge: true,
        solarChart: true,
        batteryGauge: false,
        batteryChart: true,
        consumptionGauge: false,
        consumptionChart: false,
        priceChart: true,
    },
    grid: {
        solarGauge: true,
        solarChart: true,
        batteryGauge: false,
        batteryChart: true,
        consumptionGauge: false,
        consumptionChart: false,
        priceChart: true,
    },
    house: {
        solarGauge: true,
        solarChart: true,
        batteryGauge: false,
        batteryChart: true,
        consumptionGauge: true,
        consumptionChart: true,
        priceChart: false,
    },
    battery: {
        solarGauge: true,
        solarChart: true,
        batteryGauge: true,
        batteryChart: true,
        consumptionGauge: false,
        consumptionChart: false,
        priceChart: false,
    },
};

export function getUnifiedForecastOverviewConfig(
    preset: UnifiedForecastOverviewPreset,
): UnifiedForecastOverviewConfig {
    const config = UNIFIED_FORECAST_OVERVIEW_PRESETS[preset];
    return {
        solarGauge: config.solarGauge,
        solarChart: config.solarChart,
        batteryGauge: config.batteryGauge,
        batteryChart: config.batteryChart,
        consumptionGauge: config.consumptionGauge,
        consumptionChart: config.consumptionChart,
        priceChart: config.priceChart,
    };
}

export function normalizeUnifiedForecastOverviewConfig(
    config: Partial<UnifiedForecastOverviewConfig>,
): UnifiedForecastOverviewConfig {
    return {
        ...EMPTY_UNIFIED_FORECAST_OVERVIEW_CONFIG,
        ...config,
    };
}

export function getUnifiedForecastSectionVisibility(
    config: UnifiedForecastOverviewConfig,
): HelmanForecastSectionVisibility {
    return {
        solar: config.solarGauge || config.solarChart,
        battery: config.batteryGauge || config.batteryChart,
        house: config.consumptionGauge || config.consumptionChart,
        price: config.priceChart,
    };
}
