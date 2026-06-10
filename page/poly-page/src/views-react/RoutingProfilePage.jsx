import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileUp, Plus, Star } from 'lucide-react';
import { routingProfileApi } from '@/lib/api.js';
import { Badge, Button, Dialog, Field, Input, Select, Table, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui.jsx';
import { getData, getList, PageHeader, RefreshButton, Section, StatusBadge } from './common.jsx';

const defaultProxyGroupsYaml = `- name: 节点选择
  type: select
  proxies:
    - 自动选择
    - __AUTO__
    - DIRECT

- name: 自动选择
  type: url-test
  proxies:
    - __AUTO__
  url: https://www.gstatic.com/generate_204
  interval: 300`;

const defaultRulesYaml = `- GEOIP,LAN,DIRECT
- GEOIP,CN,DIRECT
- MATCH,节点选择`;

const defaultRuleProvidersYaml = `category-ads-all:
  type: http
  behavior: domain
  url: https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geosite/category-ads-all.mrs
  path: ./ruleset/category-ads-all.mrs
  interval: 86400
  format: mrs`;

const defaultDnsYaml = `enable: true
ipv6: false
enhanced-mode: fake-ip
fake-ip-range: 198.18.0.1/16
nameserver:
  - https://dns.alidns.com/dns-query
  - https://doh.pub/dns-query`;

const emptyForm = {
  name: '',
  description: '',
  sourceType: 'custom',
  status: 'active',
  isDefault: false,
  allowUserSelect: true,
  proxyGroupsYaml: defaultProxyGroupsYaml,
  ruleProvidersYaml: '',
  rulesYaml: defaultRulesYaml,
  dnsYaml: '',
};

function yamlScalar(value) {
  if (value === null || value === undefined) return "''";
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = String(value);
  if (!text || /[:#{}\[\],&*?|\-<>=!%@`]/.test(text) || /^\s|\s$/.test(text)) {
    return JSON.stringify(text);
  }
  return text;
}

function toYaml(value, level = 0) {
  const indent = '  '.repeat(level);
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === 'object') {
        const entries = Object.entries(item);
        if (!entries.length) return `${indent}- {}`;
        return entries.map(([key, val], index) => {
          const prefix = index === 0 ? `${indent}- ` : `${indent}  `;
          if (Array.isArray(val) || (val && typeof val === 'object')) {
            return `${prefix}${key}:\n${toYaml(val, level + 2)}`;
          }
          return `${prefix}${key}: ${yamlScalar(val)}`;
        }).join('\n');
      }
      return `${indent}- ${yamlScalar(item)}`;
    }).join('\n');
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, val]) => {
      if (Array.isArray(val) || (val && typeof val === 'object')) {
        return `${indent}${key}:\n${toYaml(val, level + 1)}`;
      }
      return `${indent}${key}: ${yamlScalar(val)}`;
    }).join('\n');
  }
  return `${indent}${yamlScalar(value)}`;
}

function contentToSections(content = {}) {
  return {
    proxyGroupsYaml: toYaml(content.proxyGroups || content['proxy-groups'] || []),
    ruleProvidersYaml: toYaml(content.ruleProviders || content['rule-providers'] || {}),
    rulesYaml: toYaml(content.rules || []),
    dnsYaml: content.dns ? toYaml(content.dns) : '',
  };
}

function indentBlock(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line ? `  ${line}` : line)
    .join('\n');
}

function composeYaml(form) {
  const parts = [];
  if (form.proxyGroupsYaml.trim()) parts.push(`proxy-groups:\n${indentBlock(form.proxyGroupsYaml.trim())}`);
  if (form.ruleProvidersYaml.trim()) parts.push(`rule-providers:\n${indentBlock(form.ruleProvidersYaml.trim())}`);
  if (form.rulesYaml.trim()) parts.push(`rules:\n${indentBlock(form.rulesYaml.trim())}`);
  if (form.dnsYaml.trim()) parts.push(`dns:\n${indentBlock(form.dnsYaml.trim())}`);
  return `${parts.join('\n\n')}\n`;
}

function summaryOf(profile) {
  const summary = profile.summary || {};
  return `${summary.groupCount || 0} 个策略组 / ${summary.ruleCount || 0} 条规则 / ${summary.ruleProviderCount || 0} 个规则集`;
}

