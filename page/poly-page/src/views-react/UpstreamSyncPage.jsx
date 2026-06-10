import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { upstreamSyncApi } from '@/lib/api.js';
import { Badge, Button, Table, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui.jsx';
import { formatDate, getData, PageHeader, RefreshButton, Section, StatGrid } from './common.jsx';

function statusText(status) {
  return ({
    healthy: '正常',
    empty: '空节点',
    unhealthy: '拉取失败',
    expired: '已过期',
    disabled: '已停用',
    unknown: '未知',
  })[status] || status || '-';
}

function statusVariant(status) {
  if (status === 'healthy') return 'success';
  if (status === 'empty' || status === 'expired' || status === 'unknown') return 'warning';
  return 'destructive';
}

function isFailedStatus(status) {
  return Boolean(status) && status !== 'healthy';
}

export function UpstreamSyncPage() {
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [scheduler, setScheduler] = useState({});
  const [history, setHistory] = useState([]);
  const [nodePool, setNodePool] = useState({});
  const [dataVersion, setDataVersion] = useState('-');

  async function load(options = {}) {
    setLoading(true);
    try {
      const response = await upstreamSyncApi.status(options);
      const data = getData(response);
      setScheduler(data.scheduler || {});
      setHistory((data.history || []).slice(0, 6));
      setNodePool(data.nodePool || {});
      setDataVersion(data.dataVersion || '-');
    } finally {
      setLoading(false);
    }
  }

  async function runSync() {
    setRunning(true);
    try {
      const response = await upstreamSyncApi.run({ force: true });
      const result = getData(response);
      if (result?.ranAt) {
        setScheduler(result);
        setHistory((current) => [result, ...current].slice(0, 6));
        if (result.nodePool) setNodePool(result.nodePool);
      }
      await load({ force: true });
      toast.success('同步任务已完成');
    } finally {
      setRunning(false);
    }
  }

  async function clearHistory() {
    if (!window.confirm('确定清空同步历史吗？')) return;
    setClearingHistory(true);
    try {
      await upstreamSyncApi.clearHistory();
      setHistory([]);
      toast.success('同步历史已清空');
      await load({ force: true });
    } finally {
      setClearingHistory(false);
    }
  }

  useEffect(() => { load(); }, []);

  const checkedRows = scheduler.checked || [];
  const skippedRows = scheduler.skipped || [];
  const failedRows = checkedRows.filter((row) => isFailedStatus(row.status));

  return (
    <>
      <PageHeader title="同步任务" description="定时拉取上游订阅，生成 R2 节点快照和最终节点池。默认每 6 小时同步一次，可在通用配置中调整。">
        <RefreshButton loading={loading} onClick={() => load({ force: true })} />
        <Button disabled={running} onClick={runSync}>{running ? '同步中' : '立即同步'}</Button>
      </PageHeader>

      <StatGrid stats={[
        { label: '最近运行', value: formatDate(scheduler.ranAt) },
        { label: '检查机场', value: checkedRows.length, tone: 'success' },
        { label: '跳过机场', value: skippedRows.length, tone: 'warning' },
        { label: '异常机场', value: failedRows.length, tone: failedRows.length ? 'danger' : 'success' },
        { label: '可用节点', value: scheduler.nodePool?.validCount ?? nodePool.validCount ?? 0, tone: 'success' },
        { label: '过滤节点', value: scheduler.nodePool?.filteredCount ?? nodePool.filteredCount ?? 0, tone: 'warning' },
        { label: '无效节点', value: scheduler.nodePool?.invalidCount ?? nodePool.invalidCount ?? 0, tone: 'danger' },
        { label: '重复节点', value: scheduler.nodePool?.duplicateCount ?? nodePool.duplicateCount ?? 0, tone: 'warning' },
      ]} />

      <Section title="任务摘要" description={`间隔：${scheduler.intervalHours || 6} 小时，数据版本：${dataVersion}`}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Info label="运行方式" value={scheduler.force ? '手动强制' : '定时任务'} />
          <Info label="节点池更新时间" value={formatDate(nodePool.updatedAt)} />
          <Info label="新增节点" value={nodePool.changeSummary?.addedCount ?? 0} />
          <Info label="移除节点" value={nodePool.changeSummary?.removedCount ?? 0} />
        </div>
      </Section>

      <Section
        title="同步历史"
        description="最近 6 次同步会保存在 R2，用来排查上游波动和节点池变化。"
        actions={(
          <Button
            variant="outline"
            disabled={clearingHistory || history.length === 0}
            onClick={clearHistory}
          >
            {clearingHistory ? '删除中' : '删除历史'}
          </Button>
        )}
      >
        <Table
          columns={[
            { key: 'ranAt', label: '运行时间', render: (row) => formatDate(row.ranAt) },
            { key: 'force', label: '方式', render: (row) => row.force ? '手动' : '定时' },
            { key: 'checked', label: '检查机场', render: (row) => row.checked?.length || 0 },
            { key: 'skipped', label: '跳过机场', render: (row) => row.skipped?.length || 0 },
            { key: 'validCount', label: '可用节点', render: (row) => row.nodePool?.validCount ?? 0 },
            { key: 'filteredCount', label: '过滤节点', render: (row) => row.nodePool?.filteredCount ?? 0 },
          ]}
          rows={history}
          rowKey="ranAt"
          empty="暂无同步历史"
        />
      </Section>

      <Section title="同步明细" description="查看本次检查、跳过和异常的上游机场。">
        <Tabs defaultValue="checked">
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="checked">已检查机场</TabsTrigger>
            <TabsTrigger value="failed">异常机场</TabsTrigger>
            <TabsTrigger value="skipped">跳过机场</TabsTrigger>
          </TabsList>
          <TabsContent value="checked">
            <Table columns={checkedColumns} rows={checkedRows} empty="暂无检查记录" />
          </TabsContent>
          <TabsContent value="failed">
            <Table columns={checkedColumns} rows={failedRows} empty="暂无异常机场" />
          </TabsContent>
          <TabsContent value="skipped">
            <Table
              columns={[
                { key: 'name', label: '机场' },
                { key: 'lastCheckedAt', label: '上次检查', render: (row) => formatDate(row.lastCheckedAt) },
              ]}
              rows={skippedRows}
              empty="暂无跳过记录"
            />
          </TabsContent>
        </Tabs>
      </Section>
    </>
  );
}

const checkedColumns = [
  { key: 'name', label: '机场' },
  { key: 'status', label: '状态', render: (row) => <Badge variant={statusVariant(row.status)}>{statusText(row.status)}</Badge> },
  { key: 'nodeCount', label: '节点数' },
  { key: 'checkedAt', label: '检查时间', render: (row) => formatDate(row.checkedAt) },
];

function Info({ label, value }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value || '-'}</div>
    </div>
  );
}
