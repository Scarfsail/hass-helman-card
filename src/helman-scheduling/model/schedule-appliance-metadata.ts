import type {
    ApplianceMetadataDTO,
    ApplianceScheduleCapabilitiesDTO,
    AppliancesPayload,
    ApplianceVehicleDTO,
    EvChargerApplianceMetadataDTO,
    EvChargerUseMode,
} from "../../helman-api";

export interface ScheduleVehicleOption {
    id: string;
    name: string;
}

export interface ScheduleApplianceMetadataBase {
    id: string;
    name: string;
    kind: string;
    order: number;
    supportsAuthoring: boolean;
}

export interface ScheduleEvChargerCapabilities {
    chargeToggle: boolean;
    useModes: EvChargerUseMode[];
    ecoGears: string[];
    requiresVehicleSelection: boolean;
}

export interface ScheduleEvChargerApplianceMetadata extends ScheduleApplianceMetadataBase {
    kind: "ev_charger";
    supportsAuthoring: true;
    maxChargingPowerKw: number;
    scheduleCapabilities: ScheduleEvChargerCapabilities;
    vehicles: ScheduleVehicleOption[];
}

export interface ScheduleUnknownApplianceMetadata extends ScheduleApplianceMetadataBase {
    supportsAuthoring: false;
}

export type ScheduleApplianceMetadata =
    | ScheduleEvChargerApplianceMetadata
    | ScheduleUnknownApplianceMetadata;

export function normalizeScheduleApplianceMetadata(
    payload: AppliancesPayload,
): ScheduleApplianceMetadata[] {
    return payload.appliances.flatMap((appliance, index) => {
        const normalized = _normalizeApplianceMetadata(appliance, index);
        return normalized === null ? [] : [normalized];
    });
}

export function getScheduleApplianceById(
    appliances: readonly ScheduleApplianceMetadata[],
    applianceId: string,
): ScheduleApplianceMetadata | null {
    return appliances.find((appliance) => appliance.id === applianceId) ?? null;
}

function _normalizeApplianceMetadata(
    appliance: ApplianceMetadataDTO,
    order: number,
): ScheduleApplianceMetadata | null {
    if (!_isNonEmptyString(appliance.id) || !_isNonEmptyString(appliance.name) || !_isNonEmptyString(appliance.kind)) {
        return null;
    }

    if (appliance.kind === "ev_charger" && _isEvChargerApplianceMetadata(appliance)) {
        return {
            id: appliance.id,
            name: appliance.name,
            kind: appliance.kind,
            order,
            supportsAuthoring: true,
            maxChargingPowerKw: appliance.metadata.maxChargingPowerKw,
            scheduleCapabilities: _cloneScheduleCapabilities(appliance.metadata.scheduleCapabilities),
            vehicles: appliance.vehicles
                .filter((vehicle) => _isVehicleOption(vehicle))
                .map((vehicle) => ({ id: vehicle.id, name: vehicle.name })),
        };
    }

    return {
        id: appliance.id,
        name: appliance.name,
        kind: appliance.kind,
        order,
        supportsAuthoring: false,
    };
}

function _cloneScheduleCapabilities(
    capabilities: ApplianceScheduleCapabilitiesDTO,
): ScheduleEvChargerCapabilities {
    return {
        chargeToggle: capabilities.chargeToggle,
        useModes: [...capabilities.useModes],
        ecoGears: [...capabilities.ecoGears],
        requiresVehicleSelection: capabilities.requiresVehicleSelection,
    };
}

function _isEvChargerApplianceMetadata(
    appliance: ApplianceMetadataDTO,
): appliance is EvChargerApplianceMetadataDTO {
    return appliance.kind === "ev_charger"
        && typeof appliance.metadata?.maxChargingPowerKw === "number"
        && Array.isArray(appliance.metadata?.scheduleCapabilities?.useModes)
        && Array.isArray(appliance.metadata?.scheduleCapabilities?.ecoGears)
        && typeof appliance.metadata?.scheduleCapabilities?.chargeToggle === "boolean"
        && typeof appliance.metadata?.scheduleCapabilities?.requiresVehicleSelection === "boolean"
        && Array.isArray(appliance.vehicles);
}

function _isVehicleOption(vehicle: ApplianceVehicleDTO): boolean {
    return _isNonEmptyString(vehicle.id) && _isNonEmptyString(vehicle.name);
}

function _isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}
