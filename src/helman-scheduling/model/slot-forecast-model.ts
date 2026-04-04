import type {
    BatteryCapacityForecastDTO,
    ForecastPointDTO,
    ForecastGranularity,
    ForecastPayload,
    GridForecastDTO,
    ScheduleSlotDTO,
    SolarForecastDTO,
} from "../../helman-api";
import type { ScheduleDisplaySlot } from "../schedule-types";
import { deriveScheduleGranularityMinutes } from "./schedule-time";

export interface SlotForecastPoint {
    socPct: number | null;
    solarWh: number | null;
    gridNetKwh: number | null;
    gridImportKwh: number | null;
    gridExportKwh: number | null;
    price: number | null;
}

export interface SlotForecastMap {
    points: ReadonlyMap<string, SlotForecastPoint>;
    solarMaxWh: number;
    gridMaxAbsKwh: number;
    priceMaxAbs: number;
    batteryAvailable: boolean;
    solarAvailable: boolean;
    gridAvailable: boolean;
    priceAvailable: boolean;
    priceDisplayUnit: string | null;
}

export const EMPTY_SLOT_FORECAST_MAP: SlotForecastMap = {
    points: new Map(),
    solarMaxWh: 0,
    gridMaxAbsKwh: 0,
    priceMaxAbs: 0,
    batteryAvailable: false,
    solarAvailable: false,
    gridAvailable: false,
    priceAvailable: false,
    priceDisplayUnit: null,
};

export interface ScheduleForecastParams {
    granularity: ForecastGranularity;
    forecastDays?: number;
}

const FORECAST_AVAILABLE_STATUSES = new Set(["available", "partial"]);
export function deriveScheduleForecastParams(
    slotDtos: readonly ScheduleSlotDTO[],
): ScheduleForecastParams | null {
    const granularity = deriveScheduleGranularityMinutes(slotDtos.map((slot) => slot.id));
    if (granularity === null) {
        return null;
    }

    return {
        granularity,
    };
}

export function buildSlotForecastMap(
    forecast: ForecastPayload | null,
    slots: readonly ScheduleDisplaySlot[],
): SlotForecastMap {
    if (forecast === null || slots.length === 0) {
        return EMPTY_SLOT_FORECAST_MAP;
    }

    const batteryAvailable = FORECAST_AVAILABLE_STATUSES.has(forecast.battery_capacity.status);
    const solarAvailable = FORECAST_AVAILABLE_STATUSES.has(forecast.solar.status);
    const gridAvailable = FORECAST_AVAILABLE_STATUSES.has(forecast.grid.status);
    const batteryByMs = batteryAvailable
        ? _buildBatteryTimeline(forecast.battery_capacity)
        : new Map<number, number>();
    const solarByMs = solarAvailable
        ? _buildSolarTimeline(forecast.solar)
        : new Map<number, number>();
    const priceProjection = _buildPriceProjection(forecast.grid, slots);
    if (!batteryAvailable && !solarAvailable && !gridAvailable && !priceProjection.available) {
        return EMPTY_SLOT_FORECAST_MAP;
    }
    const gridProjection = gridAvailable
        ? _buildGridProjection(forecast.grid, slots)
        : { points: new Map<string, Pick<SlotForecastPoint, "gridNetKwh" | "gridImportKwh" | "gridExportKwh">>(), maxAbsKwh: 0 };
    const currentBatterySoc = batteryAvailable
        ? forecast.battery_capacity.currentSoc
        : null;

    let solarMaxWh = 0;
    const points = new Map<string, SlotForecastPoint>();

    for (const slot of slots) {
        const socPct = batteryByMs.get(slot.startMs)
            ?? (slot.isCurrent ? currentBatterySoc ?? null : null);
        const solarWh = solarByMs.get(slot.startMs) ?? null;
        const gridPoint = gridProjection.points.get(slot.id);
        const pricePoint = priceProjection.points.get(slot.id);

        if (solarWh !== null && solarWh > solarMaxWh) {
            solarMaxWh = solarWh;
        }

        points.set(slot.id, {
            socPct,
            solarWh,
            gridNetKwh: gridPoint?.gridNetKwh ?? null,
            gridImportKwh: gridPoint?.gridImportKwh ?? null,
            gridExportKwh: gridPoint?.gridExportKwh ?? null,
            price: pricePoint?.price ?? null,
        });
    }

    return {
        points,
        solarMaxWh,
        gridMaxAbsKwh: gridProjection.maxAbsKwh,
        priceMaxAbs: priceProjection.maxAbs,
        batteryAvailable,
        solarAvailable,
        gridAvailable,
        priceAvailable: priceProjection.available,
        priceDisplayUnit: priceProjection.displayUnit,
    };
}

