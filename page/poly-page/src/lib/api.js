import axios from 'axios';
import { toast } from 'sonner';
import { adminRequestCache } from './requestCache.js';

let tokenPromise = null;
let tokenRespPromise = null;

function askForToken(message = '请输入后台访问密码') {
  const value = window.prompt(message);
  if (!value) {
    throw new Error('需要后台访问密码');
  }
  localStorage.setItem('token', value);
  const ttlHours = Number(localStorage.getItem('adminSessionTtlHours') || 12);
  localStorage.setItem('tokenExpiresAt', String(Date.now() + Math.max(ttlHours, 1) * 3600000));
  return value;
}

const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '',
  timeout: 20000,
});

const publicService = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '',
  timeout: 20000,
});

function cacheKey(url, config = {}) {
  const params = config.params ? JSON.stringify(config.params) : '';
  return `${url}?${params}`;
}

function cachedAdminGet(url, config = {}) {
  const { force, ttl, ...axiosConfig } = config;
  return adminRequestCache.get(
    cacheKey(url, axiosConfig),
    () => service.get(url, axiosConfig),
    { force, ttl },
  );
}

function invalidateAdminCache(prefix) {
  adminRequestCache.invalidate(prefix);
}

service.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('token');
  const expiresAt = Number(localStorage.getItem('tokenExpiresAt') || 0);
  if (token && (!expiresAt || expiresAt > Date.now())) {
    config.headers.Authorization = token;
    return config;
  }
  localStorage.removeItem('token');
  localStorage.removeItem('tokenExpiresAt');

  if (!tokenPromise) {
    tokenPromise = Promise.resolve().then(() => askForToken()).finally(() => {
      tokenPromise = null;
    });
  }
  config.headers.Authorization = await tokenPromise;
  return config;
});

service.interceptors.response.use(
  async (response) => {
    if (response.data?.code === 401) {
      if (!tokenRespPromise) {
        tokenRespPromise = Promise.resolve().then(() => askForToken('访问密码无效，请重新输入')).finally(() => {
          tokenRespPromise = null;
        });
      }
      const token = await tokenRespPromise;
      response.config.headers.Authorization = token;
      return service(response.config).then((res) => res);
    }
    const method = String(response.config?.method || '').toUpperCase();
    const url = String(response.config?.url || '');
    if (url.startsWith('/api/admin/') && ['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) {
      invalidateAdminCache('/api/admin/');
    }
    return response.data;
  },
  (error) => {
    const message = error.response?.data?.message || error.message || '请求失败';
    toast.error(message);
    return Promise.reject(error);
  },
);

publicService.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.message || error.message || '请求失败';
    toast.error(message);
    return Promise.reject(error);
  },
);

export const airportApi = {
  getAirports: (config = {}) => cachedAdminGet('/api/admin/airports/all', config),
  getAirport: (id, config = {}) => cachedAdminGet(`/api/admin/airports/single?id=${id}`, config),
  createAirport: (data) => service.post('/api/admin/airports/add', data),
  updateAirport: (data) => service.post('/api/admin/airports/update', data),
  deleteAirport: (id) => service.get(`/api/admin/airports/del?id=${id}`),
  checkAirport: (id) => service.get(`/api/admin/airports/check?id=${id}`).finally(() => invalidateAdminCache('/api/admin/airports')),
  checkAllAirports: () => service.get('/api/admin/airports/checkAll').finally(() => invalidateAdminCache('/api/admin/airports')),
  getAirportNodes: (id, config = {}) => cachedAdminGet(`/api/admin/airports/nodes?id=${id}`, config),
};

export const ruleApi = {
  getRules: (config = {}) => cachedAdminGet('/api/admin/rules/all', config),
  getRulesByType: (type, config = {}) => cachedAdminGet(`/api/admin/rules/type?type=${type}`, config),
  getRulesPage: (type, pageNum, pageSize, keyWord = '', config = {}) => cachedAdminGet(`/api/admin/rules/page?type=${type}&pageNum=${pageNum}&pageSize=${pageSize}&keyWord=${encodeURIComponent(keyWord)}`, config),
  getRuleById: (id, config = {}) => cachedAdminGet(`/api/admin/rules/single?id=${id}`, config),
  createRule: (data) => service.post('/api/admin/rules/add', data),
  updateRule: (data) => service.post('/api/admin/rules/update', data),
  deleteRule: (id) => service.get(`/api/admin/rules/del?id=${id}`),
  deleteAll: () => service.get('/api/admin/rules/deleteAll'),
  importRules: (data) => service.post('/api/admin/rules/import', data),
};

export const groupApi = {
  getAllGroups: (config = {}) => cachedAdminGet('/api/admin/groups/all', config),
  getGroupType: (type, config = {}) => cachedAdminGet(`/api/admin/groups/type?type=${type}`, config),
  getGroupSingle: (id, config = {}) => cachedAdminGet(`/api/admin/groups/single?id=${id}`, config),
  createGroup: (data) => service.post('/api/admin/groups/add', data),
  updateGroup: (data) => service.post('/api/admin/groups/update', data),
  deleteGroup: (id) => service.get(`/api/admin/groups/del?id=${id}`),
};

export const subApi = {
  getSub: (config = {}) => cachedAdminGet('/api/admin/subscription/source', config),
  generateSub: () => service.get('/api/admin/subscription/generate'),
};

export const configApi = {
  getConfig: (config = {}) => cachedAdminGet('/api/admin/config', config),
  resetConfig: () => service.get('/api/admin/config/reset'),
  updateConfig: (data) => service.post('/api/admin/config/update', data),
  checkDistributionDomain: (domain) => service.post('/api/admin/distribution-domains/check', { domain }),
  exportConfigUrl: '/api/admin/export/config',
  exportRedeemCodesUrl: '/api/admin/export/redeem-codes',
  exportSubUsersUrl: '/api/admin/export/sub-users',
  exportOperationLogsUrl: '/api/admin/export/operation-logs',
};

