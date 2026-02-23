import type { HomeAssistant } from "../hass-frontend/src/types";
import { DeviceNode } from "./DeviceNode";
import { HelmanCardConfig } from "./HelmanCardConfig";

interface DeviceNodeDTO {
    id: string;
    displayName: string;
    powerSensorId: string | null;
    switchEntityId: string | null;
    isSource: boolean;
    isUnmeasured: boolean;
    valueType: 'default' | 'positive' | 'negative';
    labels: string[];
    labelBadgeTexts: string[];
    sourceConfig: any | null;
    color: string | null;
    icon: string | null;
    compact: boolean;
    showAdditionalInfo: boolean;
    childrenFullWidth: boolean;
    hideChildren: boolean;
    hideChildrenIndicator: boolean;
    sortChildrenByPower: boolean;
    children: DeviceNodeDTO[];
}

function hydrateNode(dto: DeviceNodeDTO, historyBuckets: number): DeviceNode {
    const node = new DeviceNode(dto.id, dto.displayName, dto.powerSensorId, dto.switchEntityId, historyBuckets, dto.sourceConfig ?? undefined);
    node.isSource = dto.isSource;
    node.isUnmeasured = dto.isUnmeasured;
    node.valueType = dto.valueType;
    node.labels = dto.labels;
    if (dto.labelBadgeTexts.length > 0) node.customLabelTexts = dto.labelBadgeTexts;
    if (dto.color) node.color = dto.color;
    if (dto.icon) node.icon = dto.icon;
    node.compact = dto.compact;
    node.show_additional_info = dto.showAdditionalInfo;
    node.children_full_width = dto.childrenFullWidth;
    node.hideChildren = dto.hideChildren;
    node.hideChildrenIndicator = dto.hideChildrenIndicator;
    node.sortChildrenByPower = dto.sortChildrenByPower;
    node.children = dto.children.map(child => hydrateNode(child, historyBuckets));
    return node;
}

function hydrateDeviceNodes(sourceDTOs: DeviceNodeDTO[], consumerDTOs: DeviceNodeDTO[], config: HelmanCardConfig, totalPowerSensorId: string | null = null): DeviceNode[] {
    const historyBuckets = config.history_buckets;
    const roots: DeviceNode[] = [];

    if (sourceDTOs.length > 0) {
        const sourcesNode = new DeviceNode("sources", config.sources_title ?? "Energy Sources", null, null, historyBuckets);
        sourcesNode.childrenCollapsed = false;
        sourcesNode.icon = 'mdi:lightning-bolt-outline';
        sourcesNode.powerSensorId = totalPowerSensorId;
        sourcesNode.children = sourceDTOs.map(dto => hydrateNode(dto, historyBuckets));
        roots.push(sourcesNode);
    }

    if (consumerDTOs.length > 0) {
        const consumersNode = new DeviceNode("consumers", config.consumers_title ?? "Energy Consumers", null, null, historyBuckets);
        consumersNode.hideChildren = true;
        consumersNode.hideChildrenIndicator = true;
        consumersNode.icon = 'mdi:lightning-bolt-outline';
        consumersNode.powerSensorId = totalPowerSensorId;
        consumersNode.children = consumerDTOs.map(dto => hydrateNode(dto, historyBuckets));
        roots.push(consumersNode);
    }

    return roots;
}

async function fetchDeviceTreeFromBackend(hass: HomeAssistant, config: HelmanCardConfig): Promise<DeviceNode[]> {
    const payload = await hass.connection.sendMessagePromise<{ sources: DeviceNodeDTO[]; consumers: DeviceNodeDTO[]; totalPowerSensorId: string | null }>({
        type: "helman/get_device_tree",
    });
    return hydrateDeviceNodes(payload.sources, payload.consumers, config, payload.totalPowerSensorId);
}

export async function fetchSourceAndConsumerRoots(hass: HomeAssistant, config: HelmanCardConfig): Promise<DeviceNode[]> {
    return fetchDeviceTreeFromBackend(hass, config);
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

    if (nodesWithSensors.size === 0) {
        return;
    }

    // Backend mode: fetch pre-bucketed history from helman backend
    const history = await hass.connection.sendMessagePromise<{
            buckets: number;
            bucket_duration: number;
            entity_history: { [entityId: string]: number[] };
            source_ratios: { [entityId: string]: { [sourceEntityId: string]: number[] } };
        }>({
            type: 'helman/get_history',
        });

        const { entity_history, source_ratios } = history;
        const bucketCount = history.buckets;

        // Assign powerHistory with valueType clamping.
        // Also update node.historyBuckets to match the backend-authoritative bucket count
        // so that updateHistoryBuckets' shift-guard uses the correct ceiling.
        for (const [entityId, nodes] of nodesWithSensors) {
            const rawHistory = entity_history[entityId];
            if (!rawHistory) continue;
            for (const node of nodes) {
                let processedHistory = [...rawHistory];
                if (node.valueType === 'positive') {
                    processedHistory = processedHistory.map(v => Math.max(0, v));
                } else if (node.valueType === 'negative') {
                    processedHistory = processedHistory.map(v => Math.abs(Math.min(0, v)));
                }
                node.powerHistory = processedHistory;
                node.historyBuckets = bucketCount;
            }
        }

        // Build sourcePowerHistory from pre-computed backend source_ratios.
        // source_ratios outer key = node.powerSensorId (power entity id).
        // source_ratios inner key = source's powerSensorId (= source's .id, since
        // tree_builder sets source node id == powerSensorId == entity_id).
        // Output key is sourceNode.id (== sourceNode.powerSensorId for sources),
        // matching the live-update key used in DeviceNode.updateLivePower.
        //
        // Assign sourcePowerHistory from pre-computed backend source_ratios.
        // The backend now covers all real sensor nodes including dual-role battery/grid
        // consumer nodes (same entity_id as their source counterpart, but bucketed with
        // positive clamping on the consumer side).
        for (const node of allNodes) {
            if (node.isSource || !node.powerSensorId) continue;
            const nodeRatios = source_ratios[node.powerSensorId];
            if (!nodeRatios) continue;
            node.sourcePowerHistory = [];
            for (let i = 0; i < bucketCount; i++) {
                const bucketSourcePower: { [sourceName: string]: { power: number; color: string } } = {};
                for (const sourceNode of sourceNodes) {
                    if (!sourceNode.powerSensorId) continue;
                    const sourcePowerValues = nodeRatios[sourceNode.powerSensorId];
                    if (sourcePowerValues) {
                        const power = sourcePowerValues[i] ?? 0;
                        if (power > 0) {
                            bucketSourcePower[sourceNode.id] = {
                                power,
                                color: sourceNode.color || 'grey',
                            };
                        }
                    }
                }
                node.sourcePowerHistory.push(bucketSourcePower);
            }
        }


    return;
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
