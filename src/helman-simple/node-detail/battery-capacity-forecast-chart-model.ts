import type { BatteryCapacityForecastDay } from "./battery-capacity-forecast-detail-model";
import { getCachedLocalDateTimeParts } from "./local-date-time-parts-cache";

export interface BatteryChartBuildContext {
    currentDayKey: string | null;
    currentHour: number | null;
    locale: string;
    timeZone: string;
}

export interface BatteryDetailColumnModel {
    timestamp: string;
    endsAt: string;
    durationHours: number;
    hourLabel: string | null;
    isPast: boolean;
    startSocPct: number;
    endSocPct: number;
    socChangeOffsetPercent: number;
    socChangeHeightPercent: number;
    socStepOffsetPercent: number;
    remainingEnergyKwh: number;
    remainingEnergyHeightPercent: number;
    movementValueKwh: number;
    movementHeightPercent: number;
    movementOffsetPercent: number;
    movementToneClass: "charge" | "discharge" | "idle";
    chargedKwh: number;
    dischargedKwh: number;
    importedFromGridKwh: number;
    exportedToGridKwh: number;
    hitMinSoc: boolean;
    hitMaxSoc: boolean;
    limitedByChargePower: boolean;
    limitedByDischargePower: boolean;
}

export interface BatteryDetailChartModel {
    columns: BatteryDetailColumnModel[];
    minSocOffsetPercent: number | null;
    maxSocOffsetPercent: number | null;
    hasBidirectionalMovement: boolean;
}

interface BuildBatteryDetailChartModelParams {
    day: BatteryCapacityForecastDay;
    nominalCapacityKwh: number | null;
    minSoc: number | null;
    maxSoc: number | null;
    context: BatteryChartBuildContext;
}

const DETAIL_MAX_BAR_HEIGHT = 78;
const DETAIL_SIGNED_BAR_HEIGHT = 34;

export function buildBatteryDetailChartModel({
    day,
    nominalCapacityKwh,
    minSoc,
    maxSoc,
    context,
}: BuildBatteryDetailChartModelParams): BatteryDetailChartModel {
    const timestamps = day.slots.map((slot) => slot.timestamp);
    const sparseHourLabels = _buildSparseHourLabelMap(timestamps, context);
    const energyScaleMaxKwh = _resolveEnergyScaleMax(day, nominalCapacityKwh);
    const movementMaxKwh = Math.max(
        ...day.slots.map((slot) => Math.max(slot.chargedKwh, slot.dischargedKwh, 0)),
        0,
    );
    const hasBidirectionalMovement = day.slots.some((slot) => slot.chargedKwh > 0)
        && day.slots.some((slot) => slot.dischargedKwh > 0);

    return {
        columns: day.slots.map((slot, index) => {
            const startSocPct = index === 0 ? day.startSocPct : day.slots[index - 1].socPct;
            const endSocPct = slot.socPct;
            const normalizedStartSoc = _normalizePercent(startSocPct) ?? 0;
            const normalizedEndSoc = _normalizePercent(endSocPct) ?? 0;
            const movementValueKwh = slot.chargedKwh > 0
                ? slot.chargedKwh
                : slot.dischargedKwh > 0
                    ? -slot.dischargedKwh
                    : 0;
            const movementHeightPercent = _normalizeBarHeight(
                Math.abs(movementValueKwh),
                movementMaxKwh,
                hasBidirectionalMovement ? DETAIL_SIGNED_BAR_HEIGHT : DETAIL_MAX_BAR_HEIGHT,
            );

            return {
                timestamp: slot.timestamp,
                endsAt: slot.endsAt,
                durationHours: slot.durationHours,
                hourLabel: sparseHourLabels.get(index) ?? null,
                isPast: _isPastTimestamp(slot.timestamp, day.isToday, context),
                startSocPct,
                endSocPct,
                socChangeOffsetPercent: Math.min(normalizedStartSoc, normalizedEndSoc),
                socChangeHeightPercent: Math.abs(normalizedEndSoc - normalizedStartSoc),
                socStepOffsetPercent: normalizedEndSoc,
                remainingEnergyKwh: slot.remainingEnergyKwh,
                remainingEnergyHeightPercent: _normalizeBarHeight(
                    Math.max(slot.remainingEnergyKwh, 0),
                    energyScaleMaxKwh,
                    DETAIL_MAX_BAR_HEIGHT,
                ),
                movementValueKwh,
                movementHeightPercent,
                movementOffsetPercent: movementValueKwh === 0 || !hasBidirectionalMovement
                    ? 0
                    : movementValueKwh < 0
                        ? Math.max(0, 50 - movementHeightPercent)
                        : 50,
                movementToneClass: movementValueKwh > 0
                    ? "charge"
                    : movementValueKwh < 0
                        ? "discharge"
                        : "idle",
                chargedKwh: slot.chargedKwh,
                dischargedKwh: slot.dischargedKwh,
                importedFromGridKwh: slot.importedFromGridKwh,
                exportedToGridKwh: slot.exportedToGridKwh,
                hitMinSoc: slot.hitMinSoc,
                hitMaxSoc: slot.hitMaxSoc,
                limitedByChargePower: slot.limitedByChargePower,
                limitedByDischargePower: slot.limitedByDischargePower,
            };
        }),
        minSocOffsetPercent: _normalizePercent(minSoc),
        maxSocOffsetPercent: _normalizePercent(maxSoc),
        hasBidirectionalMovement,
    };
}

