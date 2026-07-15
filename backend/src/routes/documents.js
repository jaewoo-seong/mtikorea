const express = require('express');
const multer = require('multer');
const fs = require('fs');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  WidthType,
} = require('docx');
const { query } = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { saveBuffer, resolvePath } = require('../lib/storage');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
const router = express.Router();
router.use(requireAuth);

// --- Text/table detection + docx export helpers ---------------------------

function isTextMime(mimeType) {
  if (!mimeType) return null; // unknown - caller should sniff the bytes
  const lower = mimeType.toLowerCase();
  if (lower.startsWith('text/') || lower === 'application/json') return true;
  return false;
}

function hasNullByte(buffer) {
  const len = Math.min(buffer.length, 8000);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

// Reads the stored file and decides whether it's safe to treat as text.
function resolveTextContent(doc) {
  let raw;
  try {
    raw = fs.readFileSync(resolvePath(doc.storage_path));
  } catch (err) {
    return { isText: false };
  }
  const known = isTextMime(doc.mime_type || null);
  let isText;
  if (known === true) isText = true;
  else if (known === false) isText = false;
  else isText = !hasNullByte(raw); // no mime type on record - sniff for binary content
  if (!isText) return { isText: false };
  return { isText: true, content: raw.toString('utf8') };
}

function isMarkdownSeparatorRow(line) {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes('-')) return false;
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(trimmed);
}

function splitRow(line, delimiter) {
  let trimmed = line.trim();
  if (delimiter === '|') {
    if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
    if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  }
  return trimmed.split(delimiter).map((cell) => cell.trim());
}

// Given a block of consecutive non-blank lines, return a 2D array of cells
// if it looks like a table (markdown pipe table, or consistent tab/comma
// separated columns), otherwise null.
function detectTableBlock(blockLines) {
  if (blockLines.length < 2) return null;

  // Markdown table: header row + `|---|---|` style separator row.
  if (blockLines[0].includes('|') && isMarkdownSeparatorRow(blockLines[1])) {
    const dataLines = [blockLines[0], ...blockLines.slice(2)];
    const rows = dataLines.map((l) => splitRow(l, '|'));
    const cols = rows[0].length;
    if (cols > 1 && rows.every((r) => r.length === cols)) return rows;
  }

  // Tab or comma separated columns with a consistent column count.
  for (const delimiter of ['\t', ',']) {
    const rows = blockLines.map((l) => splitRow(l, delimiter));
    const cols = rows[0].length;
    if (cols > 1 && rows.every((r) => r.length === cols)) return rows;
  }

  return null;
}

// Very small markdown-ish inline formatting: **bold** spans.
function parseInlineRuns(line) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== '');
  if (!parts.length) return [new TextRun('')];
  return parts.map((part) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return new TextRun({ text: part.slice(2, -2), bold: true });
    }
    return new TextRun(part);
  });
}

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

function buildParagraph(line) {
  const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
  if (headingMatch) {
    const level = headingMatch[1].length;
    return new Paragraph({
      heading: HEADING_LEVELS[level - 1] || HeadingLevel.HEADING_6,
      children: parseInlineRuns(headingMatch[2]),
    });
  }
  return new Paragraph({ children: parseInlineRuns(line) });
}

function buildTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cols, rowIdx) => new TableRow({
      children: cols.map((cellText) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: cellText, bold: rowIdx === 0 })] })],
      })),
    })),
  });
}

function textToDocxChildren(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const children = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === '') {
      i++;
      continue;
    }
    const block = [];
    while (i < lines.length && lines[i].trim() !== '') {
      block.push(lines[i]);
      i++;
    }
    const table = detectTableBlock(block);
    if (table) {
      children.push(buildTable(table));
      children.push(new Paragraph({ text: '' }));
    } else {
      for (const line of block) children.push(buildParagraph(line));
      children.push(new Paragraph({ text: '' }));
    }
  }
  if (!children.length) children.push(new Paragraph({ text: '' }));
  return children;
}

