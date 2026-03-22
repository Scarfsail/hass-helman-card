const LOCAL_DATE_TIME_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const TIME_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

export const SCHEDULE_SLOT_MINUTES = 15;
export const SCHEDULE_SLOT_DURATION_MS = SCHEDULE_SLOT_MINUTES * 60 * 1000;

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
    endLabel: string;
    rangeLabel: string;
}

export function parseScheduleDate(value: string): Date | null {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function getScheduleSlotStartMs(slotId: string): number | null {
    return parseScheduleDate(slotId)?.getTime() ?? null;
}

export function getScheduleSlotDayKey(slotId: string, timeZone: string): string | null {
    return _getLocalDateTimeDescriptor(slotId, timeZone)?.dayKey ?? null;
}

export function getScheduleSlotLabels(
    slotId: string,
    locale: string,
    timeZone: string,
): ScheduleSlotLabels {
    const startMs = getScheduleSlotStartMs(slotId);
    if (startMs === null) {
        return {
            timeLabel: slotId,
            endLabel: slotId,
            rangeLabel: slotId,
        };
    }

    const endMs = startMs + SCHEDULE_SLOT_DURATION_MS;
    const timeLabel = formatScheduleTime(startMs, locale, timeZone);
    const endLabel = formatScheduleTime(endMs, locale, timeZone);
    return {
        timeLabel,
        endLabel,
        rangeLabel: `${timeLabel}–${endLabel}`,
    };
}

export function buildCurrentScheduleSlotId(now: Date, timeZone: string): string | null {
    const descriptor = _getLocalDateTimeDescriptor(now, timeZone);
    if (descriptor === null) {
        return null;
    }

    const roundedMinute = Math.floor(descriptor.minute / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_MINUTES;
    return [
        `${descriptor.dayKey}T`,
        String(descriptor.hour).padStart(2, "0"),
        ":",
        String(roundedMinute).padStart(2, "0"),
        `:00${descriptor.offset}`,
    ].join("");
}

export function getNextScheduleBoundaryDelayMs(now: Date, timeZone: string): number | null {
    const currentSlotId = buildCurrentScheduleSlotId(now, timeZone);
    if (currentSlotId === null) {
        return null;
    }

    const currentSlotStartMs = getScheduleSlotStartMs(currentSlotId);
    if (currentSlotStartMs === null) {
        return null;
    }

    return Math.max(currentSlotStartMs + SCHEDULE_SLOT_DURATION_MS - now.getTime(), 0);
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
