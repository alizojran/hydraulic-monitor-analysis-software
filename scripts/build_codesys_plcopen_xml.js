const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pouDir = path.join(root, 'codesys', 'POUs');
const outFile = path.join(root, 'codesys', 'HMAS_Codesys_TCP_Client.plcopen.xml');

const objects = [
  { file: 'E_HmasCloudState.iecst', kind: 'dataType', name: 'E_HmasCloudState' },
  { file: 'GVL_HmasChannels.iecst', kind: 'gvl', name: 'GVL_HmasChannels' },
  { file: 'HmasPeakShape.iecst', kind: 'pou', name: 'HmasPeakShape', type: 'function' },
  { file: 'FB_HmasSensorSimulator.iecst', kind: 'pou', name: 'FB_HmasSensorSimulator', type: 'functionBlock' },
  { file: 'FB_HmasCloudTcpClient.iecst', kind: 'pou', name: 'FB_HmasCloudTcpClient', type: 'functionBlock' },
  { file: 'PLC_PRG.iecst', kind: 'pou', name: 'PLC_PRG', type: 'program' },
];

const builtinTypes = new Set([
  'BOOL',
  'BYTE',
  'WORD',
  'DWORD',
  'LWORD',
  'SINT',
  'USINT',
  'INT',
  'UINT',
  'DINT',
  'UDINT',
  'LINT',
  'ULINT',
  'REAL',
  'LREAL',
  'TIME',
  'DATE_AND_TIME',
  'DT',
]);

const scopeTags = {
  VAR_INPUT: 'inputVars',
  VAR_OUTPUT: 'outputVars',
  VAR_IN_OUT: 'inOutVars',
  VAR: 'localVars',
  VAR_GLOBAL: null,
};

function read(file) {
  return fs.readFileSync(path.join(pouDir, file), 'utf8').replace(/\r\n/g, '\n');
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripLeadingComments(text) {
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t || t.startsWith('//')) {
      i += 1;
      continue;
    }
    break;
  }
  return lines.slice(i).join('\n').trim();
}

function uuidFor(name) {
  const hex = crypto.createHash('md5').update(name).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function findMatchingEndVar(text, start) {
  const re = /\bEND_VAR\b/gi;
  re.lastIndex = start;
  const match = re.exec(text);
  if (!match) throw new Error('Cannot find END_VAR');
  return match.index + match[0].length;
}

function extractPou(text, obj) {
  const clean = stripLeadingComments(text);
  const headerRe = new RegExp(`\\b(FUNCTION|FUNCTION_BLOCK|PROGRAM)\\s+${obj.name}(?:\\s*:\\s*([^\\n]+))?`, 'i');
  const header = headerRe.exec(clean);
  if (!header || header.index === undefined) throw new Error(`Cannot find ${obj.name}`);
  const headerEnd = header.index + header[0].length;
  const endToken = obj.type === 'program' ? 'END_PROGRAM' : obj.type === 'functionBlock' ? 'END_FUNCTION_BLOCK' : 'END_FUNCTION';
  const end = clean.lastIndexOf(endToken);
  if (end < headerEnd) throw new Error(`Cannot find ${endToken}`);
  const source = clean.slice(headerEnd, end).trim();
  const returnType = header[2] ? header[2].trim() : null;

  const blocks = [];
  let pos = 0;
  while (true) {
    const match = /\bVAR(?:_INPUT|_OUTPUT|_IN_OUT|_GLOBAL)?\b/gi.exec(source.slice(pos));
    if (!match) break;
    const absoluteStart = pos + match.index;
    if (source.slice(pos, absoluteStart).trim()) break;
    const endVar = findMatchingEndVar(source, absoluteStart);
    blocks.push(source.slice(absoluteStart, endVar));
    pos = endVar;
  }

  return {
    returnType,
    blocks,
    body: source.slice(pos).trim(),
  };
}

function extractGvl(text) {
  const clean = stripLeadingComments(text);
  const start = clean.search(/\bVAR_GLOBAL\b/i);
  if (start < 0) throw new Error('Cannot find VAR_GLOBAL');
  const end = findMatchingEndVar(clean, start);
  return clean.slice(start, end);
}

function removeComments(line) {
  return line.replace(/\/\/.*$/, '').trim();
}

function splitStatements(block) {
  const body = block
    .replace(/\bVAR(?:_INPUT|_OUTPUT|_IN_OUT|_GLOBAL)?(?:\s+CONSTANT)?\b/i, '')
    .replace(/\bEND_VAR\b/i, '');

  const statements = [];
  let current = '';
  let inString = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    current += ch;
    if (ch === "'") inString = !inString;
    if (ch === ';' && !inString) {
      statements.push(current);
      current = '';
    }
  }
  return statements.map((s) => s.trim()).filter(Boolean);
}

