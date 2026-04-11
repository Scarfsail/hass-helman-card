import type { ScheduleApplianceMetadata } from "./schedule-appliance-metadata";
import type {
    ScheduleAction,
    ScheduleApplianceAction,
    ScheduleDialogState,
    ScheduleSelectionValueSummary,
    ScheduleSlot,
} from "../schedule-types";
import {
    cloneScheduleApplianceAction,
    cloneScheduleInverterAction,
    getScheduleActionIdentityKey,
    getScheduleApplianceActionIdentityKey,
} from "../schedule-types";

const NO_APPLIANCE_ACTION_KEY = "__no_action__";

export function buildScheduleRangeEditSelectionSummary({
    selectedSlots,
    appliances,
}: {
    selectedSlots: readonly ScheduleSlot[];
    appliances: readonly Pick<ScheduleApplianceMetadata, "id">[];
}): ScheduleDialogState["selectionSummary"] {
    return {
        inverter: _buildInverterSummary(selectedSlots),
        appliances: _buildApplianceSummaries(selectedSlots, appliances),
    };
}

function _buildInverterSummary(
    selectedSlots: readonly ScheduleSlot[],
): ScheduleSelectionValueSummary<ScheduleAction> {
    const firstSlot = selectedSlots[0];
    if (!firstSlot) {
        return {
            state: "uniform",
            seedValue: { kind: "empty" },
            distinctValues: [{ key: getScheduleActionIdentityKey({ kind: "empty" }), value: { kind: "empty" } }],
        };
    }

    return _buildSelectionSummary({
        values: selectedSlots.map((slot) => slot.domains.inverter),
        cloneValue: (action) => cloneScheduleInverterAction(action),
        getKey: (action) => getScheduleActionIdentityKey(action),
    });
}

function _buildApplianceSummaries(
    selectedSlots: readonly ScheduleSlot[],
    appliances: readonly Pick<ScheduleApplianceMetadata, "id">[],
): Record<string, ScheduleSelectionValueSummary<ScheduleApplianceAction | null>> {
    const orderedApplianceIds = [
        ...appliances.map((appliance) => appliance.id),
        ...[...new Set(selectedSlots.flatMap((slot) => Object.keys(slot.domains.appliances)))]
            .filter((applianceId) => !appliances.some((appliance) => appliance.id === applianceId))
            .sort((left, right) => left.localeCompare(right)),
    ];

    return Object.fromEntries(orderedApplianceIds.map((applianceId) => [
        applianceId,
        _buildSelectionSummary({
            values: selectedSlots.map((slot) => slot.domains.appliances[applianceId] ?? null),
            cloneValue: (action) => action === null ? null : cloneScheduleApplianceAction(action),
            getKey: (action) => action === null ? NO_APPLIANCE_ACTION_KEY : getScheduleApplianceActionIdentityKey(action),
        }),
    ]));
}

function _buildSelectionSummary<TValue>({
    values,
    cloneValue,
    getKey,
}: {
    values: readonly TValue[];
    cloneValue: (value: TValue) => TValue;
    getKey: (value: TValue) => string;
}): ScheduleSelectionValueSummary<TValue> {
    const firstValue = values[0];
    if (firstValue === undefined) {
        throw new Error("Cannot build selection summary without at least one value");
    }

    const distinctValues: ScheduleSelectionValueSummary<TValue>["distinctValues"] = [];
    const seenKeys = new Set<string>();

    for (const value of values) {
        const key = getKey(value);
        if (seenKeys.has(key)) {
            continue;
        }

        seenKeys.add(key);
        distinctValues.push({
            key,
            value: cloneValue(value),
        });
    }

    return {
        state: distinctValues.length > 1 ? "mixed" : "uniform",
        seedValue: cloneValue(firstValue),
        distinctValues,
    };
}
