import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { clashTemplateApi, planApi, routingProfileApi } from '@/lib/api.js';
import { Button, Dialog, Field, Input, Select, Table, Textarea } from '@/components/ui.jsx';
import { getList, PageHeader, RefreshButton, Section, StatusBadge } from './common.jsx';

const emptyForm = { name: '', durationDays: 30, templateId: '', routingProfileId: '', status: 'active', sortOrder: 0, description: '' };

export function PlanPage() {
  const [rows, setRows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [routingProfiles, setRoutingProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setLoading(true);
    try {
      const [planRes, templateRes, routingProfileRes] = await Promise.all([
        planApi.list(),
        clashTemplateApi.listActive(),
        routingProfileApi.listSelectable(),
      ]);
      setRows(getList(planRes));
      setTemplates(getList(templateRes));
      setRoutingProfiles(getList(routingProfileRes));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDialog(true);
  }

  function openEdit(row) {
    setEditingId(row.id);
    setForm({
      name: row.name || '',
      durationDays: row.duration_days || 30,
      templateId: row.template_id || '',
      routingProfileId: row.routing_profile_id || '',
      status: row.status || 'active',
      sortOrder: row.sort_order || 0,
      description: row.description || '',
    });
    setDialog(true);
  }

  async function submit() {
    if (!form.name) return toast.warning('请输入套餐名称');
    const payload = { ...form, templateId: form.templateId || null, routingProfileId: form.routingProfileId || null };
    if (editingId) await planApi.update(editingId, payload);
    else await planApi.create(payload);
    toast.success('保存成功');
    setDialog(false);
    await load();
  }

  async function toggle(row) {
    await planApi.update(row.id, {
      name: row.name,
      durationDays: row.duration_days,
      templateId: row.template_id || null,
      routingProfileId: row.routing_profile_id || null,
      status: row.status === 'active' ? 'disabled' : 'active',
      sortOrder: row.sort_order || 0,
      description: row.description || '',
    });
    await load();
  }

  async function remove(row) {
    if (!window.confirm('确认删除套餐？已生成的订阅用户不会被删除。')) return;
    await planApi.delete(row.id);
    toast.success('已删除');
    await load();
  }

  return (
    <>
      <PageHeader title="套餐" description="兑换码会绑定套餐，用户兑换后自动生成对应有效期的订阅。">
        <RefreshButton loading={loading} onClick={load} />
        <Button onClick={openCreate}>新增套餐</Button>
      </PageHeader>
      <Section title="套餐列表">
        <Table rows={rows} columns={[
          { key: 'name', label: '套餐名称' },
          { key: 'duration_days', label: '有效天数' },
          { key: 'template_name', label: 'Clash 模板', render: (row) => row.template_name || '默认模板' },
          { key: 'routing_profile_name', label: '分流规则', render: (row) => row.routing_profile_name || '系统默认规则' },
          { key: 'status', label: '状态', render: (row) => <StatusBadge value={row.status === 'active' ? '启用' : '停用'} /> },
          { key: 'sort_order', label: '排序' },
          { key: 'description', label: '备注' },
          { key: 'actions', label: '操作', render: (row) => <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button><Button size="sm" variant="outline" onClick={() => toggle(row)}>{row.status === 'active' ? '停用' : '启用'}</Button><Button size="sm" variant="destructive" onClick={() => remove(row)}>删除</Button></div> },
        ]} />
      </Section>
      <Dialog open={dialog} onOpenChange={setDialog} title={editingId ? '编辑套餐' : '新增套餐'} footer={<><Button variant="outline" onClick={() => setDialog(false)}>取消</Button><Button onClick={submit}>保存</Button></>}>
        <div className="grid gap-4">
          <Field label="套餐名称"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="有效天数"><Input type="number" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })} /></Field>
          <Field label="Clash 模板"><Select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}><option value="">默认模板</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <Field label="分流规则"><Select value={form.routingProfileId} onChange={(e) => setForm({ ...form, routingProfileId: e.target.value })}><option value="">系统默认规则</option>{routingProfiles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <Field label="状态"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">启用</option><option value="disabled">停用</option></Select></Field>
          <Field label="排序"><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></Field>
          <Field label="备注"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
      </Dialog>
    </>
  );
}