function parseVarBlock(block) {
  const header = block.match(/\bVAR(?:_INPUT|_OUTPUT|_IN_OUT|_GLOBAL)?\b/i)?.[0].toUpperCase();
  const tag = scopeTags[header || 'VAR'];
  const variables = [];
  for (const raw of splitStatements(block)) {
    const statement = raw
      .split('\n')
      .map(removeComments)
      .filter(Boolean)
      .join(' ')
      .replace(/;\s*$/, '')
      .trim();
    if (!statement) continue;
    const colon = statement.indexOf(':');
    if (colon < 0) continue;
    const names = statement.slice(0, colon).split(',').map((s) => s.trim()).filter(Boolean);
    let rest = statement.slice(colon + 1).trim();
    let init = null;
    const assign = rest.indexOf(':=');
    if (assign >= 0) {
      init = rest.slice(assign + 2).trim();
      rest = rest.slice(0, assign).trim();
    }
    for (const name of names) {
      variables.push({ name, type: rest, init });
    }
  }
  return { tag, variables };
}

function typeXml(typeText, indent = 10) {
  const pad = ' '.repeat(indent);
  const type = typeText.trim();
  const upper = type.toUpperCase();

  const pointer = /^POINTER\s+TO\s+(.+)$/i.exec(type);
  if (pointer) {
    return `${pad}<type>\n${pad}  <pointer>\n${pad}    <baseType>\n${typeXmlInner(pointer[1].trim(), indent + 6)}\n${pad}    </baseType>\n${pad}  </pointer>\n${pad}</type>`;
  }

  const array = /^ARRAY\s*\[(.+)]\s+OF\s+(.+)$/i.exec(type);
  if (array) {
    const ranges = array[1].split(',').map((part) => {
      const [lower, upperBound] = part.split('..').map((s) => s.trim());
      return `${pad}      <dimension lower="${escapeXml(lower)}" upper="${escapeXml(upperBound)}" />`;
    }).join('\n');
    return `${pad}<type>\n${pad}  <array>\n${ranges}\n${pad}    <baseType>\n${typeXmlInner(array[2].trim(), indent + 6)}\n${pad}    </baseType>\n${pad}  </array>\n${pad}</type>`;
  }

  return `${pad}<type>\n${typeXmlInner(type, indent + 2)}\n${pad}</type>`;
}

function typeXmlInner(type, indent) {
  const pad = ' '.repeat(indent);
  const upper = type.toUpperCase();
  const string = /^STRING(?:\((\d+)\))?$/i.exec(type);
  if (string) {
    return string[1] ? `${pad}<string length="${string[1]}" />` : `${pad}<string />`;
  }
  if (builtinTypes.has(upper)) {
    const name = upper === 'DATE_AND_TIME' ? 'DT' : upper;
    return `${pad}<${name} />`;
  }
  return `${pad}<derived name="${escapeXml(type)}" />`;
}

function variableXml(variable, indent = 10) {
  const pad = ' '.repeat(indent);
  const initial = variable.init
    ? `\n${pad}  <initialValue>\n${pad}    <simpleValue value="${escapeXml(variable.init)}" />\n${pad}  </initialValue>`
    : '';
  return `${pad}<variable name="${escapeXml(variable.name)}">\n${typeXml(variable.type, indent + 2)}${initial}\n${pad}</variable>`;
}

function interfaceXml(blocks, returnType = null, indent = 8) {
  const pad = ' '.repeat(indent);
  const byTag = new Map();
  for (const block of blocks) {
    const { tag, variables } = parseVarBlock(block);
    if (!tag) continue;
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push(...variables);
  }

  const parts = [];
  if (returnType) {
    parts.push(`${pad}  <returnType>\n${typeXmlInner(returnType, indent + 4)}\n${pad}  </returnType>`);
  }
  for (const tag of ['inputVars', 'outputVars', 'inOutVars', 'localVars']) {
    const variables = byTag.get(tag);
    if (!variables || variables.length === 0) continue;
    parts.push(`${pad}  <${tag}>\n${variables.map((v) => variableXml(v, indent + 4)).join('\n')}\n${pad}  </${tag}>`);
  }
  return `${pad}<interface>\n${parts.join('\n')}\n${pad}</interface>`;
}

