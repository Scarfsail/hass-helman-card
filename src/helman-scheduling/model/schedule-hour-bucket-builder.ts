import type { SlotForecastMap } from "./slot-forecast-model";
import { aggregateScheduleHourForecast } from "./schedule-table-forecast";
import {
    buildScheduleCompactExpandedRangeLabel,
    getScheduleLocalTimeParts,
    getScheduleTimeRangeLabels,
    type ScheduleLocalTimeParts,
} from "./schedule-time";
import type {
    ScheduleTableActionPillModel,
    ScheduleTableHourRowModel,
    ScheduleTableRowModel,
    ScheduleTableSlotRowModel,
} from "../schedule-table-types";
import {
    getScheduleActionIdentityKey,
    type ScheduleSlot,
} from "../schedule-types";

interface ScheduleHourBucket {
    hourKey: string;
    dayKey: string;
    slots: ScheduleSlot[];
}

export function buildScheduleTableRows({
    slots,
    slotForecastMap,
    expandedHourKeys,
    locale,
    timeZone,
}: {
    slots: readonly ScheduleSlot[];
    slotForecastMap: SlotForecastMap;
    expandedHourKeys: ReadonlySet<string>;
    locale: string;
    timeZone: string;
}): ScheduleTableRowModel[] {
    const rows: ScheduleTableRowModel[] = [];

    for (const bucket of _buildHourBuckets(slots, timeZone)) {
        if (_isCollapsibleHourBucket(bucket, timeZone)) {
            rows.push(_buildHourRow({
                bucket,
                slotForecastMap,
                expanded: expandedHourKeys.has(bucket.hourKey),
                locale,
                timeZone,
            }));
            continue;
        }

        for (const slot of bucket.slots) {
            rows.push(_buildSlotRow({
                slot,
                slotForecastMap,
                locale,
                timeZone,
                variant: "raw",
                showRuntime: slot.isCurrent,
            }));
        }
    }

    return _disambiguateRepeatedHourRows(rows);
}

function _buildHourBuckets(
    slots: readonly ScheduleSlot[],
    timeZone: string,
): ScheduleHourBucket[] {
    const buckets: ScheduleHourBucket[] = [];
    let currentBucket: ScheduleHourBucket | null = null;

    for (const slot of slots) {
        const hourKey = _buildHourKey(slot.startMs, timeZone);
        if (hourKey === null) {
            buckets.push({
                hourKey: `invalid:${slot.id}`,
                dayKey: slot.dayKey,
                slots: [slot],
            });
            currentBucket = null;
            continue;
        }

        if (currentBucket === null || currentBucket.hourKey !== hourKey) {
            currentBucket = {
                hourKey,
                dayKey: slot.dayKey,
                slots: [slot],
            };
            buckets.push(currentBucket);
            continue;
        }

        currentBucket.slots.push(slot);
    }

    return buckets;
}

function _buildHourKey(startMs: number, timeZone: string): string | null {
    const parts = getScheduleLocalTimeParts(startMs, timeZone);
    if (parts === null) {
        return null;
    }

    return `${parts.dayKey}:${String(parts.hour).padStart(2, "0")}:${parts.offset}`;
}

function _isCollapsibleHourBucket(
    bucket: ScheduleHourBucket,
    timeZone: string,
): boolean {
    if (bucket.slots.length <= 1) {
        return false;
    }

    if (!_hasContiguousCoverage(bucket.slots)) {
        return false;
    }

    const firstSlot = bucket.slots[0];
    const lastSlot = bucket.slots[bucket.slots.length - 1];
    if (lastSlot.endMs === null) {
        return false;
    }

    const firstParts = getScheduleLocalTimeParts(firstSlot.startMs, timeZone);
    const lastEndParts = getScheduleLocalTimeParts(lastSlot.endMs, timeZone);
    if (firstParts === null || lastEndParts === null) {
        return false;
    }

    if (firstParts.minute !== 0 || lastEndParts.minute !== 0) {
        return false;
    }

    if (!_hasStableLocalOffset(bucket.slots, timeZone, firstParts.offset)) {
        return false;
    }

    return _isImmediateNextLocalHour(firstParts, lastEndParts);
}

function _hasContiguousCoverage(slots: readonly ScheduleSlot[]): boolean {
    for (let index = 0; index < slots.length; index += 1) {
        const slot = slots[index];
        if (slot.endMs === null) {
            return false;
        }

        const nextSlot = slots[index + 1];
        if (nextSlot && slot.endMs !== nextSlot.startMs) {
            return false;
        }
    }

    return true;
}

function _hasStableLocalOffset(
    slots: readonly ScheduleSlot[],
    timeZone: string,
    expectedOffset: string,
): boolean {
    for (const slot of slots) {
        const startParts = getScheduleLocalTimeParts(slot.startMs, timeZone);
        if (startParts === null || startParts.offset !== expectedOffset) {
            return false;
        }

        if (slot.endMs === null) {
            return false;
        }

        const endParts = getScheduleLocalTimeParts(slot.endMs, timeZone);
        if (endParts === null || endParts.offset !== expectedOffset) {
            return false;
        }
    }

    return true;
}

