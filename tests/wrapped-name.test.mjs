import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {readFile} from "node:fs/promises";
import {releaseCatalog,loadArtwork,selectArtwork} from "../server/name-artwork.mjs";
import {composePlacedArtwork,intersects} from "../server/name-placement.mjs";
const detection={uncertain:false,head:{x:438,y:134,width:382,height:535},star:{x:237,y:350,width:174,height:187}};
test("failed single-row placement uses a reviewed two-row asset on the same base",async()=>{
 const catalog=await releaseCatalog(),{entry,bytes}=await loadArtwork(catalog,"יהודה שמחוני-אסף");
 assert.ok(entry.wrapped);assert.equal(entry.wrapped.ocr.text,entry.name);
 const wrapped=await readFile("public/name-artwork/"+entry.wrapped.file);
 const base=await sharp({create:{width:1080,height:1080,channels:3,background:"#d9cbb3"}}).png().toBuffer();
 await assert.rejects(composePlacedArtwork(base,bytes,detection,2));
 const result=await composePlacedArtwork(base,bytes,detection,2,wrapped),p=result.placement;
 assert.equal(p.lines,2);assert.ok(p.width>=280&&p.height>=180);
 assert.equal(intersects({left:p.left,top:p.top,right:p.left+p.width,bottom:p.top+p.height},p.head),false);
 assert.equal(catalog.entries.length,347);
});
test("nested, renamed or unreviewed wrap variants cannot enter the manifest",async()=>{
 const entry=(await releaseCatalog()).entries.find(e=>e.wrapped);
 for(const wrapped of [{...entry.wrapped,name:"שם אחר"},{...entry.wrapped,visualChecked:false},{...entry.wrapped,wrapped:entry.wrapped},{...entry.wrapped,sha256:entry.sha256}])assert.throws(()=>selectArtwork({entries:[{...entry,wrapped}]},entry.name));
});
