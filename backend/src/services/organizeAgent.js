const { query } = require('../lib/db');

/**
 * Organize uploaded file payloads into shared_documents under a client.
 * files: [{ filename, mimeType, contentBase64, title?, description? }]
 */
async function organizeFilesToClient({ orgId, userId, clientId, files, saveBuffer }) {
  const client = await query(
    'SELECT id, name FROM clients WHERE id = $1 AND org_id = $2',
    [clientId, orgId]
  );
  if (!client.rows[0]) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }

  const created = [];
  for (const file of files) {
    if (!file?.filename || !file?.contentBase64) continue;
    const buffer = Buffer.from(file.contentBase64, 'base64');
    const saved = saveBuffer(`clients/${clientId}`, file.filename, buffer);
    const title = file.title || file.filename;
    const description =
      file.description ||
      `Organized into client "${client.rows[0].name}" by agent`;
    const { rows } = await query(
      `INSERT INTO shared_documents (
         org_id, client_id, title, description, filename, mime_type, size_bytes, storage_path, uploaded_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        orgId,
        clientId,
        title,
        description,
        file.filename,
        file.mimeType || 'application/octet-stream',
        saved.size,
        saved.storagePath,
        userId,
      ]
    );
    created.push(rows[0]);
  }

  return {
    clientId,
    organized: created.length,
    documents: created,
  };
}

module.exports = { organizeFilesToClient };
