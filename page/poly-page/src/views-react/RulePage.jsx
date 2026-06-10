import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { groupApi, ruleApi } from '@/lib/api.js';
import { Button, Dialog, Field, Input, Select, Table, Textarea } from '@/components/ui.jsx';
import { getList, PageHeader, RefreshButton, Section } from './common.jsx';

const ruleTypes = ['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'IP-CIDR', 'GEOIP', 'MATCH'];
const emptyForm = { ruleType: 'DOMAIN-SUFFIX', ruleParam: '', ruleConfig: '', resolveDns: '0' };

export function RulePage() {
  const [rows, setRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [importContent, setImportContent] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [ruleRes, groupRes] = await Promise.all([ruleApi.getRules(), groupApi.getAllGroups()]);
      setRows(getList(ruleRes));
      setGroups(getList(groupRes));
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
    setForm({ ...emptyForm, ...row, resolveDns: String(row.resolveDns ?? '0') });
    setDialog(true);
  }

  async function submit() {
    if (form.ruleType !== 'MATCH' && !form.ruleParam) return toast.warning('请输入规则参数');
    const payload = { ...form, id: editingId };
    if (payload.ruleType === 'MATCH') payload.ruleParam = null;
    if (editingId) await ruleApi.updateRule(payload);
    else await ruleApi.createRule(payload);
    toast.success('保存成功');
    setDialog(false);
    await load();
  }

  async function remove(row) {
    if (!window.confirm('确认删除该规则？')) return;
    await ruleApi.deleteRule(row.id);
    toast.success('已删除');
    await load();
  }

  async function importRules() {
    if (!importContent.trim()) return toast.warning('请输入规则内容');
    await ruleApi.importRules({ content: importContent });
    toast.success('导入完成');
    setImportDialog(false);
    await load();
  }

  return (
    <>
      <PageHeader title="分流规则" description="规则决定哪些流量走代理、直连或指定策略组。新手可以先使用默认规则。">
        <RefreshButton loading={loading} onClick={load} />
        <Button variant="outline" onClick={() => setImportDialog(true)}>导入规则</Button>
        <Button onClick={openCreate}>添加规则</Button>
      </PageHeader>
      <Section title="规则列表" description="越靠前越优先；MATCH 通常放在最后。">
        <Table
          rows={rows}
          columns={[
            { key: 'id', label: 'ID' },
            { key: 'ruleType', label: '规则类型' },
            { key: 'ruleParam', label: '规则参数', render: (row) => row.ruleParam || '-' },
            { key: 'ruleConfig', label: '策略' },
            { key: 'resolveDns', label: '解析 DNS', render: (row) => row.resolveDns === '1' ? '是' : '否' },
            { key: 'actions', label: '操作', render: (row) => (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button>
                <Button size="sm" variant="destructive" onClick={() => remove(row)}>删除</Button>
              </div>
            ) },
          ]}
        />
      </Section>
      <Dialog open={dialog} onOpenChange={setDialog} title={editingId ? '编辑规则' : '添加规则'} footer={<><Button variant="outline" onClick={() => setDialog(false)}>取消</Button><Button onClick={submit}>保存</Button></>}>
        <div className="grid gap-4">
          <Field label="规则类型"><Select value={form.ruleType} onChange={(e) => setForm({ ...form, ruleType: e.target.value })}>{ruleTypes.map((type) => <option key={type} value={type}>{type}</option>)}</Select></Field>
          {form.ruleType !== 'MATCH' ? <Field label="规则参数"><Input value={form.ruleParam || ''} onChange={(e) => setForm({ ...form, ruleParam: e.target.value })} placeholder="例如 google.com 或 1.1.1.1/32" /></Field> : null}
          <Field label="策略组"><Select value={form.ruleConfig || ''} onChange={(e) => setForm({ ...form, ruleConfig: e.target.value })}><option value="">请选择</option>{groups.map((group) => <option key={group.id} value={group.groupName}>{group.groupName}</option>)}</Select></Field>
          <Field label="解析 DNS"><Select value={form.resolveDns || '0'} onChange={(e) => setForm({ ...form, resolveDns: e.target.value })}><option value="0">否</option><option value="1">是</option></Select></Field>
        </div>
      </Dialog>
      <Dialog open={importDialog} onOpenChange={setImportDialog} title="导入规则" footer={<><Button variant="outline" onClick={() => setImportDialog(false)}>取消</Button><Button onClick={importRules}>导入</Button></>}>
        <Field label="规则内容" hint="每行一条 Clash 规则。"><Textarea rows={10} value={importContent} onChange={(e) => setImportContent(e.target.value)} /></Field>
      </Dialog>
    </>
  );
}