function stBodyXml(body, indent = 10) {
  const pad = ' '.repeat(indent);
  return `${pad}<ST>\n${pad}  <xhtml xmlns="http://www.w3.org/1999/xhtml">${escapeXml(body)}</xhtml>\n${pad}</ST>`;
}

function dataTypeXml(obj) {
  const clean = stripLeadingComments(read(obj.file));
  const body = clean.match(/TYPE\s+\w+\s*:\s*\(([\s\S]*?)\)\s*;/i)?.[1];
  if (!body) throw new Error(`Cannot parse enum ${obj.name}`);
  const values = body
    .split(',')
    .map((entry) => entry.replace(/\/\/.*$/, '').trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, value] = entry.split(':=').map((s) => s.trim());
      return `            <value name="${escapeXml(name)}" value="${escapeXml(value)}" />`;
    })
    .join('\n');
  return `      <dataType name="${obj.name}">\n        <baseType>\n          <enum>\n            <values>\n${values}\n            </values>\n          </enum>\n        </baseType>\n        <addData>\n          <data name="http://www.3s-software.com/plcopenxml/objectid" handleUnknown="discard">\n            <ObjectId>${uuidFor(obj.name)}</ObjectId>\n          </data>\n        </addData>\n      </dataType>`;
}

function gvlXml(obj) {
  const { variables } = parseVarBlock(extractGvl(read(obj.file)));
  return `    <data name="http://www.3s-software.com/plcopenxml/globalvars" handleUnknown="implementation">\n      <globalVars name="${obj.name}">\n${variables.map((v) => variableXml(v, 8)).join('\n')}\n        <addData>\n          <data name="http://www.3s-software.com/plcopenxml/objectid" handleUnknown="discard">\n            <ObjectId>${uuidFor(obj.name)}</ObjectId>\n          </data>\n        </addData>\n      </globalVars>\n    </data>`;
}

function pouXml(obj) {
  const { returnType, blocks, body } = extractPou(read(obj.file), obj);
  return `      <pou name="${obj.name}" pouType="${obj.type}">\n${interfaceXml(blocks, returnType, 8)}\n        <body>\n${stBodyXml(body, 10)}\n        </body>\n        <addData>\n          <data name="http://www.3s-software.com/plcopenxml/objectid" handleUnknown="discard">\n            <ObjectId>${uuidFor(obj.name)}</ObjectId>\n          </data>\n        </addData>\n      </pou>`;
}

const dataTypes = objects.filter((o) => o.kind === 'dataType').map(dataTypeXml).join('\n');
const globalVars = objects.filter((o) => o.kind === 'gvl').map(gvlXml).join('\n');
const pous = objects.filter((o) => o.kind === 'pou').map(pouXml).join('\n');
const now = new Date().toISOString();

const xml = `<?xml version="1.0" encoding="utf-8"?>\n<project xmlns="http://www.plcopen.org/xml/tc6_0200">\n  <fileHeader companyName="HMAS"\n              productName="CODESYS"\n              productVersion="CODESYS V3.5"\n              creationDateTime="${now}" />\n  <contentHeader name="HMAS_Codesys_TCP_Client.project"\n                 modificationDateTime="${now}">\n    <coordinateInfo>\n      <fbd><scaling x="1" y="1" /></fbd>\n      <ld><scaling x="1" y="1" /></ld>\n      <sfc><scaling x="1" y="1" /></sfc>\n    </coordinateInfo>\n    <addData>\n      <data name="http://www.3s-software.com/plcopenxml/projectinformation" handleUnknown="implementation">\n        <ProjectInformation>\n          <property name="Project" type="string">HMAS_Codesys_TCP_Client</property>\n        </ProjectInformation>\n      </data>\n    </addData>\n  </contentHeader>\n  <types>\n    <dataTypes>\n${dataTypes}\n    </dataTypes>\n    <pous>\n${pous}\n    </pous>\n  </types>\n  <instances>\n    <configurations />\n  </instances>\n  <addData>\n${globalVars}\n  </addData>\n</project>\n`;

fs.writeFileSync(outFile, xml, 'utf8');
console.log(outFile);
