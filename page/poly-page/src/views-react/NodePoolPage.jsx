import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { nodePoolApi } from '@/lib/api.js';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui.jsx';
import { cn } from '@/lib/cn.js';
import { formatDate, formatShortDate, getData, PageHeader, RefreshButton, Section, StatGrid } from './common.jsx';

export function NodePoolPage() {
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [snapshot, setSnapshot] = useState({});
  const [history, setHistory] = useState([]);

  async function load(options = {}) {
    setLoading(true);
    try {
      const response = await nodePoolApi.status(options);
      const data = getData(response);
      setSnapshot(data.nodePool || {});
      setHistory(data.history || []);
    } finally {
      setLoading(false);
    }
  }

  async function rebuild() {
    setRebuilding(true);
    try {
      const response = await nodePoolApi.rebuild();
      const data = getData(response);
      setSnapshot(data.nodePool || {});
      toast.success('节点池已重建');
      await load({ force: true });
    } finally {
      setRebuilding(false);
    }
  }

  async function clearHistory() {
    if (!window.confirm('确认清空节点池变化记录？当前节点池不会被删除。')) return;
    await nodePoolApi.clearHistory();
    toast.success('节点池变化记录已清空');
    await load({ force: true });
  }

  useEffect(() => { load(); }, []);

  const rows = useMemo(() => ({
    valid: mapEntries(snapshot.entries),
    filtered: mapEntries(snapshot.filteredEntries),
    invalid: mapEntries(snapshot.invalidEntries),
    duplicate: mapEntries(snapshot.duplicateEntries),
    raw: mapEntries(snapshot.rawEntries),
  }), [snapshot]);

  const sourceRows = useMemo(() => {
    const map = new Map();
    const bump = (row, keyName) => {
      const key = `${row.sourceType || '-'}:${row.sourceName || '-'}`;
      const current = map.get(key) || {
        source: key,
        sourceType: row.sourceType,
        sourceName: row.sourceName,
        valid: 0,
        filtered: 0,
        invalid: 0,
        duplicate: 0,
      };
      current[keyName] += 1;
      current.total = current.valid + current.filtered + current.invalid + current.duplicate;
      current.quality = current.total ? Math.round((current.valid / current.total) * 100) : 0;
      map.set(key, current);
    };
    rows.valid.forEach((row) => bump(row, 'valid'));
    rows.filtered.forEach((row) => bump(row, 'filtered'));
    rows.invalid.forEach((row) => bump(row, 'invalid'));
    rows.duplicate.forEach((row) => bump(row, 'duplicate'));
    return [...map.values()].sort((a, b) => b.valid - a.valid || b.total - a.total);
  }, [rows.valid, rows.filtered, rows.invalid, rows.duplicate]);

  const changes = snapshot.changeSummary || {};
  const funnel = {
    raw: rows.raw.length,
    valid: snapshot.validCount ?? rows.valid.length,
    filtered: snapshot.filteredCount ?? rows.filtered.length,
    invalid: snapshot.invalidCount ?? rows.invalid.length,
    duplicate: snapshot.duplicateCount ?? rows.duplicate.length,
  };
  funnel.undistributed = funnel.filtered + funnel.invalid + funnel.duplicate;

  return (
    <>
      <PageHeader title="节点池状态" description="可分发节点是经过校验、关键词过滤、去重和中文重命名后的最终结果；原始节点用于排查上游返回内容。">
        <RefreshButton loading={loading} onClick={() => load({ force: true })} />
        <Button disabled={rebuilding} onClick={rebuild}>{rebuilding ? '重建中' : '重建节点池'}</Button>
      </PageHeader>

      <StatGrid stats={[
        { label: '可分发节点', value: snapshot.validCount ?? 0, tone: 'success' },
        { label: '过滤节点', value: snapshot.filteredCount ?? 0, tone: 'warning' },
        { label: '无效节点', value: snapshot.invalidCount ?? 0, tone: 'danger' },
        { label: '重复节点', value: snapshot.duplicateCount ?? 0, tone: 'warning' },
        { label: '原始节点', value: rows.raw.length },
        { label: '新增节点', value: changes.addedCount ?? 0, tone: 'success' },
        { label: '移除节点', value: changes.removedCount ?? 0, tone: 'warning' },
        { label: '上次可用', value: changes.previousValidCount ?? 0 },
      ]} />

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <DistributionFunnel funnel={funnel} />
        <SourceQuality rows={sourceRows} updatedAt={snapshot.updatedAt} />
      </div>

      <Section
        title="节点池变化"
        description="仅保留最近 6 次变化，方便判断上游是否突然减少或大量新增。"
        actions={<Button variant="outline" onClick={clearHistory}>清空记录</Button>}
      >
        <Table
          columns={[
            { key: 'updatedAt', label: '更新时间', className: 'w-32', cellClassName: 'whitespace-nowrap', render: (row) => formatShortDate(row.updatedAt) },
            { key: 'validCount', label: '可用节点' },
            { key: 'filteredCount', label: '过滤节点' },
            { key: 'invalidCount', label: '无效节点' },
            { key: 'duplicateCount', label: '重复节点' },
            { key: 'addedCount', label: '新增', render: (row) => row.changeSummary?.addedCount ?? 0 },
            { key: 'removedCount', label: '移除', render: (row) => row.changeSummary?.removedCount ?? 0 },
          ]}
          rows={history.slice(0, 6)}
          rowKey="updatedAt"
          empty="暂无节点池变化记录"
        />
      </Section>

      <Section title="来源统计" description={`最近更新：${formatDate(snapshot.updatedAt)}`}>
        <Table
          columns={[
            { key: 'source', label: '来源' },
            { key: 'valid', label: '可分发' },
            { key: 'filtered', label: '过滤' },
            { key: 'invalid', label: '无效' },
            { key: 'duplicate', label: '重复' },
            { key: 'quality', label: '质量', render: (row) => `${row.quality || 0}%` },
          ]}
          rows={sourceRows}
          empty="暂无来源数据"
        />
      </Section>

      <Section title="节点明细" description="可分发节点是最终用户会拿到的节点；原始节点保留上游原始名称，便于排查过滤和重命名。">
        <Tabs defaultValue="valid">
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="valid">可分发节点</TabsTrigger>
            <TabsTrigger value="filtered">过滤节点</TabsTrigger>
            <TabsTrigger value="invalid">无效节点</TabsTrigger>
            <TabsTrigger value="duplicate">重复节点</TabsTrigger>
            <TabsTrigger value="raw">原始节点</TabsTrigger>
          </TabsList>
          <NodeTab value="valid" rows={rows.valid} empty="暂无可分发节点" />
          <NodeTab value="filtered" rows={rows.filtered} showReason empty="暂无过滤节点" />
          <NodeTab value="invalid" rows={rows.invalid} showReason empty="暂无无效节点" />
          <NodeTab value="duplicate" rows={rows.duplicate} showDuplicate empty="暂无重复节点" />
          <NodeTab value="raw" rows={rows.raw} showOriginal empty="暂无原始节点" />
        </Tabs>
      </Section>
    </>
  );
}

