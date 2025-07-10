
export class DeviceNode {
    constructor(name: string, powerSensorId: string | null, switchEntityId: string | null, historyBuckets: number) {
        this.name = name;
        this.powerSensorId = powerSensorId;
        this.switchEntityId = switchEntityId;
        this.children = [];
        this.childrenHidden = true;
        this.historyBuckets = historyBuckets;
        this.powerHistory = [];
    }

    public updateHistoryBuckets() {
        if (this.powerHistory.length > 0) {
            this.powerHistory.push(this.powerHistory[this.powerHistory.length - 1]); // Push the last value or liveAvg if history is empty
        }
        if (this.powerHistory.length > this.historyBuckets) { // Keep history items based on config
            this.powerHistory.shift();
        }
        this.livePowerValuesSum = 0; // Reset the live power values after updating history
        this.livePowerValuesCnt = 0; // Reset the count of live power values after updating history

        for (const child of this.children) {
            child.updateHistoryBuckets();
        }
    }

    public updateLivePower(power: number) {
        this.livePowerValuesSum += power;
        this.livePowerValuesCnt++;
        if (this.powerHistory.length === 0) {
            this.powerHistory.push(0); // Initialize with zero if empty
        }
        this.powerHistory[this.powerHistory.length - 1] = this.livePowerValuesSum > 0 ? (this.livePowerValuesSum / this.livePowerValuesCnt) : 0; // Update the last history entry with the new average
        this.powerValue = power;

        if (this.children.length > 0) {
            const unmeasuredPower = this.powerValue - this.children.filter(child => !child.isUnmeasured).reduce((sum, child) => {
                return sum + (child.isUnmeasured ? 0 : child.powerValue || 0);
            }, 0);
            const unmeasuredNode = this.children.find(child => child.isUnmeasured);
            unmeasuredNode?.updateLivePower(unmeasuredPower);
        }
    }
    private livePowerValuesSum: number = 0;
    private livePowerValuesCnt: number = 0;

    public name: string;
    public powerSensorId: string | null;
    public switchEntityId: string | null;
    public children: DeviceNode[];
    public powerValue?: number;
    public childrenHidden?: boolean;
    //powerHistory?: number[];
    public powerHistory: number[] = [];
    public historyBuckets: number;
    public isUnmeasured: boolean = false; // Indicates if this node represents unmeasured power
}
