import type { HouseConsumptionForecastHourDTO } from "../../helman-api";
import { getCachedLocalDateTimeParts } from "./local-date-time-parts-cache";

export interface HouseForecastHour {
    timestamp: string;
    totalKwh: number;
    baselineKwh: number;
    totalLowerKwh: number;
    totalUpperKwh: number;
    baselineLowerKwh: number;
    baselineUpperKwh: number;
}

export interface HouseForecastDay {
    dayKey: string;
    isToday: boolean;
    isTomorrow: boolean;
    totalDayKwh: number;
    baselineDayKwh: number;
    hours: HouseForecastHour[];
}

interface BuildHouseForecastModelParams {
    series: HouseConsumptionForecastHourDTO[];
    timeZone: string;
    now?: Date;
}

export function buildHouseForecastModel({
    series,
    timeZone,
    now = new Date(),
}: BuildHouseForecastModelParams): HouseForecastDay[] {
    const currentLocalParts = getCachedLocalDateTimeParts(now, timeZone);
    if (currentLocalParts === null) {
        return [];
    }

    const todayKey = currentLocalParts.dayKey;
    const tomorrowKey = _addDaysToDayKey(todayKey, 1);
    const dayMap = new Map<string, HouseForecastHour[]>();

    for (const dto of series) {
        const parts = getCachedLocalDateTimeParts(dto.timestamp, timeZone);
        if (parts === null || parts.dayKey < todayKey) {
            continue;
        }

        const deferrableSum = dto.deferrableConsumers.reduce((s, c) => s + c.value, 0);
        const deferrableLowerSum = dto.deferrableConsumers.reduce((s, c) => s + c.lower, 0);
        const deferrableUpperSum = dto.deferrableConsumers.reduce((s, c) => s + c.upper, 0);

        const hour: HouseForecastHour = {
            timestamp: dto.timestamp,
            totalKwh: dto.nonDeferrable.value + deferrableSum,
            baselineKwh: dto.nonDeferrable.value,
            totalLowerKwh: dto.nonDeferrable.lower + deferrableLowerSum,
            totalUpperKwh: dto.nonDeferrable.upper + deferrableUpperSum,
            baselineLowerKwh: dto.nonDeferrable.lower,
            baselineUpperKwh: dto.nonDeferrable.upper,
        };

        const dayHours = dayMap.get(parts.dayKey) ?? [];
        dayHours.push(hour);
        dayMap.set(parts.dayKey, dayHours);
    }

    const sortedDayKeys = Array.from(dayMap.keys()).sort();

    if (!sortedDayKeys.includes(todayKey)) {
        sortedDayKeys.unshift(todayKey);
    }

    return sortedDayKeys.map((dayKey) => {
        const hours = dayMap.get(dayKey) ?? [];
        hours.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const isToday = dayKey === todayKey;
        const paddedHours = isToday ? _padToFullDay(hours, timeZone) : hours;

        return {
            dayKey,
            isToday,
            isTomorrow: dayKey === tomorrowKey,
            totalDayKwh: hours.reduce((s, h) => s + h.totalKwh, 0),
            baselineDayKwh: hours.reduce((s, h) => s + h.baselineKwh, 0),
            hours: paddedHours,
        };
    });
}

function _padToFullDay(hours: HouseForecastHour[], timeZone: string): HouseForecastHour[] {
    if (hours.length >= 24) {
        return hours;
    }

    const hourMap = new Map<number, HouseForecastHour>();
    for (const hour of hours) {
        const parts = getCachedLocalDateTimeParts(hour.timestamp, timeZone);
        if (parts !== null) {
            hourMap.set(parts.hour, hour);
        }
    }

    const refHour = hours.length > 0 ? hours[0] : null;
    const refParts = refHour !== null ? getCachedLocalDateTimeParts(refHour.timestamp, timeZone) : null;

    const padded: HouseForecastHour[] = [];
    for (let h = 0; h < 24; h++) {
        const existing = hourMap.get(h);
        if (existing) {
            padded.push(existing);
        } else {
            padded.push(_makeEmptyHour(h, refHour, refParts?.hour ?? null));
        }
    }

    return padded;
}

function _makeEmptyHour(
    targetHour: number,
    refHour: HouseForecastHour | null,
    refLocalHour: number | null,
): HouseForecastHour {
    let timestamp: string;
    if (refHour !== null && refLocalHour !== null) {
        const refDate = new Date(refHour.timestamp);
        const hourDiff = targetHour - refLocalHour;
        timestamp = new Date(refDate.getTime() + hourDiff * 3600000).toISOString();
    } else {
        timestamp = new Date().toISOString();
    }

    return {
        timestamp,
        totalKwh: 0,
        baselineKwh: 0,
        totalLowerKwh: 0,
        totalUpperKwh: 0,
        baselineLowerKwh: 0,
        baselineUpperKwh: 0,
    };
}

function _addDaysToDayKey(dayKey: string, days: number): string {
    const date = new Date(`${dayKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
