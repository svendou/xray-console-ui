export interface Service {
  id: string; name: string; description: string; state: 'running' | 'stopped' | 'missing' | 'disabled' | 'unknown'; version: string; port: string
  protection?: { state: 'enabled' | 'installed' | 'missing'; label: string; detail: string }
}
export interface ServiceUpdate {
  current: string; latest: string | null; available: boolean; source: string
}
export interface ServiceUpdateResult {
  checkedAt: string; services: Record<string, ServiceUpdate>
}
export interface Job {
  id: string; action: string; label: string; state: 'running' | 'succeeded' | 'failed' | 'interrupted'; startedAt: string; finishedAt?: string; logs: string[]; exitCode?: number
}
export interface Settings {
  server: string; reality_port: number; public_port: number; hy2_port: number; hy2_public_port: number;
  subscription_port: number; subscription_public_port: number; output_dir: string; cf_entry: string; hy2_enabled: boolean; tunnel_protocol: string
}
export interface Snapshot {
  demo: boolean; installed: boolean; updatedAt: string; hostname: string; platform: string;
  publicAddress: string;
  uptime: number; cpu: number; memory: number; totalMemory: number; cores: number;
  settings: Settings; services: Service[]; jobs: Job[];
  history: { time: string; cpu: number; memory: number }[]
  traffic: Traffic; nodeStats: NodeStat[]; kernel: KernelInfo
}
export interface Traffic {
  interface: string; source: 'host-interface' | 'demo'; measuredAt: string;
  todayRx: number; todayTx: number; totalRx: number; totalTx: number; quotaBytes: number; downRate: number; upRate: number; peakDown: number; peakUp: number;
  history: { time: string; down: number; up: number }[]
}
export interface NodeStat {
  id: string; name: string; protocol: string; endpoint: string; state: Service['state'];
  latencyMs: number | null; downloadMbps: number | null; uploadMbps: number | null; measuredAt: string | null;
  source: string; note?: string; trafficDown: number | null; trafficUp: number | null; trafficMeasured: boolean
}
export interface ServerLatency {
  samples: number[]; average: number | null; min: number | null; max: number | null; failed: number; measuredAt: string
}
export interface KernelInfo {
  current: string; allowed: string[]; qdisc: string; bbr: boolean; qdiscSupported?: boolean; bbrV3Supported?: boolean; bbrV3Installed?: boolean; bbrV3StandardInstalled?: boolean; bbrV3MaxInstalled?: boolean; bbrV3Profile?: string | null; bbrV3Active?: boolean; bbrV3ActiveProfile?: string | null; smartOptimization?: boolean; smartOptimizationConfigured?: boolean; apacTuning?: boolean; apacTuningConfigured?: boolean; crazyMode?: boolean; crazyModeConfigured?: boolean; ipv6Disabled?: boolean; distro?: string; source: string
}
export type CarrierId = 'mobile' | 'unicom' | 'telecom'
export interface CarrierLatency {
  id: CarrierId; label: string; state: 'healthy' | 'failed' | 'unconfigured'; latencyMs: number | null;
  measuredAt: string | null; source: string
}
