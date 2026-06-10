import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { configApi } from '@/lib/api.js';
import { Badge, Button, Dialog, Field, Input, Select, Table } from '@/components/ui.jsx';
import { getData, PageHeader, RefreshButton, Section } from './common.jsx';

const DEFAULT_NODE_NAMING = {
  mode: 'keep',
  fallbackName: '节点',
  appendNumber: true,
  regionRules: [],
};

export function ConfigPage() {
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({});
  const [domainInput, setDomainInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [ipInput, setIpInput] = useState('');
  const [domainDialogOpen, setDomainDialogOpen] = useState(false);
  const [keywordDialogOpen, setKeywordDialogOpen] = useState(false);
  const [ipDialogOpen, setIpDialogOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setConfig(getData(await configApi.getConfig()) || {});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const cloudsub = config.cloudsub || {};
  const distributionDomains = normalizeDistributionDomains(cloudsub.distributionDomains);
  const keywords = Array.isArray(cloudsub.nodeBlockKeywords) ? cloudsub.nodeBlockKeywords : [];
  const renameRules = Array.isArray(cloudsub.nodeRenameRules) ? cloudsub.nodeRenameRules : [];
  const nodeNaming = normalizeNodeNaming(cloudsub.nodeNaming);
  const adminIpWhitelist = Array.isArray(cloudsub.adminIpWhitelist) ? cloudsub.adminIpWhitelist : [];

  function updateCloudSub(next) {
    setConfig({ ...config, cloudsub: { ...cloudsub, ...next } });
  }

  function updateNodeNaming(next) {
    updateCloudSub({ nodeNaming: { ...nodeNaming, ...next } });
  }

  async function save() {
    await configApi.updateConfig({
      ...config,
      cloudsub: {
        ...cloudsub,
        distributionDomains,
        nodeBlockKeywords: keywords,
        nodeRenameRules: renameRules,
        nodeNaming,
        adminIpWhitelist,
      },
    });
    toast.success('配置已保存，节点池会按新配置自动重建');
    await load();
  }

  async function reset() {
    if (!window.confirm('确认重置通用配置？')) return;
    await configApi.resetConfig();
    toast.success('配置已重置');
    await load();
  }

  function updateSessionTtl(value) {
    const hours = Math.min(Math.max(Number(value) || 12, 1), 168);
    localStorage.setItem('adminSessionTtlHours', String(hours));
    updateCloudSub({ adminSessionTtlHours: hours });
  }

  function addDomain() {
    const domain = normalizeDomain(domainInput);
    if (!domain) return toast.warning('请输入有效域名');
    if (distributionDomains.some((item) => item.domain.toLowerCase() === domain.toLowerCase())) {
      return toast.warning('域名已存在');
    }
    updateCloudSub({
      distributionDomains: [
        ...distributionDomains,
        { domain, isDefault: distributionDomains.length === 0, lastCheck: null },
      ],
    });
    setDomainInput('');
    setDomainDialogOpen(false);
  }

  function removeDomain(index) {
    const next = distributionDomains.filter((_, current) => current !== index);
    if (next.length && !next.some((item) => item.isDefault)) next[0] = { ...next[0], isDefault: true };
    updateCloudSub({ distributionDomains: next });
  }

  function setDefaultDomain(index) {
    updateCloudSub({
      distributionDomains: distributionDomains.map((item, current) => ({ ...item, isDefault: current === index })),
    });
  }

  async function checkDomain(index) {
    const domain = distributionDomains[index]?.domain;
    if (!domain) return;
    const result = getData(await configApi.checkDistributionDomain(domain));
    updateCloudSub({
      distributionDomains: distributionDomains.map((item, current) => current === index ? { ...item, lastCheck: result } : item),
    });
    toast.success(result.ok ? '域名可访问' : '域名不可用');
  }

  function addKeyword() {
    const nextKeyword = keywordInput.trim();
    if (!nextKeyword) return toast.warning('请输入关键词');
    if (keywords.some((item) => item.toLowerCase() === nextKeyword.toLowerCase())) return toast.warning('关键词已存在');
    updateCloudSub({ nodeBlockKeywords: [...keywords, nextKeyword] });
    setKeywordInput('');
    setKeywordDialogOpen(false);
  }

  function removeKeyword(index) {
    updateCloudSub({ nodeBlockKeywords: keywords.filter((_, current) => current !== index) });
  }

  function addIp() {
    const ip = ipInput.trim();
    if (!ip) return toast.warning('请输入 IP');
    if (adminIpWhitelist.includes(ip)) return toast.warning('IP 已存在');
    updateCloudSub({ adminIpWhitelist: [...adminIpWhitelist, ip] });
    setIpInput('');
    setIpDialogOpen(false);
  }

  function removeIp(index) {
    updateCloudSub({ adminIpWhitelist: adminIpWhitelist.filter((_, current) => current !== index) });
  }

  function updateRule(index, key, value) {
    updateCloudSub({
      nodeRenameRules: renameRules.map((rule, current) => current === index ? { ...rule, [key]: value } : rule),
    });
  }

  function removeRule(index) {
    updateCloudSub({ nodeRenameRules: renameRules.filter((_, current) => current !== index) });
  }

  function updateRegionRule(index, key, value) {
    const regionRules = nodeNaming.regionRules.map((rule, current) => current === index ? { ...rule, [key]: value } : rule);
    updateNodeNaming({ regionRules });
  }

  function removeRegionRule(index) {
    updateNodeNaming({ regionRules: nodeNaming.regionRules.filter((_, current) => current !== index) });
  }

  async function downloadExport(url, filename) {
    const response = await fetch(url, { headers: { Authorization: localStorage.getItem('token') || '' } });
    if (!response.ok) return toast.error('导出失败');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <>
      <PageHeader title="通用配置" description="后台所有运营策略都在这里配置，系统会按配置生成节点池和用户订阅。">
        <RefreshButton loading={loading} onClick={load} />
        <Button variant="outline" onClick={reset}>重置配置</Button>
        <Button onClick={save}>保存配置</Button>
      </PageHeader>

      <Section title="分发基础设置" description="设置上游订阅同步频率。">
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="font-semibold">上游同步间隔</div>
            <div className="mt-1 text-sm text-muted-foreground">控制定时拉取上游订阅的频率，默认 6 小时同步一次。</div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <span className="text-sm font-semibold text-muted-foreground">间隔</span>
            <Input className="w-full sm:w-28" type="number" min="1" max="168" value={cloudsub.upstreamRefreshIntervalHours || 6} onChange={(event) => updateCloudSub({ upstreamRefreshIntervalHours: Number(event.target.value) })} />
            <span className="text-sm text-muted-foreground">小时</span>
          </div>
        </div>
      </Section>

      <Section title="分发域名" description="用于生成用户订阅链接。可以添加多个备用域名，并设置其中一个作为默认分发域名。" actions={<Button variant="outline" onClick={() => setDomainDialogOpen(true)}>添加域名</Button>}>
        <Table
          rows={distributionDomains.map((item, index) => ({ ...item, id: index }))}
          columns={[
            { key: 'domain', label: '分发域名', render: (row) => <span className="font-semibold">{row.domain}</span> },
            { key: 'isDefault', label: '默认', render: (row) => row.isDefault ? <Badge variant="success">默认</Badge> : <Badge variant="outline">备用</Badge> },
            { key: 'lastCheck', label: '检测', render: (row) => renderDomainHealth(row.lastCheck) },
            {
              key: 'actions',
              label: '操作',
              render: (row) => (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => checkDomain(row.id)}>检测</Button>
                  <Button size="sm" variant="outline" disabled={row.isDefault} onClick={() => setDefaultDomain(row.id)}>设为默认</Button>
                  <Button size="sm" variant="destructive" onClick={() => removeDomain(row.id)}>删除</Button>
                </div>
              ),
            },
          ]}
          empty="暂无分发域名，未配置时会使用当前访问域名生成订阅链接"
        />
      </Section>

      <Section title="后台安全" description="轻量安全设置。IP 白名单为空时，不限制后台访问来源。" actions={<Button variant="outline" onClick={() => setIpDialogOpen(true)}>添加 IP</Button>}>
        <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
          <div className="rounded-lg border bg-muted/30 p-4">
            <Field label="登录有效期（小时）" hint="浏览器本地登录态过期后，会重新要求输入后台密码。">
              <Input type="number" min="1" max="168" value={cloudsub.adminSessionTtlHours || 12} onChange={(event) => updateSessionTtl(event.target.value)} />
            </Field>
          </div>
          <ChipBox items={adminIpWhitelist} empty="未设置 IP 白名单，当前允许任意来源输入密码访问后台" onRemove={removeIp} removeLabel="删除 IP" />
        </div>
      </Section>

      <Section title="关键词过滤" description="节点名称包含这些关键词时，会进入过滤节点，不会分发给用户。" actions={<Button variant="outline" onClick={() => setKeywordDialogOpen(true)}>添加关键词</Button>}>
        <ChipBox items={keywords} empty="暂无过滤关键词，点击右上角添加" onRemove={removeKeyword} removeLabel="删除关键词" />
      </Section>

      <Section title="节点命名策略" description="系统只按这里的设置处理最终节点名称。关闭自动命名时，代码不会再自行生成香港1、日本1这类名称。">
        <div className="grid gap-4 xl:grid-cols-3">
          <Field label="命名模式" hint="保留原名：不改名；仅替换规则：只执行下方重命名规则；地区自动编号：按地区规则生成香港1、香港2。">
            <Select value={nodeNaming.mode} onChange={(event) => updateNodeNaming({ mode: event.target.value })}>
              <option value="keep">保留原名</option>
              <option value="rules">仅替换规则</option>
              <option value="region_sequence">地区自动编号</option>
            </Select>
          </Field>
          <Field label="未知地区名称" hint="地区自动编号时，未命中任何地区规则的节点会使用这个名称。">
            <Input value={nodeNaming.fallbackName} onChange={(event) => updateNodeNaming({ fallbackName: event.target.value })} />
          </Field>
          <Field label="编号方式" hint="开启后同地区节点显示为香港1、香港2；关闭后同地区会显示同一个名称。">
            <Select value={nodeNaming.appendNumber ? 'yes' : 'no'} onChange={(event) => updateNodeNaming({ appendNumber: event.target.value === 'yes' })}>
              <option value="yes">自动追加数字</option>
              <option value="no">不追加数字</option>
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="地区识别规则" description="命名模式为“地区自动编号”时使用。系统会根据这些关键词识别地区，再生成香港1、日本1这类最终名称。" actions={<Button variant="outline" onClick={() => updateNodeNaming({ regionRules: [...nodeNaming.regionRules, { name: '', keywords: '' }] })}>添加地区</Button>}>
        <Table
          rows={nodeNaming.regionRules.map((rule, index) => ({ ...rule, id: index }))}
          columns={[
            { key: 'name', label: '地区名称', render: (row) => <Input value={row.name} onChange={(event) => updateRegionRule(row.id, 'name', event.target.value)} placeholder="例如：香港" /> },
            { key: 'keywords', label: '匹配关键词', render: (row) => <Input value={keywordText(row.keywords)} onChange={(event) => updateRegionRule(row.id, 'keywords', event.target.value)} placeholder="例如：香港,HK,Hong Kong,hkg" /> },
            { key: 'actions', label: '操作', render: (row) => <Button size="sm" variant="destructive" onClick={() => removeRegionRule(row.id)}>删除</Button> },
          ]}
          empty="暂无地区识别规则。未配置时，地区自动编号不会识别任何地区。"
        />
      </Section>

      <details className="rounded-lg border bg-card shadow-soft">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5">
          <span>
            <span className="block text-lg font-bold">高级清洗规则</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              可选功能。仅当上游节点名称很乱、地区识别不准时使用；通常保持为空即可。
            </span>
          </span>
          <Badge variant={renameRules.length ? 'warning' : 'outline'}>{renameRules.length ? `${renameRules.length} 条` : '未启用'}</Badge>
        </summary>
        <div className="border-t p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-muted-foreground">
              清洗规则会先执行，再进入地区识别规则。可用于删除机场前缀、倍率、符号，或把固定英文名替换成统一名称。
            </p>
            <Button variant="outline" onClick={() => updateCloudSub({ nodeRenameRules: [...renameRules, { match: '', replace: '' }] })}>添加规则</Button>
          </div>
          <Table
            rows={renameRules.map((rule, index) => ({ ...rule, id: index }))}
            columns={[
              { key: 'match', label: '匹配内容', render: (row) => <Input value={row.match} onChange={(event) => updateRule(row.id, 'match', event.target.value)} placeholder="例如：倍率 1x" /> },
              { key: 'replace', label: '替换为', render: (row) => <Input value={row.replace} onChange={(event) => updateRule(row.id, 'replace', event.target.value)} placeholder="留空表示删除匹配内容" /> },
              { key: 'actions', label: '操作', render: (row) => <Button size="sm" variant="destructive" onClick={() => removeRule(row.id)}>删除</Button> },
            ]}
            empty="暂无清洗规则。默认不需要配置。"
          />
        </div>
      </details>

      <Section title="数据导出" description="导出关键运营数据，便于备份、迁移或人工核对。">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => downloadExport(configApi.exportConfigUrl, 'subpoly-config.json')}>导出配置</Button>
          <Button variant="outline" onClick={() => downloadExport(configApi.exportRedeemCodesUrl, 'subpoly-redeem-codes.json')}>导出兑换码</Button>
          <Button variant="outline" onClick={() => downloadExport(configApi.exportSubUsersUrl, 'subpoly-sub-users.json')}>导出订阅用户</Button>
        </div>
      </Section>

      <Dialog open={domainDialogOpen} onOpenChange={(open) => { setDomainDialogOpen(open); if (!open) setDomainInput(''); }} title="添加分发域名" footer={<><Button variant="outline" onClick={() => setDomainDialogOpen(false)}>取消</Button><Button onClick={addDomain}>添加域名</Button></>}>
        <Field label="分发域名" hint="支持 example.com 或 https://sub.example.com，保存时会规范为协议加域名。">
          <Input value={domainInput} onChange={(event) => setDomainInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addDomain(); } }} placeholder="例如：https://sub.example.com" autoFocus />
        </Field>
      </Dialog>

      <Dialog open={keywordDialogOpen} onOpenChange={(open) => { setKeywordDialogOpen(open); if (!open) setKeywordInput(''); }} title="添加过滤关键词" footer={<><Button variant="outline" onClick={() => setKeywordDialogOpen(false)}>取消</Button><Button onClick={addKeyword}>添加关键词</Button></>}>
        <Field label="关键词" hint="例如：剩余流量、到期、官网、防失联。命中节点会进入过滤节点分组。">
          <Input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addKeyword(); } }} placeholder="输入一个过滤关键词" autoFocus />
        </Field>
      </Dialog>

      <Dialog open={ipDialogOpen} onOpenChange={(open) => { setIpDialogOpen(open); if (!open) setIpInput(''); }} title="添加后台 IP 白名单" footer={<><Button variant="outline" onClick={() => setIpDialogOpen(false)}>取消</Button><Button onClick={addIp}>添加 IP</Button></>}>
        <Field label="允许访问后台的 IP" hint="保存后，只有白名单内 IP 能访问后台 API。请确认当前出口 IP 后再启用。">
          <Input value={ipInput} onChange={(event) => setIpInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addIp(); } }} placeholder="例如：203.0.113.10" autoFocus />
        </Field>
      </Dialog>
    </>
  );
}

