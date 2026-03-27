const LOCAL_DATE_TIME_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const TIME_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

interface LocalDateTimeDescriptor {
    year: string;
    month: string;
    day: string;
    hour: number;
    minute: number;
    dayKey: string;
    offset: string;
}

export interface ScheduleSlotLabels {
    timeLabel: string;
    endLabel: string | null;
    rangeLabel: string;
}

export interface ScheduleSlotBoundary {
    id: string;
    startMs: number;
    endMs: number | null;
}

export function parseScheduleDate(value: string): Date | null {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function getScheduleSlotStartMs(slotId: string): number | null {
    return parseScheduleDate(slotId)?.getTime() ?? null;
}

export function getScheduleDayKey(value: Date | string, timeZone: string): string | null {
    return _getLocalDateTimeDescriptor(value, timeZone)?.dayKey ?? null;
}

export function getScheduleSlotDayKey(slotId: string, timeZone: string): string | null {
    return getScheduleDayKey(slotId, timeZone);
}

export function resolveScheduleSlotBoundaries(slotIds: readonly string[]): ScheduleSlotBoundary[] {
    const sorted = slotIds
        .map((slotId) => {
            const startMs = getScheduleSlotStartMs(slotId);
            if (startMs === null) {
                throw new Error(`helman-scheduling: invalid schedule slot id "${slotId}"`);
            }

            return {
                id: slotId,
                startMs,
            };
        })
        .sort((left, right) => left.startMs - right.startMs);

    const slots: { id: string; startMs: number }[] = [];
    for (const slot of sorted) {
        if (slots.length > 0 && slot.startMs === slots[slots.length - 1].startMs) {
            slots[slots.length - 1] = slot;
            continue;
        }
        slots.push(slot);
    }

    return slots.map((slot, index) => {
        const nextSlot = slots[index + 1];

        return {
            id: slot.id,
            startMs: slot.startMs,
            endMs: nextSlot?.startMs ?? null,
        };
    });
}

export function getScheduleTimeRangeLabels({
    startMs,
    endMs,
    locale,
    timeZone,
}: {
    startMs: number;
    endMs: number | null;
    locale: string;
    timeZone: string;
}): ScheduleSlotLabels {
    const timeLabel = formatScheduleTime(startMs, locale, timeZone);
    if (endMs === null) {
        return {
            timeLabel,
            endLabel: null,
            rangeLabel: `${timeLabel}+`,
        };
    }

    const endLabel = formatScheduleTime(endMs, locale, timeZone);
    return {
        timeLabel,
        endLabel,
        rangeLabel: startMs === endMs ? timeLabel : `${timeLabel}–${endLabel}`,
    };
}

export function getNextScheduleBoundaryDelayMs(slotIds: readonly string[], now: Date = new Date()): number | null {
    const boundaries = resolveScheduleSlotBoundaries(slotIds);
    if (boundaries.length === 0) {
        return null;
    }

    const nowMs = now.getTime();
    const boundaryMs = [...new Set(boundaries.flatMap((slot) => slot.endMs === null ? [slot.startMs] : [slot.startMs, slot.endMs]))]
        .sort((left, right) => left - right);

    const nextBoundaryMs = boundaryMs.find((value) => value > nowMs);
    if (nextBoundaryMs !== undefined) {
        return Math.max(nextBoundaryMs - nowMs, 0);
    }

    return null;
}

export function formatScheduleDayLabel({
    dayKey,
    currentDayKey,
    locale,
    todayLabel,
    tomorrowLabel,
}: {
    dayKey: string;
    currentDayKey: string | null;
    locale: string;
    todayLabel: string;
    tomorrowLabel: string;
}): string {
    if (currentDayKey !== null) {
        if (dayKey === currentDayKey) {
            return todayLabel;
        }

        if (dayKey === _addDaysToDayKey(currentDayKey, 1)) {
            return tomorrowLabel;
        }
    }

    return new Date(`${dayKey}T00:00:00Z`).toLocaleDateString(locale, {
        timeZone: "UTC",
        weekday: "short",
        day: "numeric",
        month: "numeric",
    });
}

export function formatScheduleTime(
    value: number | string | Date,
    locale: string,
    timeZone: string,
): string {
    const date = typeof value === "number"
        ? new Date(value)
        : typeof value === "string"
        ? parseScheduleDate(value)
        : value;
    if (date === null || Number.isNaN(date.getTime())) {
        return String(value);
    }

    return _getTimeFormatter(locale, timeZone).format(date);
}

function _getLocalDateTimeDescriptor(
    value: Date | string,
    timeZone: string,
): LocalDateTimeDescriptor | null {
    const date = typeof value === "string" ? parseScheduleDate(value) : value;
    if (date === null || Number.isNaN(date.getTime())) {
        return null;
    }

    const formattedParts = _getLocalDateTimeFormatter(timeZone).formatToParts(date);
    let year: string | undefined;
    let month: string | undefined;
    let day: string | undefined;
    let hour: string | undefined;
    let minute: string | undefined;
    let rawOffset: string | undefined;
    for (const part of formattedParts) {
        if (part.type === "year") {
            year = part.value;
        } else if (part.type === "month") {
            month = part.value;
        } else if (part.type === "day") {
            day = part.value;
        } else if (part.type === "hour") {
            hour = part.value;
        } else if (part.type === "minute") {
            minute = part.value;
        } else if (part.type === "timeZoneName") {
            rawOffset = part.value;
        }
    }

    const offset = rawOffset ? _normalizeOffset(rawOffset) : null;
    if (!year || !month || !day || !hour || !minute || offset === null) {
        return null;
    }

    return {
        year,
        month,
        day,
        hour: Number(hour),
        minute: Number(minute),
        dayKey: `${year}-${month}-${day}`,
        offset,
    };
}

function _normalizeOffset(rawOffset: string): string | null {
    if (rawOffset === "GMT" || rawOffset === "UTC") {
        return "+00:00";
    }

    const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(rawOffset);
    if (!match) {
        return null;
    }

    const [, sign, hours, minutes = "0"] = match;
    return `${sign}${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

function _getLocalDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
    const formatter = LOCAL_DATE_TIME_FORMATTERS.get(timeZone);
    if (formatter !== undefined) {
        return formatter;
    }

    const nextFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
        timeZoneName: "shortOffset",
    });
    LOCAL_DATE_TIME_FORMATTERS.set(timeZone, nextFormatter);
    return nextFormatter;
}

function _getTimeFormatter(locale: string, timeZone: string): Intl.DateTimeFormat {
    const cacheKey = `${locale}::${timeZone}`;
    const formatter = TIME_FORMATTERS.get(cacheKey);
    if (formatter !== undefined) {
        return formatter;
    }

    const nextFormatter = new Intl.DateTimeFormat(locale, {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
    });
    TIME_FORMATTERS.set(cacheKey, nextFormatter);
    return nextFormatter;
}

function _addDaysToDayKey(dayKey: string, days: number): string {
    const date = new Date(`${dayKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
