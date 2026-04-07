import type { SlotForecastMap, SlotForecastPoint } from "./slot-forecast-model";
import type { ScheduleApplianceMetadata } from "./schedule-appliance-metadata";
import {
    getScheduleApplianceProjectionBadge,
    mergeScheduleApplianceProjectionBadges,
    type ScheduleApplianceProjectionIndex,
} from "./schedule-appliance-projection";
import { getScheduleApplianceById } from "./schedule-appliance-metadata";
import { aggregateScheduleHourForecast } from "./schedule-table-forecast";
import {
    buildScheduleCompactExpandedRangeLabel,
    getScheduleLocalTimeParts,
    getScheduleTimeRangeLabels,
    type ScheduleLocalTimeParts,
} from "./schedule-time";
import type {
    ScheduleTableActionCellModel,
    ScheduleTableActionItemModel,
    ScheduleTableApplianceActionItemModel,
    ScheduleTableDetailRowModel,
    ScheduleTableHourRowModel,
    ScheduleTableRowModel,
    ScheduleTableSlotRowModel,
} from "../schedule-table-types";
import {
    getScheduleActionIdentityKey,
    getScheduleApplianceActionIdentityKey,
    isScheduleApplianceActionEnabled,
    isScheduleBackedDisplaySlot,
    type ScheduleDisplaySlot,
    type ScheduleSlot,
} from "../schedule-types";

interface ScheduleHourBucket {
    hourKey: string;
    dayKey: string;
    slots: ScheduleDisplaySlot[];
}

export function buildScheduleTableRows({
    slots,
    appliances,
    applianceProjectionIndex,
    slotForecastMap,
    expandedHourKeys,
    locale,
    timeZone,
}: {
    slots: readonly ScheduleDisplaySlot[];
    appliances: readonly ScheduleApplianceMetadata[];
    applianceProjectionIndex: ScheduleApplianceProjectionIndex;
    slotForecastMap: SlotForecastMap;
    expandedHourKeys: ReadonlySet<string>;
    locale: string;
    timeZone: string;
}): ScheduleTableRowModel[] {
    const rows: ScheduleTableRowModel[] = [];

    for (const bucket of _buildHourBuckets(slots, timeZone)) {
        if (_isCollapsibleHourBucket(bucket, timeZone)) {
            const hourRow = _buildHourRow({
                bucket,
                appliances,
                applianceProjectionIndex,
                slotForecastMap,
                expanded: expandedHourKeys.has(bucket.hourKey),
                locale,
                timeZone,
            });
            rows.push(hourRow);

            if (hourRow.expanded) {
                for (const slot of bucket.slots) {
                    const childRow = _buildSlotRow({
                        slot,
                        appliances,
                        applianceProjectionIndex,
                        slotForecastMap,
                        locale,
                        timeZone,
                        variant: "hour-child",
                        parentHourKey: bucket.hourKey,
                    });
                    rows.push(childRow);
                    if (slot.isCurrent && isScheduleBackedDisplaySlot(slot)) {
                        rows.push(_buildDetailRow({
                            ownerRowId: childRow.rowId,
                            slot: slot.scheduleSlot,
                            variant: "hour-child",
                        }));
                    }
                }
            } else {
                const currentSlot = bucket.slots.find((slot) => slot.isCurrent && isScheduleBackedDisplaySlot(slot));
                if (currentSlot && isScheduleBackedDisplaySlot(currentSlot)) {
                    rows.push(_buildDetailRow({
                        ownerRowId: hourRow.rowId,
                        slot: currentSlot.scheduleSlot,
                        variant: "hour",
                    }));
                }
            }
            continue;
        }

        for (const slot of bucket.slots) {
            const slotRow = _buildSlotRow({
                slot,
                appliances,
                applianceProjectionIndex,
                slotForecastMap,
                locale,
                timeZone,
                variant: "raw",
                parentHourKey: null,
            });
            rows.push(slotRow);
            if (slot.isCurrent && isScheduleBackedDisplaySlot(slot)) {
                rows.push(_buildDetailRow({
                    ownerRowId: slotRow.rowId,
                    slot: slot.scheduleSlot,
                    variant: "raw",
                }));
            }
        }
    }

    return _disambiguateRepeatedHourRows(rows);
}

