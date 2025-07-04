import type { HomeAssistant } from "../hass-frontend/src/types";

export interface DeviceNode {
    name: string;
    powerSensorId: string | null;
    switchEntityId: string | null;
    children: DeviceNode[];
    powerValue?: number;
    childrenHidden?: boolean;
}

interface EnergyPrefs {
    energy_sources: unknown[];
    device_consumption: DeviceConsumption[];
}

interface DeviceConsumption {
    stat_consumption: string;
    included_in_stat?: string;
}

interface EntityRegistryEntry {
    entity_id: string;
    device_id: string | null;
    labels: string[];
}

interface DeviceRegistryEntry {
    id: string;
    name: string;
}

interface LabelRegistryEntry {
    label_id: string;
    name: string;
}

function cleanDeviceName(name: string, cleanerRegex?: string): string {
    if (!cleanerRegex) return name;
    
    try {
        const regex = new RegExp(cleanerRegex, 'g');
        return name.replace(regex, '').trim();
    } catch (error) {
        console.warn('Invalid regex pattern for power_sensor_name_cleaner_regex:', cleanerRegex);
        return name;
    }
}

export async function fetchDeviceTree(hass: HomeAssistant, housePowerEntityId?: string, powerSensorLabel?: string, powerSwitchLabel?: string, powerSensorNameCleanerRegex?: string): Promise<DeviceNode[]> {
    const [energyPrefs, entityRegistry, deviceRegistry, labelRegistry] = await Promise.all([
        hass.connection.sendMessagePromise<EnergyPrefs>(
            { type: "energy/get_prefs" }
        ),
        hass.connection.sendMessagePromise<EntityRegistryEntry[]>(
            { type: "config/entity_registry/list" }
        ),
        hass.connection.sendMessagePromise<DeviceRegistryEntry[]>(
            { type: "config/device_registry/list" }
        ),
        hass.connection.sendMessagePromise<LabelRegistryEntry[]>(
            { type: "config/label_registry/list" }
        ),
    ]);

    const deviceMap = new Map<string, DeviceNode>();

    // Create all nodes and put them in a map
    for (const source of energyPrefs.device_consumption) {
        const energyEntity = entityRegistry.find(e => e.entity_id === source.stat_consumption);
        let powerSensorId: string | null = null;
        let switchEntityId: string | null = null;

        if (energyEntity && energyEntity.device_id) {
            const device = deviceRegistry.find(d => d.id === energyEntity.device_id);
            if (!device) continue;

            const deviceEntities = entityRegistry.filter(e => e.device_id === energyEntity.device_id);
            const powerEntities = deviceEntities.filter(e => {
                const state = hass.states[e.entity_id];
                return state && state.attributes.device_class === 'power';
            });

            let powerEntity: EntityRegistryEntry | undefined;

            if (powerEntities.length > 1 && powerSensorLabel) {
                const targetLabel = labelRegistry.find(l => l.name === powerSensorLabel);
                if (targetLabel) {
                    powerEntity = powerEntities.find(e => e.labels.includes(targetLabel.label_id));
                }
            }

            if (!powerEntity && powerEntities.length > 0) {
                powerEntity = powerEntities[0];
            }

            if (powerEntity) {
                powerSensorId = powerEntity.entity_id;
            }

            const switchEntities = deviceEntities.filter(e => e.entity_id.startsWith('switch.'));
            let switchEntity: EntityRegistryEntry | undefined;

            if (switchEntities.length > 0 && powerSwitchLabel) {
                const targetLabel = labelRegistry.find(l => l.name === powerSwitchLabel);
                if (targetLabel) {
                    switchEntity = switchEntities.find(e => e.labels.includes(targetLabel.label_id));
                }
            }

            if (!switchEntity && switchEntities.length > 0) {
                switchEntity = switchEntities.find(e => {
                    const state = hass.states[e.entity_id];
                    return state && state.attributes.friendly_name === device.name;
                });
            }

            if (switchEntity) {
                switchEntityId = switchEntity.entity_id;
            }
        }
        
        if (!powerSensorId) {
            console.warn(`Could not find a power sensor for "${source.stat_consumption}". This device will be skipped.`);
            continue;
        }

        const name = hass.states[powerSensorId]?.attributes.friendly_name || powerSensorId;
        const cleanedName = cleanDeviceName(name, powerSensorNameCleanerRegex);

        deviceMap.set(source.stat_consumption, {
            name: cleanedName,
            powerSensorId: powerSensorId,
            switchEntityId: switchEntityId,
            children: []
        });
    }

    const tree: DeviceNode[] = [];
    for (const source of energyPrefs.device_consumption) {
        const deviceNode = deviceMap.get(source.stat_consumption);
        if (!deviceNode) {
            continue;
        }

        if (source.included_in_stat && deviceMap.has(source.included_in_stat)) {
            const parent = deviceMap.get(source.included_in_stat)!;
            parent.children.push(deviceNode);
        } else {
            tree.push(deviceNode);
        }
    }

    if (housePowerEntityId) {
        const housePowerSensorName = hass.states[housePowerEntityId]?.attributes.friendly_name || housePowerEntityId;
        const cleanedHousePowerSensorName = cleanDeviceName(housePowerSensorName, powerSensorNameCleanerRegex);
        const houseNode: DeviceNode = {
            name: cleanedHousePowerSensorName,
            powerSensorId: housePowerEntityId,
            switchEntityId: null,
            childrenHidden: false,
            children: tree
        };
        return [houseNode];
    }

    return tree;
}

export function getPower(device: DeviceNode, hass: HomeAssistant): number {
    try {
        if (device.powerValue !== undefined) {
            return device.powerValue;
        }
        if (device.powerSensorId) {
            return parseFloat(hass.states[device.powerSensorId]?.state) || 0;
        }
        return 0;
    } catch {
        return 0;
    }
}

export function sortDevicesByPowerAndName(devices: DeviceNode[], hass: HomeAssistant): DeviceNode[] {
    return [...devices].sort((a, b) => {
        const powerA = getPower(a, hass);
        const powerB = getPower(b, hass);
        
        // First sort by power (descending)
        if (powerB !== powerA) {
            return powerB - powerA;
        }
        
        // If power is the same, sort alphabetically by name (ascending)
        return a.name.localeCompare(b.name);
    });
}
