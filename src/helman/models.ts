import type {
    ApplianceMetadataDTO,
    ApplianceProjectionDTO,
    AppliancesPayload,
    ApplianceProjectionsPayload,
    ScheduleActionDTO,
    ScheduleDomainsDTO,
    SchedulePayload,
    ScheduleSlotDTO,
} from "../helman-api";

export type HelmanSchedule = SchedulePayload;
export type HelmanScheduleAction = ScheduleActionDTO;
export type HelmanAppliances = AppliancesPayload;
export type HelmanApplianceMetadata = ApplianceMetadataDTO;
export type HelmanApplianceProjections = ApplianceProjectionsPayload;
export type HelmanApplianceProjection = ApplianceProjectionDTO;

export interface HelmanSchedulePatch {
    id: string;
    action: HelmanScheduleAction;
}

export function cloneHelmanScheduleAction(action: HelmanScheduleAction): HelmanScheduleAction {
    return action.targetSoc === undefined
        ? { kind: action.kind }
        : { kind: action.kind, targetSoc: action.targetSoc };
}

export function buildInverterOnlyScheduleDomains(
    action: HelmanScheduleAction,
): ScheduleDomainsDTO {
    return {
        inverter: cloneHelmanScheduleAction(action),
        appliances: {},
    };
}

export function buildInverterOnlyScheduleSlot(
    patch: HelmanSchedulePatch,
): ScheduleSlotDTO {
    return {
        id: patch.id,
        domains: buildInverterOnlyScheduleDomains(patch.action),
    };
}

export function cloneScheduleSlotDTO(slot: ScheduleSlotDTO): ScheduleSlotDTO {
    return {
        id: slot.id,
        domains: {
            inverter: cloneHelmanScheduleAction(slot.domains.inverter),
            appliances: { ...slot.domains.appliances },
        },
    };
}
