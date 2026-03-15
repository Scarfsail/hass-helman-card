import type {
    BatteryCapacityActualHourDTO,
    BatteryCapacityForecastHourDTO,
} from "../../helman-api";
import {
    buildLocalDayHourAxis,
    getLocalHourKey,
    indexEntriesByLocalHour,
} from "./local-day-hour-axis";
import { getCachedLocalDateTimeParts } from "./local-date-time-parts-cache";

export type BatterySlotSource = "actual" | "forecast" | "gap";

export interface BatteryCapacityForecastSlot {
    source: BatterySlotSource;
    timestamp: string;
    endsAt: string;
    durationHours: number;
    startSocPct: number | null;
    socPct: number | null;
    chargedKwh: number;
    dischargedKwh: number;
    importedFromGridKwh: number;
    exportedToGridKwh: number;
    hitMinSoc: boolean;
    hitMaxSoc: boolean;
    limitedByChargePower: boolean;
    limitedByDischargePower: boolean;
}

export interface BatteryCapacityForecastDay {
    dayKey: string;
    isToday: boolean;
    isTomorrow: boolean;
    startSocPct: number;
    endSocPct: number;
    minSocPct: number;
    minSocAt: string | null;
    maxSocPct: number;
    maxSocAt: string | null;
    coverageEndsAt: string;
    coversDayEnd: boolean;
    slots: BatteryCapacityForecastSlot[];
}

interface BuildBatteryCapacityForecastModelParams {
    actualHistory: BatteryCapacityActualHourDTO[];
    series: BatteryCapacityForecastHourDTO[];
    currentSoc: number | null;
    startedAt: string | null;
    timeZone: string;
    now?: Date;
}

export function buildBatteryCapacityForecastModel({
    actualHistory,
    series,
    currentSoc,
    startedAt,
    timeZone,
    now = new Date(),
}: BuildBatteryCapacityForecastModelParams): BatteryCapacityForecastDay[] {
    const currentLocalParts = getCachedLocalDateTimeParts(now, timeZone);
    const currentHourKey = getLocalHourKey(now, timeZone);
    if (currentLocalParts === null || currentHourKey === null) {
        return [];
    }

    const todayKey = currentLocalParts.dayKey;
    const tomorrowKey = _addDaysToDayKey(todayKey, 1);
    const forecastSlots = _buildForecastSlots(series, currentSoc);
    const forecastDayMap = _groupForecastSlotsByDay(forecastSlots, timeZone, todayKey);
    const todaySlots = _buildTodaySlots({
        actualHistory,
        forecastSlots: forecastDayMap.get(todayKey) ?? [],
        currentHourKey,
        dayKey: todayKey,
        timeZone,
    });

    const dayKeys = new Set(forecastDayMap.keys());
    if (todaySlots.length > 0) {
        dayKeys.add(todayKey);
    }

    return Array.from(dayKeys)
        .sort()
        .map((dayKey) => {
            const slots = [...(dayKey === todayKey ? todaySlots : forecastDayMap.get(dayKey) ?? [])]
                .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
            if (slots.length === 0) {
                return null;
            }

            const lastSlot = slots[slots.length - 1];
            const coverageEndLocalParts = getCachedLocalDateTimeParts(lastSlot.endsAt, timeZone);
            const dayStartSoc = _readDayStartSoc(slots, currentSoc);
            const dayEndSoc = _readDayEndSoc(slots, dayStartSoc);
            const daySocExtrema = _buildDaySocExtrema(slots, dayStartSoc, startedAt);

            return {
                dayKey,
                isToday: dayKey === todayKey,
                isTomorrow: dayKey === tomorrowKey,
                startSocPct: dayStartSoc,
                endSocPct: dayEndSoc,
                minSocPct: daySocExtrema.minSocPct,
                minSocAt: daySocExtrema.minSocAt,
                maxSocPct: daySocExtrema.maxSocPct,
                maxSocAt: daySocExtrema.maxSocAt,
                coverageEndsAt: lastSlot.endsAt,
                coversDayEnd: coverageEndLocalParts !== null && coverageEndLocalParts.dayKey > dayKey,
                slots,
            };
        })
        .filter((day): day is BatteryCapacityForecastDay => day !== null);
}

function _buildTodaySlots({
    actualHistory,
    forecastSlots,
    currentHourKey,
    dayKey,
    timeZone,
}: {
    actualHistory: BatteryCapacityActualHourDTO[];
    forecastSlots: BatteryCapacityForecastSlot[];
    currentHourKey: string;
    dayKey: string;
    timeZone: string;
}): BatteryCapacityForecastSlot[] {
    const actualByHour = indexEntriesByLocalHour(actualHistory, timeZone, dayKey);
    const referenceTimestamps = [
        ...actualHistory.map((entry) => entry.timestamp),
        ...forecastSlots.map((slot) => slot.timestamp),
    ];
    if (referenceTimestamps.length === 0) {
        return [];
    }

    const currentHourStartMs = _parseTimestampMs(currentHourKey);
    if (currentHourStartMs === null) {
        return forecastSlots;
    }

    const pastSlots: BatteryCapacityForecastSlot[] = [];
    for (const axisPoint of buildLocalDayHourAxis(dayKey, timeZone, referenceTimestamps)) {
        const axisPointMs = _parseTimestampMs(axisPoint.timestamp);
        if (axisPointMs === null || axisPointMs >= currentHourStartMs) {
            continue;
        }

        const actualSlot = actualByHour.get(axisPoint.hourKey);
        pastSlots.push(
            actualSlot !== undefined
                ? _buildActualSlot(actualSlot)
                : _buildGapSlot(axisPoint.timestamp)
        );
    }

    return [...pastSlots, ...forecastSlots];
}