function DistributionFunnel({ funnel }) {
  const raw = funnel.raw || funnel.valid + funnel.undistributed || 0;
  const items = [
    { label: '可分发', value: funnel.valid, tone: 'success', bar: 'bg-emerald-500' },
    { label: '关键词过滤', value: funnel.filtered, tone: 'warning', bar: 'bg-amber-500' },
    { label: '无效', value: funnel.invalid, tone: 'danger', bar: 'bg-red-500' },
    { label: '重复', value: funnel.duplicate, tone: 'warning', bar: 'bg-sky-500' },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>分发漏斗</CardTitle>
        <CardDescription>判断节点从上游进入分发池时，主要流失在哪一步。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-4">
          <div className="text-sm text-muted-foreground">原始节点</div>
          <div className="mt-1 text-3xl font-bold">{raw}</div>
        </div>
        <div className="space-y-3">
          {items.map((item) => {
            const percent = raw ? Math.round((item.value / raw) * 100) : 0;
            return (
              <div key={item.label}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={item.tone === 'danger' ? 'destructive' : item.tone}>{item.label}</Badge>
                  </div>
                  <span className="font-semibold">{item.value} / {percent}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', item.bar)} style={{ width: `${Math.max(item.value ? 3 : 0, percent)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SourceQuality({ rows, updatedAt }) {
  const topRows = rows.slice(0, 4);
  return (
    <Card>
      <CardHeader>
        <CardTitle>来源质量</CardTitle>
        <CardDescription>按可分发节点数排序，同时显示过滤、无效和重复情况。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          最近更新：<span className="font-semibold text-foreground">{formatDate(updatedAt)}</span>
        </div>
        {topRows.length === 0 ? (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">暂无可分发来源。</div>
        ) : topRows.map((row) => (
          <div key={row.source} className="rounded-lg border p-3">
            <div className="min-w-0">
              <div className="truncate font-semibold">{row.sourceName || row.source}</div>
              <div className="text-xs text-muted-foreground">{row.sourceType || '-'}</div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              <SourceMetric label="可分发" value={row.valid} />
              <SourceMetric label="过滤" value={row.filtered} />
              <SourceMetric label="无效" value={row.invalid} />
              <SourceMetric label="重复" value={row.duplicate} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SourceMetric({ label, value }) {
  return (
    <div className="rounded-md bg-muted/60 px-2 py-2">
      <div className="font-bold text-foreground">{value || 0}</div>
      <div className="mt-1 text-muted-foreground">{label}</div>
    </div>
  );
}

function NodeTab({ value, rows, showReason, showDuplicate, showOriginal, empty }) {
  const columns = [
    {
      key: 'name',
      label: showOriginal ? '原始节点名称' : '节点名称',
      className: showOriginal ? 'min-w-72' : 'min-w-56',
      cellClassName: 'max-w-80 whitespace-nowrap',
      render: (row) => <span className="block truncate" title={showOriginal ? (row.originalName || row.name) : row.name}>{showOriginal ? (row.originalName || row.name) : row.name}</span>,
    },
    ...(showOriginal ? [{
      key: 'finalName',
      label: '最终名称',
      className: 'min-w-32',
      cellClassName: 'whitespace-nowrap font-medium text-foreground',
      render: (row) => row.finalName || '-',
    }, {
      key: 'distributionStatus',
      label: '分发状态',
      className: 'min-w-44',
      cellClassName: 'whitespace-nowrap',
      render: (row) => formatDistributionStatus(row),
    }] : []),
    { key: 'type', label: '协议', className: 'min-w-24', cellClassName: 'whitespace-nowrap' },
    { key: 'server', label: '服务器', className: 'min-w-56', cellClassName: 'max-w-72 whitespace-nowrap', render: (row) => <span className="block truncate" title={row.server}>{row.server}</span> },
    { key: 'port', label: '端口', className: 'min-w-20', cellClassName: 'whitespace-nowrap' },
    ...(showReason ? [{ key: 'reason', label: '原因', className: 'min-w-40', cellClassName: 'whitespace-nowrap' }] : []),
    ...(showDuplicate ? [{ key: 'duplicateKey', label: '去重指纹', className: 'min-w-72', cellClassName: 'max-w-96 whitespace-nowrap', render: (row) => <span className="block truncate" title={row.duplicateKey}>{row.duplicateKey}</span> }] : []),
    { key: 'sourceName', label: '来源', className: 'min-w-32', cellClassName: 'whitespace-nowrap' },
    { key: 'sourceType', label: '来源类型', className: 'min-w-24', cellClassName: 'whitespace-nowrap' },
  ];
  return (
    <TabsContent value={value}>
      <Table columns={columns} rows={rows} empty={empty} rowKey="rowKey" tableClassName={showOriginal ? 'min-w-[1240px]' : 'min-w-[980px]'} />
    </TabsContent>
  );
}

function mapEntries(entries = []) {
  return entries.map((entry, index) => ({
    rowKey: `${entry.proxy?.name || entry.originalName || index}-${index}`,
    name: entry.proxy?.name || entry.originalName || '',
    originalName: entry.originalName || entry.proxy?.name || '',
    finalName: entry.finalName || '',
    distributionStatus: entry.distributionStatus || (entry.finalName ? 'distributed' : 'skipped'),
    distributionReason: entry.distributionReason || '',
    type: entry.proxy?.type || '',
    server: entry.proxy?.server || '',
    port: entry.proxy?.port || '',
    sourceName: entry.source?.name || entry.source?.id || '',
    sourceType: entry.source?.type || '',
    reason: formatReason(entry.filterReason || (entry.invalidReasons || [])[0]),
    duplicateKey: entry.duplicateKey || '',
  }));
}

function formatDistributionStatus(row) {
  const status = row.distributionStatus;
  const reason = formatReason(row.distributionReason || row.reason);
  if (status === 'distributed') return '已分发';
  if (status === 'filtered') return reason && reason !== '-' ? `关键词过滤：${reason.replace(/^关键词：/, '')}` : '关键词过滤';
  if (status === 'invalid') return reason && reason !== '-' ? `无效未分发：${reason}` : '无效未分发';
  if (status === 'duplicate') return '重复未分发';

  const map = {
    skipped: '未分发',
  };
  return map[status] || '未分发';
}

function formatReason(reason) {
  const value = String(reason || '');
  if (value.startsWith('blocked-keyword:')) return `关键词：${value.slice('blocked-keyword:'.length)}`;
  const map = {
    duplicate: '重复节点',
    invalid: '节点无效',
    skipped: '未进入分发池',
    'missing-name': '缺少名称',
    'unsupported-type': '协议不支持',
    'missing-server': '缺少服务器',
    'invalid-port': '端口无效',
    'missing-uuid': '缺少 UUID',
    'missing-password': '缺少密码',
    'missing-ss-auth': '缺少 SS 认证',
  };
  if (map[value]) return map[value];
  return value || '-';
}
