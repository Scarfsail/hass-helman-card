import type {
    ScheduleAction,
    ScheduleDialogResult,
    ScheduleSlot,
    ScheduleSlotPatch,
} from "../schedule-types";
import { areScheduleActionsEqual } from "../schedule-types";

export function buildScheduleSlotPatches({
    selectedSlots,
    action,
}: {
    selectedSlots: readonly ScheduleSlot[];
    action: ScheduleAction;
}): ScheduleSlotPatch[] {
    const patches: ScheduleSlotPatch[] = [];
    for (const slot of selectedSlots) {
        if (areScheduleActionsEqual(slot.action, action)) {
            continue;
        }

        patches.push({
            id: slot.id,
            action: _cloneAction(action),
        });
    }

    return patches;
}

function _cloneAction(action: ScheduleDialogResult["action"]): ScheduleDialogResult["action"] {
    return action.targetSoc === undefined
        ? { kind: action.kind }
        : { kind: action.kind, targetSoc: action.targetSoc };
}
