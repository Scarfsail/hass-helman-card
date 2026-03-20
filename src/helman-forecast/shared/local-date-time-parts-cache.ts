export interface LocalDateTimeParts {
    dayKey: string;
    hour: number;
}

const MAX_LOCAL_DATE_TIME_PARTS_CACHE_SIZE = 1024;
const LOCAL_DATE_TIME_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const LOCAL_DATE_TIME_PARTS_CACHE = new Map<string, LocalDateTimeParts | null>();

export function getCachedLocalDateTimeParts(
    value: Date | string,
    timeZone: string,
): LocalDateTimeParts | null {
    if (typeof value === "string") {
        const cacheKey = `${timeZone}::${value}`;
        if (LOCAL_DATE_TIME_PARTS_CACHE.has(cacheKey)) {
            return LOCAL_DATE_TIME_PARTS_CACHE.get(cacheKey) ?? null;
        }

        const localDateTimeParts = _buildLocalDateTimeParts(new Date(value), timeZone);
        _setCachedLocalDateTimeParts(cacheKey, localDateTimeParts);
        return localDateTimeParts;
    }

    return _buildLocalDateTimeParts(value, timeZone);
}

function _buildLocalDateTimeParts(date: Date, timeZone: string): LocalDateTimeParts | null {
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const formattedParts = _getLocalDateTimeFormatter(timeZone).formatToParts(date);
    let year: string | undefined;
    let month: string | undefined;
    let day: string | undefined;
    let hour: string | undefined;

    for (const part of formattedParts) {
        if (part.type === "year") {
            year = part.value;
        } else if (part.type === "month") {
            month = part.value;
        } else if (part.type === "day") {
            day = part.value;
        } else if (part.type === "hour") {
            hour = part.value;
        }
    }

    if (!year || !month || !day || !hour) {
        return null;
    }

    return {
        dayKey: `${year}-${month}-${day}`,
        hour: Number(hour),
    };
}

function _setCachedLocalDateTimeParts(cacheKey: string, value: LocalDateTimeParts | null): void {
    if (LOCAL_DATE_TIME_PARTS_CACHE.size >= MAX_LOCAL_DATE_TIME_PARTS_CACHE_SIZE) {
        LOCAL_DATE_TIME_PARTS_CACHE.clear();
    }

    LOCAL_DATE_TIME_PARTS_CACHE.set(cacheKey, value);
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
        hourCycle: "h23",
    });
    LOCAL_DATE_TIME_FORMATTERS.set(timeZone, nextFormatter);
    return nextFormatter;
}
