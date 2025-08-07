import type { HomeAssistant } from "../hass-frontend/src/types";
import { DeviceNode } from "./DeviceNode";
import { HelmanCardConfig } from "./HelmanCardConfig";
import { HouseDeviceConfig } from "./DeviceConfig";

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

export async function fetchSourceAndConsumerRoots(hass: HomeAssistant, config: HelmanCardConfig): Promise<DeviceNode[]> {
    const {
        power_devices: { house, grid, battery, solar },
        history_buckets,
        power_sensor_name_cleaner_regex,
        sources_title,
        consumers_title,
        device_label_text
    } = config;

    const roots: DeviceNode[] = [];

    // --- SOURCES ---
    const sourcesNode = new DeviceNode("sources", sources_title ?? "Energy Sources", null, null, history_buckets);
    sourcesNode.isVirtual = true;
    sourcesNode.childrenCollapsed = false;
    sourcesNode.icon = 'mdi:lightning-bolt-outline';

    if (solar?.entities.power) {
        const name = ""//solar.source_name ?? (hass.states[solar.entity_id]?.attributes.friendly_name || "Solar");
        const solarNode = new DeviceNode(solar.entities.power, name, solar.entities.power, null, history_buckets, solar);
        solarNode.compact = true;
        solarNode.color = '#FDD83560'; // Light yellow
        solarNode.isSource = true;
        solarNode.icon = 'mdi:solar-power';
        solarNode.show_additional_info = true;
        sourcesNode.children.push(solarNode);
    }
    if (battery?.entities.power) {
        const name = ""//battery.source_name ?? (hass.states[battery.entity_id]?.attributes.friendly_name || "Battery");
        const batterySource = new DeviceNode(battery.entities.power, name, battery.entities.power, null, history_buckets, battery);
        batterySource.compact = true;
        batterySource.valueType = 'negative';
        batterySource.color = '#66BB6A60'; // Light green
        batterySource.isSource = true;
        batterySource.icon = 'mdi:battery';
        batterySource.show_additional_info = true;
        sourcesNode.children.push(batterySource);
    }
    if (grid?.entities.power) {
        const name = ""//grid.source_name ?? (hass.states[grid.entity_id]?.attributes.friendly_name || "Grid");
        const gridSource = new DeviceNode(grid.entities.power, name, grid.entities.power, null, history_buckets, grid);
        gridSource.compact = true;
        gridSource.valueType = 'negative';
        gridSource.color = '#42A5F560'; // Light blue
        gridSource.isSource = true;
        gridSource.icon = 'mdi:transmission-tower-export';
        gridSource.show_additional_info = true;
        sourcesNode.children.push(gridSource);
    }

    if (sourcesNode.children.length > 0) {
        roots.push(sourcesNode);
    }

    // --- CONSUMERS ---
    const consumersNode = new DeviceNode("consumers", consumers_title ?? "Energy Consumers", null, null, history_buckets);
    consumersNode.isVirtual = true;
    consumersNode.hideChildren = true;
    consumersNode.hideChildrenIndicator = true;
    consumersNode.icon = 'mdi:lightning-bolt-outline';

    if (house?.entities.power) {
        const houseTree = await fetchDeviceTree(
            hass,
            history_buckets,
            house.unmeasured_power_title,
            house.entities.power,
            house.power_sensor_label,
            house.power_switch_label,
            power_sensor_name_cleaner_regex,
            house.consumption_name,
            house,
            device_label_text
        );
        consumersNode.children.push(...houseTree);
    }
    if (battery?.entities.power) {
        const name = ""// battery.consumption_name ?? (hass.states[battery.entity_id]?.attributes.friendly_name || "Battery");
        const batteryConsumer = new DeviceNode(battery.entities.power, name, battery.entities.power, null, history_buckets, battery);
        batteryConsumer.compact = true;
        batteryConsumer.valueType = 'positive';
        batteryConsumer.color = '#66BB6A60'; // Light green
        batteryConsumer.icon = 'mdi:battery';
        batteryConsumer.show_additional_info = true;
        consumersNode.children.push(batteryConsumer);
    }
    if (grid?.entities.power) {
        const name = ""//grid.consumption_name ?? (hass.states[grid.entity_id]?.attributes.friendly_name || "Grid");
        const gridConsumer = new DeviceNode(grid.entities.power, name, grid.entities.power, null, history_buckets, grid);
        gridConsumer.compact = true;
        gridConsumer.valueType = 'positive';
        gridConsumer.color = '#42A5F560'; // Light blue
        gridConsumer.icon = 'mdi:transmission-tower-import';
        gridConsumer.show_additional_info = true;
        consumersNode.children.push(gridConsumer);
    }


    if (consumersNode.children.length > 0) {
        roots.push(consumersNode);
    }

    return roots;
}

