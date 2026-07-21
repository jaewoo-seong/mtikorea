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
    // Session expired / not authenticated mid-session: let the app bounce to login.
    // Skip the auth probe/login endpoints themselves so we don't loop on the login screen.
    if (res.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
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
  devBypass: () => request('/auth/dev-bypass', { method: 'POST' }),
  login: (username, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
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
    cleanPrompt: (rawText) =>
      request('/api/projects/clean-prompt', { method: 'POST', body: JSON.stringify({ rawText }) }),
    update: (id, body) =>
      request(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    start: (id) => request(`/api/projects/${id}/start`, { method: 'POST', body: '{}' }),
    stop: (id) => request(`/api/projects/${id}/stop`, { method: 'POST', body: '{}' }),
    complete: (id) => request(`/api/projects/${id}/complete`, { method: 'POST', body: '{}' }),
    delete: (id) => request(`/api/projects/${id}`, { method: 'DELETE' }),
    sendMessage: (id, content) =>
      request(`/api/projects/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),
    upload: (id, files) => {
      const fd = new FormData();
      [...files].forEach((f) => fd.append('files', f));
      return request(`/api/projects/${id}/files`, { method: 'POST', body: fd });
    },
    approveAllStaged: (id) =>
      request(`/api/projects/${id}/staged/approve-all`, { method: 'POST', body: '{}' }),
    rejectAllStaged: (id) =>
      request(`/api/projects/${id}/staged/reject-all`, { method: 'POST', body: '{}' }),
  },

  documents: {
    list: (params = {}) => {
      const q = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
      ).toString();
      return request(`/api/documents${q ? `?${q}` : ''}`);
    },
    upload: (file, meta = {}) => {
      const fd = new FormData();
      fd.append('file', file);
      Object.entries(meta).forEach(([k, v]) => v != null && v !== '' && fd.append(k, v));
      return request('/api/documents', { method: 'POST', body: fd });
    },
    update: (id, body) =>
      request(`/api/documents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    approve: (id) => request(`/api/documents/${id}/approve`, { method: 'POST', body: '{}' }),
    reject: (id) => request(`/api/documents/${id}/reject`, { method: 'POST', body: '{}' }),
    compose: (body) => request('/api/documents/compose', { method: 'POST', body: JSON.stringify(body) }),
    storageUsage: () => request('/api/documents/storage-usage'),
  },

  documentFolders: {
    list: () => request('/api/document-folders'),
    create: (body) => request('/api/document-folders', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) =>
      request(`/api/document-folders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => request(`/api/document-folders/${id}`, { method: 'DELETE' }),
  },

  users: {
    list: () => request('/api/users'),
  },

  tasks: {
    list: (params = {}) => {
      const q = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
      ).toString();
      return request(`/api/tasks${q ? `?${q}` : ''}`);
    },
    create: (body) => request('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) =>
      request(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
    approve: (id) => request(`/api/tasks/${id}/approve`, { method: 'POST', body: '{}' }),
    reject: (id, note) =>
      request(`/api/tasks/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
    unread: () => request('/api/tasks/unread'),
    comments: {
      list: (taskId) => request(`/api/tasks/${taskId}/comments`),
      add: (taskId, body) =>
        request(`/api/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
    },
  },

  admin: {
    users: () => request('/api/admin/users'),
    updateUser: (id, body) =>
      request(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    createAccount: (body) =>
      request('/api/admin/users', { method: 'POST', body: JSON.stringify(body) }),
    llmKeys: {
      list: () => request('/api/admin/llm-keys'),
      create: (body) => request('/api/admin/llm-keys', { method: 'POST', body: JSON.stringify(body) }),
      update: (id, body) =>
        request(`/api/admin/llm-keys/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
      test: (id) => request(`/api/admin/llm-keys/${id}/test`, { method: 'POST', body: '{}' }),
      delete: (id) => request(`/api/admin/llm-keys/${id}`, { method: 'DELETE' }),
    },
  },

  settings: {
    stats: () => request('/api/settings/stats'),
    changePassword: (body) =>
      request('/api/settings/password', { method: 'POST', body: JSON.stringify(body) }),
  },
};
