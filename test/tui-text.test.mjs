import test from 'node:test';
import assert from 'node:assert/strict';
import {stripVTControlCharacters} from 'node:util';
import {displayWidth,takeCells,tailCells,cellRows} from '../src/tui/text.mjs';
import {renderLine} from '../src/tui/screen.mjs';
import {editText,editorRows} from '../src/tui/editor.mjs';
import {pad,padl,cut,wrap,shortPath} from '../src/tui/view.mjs';

test('terminal text measures Cyrillic, wide glyphs, combining marks and whole emoji clusters',()=>{
 for(const [text,width] of [['Задача',6],['界',2],['e\u0301',1],['👩🏽‍💻',2],['🇵🇹',2],['A界B',4]])assert.equal(displayWidth(text),width,text);
 assert.equal(takeCells('👩🏽‍💻x',1),'');assert.equal(takeCells('👩🏽‍💻x',2),'👩🏽‍💻');
 assert.equal(takeCells('e\u0301X',1),'e\u0301');assert.equal(tailCells('x👩🏽‍💻',2),'👩🏽‍💻');
 for(const text of ['A界B','e\u0301X','A👩🏽‍💻B']){
  const rendered=stripVTControlCharacters(renderLine([{t:text}],4,{support:'none'}));
  assert.equal(rendered,text+' '.repeat(4-displayWidth(text)));assert.equal(displayWidth(rendered),4);
 }
 assert.equal(stripVTControlCharacters(renderLine([{t:'x👩🏽‍💻'}],2,{support:'none'})),'x ');
});

test('columns and word wrapping never split a grapheme or overflow the cell budget',()=>{
 assert.equal(pad('界',3),'界 ');assert.equal(padl('界',3),' 界');assert.equal(cut('👩🏽‍💻abc',3),'👩🏽‍💻…');
 for(const row of wrap('检查 界界界界界界 e\u0301 👩🏽‍💻',8))assert.ok(displayWidth(row)<=8,row);
 assert.ok(displayWidth(shortPath('/检查/👩🏽‍💻/很长的文件名称.ts',12))<=12);
 const rows=cellRows('  界界 e\u0301 👩🏽‍💻',5);assert.equal(rows.join(''),'  界界 e\u0301 👩🏽‍💻');
 assert.ok(rows.every(row=>displayWidth(row)<=5));
 assert.deepEqual(cellRows('界',1),['�'],'an impossible one-cell cluster is visibly replaced, never split');
});

test('the editor wraps by cells while retaining UTF-16 edit offsets and visual vertical movement',()=>{
 assert.deepEqual(editorRows('界界X',3,4),{rows:['界界','X'],caret:{row:1,col:1}});
 assert.deepEqual(editorRows('e\u0301X',3,2),{rows:['e\u0301X',''],caret:{row:1,col:0}});
 assert.deepEqual(editorRows('a\tb',3,8),{rows:['a    b'],caret:{row:0,col:6}});
 assert.equal(editText('界界\nabcd',2,{name:'down'}).cursor,7);
 assert.equal(editText('界界\nabcd',7,{name:'up'}).cursor,2);
});

test('the final terminal writer cannot pass display data through as OSC or C1 control instructions',()=>{
 const text='A\x1b]52;c;YXVkaXQ=\x07B\x9b2JC';
 const rendered=renderLine([{t:text}],12,{support:'none'});
 assert.equal(rendered,'ABC         ');
 assert.doesNotMatch(rendered,/[\x00-\x1f\x7f-\x9f]/);
});
