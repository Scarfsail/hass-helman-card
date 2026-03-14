import type { HouseConsumptionForecastHourDTO } from "../../helman-api";
import { getCachedLocalDateTimeParts } from "./local-date-time-parts-cache";

export interface ConsumerHourSnapshot {
    entityId: string;
    label: string;
    valueKwh: number;
    lowerKwh: number;
    upperKwh: number;
}

export interface ConsumerDayTotal {
    entityId: string;
    label: string;
    totalKwh: number;
}

export interface HouseForecastHour {
    timestamp: string;
    baselineKwh: number;
    baselineLowerKwh: number;
    baselineUpperKwh: number;
    deferrableKwh: number;
    deferrableLowerKwh: number;
    deferrableUpperKwh: number;
    consumers: ConsumerHourSnapshot[];
}

export interface HouseForecastDay {
    dayKey: string;
    isToday: boolean;
    isTomorrow: boolean;
    baselineDayKwh: number;
    deferrableDayKwh: number;
    consumerDaySums: ConsumerDayTotal[];
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

        const consumers: ConsumerHourSnapshot[] = dto.deferrableConsumers
            .map((consumer) => ({
                entityId: consumer.entityId,
                label: consumer.label,
                valueKwh: consumer.value,
                lowerKwh: consumer.lower,
                upperKwh: consumer.upper,
            }))
            .sort((a, b) => a.entityId.localeCompare(b.entityId));

        const deferrableKwh = consumers.reduce((sum, consumer) => sum + consumer.valueKwh, 0);
        const deferrableLowerKwh = consumers.reduce((sum, consumer) => sum + consumer.lowerKwh, 0);
        const deferrableUpperKwh = consumers.reduce((sum, consumer) => sum + consumer.upperKwh, 0);

        const hour: HouseForecastHour = {
            timestamp: dto.timestamp,
            baselineKwh: dto.nonDeferrable.value,
            baselineLowerKwh: dto.nonDeferrable.lower,
            baselineUpperKwh: dto.nonDeferrable.upper,
            deferrableKwh,
            deferrableLowerKwh,
            deferrableUpperKwh,
            consumers,
        };

        const dayHours = dayMap.get(parts.dayKey) ?? [];
        dayHours.push(hour);
        dayMap.set(parts.dayKey, dayHours);
    }

    const sortedDayKeys = Array.from(dayMap.keys()).sort();

    return sortedDayKeys.map((dayKey) => {
        const hours = dayMap.get(dayKey) ?? [];
        hours.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const isToday = dayKey === todayKey;
        const paddedHours = isToday ? _padToFullDay(hours, timeZone) : hours;

        return {
            dayKey,
            isToday,
            isTomorrow: dayKey === tomorrowKey,
            baselineDayKwh: hours.reduce((sum, hour) => sum + hour.baselineKwh, 0),
            deferrableDayKwh: hours.reduce((sum, hour) => sum + hour.deferrableKwh, 0),
            consumerDaySums: _buildConsumerDaySums(hours),
            hours: paddedHours,
        };
    });
}

function _padToFullDay(hours: HouseForecastHour[], timeZone: string): HouseForecastHour[] {
    if (hours.length === 0 || hours.length >= 24) {
        return hours;
    }

    const hourMap = new Map<number, HouseForecastHour>();
    for (const hour of hours) {
        const parts = getCachedLocalDateTimeParts(hour.timestamp, timeZone);
        if (parts !== null) {
            if (hourMap.has(parts.hour)) {
                return hours;
            }
            hourMap.set(parts.hour, hour);
        }
    }

    const refHour = hours.length > 0 ? hours[0] : null;
    const refParts = refHour !== null ? getCachedLocalDateTimeParts(refHour.timestamp, timeZone) : null;

    const padded: HouseForecastHour[] = [];
    for (let hour = 0; hour < 24; hour++) {
        const existing = hourMap.get(hour);
        if (existing) {
            padded.push(existing);
        } else {
            padded.push(_makeEmptyHour(hour, refHour, refParts?.hour ?? null));
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
        baselineKwh: 0,
        baselineLowerKwh: 0,
        baselineUpperKwh: 0,
        deferrableKwh: 0,
        deferrableLowerKwh: 0,
        deferrableUpperKwh: 0,
        consumers: [],
    };
}

function _buildConsumerDaySums(hours: HouseForecastHour[]): ConsumerDayTotal[] {
    const map = new Map<string, { label: string; totalKwh: number }>();
    for (const hour of hours) {
        for (const consumer of hour.consumers) {
            const existing = map.get(consumer.entityId);
            if (existing) {
                existing.totalKwh += consumer.valueKwh;
            } else {
                map.set(consumer.entityId, { label: consumer.label, totalKwh: consumer.valueKwh });
            }
        }
    }

    return Array.from(map.entries())
        .map(([entityId, { label, totalKwh }]) => ({ entityId, label, totalKwh }))
        .sort((left, right) => right.totalKwh - left.totalKwh || left.label.localeCompare(right.label));
}

function _addDaysToDayKey(dayKey: string, days: number): string {
    const date = new Date(`${dayKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
