import type {
    ActiveSlotRuntimeDTO,
    ScheduleActionDTO,
    SchedulePayload,
    ScheduleSlotDTO,
} from "../helman-api";

export type ScheduleAction = ScheduleActionDTO;
export type ScheduleActionKind = ScheduleAction["kind"];
export type ScheduleRuntime = ActiveSlotRuntimeDTO;

export interface ScheduleSlot {
    id: string;
    index: number;
    startMs: number;
    endMs: number;
    dayKey: string;
    timeLabel: string;
    endLabel: string;
    rangeLabel: string;
    action: ScheduleAction;
    runtime: ScheduleRuntime | null;
    isCurrent: boolean;
}

export interface ScheduleNowStripModel {
    slotId: string;
    rangeLabel: string;
    scheduledAction: ScheduleAction;
    runtime: ScheduleRuntime | null;
}

export interface ScheduleAccessorySummary {
    label: string;
}

export interface ScheduleIntervalRowModel {
    id: string;
    dayKey: string;
    startSlotId: string;
    endSlotId: string;
    startMs: number;
    endMs: number;
    timeRangeLabel: string;
    action: ScheduleAction;
    slotCount: number;
    slotIds: string[];
    slots: ScheduleSlot[];
    containsCurrentSlot: boolean;
    currentSlotId: string | null;
    accessory: ScheduleAccessorySummary | null;
}

export interface ScheduleDaySectionModel {
    dayKey: string;
    dayLabel: string;
    rows: ScheduleIntervalRowModel[];
}

export interface ScheduleSlotSelectionDetail {
    intervalId: string;
    slotId: string;
    selected: boolean;
}

export interface ScheduleIntervalSelectionDetail {
    intervalId: string;
    slotIds: string[];
    selected: boolean;
}

export interface ScheduleOpenDialogDetail {
    intervalId: string;
}

export interface ScheduleDialogState {
    intervalId: string;
    intervalLabel: string;
    selectedSlots: ScheduleSlot[];
    initialAction: ScheduleAction;
}

export interface ScheduleDialogResult {
    action: ScheduleAction;
}

export interface ScheduleOwnerError {
    code: string | null;
    message: string;
}

export interface ScheduleOwnerSnapshot {
    schedule: SchedulePayload | null;
    loading: boolean;
    refreshing: boolean;
    writing: boolean;
    togglingExecution: boolean;
    error: ScheduleOwnerError | null;
    updatedAt: number | null;
    stale: boolean;
}

export interface NormalizedScheduleModel {
    slots: ScheduleSlot[];
    now: ScheduleNowStripModel | null;
    currentSlotId: string | null;
    currentDayKey: string | null;
}

export interface ScheduleSlotPatch extends Pick<ScheduleSlotDTO, "id" | "action"> {}

export function areScheduleActionsEqual(left: ScheduleAction, right: ScheduleAction): boolean {
    return left.kind === right.kind && (left.targetSoc ?? null) === (right.targetSoc ?? null);
}

export function isTargetScheduleAction(
    action: ScheduleAction,
): action is ScheduleAction & Required<Pick<ScheduleAction, "targetSoc">> {
    return action.kind === "charge_to_target_soc" || action.kind === "discharge_to_target_soc";
}