export function collectScheduleHourForecasts({
    slots,
    slotForecastMap,
    timeZone,
}: {
    slots: readonly ScheduleDisplaySlot[];
    slotForecastMap: SlotForecastMap;
    timeZone: string;
}): SlotForecastPoint[] {
    return _buildHourBuckets(slots, timeZone)
        .filter((bucket) => _isCollapsibleHourBucket(bucket, timeZone))
        .flatMap((bucket) => {
            const point = aggregateScheduleHourForecast({
                slots: bucket.slots,
                slotForecastMap,
            });
            return point ? [point] : [];
        });
}

function _buildHourBuckets(
    slots: readonly ScheduleDisplaySlot[],
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

    if (!bucket.slots.every((slot) => slot.source === bucket.slots[0].source)) {
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

function _hasContiguousCoverage(slots: readonly ScheduleDisplaySlot[]): boolean {
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
    slots: readonly ScheduleDisplaySlot[],
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
    appliances,
    applianceProjectionIndex,
    slotForecastMap,
    expanded,
    locale,
    timeZone,
}: {
    bucket: ScheduleHourBucket;
    appliances: readonly ScheduleApplianceMetadata[];
    applianceProjectionIndex: ScheduleApplianceProjectionIndex;
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
        slotIds: bucket.slots
            .filter(isScheduleBackedDisplaySlot)
            .map((slot) => slot.scheduleSlot.id),
        actionCell: _buildActionCell(bucket.slots, appliances, applianceProjectionIndex),
        forecast: aggregateScheduleHourForecast({
            slots: bucket.slots,
            slotForecastMap,
        }),
        isCurrent: !expanded && bucket.slots.some((slot) => slot.isCurrent),
        expanded,
    };
}

function _buildDistinctInverterItems(
    slots: readonly ScheduleDisplaySlot[],
): ScheduleTableActionItemModel[] {
    const actionItems: ScheduleTableActionItemModel[] = [];
    const seenKeys = new Set<string>();

    for (const slot of slots) {
        if (!isScheduleBackedDisplaySlot(slot)) {
            continue;
        }

        const key = getScheduleActionIdentityKey(slot.scheduleSlot.domains.inverter);
        if (seenKeys.has(key)) {
            continue;
        }

        seenKeys.add(key);
        actionItems.push({
            kind: "inverter",
            key,
            action: slot.scheduleSlot.domains.inverter,
            firstSlotId: slot.scheduleSlot.id,
        });
    }

    return actionItems;
}

function _buildDistinctApplianceItems(
    slots: readonly ScheduleDisplaySlot[],
    appliances: readonly ScheduleApplianceMetadata[],
    applianceProjectionIndex: ScheduleApplianceProjectionIndex,
): ScheduleTableActionItemModel[] {
    const applianceOrder = new Map(
        appliances.map((appliance) => [appliance.id, appliance.order] as const),
    );
    const actions = slots.flatMap((slot) => {
        if (!isScheduleBackedDisplaySlot(slot)) {
            return [];
        }

        return Object.entries(slot.scheduleSlot.domains.appliances).flatMap(([applianceId, action]) => {
            const appliance = getScheduleApplianceById(appliances, applianceId);
            if (appliance?.kind === "generic" && isScheduleApplianceActionEnabled(action) !== true) {
                return [];
            }

            return [{
                slotId: slot.scheduleSlot.id,
                applianceId,
                action,
                appliance,
                order: applianceOrder.get(applianceId) ?? Number.MAX_SAFE_INTEGER,
            }];
        });
    }).sort((left, right) => {
        if (left.order !== right.order) {
            return left.order - right.order;
        }
        if (left.applianceId !== right.applianceId) {
            return left.applianceId.localeCompare(right.applianceId);
        }
        return left.slotId.localeCompare(right.slotId);
    });

    const items: ScheduleTableActionItemModel[] = [];
    const itemsByKey = new Map<string, ScheduleTableApplianceActionItemModel>();
    for (const entry of actions) {
        const key = `${entry.applianceId}:${getScheduleApplianceActionIdentityKey(entry.action)}`;
        const projectionBadge = getScheduleApplianceProjectionBadge({
            projectionIndex: applianceProjectionIndex,
            applianceKind: entry.appliance?.kind,
            applianceId: entry.applianceId,
            action: entry.action,
            slotId: entry.slotId,
        });
        const existing = itemsByKey.get(key);
        if (existing) {
            existing.projectionBadge = mergeScheduleApplianceProjectionBadges(
                existing.projectionBadge,
                projectionBadge,
            );
            continue;
        }

        const item = {
            kind: "appliance",
            key,
            applianceId: entry.applianceId,
            applianceName: entry.appliance?.name ?? entry.applianceId,
            applianceKind: entry.appliance?.kind ?? "unknown",
            action: entry.action,
            firstSlotId: entry.slotId,
            projectionBadge,
        } satisfies ScheduleTableApplianceActionItemModel;
        itemsByKey.set(key, item);
        items.push(item);
    }

    return items;
}

function _buildActionCell(
    slots: readonly ScheduleDisplaySlot[],
    appliances: readonly ScheduleApplianceMetadata[],
    applianceProjectionIndex: ScheduleApplianceProjectionIndex,
): ScheduleTableActionCellModel {
    const scheduleBackedSlots = slots.filter(isScheduleBackedDisplaySlot);
    return {
        items: [
            ..._buildDistinctInverterItems(scheduleBackedSlots),
            ..._buildDistinctApplianceItems(scheduleBackedSlots, appliances, applianceProjectionIndex),
        ],
        interactive: scheduleBackedSlots.length > 0,
    };
}

function _buildSlotRow({
    slot,
    appliances,
    applianceProjectionIndex,
    slotForecastMap,
    locale,
    timeZone,
    variant,
    parentHourKey,
}: {
    slot: ScheduleDisplaySlot;
    appliances: readonly ScheduleApplianceMetadata[];
    applianceProjectionIndex: ScheduleApplianceProjectionIndex;
    slotForecastMap: SlotForecastMap;
    locale: string;
    timeZone: string;
    variant: "raw" | "hour-child";
    parentHourKey: string | null;
}): ScheduleTableSlotRowModel {
    return {
        kind: "slot",
        rowId: variant === "raw" ? `slot:${slot.id}` : `hour-child:${slot.id}`,
        slot,
        actionCell: _buildActionCell([slot], appliances, applianceProjectionIndex),
        interactiveSlotId: isScheduleBackedDisplaySlot(slot) ? slot.scheduleSlot.id : null,
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
        isCurrent: slot.isCurrent,
        variant,
        parentHourKey,
    };
}
function _buildDetailRow({
    ownerRowId,
    slot,
    variant,
}: {
    ownerRowId: string;
    slot: ScheduleSlot;
    variant: ScheduleTableDetailRowModel["variant"];
}): ScheduleTableDetailRowModel {
    return {
        kind: "detail",
        rowId: `detail:${ownerRowId}`,
        ownerRowId,
        slot,
        variant,
    };
}

function _disambiguateRepeatedHourRows(
    rows: readonly ScheduleTableRowModel[],
): ScheduleTableRowModel[] {
    const repeatedRangeLabels = new Set<string>();
    const repeatedHourKeys = new Set<string>();
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

    for (const row of rows) {
        if (row.kind === "hour" && repeatedRangeLabels.has(row.rangeLabel)) {
            repeatedHourKeys.add(row.hourKey);
        }
    }

    if (repeatedRangeLabels.size === 0) {
        return [...rows];
    }

    return rows.map((row) => {
        if (row.kind === "hour" && repeatedRangeLabels.has(row.rangeLabel)) {
            const offsetLabel = _extractHourOffsetLabel(row.hourKey);
            return {
                ...row,
                displayTimeLabel: {
                    ...row.displayTimeLabel,
                    trailing: `${row.displayTimeLabel.trailing ?? ""} (${offsetLabel})`,
                    hideTrailing: false,
                },
                rangeLabel: `${row.rangeLabel} (${offsetLabel})`,
            };
        }

        if (
            row.kind === "slot"
            && row.variant === "hour-child"
            && row.parentHourKey !== null
            && repeatedHourKeys.has(row.parentHourKey)
        ) {
            const offsetLabel = _extractHourOffsetLabel(row.parentHourKey);
            return {
                ...row,
                displayTimeLabel: {
                    ...row.displayTimeLabel,
                    trailing: `${row.displayTimeLabel.trailing ?? ""} (${offsetLabel})`,
                    hideTrailing: true,
                },
                rangeLabel: `${row.rangeLabel} (${offsetLabel})`,
            };
        }

        return row;
    });
}

function _extractHourOffsetLabel(hourKey: string): string {
    const match = /([+-]\d{2}:\d{2})$/.exec(hourKey);
    return match ? `UTC${match[1]}` : hourKey;
}
