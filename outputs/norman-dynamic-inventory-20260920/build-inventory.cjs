/* Read-only pinned-source inventory. No quote/customer data is accessed. */
const fs=require('fs'),path=require('path'),cp=require('child_process'),ts=require('typescript'),crypto=require('crypto');
const out=__dirname,repo=process.argv[2]||'/Users/michaelshepard/Documents/805-norman-release-local-20260918';
const rev=process.argv[3]||'ce375e05bc8532833ab1a1be7b784b27820c43ac';
const exportFile=process.argv[4]||'/Users/michaelshepard/Documents/805-norman-complete-20260918/outputs/norman-completion/current-catalog.json';
const data=JSON.parse(fs.readFileSync(exportFile)),manifest=JSON.parse(fs.readFileSync(path.join(out,'destination-review.json')));
const files=cp.execFileSync('git',['ls-tree','-r','--name-only',rev],{cwd:repo,encoding:'utf8'}).trim().split('\n');
const design='src/mts-quote/components/crm/quote-builder/DesignCard.tsx';
const wanted=files.filter(f=>f===design||/^src\/components\/crm\/(Norman|SanClemente).*\.tsx$/.test(f)||/^src\/lib\/quote\/norman-.*\.ts$/.test(f)&&!f.includes('.test.')&&!f.includes('generated')||/^src\/lib\/quote-v2\/(norman-|honeycomb-|roller-).*\.ts$/.test(f)&&!f.includes('.test.')||f==='src/lib/quote-v2/rules.ts');
const sources=[],controls=[],typed=[],validations=[],reads=[];
const sourceFiles=new Map();
function family(f){return manifest.filter(m=>m.module_patterns.some(p=>(p==='rules.ts'?f.endsWith('/rules.ts'):f.includes(p)))).map(m=>m.product_id)}
const cases={'SmartFold Shades':['smartfold'],'Palladian Shelf':['palladian_shelf'],'Roller Shades':['roller'],'Roman Shades':['roman'],'Honeycomb Shades':['honeycomb','vertical_honeycomb'],'Sheer Shades':['perfectsheer'],'Faux Wood Blinds':['faux_wood','smartprivacy_faux'],'Mini Blinds':['citylights_aluminum'],'Wood Blinds':['wood_blinds'],'Vertical Blinds':['synchrony_vertical'],'Smart Drapes':['smartdrape']};
const csv=(name,rows)=>{const keys=[...new Set(rows.flatMap(Object.keys))];const q=v=>'"'+String(v??'').replaceAll('"','""')+'"';fs.writeFileSync(path.join(out,name),[keys.map(q).join(','),...rows.map(r=>keys.map(k=>q(r[k])).join(','))].join('\n')+'\n')};
function clean(s){return s.replace(/\s+/g,' ').trim()}
for(const f of wanted){
 const content=cp.execFileSync('git',['show',`${rev}:${f}`],{cwd:repo,encoding:'utf8'});sourceFiles.set(f,content);
 const sf=ts.createSourceFile(f,content,ts.ScriptTarget.Latest,true,f.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const text=n=>n?clean(n.getText(sf)):'';const line=n=>sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
 const moduleProducts=family(f);
 const refs=content.split('\n').map((s,i)=>({line:i+1,text:s.trim()})).filter(r=>/sourceProvenance|sourceId:|sourcePages?:|SOURCE\s*=|Guide.*page|guide.*page/i.test(r.text));
 sources.push({file:f,sha256:crypto.createHash('sha256').update(content).digest('hex'),products:moduleProducts.join('|'),source_references:refs.map(r=>`${r.line}: ${r.text}`).join('\n')});
 function ancestors(n){const a=[];for(let p=n.parent;p;p=p.parent)a.push(p);return a}
 function context(n){const a=ancestors(n),cl=a.find(ts.isCaseClause),func=a.find(x=>ts.isFunctionDeclaration(x)||ts.isMethodDeclaration(x));const guards=a.filter(x=>ts.isIfStatement(x)||ts.isConditionalExpression(x)).map(x=>{const negative=ts.isIfStatement(x)?x.elseStatement&&n.pos>=x.elseStatement.pos&&n.end<=x.elseStatement.end:n.pos>=x.whenFalse.pos&&n.end<=x.whenFalse.end;return negative?'!('+text(x.expression||x.condition)+')':text(x.expression||x.condition)}).join(' && ');return{products:cl&&cases[cl.expression.text]||moduleProducts,case_name:cl?text(cl.expression):'',enclosing_function:func?.name?text(func.name):'',guards}}
 function pushControl(n,field,label,type,bounds,kind){const x=context(n);let ps=x.products;if(f===design&&!ps.length){if(line(n)>=3600&&line(n)<=4350)ps=['norman_shutters'];else ps=['shared_unscoped']}
  if(/lotus|sundance|onyx|polar/i.test(field)||/lotusFauxWood|supplier === ["']Onyx/.test(x.guards)||/ONYX_|LOTUS_|SUNDANCE_|POLAR_/.test(bounds)||/Onyx|Lotus|Sundance|Polar/.test(x.enclosing_function))return;
  if(field.startsWith('smartprivacy_'))ps=['smartprivacy_faux'];if(field.startsWith('ultimate_'))ps=['faux_wood'];
  for(const id of ps){const key=field.replace(/^json:/,'');const known=new Set((data.optionFields?.[id]||[]).map(r=>r.id));controls.push({product_id:id,field:key,label,control_type:type,bounds_or_choices:bounds,export_status:known.has(key)?'field already exported; conditional control detail omitted':'not an exact exported detail-field ID',saved_record:field.startsWith('json:')?'options_json.'+key:'direct design field / callback; see source',file:f,line:line(n),case_name:x.case_name,enclosing_function:x.enclosing_function,applicability_expression:x.guards,extraction_kind:kind});}}
 function walk(n){
  if(ts.isObjectLiteralExpression(n)){const p=Object.fromEntries(n.properties.filter(ts.isPropertyAssignment).map(p=>[p.name.getText(sf).replace(/['"]/g,''),p.initializer]));if(p.field&&p.label)pushControl(n,ts.isStringLiteral(p.field)?p.field.text:text(p.field),ts.isStringLiteral(p.label)?p.label.text:text(p.label),text(p.type),['min','max','step','options','disabled'].filter(k=>p[k]).map(k=>`${k}=${text(p[k])}`).join('; '),'grid object');
   if(p.explanation||p.ruleId){validations.push({products:moduleProducts.join('|'),file:f,line:line(n),kind:'validation object',rule_id:text(p.ruleId),source:text(p.source),message:text(p.explanation),expression:text(n),...{enclosing_function:context(n).enclosing_function}})}
  }
  if(ts.isCallExpression(n)){
   const fn=text(n.expression),args=n.arguments, x=context(n);
   if(/^(styleChoice|spSelect|spNumber|psChoice|psDimension|psCount|sdChoice|sdCount|choice|count|number|select)$/.test(fn)&&args.length>=2&&(ts.isStringLiteral(args[0])||ts.isTemplateExpression(args[0]))&&(ts.isStringLiteral(args[1])||ts.isTemplateExpression(args[1])))pushControl(n,ts.isStringLiteral(args[0])?'json:'+args[0].text:text(args[0]),ts.isStringLiteral(args[1])?args[1].text:text(args[1]),fn,args.slice(2).map(text).join('; '),'control helper');
   if(!f.endsWith('tsx')&&/^(add|issue|fail|block|warn|error|addIssue|reject|validationIssue|pushIssue)$/.test(fn))validations.push({products:moduleProducts.join('|'),file:f,line:line(n),kind:'validation helper invocation',rule_id:text(args[0]),source:args.length>2?text(args[1]):'enclosing module source helper',message:text(args.at(-1)),expression:text(n),enclosing_function:x.enclosing_function});
  }
  if(ts.isPropertySignature(n)){const x=context(n),parent=ancestors(n).find(x=>ts.isTypeAliasDeclaration(x)||ts.isInterfaceDeclaration(x));typed.push({products:moduleProducts.join('|'),file:f,line:line(n),record_type:parent?.name?text(parent.name):'',property:text(n.name),value_type:text(n.type),optional:!!n.questionToken});}
  if(!f.endsWith('tsx')&&ts.isPropertyAccessExpression(n)&&/^(c|configuration|context\.configuration|s\.configuration|selection\.configuration)$/.test(text(n.expression)))reads.push({products:moduleProducts.join('|'),file:f,line:line(n),saved_key:text(n.name),read_expression:text(n),enclosing_function:context(n).enclosing_function});
  if(!f.endsWith('tsx')&&ts.isElementAccessExpression(n)&&/^(c|configuration|context\.configuration|s\.configuration|selection\.configuration)$/.test(text(n.expression)))reads.push({products:moduleProducts.join('|'),file:f,line:line(n),saved_key:ts.isStringLiteral(n.argumentExpression)?n.argumentExpression.text:text(n.argumentExpression),read_expression:text(n),enclosing_function:context(n).enclosing_function});
  // Dedicated React components have callback-bound fields instead of GridOption rows. Preserve the exact rendered input expression.
  if(f!==design&&f.endsWith('tsx')&&(ts.isJsxSelfClosingElement(n)||ts.isJsxOpeningElement(n))&&/^(input|select|textarea)$/.test(text(n.tagName))){const x=context(n);controls.push({product_id:x.products.join('|'),field:'callback-bound: see rendered expression',label:'see aria-label / enclosing label',control_type:text(n.tagName),bounds_or_choices:text(n),export_status:'typed/dedicated control; resolve with typed-records.csv',saved_record:'complete typed options_json record or dedicated callback',file:f,line:line(n),case_name:'',enclosing_function:x.enclosing_function,applicability_expression:x.guards,extraction_kind:'dedicated JSX input'});}
  ts.forEachChild(n,walk)
 }walk(sf);
}
csv('dynamic-controls.csv',controls);csv('typed-records.csv',typed);csv('server-validations.csv',validations);csv('server-configuration-reads.csv',reads);csv('module-source-index.csv',sources);
csv('destination-review.csv',manifest.map(m=>({...m,module_patterns:m.module_patterns.join('|')})));
fs.writeFileSync(path.join(out,'snapshot.json'),JSON.stringify({revision:rev,export_sha256:crypto.createHash('sha256').update(fs.readFileSync(exportFile)).digest('hex'),export_product_count:data.products.length,review_product_count:manifest.length,scanned_files:wanted.length,counts:{controls:controls.length,typed_fields:typed.length,validation_occurrences:validations.length,configuration_reads:reads.length},method:'Static occurrences, not exhaustive valid combinations. Exact runtime guards and module source references retained. A repeated field at separate callsites is intentionally a separate occurrence.'},null,2)+'\n');
console.log(JSON.stringify({files:wanted.length,controls:controls.length,typed:typed.length,validations:validations.length,reads:reads.length}));
