import type { BatteryCapacityForecastDay } from "./battery-capacity-forecast-detail-model";
import {
    buildSparseHourLabelMap,
    clampForecastPercent,
    isPastForecastTimestamp,
    normalizeForecastBarHeight,
    type ForecastChartBuildContext,
} from "./forecast-chart-shared";

export type BatteryChartBuildContext = ForecastChartBuildContext;

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
    minSoc: number | null;
    maxSoc: number | null;
    context: BatteryChartBuildContext;
}

const DETAIL_MAX_BAR_HEIGHT = 78;
const DETAIL_SIGNED_BAR_HEIGHT = 34;

export function buildBatteryDetailChartModel({
    day,
    minSoc,
    maxSoc,
    context,
}: BuildBatteryDetailChartModelParams): BatteryDetailChartModel {
    const timestamps = day.slots.map((slot) => slot.timestamp);
    const sparseHourLabels = buildSparseHourLabelMap(timestamps, context);
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
            const normalizedStartSoc = clampForecastPercent(startSocPct) ?? 0;
            const normalizedEndSoc = clampForecastPercent(endSocPct) ?? 0;
            const movementValueKwh = slot.chargedKwh > 0
                ? slot.chargedKwh
                : slot.dischargedKwh > 0
                    ? -slot.dischargedKwh
                    : 0;
            const movementHeightPercent = normalizeForecastBarHeight(
                Math.abs(movementValueKwh),
                movementMaxKwh,
                hasBidirectionalMovement ? DETAIL_SIGNED_BAR_HEIGHT : DETAIL_MAX_BAR_HEIGHT,
            );

            return {
                timestamp: slot.timestamp,
                endsAt: slot.endsAt,
                durationHours: slot.durationHours,
                hourLabel: sparseHourLabels.get(index) ?? null,
                isPast: isPastForecastTimestamp(slot.timestamp, day.isToday, context),
                startSocPct,
                endSocPct,
                socChangeOffsetPercent: Math.min(normalizedStartSoc, normalizedEndSoc),
                socChangeHeightPercent: Math.abs(normalizedEndSoc - normalizedStartSoc),
                socStepOffsetPercent: normalizedEndSoc,
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
        minSocOffsetPercent: clampForecastPercent(minSoc),
        maxSocOffsetPercent: clampForecastPercent(maxSoc),
        hasBidirectionalMovement,
    };
}
