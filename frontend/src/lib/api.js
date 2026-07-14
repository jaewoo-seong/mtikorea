async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  devLoginStatus: () => request('/auth/dev-login/status'),
  devLogin: (email, password) =>
    request('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  bootstrap: () => request('/api/bootstrap'),

  clients: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/clients${q ? `?${q}` : ''}`);
    },
    get: (id) => request(`/api/clients/${id}`),
    create: (body) => request('/api/clients', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) =>
      request(`/api/clients/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    addNote: (id, body) =>
      request(`/api/clients/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),
  },

  emails: {
    status: () => request('/api/emails/status'),
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/emails${q ? `?${q}` : ''}`);
    },
    get: (id) => request(`/api/emails/${id}`),
    sync: (body = {}) =>
      request('/api/emails/sync', { method: 'POST', body: JSON.stringify(body) }),
    compose: (body) =>
      request('/api/emails/compose', { method: 'POST', body: JSON.stringify(body) }),
    reply: (id, body) =>
      request(`/api/emails/${id}/reply`, { method: 'POST', body: JSON.stringify(body) }),
    forward: (id, body) =>
      request(`/api/emails/${id}/forward`, { method: 'POST', body: JSON.stringify(body) }),
    action: (id, action) =>
      request(`/api/emails/${id}/actions`, { method: 'POST', body: JSON.stringify({ action }) }),
    note: (id, note) =>
      request(`/api/emails/${id}/notes`, { method: 'POST', body: JSON.stringify({ note }) }),
    linkClient: (id, clientId) =>
      request(`/api/emails/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ clientId }),
      }),
    organize: (body) =>
      request('/api/emails/organize', { method: 'POST', body: JSON.stringify(body) }),
  },

  projects: {
    list: () => request('/api/projects'),
    get: (id) => request(`/api/projects/${id}`),
    create: (body) => request('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) =>
      request(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    start: (id) => request(`/api/projects/${id}/start`, { method: 'POST', body: '{}' }),
    stop: (id) => request(`/api/projects/${id}/stop`, { method: 'POST', body: '{}' }),
    complete: (id) => request(`/api/projects/${id}/complete`, { method: 'POST', body: '{}' }),
    upload: (id, files) => {
      const fd = new FormData();
      [...files].forEach((f) => fd.append('files', f));
      return request(`/api/projects/${id}/files`, { method: 'POST', body: fd });
    },
  },

  documents: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/documents${q ? `?${q}` : ''}`);
    },
    upload: (file, meta = {}) => {
      const fd = new FormData();
      fd.append('file', file);
      Object.entries(meta).forEach(([k, v]) => v != null && fd.append(k, v));
      return request('/api/documents', { method: 'POST', body: fd });
    },
  },

  tasks: {
    list: () => request('/api/tasks'),
    create: (body) => request('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) =>
      request(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },

  admin: {
    users: () => request('/api/admin/users'),
    updateUser: (id, body) =>
      request(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    invite: (body) =>
      request('/api/admin/users/invite', { method: 'POST', body: JSON.stringify(body) }),
  },
};
