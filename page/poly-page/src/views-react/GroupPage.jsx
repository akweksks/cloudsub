import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { groupApi } from '@/lib/api.js';
import { Button, Dialog, Field, Input, Select, Table, Textarea } from '@/components/ui.jsx';
import { getList, PageHeader, RefreshButton, Section } from './common.jsx';

const emptyForm = { groupName: '', groupType: 'select', groupRegex: '', url: '', interval: '' };

export function GroupPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setLoading(true);
    try {
      setRows(getList(await groupApi.getAllGroups()));
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
    setForm({ ...emptyForm, ...row });
    setDialog(true);
  }

  async function submit() {
    if (!form.groupName) return toast.warning('请输入分组名称');
    const payload = { ...form, id: editingId };
    if (payload.groupType === 'select') {
      payload.url = null;
      payload.interval = null;
    }
    if (editingId) await groupApi.updateGroup(payload);
    else await groupApi.createGroup(payload);
    toast.success('保存成功');
    setDialog(false);
    await load();
  }

  async function remove(row) {
    if (!window.confirm(`确认删除分组 ${row.groupName}？`)) return;
    await groupApi.deleteGroup(row.id);
    toast.success('已删除');
    await load();
  }

  return (
    <>
      <PageHeader title="策略分组" description="把节点放入选择、测速、故障转移等策略组，订阅模板会引用这些分组。">
        <RefreshButton loading={loading} onClick={load} />
        <Button onClick={openCreate}>添加分组</Button>
      </PageHeader>
      <Section title="分组列表" description="新手建议先保留默认分组，再按地区或用途逐步添加。">
        <Table
          rows={rows}
          columns={[
            { key: 'id', label: 'ID' },
            { key: 'groupName', label: '分组名称' },
            { key: 'groupType', label: '类型' },
            { key: 'groupRegex', label: '节点匹配', render: (row) => <span className="block max-w-[320px] truncate">{row.groupRegex || '全部节点'}</span> },
            { key: 'url', label: '测速 URL', render: (row) => row.url || '-' },
            { key: 'actions', label: '操作', render: (row) => (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button>
                <Button size="sm" variant="destructive" onClick={() => remove(row)}>删除</Button>
              </div>
            ) },
          ]}
        />
      </Section>
      <Dialog open={dialog} onOpenChange={setDialog} title={editingId ? '编辑分组' : '添加分组'} footer={<><Button variant="outline" onClick={() => setDialog(false)}>取消</Button><Button onClick={submit}>保存</Button></>}>
        <div className="grid gap-4">
          <Field label="分组名称"><Input value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} /></Field>
          <Field label="分组类型">
            <Select value={form.groupType} onChange={(e) => setForm({ ...form, groupType: e.target.value })}>
              <option value="select">手动选择</option>
              <option value="url-test">自动测速</option>
              <option value="fallback">故障转移</option>
              <option value="load-balance">负载均衡</option>
            </Select>
          </Field>
          <Field label="节点匹配正则" hint="留空表示全部节点。"><Textarea value={form.groupRegex || ''} onChange={(e) => setForm({ ...form, groupRegex: e.target.value })} /></Field>
          {form.groupType !== 'select' ? (
            <>
              <Field label="测速 URL"><Input value={form.url || ''} onChange={(e) => setForm({ ...form, url: e.target.value })} /></Field>
              <Field label="间隔秒数"><Input value={form.interval || ''} onChange={(e) => setForm({ ...form, interval: e.target.value })} /></Field>
            </>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
