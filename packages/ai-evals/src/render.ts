import sharp from 'sharp';

import type { EvalCase, SyntheticMessage } from './cases';

const width = 1170;
const horizontalPadding = 64;
const bubbleWidth = 780;
const lineHeight = 46;

export async function renderSyntheticScreenshot(testCase: EvalCase): Promise<Buffer> {
  const messages = testCase.messages.map(layoutMessage);
  const contentHeight = messages.reduce((total, message) => total + message.height + 28, 0);
  const height = Math.max(900, 190 + contentHeight + 70);
  let y = 150;
  const bubbles = messages
    .map((message) => {
      const x =
        message.side === 'outgoing' ? width - horizontalPadding - bubbleWidth : horizontalPadding;
      const fill = message.side === 'outgoing' ? '#dff4e8' : '#ffffff';
      const label = escapeXml(message.sender);
      const textLines = message.lines
        .map(
          (line, index) =>
            `<text x="${x + 34}" y="${y + 72 + index * lineHeight}" class="body">${escapeXml(line)}</text>`,
        )
        .join('');
      const result = `<text x="${x + 4}" y="${y - 12}" class="sender">${label}</text><rect x="${x}" y="${y}" width="${bubbleWidth}" height="${message.height}" rx="8" fill="${fill}" stroke="#d8dde3" stroke-width="2"/>${textLines}`;
      y += message.height + 28;
      return result;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <style>
      .title { font: 700 34px Arial, 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif; fill: #17212b; }
      .sender { font: 500 24px Arial, 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif; fill: #687481; }
      .body { font: 400 31px Arial, 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif; fill: #17212b; }
    </style>
    <rect width="${width}" height="${height}" fill="#eef1f4"/>
    <rect width="${width}" height="96" fill="#ffffff"/>
    <text x="${horizontalPadding}" y="62" class="title">Synthetic conversation</text>
    ${bubbles}
  </svg>`;

  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

function layoutMessage(message: SyntheticMessage) {
  const lines = wrapText(message.text, 22);
  return {
    ...message,
    lines,
    height: Math.max(104, 42 + lines.length * lineHeight),
  };
}

function wrapText(value: string, maxUnits: number): string[] {
  const lines: string[] = [];
  let line = '';
  let units = 0;
  for (const character of Array.from(value)) {
    const characterUnits = /^[\u0000-\u00ff]$/.test(character) ? 0.58 : 1;
    if (line && units + characterUnits > maxUnits) {
      lines.push(line);
      line = character;
      units = characterUnits;
    } else {
      line += character;
      units += characterUnits;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [' '];
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entities[character] ?? character;
  });
}