function _buildForecastSlots(
    series: BatteryCapacityForecastHourDTO[],
    currentSoc: number | null,
): BatteryCapacityForecastSlot[] {
    let previousEndSoc = currentSoc;

    return series.map((slot) => {
        const mappedSlot: BatteryCapacityForecastSlot = {
            source: "forecast",
            timestamp: slot.timestamp,
            endsAt: _computeSlotEnd(slot.timestamp, slot.durationHours),
            durationHours: slot.durationHours,
            startSocPct: previousEndSoc,
            socPct: slot.socPct,
            chargedKwh: slot.chargedKwh,
            dischargedKwh: slot.dischargedKwh,
            importedFromGridKwh: slot.importedFromGridKwh,
            exportedToGridKwh: slot.exportedToGridKwh,
            hitMinSoc: slot.hitMinSoc,
            hitMaxSoc: slot.hitMaxSoc,
            limitedByChargePower: slot.limitedByChargePower,
            limitedByDischargePower: slot.limitedByDischargePower,
        };
        previousEndSoc = slot.socPct;
        return mappedSlot;
    });
}

function _groupForecastSlotsByDay(
    slots: BatteryCapacityForecastSlot[],
    timeZone: string,
    todayKey: string,
): Map<string, BatteryCapacityForecastSlot[]> {
    const dayMap = new Map<string, BatteryCapacityForecastSlot[]>();
    for (const slot of slots) {
        const slotLocalParts = getCachedLocalDateTimeParts(slot.timestamp, timeZone);
        if (slotLocalParts === null || slotLocalParts.dayKey < todayKey) {
            continue;
        }

        const daySlots = dayMap.get(slotLocalParts.dayKey) ?? [];
        daySlots.push(slot);
        dayMap.set(slotLocalParts.dayKey, daySlots);
    }

    return dayMap;
}

function _buildActualSlot(actual: BatteryCapacityActualHourDTO): BatteryCapacityForecastSlot {
    return {
        source: "actual",
        timestamp: actual.timestamp,
        endsAt: _computeSlotEnd(actual.timestamp, 1),
        durationHours: 1,
        startSocPct: actual.startSocPct,
        socPct: actual.socPct,
        chargedKwh: 0,
        dischargedKwh: 0,
        importedFromGridKwh: 0,
        exportedToGridKwh: 0,
        hitMinSoc: false,
        hitMaxSoc: false,
        limitedByChargePower: false,
        limitedByDischargePower: false,
    };
}

function _buildGapSlot(timestamp: string): BatteryCapacityForecastSlot {
    return {
        source: "gap",
        timestamp,
        endsAt: _computeSlotEnd(timestamp, 1),
        durationHours: 1,
        startSocPct: null,
        socPct: null,
        chargedKwh: 0,
        dischargedKwh: 0,
        importedFromGridKwh: 0,
        exportedToGridKwh: 0,
        hitMinSoc: false,
        hitMaxSoc: false,
        limitedByChargePower: false,
        limitedByDischargePower: false,
    };
}

function _readDayStartSoc(
    slots: BatteryCapacityForecastSlot[],
    fallbackSoc: number | null,
): number {
    for (const slot of slots) {
        if (slot.startSocPct !== null) {
            return slot.startSocPct;
        }
        if (slot.socPct !== null) {
            return slot.socPct;
        }
    }

    return fallbackSoc ?? 0;
}

function _readDayEndSoc(slots: BatteryCapacityForecastSlot[], fallbackSoc: number): number {
    for (const slot of [...slots].reverse()) {
        if (slot.socPct !== null) {
            return slot.socPct;
        }
        if (slot.startSocPct !== null) {
            return slot.startSocPct;
        }
    }

    return fallbackSoc;
}

function _computeSlotEnd(timestamp: string, durationHours: number): string {
    const startMs = new Date(timestamp).getTime();
    if (Number.isNaN(startMs)) {
        return timestamp;
    }

    return new Date(startMs + durationHours * 3600000).toISOString();
}

function _parseTimestampMs(timestamp: string): number | null {
    const parsedMs = new Date(timestamp).getTime();
    return Number.isNaN(parsedMs) ? null : parsedMs;
}

function _addDaysToDayKey(dayKey: string, days: number): string {
    const date = new Date(`${dayKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

interface BatterySocSample {
    socPct: number;
    at: string;
}

function _buildDaySocExtrema(
    slots: BatteryCapacityForecastSlot[],
    fallbackSoc: number,
    startedAt: string | null,
): {
    minSocPct: number;
    minSocAt: string | null;
    maxSocPct: number;
    maxSocAt: string | null;
} {
    const samples: BatterySocSample[] = [];
    for (const slot of slots) {
        if (slot.startSocPct !== null) {
            samples.push({
                socPct: slot.startSocPct,
                at: slot.timestamp,
            });
        }
        if (slot.socPct !== null) {
            samples.push({
                socPct: slot.socPct,
                at: slot.endsAt,
            });
        }
    }

    if (samples.length === 0) {
        return {
            minSocPct: fallbackSoc,
            minSocAt: startedAt,
            maxSocPct: fallbackSoc,
            maxSocAt: startedAt,
        };
    }

    let minSample = samples[0];
    let maxSample = samples[0];
    for (const sample of samples.slice(1)) {
        if (sample.socPct < minSample.socPct) {
            minSample = sample;
        }
        if (sample.socPct > maxSample.socPct) {
            maxSample = sample;
        }
    }

    return {
        minSocPct: minSample.socPct,
        minSocAt: minSample.at,
        maxSocPct: maxSample.socPct,
        maxSocAt: maxSample.at,
    };
}