function _buildSparseHourLabelMap(
    timestamps: string[],
    context: BatteryChartBuildContext,
): Map<number, string> {
    if (timestamps.length === 0) {
        return new Map();
    }

    const targetIndices = timestamps.length <= 6
        ? timestamps.map((_, index) => index)
        : [
            0,
            Math.round((timestamps.length - 1) / 3),
            Math.round(((timestamps.length - 1) * 2) / 3),
            timestamps.length - 1,
        ];
    const labelIndices = new Set<number>();

    for (const targetIndex of targetIndices) {
        let bestIndex = targetIndex;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (let index = 0; index < timestamps.length; index++) {
            if (labelIndices.has(index)) {
                continue;
            }

            const parts = getCachedLocalDateTimeParts(timestamps[index], context.timeZone);
            if (parts === null || parts.hour % 6 !== 0) {
                continue;
            }

            const distance = Math.abs(index - targetIndex);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = index;
            }
        }

        labelIndices.add(bestIndex);
    }

    for (const targetIndex of targetIndices) {
        if (labelIndices.size >= Math.min(targetIndices.length, timestamps.length)) {
            break;
        }

        labelIndices.add(targetIndex);
    }

    return new Map(
        Array.from(labelIndices)
            .sort((left, right) => left - right)
            .map((index) => [index, _formatHourAxisLabel(timestamps[index], context)]),
    );
}

function _formatHourAxisLabel(timestamp: string, context: BatteryChartBuildContext): string {
    return new Date(timestamp).toLocaleTimeString(context.locale, {
        timeZone: context.timeZone,
        hour: "2-digit",
        hourCycle: "h23",
    });
}

function _isPastTimestamp(
    timestamp: string,
    isToday: boolean,
    context: BatteryChartBuildContext,
): boolean {
    if (!isToday || context.currentDayKey === null || context.currentHour === null) {
        return false;
    }

    const parts = getCachedLocalDateTimeParts(timestamp, context.timeZone);
    if (parts === null) {
        return false;
    }

    return parts.dayKey === context.currentDayKey && parts.hour < context.currentHour;
}

function _normalizeBarHeight(value: number, maxValue: number, maxHeightPercent: number): number {
    if (value <= 0 || maxValue <= 0) {
        return 0;
    }

    return Math.max((value / maxValue) * maxHeightPercent, maxHeightPercent * 0.12);
}

function _normalizePercent(value: number | null): number | null {
    if (!Number.isFinite(value ?? NaN)) {
        return null;
    }

    return Math.min(Math.max(value ?? 0, 0), 100);
}

function _resolveEnergyScaleMax(day: BatteryCapacityForecastDay, nominalCapacityKwh: number | null): number {
    const observedMax = Math.max(
        day.startRemainingEnergyKwh,
        ...day.slots.map((slot) => slot.remainingEnergyKwh),
        0,
    );

    if (!Number.isFinite(nominalCapacityKwh ?? NaN) || (nominalCapacityKwh ?? 0) <= 0) {
        return observedMax;
    }

    return Math.max(nominalCapacityKwh ?? 0, observedMax);
}
