/**
 * Presentation metadata for the internal request system.
 *
 * A request has three orthogonal facets and the UI has to keep them legible
 * without turning every row into a wall of chips:
 *   kind     — what is being asked for (drives the icon + kicker)
 *   decision — the outcome, once an approver has ruled on it
 *   priority — urgency, only surfaced when it is above normal
 */

export const KINDS = [
  { key: 'request', label: 'Request', hint: 'Asking someone to do something' },
  { key: 'approval', label: 'Approval', hint: 'Needs a yes or no before it moves' },
  { key: 'idea', label: 'Idea', hint: 'Floating a proposal for discussion' },
  { key: 'question', label: 'Question', hint: 'Asking the team for an answer' },
];

export const PRIORITIES = [
  { key: 'low', label: 'Low' },
  { key: 'normal', label: 'Normal' },
  { key: 'high', label: 'High' },
  { key: 'urgent', label: 'Urgent' },
];

export const INBOXES = [
  { key: 'awaiting_me', label: 'Needs my approval', countKey: 'awaiting_me' },
  { key: 'assigned_to_me', label: 'Assigned to me', countKey: 'assigned_to_me' },
  { key: 'mine', label: 'My requests', countKey: 'mine' },
  { key: 'following', label: 'Following', countKey: 'following' },
  { key: 'all', label: 'All requests', countKey: 'all_count' },
];

export function kindLabel(kind) {
  return KINDS.find((k) => k.key === kind)?.label || 'Request';
}

export function kindBadge(kind) {
  switch (kind) {
    case 'approval':
      return 'badge-outline';
    case 'idea':
      return 'badge-accent';
    case 'question':
      return 'badge-accent2';
    default:
      return 'badge-neutral';
  }
}

/**
 * The single chip that tells you where a request stands. Decision wins over
 * status once one exists, because "approved" is more informative than "done".
 */
export function stateChip(task) {
  if (task.decision === 'approved') return { label: 'Approved', className: 'badge bg-emerald-50 text-success' };
  if (task.decision === 'rejected') return { label: 'Rejected', className: 'badge bg-red-50 text-danger' };
  if (task.decision === 'changes_requested')
    return { label: 'Changes requested', className: 'badge bg-amber-50 text-amber-900' };
  if (task.status === 'cancelled') return { label: 'Cancelled', className: 'badge-neutral' };
  if (task.status === 'done') return { label: 'Done', className: 'badge bg-emerald-50 text-success' };
  if (task.status === 'in_progress') return { label: 'In progress', className: 'badge-accent' };
  return { label: 'Open', className: 'badge-outline' };
}

export function priorityChip(priority) {
  if (priority === 'urgent') return { label: 'Urgent', className: 'badge bg-red-50 text-danger' };
  if (priority === 'high') return { label: 'High', className: 'badge bg-amber-50 text-amber-900' };
  return null; // normal and low are the default — don't spend a chip on them
}

export function isResolved(task) {
  return task.status === 'done' || task.status === 'cancelled';
}

/** Mentionable handle — matches the backend's username-or-email-prefix fallback. */
export function handleOf(user) {
  return (user.handle || user.username || (user.email || '').split('@')[0] || '').toLowerCase();
}

export function initialsOf(name) {
  return (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function formatDate(value, opts) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, opts || { month: 'short', day: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "3h ago" style stamp for list rows, where absolute dates read as noise. */
export function relativeTime(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

/** Divider label for a day's worth of conversation. */
export function dayLabel(value) {
  const d = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

/** Clock stamp for an individual message, without the date. */
export function timeOnly(value) {
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Collapse a flat thread into render blocks.
 *
 * Consecutive comments from one author inside a short window read as one turn
 * in a conversation, so they share a single avatar and name line instead of
 * repeating the header on every line. Events always stand alone.
 */
export function groupThread(items, { windowMs = 5 * 60 * 1000 } = {}) {
  const blocks = [];
  let lastDay = null;

  for (const item of items) {
    const day = new Date(item.created_at).toDateString();
    if (day !== lastDay) {
      blocks.push({ type: 'day', id: `day-${day}`, created_at: item.created_at });
      lastDay = day;
    }

    if (item.item !== 'comment') {
      blocks.push({ type: 'event', id: `e-${item.id}`, event: item });
      continue;
    }

    const prev = blocks[blocks.length - 1];
    const contiguous =
      prev?.type === 'messages' &&
      prev.author_id === item.author_id &&
      new Date(item.created_at) - new Date(prev.messages[prev.messages.length - 1].created_at) <
        windowMs;

    if (contiguous) {
      prev.messages.push(item);
    } else {
      blocks.push({
        type: 'messages',
        id: `m-${item.id}`,
        author_id: item.author_id,
        author_name: item.author_name,
        created_at: item.created_at,
        messages: [item],
      });
    }
  }
  return blocks;
}

export function formatBytes(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function dueState(dueAt) {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  const days = Math.ceil((due - Date.now()) / 86400000);
  if (days < 0) return { label: `Overdue ${formatDate(dueAt)}`, className: 'text-danger' };
  if (days <= 2) return { label: `Due ${formatDate(dueAt)}`, className: 'text-amber-900' };
  return { label: `Due ${formatDate(dueAt)}`, className: 'text-muted' };
}
