/**
 * Backend API types for the helman integration.
 *
 * Both helman-card and helman-simple-card communicate with the same
 * helman backend via Home Assistant WebSocket. This file contains the
 * shared DTO definitions and value-type helpers.
 */

// ── Value type ────────────────────────────────────────────────────────────────

export type ValueType = "default" | "positive" | "negative";

/**
 * Applies a ValueType transformation to a raw sensor reading.
 * - "positive": clamps to ≥ 0  (e.g. solar production)
 * - "negative": returns absolute value of the negative part (e.g. battery discharge)
 * - "default":  returns the raw value unchanged
 */
export function applyValueType(raw: number, vt: ValueType): number {
    if (vt === "positive") return Math.max(0, raw);
    if (vt === "negative") return Math.abs(Math.min(0, raw));
    return raw;
}

// ── Device node DTOs ──────────────────────────────────────────────────────────

/** Fields present on every device node returned by helman/get_device_tree. */
export interface DeviceNodeDTOBase {
    id: string;
    powerSensorId: string | null;
    valueType: ValueType;
    sourceConfig: any | null;
    sourceType: string | null;
    children: DeviceNodeDTOBase[];
}

/** Full device node DTO — includes all fields used by helman-card. */
export interface DeviceNodeDTO extends DeviceNodeDTOBase {
    displayName: string;
    switchEntityId: string | null;
    isSource: boolean;
    isUnmeasured: boolean;
    labels: string[];
    labelBadgeTexts: string[];
    color: string | null;
    icon: string | null;
    compact: boolean;
    showAdditionalInfo: boolean;
    childrenFullWidth: boolean;
    hideChildren: boolean;
    hideChildrenIndicator: boolean;
    sortChildrenByPower: boolean;
    children: DeviceNodeDTO[];
    ratioSensorId: string | null;
}

// ── UI config (part of the tree payload) ─────────────────────────────────────

export interface HelmanUiConfig {
    sources_title: string;
    consumers_title: string;
    groups_title: string;
    others_group_label: string;
    show_empty_groups?: boolean;
    show_others_group?: boolean;
    device_label_text: Record<string, Record<string, string>>;
    history_buckets: number;
    history_bucket_duration: number;
}

// ── WebSocket message payloads ────────────────────────────────────────────────

/** Response type for the "helman/get_device_tree" WebSocket command. */
export interface TreePayload {
    sources: DeviceNodeDTO[];
    consumers: DeviceNodeDTO[];
    consumptionTotalSensorId: string | null;
    productionTotalSensorId: string | null;
    uiConfig: HelmanUiConfig;
}

/** Response type for the "helman/get_history" WebSocket command. */
export interface HistoryPayload {
    buckets: number;
    bucket_duration: number;
    entity_history: Record<string, number[]>;
}

export type ForecastStatus =
    | "not_configured"
    | "insufficient_history"
    | "unavailable"
    | "partial"
    | "available";

export type ForecastGranularity = 15 | 30 | 60;

export type ForecastResolution = "quarter_hour" | "half_hour" | "hour";

export interface ForecastPointDTO {
    timestamp: string;
    value: number;
}

export interface SolarForecastDTO {
    status: ForecastStatus;
    unit: string | null;
    resolution: ForecastResolution;
    horizonHours: number;
    remainingTodayKwh?: number | null;
    remainingTodayEnergyEntityId?: string | null;
    actualHistory: ForecastPointDTO[];
    points: ForecastPointDTO[]; // forecast points at the returned response granularity
}

export interface GridForecastDTO {
    status: ForecastStatus;
    unit: string | null;
    resolution: ForecastResolution;
    horizonHours: number;
    currentSellPrice: number | null;
    points: ForecastPointDTO[];
}

export interface ForecastBandValueDTO {
    value: number;
    lower: number;
    upper: number;
}

export interface DeferrableConsumerHourValueDTO {
    entityId: string;
    label: string;
    value: number;
    lower: number;
    upper: number;
}

export interface HouseConsumptionForecastHourDTO {
    timestamp: string;
    nonDeferrable: ForecastBandValueDTO;
    deferrableConsumers: DeferrableConsumerHourValueDTO[];
}