export const userApi = {
  reset: (data) => service.post('/api/admin/user/reset-token', data),
};

export const selfNodeApi = {
  getAllNodes: (config = {}) => cachedAdminGet('/api/admin/self-nodes/all', config),
  getNodeSingle: (id, config = {}) => cachedAdminGet(`/api/admin/self-nodes/single?id=${id}`, config),
  createNode: (data) => service.post('/api/admin/self-nodes/add', data),
  updateNode: (data) => service.post('/api/admin/self-nodes/update', data),
  deleteNode: (id) => service.get(`/api/admin/self-nodes/del?id=${id}`),
};

export const portalApi = {
  redeem: (data) => publicService.post('/api/portal/redeem', data),
  renew: (data) => publicService.post('/api/portal/renew', data),
  lookup: (data) => publicService.post('/api/portal/lookup', data),
  routingProfiles: () => publicService.get('/api/portal/routing-profiles'),
  updateRoutingProfile: (data) => publicService.post('/api/portal/routing-profile', data),
};

export const planApi = {
  list: (config = {}) => cachedAdminGet('/api/admin/plans', config),
  listActive: (config = {}) => cachedAdminGet('/api/admin/plans/active', config),
  create: (data) => service.post('/api/admin/plans', data),
  update: (id, data) => service.patch(`/api/admin/plans/${id}`, data),
  delete: (id) => service.delete(`/api/admin/plans/${id}`),
};

export const clashTemplateApi = {
  list: (config = {}) => cachedAdminGet('/api/admin/clash-templates', config),
  listActive: (config = {}) => cachedAdminGet('/api/admin/clash-templates/active', config),
  validate: (yamlContent) => service.post('/api/admin/clash-templates/validate', { yamlContent }),
  preview: (yamlContent) => service.post('/api/admin/clash-templates/preview', { yamlContent }),
  create: (data) => service.post('/api/admin/clash-templates', data),
  update: (id, data) => service.patch(`/api/admin/clash-templates/${id}`, data),
  delete: (id) => service.delete(`/api/admin/clash-templates/${id}`),
};

export const routingProfileApi = {
  list: (params = {}, config = {}) => cachedAdminGet('/api/admin/routing-profiles', { ...config, params }),
  listSelectable: (config = {}) => cachedAdminGet('/api/admin/routing-profiles/selectable', config),
  importPreview: (data) => service.post('/api/admin/routing-profiles/import-preview', data),
  importUrlPreview: (data) => service.post('/api/admin/routing-profiles/import-url-preview', data),
  create: (data) => service.post('/api/admin/routing-profiles', data),
  update: (id, data) => service.patch(`/api/admin/routing-profiles/${id}`, data),
  delete: (id) => service.delete(`/api/admin/routing-profiles/${id}`),
};

export const redeemCodeApi = {
  list: (config = {}) => cachedAdminGet('/api/admin/redeem-codes', config),
  create: (data) => service.post('/api/admin/redeem-codes', data),
  batch: (data) => service.post('/api/admin/redeem-codes/batch', data),
  batchStatus: (ids, status) => service.post('/api/admin/redeem-codes/batch-status', { ids, status }),
  updateStatus: (id, status) => service.patch(`/api/admin/redeem-codes/${id}`, { status }),
  delete: (id) => service.delete(`/api/admin/redeem-codes/${id}`),
};

export const subUserApi = {
  list: (config = {}) => cachedAdminGet('/api/admin/sub-users', config),
  update: (id, data) => service.patch(`/api/admin/sub-users/${id}`, data),
  resetToken: (id) => service.post(`/api/admin/sub-users/${id}/reset-token`),
  batchStatus: (ids, status) => service.post('/api/admin/sub-users/batch-status', { ids, status }),
  batchRenew: (ids, days) => service.post('/api/admin/sub-users/batch-renew', { ids, days }),
  batchDelete: (ids) => service.post('/api/admin/sub-users/batch-delete', { ids }),
};

export const dashboardApi = {
  overview: (config = {}) => cachedAdminGet('/api/admin/dashboard', config),
};

export const subscriptionAccessLogApi = {
  list: (params = {}, config = {}) => cachedAdminGet('/api/admin/subscription-logs', { ...config, params }),
  stats: (config = {}) => cachedAdminGet('/api/admin/subscription-logs/stats', config),
  cleanup: (days = 30) => service.delete('/api/admin/subscription-logs', { params: { days } }),
};

export const operationLogApi = {
  list: (params = {}, config = {}) => cachedAdminGet('/api/admin/operation-logs', { ...config, params }),
  clear: () => service.delete('/api/admin/operation-logs'),
};

export const upstreamSyncApi = {
  status: (config = {}) => cachedAdminGet('/api/admin/upstream-sync/status', config),
  run: (data = {}) => service.post('/api/admin/upstream-sync/run', data).finally(() => invalidateAdminCache('/api/admin/upstream-sync')),
  clearHistory: () => service.delete('/api/admin/upstream-sync/history').finally(() => invalidateAdminCache('/api/admin/upstream-sync')),
};

export const nodePoolApi = {
  status: (config = {}) => cachedAdminGet('/api/admin/node-pool/status', config),
  rebuild: () => service.post('/api/admin/node-pool/rebuild').finally(() => invalidateAdminCache('/api/admin/node-pool')),
  clearHistory: () => service.delete('/api/admin/node-pool/history').finally(() => invalidateAdminCache('/api/admin/node-pool')),
};

export default service;
