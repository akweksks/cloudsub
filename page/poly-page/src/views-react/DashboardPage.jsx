import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, Server, ShieldAlert, Ticket, Users } from 'lucide-react';
import { dashboardApi, operationLogApi } from '@/lib/api.js';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Table } from '@/components/ui.jsx';
import { cn } from '@/lib/cn.js';
import { formatDate, formatShortDate, getData, PageHeader, RefreshButton, Section, StatGrid } from './common.jsx';

export function DashboardPage() {
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState({});

  async function load(options = {}) {
    setLoading(true);
    try {
      const overview = await dashboardApi.overview(options).catch(() => ({}));
      setDashboard(getData(overview));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function clearOperationLogs() {
    if (!window.confirm('确认清空最近后台操作记录？')) return;
    await operationLogApi.clear();
    await load();
  }

  const health = dashboard.health || {};
  const funnel = health.funnel || {};
  const stats = [
    { label: '可分发节点', value: dashboard.nodePool?.validCount ?? 0, tone: 'success' },
    { label: '过滤节点', value: dashboard.nodePool?.filteredCount ?? 0, tone: 'warning' },
    { label: '有效用户', value: dashboard.users?.active ?? 0 },
    { label: '即将到期', value: dashboard.users?.expiring_soon ?? 0, tone: 'warning' },
    { label: '今日访问', value: dashboard.accessLogs?.today ?? 0 },
    { label: '今日异常', value: dashboard.accessLogs?.today_abnormal ?? 0, tone: 'danger' },
    { label: '可用兑换码', value: dashboard.redeemCodes?.unused ?? 0 },
    { label: '已用兑换码', value: dashboard.redeemCodes?.used ?? 0 },
  ];

  const quickStarts = [
    { title: '接入上游机场', description: '添加订阅源并同步节点。', to: '/admin/airport', icon: Server },
    { title: '检查节点池', description: '确认最终可分发节点。', to: '/admin/node-pool', icon: CheckCircle2 },
    { title: '生成兑换码', description: '发给用户自助开通。', to: '/admin/redeem-codes', icon: Ticket },
    { title: '查看订阅用户', description: '处理到期、续期和禁用。', to: '/admin/sub-users', icon: Users },
  ];

  const alerts = dashboard.alerts || [];
  const recentOperations = dashboard.operationLogs || [];
  const scheduler = dashboard.scheduler || {};
  const nodePool = dashboard.nodePool || {};
  const changes = nodePool.changeSummary || {};

  return (
    <>
      <PageHeader title="运营工作台" description="按运营顺序组织后台：先看健康状态，再处理异常，最后分发兑换码和订阅。">
        <RefreshButton loading={loading} onClick={() => load({ force: true })} />
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <HealthPanel health={health} generatedAt={dashboard.generatedAt} />
        <NodeFunnel funnel={funnel} />
      </div>

      <StatGrid stats={stats} />

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Section title="常用操作" description="按照运营顺序放置最常用入口。">
          <div className="grid gap-3 sm:grid-cols-2">
            {quickStarts.map((item) => (
              <Link className="group rounded-lg border p-4 transition-colors hover:bg-accent" to={item.to} key={item.title}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-semibold">
                    <item.icon className="size-4 text-primary" />
                    {item.title}
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground group-hover:text-accent-foreground" />
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
              </Link>
            ))}
          </div>
        </Section>

        <Card>
          <CardHeader>
            <CardTitle>同步与节点池</CardTitle>
            <CardDescription>最近一次同步和节点池变化。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Info label="最近同步" value={formatDate(scheduler.ranAt)} />
            <Info label="同步间隔" value={`${scheduler.intervalHours || 6} 小时`} />
            <Info label="节点池更新" value={formatDate(nodePool.updatedAt)} />
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="新增" value={changes.addedCount ?? 0} />
              <MiniStat label="移除" value={changes.removedCount ?? 0} />
              <MiniStat label="保留" value={changes.unchangedCount ?? 0} />
            </div>
            <Button asChild variant="outline">
              <Link to="/admin/upstream-sync">
                <RefreshCw data-icon="inline-start" />
                查看同步任务
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Section title="运营提醒" description="需要优先关注的异常和到期事项。">
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">暂无需要处理的提醒。</div>
            ) : alerts.map((alert, index) => (
              <div key={`${alert.title}-${index}`} className={cn('rounded-lg border p-4', alert.type === 'danger' && 'border-red-200 bg-red-50', alert.type === 'warning' && 'border-amber-200 bg-amber-50', alert.type === 'info' && 'border-blue-200 bg-blue-50')}>
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="size-4" />
                  {alert.title}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{alert.message}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="最近后台操作"
          description="仅展示最近 6 条，用于快速追踪配置、同步、用户和兑换码相关变更。"
          actions={<Button variant="outline" onClick={clearOperationLogs}>清空记录</Button>}
        >
          <Table
            columns={[
              { key: 'createdAt', label: '时间', className: 'w-28', cellClassName: 'whitespace-nowrap', render: (row) => formatShortDate(row.createdAt) },
              { key: 'action', label: '操作', render: (row) => <span className="break-normal">{row.action}</span> },
              { key: 'target', label: '对象', render: (row) => row.target || row.metadata?.target || '-' },
              { key: 'level', label: '级别', className: 'w-20', cellClassName: 'whitespace-nowrap', render: (row) => <Badge variant={row.level === 'error' ? 'destructive' : 'secondary'}>{row.level || 'info'}</Badge> },
            ]}
            rows={recentOperations.slice(0, 6)}
            empty="暂无后台操作日志"
          />
        </Section>
      </div>
    </>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value || '-'}</div>
    </div>
  );
}

function HealthPanel({ health, generatedAt }) {
  const level = health?.level || 'attention';
  const tone = level === 'healthy'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : level === 'risk'
      ? 'border-red-200 bg-red-50 text-red-950'
      : 'border-amber-200 bg-amber-50 text-amber-950';
  return (
    <Card className={cn('overflow-hidden', tone)}>
      <CardContent className="grid gap-4 p-5 md:grid-cols-[160px_1fr] md:items-center">
        <div>
          <div className="text-sm font-semibold opacity-80">运营健康度</div>
          <div className="mt-2 text-5xl font-bold leading-none">{health?.score ?? 0}</div>
          <div className="mt-2 text-lg font-bold">{health?.title || '需要关注'}</div>
          <div className="mt-2 text-xs opacity-70">更新：{formatShortDate(generatedAt)}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <HealthItem label="上游异常" value={health?.failedAirports ?? 0} />
          <HealthItem label="即将到期用户" value={health?.expiringUsers ?? 0} />
          <HealthItem label="今日异常访问" value={health?.abnormalAccess ?? 0} />
          <HealthItem label="异常 Token" value={health?.suspiciousTokenCount ?? 0} />
        </div>
      </CardContent>
    </Card>
  );
}

function HealthItem({ label, value }) {
  return (
    <div className="rounded-lg border border-current/10 bg-white/55 p-3">
      <div className="text-xs opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function NodeFunnel({ funnel }) {
  const rows = [
    { label: '原始节点', value: funnel.raw ?? 0 },
    { label: '可分发', value: funnel.valid ?? 0, tone: 'bg-emerald-500' },
    { label: '未分发', value: funnel.undistributed ?? 0, tone: 'bg-amber-500' },
  ];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>节点分发漏斗</CardTitle>
            <CardDescription className="mt-2">从上游原始节点到最终可分发节点。</CardDescription>
          </div>
          <ShieldAlert className="size-5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-semibold">{item.value}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted">
              <div
                className={cn('h-2 rounded-full bg-primary', item.tone)}
                style={{ width: `${Math.max(3, Math.min(100, funnel.raw ? (item.value / funnel.raw) * 100 : 0))}%` }}
              />
            </div>
          </div>
        ))}
        <Button asChild variant="outline" className="w-full">
          <Link to="/admin/node-pool">查看节点明细</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}