async function fetchDeviceTree(hass: HomeAssistant, historyBuckets: number, unmeasuredPowerTitle?: string, housePowerEntityId?: string, powerSensorLabel?: string, powerSwitchLabel?: string, powerSensorNameCleanerRegex?: string, houseName?: string, houseConfig?: HouseDeviceConfig, deviceLabelText?: Record<string, string>): Promise<DeviceNode[]> {
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

        const node = new DeviceNode(cleanedName, cleanedName, powerSensorId, switchEntityId, historyBuckets);
        node.children_full_width = true;
        
        const powerSensorState = hass.states[powerSensorId];
        if (powerSensorState?.attributes.icon) {
            node.icon = powerSensorState.attributes.icon;
        }

        // Match device labels with user configuration and collect custom texts
        if (deviceLabelText && energyEntity && energyEntity.device_id) {
            const deviceEntities = entityRegistry.filter(e => e.device_id === energyEntity.device_id);
            const deviceLabels = new Set<string>();
            
            // Collect all labels from all entities of this device
            for (const entity of deviceEntities) {
                for (const labelId of entity.labels) {
                    const label = labelRegistry.find(l => l.label_id === labelId);
                    if (label) {
                        deviceLabels.add(label.name);
                    }
                }
            }
            
            // Find matching custom texts
            const customTexts: string[] = [];
            for (const labelName of deviceLabels) {
                if (deviceLabelText[labelName]) {
                    customTexts.push(deviceLabelText[labelName]);
                }
            }
            
            if (customTexts.length > 0) {
                node.customLabelTexts = customTexts;
            }
        }

        deviceMap.set(source.stat_consumption, node);
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
        const housePowerSensorName = "" //houseName ?? (hass.states[housePowerEntityId]?.attributes.friendly_name || housePowerEntityId);
        const cleanedHousePowerSensorName = cleanDeviceName(housePowerSensorName, powerSensorNameCleanerRegex);
        const houseNode = new DeviceNode("house", cleanedHousePowerSensorName, housePowerEntityId, null, historyBuckets, houseConfig);
        houseNode.compact = true;
        houseNode.color = '#FFAB9160'; // Light pastel red
        houseNode.hideChildren = true; // Hide children by default
        houseNode.hideChildrenIndicator = true; // Hide the indicator for children
        houseNode.children = tree;
        houseNode.sortChildrenByPower = true; // Sort children by power
        houseNode.icon = 'mdi:home';
        houseNode.show_additional_info = true;
        houseNode.children_full_width = true;
        //houseNode.childrenHidden = false;
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
        const unmeasuredNode = new DeviceNode("unmeasured", unmeasuredPowerTitle ?? 'Unmeasured power', null, null, historyBuckets);
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
    const sourceNodes: DeviceNode[] = [];

    function collectNodes(nodes: DeviceNode[]) {
        for (const node of nodes) {
            if (node.powerSensorId) {
                if (!nodesWithSensors.has(node.powerSensorId)) {
                    nodesWithSensors.set(node.powerSensorId, []);
                }
                nodesWithSensors.get(node.powerSensorId)!.push(node);
            }
            allNodes.push(node);
            if (node.isSource) {
                sourceNodes.push(node);
            }
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
                let processedHistory = [...averagedHistory];
                if (node.valueType === 'positive') {
                    processedHistory = processedHistory.map(v => Math.max(0, v));
                } else if (node.valueType === 'negative') {
                    processedHistory = processedHistory.map(v => Math.abs(Math.min(0, v)));
                }
                node.powerHistory = processedHistory;
            });
        }
    }

    // Calculate powerHistory for virtual nodes by summing up children
    function calculateVirtualNodeHistory(node: DeviceNode) {
        if (node.isVirtual) {
            const childWithHistory = node.children.find(c => c.powerHistory && c.powerHistory.length > 0);
            if (childWithHistory) {
                const historyLength = childWithHistory.powerHistory.length;
                node.powerHistory = Array(historyLength).fill(0);
                for (let i = 0; i < historyLength; i++) {
                    for (const child of node.children) {
                        // First, ensure children have their history calculated if they are also virtual
                        calculateVirtualNodeHistory(child);
                        node.powerHistory[i] += (child.powerHistory && child.powerHistory[i]) || 0;
                    }
                }
            }
        } else {
            for (const child of node.children) {
                calculateVirtualNodeHistory(child);
            }
        }
    }
    for (const root of deviceTree) {
        calculateVirtualNodeHistory(root);
    }

    // Calculate source ratios for each bucket
    const totalSourcePowerByBucket: number[] = Array(historyIntervals).fill(0);
    for (let i = 0; i < historyIntervals; i++) {
        for (const sourceNode of sourceNodes) {
            totalSourcePowerByBucket[i] += sourceNode.powerHistory[i] || 0;
        }
    }

    // Assign source power history to all non-source nodes
    for (const node of allNodes) {
        if (node.isSource) {
            continue; // Skip individual source nodes
        }
        node.sourcePowerHistory = [];
        for (let i = 0; i < historyIntervals; i++) {
            const bucketSourcePower: { [sourceName: string]: { power: number; color: string } } = {};
            const totalSourcePower = totalSourcePowerByBucket[i];
            const nodePower = node.powerHistory[i] || 0;

            if (totalSourcePower > 0 && nodePower > 0) {
                for (const sourceNode of sourceNodes) {
                    const sourcePower = sourceNode.powerHistory[i] || 0;
                    const ratio = sourcePower / totalSourcePower;
                    bucketSourcePower[sourceNode.id] = {
                        power: nodePower * ratio,
                        color: sourceNode.color || 'grey'
                    };
                }
            }
            node.sourcePowerHistory.push(bucketSourcePower);
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
    const childrenSourcePowerHistorySum: { [sourceName: string]: number }[] = Array(parentNode.powerHistory.length).fill(0).map(() => ({}));

    const childrenWithoutUnmeasured = parentNode.children.filter(child => !child.isUnmeasured);
    for (let childIdx = 0; childIdx < childrenWithoutUnmeasured.length; childIdx++) {
        const child = childrenWithoutUnmeasured[childIdx];

        for (let bucketIdx = 0; bucketIdx < parentNode.powerHistory.length; bucketIdx++) {
            childrenPowerHistorySum[bucketIdx] += child.powerHistory[bucketIdx] || 0;
            if (child.sourcePowerHistory && child.sourcePowerHistory[bucketIdx]) {
                for (const sourceName in child.sourcePowerHistory[bucketIdx]) {
                    if (!childrenSourcePowerHistorySum[bucketIdx][sourceName]) {
                        childrenSourcePowerHistorySum[bucketIdx][sourceName] = 0;
                    }
                    childrenSourcePowerHistorySum[bucketIdx][sourceName] += child.sourcePowerHistory[bucketIdx][sourceName].power;
                }
            }
        }
        enrichUnmeasuredDeviceTreeWithHistory(child);
    }

    unmeasuredNode.powerHistory = parentNode.powerHistory.map((parentPower, i) => {
        return Math.max(0, parentPower - (childrenPowerHistorySum[i] || 0));
    });

    unmeasuredNode.sourcePowerHistory = [];
    for (let i = 0; i < parentNode.powerHistory.length; i++) {
        const bucketSourcePower: { [sourceName: string]: { power: number; color: string } } = {};
        const parentSources = parentNode.sourcePowerHistory?.[i] || {};
        const childrenSources = childrenSourcePowerHistorySum[i] || {};

        for (const sourceName in parentSources) {
            const parentPower = parentSources[sourceName].power;
            const childrenPower = childrenSources[sourceName] || 0;
            const unmeasuredPower = Math.max(0, parentPower - childrenPower);
            if (unmeasuredPower > 0) {
                bucketSourcePower[sourceName] = {
                    power: unmeasuredPower,
                    color: parentSources[sourceName].color
                };
            }
        }
        unmeasuredNode.sourcePowerHistory.push(bucketSourcePower);
    }
}


export function sortDevicesByPowerAndName(devices: DeviceNode[]): DeviceNode[] {
    return [...devices].sort((a, b) => {
        const powerA = a.powerHistory.reduce((acc, val) => acc + val, 0);
        const powerB = b.powerHistory.reduce((acc, val) => acc + val, 0);

        // First sort by power (descending)
        if (powerB !== powerA) {
            return powerB - powerA;
        }

        // If power is the same, sort alphabetically by name (ascending)
        return a.name.localeCompare(b.name);
    });
}
