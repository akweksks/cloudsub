import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { subscriptionAccessLogApi } from '@/lib/api.js';
import { Badge, Button, Card, CardContent, Field, Input, Select, Table } from '@/components/ui.jsx';
import { formatDate, PageHeader, RefreshButton, StatGrid } from './common.jsx';

function rowsOf(res) {
  return res?.data?.results || res?.data || [];
}

function statusText(status) {
  return ({
    success: '成功',
    expired: '已到期',
    disabled: '已禁用',
    missing: '不存在',
    empty: '无节点',
    rate_limited: '频率限制',
    suspicious: '异常限制',
  })[status] || status || '-';
}

function statusVariant(status) {
  return ({
    success: 'success',
    expired: 'warning',
    disabled: 'destructive',
    missing: 'destructive',
    empty: 'outline',
    rate_limited: 'warning',
    suspicious: 'destructive',
  })[status] || 'outline';
}

export function SubscriptionLogPage() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ keyword: '', status: '', limit: 200, from: '', to: '' });

  const statItems = useMemo(() => [
    { label: '总访问', value: stats.total || 0 },
    { label: '成功', value: stats.success || 0, tone: 'success' },
    { label: '已到期', value: stats.expired || 0, tone: 'warning' },
    { label: '异常', value: Number(stats.disabled || 0) + Number(stats.missing || 0) + Number(stats.empty || 0) + Number(stats.rate_limited || 0) + Number(stats.suspicious || 0), tone: 'danger' },
  ], [stats]);

  async function load(nextFilters = filters) {
    setLoading(true);
    try {
      const [logRes, statRes] = await Promise.all([
        subscriptionAccessLogApi.list({
          limit: nextFilters.limit,
          status: nextFilters.status || undefined,
          keyword: nextFilters.keyword || undefined,
          from: nextFilters.from ? new Date(nextFilters.from).toISOString() : undefined,
          to: nextFilters.to ? new Date(nextFilters.to).toISOString() : undefined,
        }),
        subscriptionAccessLogApi.stats(),
      ]);
      setLogs(rowsOf(logRes));
      setStats(statRes.data || {});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function cleanup() {
    const raw = window.prompt('清理多少天以前的访问日志？', '30');
    if (!raw) return;
    const days = Number(raw);
    if (!Number.isFinite(days) || days <= 0) return toast.warning('请输入有效天数');
    const res = await subscriptionAccessLogApi.cleanup(days);
    toast.success(`已清理 ${res.data?.changes || 0} 条旧日志`);
    await load();
  }

  const columns = [
    { key: 'accessed_at', label: '访问时间', render: (row) => formatDate(row.accessed_at) },
    { key: 'status', label: '结果', render: (row) => <Badge variant={statusVariant(row.status)}>{statusText(row.status)}</Badge> },
    { key: 'message', label: '说明', render: (row) => row.message || '-' },
    { key: 'user_remark', label: '用户备注', render: (row) => row.user_remark || '-' },
    { key: 'plan_name', label: '套餐', render: (row) => row.plan_name || '-' },
    { key: 'template_name', label: '模板', render: (row) => row.template_name || '默认模板' },
    { key: 'ip', label: 'IP', render: (row) => row.ip || '-' },
    { key: 'user_agent', label: '客户端', render: (row) => <span className="line-clamp-2 max-w-[360px] text-muted-foreground">{row.user_agent || '-'}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="访问审计"
        title="访问日志"
        description="查看订阅链接访问结果，用来排查过期、禁用、无效 Token、无节点等问题。"
        actions={<><Button variant="outline" onClick={cleanup}>清理旧日志</Button><RefreshButton onClick={() => load()} loading={loading} /></>}
      />
      <StatGrid items={statItems} />
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="grid gap-3 xl:grid-cols-[1fr_150px_130px_190px_190px_auto]">
            <Input value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} placeholder="搜索 Token、IP、备注、客户端" />
            <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">全部结果</option>
              <option value="abnormal">全部异常</option>
              <option value="success">成功</option>
              <option value="expired">已到期</option>
              <option value="disabled">已禁用</option>
              <option value="missing">不存在</option>
              <option value="empty">无节点</option>
            </Select>
            <Select value={filters.limit} onChange={(e) => setFilters({ ...filters, limit: Number(e.target.value) })}>
              <option value={100}>100 条</option>
              <option value={200}>200 条</option>
              <option value={500}>500 条</option>
            </Select>
            <Field label="开始时间"><Input type="datetime-local" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
            <Field label="结束时间"><Input type="datetime-local" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
            <div className="flex items-end gap-2">
              <Button onClick={() => load()}>查询</Button>
              <Button variant="outline" onClick={() => {
                const next = { keyword: '', status: '', limit: 200, from: '', to: '' };
                setFilters(next);
                load(next);
              }}>重置</Button>
            </div>
          </div>
          <Table columns={columns} rows={logs} empty="暂无访问日志" />
        </CardContent>
      </Card>
    </div>
  );
}
