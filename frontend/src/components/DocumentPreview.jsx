import { useEffect, useState } from 'react';

// Detects a block of consecutive non-blank lines that looks like a table
// (markdown `| col | col |` with a `|---|---|` separator row, or consistent
// tab/comma separated columns) and returns a 2D array of cells, else null.
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

function detectTableBlock(blockLines) {
  if (blockLines.length < 2) return null;
  if (blockLines[0].includes('|') && isMarkdownSeparatorRow(blockLines[1])) {
    const dataLines = [blockLines[0], ...blockLines.slice(2)];
    const rows = dataLines.map((l) => splitRow(l, '|'));
    const cols = rows[0].length;
    if (cols > 1 && rows.every((r) => r.length === cols)) return rows;
  }
  for (const delimiter of ['\t', ',']) {
    const rows = blockLines.map((l) => splitRow(l, delimiter));
    const cols = rows[0].length;
    if (cols > 1 && rows.every((r) => r.length === cols)) return rows;
  }
  return null;
}

// Splits text into blocks (tables vs prose paragraphs) for rendering.
function parseBlocks(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
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
      blocks.push({ type: 'table', rows: table });
    } else {
      blocks.push({ type: 'text', lines: block });
    }
  }
  return blocks;
}

function renderInline(line, key) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== '');
  return (
    <span key={key}>
      {parts.map((part, idx) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <strong key={idx}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={idx}>{part}</span>
        )
      )}
    </span>
  );
}

function TextBlock({ lines }) {
  return (
    <div className="space-y-1">
      {lines.map((line, idx) => {
        const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const Tag = `h${Math.min(level + 2, 6)}`;
          return (
            <Tag key={idx} className="font-semibold">
              {renderInline(headingMatch[2], idx)}
            </Tag>
          );
        }
        return (
          <p key={idx} className="text-sm leading-relaxed">
            {renderInline(line, idx)}
          </p>
        );
      })}
    </div>
  );
}

function TableBlock({ rows }) {
  const [header, ...body] = rows;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {header.map((cell, idx) => (
              <th
                key={idx}
                className="border border-line bg-surface px-2 py-1 text-left font-semibold"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rIdx) => (
            <tr key={rIdx}>
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="border border-line px-2 py-1">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DocumentPreview({ documentId }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    fetch(`/api/documents/${documentId}/preview`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load preview');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, error: err.message, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (state.loading) {
    return <p className="text-xs text-muted">Loading preview…</p>;
  }
  if (state.error) {
    return <p className="text-xs text-danger">{state.error}</p>;
  }

  const { data } = state;
  const exportUrl = `/api/documents/${documentId}/export/docx`;
  const downloadUrl = `/api/documents/${documentId}/download`;
  const rawUrl = `/api/documents/${documentId}/raw`;

  if (data?.isImage) {
    return (
      <div className="space-y-2">
        <div className="border border-line bg-surface p-2 flex items-center justify-center max-h-96 overflow-auto">
          <img src={rawUrl} alt="" className="max-w-full max-h-[22rem] object-contain" />
        </div>
        <a className="text-primary font-medium hover:underline text-xs" href={downloadUrl}>
          Download
        </a>
      </div>
    );
  }

  if (data?.isPdf) {
    return (
      <div className="space-y-2">
        <iframe title="PDF preview" src={rawUrl} className="w-full h-96 border border-line" />
        <a className="text-primary font-medium hover:underline text-xs" href={downloadUrl}>
          Download
        </a>
      </div>
    );
  }

  if (!data?.isText) {
    return (
      <div className="border border-line bg-surface px-3 py-2 text-sm">
        <p className="text-muted">
          Preview not available for {data?.mimeType || 'this file type'}
        </p>
        <a className="text-primary font-medium hover:underline text-xs" href={downloadUrl}>
          Download
        </a>
      </div>
    );
  }

  const blocks = parseBlocks(data.content || '');

  return (
    <div className="space-y-3">
      <div className="border border-line px-3 py-2 max-h-96 overflow-y-auto space-y-3">
        {blocks.map((block, idx) =>
          block.type === 'table' ? (
            <TableBlock key={idx} rows={block.rows} />
          ) : (
            <TextBlock key={idx} lines={block.lines} />
          )
        )}
        {!blocks.length && <p className="text-sm text-muted">Empty document</p>}
      </div>
      <a className="text-primary font-medium hover:underline text-xs" href={exportUrl} download>
        Export as Word (.docx)
      </a>
    </div>
  );
}
