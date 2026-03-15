import { getCachedLocalDateTimeParts } from "./local-date-time-parts-cache";

export interface LocalHourTimestamp {
    hour: number;
    timestamp: string;
}

export function indexEntriesByLocalHour<T extends { timestamp: string }>(
    entries: readonly T[],
    timeZone: string,
    dayKey: string,
): Map<number, T> {
    const entriesByHour = new Map<number, T>();
    for (const entry of entries) {
        const parts = getCachedLocalDateTimeParts(entry.timestamp, timeZone);
        if (parts === null || parts.dayKey !== dayKey || entriesByHour.has(parts.hour)) {
            continue;
        }

        entriesByHour.set(parts.hour, entry);
    }

    return entriesByHour;
}

export function buildLocalDayHourTimestamps(
    dayKey: string,
    timeZone: string,
    referenceTimestamps: readonly string[],
): LocalHourTimestamp[] {
    const referenceByHour = new Map<number, string>();
    for (const timestamp of referenceTimestamps) {
        const parts = getCachedLocalDateTimeParts(timestamp, timeZone);
        if (parts === null || parts.dayKey !== dayKey || referenceByHour.has(parts.hour)) {
            continue;
        }

        referenceByHour.set(parts.hour, timestamp);
    }

    const knownHours = Array.from(referenceByHour.keys()).sort((left, right) => left - right);

    return Array.from({ length: 24 }, (_, hour) => ({
        hour,
        timestamp: _resolveHourTimestamp(dayKey, hour, referenceByHour, knownHours),
    }));
}

function _resolveHourTimestamp(
    dayKey: string,
    hour: number,
    referenceByHour: Map<number, string>,
    knownHours: readonly number[],
): string {
    const existingTimestamp = referenceByHour.get(hour);
    if (existingTimestamp !== undefined) {
        return existingTimestamp;
    }

    if (knownHours.length === 0) {
        return new Date(`${dayKey}T${String(hour).padStart(2, "0")}:00:00Z`).toISOString();
    }

    const nearestHour = knownHours.reduce((bestHour, candidateHour) => (
        Math.abs(candidateHour - hour) < Math.abs(bestHour - hour)
            ? candidateHour
            : bestHour
    ));
    const referenceTimestamp = referenceByHour.get(nearestHour) ?? `${dayKey}T00:00:00Z`;
    const referenceDate = new Date(referenceTimestamp);
    return new Date(referenceDate.getTime() + (hour - nearestHour) * 3600000).toISOString();
}
