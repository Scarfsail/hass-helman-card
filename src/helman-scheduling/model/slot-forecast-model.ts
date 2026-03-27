import type {
    BatteryCapacityForecastDTO,
    ForecastGranularity,
    ForecastPayload,
    ScheduleSlotDTO,
    SolarForecastDTO,
} from "../../helman-api";
import type { ScheduleSlot } from "../schedule-types";
import { getScheduleDayKey, resolveScheduleSlotBoundaries } from "./schedule-time";

export interface SlotForecastPoint {
    socPct: number | null;
    solarWh: number | null;
}

export interface SlotForecastMap {
    points: ReadonlyMap<string, SlotForecastPoint>;
    solarMaxWh: number;
    batteryAvailable: boolean;
    solarAvailable: boolean;
}

export const EMPTY_SLOT_FORECAST_MAP: SlotForecastMap = {
    points: new Map(),
    solarMaxWh: 0,
    batteryAvailable: false,
    solarAvailable: false,
};

export interface ScheduleForecastParams {
    granularity: ForecastGranularity;
    forecastDays: number;
}

const FORECAST_AVAILABLE_STATUSES = new Set(["available", "partial"]);
const VALID_GRANULARITIES = new Set<number>([15, 30, 60]);
export function deriveScheduleForecastParams(
    slotDtos: readonly ScheduleSlotDTO[],
    timeZone: string,
): ScheduleForecastParams | null {
    let slotBoundaries: ReturnType<typeof resolveScheduleSlotBoundaries>;
    try {
        slotBoundaries = resolveScheduleSlotBoundaries(slotDtos.map((slot) => slot.id));
    } catch {
        return null;
    }

    if (slotBoundaries.length < 2) {
        return null;
    }

    const firstMs = slotBoundaries[0].startMs;
    const secondMs = slotBoundaries[1].startMs;
    const slotDurationMinutes = (secondMs - firstMs) / 60_000;
    if (!VALID_GRANULARITIES.has(slotDurationMinutes)) {
        return null;
    }

    const coveredDayKeys = new Set(
        slotBoundaries
            .map((slot) => getScheduleDayKey(new Date(slot.startMs), timeZone))
            .filter((dayKey): dayKey is string => dayKey !== null),
    );
    const forecastDays = Math.max(1, coveredDayKeys.size);

    return {
        granularity: slotDurationMinutes as ForecastGranularity,
        forecastDays,
    };
}

export function buildSlotForecastMap(
    forecast: ForecastPayload | null,
    slots: readonly ScheduleSlot[],
): SlotForecastMap {
    if (forecast === null || slots.length === 0) {
        return EMPTY_SLOT_FORECAST_MAP;
    }

    const batteryAvailable = FORECAST_AVAILABLE_STATUSES.has(forecast.battery_capacity.status);
    const solarAvailable = FORECAST_AVAILABLE_STATUSES.has(forecast.solar.status);
    if (!batteryAvailable && !solarAvailable) {
        return EMPTY_SLOT_FORECAST_MAP;
    }

    const batteryByMs = batteryAvailable
        ? _buildBatteryTimeline(forecast.battery_capacity)
        : new Map<number, number>();
    const solarByMs = solarAvailable
        ? _buildSolarTimeline(forecast.solar)
        : new Map<number, number>();
    const currentBatterySoc = batteryAvailable
        ? forecast.battery_capacity.currentSoc
        : null;

    let solarMaxWh = 0;
    const points = new Map<string, SlotForecastPoint>();

    for (const slot of slots) {
        const socPct = batteryByMs.get(slot.startMs)
            ?? (slot.isCurrent ? currentBatterySoc ?? null : null);
        const solarWh = solarByMs.get(slot.startMs) ?? null;

        if (solarWh !== null && solarWh > solarMaxWh) {
            solarMaxWh = solarWh;
        }

        points.set(slot.id, { socPct, solarWh });
    }

    return { points, solarMaxWh, batteryAvailable, solarAvailable };
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