router.get('/', async (req, res, next) => {
  try {
    const { clientId, projectId, q, visibility, folderId } = req.query;
    const params = [req.user.org_id];
    // Default: only approved shared docs (hide staged temp outputs)
    const vis = visibility || 'shared';
    let sql = `
      SELECT d.*, c.name AS client_name, u.name AS uploader_name, p.title AS project_title
      FROM shared_documents d
      LEFT JOIN clients c ON c.id = d.client_id
      LEFT JOIN users u ON u.id = d.uploaded_by
      LEFT JOIN projects p ON p.id = d.project_id
      WHERE d.org_id = $1`;
    if (vis !== 'all') {
      params.push(vis);
      sql += ` AND d.visibility = $${params.length}`;
    }
    if (clientId) {
      params.push(clientId);
      sql += ` AND d.client_id = $${params.length}`;
    }
    if (projectId) {
      params.push(projectId);
      sql += ` AND d.project_id = $${params.length}`;
    }
    if (folderId === 'root') {
      sql += ` AND d.folder_id IS NULL`;
    } else if (folderId) {
      params.push(folderId);
      sql += ` AND d.folder_id = $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (d.title ILIKE $${params.length} OR d.filename ILIKE $${params.length} OR d.description ILIKE $${params.length})`;
    }
    sql += ' ORDER BY d.created_at DESC';
    const { rows } = await query(sql, params);
    res.json({ documents: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    if (!req.file) return res.status(400).json({ error: 'file required' });
    let { title, description, clientId, projectId, visibility } = req.body || {};
    const vis = visibility === 'staged' ? 'staged' : 'shared';

    if (projectId && !clientId) {
      const proj = await query(
        'SELECT client_id FROM projects WHERE id = $1 AND org_id = $2',
        [projectId, req.user.org_id]
      );
      if (proj.rows[0]?.client_id) clientId = proj.rows[0].client_id;
    }

    const folder = vis === 'staged' ? `projects/${projectId || 'temp'}/staged` : 'shared';
    const saved = saveBuffer(folder, req.file.originalname, req.file.buffer);
    const docTitle = title || req.file.originalname;
    const { rows } = await query(
      `INSERT INTO shared_documents (
         org_id, client_id, project_id, title, description, filename, mime_type, size_bytes,
         storage_path, uploaded_by, visibility, source, approved_at, approved_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'upload',$12,$13) RETURNING *`,
      [
        req.user.org_id,
        clientId || null,
        projectId || null,
        docTitle,
        description || null,
        req.file.originalname,
        req.file.mimetype,
        saved.size,
        saved.storagePath,
        req.user.id,
        vis,
        vis === 'shared' ? new Date() : null,
        vis === 'shared' ? req.user.id : null,
      ]
    );
    res.status(201).json({ document: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/approve', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      `UPDATE shared_documents SET
         visibility = 'shared',
         approved_at = now(),
         approved_by = $3,
         updated_at = now()
       WHERE id = $1 AND org_id = $2 AND visibility = 'staged'
       RETURNING *`,
      [req.params.id, req.user.org_id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Staged document not found' });
    res.json({ document: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      `DELETE FROM shared_documents WHERE id = $1 AND org_id = $2 AND visibility = 'staged' RETURNING id`,
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Staged document not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const map = {
      title: 'title',
      description: 'description',
      clientId: 'client_id',
      projectId: 'project_id',
      folderId: 'folder_id',
    };
    const updates = [];
    const params = [];
    for (const [key, col] of Object.entries(map)) {
      if (req.body[key] !== undefined) {
        params.push(req.body[key] === '' ? null : req.body[key]);
        updates.push(`${col} = $${params.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    params.push(req.params.id, req.user.org_id);
    const { rows } = await query(
      `UPDATE shared_documents SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${params.length - 1} AND org_id = $${params.length}
       RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ document: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM shared_documents WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.download(resolvePath(rows[0].storage_path), rows[0].filename);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/preview', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM shared_documents WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const doc = rows[0];
    const result = resolveTextContent(doc);
    if (!result.isText) {
      return res.json({ isText: false, mimeType: doc.mime_type || null });
    }
    res.json({ isText: true, content: result.content, mimeType: doc.mime_type || null });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/export/docx', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM shared_documents WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const doc = rows[0];
    const result = resolveTextContent(doc);
    if (!result.isText) {
      return res.status(400).json({ error: 'Export only available for text/markdown documents' });
    }
    const wordDoc = new Document({
      sections: [{ children: textToDocxChildren(result.content) }],
    });
    const buffer = await Packer.toBuffer(wordDoc);
    const safeName = (doc.title || doc.filename || 'document').replace(/[^a-zA-Z0-9._-]+/g, '_');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.docx"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    await query('DELETE FROM shared_documents WHERE id = $1 AND org_id = $2', [
      req.params.id,
      req.user.org_id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
