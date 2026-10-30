/**
 * Parser XML mínimo + Canonicalización (C14N) para firmas XML.
 *
 * Implementa, sin APIs de Node (corre en Cloudflare Workers):
 *
 *   - Canonical XML 1.0 inclusivo, sin comentarios
 *     http://www.w3.org/TR/2001/REC-xml-c14n-20010315
 *     (el que exige la DIAN para la firma XAdES de los documentos).
 *   - Exclusive XML Canonicalization 1.0, sin comentarios
 *     http://www.w3.org/2001/10/xml-exc-c14n#
 *     (el que usa WS-Security en el sobre SOAP de los web services).
 *
 * Puntos delicados de C14N que esta implementación respeta (la DIAN
 * rechaza la firma si alguno falla):
 *
 *   1. Al canonicalizar un SUBÁRBOL (SignedInfo, KeyInfo,
 *      SignedProperties) en modo inclusivo, el elemento raíz del
 *      subárbol lleva TODAS las declaraciones de namespace heredadas de
 *      sus ancestros (incluido el xmlns por defecto del documento).
 *   2. Declaraciones de namespace primero (ordenadas por prefijo, la
 *      por defecto antes), luego atributos ordenados por (URI de
 *      namespace, nombre local); los atributos sin prefijo no tienen
 *      namespace y van primero.
 *   3. Elementos vacíos como <a></a>; sin declaración XML; sin
 *      comentarios; fin de línea normalizado a \n.
 *   4. Escapes: texto (& < > \r) y atributos (& < " \t \n \r).
 *
 * El parser es deliberadamente pequeño: no admite DTD/entidades
 * externas (se rechazan) y sólo las 5 entidades predefinidas y las
 * referencias numéricas. Suficiente para los XML que genera la propia
 * aplicación y para las respuestas SOAP de la DIAN.
 */

export const XML_NS = 'http://www.w3.org/XML/1998/namespace';

export interface XmlAttribute {
  name: string;
  value: string;
}

export interface XmlElement {
  type: 'element';
  name: string;
  prefix: string;
  localName: string;
  attributes: XmlAttribute[];
  children: XmlNode[];
  parent: XmlElement | null;
}

export interface XmlText {
  type: 'text';
  value: string;
}

export interface XmlComment {
  type: 'comment';
  value: string;
}

export interface XmlPI {
  type: 'pi';
  target: string;
  data: string;
}

export type XmlNode = XmlElement | XmlText | XmlComment | XmlPI;

export class XmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XmlParseError';
  }
}

// ------------------------------------------------------------
// PARSER
// ------------------------------------------------------------

const NAME_RE = /^[A-Za-z_:À-￿][-A-Za-z0-9_:.·À-￿]*/;

function decodeEntities(raw: string): string {
  return raw.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);?/g, (match, ent: string) => {
    if (!match.endsWith(';')) {
      throw new XmlParseError(`Referencia de entidad sin ';': ${match}`);
    }
    switch (ent) {
      case 'lt': return '<';
      case 'gt': return '>';
      case 'amp': return '&';
      case 'quot': return '"';
      case 'apos': return '\'';
      default: {
        const code = ent[1] === 'x'
          ? parseInt(ent.slice(2), 16)
          : parseInt(ent.slice(1), 10);
        return String.fromCodePoint(code);
      }
    }
  });
}

function checkNoUnknownEntities(raw: string): void {
  const bad = raw.match(/&(?!(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);)/);
  if (bad) {
    throw new XmlParseError('Entidad XML desconocida o "&" sin escapar.');
  }
}

function splitName(name: string): { prefix: string; localName: string } {
  const idx = name.indexOf(':');
  return idx === -1
    ? { prefix: '', localName: name }
    : { prefix: name.slice(0, idx), localName: name.slice(idx + 1) };
}

/**
 * Parsea un documento XML y devuelve el elemento raíz.
 */
