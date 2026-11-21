import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-html';
import { parseDocument } from 'htmlparser2';
import { innerText, getOuterHTML } from 'domutils';

const dir = 'content/wordpress';
const records = new Map(JSON.parse(fs.readFileSync(0, 'utf8')).map(record => [record.slug, record]));
const paths = JSON.parse(fs.readFileSync(path.join(dir, 'routes.json'), 'utf8'));
const stories = { '/': '805-shutters-window-treatments', '/bay-window-project/': 'bay-window-project', '/window-guide/': 'window-guide' };
const result = {};
function text(html) {
  return innerText(parseDocument(html).children).trim();
}
function photo(src) {
  if (src?.startsWith('/') && !src.startsWith('//')) return src;
  const url = new URL(src);
  if (url.hostname === '127.0.0.1') {
    const filename = path.basename(url.pathname);
    const relative = '/images/portfolio-enhanced/' + filename;
    if (!fs.existsSync('public' + relative)) throw new Error('Add the uploaded photo to the release: ' + filename);
    return relative;
  }
  if (url.protocol !== 'https:') throw new Error('Image needs a public HTTPS address');
  return url.href;
}
for (const [route, slug] of Object.entries({ ...paths, ...stories })) {
  const record = records.get(slug);
  if (!record || record.content.protected) throw new Error('Missing public content for ' + route);
  if (!text(record.title.rendered)) throw new Error('Missing page title for ' + route);
  const clean = sanitize(record.content.rendered, {
    allowedTags: ['div','section','article','figure','figcaption','img','p','h1','h2','h3','h4','ul','ol','li','blockquote','a','strong','em','br','hr','b','i','table','tbody','tr','td','th','thead'],
    allowedAttributes: { '*': ['class'], a: ['href'], img: ['alt','src','width','height'] },
    allowedClasses: { '*': ['wp-block-*','hero','hero-inner','detail-hero','collection','works','work','caption','guide','copy-item','contact','contact-inner','explore','kicker','intro','story-link','wp-element-button','mast','foot','size-full'] },
    allowedSchemes: ['https','tel','mailto'], allowProtocolRelative: false,
    transformTags: { img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, src: photo(attribs.src) } }) },
    exclusiveFilter: frame => ['mast','foot'].some(c => (frame.attribs.class || '').split(' ').includes(c))
  });
  const blocks = parseDocument(clean).children.filter(node => node.type === 'tag');
  const lead = !stories[route] && blocks[0]?.name === 'p' ? blocks.shift() : undefined;
  result[route] = {
    title: text(record.title.rendered),
    description: text(record.excerpt.rendered),
    intro: lead ? innerText(lead).trim() : '',
    html: blocks.map(block => getOuterHTML(block)).join('\n')
  };
}
const file = path.join(dir, 'published.json');
fs.writeFileSync(file + '.tmp', JSON.stringify(result, null, 2) + '\n');
fs.renameSync(file + '.tmp', file);
console.log('Exported ' + Object.keys(result).length + ' published pages');
