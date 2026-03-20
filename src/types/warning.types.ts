export enum WarningType {
  DataShortage = 'data_shortage',
  LaborOverflow = 'labor_overflow',
  DeliveryDelay = 'delivery_delay',
  CostOverrun = 'cost_overrun',
  ZeroDelivery = 'zero_delivery',
}

export enum WarningSeverity {
  Medium = 'medium',
  High = 'high',
}

export interface Warning {
  type: WarningType;
  role: string;       // roleType or 'overall'
  day: number;        // 1-indexed working day
  currentValue: number;
  threshold: number;
  severity: WarningSeverity;
  message: string;
}