export function parseXml(input: string): XmlElement {
  // Normalización de fin de línea (XML 1.0 §2.11).
  const xml = input.replace(/\r\n?/g, '\n').replace(/^﻿/, '');

  let pos = 0;
  let root: XmlElement | null = null;
  const stack: XmlElement[] = [];

  const current = () => stack[stack.length - 1];

  const pushNode = (node: XmlNode) => {
    const parent = current();
    if (parent) {
      parent.children.push(node);
    } else if (node.type === 'text' && node.value.trim() !== '') {
      throw new XmlParseError('Texto fuera del elemento raíz.');
    }
  };

  while (pos < xml.length) {
    const lt = xml.indexOf('<', pos);

    if (lt === -1) {
      pushNode({ type: 'text', value: decodeText(xml.slice(pos)) });
      break;
    }

    if (lt > pos) {
      pushNode({ type: 'text', value: decodeText(xml.slice(pos, lt)) });
    }

    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      if (end === -1) throw new XmlParseError('Comentario sin cerrar.');
      pushNode({ type: 'comment', value: xml.slice(lt + 4, end) });
      pos = end + 3;
      continue;
    }

    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      if (end === -1) throw new XmlParseError('CDATA sin cerrar.');
      pushNode({ type: 'text', value: xml.slice(lt + 9, end) });
      pos = end + 3;
      continue;
    }

    if (xml.startsWith('<!', lt)) {
      throw new XmlParseError('DTD/DOCTYPE no soportado.');
    }

    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      if (end === -1) throw new XmlParseError('Instrucción de procesamiento sin cerrar.');
      const body = xml.slice(lt + 2, end);
      const m = body.match(/^(\S+)\s*([\s\S]*)$/);
      const target = m ? m[1] : body;
      if (target.toLowerCase() !== 'xml') {
        pushNode({ type: 'pi', target, data: m ? m[2] : '' });
      }
      pos = end + 2;
      continue;
    }

    if (xml.startsWith('</', lt)) {
      const end = xml.indexOf('>', lt + 2);
      if (end === -1) throw new XmlParseError('Etiqueta de cierre sin terminar.');
      const name = xml.slice(lt + 2, end).trim();
      const open = stack.pop();
      if (!open || open.name !== name) {
        throw new XmlParseError(`Etiqueta de cierre inesperada </${name}>.`);
      }
      pos = end + 1;
      continue;
    }

    // Etiqueta de apertura.
    pos = lt + 1;
    const nameMatch = xml.slice(pos).match(NAME_RE);
    if (!nameMatch) throw new XmlParseError('Nombre de elemento inválido.');
    const name = nameMatch[0];
    pos += name.length;

    const attributes: XmlAttribute[] = [];
    let selfClosing = false;

    for (;;) {
      const ws = xml.slice(pos).match(/^\s*/)![0];
      pos += ws.length;

      if (xml.startsWith('/>', pos)) {
        selfClosing = true;
        pos += 2;
        break;
      }

      if (xml[pos] === '>') {
        pos += 1;
        break;
      }

      if (!ws) throw new XmlParseError(`Falta espacio entre atributos en <${name}>.`);

      const attrMatch = xml.slice(pos).match(NAME_RE);
      if (!attrMatch) throw new XmlParseError(`Atributo inválido en <${name}>.`);
      const attrName = attrMatch[0];
      pos += attrName.length;

      const eq = xml.slice(pos).match(/^\s*=\s*/);
      if (!eq) throw new XmlParseError(`Falta "=" en el atributo ${attrName}.`);
      pos += eq[0].length;

      const quote = xml[pos];
      if (quote !== '"' && quote !== '\'') {
        throw new XmlParseError(`Valor sin comillas en el atributo ${attrName}.`);
      }
      const close = xml.indexOf(quote, pos + 1);
      if (close === -1) throw new XmlParseError(`Atributo ${attrName} sin cerrar.`);
      const rawValue = xml.slice(pos + 1, close);
      if (rawValue.includes('<')) throw new XmlParseError(`"<" en el atributo ${attrName}.`);
      checkNoUnknownEntities(rawValue);

      if (attributes.some(a => a.name === attrName)) {
        throw new XmlParseError(`Atributo duplicado ${attrName}.`);
      }

      // Normalización de valores de atributo (XML 1.0 §3.3.3): los
      // blancos literales pasan a espacio ANTES de expandir
      // referencias (un &#xA; sí se conserva como salto de línea).
      attributes.push({
        name: attrName,
        value: decodeEntities(rawValue.replace(/[\t\n]/g, ' ')),
      });
      pos = close + 1;
    }

    const { prefix, localName } = splitName(name);
    const element: XmlElement = {
      type: 'element',
      name,
      prefix,
      localName,
      attributes,
      children: [],
      parent: current() || null,
    };

    if (!current()) {
      if (root) throw new XmlParseError('Más de un elemento raíz.');
      root = element;
    } else {
      current().children.push(element);
    }

    if (!selfClosing) stack.push(element);
  }

  if (stack.length) throw new XmlParseError(`Elemento <${stack[stack.length - 1].name}> sin cerrar.`);
  if (!root) throw new XmlParseError('Documento XML vacío.');

  return root;
}

function decodeText(raw: string): string {
  checkNoUnknownEntities(raw);
  return decodeEntities(raw);
}

// ------------------------------------------------------------
// NAVEGACIÓN
// ------------------------------------------------------------

/** Namespaces en alcance (prefijo → URI; '' = por defecto). */
export function inScopeNamespaces(element: XmlElement): Map<string, string> {
  const chain: XmlElement[] = [];
  for (let el: XmlElement | null = element; el; el = el.parent) chain.unshift(el);

  const map = new Map<string, string>();
  for (const el of chain) {
    for (const attr of el.attributes) {
      if (attr.name === 'xmlns') map.set('', attr.value);
      else if (attr.name.startsWith('xmlns:')) map.set(attr.name.slice(6), attr.value);
    }
  }
  return map;
}

export function namespaceUri(element: XmlElement, prefix: string): string {
  if (prefix === 'xml') return XML_NS;
  return inScopeNamespaces(element).get(prefix) || '';
}

export function elementNamespace(element: XmlElement): string {
  return namespaceUri(element, element.prefix);
}

