import type {
    ScheduleDomains,
    ScheduleDialogResult,
    ScheduleSlot,
    ScheduleSlotPatch,
} from "../schedule-types";
import {
    areScheduleDomainsEqual,
    cloneScheduleApplianceAction,
    cloneScheduleDomains,
} from "../schedule-types";

export function buildScheduleSlotPatches({
    selectedSlots,
    result,
}: {
    selectedSlots: readonly ScheduleSlot[];
    result: ScheduleDialogResult;
}): ScheduleSlotPatch[] {
    const patches: ScheduleSlotPatch[] = [];
    for (const slot of selectedSlots) {
        const nextDomains = _buildNextDomains(slot, result);
        if (!_requiresForcedPatch(slot, result) && areScheduleDomainsEqual(slot.domains, nextDomains)) {
            continue;
        }

        patches.push({
            id: slot.id,
            domains: nextDomains,
        });
    }

    return patches;
}

function _buildNextDomains(
    slot: ScheduleSlot,
    result: ScheduleDialogResult,
): ScheduleDomains {
    const nextDomains = cloneScheduleDomains(slot.domains);
    if (result.editedInverter) {
        nextDomains.inverter = _cloneDomains(result.domains).inverter;
    }

    for (const applianceId of result.editedApplianceIds) {
        const action = result.domains.appliances[applianceId];
        if (action === undefined) {
            delete nextDomains.appliances[applianceId];
            continue;
        }

        nextDomains.appliances[applianceId] = cloneScheduleApplianceAction(action);
    }

    return nextDomains;
}

function _cloneDomains(domains: ScheduleDialogResult["domains"]): ScheduleDialogResult["domains"] {
    return cloneScheduleDomains(domains);
}

function _requiresForcedPatch(slot: ScheduleSlot, result: ScheduleDialogResult): boolean {
    if (result.forceTakeoverInverter && slot.authorship.inverter !== "user") {
        return true;
    }

    return result.forceTakeoverApplianceIds.some((applianceId) => slot.authorship.appliances[applianceId] === "automation");
}
