import type {
    ScheduleDialogResult,
    ScheduleSlot,
    ScheduleSlotPatch,
} from "../schedule-types";
import { areScheduleActionsEqual } from "../schedule-types";
import { SCHEDULE_SLOT_DURATION_MS } from "./schedule-time";

export function buildScheduleSlotPatches({
    slots,
    result,
}: {
    slots: readonly ScheduleSlot[];
    result: ScheduleDialogResult;
}): ScheduleSlotPatch[] {
    const { startIndex, endIndex } = _findSelectedRange(slots, result.startSlotId, result.endSlotId);
    _assertContiguousSlots(slots, startIndex, endIndex);

    const patches: ScheduleSlotPatch[] = [];
    for (let index = startIndex; index <= endIndex; index++) {
        const slot = slots[index];
        if (areScheduleActionsEqual(slot.action, result.action)) {
            continue;
        }

        patches.push({
            id: slot.id,
            action: _cloneAction(result.action),
        });
    }

    return patches;
}

function _findSelectedRange(
    slots: readonly ScheduleSlot[],
    startSlotId: string,
    endSlotId: string,
): { startIndex: number; endIndex: number } {
    const startIndex = slots.findIndex((slot) => slot.id === startSlotId);
    const endIndex = slots.findIndex((slot) => slot.id === endSlotId);
    if (startIndex === -1 || endIndex === -1) {
        throw new Error("helman-scheduling: selected range is outside the available slot set");
    }

    if (startIndex > endIndex) {
        throw new Error("helman-scheduling: selected range start is after the end");
    }

    return { startIndex, endIndex };
}

function _assertContiguousSlots(
    slots: readonly ScheduleSlot[],
    startIndex: number,
    endIndex: number,
): void {
    for (let index = startIndex + 1; index <= endIndex; index++) {
        const previous = slots[index - 1];
        const current = slots[index];
        if (current.index !== previous.index + 1 || current.startMs !== previous.startMs + SCHEDULE_SLOT_DURATION_MS) {
            throw new Error("helman-scheduling: selected range is not contiguous");
        }
    }
}

function _cloneAction(action: ScheduleDialogResult["action"]): ScheduleDialogResult["action"] {
    return action.targetSoc === undefined
        ? { kind: action.kind }
        : { kind: action.kind, targetSoc: action.targetSoc };
}
