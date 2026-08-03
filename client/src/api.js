const BASE = '/api';

function authHeaders() {
  const token = localStorage.getItem('pmr_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = 'GET', body, auth = false, raw = false } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? authHeaders() : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  if (raw) return res;

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message = (isJson && data && data.error) || 'Request failed';
    throw new Error(message);
  }
  return data;
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me', { auth: true }),

  submitRegistration: (payload) => request('/registrations', { method: 'POST', body: payload }),

  listHouseholds: (params) => request(`/households?${new URLSearchParams(params)}`, { auth: true }),
  getHousehold: (id) => request(`/households/${id}`, { auth: true }),
  createHousehold: (payload) => request('/households', { method: 'POST', body: payload, auth: true }),
  updateHousehold: (id, patch) => request(`/households/${id}`, { method: 'PATCH', body: patch, auth: true }),
  addHouseholdMember: (id, member) => request(`/households/${id}/members`, { method: 'POST', body: member, auth: true }),

  listMembers: (params) => request(`/members?${new URLSearchParams(params)}`, { auth: true }),
  getMember: (id) => request(`/members/${id}`, { auth: true }),
  updateMember: (id, patch) => request(`/members/${id}`, { method: 'PATCH', body: patch, auth: true }),
  deleteMember: (id) => request(`/members/${id}`, { method: 'DELETE', auth: true }),

  listGkks: () => request('/config/gkks', { auth: true }),
  addGkk: (name) => request('/config/gkks', { method: 'POST', body: { name }, auth: true }),
  renameGkk: (name, newName) => request(`/config/gkks/${encodeURIComponent(name)}`, { method: 'PATCH', body: { name: newName }, auth: true }),
  deleteGkk: (name) => request(`/config/gkks/${encodeURIComponent(name)}`, { method: 'DELETE', auth: true }),

  listMinistries: () => request('/config/ministries', { auth: true }),
  addMinistry: (name) => request('/config/ministries', { method: 'POST', body: { name }, auth: true }),
  renameMinistry: (name, newName) => request(`/config/ministries/${encodeURIComponent(name)}`, { method: 'PATCH', body: { name: newName }, auth: true }),
  deleteMinistry: (name) => request(`/config/ministries/${encodeURIComponent(name)}`, { method: 'DELETE', auth: true }),

  listOrganizations: () => request('/config/organizations', { auth: true }),
  addOrganization: (name) => request('/config/organizations', { method: 'POST', body: { name }, auth: true }),
  renameOrganization: (name, newName) => request(`/config/organizations/${encodeURIComponent(name)}`, { method: 'PATCH', body: { name: newName }, auth: true }),
  deleteOrganization: (name) => request(`/config/organizations/${encodeURIComponent(name)}`, { method: 'DELETE', auth: true }),

  getSettings: () => request('/config/settings', { auth: true }),
  updateSettings: (patch) => request('/config/settings', { method: 'PATCH', body: patch, auth: true }),

  dashboardStats: () => request('/dashboard/stats', { auth: true }),

  reportStats: () => request('/reports/stats', { auth: true }),
  bloodReport: (type) => request(`/reports/blood?${new URLSearchParams({ type })}`, { auth: true }),
  reportSources: () => request('/reports/sources', { auth: true }),
  generateReport: (payload) => request('/reports/generate', { method: 'POST', body: payload, auth: true }),

  exportUrl: (name) => `${BASE}/exports/${name}`,
  exportGenerated: async (payload) => {
    const res = await request('/exports/generated.csv', { method: 'POST', body: payload, auth: true, raw: true });
    return res.blob();
  },
};

export function downloadWithAuth(path, filename) {
  fetch(`${BASE}${path}`, { headers: authHeaders() })
    .then((res) => res.blob())
    .then((blob) => triggerDownload(blob, filename));
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