export function* walk(element: XmlElement): Generator<XmlElement> {
  yield element;
  for (const child of element.children) {
    if (child.type === 'element') yield* walk(child);
  }
}

export function findElements(root: XmlElement, namespace: string, localName: string): XmlElement[] {
  const out: XmlElement[] = [];
  for (const el of walk(root)) {
    if (el.localName === localName && elementNamespace(el) === namespace) out.push(el);
  }
  return out;
}

/** Busca por atributo Id / ID / wsu:Id (referencias URI="#..."). */
export function findById(root: XmlElement, id: string): XmlElement | null {
  for (const el of walk(root)) {
    for (const attr of el.attributes) {
      const local = splitName(attr.name).localName;
      if ((local === 'Id' || local === 'ID' || local === 'id') && attr.value === id) return el;
    }
  }
  return null;
}

export function getAttribute(element: XmlElement, name: string): string | null {
  const attr = element.attributes.find(a => a.name === name);
  return attr ? attr.value : null;
}

export function textContent(node: XmlNode): string {
  if (node.type === 'text') return node.value;
  if (node.type !== 'element') return '';
  return node.children.map(textContent).join('');
}

// ------------------------------------------------------------
// CANONICALIZACIÓN
// ------------------------------------------------------------

function escapeC14nText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#xD;');
}

function escapeC14nAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;')
    .replace(/\n/g, '&#xA;')
    .replace(/\r/g, '&#xD;');
}

function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface C14nOptions {
  /** true = exc-c14n; false (por defecto) = C14N 1.0 inclusivo. */
  exclusive?: boolean;
  /** Sólo exc-c14n: PrefixList de InclusiveNamespaces ('#default' = ''). */
  inclusivePrefixes?: string[];
  /** Elementos a omitir (p. ej. la firma, transformada enveloped). */
  exclude?: (element: XmlElement) => boolean;
}

/**
 * Canonicaliza el subárbol con raíz en `apex` (sin comentarios).
 */
export function canonicalize(apex: XmlElement, options: C14nOptions = {}): string {
  const inclusivePrefixes = new Set(
    (options.inclusivePrefixes || []).map(p => (p === '#default' ? '' : p))
  );

  const out: string[] = [];

  const render = (element: XmlElement, rendered: Map<string, string>) => {
    if (options.exclude && options.exclude(element)) return;

    const scope = inScopeNamespaces(element);
    const nsToRender: [string, string][] = [];

    if (options.exclusive) {
      const utilized = new Set<string>([element.prefix]);
      for (const attr of element.attributes) {
        if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) continue;
        const { prefix } = splitName(attr.name);
        if (prefix && prefix !== 'xml') utilized.add(prefix);
      }
      for (const prefix of inclusivePrefixes) {
        if (scope.has(prefix)) utilized.add(prefix);
      }
      for (const prefix of utilized) {
        const uri = scope.get(prefix) ?? '';
        const prev = rendered.get(prefix) ?? '';
        if (prefix === '' ? uri !== prev : (scope.has(prefix) && rendered.get(prefix) !== uri)) {
          nsToRender.push([prefix, uri]);
        }
      }
    } else {
      for (const [prefix, uri] of scope) {
        if (prefix === '') {
          if (uri !== (rendered.get('') ?? '')) nsToRender.push(['', uri]);
        } else if (rendered.get(prefix) !== uri) {
          nsToRender.push([prefix, uri]);
        }
      }
      if (!scope.has('') && (rendered.get('') ?? '') !== '') nsToRender.push(['', '']);
    }

    nsToRender.sort((a, b) => compareCodePoints(a[0], b[0]));

    const nextRendered = new Map(rendered);
    for (const [prefix, uri] of nsToRender) nextRendered.set(prefix, uri);

    const attrs = element.attributes
      .filter(a => a.name !== 'xmlns' && !a.name.startsWith('xmlns:'))
      .map(a => {
        const { prefix, localName } = splitName(a.name);
        const ns = prefix ? (prefix === 'xml' ? XML_NS : scope.get(prefix) || '') : '';
        return { ...a, ns, localName };
      })
      .sort((a, b) => compareCodePoints(a.ns, b.ns) || compareCodePoints(a.localName, b.localName));

    out.push('<', element.name);
    for (const [prefix, uri] of nsToRender) {
      out.push(' ', prefix ? `xmlns:${prefix}` : 'xmlns', '="', escapeC14nAttr(uri), '"');
    }
    for (const attr of attrs) {
      out.push(' ', attr.name, '="', escapeC14nAttr(attr.value), '"');
    }
    out.push('>');

    for (const child of element.children) {
      if (child.type === 'element') render(child, nextRendered);
      else if (child.type === 'text') out.push(escapeC14nText(child.value));
      else if (child.type === 'pi') out.push(`<?${child.target}${child.data ? ' ' + child.data : ''}?>`);
      // Comentarios: se omiten (variante "sin comentarios").
    }

    out.push('</', element.name, '>');
  };

  render(apex, new Map());
  return out.join('');
}
