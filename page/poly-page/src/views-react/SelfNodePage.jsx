import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { selfNodeApi } from '@/lib/api.js';
import { Button, Dialog, Field, Table, Textarea } from '@/components/ui.jsx';
import { getList, PageHeader, RefreshButton, Section } from './common.jsx';

export function SelfNodePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ link: '', convert: '' });

  async function load() {
    setLoading(true);
    try {
      const response = await selfNodeApi.getAllNodes();
      setRows(getList(response));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm({ link: '', convert: '' });
    setDialog(true);
  }

  function openEdit(row) {
    setEditingId(row.id);
    setForm({ link: row.link || '', convert: row.convert || '' });
    setDialog(true);
  }

  async function submit() {
    if (!form.link) return toast.warning('请输入节点链接');
    if (editingId) await selfNodeApi.updateNode({ ...form, id: editingId });
    else await selfNodeApi.createNode(form);
    toast.success('保存成功');
    setDialog(false);
    await load();
  }

  async function remove(row) {
    if (!window.confirm('确认删除该自建节点？')) return;
    await selfNodeApi.deleteNode(row.id);
    toast.success('已删除');
    await load();
  }

  return (
    <>
      <PageHeader title="自建节点" description="手动导入单个节点链接，平台会转换为 Clash 格式并加入节点池。">
        <RefreshButton loading={loading} onClick={load} />
        <Button onClick={openCreate}>添加节点</Button>
      </PageHeader>
      <Section title="节点列表" description="支持 VMess、VLESS、Trojan、Shadowsocks、Hysteria、Hysteria2、AnyTLS 等协议。">
        <Table
          rows={rows}
          columns={[
            { key: 'id', label: 'ID' },
            { key: 'link', label: '原始链接', render: (row) => <span className="block max-w-[420px] truncate">{row.link}</span> },
            { key: 'convert', label: '转换后配置', render: (row) => <span className="block max-w-[420px] truncate">{row.convert}</span> },
            { key: 'actions', label: '操作', render: (row) => (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button>
                <Button size="sm" variant="destructive" onClick={() => remove(row)}>删除</Button>
              </div>
            ) },
          ]}
        />
      </Section>
      <Dialog open={dialog} onOpenChange={setDialog} title={editingId ? '编辑节点' : '添加节点'} footer={<><Button variant="outline" onClick={() => setDialog(false)}>取消</Button><Button onClick={submit}>保存</Button></>}>
        <div className="grid gap-4">
          <Field label="自建节点链接" hint="粘贴完整节点 URI。">
            <Textarea rows={6} value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
          </Field>
          {editingId ? (
            <Field label="转换后 Clash 配置">
              <Textarea rows={8} value={form.convert} onChange={(e) => setForm({ ...form, convert: e.target.value })} />
            </Field>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