function QuickStat({ label, value }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-soft">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 truncate text-2xl font-bold">{value}</div>
    </div>
  );
}

function EditorBlock({ label, hint, value, rows = 8, onChange, onExample }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <Button type="button" variant="outline" size="sm" onClick={onExample}>示例</Button>
      </div>
      {hint ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{hint}</div> : null}
      <Textarea
        className="min-h-40 font-mono text-xs leading-5"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function RoutingProfilePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [preview, setPreview] = useState(null);
  const [importUrl, setImportUrl] = useState('');
  const [activeEditorTab, setActiveEditorTab] = useState('content');

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((row) => row.status === 'active').length,
    selectable: rows.filter((row) => row.allowUserSelect || row.allow_user_select).length,
    defaultName: rows.find((row) => row.isDefault || row.is_default)?.name || '-',
  }), [rows]);

  async function load() {
    setLoading(true);
    try {
      const response = await routingProfileApi.list({ hydrate: 1 });
      setRows(getList(response));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function resetEditor(next = {}) {
    setEditingId(null);
    setPreview(null);
    setImportUrl('');
    setActiveEditorTab('content');
    setForm({ ...emptyForm, ...next });
    setDialog(true);
  }

  function edit(row) {
    const sections = contentToSections(row.content || {});
    setEditingId(row.id);
    setPreview(row.summary ? { summary: row.summary, content: row.content, rawContent: row.rawContent } : null);
    setImportUrl('');
    setActiveEditorTab('content');
    setForm({
      ...emptyForm,
      ...sections,
      name: row.name || '',
      description: row.description || '',
      sourceType: row.source_type || row.sourceType || 'custom',
      status: row.status || 'active',
      isDefault: Boolean(row.isDefault || row.is_default),
      allowUserSelect: row.allowUserSelect ?? Boolean(row.allow_user_select),
    });
    setDialog(true);
  }

  async function applyParsedContent(data, fallbackName = '') {
    const sections = contentToSections(data.content || {});
    setPreview(data);
    setForm((prev) => ({
      ...prev,
      ...sections,
      sourceType: prev.sourceType || 'custom',
      name: prev.name || fallbackName,
    }));
    setActiveEditorTab('content');
  }

  async function previewContent() {
    const response = await routingProfileApi.importPreview({
      rawContent: composeYaml(form),
      sourceType: form.sourceType,
    });
    const data = getData(response);
    setPreview(data);
    toast.success('YAML 解析成功');
  }

  async function previewUrl() {
    if (!importUrl.trim()) return toast.warning('请输入 YAML 配置地址');
    const response = await routingProfileApi.importUrlPreview({ url: importUrl.trim() });
    const data = getData(response);
    await applyParsedContent(data, '导入分流方案');
    setForm((prev) => ({ ...prev, sourceType: 'url' }));
    toast.success('已从 URL 拉取并解析 YAML');
  }

  async function readUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const response = await routingProfileApi.importPreview({ rawContent: text, sourceType: 'upload' });
    const data = getData(response);
    await applyParsedContent(data, file.name.replace(/\.[^.]+$/, ''));
    setForm((prev) => ({ ...prev, sourceType: 'upload' }));
    toast.success('YAML 文件已读取并解析');
    event.target.value = '';
  }

  async function submit() {
    if (!form.name.trim()) return toast.warning('请输入规则名称');
    const rawContent = composeYaml(form);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      sourceType: form.sourceType,
      status: form.status,
      isDefault: form.isDefault,
      allowUserSelect: form.allowUserSelect,
      clientSupport: ['clash'],
      rawContent,
    };
    if (editingId) await routingProfileApi.update(editingId, payload);
    else await routingProfileApi.create(payload);
    toast.success('规则已保存');
    setDialog(false);
    await load();
  }

  async function toggleDefault(row) {
    await routingProfileApi.update(row.id, { isDefault: true });
    toast.success('默认规则已切换');
    await load();
  }

  async function toggleSelectable(row) {
    await routingProfileApi.update(row.id, { allowUserSelect: !(row.allowUserSelect ?? row.allow_user_select) });
    await load();
  }

  async function remove(row) {
    if (!window.confirm(`确认删除规则「${row.name}」？`)) return;
    await routingProfileApi.delete(row.id);
    toast.success('已删除');
    await load();
  }

  function fillExample(type) {
    if (type === 'proxyGroups') setForm((prev) => ({ ...prev, proxyGroupsYaml: defaultProxyGroupsYaml }));
    if (type === 'ruleProviders') setForm((prev) => ({ ...prev, ruleProvidersYaml: defaultRuleProvidersYaml }));
    if (type === 'rules') setForm((prev) => ({ ...prev, rulesYaml: defaultRulesYaml }));
    if (type === 'dns') setForm((prev) => ({ ...prev, dnsYaml: defaultDnsYaml }));
  }

  const columns = [
    {
      key: 'name',
      label: '规则名称',
      className: 'w-44 min-w-44',
      cellClassName: 'whitespace-nowrap',
      render: (row) => <div className="max-w-40 truncate font-semibold" title={row.name}>{row.name}</div>,
    },
    {
      key: 'description',
      label: '说明',
      className: 'min-w-[360px]',
      render: (row) => <div className="max-w-[520px] truncate text-muted-foreground" title={row.description || ''}>{row.description || '-'}</div>,
    },
    {
      key: 'default',
      label: '默认',
      className: 'w-28 min-w-28',
      cellClassName: 'whitespace-nowrap',
      render: (row) => (row.isDefault || row.is_default) ? <Badge variant="success">默认</Badge> : <Button variant="outline" size="sm" onClick={() => toggleDefault(row)}>设为默认</Button>,
    },
    {
      key: 'status',
      label: '状态',
      className: 'w-24 min-w-24',
      cellClassName: 'whitespace-nowrap',
      render: (row) => <StatusBadge value={row.status === 'active' ? '启用' : '停用'} />,
    },
    {
      key: 'support',
      label: '客户端',
      className: 'w-36 min-w-36',
      cellClassName: 'whitespace-nowrap',
      render: () => <Badge variant="outline" className="whitespace-nowrap">Clash / Mihomo</Badge>,
    },
    {
      key: 'summary',
      label: '内容',
      className: 'w-56 min-w-56',
      cellClassName: 'whitespace-nowrap',
      render: (row) => <span className="text-muted-foreground">{summaryOf(row)}</span>,
    },
    {
      key: 'actions',
      label: '操作',
      className: 'w-60 min-w-60',
      cellClassName: 'whitespace-nowrap',
      render: (row) => (
        <div className="flex flex-nowrap gap-2">
          <Button variant="outline" size="sm" onClick={() => edit(row)}>编辑</Button>
          <Button variant="outline" size="sm" onClick={() => toggleSelectable(row)}>
            {(row.allowUserSelect ?? row.allow_user_select) ? '用户可选' : '用户隐藏'}
          </Button>
          <Button variant="destructive" size="sm" disabled={row.isDefault || row.is_default} onClick={() => remove(row)}>删除</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="分发配置"
        title="分流规则"
        description="所有分流规则统一使用 YAML 内容编辑和保存。这里只维护策略组、规则集、规则和 DNS，上游节点不会被导入为用户节点。"
        actions={<><RefreshButton loading={loading} onClick={load} /><Button onClick={() => resetEditor()}><Plus data-icon="inline-start" />新增规则</Button></>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <QuickStat label="规则总数" value={stats.total} />
        <QuickStat label="启用规则" value={stats.active} />
        <QuickStat label="用户可选" value={stats.selectable} />
        <QuickStat label="默认规则" value={stats.defaultName} />
      </div>

      <Section
        title="规则列表"
        description="套餐、订阅用户和用户中心都会引用这里的分流方案。"
        actions={<Button variant="outline" onClick={() => resetEditor({ name: '新的分流规则' })}><Plus data-icon="inline-start" />添加方案</Button>}
      >
        <Table columns={columns} rows={rows} empty="暂无分流规则" tableClassName="min-w-[1180px] table-fixed" />
      </Section>

      <Dialog
        open={dialog}
        onOpenChange={setDialog}
        title={editingId ? '编辑规则' : '新增规则'}
        className="w-[min(94vw,980px)]"
        footer={<><Button variant="outline" onClick={() => setDialog(false)}>取消</Button><Button onClick={submit}>保存规则</Button></>}
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="规则名称 *">
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：AI + 流媒体分流" />
            </Field>
            <Field label="状态">
              <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="active">启用</option>
                <option value="disabled">停用</option>
              </Select>
            </Field>
          </div>
          <Field label="描述">
            <Textarea className="min-h-20" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="说明这个规则适合什么用户或场景" />
          </Field>

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="mb-3 text-sm font-semibold">支持客户端</div>
            <label className="inline-flex items-center gap-2 rounded-md border bg-card px-4 py-3 text-sm font-semibold">
              <input type="checkbox" checked readOnly />
              Clash / Mihomo
            </label>
            <p className="mt-2 text-xs text-muted-foreground">当前系统统一输出 YAML 订阅配置，其他客户端入口会复用 YAML 文件内容。</p>
          </div>

          <Tabs value={activeEditorTab} onValueChange={setActiveEditorTab}>
            <TabsList>
              <TabsTrigger value="content">规则内容</TabsTrigger>
              <TabsTrigger value="import">导入方案</TabsTrigger>
              <TabsTrigger value="preview">解析结果</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="space-y-5">
              <EditorBlock
                label="proxy-groups (YAML 格式，可选)"
                hint="注意每行开头的空格数量需与示例保持一致。可使用 __AUTO__ 代表当前可分发节点。"
                value={form.proxyGroupsYaml}
                rows={10}
                onChange={(value) => setForm({ ...form, proxyGroupsYaml: value })}
                onExample={() => fillExample('proxyGroups')}
              />
              <EditorBlock
                label="rule-providers (规则集，YAML 格式，可选)"
                hint="这里配置 RULE-SET 使用的规则集来源。系统不会再从代码里自动补齐，最终以这里保存的内容为准。"
                value={form.ruleProvidersYaml}
                rows={8}
                onChange={(value) => setForm({ ...form, ruleProvidersYaml: value })}
                onExample={() => fillExample('ruleProviders')}
              />
              <EditorBlock
                label="rules (每行一条，可选)"
                value={form.rulesYaml}
                rows={8}
                onChange={(value) => setForm({ ...form, rulesYaml: value })}
                onExample={() => fillExample('rules')}
              />
              <EditorBlock
                label="dns (YAML 格式，可选)"
                value={form.dnsYaml}
                rows={8}
                onChange={(value) => setForm({ ...form, dnsYaml: value })}
                onExample={() => fillExample('dns')}
              />
              <div className="flex justify-end">
                <Button variant="outline" onClick={previewContent}>解析当前 YAML</Button>
              </div>
            </TabsContent>

            <TabsContent value="import" className="space-y-4">
              <div className="rounded-lg border p-4">
                <div className="mb-3 font-semibold">上传 YAML 文件</div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-card px-4 py-2 text-sm font-semibold hover:bg-accent">
                  <FileUp data-icon="inline-start" />
                  选择 YAML 文件
                  <input className="hidden" type="file" accept=".yaml,.yml,.txt" onChange={readUpload} />
                </label>
              </div>
              <div className="rounded-lg border p-4">
                <div className="mb-3 font-semibold">从 URL 导入</div>
                <div className="flex flex-col gap-2 md:flex-row">
                  <Input value={importUrl} onChange={(event) => setImportUrl(event.target.value)} placeholder="https://example.com/rules.yaml" />
                  <Button onClick={previewUrl}><Download data-icon="inline-start" />拉取解析</Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="preview">
              {preview ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <QuickStat label="策略组" value={preview.summary?.groupCount || 0} />
                    <QuickStat label="规则" value={preview.summary?.ruleCount || 0} />
                    <QuickStat label="规则集" value={preview.summary?.ruleProviderCount || 0} />
                    <QuickStat label="DNS" value={preview.summary?.hasDns ? '已配置' : '未配置'} />
                  </div>
                  <Textarea className="min-h-80 font-mono text-xs leading-5" readOnly value={preview.rawContent || composeYaml(form)} />
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">尚未解析，保存前可以先点击“解析当前 YAML”。</div>
              )}
            </TabsContent>
          </Tabs>

          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />
            设为默认规则
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={form.allowUserSelect} onChange={(event) => setForm({ ...form, allowUserSelect: event.target.checked })} />
            允许用户中心选择
          </label>
        </div>
      </Dialog>
    </div>
  );
}
