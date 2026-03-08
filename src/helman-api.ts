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
    | "unavailable"
    | "partial"
    | "available";

export interface ForecastPointDTO {
    timestamp: string;
    value: number;
}

export interface SolarForecastDTO {
    status: ForecastStatus;
    unit: string | null;
    points: ForecastPointDTO[]; // hourly solar forecast points
}

export interface GridForecastDTO {
    status: ForecastStatus;
    unit: string | null;
    currentSellPrice: number | null;
    points: ForecastPointDTO[];
}

export interface ForecastPayload {
    solar: SolarForecastDTO;
    grid: GridForecastDTO;
}
