import type { HomeAssistant } from "../hass-frontend/src/types";

export interface DeviceNode {
    name: string;
    powerSensorId: string | null;
    switchEntityId: string | null;
    children: DeviceNode[];
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
}

interface DeviceRegistryEntry {
    id: string;
    name: string;
}

export async function fetchDeviceTree(hass: HomeAssistant, housePowerEntityId?: string): Promise<DeviceNode[]> {
    const [energyPrefs, entityRegistry, deviceRegistry] = await Promise.all([
        hass.connection.sendMessagePromise<EnergyPrefs>(
            { type: "energy/get_prefs" }
        ),
        hass.connection.sendMessagePromise<EntityRegistryEntry[]>(
            { type: "config/entity_registry/list" }
        ),
        hass.connection.sendMessagePromise<DeviceRegistryEntry[]>(
            { type: "config/device_registry/list" }
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
            const powerEntity = deviceEntities.find(e => {
                const state = hass.states[e.entity_id];
                return state && state.attributes.device_class === 'power';
            });
            if (powerEntity) {
                powerSensorId = powerEntity.entity_id;
            }

            const switchEntity = deviceEntities.find(e => {
                if (!e.entity_id.startsWith('switch.')) return false;
                const state = hass.states[e.entity_id];
                return state && state.attributes.friendly_name === device.name;
            });

            if (switchEntity) {
                switchEntityId = switchEntity.entity_id;
            }
        }
        
        if (!powerSensorId) {
            console.warn(`Could not find a power sensor for "${source.stat_consumption}". This device will be skipped.`);
            continue;
        }

        const name = hass.states[powerSensorId]?.attributes.friendly_name || powerSensorId;

        deviceMap.set(source.stat_consumption, {
            name: name,
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
        const houseNode: DeviceNode = {
            name: hass.states[housePowerEntityId]?.attributes.friendly_name || housePowerEntityId,
            powerSensorId: housePowerEntityId,
            switchEntityId: null,
            children: tree
        };
        return [houseNode];
    }

    return tree;
}
