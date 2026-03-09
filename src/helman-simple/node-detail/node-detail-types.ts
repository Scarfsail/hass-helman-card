import type { DeviceNode } from "../../helman/DeviceNode";
import type { GridForecastDTO, HelmanUiConfig, SolarForecastDTO } from "../../helman-api";

export type NodeType = "solar" | "battery" | "grid" | "house";

export interface BatteryDetailParams {
    nodeType: "battery";
    power: number; // watts, signed (positive = charging)
    powerEntityId: string | null;
    soc: number; // %
    socEntityId: string | null;
    minSoc: number; // %
    minSocEntityId: string | null;
    maxSocEntityId: string | null;
    remainingEnergyEntityId: string | null;
    batteryProducerNode: DeviceNode | null;
    batteryConsumerNode: DeviceNode | null;
    productionNode?: DeviceNode | null;
    consumptionNode?: DeviceNode | null;
    historyBuckets: number;
    historyBucketDuration: number;
}

export interface SolarDetailParams {
    nodeType: "solar";
    power: number; // watts
    powerEntityId: string | null;
    todayEnergyEntityId: string | null;
    remainingTodayEnergyEntityId: string | null;
    solarForecast: SolarForecastDTO | null;
    gridForecast: GridForecastDTO | null;
    solarNode: DeviceNode | null;
    productionNode?: DeviceNode | null;
    historyBuckets: number;
    historyBucketDuration: number;
}

export interface GridDetailParams {
    nodeType: "grid";
    power: number; // watts, signed (positive = importing)
    powerEntityId: string | null;
    todayImportEntityId: string | null;
    todayExportEntityId: string | null;
    remainingTodayEnergyEntityId: string | null;
    solarForecast: SolarForecastDTO | null;
    gridForecast: GridForecastDTO | null;
    gridProducerNode: DeviceNode | null;
    gridConsumerNode: DeviceNode | null;
    productionNode?: DeviceNode | null;
    consumptionNode?: DeviceNode | null;
    historyBuckets: number;
    historyBucketDuration: number;
}

export interface HouseDetailParams {
    nodeType: "house";
    power: number; // watts
    powerEntityId: string | null;
    devices: DeviceNode[];
    parentPowerHistory?: number[];
    consumptionNode?: DeviceNode | null;
    historyBuckets: number;
    historyBucketDuration: number;
    uiConfig?: HelmanUiConfig;
    houseNode: DeviceNode | null;
}

export type NodeDetailParams =
    | BatteryDetailParams
    | SolarDetailParams
    | GridDetailParams
    | HouseDetailParams;