export interface HouseConsumptionActualValueDTO {
    value: number;
}

export interface HouseConsumptionActualConsumerHourDTO {
    entityId: string;
    label: string;
    value: number;
}

export interface HouseConsumptionActualHourDTO {
    timestamp: string;
    nonDeferrable: HouseConsumptionActualValueDTO;
    deferrableConsumers: HouseConsumptionActualConsumerHourDTO[];
}

export interface HouseConsumptionForecastDTO {
    status: ForecastStatus;
    generatedAt: string | null;
    unit: string;
    resolution: ForecastResolution;
    horizonHours: number;
    trainingWindowDays: number;
    historyDaysAvailable: number;
    requiredHistoryDays: number;
    model: string | null;
    actualHistory: HouseConsumptionActualHourDTO[];
    currentSlot?: HouseConsumptionForecastHourDTO;
    currentHour?: HouseConsumptionForecastHourDTO;
    series: HouseConsumptionForecastHourDTO[];
}

export interface BatteryCapacityActualHourDTO {
    timestamp: string;
    startSocPct: number;
    socPct: number;
}

export interface BatteryCapacityForecastHourDTO {
    timestamp: string;
    durationHours: number;
    solarKwh: number;
    baselineHouseKwh: number;
    netKwh: number;
    chargedKwh: number;
    dischargedKwh: number;
    remainingEnergyKwh: number;
    socPct: number;
    importedFromGridKwh: number;
    exportedToGridKwh: number;
    hitMinSoc: boolean;
    hitMaxSoc: boolean;
    limitedByChargePower: boolean;
    limitedByDischargePower: boolean;
}

export interface BatteryCapacityForecastDTO {
    status: ForecastStatus;
    generatedAt: string | null;
    startedAt: string | null;
    unit: "kWh";
    resolution: ForecastResolution;
    horizonHours: number;
    model: string | null;
    nominalCapacityKwh: number | null;
    currentRemainingEnergyKwh: number | null;
    currentSoc: number | null;
    minSoc: number | null;
    maxSoc: number | null;
    chargeEfficiency: number | null;
    dischargeEfficiency: number | null;
    maxChargePowerW: number | null;
    maxDischargePowerW: number | null;
    partialReason: string | null;
    coverageUntil: string | null;
    actualHistory: BatteryCapacityActualHourDTO[];
    series: BatteryCapacityForecastHourDTO[];
}

export interface ForecastPayload {
    solar: SolarForecastDTO;
    grid: GridForecastDTO;
    house_consumption: HouseConsumptionForecastDTO;
    battery_capacity: BatteryCapacityForecastDTO;
}

export interface GetForecastRequest {
    type: "helman/get_forecast";
    granularity?: ForecastGranularity;
    forecast_days?: number;
}

export type ScheduleActionKind =
    | "normal"
    | "charge_to_target_soc"
    | "discharge_to_target_soc"
    | "stop_charging"
    | "stop_discharging";

export interface ScheduleActionDTO {
    kind: ScheduleActionKind;
    targetSoc?: number;
}

export type ScheduleRuntimeStatus = "applied" | "error";
export type ScheduleRuntimeReason = "scheduled" | "target_soc_reached";

export interface ActiveSlotRuntimeDTO {
    status: ScheduleRuntimeStatus;
    executedAction?: ScheduleActionDTO;
    reason?: ScheduleRuntimeReason;
    errorCode?: string;
}

export interface ScheduleSlotDTO {
    id: string;
    action: ScheduleActionDTO;
    runtime?: ActiveSlotRuntimeDTO;
}

export interface SchedulePayload {
    executionEnabled: boolean;
    slots: ScheduleSlotDTO[];
}

export interface GetScheduleRequest {
    type: "helman/get_schedule";
}

export interface SetScheduleRequest {
    type: "helman/set_schedule";
    slots: ScheduleSlotDTO[];
}

export interface SetScheduleResponse {
    success: true;
}

export interface SetScheduleExecutionRequest {
    type: "helman/set_schedule_execution";
    enabled: boolean;
}

export interface SetScheduleExecutionResponse {
    success: true;
    executionEnabled: boolean;
}