function _buildBatteryTimeline(battery: BatteryCapacityForecastDTO): Map<number, number> {
    const timeline = new Map<number, number>();

    for (const entry of battery.actualHistory) {
        const ms = new Date(entry.timestamp).getTime();
        if (!Number.isNaN(ms)) {
            timeline.set(ms, entry.socPct);
        }
    }

    for (const entry of battery.series) {
        const ms = new Date(entry.timestamp).getTime();
        if (!Number.isNaN(ms)) {
            timeline.set(ms, entry.socPct);
        }
    }

    return timeline;
}

function _buildSolarTimeline(solar: SolarForecastDTO): Map<number, number> {
    const timeline = new Map<number, number>();

    for (const entry of solar.actualHistory) {
        const ms = new Date(entry.timestamp).getTime();
        if (!Number.isNaN(ms)) {
            timeline.set(ms, entry.value);
        }
    }

    for (const entry of solar.points) {
        const ms = new Date(entry.timestamp).getTime();
        if (!Number.isNaN(ms)) {
            timeline.set(ms, entry.value);
        }
    }

    return timeline;
}

function _buildGridProjection(
    grid: GridForecastDTO,
    slots: readonly ScheduleDisplaySlot[],
): {
    points: Map<string, Pick<SlotForecastPoint, "gridNetKwh" | "gridImportKwh" | "gridExportKwh">>;
    maxAbsKwh: number;
} {
    const points = new Map<string, Pick<SlotForecastPoint, "gridNetKwh" | "gridImportKwh" | "gridExportKwh">>();
    const defaultSlotDurationMs = _getDefaultSlotDurationMs(slots);
    let maxAbsKwh = 0;

    for (const slot of slots) {
        const slotEndMs = slot.endMs ?? (defaultSlotDurationMs > 0 ? slot.startMs + defaultSlotDurationMs : null);
        if (slotEndMs === null || slotEndMs <= slot.startMs) {
            continue;
        }

        let importedKwh = 0;
        let exportedKwh = 0;
        let hasOverlap = false;

        for (const entry of grid.series) {
            const entryStartMs = new Date(entry.timestamp).getTime();
            const entryDurationMs = entry.durationHours * 3_600_000;
            if (Number.isNaN(entryStartMs) || !(entryDurationMs > 0)) {
                continue;
            }

            const entryEndMs = entryStartMs + entryDurationMs;
            const overlapMs = Math.min(slotEndMs, entryEndMs) - Math.max(slot.startMs, entryStartMs);
            if (overlapMs <= 0) {
                continue;
            }

            const overlapRatio = overlapMs / entryDurationMs;
            importedKwh += entry.importedFromGridKwh * overlapRatio;
            exportedKwh += entry.exportedToGridKwh * overlapRatio;
            hasOverlap = true;
        }

        if (!hasOverlap) {
            continue;
        }

        const netKwh = exportedKwh - importedKwh;
        maxAbsKwh = Math.max(maxAbsKwh, Math.abs(netKwh));
        points.set(slot.id, {
            gridNetKwh: netKwh,
            gridImportKwh: importedKwh,
            gridExportKwh: exportedKwh,
        });
    }

    return { points, maxAbsKwh };
}

function _buildPriceProjection(
    grid: GridForecastDTO,
    slots: readonly ScheduleDisplaySlot[],
): {
    points: Map<string, Pick<SlotForecastPoint, "price">>;
    maxAbs: number;
    available: boolean;
    displayUnit: string | null;
} {
    const exportPriceByMs = _buildForecastPointTimeline(grid.exportPricePoints ?? []);
    const points = new Map<string, Pick<SlotForecastPoint, "price">>();
    let maxAbs = Math.max(
        ...Array.from(exportPriceByMs.values()).map((value) => Math.abs(value)),
        Math.abs(grid.currentExportPrice ?? 0),
        0,
    );

    for (const slot of slots) {
        const price = exportPriceByMs.get(slot.startMs)
            ?? (slot.isCurrent ? grid.currentExportPrice ?? null : null);

        if (price === null) {
            continue;
        }

        maxAbs = Math.max(maxAbs, Math.abs(price));
        points.set(slot.id, {
            price,
        });
    }

    return {
        points,
        maxAbs,
        available: points.size > 0
            || (grid.currentExportPrice ?? null) !== null,
        displayUnit: grid.exportPriceUnit ?? null,
    };
}

function _buildForecastPointTimeline(points: readonly ForecastPointDTO[]): Map<number, number> {
    const timeline = new Map<number, number>();

    for (const point of points) {
        const ms = new Date(point.timestamp).getTime();
        if (!Number.isNaN(ms)) {
            timeline.set(ms, point.value);
        }
    }

    return timeline;
}

function _getDefaultSlotDurationMs(slots: readonly ScheduleDisplaySlot[]): number {
    for (let index = 1; index < slots.length; index += 1) {
        const durationMs = slots[index].startMs - slots[index - 1].startMs;
        if (durationMs > 0) {
            return durationMs;
        }
    }

    return 0;
}
