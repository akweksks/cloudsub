import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { airportApi } from '@/lib/api.js';
import { Badge, Button, Dialog, Field, Input, Select, Table, Textarea } from '@/components/ui.jsx';
import { formatDate, getList, PageHeader, RefreshButton, Section, StatGrid, StatusBadge } from './common.jsx';

const emptyForm = { name: '', subscriptionUrl: '', remarks: '', isEnabled: 1 };

export function AirportPage() {
  const [rows, setRows] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [nodesDialog, setNodesDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setLoading(true);
    try {
      const response = await airportApi.getAirports();
      setRows(getList(response));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const metrics = useMemo(() => rows.reduce((acc, row) => {
    acc.total += 1;
    acc[row.healthStatus || 'unknown'] = (acc[row.healthStatus || 'unknown'] || 0) + 1;
    return acc;
  }, { total: 0, healthy: 0, unhealthy: 0, empty: 0, expired: 0, unknown: 0 }), [rows]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDialog(true);
  }

  function openEdit(row) {
    setEditingId(row.id);
    setForm({
      name: row.name || row.airport_name || '',
      subscriptionUrl: row.subscriptionUrl || row.airport_url || '',
      remarks: row.remarks || '',
      isEnabled: row.isEnabled ? 1 : 0,
    });
    setDialog(true);
  }

  async function submit() {
    if (!form.name || !form.subscriptionUrl) return toast.warning('请填写机场名称和订阅地址');
    if (editingId) await airportApi.updateAirport({ ...form, id: editingId });
    else await airportApi.createAirport(form);
    toast.success('保存成功');
    setDialog(false);
    await load();
  }

  async function remove(row) {
    if (!window.confirm(`确认删除 ${row.name}？`)) return;
    await airportApi.deleteAirport(row.id);
    toast.success('已删除');
    await load();
  }

  async function checkAll() {
    setChecking(true);
    try {
      await airportApi.checkAllAirports();
      toast.success('检测完成');
      await load();
    } finally {
      setChecking(false);
    }
  }

  async function showNodes(row) {
    setNodesDialog(true);
    const response = await airportApi.getAirportNodes(row.id);
    setNodes(getList(response));
  }

  return (
    <>
      <PageHeader title="上游机场" description="添加上游订阅链接，平台会拉取节点、过滤说明节点，并汇总到节点池。">
        <RefreshButton loading={loading} onClick={load} />
        <Button variant="outline" disabled={checking} onClick={checkAll}>{checking ? '检测中' : '检测全部'}</Button>
        <Button onClick={openCreate}>添加机场</Button>
      </PageHeader>
      <StatGrid stats={[
        { label: '上游订阅', value: metrics.total },
        { label: '正常', value: metrics.healthy, tone: 'success' },
        { label: '空节点/过期', value: metrics.empty + metrics.expired, tone: 'warning' },
        { label: '拉取失败', value: metrics.unhealthy, tone: 'danger' },
      ]} />
      <Section title="机场列表" description="常用操作放在最后一列，先检测再查看节点。">
        <Table
          rows={rows}
          columns={[
            { key: 'name', label: '机场名称', render: (row) => row.name || row.airport_name },
            { key: 'subscriptionUrl', label: '订阅地址', render: (row) => <span className="block max-w-[360px] truncate">{row.subscriptionUrl || row.airport_url}</span> },
            { key: 'remarks', label: '节点前缀' },
            { key: 'isEnabled', label: '启用', render: (row) => <StatusBadge value={row.isEnabled ? '启用' : '停用'} /> },
            { key: 'healthStatus', label: '健康', render: (row) => <Health value={row.healthStatus} /> },
            { key: 'healthNodeCount', label: '节点数' },
            { key: 'lastCheckedAt', label: '最后检测', render: (row) => formatDate(row.lastCheckedAt) },
            { key: 'actions', label: '操作', render: (row) => (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => airportApi.checkAirport(row.id).then(load)}>检测</Button>
                <Button size="sm" variant="outline" onClick={() => showNodes(row)}>节点</Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button>
                <Button size="sm" variant="destructive" onClick={() => remove(row)}>删除</Button>
              </div>
            ) },
          ]}
        />
      </Section>
      <Dialog open={dialog} onOpenChange={setDialog} title={editingId ? '编辑机场' : '添加机场'} footer={<><Button variant="outline" onClick={() => setDialog(false)}>取消</Button><Button onClick={submit}>保存</Button></>}>
        <div className="grid gap-4">
          <Field label="机场名称"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="订阅地址"><Input value={form.subscriptionUrl} onChange={(e) => setForm({ ...form, subscriptionUrl: e.target.value })} /></Field>
          <Field label="节点前缀"><Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
          <Field label="状态"><Select value={form.isEnabled} onChange={(e) => setForm({ ...form, isEnabled: Number(e.target.value) })}><option value={1}>启用</option><option value={0}>停用</option></Select></Field>
        </div>
      </Dialog>
      <Dialog open={nodesDialog} onOpenChange={setNodesDialog} title="上游节点摘要" className="w-[min(96vw,980px)]">
        <Table
          rows={nodes}
          columns={[
            { key: 'name', label: '节点名称' },
            { key: 'type', label: '协议' },
            { key: 'server', label: '服务器' },
            { key: 'port', label: '端口' },
            { key: 'fetchedAt', label: '缓存时间', render: (row) => formatDate(row.fetchedAt) },
          ]}
        />
      </Dialog>
    </>
  );
}

function Health({ value }) {
  const map = { healthy: '正常', empty: '空节点', expired: '过期', unhealthy: '失败' };
  const tone = value === 'healthy' ? 'success' : value === 'unhealthy' ? 'destructive' : 'warning';
  return <Badge variant={tone}>{map[value] || value || '未知'}</Badge>;
}
