import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileCode2, Upload, Wand2 } from 'lucide-react';
import { clashTemplateApi } from '@/lib/api.js';
import { Badge, Button, Card, CardContent, Dialog, Field, Input, Select, Table, Textarea } from '@/components/ui.jsx';
import { CopyButton, formatDate, PageHeader, RefreshButton, StatGrid } from './common.jsx';

const sampleYaml = `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - __AUTO__
      - DIRECT
  - name: 自动选择
    type: url-test
    proxies:
      - __AUTO__
    url: https://www.gstatic.com/generate_204
    interval: 300
rules:
  - GEOIP,CN,DIRECT
  - MATCH,节点选择
`;

const emptyForm = {
  name: '',
  description: '',
  yamlContent: sampleYaml,
  isDefault: false,
  status: 'active',
};

function normalizeRows(res) {
  return res?.data?.results || res?.data || [];
}

export function ClashTemplatePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [preview, setPreview] = useState(null);
  const [validation, setValidation] = useState(null);
  const fileRef = useRef(null);

  const stats = useMemo(() => [
    { label: '模板总数', value: rows.length },
    { label: '启用模板', value: rows.filter((item) => item.status === 'active').length, tone: 'success' },
    { label: '默认模板', value: rows.find((item) => item.is_default)?.name || '未设置' },
  ], [rows]);

  async function load() {
    setLoading(true);
    try {
      const res = await clashTemplateApi.list();
      setRows(normalizeRows(res));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setValidation(null);
    setDialogOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      name: row.name || '',
      description: row.description || '',
      yamlContent: row.yaml_content || sampleYaml,
      isDefault: Boolean(row.is_default),
      status: row.status || 'active',
    });
    setValidation(null);
    setDialogOpen(true);
  }

  async function validateCurrent() {
    const res = await clashTemplateApi.validate(form.yamlContent);
    setValidation(res.data);
    toast.success('模板校验通过');
    return true;
  }

  async function previewCurrent(yaml = form.yamlContent) {
    const res = await clashTemplateApi.preview(yaml);
    setPreview(res.data);
  }

  async function submit() {
    if (!form.name.trim()) return toast.warning('请输入模板名称');
    if (!form.yamlContent.trim()) return toast.warning('请输入 YAML 内容');
    await validateCurrent();
    if (editing) {
      await clashTemplateApi.update(editing.id, form);
    } else {
      await clashTemplateApi.create(form);
    }
    toast.success('模板已保存');
    setEditing(null);
    setDialogOpen(false);
    await load();
  }

  async function makeDefault(row) {
    await clashTemplateApi.update(row.id, {
      name: row.name,
      description: row.description || '',
      yamlContent: row.yaml_content,
      isDefault: true,
      status: 'active',
    });
    toast.success('已设为默认模板');
    await load();
  }

  async function remove(row) {
    if (!window.confirm(`确认删除模板「${row.name}」？`)) return;
    await clashTemplateApi.delete(row.id);
    toast.success('模板已删除');
    await load();
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setForm((prev) => ({ ...prev, name: prev.name || file.name.replace(/\.(ya?ml|txt)$/i, ''), yamlContent: text }));
    event.target.value = '';
  }

  const columns = [
    { key: 'name', label: '模板名称', render: (row) => <div className="font-semibold">{row.name}</div> },
    { key: 'description', label: '说明', render: (row) => <span className="text-muted-foreground">{row.description || '-'}</span> },
    { key: 'is_default', label: '默认', render: (row) => (row.is_default ? <Badge variant="success">默认</Badge> : '-') },
    { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === 'active' ? 'success' : 'outline'}>{row.status === 'active' ? '启用' : '停用'}</Badge> },
    { key: 'updated_at', label: '更新时间', render: (row) => formatDate(row.updated_at) },
    {
      key: 'actions',
      label: '操作',
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => previewCurrent(row.yaml_content)}>预览</Button>
          <Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button>
          <Button size="sm" variant="outline" disabled={Boolean(row.is_default)} onClick={() => makeDefault(row)}>设为默认</Button>
          <Button size="sm" variant="destructive" disabled={Boolean(row.is_default)} onClick={() => remove(row)}>删除</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="模板中心"
        title="Clash 模板"
        description="管理订阅生成模板。建议保留一个默认模板，新增模板先校验和预览，再分配给套餐或用户。"
        actions={<><RefreshButton onClick={load} loading={loading} /><Button onClick={openCreate}><FileCode2 data-icon="inline-start" />新增模板</Button></>}
      />
      <StatGrid items={stats} />
      <Card>
        <CardContent className="pt-5">
          <Table columns={columns} rows={rows} empty="暂无模板" />
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setForm(emptyForm);
          }
        }}
        title={editing ? '编辑模板' : '新增模板'}
        className="w-[min(94vw,980px)]"
        footer={<><Button variant="outline" onClick={() => previewCurrent()}>预览渲染</Button><Button onClick={submit}>保存模板</Button></>}
      >
        <div className="grid gap-4 md:grid-cols-[1fr_160px]">
          <Field label="模板名称"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：智能分流模板" /></Field>
          <Field label="状态">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">启用</option>
              <option value="disabled">停用</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 space-y-4">
          <Field label="说明"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="写给管理员看的用途说明" /></Field>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />设为默认模板</label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload data-icon="inline-start" />上传 YAML</Button>
            <Button variant="outline" onClick={() => setForm({ ...form, yamlContent: sampleYaml })}><Wand2 data-icon="inline-start" />填入示例</Button>
            <Button variant="outline" onClick={validateCurrent}>校验</Button>
            <input ref={fileRef} type="file" accept=".yaml,.yml,text/yaml,text/plain" className="hidden" onChange={uploadFile} />
          </div>
          {validation ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{validation.message || '校验通过'}</div> : null}
          <Field label="YAML 内容" hint="策略组里可以使用 __AUTO__ 自动注入最终可分发节点。">
            <Textarea className="min-h-[420px] font-mono text-xs leading-5" value={form.yamlContent} onChange={(e) => setForm({ ...form, yamlContent: e.target.value })} spellCheck={false} />
          </Field>
        </div>
      </Dialog>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)} title="模板预览" className="w-[min(94vw,900px)]">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="pt-5"><div className="text-sm text-muted-foreground">策略组</div><div className="mt-2 text-2xl font-bold">{preview?.summary?.proxyGroupCount ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-5"><div className="text-sm text-muted-foreground">规则数</div><div className="mt-2 text-2xl font-bold">{preview?.summary?.ruleCount ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-5"><div className="text-sm text-muted-foreground">示例节点</div><div className="mt-2 text-2xl font-bold">{preview?.renderedSummary?.proxyCount ?? 0}</div></CardContent></Card>
        </div>
        <div className="mt-4">
          <Field label="渲染后的示例 YAML">
            <Textarea className="min-h-[420px] font-mono text-xs leading-5" value={preview?.yaml || ''} readOnly />
          </Field>
          <div className="mt-3"><CopyButton text={preview?.yaml || ''} label="复制预览 YAML" /></div>
        </div>
      </Dialog>
    </div>
  );
}
