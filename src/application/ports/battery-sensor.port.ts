/** Battery percent + AC/battery events. */
export interface BatterySensorPort {
  getPercent(): Promise<number | null>;
  onPowerSourceChange(handlers: {
    onBattery: () => void;
    onAc: () => void;
    onResume: () => void;
  }): () => void;
}
