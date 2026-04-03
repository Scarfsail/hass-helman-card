import type { LocalizeFunction } from "../../localize/localize";
import type { ScheduleApplianceMetadata } from "./schedule-appliance-metadata";
import type { ScheduleApplianceAction } from "../schedule-types";

type ScheduleApplianceActionTone = "neutral" | "charge" | "stop";
type ScheduleApplianceActionToneClass = `action-tone-${ScheduleApplianceActionTone}`;

export interface ScheduleApplianceActionPresentation {
    icon: string;
    label: string;
    toneClass: ScheduleApplianceActionToneClass;
}

export function getScheduleApplianceActionPresentation({
    appliance,
    action,
    localize,
}: {
    appliance: Pick<ScheduleApplianceMetadata, "kind">;
    action: ScheduleApplianceAction;
    localize: LocalizeFunction;
}): ScheduleApplianceActionPresentation {
    if (appliance.kind === "ev_charger") {
        return _getEvChargerActionPresentation(appliance, action, localize);
    }

    return {
        icon: "mdi:flash",
        label: localize("scheduling.appliance.action.generic"),
        toneClass: "action-tone-neutral",
    };
}

function _getEvChargerActionPresentation(
    appliance: Pick<ScheduleApplianceMetadata, "kind">,
    action: ScheduleApplianceAction,
    localize: LocalizeFunction,
): ScheduleApplianceActionPresentation {
    const modeLabel = _buildEvModeLabel(appliance, action, localize);
    return {
        icon: "mdi:car-electric",
        label: action.charge ? modeLabel : localize("scheduling.appliance.ev.action.no_charge"),
        toneClass: action.charge ? "action-tone-charge" : "action-tone-stop",
    };
}

function _buildEvModeLabel(
    _appliance: Pick<ScheduleApplianceMetadata, "kind">,
    action: ScheduleApplianceAction,
    localize: LocalizeFunction,
): string {
    if (!action.charge) {
        return localize("scheduling.appliance.ev.action.no_charge");
    }

    const useMode = action.useMode ?? "Fast";
    if (useMode === "ECO") {
        const ecoLabel = localize("scheduling.appliance.ev.mode.eco");
        return action.ecoGear ? `${ecoLabel} ${action.ecoGear}` : ecoLabel;
    }

    return localize("scheduling.appliance.ev.mode.fast");
}
