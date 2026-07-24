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
    <div className="space-y-2">
      {lines.map((line, idx) => {
        const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const Tag = `h${Math.min(level + 1, 4)}`;
          const sizes = { 1: 'text-2xl', 2: 'text-xl', 3: 'text-lg', 4: 'text-base' };
          return (
            <Tag key={idx} className={`font-display font-semibold ${sizes[Math.min(level, 4)] || 'text-base'}`}>
              {renderInline(headingMatch[2], idx)}
            </Tag>
          );
        }
        return (
          <p key={idx} className="text-[15px] leading-relaxed">
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
              <th key={idx} className="border border-line bg-surface px-2 py-1 text-left font-semibold">
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

/**
 * @param {string} documentId
 * @param {boolean} [fill] — fill parent height (fullscreen modal); hide redundant download links
 * @param {string} [className]
 */
export default function DocumentPreview({ documentId, fill = false, className = '' }) {
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
    return (
      <div className={`flex items-center justify-center text-sm text-muted ${fill ? 'h-full' : ''} ${className}`}>
        Loading preview…
      </div>
    );
  }
  if (state.error) {
    return (
      <div className={`flex items-center justify-center text-sm text-danger ${fill ? 'h-full' : ''} ${className}`}>
        {state.error}
      </div>
    );
  }

  const { data } = state;
  const exportUrl = `/api/documents/${documentId}/export/docx`;
  const downloadUrl = `/api/documents/${documentId}/download`;
  const rawUrl = `/api/documents/${documentId}/raw`;

  if (data?.isImage) {
    return (
      <div className={`flex flex-col ${fill ? 'h-full min-h-0' : 'space-y-2'} ${className}`}>
        <div
          className={`border border-line bg-surface flex items-center justify-center overflow-auto ${
            fill ? 'flex-1 min-h-0 p-4' : 'p-2 max-h-96'
          }`}
        >
          <img
            src={rawUrl}
            alt=""
            className={fill ? 'max-w-full max-h-full object-contain' : 'max-w-full max-h-[22rem] object-contain'}
          />
        </div>
        {!fill && (
          <a className="text-primary font-medium hover:underline text-xs" href={downloadUrl}>
            Download
          </a>
        )}
      </div>
    );
  }

  if (data?.isPdf) {
    return (
      <div className={`flex flex-col ${fill ? 'h-full min-h-0' : 'space-y-2'} ${className}`}>
        <iframe
          title="PDF preview"
          src={rawUrl}
          className={`w-full border border-line bg-canvas ${fill ? 'flex-1 min-h-0' : 'h-96'}`}
        />
        {!fill && (
          <a className="text-primary font-medium hover:underline text-xs" href={downloadUrl}>
            Download
          </a>
        )}
      </div>
    );
  }

  if (!data?.isText) {
    return (
      <div
        className={`border border-line bg-surface px-3 py-2 text-sm flex flex-col items-center justify-center gap-2 ${
          fill ? 'h-full' : ''
        } ${className}`}
      >
        <p className="text-muted">Preview not available for {data?.mimeType || 'this file type'}</p>
        <a className="text-primary font-medium hover:underline text-xs" href={downloadUrl}>
          Download
        </a>
      </div>
    );
  }

  const blocks = parseBlocks(data.content || '');

  return (
    <div className={`flex flex-col ${fill ? 'h-full min-h-0' : 'space-y-3'} ${className}`}>
      <div
        className={`overflow-y-auto space-y-3 ${
          fill ? 'flex-1 min-h-0 px-4 py-6' : 'border border-line px-3 py-2 max-h-96'
        }`}
      >
        <div className={fill ? 'max-w-3xl mx-auto space-y-3' : 'space-y-3'}>
          {blocks.map((block, idx) =>
            block.type === 'table' ? (
              <TableBlock key={idx} rows={block.rows} />
            ) : (
              <TextBlock key={idx} lines={block.lines} />
            )
          )}
          {!blocks.length && <p className="text-sm text-muted">Empty document</p>}
        </div>
      </div>
      {!fill && (
        <a className="text-primary font-medium hover:underline text-xs" href={exportUrl} download>
          Export as Word (.docx)
        </a>
      )}
    </div>
  );
}
