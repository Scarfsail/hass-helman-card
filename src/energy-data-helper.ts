import type { HomeAssistant } from "../hass-frontend/src/types";
import { DeviceNode } from "./DeviceNode";

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

export async function fetchDeviceTree(hass: HomeAssistant, historyBuckets: number, unmeasuredPowerTitle?: string, housePowerEntityId?: string, powerSensorLabel?: string, powerSwitchLabel?: string, powerSensorNameCleanerRegex?: string): Promise<DeviceNode[]> {
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

        deviceMap.set(source.stat_consumption, new DeviceNode(cleanedName, powerSensorId, switchEntityId, historyBuckets));
    }

    let tree: DeviceNode[] = [];
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
        const houseNode = new DeviceNode(cleanedHousePowerSensorName, housePowerEntityId, null, historyBuckets);
        houseNode.children = tree;
        houseNode.childrenHidden = false;
        houseNode.children = tree;

        tree = [houseNode];
    }

    for (const node of tree) {
        inspectNodeAndAddUnmeasuredNodeToChildren(node, historyBuckets, unmeasuredPowerTitle);
    }

    return tree;
}

function inspectNodeAndAddUnmeasuredNodeToChildren(node: DeviceNode, historyBuckets: number, unmeasuredPowerTitle?: string): void {
    if (node.children.length > 0) {
        const unmeasuredNode = new DeviceNode(unmeasuredPowerTitle ?? 'Unmeasured power', null, null, historyBuckets);
        unmeasuredNode.isUnmeasured = true;
        node.children.push(unmeasuredNode);
        for (const child of node.children) {
            inspectNodeAndAddUnmeasuredNodeToChildren(child, historyBuckets, unmeasuredPowerTitle);
        }
    }
}


export async function enrichDeviceTreeWithHistory(deviceTree: DeviceNode[], hass: HomeAssistant, historyIntervals: number, bucketDuration: number): Promise<void> {
    const nodesWithSensors = new Map<string, DeviceNode[]>();
    const allNodes: DeviceNode[] = [];

    function collectNodes(nodes: DeviceNode[]) {
        for (const node of nodes) {
            if (node.powerSensorId) {
                if (!nodesWithSensors.has(node.powerSensorId)) {
                    nodesWithSensors.set(node.powerSensorId, []);
                }
                nodesWithSensors.get(node.powerSensorId)!.push(node);
            }
            allNodes.push(node);
            if (node.children.length > 0) {
                collectNodes(node.children);
            }
        }
    }

    collectNodes(deviceTree);

    allNodes.forEach(n => n.powerHistory = []);

    if (nodesWithSensors.size === 0) {
        return;
    }

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - historyIntervals * bucketDuration * 1000);

    const historyResult = await hass.connection.sendMessagePromise<{ [entityId: string]: { s: number; lu: number }[] }>({
        type: 'history/history_during_period',
        entity_ids: Array.from(nodesWithSensors.keys()),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        minimal_response: true,
        no_attributes: true,
    });

    for (const entityId in historyResult) {
        const history = historyResult[entityId];
        if (!history || history.length === 0) continue;

        const buckets = Array(historyIntervals).fill(0);
        const now = endTime.getTime();
        let historyIndex = 0;

        // The history is sorted oldest to newest.
        // We iterate through our time buckets from oldest to newest.
        for (let i = historyIntervals - 1; i >= 0; i--) {
            const bucketEndTime = now - i * bucketDuration * 1000;

            // Find the last state that occurred before or at the end of this bucket's time window
            while (historyIndex < history.length - 1 && new Date(history[historyIndex + 1].lu * 1000).getTime() <= bucketEndTime) {
                historyIndex++;
            }

            const state = history[historyIndex];
            const power = parseFloat(state.s as any);
            if (!isNaN(power)) {
                buckets[i] = power;
            }
        }

        const averagedHistory = buckets.reverse();

        const nodes = nodesWithSensors.get(entityId);
        if (nodes) {
            nodes.forEach(node => {
                node.powerHistory = [...averagedHistory];
            });
        }
    }
    for (const node of allNodes) {
        enrichUnmeasuredDeviceTreeWithHistory(node);
    }
}

function enrichUnmeasuredDeviceTreeWithHistory(parentNode: DeviceNode): void {
    if (parentNode.children.length == 0)
        return;

    const unmeasuredNode = parentNode.children.find(child => child.isUnmeasured);
    if (!unmeasuredNode) {
        return; // No unmeasured node found, nothing to do
    }

    const childrenPowerHistorySum: number[] = Array(parentNode.powerHistory.length).fill(0);
    //console.log(`*** Parent node power history (${parentNode.name}):`, parentNode.powerHistory)
    const childrenWithoutUnmeasured = parentNode.children.filter(child => !child.isUnmeasured);
    for (let childrenIdx = 0; childrenIdx < childrenWithoutUnmeasured.length; childrenIdx++) {
        const child = childrenWithoutUnmeasured[childrenIdx];
        //console.log(`Child node power history (${child.name}):`, child.powerHistory)

        for (let bucketIdx = 0; bucketIdx < parentNode.powerHistory.length; bucketIdx++) {
            childrenPowerHistorySum[bucketIdx] += child.powerHistory[bucketIdx] || 0;
        }
        enrichUnmeasuredDeviceTreeWithHistory(child);
    }

    unmeasuredNode.powerHistory = parentNode.powerHistory.map((parentPower, i) => {
        return parentPower - (childrenPowerHistorySum[i] || 0);
    });
    //console.log(`-- Children power history under parent (${parentNode.name}):`, childrenPowerHistorySum)
    //console.log(`-- Unmeasured power history under parent (${parentNode.name}):`, unmeasuredNode.powerHistory)

}


export function getPower(device: DeviceNode, hass: HomeAssistant): number {
    try {
        if (device.powerSensorId) {
            return parseFloat(hass.states[device.powerSensorId]?.state) || 0;
        }
        if (device.powerValue !== undefined) {
            return device.powerValue;
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