function ChipBox({ items, empty, onRemove, removeLabel }) {
  return (
    <div className="min-h-24 rounded-lg border bg-card p-4">
      {items.length ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item, index) => (
            <button
              key={`${item}-${index}`}
              type="button"
              className="inline-flex max-w-full items-center gap-2 rounded-md border border-input bg-muted px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              title={`${removeLabel}：${item}`}
              onClick={() => onRemove(index)}
            >
              <span className="truncate">{item}</span>
              <span aria-hidden="true" className="text-base leading-none">×</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex min-h-16 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">{empty}</div>
      )}
    </div>
  );
}

function normalizeDistributionDomains(value) {
  if (!Array.isArray(value)) return [];
  const rows = value
    .map((item) => {
      if (typeof item === 'string') return { domain: normalizeDomain(item), isDefault: false, lastCheck: null };
      return { domain: normalizeDomain(item?.domain), isDefault: Boolean(item?.isDefault), lastCheck: item?.lastCheck || null };
    })
    .filter((item) => item.domain);
  if (rows.length && !rows.some((item) => item.isDefault)) rows[0] = { ...rows[0], isDefault: true };
  return rows;
}

function normalizeDomain(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

function normalizeNodeNaming(value) {
  const nodeNaming = { ...DEFAULT_NODE_NAMING, ...(value || {}) };
  return {
    ...nodeNaming,
    mode: ['keep', 'rules', 'region_sequence'].includes(nodeNaming.mode) ? nodeNaming.mode : 'keep',
    fallbackName: String(nodeNaming.fallbackName || '节点').trim() || '节点',
    appendNumber: nodeNaming.appendNumber !== false,
    regionRules: Array.isArray(nodeNaming.regionRules)
      ? nodeNaming.regionRules.map((rule) => ({
        name: String(rule?.name || '').trim(),
        keywords: keywordText(rule?.keywords),
      }))
      : [],
  };
}

function keywordText(value) {
  if (Array.isArray(value)) return value.join(',');
  return String(value || '');
}

function renderDomainHealth(lastCheck) {
  if (!lastCheck) return <Badge variant="outline">未检测</Badge>;
  if (lastCheck.ok) return <Badge variant="success">{lastCheck.status} / {lastCheck.latencyMs}ms</Badge>;
  return <Badge variant="destructive">不可用</Badge>;
}
