import type { BatteryCapacityForecastHourDTO } from "../../helman-api";
import { getCachedLocalDateTimeParts } from "./local-date-time-parts-cache";

export interface BatteryCapacityForecastSlot extends BatteryCapacityForecastHourDTO {
    endsAt: string;
}

export interface BatteryCapacityForecastDay {
    dayKey: string;
    isToday: boolean;
    isTomorrow: boolean;
    endSocPct: number;
    minSocPct: number;
    maxSocPct: number;
    endRemainingEnergyKwh: number;
    coverageEndsAt: string;
    coversDayEnd: boolean;
    slots: BatteryCapacityForecastSlot[];
}

interface BuildBatteryCapacityForecastModelParams {
    series: BatteryCapacityForecastHourDTO[];
    currentSoc: number | null;
    timeZone: string;
    now?: Date;
}

export function buildBatteryCapacityForecastModel({
    series,
    currentSoc,
    timeZone,
    now = new Date(),
}: BuildBatteryCapacityForecastModelParams): BatteryCapacityForecastDay[] {
    const currentLocalParts = getCachedLocalDateTimeParts(now, timeZone);
    if (currentLocalParts === null) {
        return [];
    }

    const todayKey = currentLocalParts.dayKey;
    const tomorrowKey = _addDaysToDayKey(todayKey, 1);
    const dayMap = new Map<string, BatteryCapacityForecastSlot[]>();

    for (const slot of series) {
        const slotLocalParts = getCachedLocalDateTimeParts(slot.timestamp, timeZone);
        if (slotLocalParts === null || slotLocalParts.dayKey < todayKey) {
            continue;
        }

        const daySlots = dayMap.get(slotLocalParts.dayKey) ?? [];
        daySlots.push({
            ...slot,
            endsAt: _computeSlotEnd(slot.timestamp, slot.durationHours),
        });
        dayMap.set(slotLocalParts.dayKey, daySlots);
    }

    let previousDayEndSoc: number | null = currentSoc;

    return Array.from(dayMap.keys())
        .sort()
        .map((dayKey) => {
            const slots = [...(dayMap.get(dayKey) ?? [])].sort((left, right) => (
                new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
            ));
            if (slots.length === 0) {
                return null;
            }

            const lastSlot = slots[slots.length - 1];
            const coverageEndLocalParts = getCachedLocalDateTimeParts(lastSlot.endsAt, timeZone);
            const dayStartSoc = Number.isFinite(previousDayEndSoc ?? NaN)
                ? previousDayEndSoc
                : slots[0].socPct;
            const daySocSamples = [dayStartSoc, ...slots.map((slot) => slot.socPct)];

            previousDayEndSoc = lastSlot.socPct;

            return {
                dayKey,
                isToday: dayKey === todayKey,
                isTomorrow: dayKey === tomorrowKey,
                endSocPct: lastSlot.socPct,
                minSocPct: Math.min(...daySocSamples),
                maxSocPct: Math.max(...daySocSamples),
                endRemainingEnergyKwh: lastSlot.remainingEnergyKwh,
                coverageEndsAt: lastSlot.endsAt,
                coversDayEnd: coverageEndLocalParts !== null && coverageEndLocalParts.dayKey > dayKey,
                slots,
            };
        })
        .filter((day): day is BatteryCapacityForecastDay => day !== null);
}

function _computeSlotEnd(timestamp: string, durationHours: number): string {
    const startMs = new Date(timestamp).getTime();
    if (Number.isNaN(startMs)) {
        return timestamp;
    }

    return new Date(startMs + durationHours * 3600000).toISOString();
}

function _addDaysToDayKey(dayKey: string, days: number): string {
    const date = new Date(`${dayKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
