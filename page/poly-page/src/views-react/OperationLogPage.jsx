import { useEffect, useState } from 'react';
import { operationLogApi } from '@/lib/api.js';
import { Badge, Button, Select, Table } from '@/components/ui.jsx';
import { formatDate, formatShortDate, getList, PageHeader, RefreshButton, Section, StatGrid } from './common.jsx';

export function OperationLogPage() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [limit, setLimit] = useState(6);

  async function load(nextLimit = limit) {
    setLoading(true);
    try {
      const response = await operationLogApi.list({ limit: nextLimit });
      setLogs(getList(response));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function clearLogs() {
    if (!window.confirm('确认清空最近后台操作记录？')) return;
    await operationLogApi.clear();
    setLogs([]);
  }

  const writeCount = logs.filter((log) => String(log.action || '').startsWith('POST') || String(log.action || '').startsWith('PATCH')).length;
  const deleteCount = logs.filter((log) => String(log.action || '').startsWith('DELETE')).length;

  return (
    <>
      <PageHeader title="操作日志" description="记录后台关键写操作，用于追踪配置、同步、兑换码、用户和节点池相关变更。">
        <Select className="w-32" value={limit} onChange={(event) => {
          const next = Number(event.target.value);
          setLimit(next);
          load(next);
        }}>
          <option value={3}>3 条</option>
          <option value={6}>6 条</option>
          <option value={12}>12 条</option>
          <option value={24}>24 条</option>
        </Select>
        <Button variant="outline" onClick={clearLogs}>清空记录</Button>
        <RefreshButton loading={loading} onClick={() => load()} />
      </PageHeader>

      <StatGrid stats={[
        { label: '日志数量', value: logs.length },
        { label: '写入操作', value: writeCount, tone: 'success' },
        { label: '删除操作', value: deleteCount, tone: deleteCount ? 'warning' : undefined },
        { label: '最近操作', value: logs[0] ? formatDate(logs[0].createdAt) : '-' },
      ]} />

      <Section title="操作明细" description="只记录操作类型、路径、IP、客户端和耗时，不保存后台密码等敏感请求体。">
        <Table
          columns={[
            { key: 'createdAt', label: '时间', className: 'w-32', cellClassName: 'whitespace-nowrap', render: (row) => formatShortDate(row.createdAt) },
            { key: 'action', label: '操作', render: (row) => <span className="break-normal">{row.action}</span> },
            { key: 'target', label: '对象', render: (row) => row.target || row.metadata?.target || '-' },
            { key: 'level', label: '级别', className: 'w-24', cellClassName: 'whitespace-nowrap', render: (row) => <Badge variant={row.level === 'error' ? 'destructive' : 'secondary'}>{row.level || 'info'}</Badge> },
            { key: 'ip', label: 'IP', render: (row) => row.metadata?.ip || '-' },
            { key: 'latencyMs', label: '耗时', className: 'w-24', cellClassName: 'whitespace-nowrap', render: (row) => Number.isFinite(Number(row.metadata?.latencyMs)) ? `${row.metadata.latencyMs} ms` : '-' },
          ]}
          rows={logs}
          rowKey="createdAt"
          empty="暂无操作日志"
        />
      </Section>
    </>
  );
}
