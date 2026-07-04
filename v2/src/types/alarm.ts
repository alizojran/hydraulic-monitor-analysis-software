export type AlarmSeverity = 'high' | 'warn' | 'low' | 'info'

export type AlarmMetric = 'value' | 'rms' | 'peak'

export type AlarmOperator = '>' | '<' | '>=' | '<='

export type AlarmStatus = 'active' | 'acknowledged' | 'resolved'

export interface AlarmRule {
  id: string
  channelId: string
  metric: AlarmMetric
  operator: AlarmOperator
  threshold: number
  severity: AlarmSeverity
  enabled: boolean
  label: string
}

export interface AlarmEvent {
  id: string
  ruleId: string
  channelId: string
  timestamp: number
  value: number
  severity: AlarmSeverity
  description: string
  status: AlarmStatus
}