function _isImmediateNextLocalHour(
    startParts: ScheduleLocalTimeParts,
    endParts: ScheduleLocalTimeParts,
): boolean {
    if (startParts.offset !== endParts.offset) {
        return false;
    }

    if (startParts.dayKey === endParts.dayKey) {
        return endParts.hour === startParts.hour + 1;
    }

    return startParts.hour === 23
        && endParts.hour === 0
        && endParts.dayKey === _addDayKey(startParts.dayKey, 1);
}

function _addDayKey(dayKey: string, days: number): string {
    const date = new Date(`${dayKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function _buildHourRow({
    bucket,
    slotForecastMap,
    expanded,
    locale,
    timeZone,
}: {
    bucket: ScheduleHourBucket;
    slotForecastMap: SlotForecastMap;
    expanded: boolean;
    locale: string;
    timeZone: string;
}): ScheduleTableHourRowModel {
    const firstSlot = bucket.slots[0];
    const lastSlot = bucket.slots[bucket.slots.length - 1];
    const rangeLabel = getScheduleTimeRangeLabels({
        startMs: firstSlot.startMs,
        endMs: lastSlot.endMs,
        locale,
        timeZone,
    }).rangeLabel;

    return {
        kind: "hour",
        rowId: `hour:${bucket.hourKey}`,
        hourKey: bucket.hourKey,
        dayKey: bucket.dayKey,
        displayTimeLabel: {
            leading: null,
            primary: firstSlot.timeLabel,
            trailing: null,
            hideLeading: false,
            hideTrailing: false,
        },
        rangeLabel,
        slotIds: bucket.slots.map((slot) => slot.id),
        actionPills: _buildDistinctActionPills(bucket.slots),
        forecast: aggregateScheduleHourForecast({
            slots: bucket.slots,
            slotForecastMap,
        }),
        expanded,
        runtimeSlot: expanded
            ? null
            : bucket.slots.find((slot) => slot.isCurrent) ?? null,
        childRows: expanded
            ? bucket.slots.map((slot) => _buildSlotRow({
                slot,
                slotForecastMap,
                locale,
                timeZone,
                variant: "hour-child",
                showRuntime: slot.isCurrent,
            }))
            : [],
    };
}

function _buildDistinctActionPills(
    slots: readonly ScheduleSlot[],
): ScheduleTableActionPillModel[] {
    const actionPills: ScheduleTableActionPillModel[] = [];
    const seenKeys = new Set<string>();

    for (const slot of slots) {
        const key = getScheduleActionIdentityKey(slot.action);
        if (seenKeys.has(key)) {
            continue;
        }

        seenKeys.add(key);
        actionPills.push({
            key,
            action: slot.action,
            firstSlotId: slot.id,
        });
    }

    return actionPills;
}

function _buildSlotRow({
    slot,
    slotForecastMap,
    locale,
    timeZone,
    variant,
    showRuntime,
}: {
    slot: ScheduleSlot;
    slotForecastMap: SlotForecastMap;
    locale: string;
    timeZone: string;
    variant: "raw" | "hour-child";
    showRuntime: boolean;
}): ScheduleTableSlotRowModel {
    return {
        kind: "slot",
        rowId: variant === "raw" ? `slot:${slot.id}` : `hour-child:${slot.id}`,
        slot,
        displayTimeLabel: variant === "raw"
            ? {
                leading: null,
                primary: slot.timeLabel,
                trailing: null,
                hideLeading: false,
                hideTrailing: false,
            }
            : buildScheduleCompactExpandedRangeLabel({
                startMs: slot.startMs,
                endMs: slot.endMs,
                locale,
                timeZone,
            }),
        rangeLabel: slot.rangeLabel,
        forecast: slotForecastMap.points.get(slot.id) ?? null,
        variant,
        showRuntime,
    };
}

function _disambiguateRepeatedHourRows(
    rows: readonly ScheduleTableRowModel[],
): ScheduleTableRowModel[] {
    const repeatedRangeLabels = new Set<string>();
    const rangeLabelCounts = new Map<string, number>();

    for (const row of rows) {
        if (row.kind !== "hour") {
            continue;
        }

        rangeLabelCounts.set(row.rangeLabel, (rangeLabelCounts.get(row.rangeLabel) ?? 0) + 1);
    }

    for (const [rangeLabel, count] of rangeLabelCounts) {
        if (count > 1) {
            repeatedRangeLabels.add(rangeLabel);
        }
    }

    if (repeatedRangeLabels.size === 0) {
        return [...rows];
    }

    return rows.map((row) => {
        if (row.kind !== "hour" || !repeatedRangeLabels.has(row.rangeLabel)) {
            return row;
        }

        const offsetLabel = _extractHourOffsetLabel(row.hourKey);
        return {
            ...row,
            displayTimeLabel: {
                ...row.displayTimeLabel,
                trailing: `${row.displayTimeLabel.trailing ?? ""} (${offsetLabel})`,
                hideTrailing: false,
            },
            rangeLabel: `${row.rangeLabel} (${offsetLabel})`,
            childRows: row.childRows.map((childRow) => ({
                ...childRow,
                displayTimeLabel: {
                    ...childRow.displayTimeLabel,
                    trailing: `${childRow.displayTimeLabel.trailing ?? ""} (${offsetLabel})`,
                    hideTrailing: true,
                },
            })),
        };
    });
}

function _extractHourOffsetLabel(hourKey: string): string {
    const match = /([+-]\d{2}:\d{2})$/.exec(hourKey);
    return match ? `UTC${match[1]}` : hourKey;
}
